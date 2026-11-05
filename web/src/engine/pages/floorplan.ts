// A floorplan page: the room as a picture, and strips placed where the
// speakers are.  The whole page sits in one frame; the picture goes in first
// so it is the lowest control, then the tiles in the order they were placed.
// R1 takes PNG or JPEG for a picture (R1 help, Picture); it keeps PNG.
import { PageBuilder, type Page } from '../page.ts'
import { key, membersOf, type Project } from '../project.ts'
import { drawStrip, type Strip } from '../strips.ts'

export const TITLE_BAND = 28

export type TileTarget = { kind: 'channel'; dev: number; ch: number } | { kind: 'group'; id: number }

export interface Tile {
  id: string
  stripId: string
  target: TileTarget
  x: number
  y: number
}

export interface FloorImage {
  /** PNG bytes, already scaled for the page. */
  day: Uint8Array
  /** A darker copy for R1's night scheme (Cmd+B); the same bytes for none. */
  night: Uint8Array
  /** Where it sits on the page, in R1 pixels. */
  x: number; y: number; w: number; h: number
  /** Size of the PNG itself. */
  pw: number; ph: number
  name: string
}

export interface FloorplanDesign {
  name: string
  w: number
  h: number
  image: FloorImage | null
  tiles: Tile[]
}

export const floorplanDefaults: FloorplanDesign = { name: 'Floorplan', w: 1680, h: 900, image: null, tiles: [] }

/** A tile's size on the page, for the editor and for overlap checks. */
export function tileSize(s: Strip, p: Project): { w: number; h: number } {
  const ap = s.apRow && [...p.channels.values()].some((c) => c.ap.length) ? 30 : 0
  return { w: s.w, h: s.h + ap }
}

export function tileName(p: Project, t: TileTarget): string {
  if (t.kind === 'channel') return p.channels.get(key(t.dev, t.ch))?.name ?? `ch ${t.dev}/${t.ch}`
  return p.folders.get(t.id)?.name ?? `group ${t.id}`
}

export function floorplanPage(p: Project, d: FloorplanDesign, strips: Map<string, Strip>): Page {
  const b = new PageBuilder(d.name)
  const j = b.join()
  b.frame(0, 0, d.w, d.h, d.name, j, 14)
  if (d.image && d.image.day.length) {
    b.page.pictures.push({ name: d.image.name, day: d.image.day, night: d.image.night, width: d.image.pw, height: d.image.ph })
    b.picture(d.image.x, d.image.y, d.image.w, d.image.h, j, 0)
  }
  for (const t of d.tiles) {
    const s = strips.get(t.stripId)
    if (!s) { b.page.notes.push(`a tile uses a strip that no longer exists (${t.stripId}); left off`); continue }
    if (t.target.kind === 'channel') {
      const c = p.channels.get(key(t.target.dev, t.target.ch))
      if (!c || s.target !== 'channel') { b.page.notes.push(`${tileName(p, t.target)}: no such channel here; left off`); continue }
      drawStrip(b, s, t.x, t.y, { p, members: [c], name: c.name }, s.frame ? undefined : j)
    } else {
      const f = p.folders.get(t.target.id)
      if (!f || s.target !== 'group') { b.page.notes.push(`group ${t.target.id}: not in this project; left off`); continue }
      drawStrip(b, s, t.x, t.y, { p, members: membersOf(f), groupId: f.id, name: f.name }, s.frame ? undefined : j)
    }
  }
  return b.finish(d.w, d.h)
}
