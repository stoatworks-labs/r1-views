// The web engine against the Python scripts: on the same project, the Strips
// page with the Speaker card and Section header must write what tap_view.py writes,
// and the Faders page with its extra options off what fader_view.py writes,
// linked pairs (new groups and all) or --no-link.  Both files are compared as
// SQL dumps, every table, every row.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultSections, readProject, section } from '../src/engine/project.ts'
import { stripsPage } from '../src/engine/pages/strips.ts'
import { fadersPage, fadersDefaults } from '../src/engine/pages/faders.ts'
import { writePages } from '../src/engine/write.ts'
import type { Page } from '../src/engine/page.ts'
import { fixture, sql } from './fixture.ts'

const ROOT = new URL('../../', import.meta.url).pathname
const dir = mkdtempSync(join(tmpdir(), 'r1-parity-'))
// Python's own sqlite3 does the dumping and the querying, so the tests need
// nothing the CI runner might lack: python3 is already needed for the scripts.
const PY_SQL = 'import sqlite3, sys\n' +
  'db = sqlite3.connect(sys.argv[1])\n' +
  'rows = db.iterdump() if sys.argv[2] == ".dump" else ("|".join(map(str, r)) for r in db.execute(sys.argv[2]))\n' +
  'print("\\n".join(rows))'
const sqlite = (f: string, sql: string) =>
  execFileSync('python3', ['-I', '-c', PY_SQL, f, sql], { encoding: 'utf8', maxBuffer: 64 << 20 })
const dump = (f: string) => sqlite(f, '.dump')

async function both(script: string, build: (p: ReturnType<typeof readProject>) => Page, tag: string, args: string[] = [],
  opts: Parameters<typeof fixture>[0] = {}) {
  const SQL = await sql()
  const input = await fixture(opts)
  const src = join(dir, `${tag}-in.dbpr`)
  writeFileSync(src, input)
  const py = join(dir, `${tag}-py.dbpr`)
  execFileSync('python3', ['-I', join(ROOT, 'scripts', script), src, py, ...args], { encoding: 'utf8' })

  const db = new SQL.Database(input)
  const page = build(readProject(db))
  db.close()
  const out = writePages(SQL, input, [page])
  const ts = join(dir, `${tag}-ts.dbpr`)
  writeFileSync(ts, out.bytes)
  expect(out.integrity).toBe('ok')
  return { py, ts, src, input }
}

describe('parity with the Python scripts', () => {
  // Both delay limits: a D6 stops at 340 ms (and a group holding one at
  // ±339.5), a D20 goes to 10 s (±9999.5).  And a channel with two cabinets,
  // as some real rigs have, still gets each ArrayProcessing slot's lamp once.
  for (const [tag, opts, span] of [['taps', {}, 339.5], ['taps-no-d6', { noD6: true }, 9999.5],
    ['taps-two-cabinets', { twoCabinets: true }, 339.5]] as const) {
    it(`Strips page with the Speaker card = tap_view.py (${tag})`, async () => {
      const { py, ts, src, input } = await both('tap_view.py', (p) =>
        stripsPage(p, defaultSections(p).map(section)), tag, [], opts)
      const limits = sqlite(py, "select distinct LimitMax from Controls where TargetProperty='ChStatus_MsDelay' and TargetType=0").trim()
      expect(Number(limits)).toBe(span)
      expect(dump(ts)).toBe(dump(py))
      expect(readFileSync(src)).toEqual(Buffer.from(input)) // the input is untouched
    })
  }

  it('Faders page, linked pairs = fader_view.py', async () => {
    const { py, ts } = await both('fader_view.py', (p) => fadersPage(p, defaultSections(p).map(section)), 'faders')
    expect(dump(ts)).toMatch(/INSERT INTO "Groups" VALUES\(\d+,'Faders links'/)   // the pairs really are linked
    expect(dump(ts)).toBe(dump(py))
  })

  it('Faders page, unlinked = fader_view.py --no-link', async () => {
    const { py, ts } = await both('fader_view.py', (p) =>
      fadersPage(p, defaultSections(p).map(section), { ...fadersDefaults, link: false }), 'faders-nolink', ['--no-link'])
    expect(dump(ts)).not.toMatch(/Faders links/)
    expect(dump(ts)).toBe(dump(py))
  })
})
