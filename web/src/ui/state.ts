// What the person has chosen, and turning it into pages.
import type { Page } from '../engine/page.ts'
import type { Project, Section } from '../engine/project.ts'
import { eqPage, eqDefaults } from '../engine/pages/eq.ts'
import { fadersPage, fadersDefaults } from '../engine/pages/faders.ts'
import { floorplanPage, floorplanDefaults, type FloorplanDesign } from '../engine/pages/floorplan.ts'
import { masterPage, masterDefaults } from '../engine/pages/master.ts'
import { stripsPage, stripsDefaults, timingDefaults } from '../engine/pages/strips.ts'
import { BUILTIN_STRIPS, type Strip } from '../engine/strips.ts'

export type PageKind = 'master' | 'timing' | 'eq' | 'faders' | 'strips' | 'floorplan'

export const PAGE_KINDS: { kind: PageKind; title: string; blurb: string }[] = [
  { kind: 'master', title: 'Master', blurb: 'The whole system at a glance: Master mute, power and level, then every section with its channels.' },
  { kind: 'timing', title: 'Timing', blurb: 'Time alignment: a row per channel with mute, delay and the tone generator, and a relative delay per group.' },
  { kind: 'eq', title: 'EQ & tuning', blurb: 'One EQ for the whole system, one per section, and per-channel level, CUT, CPL and EQ switches.' },
  { kind: 'faders', title: 'Faders', blurb: 'A long fader and output meter for every channel, or one for each Left/Right pair, a fader per section and a Master fader.' },
  { kind: 'strips', title: 'Strips', blurb: 'Your strip once per channel, by section, in Left and Right columns, as the Taps page has them.' },
  { kind: 'floorplan', title: 'Floorplan', blurb: 'Your floorplan as the background, with a strip placed where each speaker is.' },
]

export interface Configs {
  master: { enabled: boolean; name: string; groupStrip: string; channelStrip: string; perRow: number }
  timing: { enabled: boolean; name: string; groupStrip: string; channelStrip: string; masterRow: boolean }
  eq: { enabled: boolean; name: string; masterBank: 1 | 2; sectionBank: 1 | 2; rows: boolean; perRow: number }
  faders: { enabled: boolean; name: string; w: number; h: number; link: boolean; sectionFaders: boolean; mutes: boolean; inMeters: boolean }
  strips: { enabled: boolean; name: string; groupStrip: string; channelStrip: string; columns: 'LR' | number; gap: number }
  floorplan: { enabled: boolean } & FloorplanDesign
}

export function defaultConfigs(): Configs {
  return {
    master: { enabled: true, name: masterDefaults.name, groupStrip: masterDefaults.groupStrip.id,
      channelStrip: masterDefaults.channelStrip.id, perRow: masterDefaults.perRow },
    timing: { enabled: true, name: timingDefaults.name, groupStrip: timingDefaults.groupStrip!.id,
      channelStrip: timingDefaults.channelStrip.id, masterRow: true },
    eq: { enabled: true, name: eqDefaults.name, masterBank: eqDefaults.masterBank, sectionBank: eqDefaults.sectionBank,
      rows: eqDefaults.rows, perRow: eqDefaults.perRow },
    faders: { enabled: true, name: fadersDefaults.name, w: fadersDefaults.w, h: fadersDefaults.h, link: true,
      sectionFaders: true, mutes: true, inMeters: false },
    strips: { enabled: true, name: stripsDefaults.name, groupStrip: stripsDefaults.groupStrip!.id,
      channelStrip: stripsDefaults.channelStrip.id, columns: 'LR', gap: 12 },
    floorplan: { enabled: false, ...floorplanDefaults },
  }
}

export function stripMap(custom: Strip[]): Map<string, Strip> {
  return new Map([...BUILTIN_STRIPS, ...custom].map((s) => [s.id, s]))
}

function pick(m: Map<string, Strip>, id: string, fallback: Strip, target: 'channel' | 'group'): Strip {
  const s = m.get(id)
  return s && s.target === target ? s : fallback
}

export function makePage(kind: PageKind, p: Project, secs: Section[], c: Configs, strips: Map<string, Strip>): Page {
  switch (kind) {
    case 'master':
      return masterPage(p, secs, {
        name: c.master.name, perRow: c.master.perRow,
        groupStrip: pick(strips, c.master.groupStrip, masterDefaults.groupStrip, 'group'),
        channelStrip: pick(strips, c.master.channelStrip, masterDefaults.channelStrip, 'channel'),
      })
    case 'timing':
      return stripsPage(p, secs, {
        ...timingDefaults, name: c.timing.name,
        groupStrip: pick(strips, c.timing.groupStrip, timingDefaults.groupStrip!, 'group'),
        channelStrip: pick(strips, c.timing.channelStrip, timingDefaults.channelStrip, 'channel'),
        masterStrip: c.timing.masterRow ? timingDefaults.masterStrip : null,
      })
    case 'eq':
      return eqPage(p, secs, { ...eqDefaults, ...c.eq })
    case 'faders':
      return fadersPage(p, secs, { ...fadersDefaults, ...c.faders })
    case 'strips':
      return stripsPage(p, secs, {
        name: c.strips.name, columns: c.strips.columns, gap: c.strips.gap,
        groupStrip: c.strips.groupStrip ? pick(strips, c.strips.groupStrip, stripsDefaults.groupStrip!, 'group') : null,
        channelStrip: pick(strips, c.strips.channelStrip, stripsDefaults.channelStrip, 'channel'),
      })
    case 'floorplan':
      return floorplanPage(p, c.floorplan, strips)
  }
}

// ---- keeping things between visits (this browser only) -------------------

const STRIPS_KEY = 'r1-views:strips'
const CONFIG_KEY = 'r1-views:configs'

export function loadStrips(): Strip[] {
  try {
    const v = JSON.parse(localStorage.getItem(STRIPS_KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function saveStrips(s: Strip[]): void {
  localStorage.setItem(STRIPS_KEY, JSON.stringify(s))
}

/** Page settings by project file name; a floorplan keeps its tiles but not its
 * picture (that can be megabytes, and localStorage is small). */
export function loadConfigs(file: string): Configs {
  const d = defaultConfigs()
  try {
    const all = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? '{}')
    const c = all[file]
    if (!c) return d
    return {
      master: { ...d.master, ...c.master }, timing: { ...d.timing, ...c.timing }, eq: { ...d.eq, ...c.eq },
      faders: { ...d.faders, ...c.faders }, strips: { ...d.strips, ...c.strips },
      floorplan: { ...d.floorplan, ...c.floorplan, image: null },
    }
  } catch {
    return d
  }
}

export function saveConfigs(file: string, c: Configs): void {
  try {
    const all = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? '{}')
    all[file] = { ...c, floorplan: { ...c.floorplan, image: null } }
    localStorage.setItem(CONFIG_KEY, JSON.stringify(all))
  } catch {
    // a full or blocked localStorage only costs the settings next time
  }
}
