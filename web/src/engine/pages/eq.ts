// EQ and tuning: one EQ for the whole system on the Master group, one per
// section, and under each section a row per channel with its level, CUT, CPL
// and EQ switches.
//
// An EQ control on a group writes the same curve to every channel in it; it
// does not add to theirs (R1 help 7.7).  So the Master EQ and the section EQs
// sit on different banks: by default Master on EQ 2 and the sections on EQ 1,
// the bank AutoCreate's own EQ views use, so this page and those agree.
import { PageBuilder, group, type Page } from '../page.ts'
import { membersOf, oneSpeakerType, type Project, type Section } from '../project.ts'
import { drawStrip, TUNING_ROW, type Strip } from '../strips.ts'

const M = 16
const PAD = 12
const EQ_W = 554
const EQ_FRAME = 450       // AutoCreate's EQ view: frame 554 x 450, EQ 23 px down
const SIDE = 100
const TILE_W = EQ_W + 12 + SIDE + PAD
const ROW_HEAD = 30

export interface EqOptions {
  name: string
  masterBank: 1 | 2
  sectionBank: 1 | 2
  /** Per-channel rows under each section's EQ. */
  rows: boolean
  rowStrip: Strip
  /** Tiles across the page. */
  perRow: number
}

export const eqDefaults: EqOptions = {
  name: 'EQ', masterBank: 2, sectionBank: 1, rows: true, rowStrip: TUNING_ROW, perRow: 2,
}

export function eqPage(p: Project, sections: Section[], o: EqOptions = eqDefaults): Page {
  const b = new PageBuilder(o.name)
  if (o.masterBank === o.sectionBank) {
    b.page.notes.push(`Master and the sections share EQ ${o.masterBank}: each overwrites the other's curve`)
  }

  const tile = (x: number, y: number, title: string, gid: number, bank: 1 | 2, sec: Section | null, mc: number) => {
    const members = sec ? sec.members : membersOf(p.master)
    const nRows = sec && o.rows ? members.length : 0
    const h = EQ_FRAME + (nRows ? 8 + ROW_HEAD + nRows * o.rowStrip.h + PAD : 0)
    const j = b.join()
    const g = group(gid)
    b.frame(x, y, TILE_W, h, `${title} · EQ ${bank}`, j, mc)
    b.eq(x, y + 23, j, g, bank)
    const sx = x + EQ_W + 12
    b.eqSwitch(sx, y + 36, SIDE, 24, 'EQ 1', j, g, 'Config_Eq1Enable')
    b.eqSwitch(sx, y + 66, SIDE, 24, 'EQ 2', j, g, 'Config_Eq2Enable')
    if (sec) {
      if (oneSpeakerType(p, members)) {
        const sub = /sub/i.test(sec.name)
        b.filter1(sx, y + 126, SIDE, 24, sub ? '100Hz' : 'CUT', j, g)
        if (!sub) b.cpl(sx, y + 156, SIDE, 24, 'CPL', j, g)
      } else {
        b.page.notes.push(`${sec.name}: CUT and CPL per channel only, as its channels drive different loudspeakers`)
      }
    }
    if (nRows) {
      const ry = y + EQ_FRAME + 8
      // column titles over TUNING_ROW's elements
      const cols: [number, number, string][] = [
        [0, 170, 'Channel'], [178, 90, 'Level (dB)'], [276, 70, 'Filter 1'], [354, 90, 'CPL (dB)'], [452, 128, 'EQ'], [596, 60, 'GR'],
      ]
      for (const [cx, w, text] of cols) b.label(x + PAD + cx, ry, w, 24, text, j)
      members.forEach((m, i) => {
        drawStrip(b, o.rowStrip, x + PAD, ry + ROW_HEAD + i * o.rowStrip.h,
          { p, members: [m], name: m.name, side: sec!.side.get(`${m.dev}/${m.ch}`) }, o.rowStrip.frame ? undefined : j)
      })
    }
    return h
  }

  let y = M
  y += tile(M, y, 'Master', p.master.id, o.masterBank, null, 14) + 12
  let x = M
  let rowH = 0
  let width = TILE_W
  sections.forEach((s, i) => {
    if (i && i % o.perRow === 0) { y += rowH + 12; x = M; rowH = 0 }
    rowH = Math.max(rowH, tile(x, y, s.name, s.id, o.sectionBank, s, 4))
    width = Math.max(width, x + TILE_W - M)
    x += TILE_W + 12
  })
  y += rowH
  return b.finish(M + width + M, (sections.length ? y : y - 12) + M)
}
