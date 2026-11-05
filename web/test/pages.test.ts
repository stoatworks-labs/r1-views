// Every page, on the synthetic project and on any real project found locally,
// must pass both checkers: src/engine/check.ts and scripts/check.py.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { SqlJsStatic } from 'sql.js'
import { check } from '../src/engine/check.ts'
import { defaultSections, folderTree, readProject, section, type Project } from '../src/engine/project.ts'
import { eqPage } from '../src/engine/pages/eq.ts'
import { fadersPage, fadersDefaults } from '../src/engine/pages/faders.ts'
import { floorplanPage, type FloorplanDesign } from '../src/engine/pages/floorplan.ts'
import { masterPage } from '../src/engine/pages/master.ts'
import { stripsPage, timingDefaults } from '../src/engine/pages/strips.ts'
import { BUILTIN_STRIPS, COMPACT_CARD, GROUP_TILE, WALK_CARD, stripProblems } from '../src/engine/strips.ts'
import { writePages } from '../src/engine/write.ts'
import type { Page } from '../src/engine/page.ts'
import { GUI } from './catalogue.test.ts'
import { PNG_1x1, fixture, sql } from './fixture.ts'

const ROOT = new URL('../../', import.meta.url).pathname
const dir = mkdtempSync(join(tmpdir(), 'r1-pages-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function allPages(p: Project): Page[] {
  const secs = defaultSections(p).map(section)
  const strips = new Map(BUILTIN_STRIPS.map((s) => [s.id, s]))
  const chans = [...p.channels.values()]
  const fp: FloorplanDesign = {
    name: 'Floorplan', w: 1400, h: 800,
    image: { day: PNG_1x1, night: PNG_1x1, x: 0, y: 28, w: 1400, h: 772, pw: 1, ph: 1, name: 'room.png' },
    tiles: [
      ...chans.slice(0, 6).map((c, i) => ({ id: `c${i}`, stripId: COMPACT_CARD.id, target: { kind: 'channel' as const, dev: c.dev, ch: c.ch }, x: 20 + i * 160, y: 60 })),
      ...chans.slice(6, 9).map((c, i) => ({ id: `w${i}`, stripId: WALK_CARD.id, target: { kind: 'channel' as const, dev: c.dev, ch: c.ch }, x: 20 + i * 250, y: 300 })),
      ...secs.slice(0, 2).map((s, i) => ({ id: `g${i}`, stripId: GROUP_TILE.id, target: { kind: 'group' as const, id: s.id }, x: 20 + i * 220, y: 600 })),
    ],
  }
  return [
    masterPage(p, secs),
    stripsPage(p, secs, timingDefaults),
    eqPage(p, secs),
    fadersPage(p, secs),
    fadersPage(p, secs, { ...fadersDefaults, name: 'Faders+', sectionFaders: true, mutes: true, inMeters: true }),
    fadersPage(p, secs, { ...fadersDefaults, name: 'Faders unlinked', link: false, sectionFaders: true, mutes: true, inMeters: true }),
    stripsPage(p, secs),
    stripsPage(p, folderTree(p).slice(1).map(section), { ...timingDefaults, name: 'Every group', channelStrip: COMPACT_CARD, columns: 4, gap: 12, masterStrip: null }),
    floorplanPage(p, fp, strips),
  ]
}

async function build(SQL: SqlJsStatic, input: Uint8Array, tag: string) {
  const db = new SQL.Database(input)
  const p = readProject(db)
  db.close()
  const pages = allPages(p)
  const out = writePages(SQL, input, pages)
  const src = join(dir, `${tag}-in.dbpr`), dst = join(dir, `${tag}-out.dbpr`)
  writeFileSync(src, input)
  writeFileSync(dst, out.bytes)
  return { out, src, dst, pages }
}

function pyCheck(dst: string, src: string): string {
  try {
    return execFileSync('python3', ['-I', join(ROOT, 'scripts', 'check.py'), dst, src], { encoding: 'utf8' })
  } catch (e) {
    throw new Error(String((e as { stdout?: string }).stdout ?? e))
  }
}

describe('every page passes both checks', () => {
  for (const [tag, opts] of [['plain', {}], ['two-cabinets', { twoCabinets: true }], ['no-d6', { noD6: true }]] as const) {
    it(`synthetic project (${tag})`, async () => {
      const SQL = await sql()
      const input = await fixture(opts)
      const { out, src, dst, pages } = await build(SQL, input, tag)
      expect(out.integrity).toBe('ok')
      const r = check(SQL, out.bytes, input)
      expect(r.problems).toEqual([])
      expect(r.views.map((v) => v.name)).toEqual(pages.map((p) => p.name))
      if (existsSync(GUI)) expect(pyCheck(dst, src)).toMatch(/\nok\n$/)
    })
  }

  it('a group relative delay follows the amps behind it', async () => {
    const SQL = await sql()
    for (const [opts, span] of [[{}, 339.5], [{ noD6: true }, 9999.5]] as const) {
      const db = new SQL.Database(await fixture(opts))
      const p = readProject(db)
      db.close()
      const page = stripsPage(p, defaultSections(p).map(section))
      const rel = page.ctls.filter((c) => c.flags === 14 && c.tp === 'ChStatus_MsDelay')
      // Tap 1 and Tap 10 hold a D6 in the plain fixture; Tap 2 too (Fill R)
      expect(rel.map((c) => c.mx)).toEqual([span, span, span])
    }
  })

  it('a channel with two cabinets gets each AP slot once', async () => {
    const SQL = await sql()
    const db = new SQL.Database(await fixture({ twoCabinets: true }))
    const p = readProject(db)
    db.close()
    expect(p.channels.get('3/3')!.ap.map((a) => a.slot)).toEqual([1, 2])
  })

  it('the built-in strips are tidy', () => {
    for (const s of BUILTIN_STRIPS) expect([s.id, stripProblems(s)]).toEqual([s.id, []])
  })

  it('a group CUT is left off when its channels drive different speakers', async () => {
    const SQL = await sql()
    const db = new SQL.Database(await fixture())
    const p = readProject(db)
    db.close()
    const page = eqPage(p, defaultSections(p).map(section))
    const groupCut = page.ctls.filter((c) => c.tp === 'Config_Filter1' && c.tt === 0)
    expect(groupCut).toEqual([])   // every Tap mixes tops and subs
    expect(page.notes.some((n) => n.includes('different loudspeakers'))).toBe(true)
  })

  it('linked pairs: groups beside Master, planted faults caught', async () => {
    const SQL = await sql()
    const input = await fixture()
    const db = new SQL.Database(input)
    const p = readProject(db)
    db.close()
    const page = fadersPage(p, defaultSections(p).map(section))
    expect(page.groups[0]).toMatchObject({ name: 'Faders links', parent: 'root' })
    expect(page.groups.slice(1).every((g) => g.parent === 0 && g.members.length === 2)).toBe(true)
    const out = writePages(SQL, input, [page])
    expect(check(SQL, out.bytes, input).problems).toEqual([])

    const planted = (sqlText: string) => {
      const d = new SQL.Database(out.bytes)
      d.run(sqlText)
      const bytes = d.export()
      d.close()
      return check(SQL, bytes, input).problems.join('\n')
    }
    const master = p.master.id
    expect(planted(`update Groups set ParentId=${master} where Name='Faders links'`)).toMatch(/added under Master/)
    expect(planted("update Groups set TargetChannel=99 where GroupId=(select max(GroupId) from Groups)")).toMatch(/no amp channel/)
    expect(planted("update Groups set ParentId=9999 where Name='Faders links'")).toMatch(/parent 9999 does not exist/)
    expect(planted(`update Groups set Name='moved' where GroupId=${master}`)).toMatch(/Groups: 1 rows added or changed/)

    // a second Faders page with the same name would reuse the folder name: refused
    const again = new SQL.Database(out.bytes)
    expect(() => writePages(SQL, again.export(), [{ ...page, name: 'Faders 2' }])).toThrow(/group called "Faders links"/)
    again.close()
  })
})

// Real projects, if you have any: R1_REAL_PROJECTS=/path/a.dbpr:/path/b.dbpr.
// They never go in git (client venues, a password hash) and are only read.
const REAL = (process.env.R1_REAL_PROJECTS ?? '').split(':').filter(Boolean)
describe.skipIf(!REAL.some(existsSync))('real projects', () => {
  REAL.filter(existsSync).forEach((f, i) => {
    it(`real project ${i + 1}`, async () => {
      const SQL = await sql()
      const input = new Uint8Array(readFileSync(f))
      const { out, src, dst } = await build(SQL, input, 'real')
      const r = check(SQL, out.bytes, input)
      expect(r.problems).toEqual([])
      if (existsSync(GUI)) expect(pyCheck(dst, src)).toMatch(/\nok\n$/)
      expect(new Uint8Array(readFileSync(f))).toEqual(input)
    })
  })
})
