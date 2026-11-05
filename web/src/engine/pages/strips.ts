// The Strips page: one frame per section, the group strip across its top and
// the channel strip once per channel, in Left and Right columns (as the
// Taps view of scripts/tap_view.py) or in a number of columns in channel order.
// With the Speaker card and Section header it writes what tap_view.py writes.
import { PageBuilder, type Page } from '../page.ts'
import { sides, type Member, type Project, type Section } from '../project.ts'
import { membersOf } from '../project.ts'
import {
  drawStrip, stripHeight, SPEAKER_CARD, SECTION_HEADER, MASTER_ROW, TIMING_HEADER, TIMING_ROW, type Strip,
} from '../strips.ts'

const M = 16
const PAD = 12
const TITLE = 36

export interface StripsOptions {
  name: string
  channelStrip: Strip
  /** Across the top of each section, for the whole group; null for none. */
  groupStrip: Strip | null
  /** 'LR' for Left and Right columns, or a column count. */
  columns: 'LR' | number
  gap: number
  /** A frame at the top for the Master group; null for none. */
  masterStrip?: Strip | null
}

export const stripsDefaults: StripsOptions = {
  name: 'Taps', channelStrip: SPEAKER_CARD, groupStrip: SECTION_HEADER, columns: 'LR', gap: 12,
}

/** Time alignment: a row per channel, delay and the generator, Master on top. */
export const timingDefaults: StripsOptions = {
  name: 'Timing', channelStrip: TIMING_ROW, groupStrip: TIMING_HEADER, columns: 1, gap: 2, masterStrip: MASTER_ROW,
}

export function stripsPage(p: Project, sections: Section[], o: StripsOptions = stripsDefaults): Page {
  const b = new PageBuilder(o.name)
  const cs = o.channelStrip
  const cardW = cs.w
  const cardH = stripHeight(cs, p)
  const GAP = o.gap
  const nCols = o.columns === 'LR' ? 2 : Math.max(1, o.columns)
  const headH = o.groupStrip ? o.groupStrip.h : TITLE
  const colsW = nCols * cardW + (nCols - 1) * 12
  const tapW = PAD + Math.max(colsW, o.groupStrip ? o.groupStrip.w - PAD : 0) + PAD

  let y = M
  if (o.masterStrip) {
    const h = o.masterStrip.h + PAD
    const j = b.join()
    b.frame(M, y, tapW, h, 'Master', j, 14)
    drawStrip(b, o.masterStrip, M + PAD, y, { p, members: membersOf(p.master), groupId: p.master.id, name: 'Master' }, j)
    y += h + 12
  }
  for (const s of sections) {
    const cols: { m: Member; side?: 'L' | 'R' }[][] = []
    if (o.columns === 'LR') {
      const sd = sides(s)
      cols.push(sd.L.map((m) => ({ m, side: 'L' as const })), sd.R.map((m) => ({ m, side: 'R' as const })))
    } else {
      for (let c = 0; c < nCols; c++) cols.push([])
      s.members.forEach((m, i) => cols[i % nCols].push({ m, side: s.side.get(`${m.dev}/${m.ch}`) }))
    }
    const rows = Math.max(...cols.map((c) => c.length), 1)
    const tapH = headH + rows * cardH + (rows - 1) * GAP + PAD
    const joined = b.join()
    b.frame(M, y, tapW, tapH, s.name, joined, 14)
    if (o.groupStrip) {
      drawStrip(b, o.groupStrip, M + PAD, y, { p, members: s.members, groupId: s.id, name: s.name }, joined)
    }
    cols.forEach((col, ci) => {
      const cx = M + PAD + ci * (cardW + 12)
      col.forEach(({ m, side }, r) => {
        const cy = y + headH + r * (cardH + GAP)
        drawStrip(b, cs, cx, cy, { p, members: [m], name: m.name, side }, cs.frame ? undefined : joined)
        const word = side === 'L' ? 'Left' : side === 'R' ? 'Right' : ''
        b.page.notes.push(`${s.name} · ${word ? word + ' · ' : ''}${m.name} · ${p.devices.get(m.dev)?.name ?? m.dev} ch${m.ch}`)
      })
    })
    y += tapH + 12
  }
  if (!sections.length) y += 12
  return b.finish(M + tapW + M, y - 12 + M)
}
