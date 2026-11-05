// The Master page: the whole system at a glance.  A Master card as AutoCreate
// builds one (mute and power that ask first, rel. Level), the project's name,
// then one row per section: the group strip (AutoCreate's group card by
// default) and every channel in the section beside it (R1's Channel control by
// default, which shows ISP/GR/OVL, level and mute).
import { PageBuilder, group, type Page } from '../page.ts'
import { delayCeiling, membersOf, type Project, type Section } from '../project.ts'
import { drawStrip, stripHeight, CHANNEL_ONLY, GROUP_CARD, type Strip } from '../strips.ts'

const M = 16
const PAD = 12
const TITLE = 36
const CELL_GAP = 8

export interface MasterOptions {
  name: string
  groupStrip: Strip
  channelStrip: Strip
  /** Channels per row beside each section's group strip. */
  perRow: number
}

export const masterDefaults: MasterOptions = {
  name: 'Master', groupStrip: GROUP_CARD, channelStrip: CHANNEL_ONLY, perRow: 5,
}

export function masterPage(p: Project, sections: Section[], o: MasterOptions = masterDefaults): Page {
  const b = new PageBuilder(o.name)
  const all = membersOf(p.master)
  const g = group(p.master.id)

  // Master, in AutoCreate's own layout, plus a delay for the whole system
  let j = b.join()
  b.frame(M, M, 350, 222, 'Master', j, 14)
  b.mute(M + 13, M + 40, 52, 52, 'Mute', j, g, true)
  b.relLevel(M + 96, M + 30, j, g)
  b.power(M + 251, M + 40, j, g)
  b.delayOn(M + 237, M + 130, 100, 24, j, g, 'Delay', 0)
  b.relDelay(M + 237, M + 160, 100, 24, 'rel. Delay', j, g, delayCeiling(p, all) - 0.5, 64)

  j = b.join()
  const px = M + 350 + 12
  b.frame(px, M, 350, 222, 'Project', j, 14)
  b.label(px + 11, M + 39, 328, 64, p.name || 'Untitled project', j)
  const amps = new Set(all.map((m) => m.dev)).size
  b.label(px + 11, M + 111, 328, 24, `${amps} amps · ${all.length} channels · ${sections.length} sections`, j)
  if (p.r1Version) b.label(px + 11, M + 143, 328, 24, `R1 ${p.r1Version}`, j)

  let y = M + 222 + 12
  let width = px + 350 - M
  const gs = { ...o.groupStrip, frame: false }
  const cs = o.channelStrip
  const cellW = cs.w + CELL_GAP
  const cellH = stripHeight(cs, p) + CELL_GAP
  for (const s of sections) {
    const n = s.members.length
    const cols = Math.max(1, Math.min(o.perRow, n))
    const rows = Math.max(1, Math.ceil(n / o.perRow))
    const gridX = gs.w
    const fw = gridX + (n ? cols * cellW - CELL_GAP : 0) + PAD
    const fh = Math.max(gs.h, TITLE + rows * cellH - CELL_GAP + PAD)
    j = b.join()
    b.frame(M, y, fw, fh, s.name, j, 4)
    drawStrip(b, gs, M, y, { p, members: s.members, groupId: s.id, name: s.name }, j)
    s.members.forEach((m, i) => {
      const x = M + gridX + (i % o.perRow) * cellW
      const cy = y + TITLE + Math.floor(i / o.perRow) * cellH
      drawStrip(b, cs, x, cy, { p, members: [m], name: m.name, side: s.side.get(`${m.dev}/${m.ch}`) },
        cs.frame ? undefined : j)
    })
    b.page.notes.push(`${s.name}: ${n} channel${n === 1 ? '' : 's'}`)
    width = Math.max(width, fw)
    y += fh + 12
  }
  return b.finish(M + width + M, y - 12 + M)
}
