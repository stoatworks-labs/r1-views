// Strips: a card of controls designed once and laid out per channel or per
// group.  A channel strip is drawn once for every amp channel in a section; a
// group strip once for the section itself (its header row on a Strips page, or
// a tile on a floorplan).  Coordinates are relative to the strip's top-left.
//
// The built-in "Speaker card" and "Section header" are the card and the
// tap-wide row of scripts/tap_view.py, element for element, so the Strips page
// with them reproduces the Taps view (test/parity.test.ts).
import { chan, group, type PageBuilder, type Target } from './page.ts'
import { delayCeiling, key, maxDelay, oneSpeakerType, type Member, type Project } from './project.ts'

export type StripTarget = 'channel' | 'group'

export interface StripElement {
  kind: string
  x: number
  y: number
  w: number
  h: number
  /** The control's label.  {name} is the channel or group name. */
  label: string | null
  /** Where R1 draws the label, if not where the kind puts it: 1 left, 64 below, 2 right. */
  labelPos?: number
}

export interface Strip {
  id: string
  name: string
  target: StripTarget
  w: number
  h: number
  /** Draw the strip in a frame of its own (a card), titled from `title`. */
  frame: boolean
  /** {name}, {side} (Left/Right), {amp} (device name), {ch}, {remote}, {filter1} (CUT, or 100Hz when the name says sub). */
  title: string
  /** Channel strips: a row of lamps, one per ArrayProcessing slot, added
   * under the strip when the project has slots. */
  apRow: boolean
  elements: StripElement[]
}

/** What a strip is being drawn for. */
export interface StripContext {
  p: Project
  target: Target
  isGroup: boolean
  /** The channel, or every channel in the group. */
  members: Member[]
  name: string
  /** Notes for the page, such as a control left off and why. */
  notes: string[]
}

export interface Kind {
  kind: string
  /** Name in the designer's palette. */
  title: string
  /** R1 control type, for the preview. */
  t: number
  w: number
  h: number
  /** R1 draws it at one size only. */
  fixed?: boolean
  targets: StripTarget[]
  label: string | null
  /** Where R1 puts the label: 1 left, 64 below, 2 right, 0 inside (switches). */
  labelPos: number
  help: string
  build: (b: PageBuilder, x: number, y: number, w: number, h: number, dn: string | null, j: number, c: StripContext) => void
}

const amp = (c: StripContext) => c.p.devices.get(c.members[0]?.dev ?? -1)

/** Group CUT and CPL only where every channel drives the same loudspeaker. */
function sameSpeaker(c: StripContext, what: string): boolean {
  if (!c.isGroup || oneSpeakerType(c.p, c.members)) return true
  c.notes.push(`${c.name}: no group ${what}, because its channels drive different loudspeakers`)
  return false
}

export const KINDS: Kind[] = [
  {
    kind: 'channel', title: 'Channel', t: 1, w: 172, h: 98, fixed: true, targets: ['channel'], label: null, labelPos: 64,
    help: "R1's Channel control: speaker, remote ID, ISP/GR/OVL, level, mute and name. Opens the channel's details.",
    build: (b, x, y, _w, _h, _dn, j, c) => { b.channel(x, y, j, c.target) },
  },
  {
    kind: 'name', title: 'Name', t: 9, w: 150, h: 24, targets: ['channel'], label: null, labelPos: 1,
    help: "The channel's name, live from the amp (a Display on Config_ChannelName).",
    build: (b, x, y, w, h, dn, j, c) => { b.display(x, y, w, h, dn, j, c.target, 'Config_ChannelName') },
  },
  {
    kind: 'mute', title: 'Mute', t: 4, w: 52, h: 52, targets: ['channel', 'group'], label: 'Mute', labelPos: 0,
    help: 'Mute switch. On the Master group it asks before muting, as AutoCreate does.',
    build: (b, x, y, w, h, dn, j, c) => {
      b.mute(x, y, w, h, dn ?? 'Mute', j, c.target, c.isGroup && c.target.ti === c.p.master.id)
    },
  },
  {
    kind: 'muteLed', title: 'Mute lamp', t: 8, w: 20, h: 20, fixed: true, targets: ['channel'], label: 'Mute', labelPos: 2,
    help: 'A lamp that lights when the channel is muted.',
    build: (b, x, y, _w, _h, dn, j, c) => { b.led(x, y, dn ?? '', j, c.target, 'Config_Mute', 13) },
  },
  {
    kind: 'inMeter', title: 'Input meter', t: 7, w: 16, h: 98, targets: ['channel'], label: 'In', labelPos: 64,
    help: 'Input peak in dBu, -60 to +25. The range and the +19 dBu threshold are a choice, not read from R1.',
    build: (b, x, y, w, h, dn, j, c) => { b.inMeter(x, y, w, h, dn, j, c.target) },
  },
  {
    kind: 'outMeter', title: 'Output meter', t: 7, w: 16, h: 98, targets: ['channel'], label: 'Out', labelPos: 64,
    help: "R1's GR/Headroom: 0 dB is full output, below is headroom left, above is gain reduction.",
    build: (b, x, y, w, h, dn, j, c) => { b.outMeter(x, y, w, h, dn, j, c.target) },
  },
  {
    kind: 'gr', title: 'GR lamp', t: 8, w: 20, h: 20, fixed: true, targets: ['channel'], label: 'GR', labelPos: 2,
    help: 'Lights on gain reduction.',
    build: (b, x, y, _w, _h, dn, j, c) => { b.led(x, y, dn ?? '', j, c.target, 'ChStatus_Gr', 22) },
  },
  {
    kind: 'isp', title: 'ISP lamp', t: 8, w: 20, h: 20, fixed: true, targets: ['channel'], label: 'ISP', labelPos: 2,
    help: 'Input signal present.',
    build: (b, x, y, _w, _h, dn, j, c) => { b.led(x, y, dn ?? '', j, c.target, 'ChStatus_Isp', 21) },
  },
  {
    kind: 'ovl', title: 'OVL lamp', t: 8, w: 20, h: 20, fixed: true, targets: ['channel'], label: 'OVL', labelPos: 2,
    help: 'Overload.',
    build: (b, x, y, _w, _h, dn, j, c) => { b.led(x, y, dn ?? '', j, c.target, 'ChStatus_Ovl', 13) },
  },
  {
    kind: 'delayOn', title: 'Delay on', t: 4, w: 100, h: 24, targets: ['channel', 'group'], label: 'Delay', labelPos: 0,
    help: 'Switches the delay in and out.',
    build: (b, x, y, w, h, dn, j, c) => { b.delayOn(x, y, w, h, j, c.target, dn ?? 'Delay', c.isGroup ? 0 : 1) },
  },
  {
    kind: 'delayTime', title: 'Delay time', t: 3, w: 100, h: 24, targets: ['channel', 'group'], label: 'Time', labelPos: 1,
    help: "On a channel, its delay in ms, up to the amp's limit (340 ms on a D6 or D12, 10 s otherwise). On a group, a relative delay that moves every channel by the same amount.",
    build: (b, x, y, w, h, dn, j, c) => {
      if (c.isGroup) b.relDelay(x, y, w, h, dn, j, c.target, delayCeiling(c.p, c.members) - 0.5)
      else b.delayTime(x, y, w, h, dn, j, c.target, maxDelay(amp(c)?.model ?? ''))
    },
  },
  {
    kind: 'levelFader', title: 'Level fader', t: 2, w: 60, h: 220, targets: ['channel', 'group'], label: '{name}', labelPos: 64,
    help: "On a channel, its level over the amp's range (-57.5 to +6 dB). On a group, AutoCreate's rel. Level (±12 dB).",
    build: (b, x, y, w, h, dn, j, c) => {
      if (c.isGroup) b.relLevel(x, y, j, c.target, w, h, dn)
      else b.fader(x, y, w, h, dn, j, c.target)
    },
  },
  {
    kind: 'levelBox', title: 'Level box', t: 3, w: 90, h: 24, targets: ['channel'], label: 'Level', labelPos: 1,
    help: 'The level as a number, -57.5 to +6 dB.',
    build: (b, x, y, w, h, dn, j, c) => { b.levelBox(x, y, w, h, dn, j, c.target) },
  },
  {
    kind: 'toneMode', title: 'Tone generator', t: 5, w: 110, h: 24, targets: ['channel', 'group'], label: 'Tone', labelPos: 1,
    help: "The amp's own frequency generator: Off, Sine or Pink. On a group, it sets every channel at once.",
    build: (b, x, y, w, h, dn, j, c) => { b.toneMode(x, y, w, h, dn, j, c.target) },
  },
  {
    kind: 'toneFreq', title: 'Tone frequency', t: 3, w: 110, h: 24, targets: ['channel', 'group'], label: 'Freq.', labelPos: 1,
    help: 'Sine frequency, 10 Hz to 20 kHz.',
    build: (b, x, y, w, h, dn, j, c) => { b.toneFreq(x, y, w, h, dn, j, c.target) },
  },
  {
    kind: 'toneLevel', title: 'Tone level', t: 3, w: 110, h: 24, targets: ['channel', 'group'], label: 'Level', labelPos: 1,
    help: 'Generator level, -57.5 to +6 dBu.',
    build: (b, x, y, w, h, dn, j, c) => { b.toneLevel(x, y, w, h, dn, j, c.target) },
  },
  {
    kind: 'filter1', title: 'CUT / 100Hz', t: 4, w: 70, h: 24, targets: ['channel', 'group'], label: 'CUT', labelPos: 0,
    help: "Filter 1: CUT on a top, 100Hz or Infra on a sub. The speaker decides what it does; the label is only text. A group gets one only if all its channels drive the same loudspeaker.",
    build: (b, x, y, w, h, dn, j, c) => { if (sameSpeaker(c, 'CUT')) b.filter1(x, y, w, h, dn ?? 'CUT', j, c.target) },
  },
  {
    kind: 'cpl', title: 'CPL', t: 3, w: 90, h: 24, targets: ['channel', 'group'], label: 'CPL', labelPos: 1,
    help: 'Coupling filter, -9 to +5 dB. A group gets one only if all its channels drive the same loudspeaker.',
    build: (b, x, y, w, h, dn, j, c) => { if (sameSpeaker(c, 'CPL')) b.cpl(x, y, w, h, dn, j, c.target, 1) },
  },
  {
    kind: 'eq1On', title: 'EQ 1 on', t: 4, w: 60, h: 24, targets: ['channel', 'group'], label: 'EQ 1', labelPos: 0,
    help: 'Switches EQ 1 in and out.',
    build: (b, x, y, w, h, dn, j, c) => { b.eqSwitch(x, y, w, h, dn ?? 'EQ 1', j, c.target, 'Config_Eq1Enable') },
  },
  {
    kind: 'eq2On', title: 'EQ 2 on', t: 4, w: 60, h: 24, targets: ['channel', 'group'], label: 'EQ 2', labelPos: 0,
    help: 'Switches EQ 2 in and out.',
    build: (b, x, y, w, h, dn, j, c) => { b.eqSwitch(x, y, w, h, dn ?? 'EQ 2', j, c.target, 'Config_Eq2Enable') },
  },
  {
    kind: 'eq', title: 'EQ (bank 1)', t: 6, w: 554, h: 426, targets: ['channel', 'group'], label: null, labelPos: 64,
    help: "R1's EQ control on EQ 1, as AutoCreate's EQ views place it. On a group it writes the same curve to every channel; it does not add to theirs.",
    build: (b, x, y, w, h, _dn, j, c) => { b.eq(x, y, j, c.target, 1, w, h) },
  },
  {
    kind: 'eq2', title: 'EQ (bank 2)', t: 6, w: 554, h: 426, targets: ['channel', 'group'], label: null, labelPos: 64,
    help: "R1's EQ control on EQ 2. Not yet seen in a file R1 wrote: AutoCreate only binds EQ 1.",
    build: (b, x, y, w, h, _dn, j, c) => { b.eq(x, y, j, c.target, 2, w, h) },
  },
  {
    kind: 'power', title: 'Power', t: 4, w: 52, h: 52, targets: ['group'], label: 'Power', labelPos: 0,
    help: 'Powers every amp in the group on or off. Asks first.',
    build: (b, x, y, _w, _h, _dn, j, c) => { b.power(x, y, j, c.target) },
  },
  {
    kind: 'label', title: 'Text', t: 11, w: 100, h: 24, targets: ['channel', 'group'], label: '{name}', labelPos: 0,
    help: 'Fixed text. {name} becomes the channel or group name.',
    build: (b, x, y, w, h, dn, j) => { b.label(x, y, w, h, dn ?? '', j) },
  },
]

export const kindOf = (k: string): Kind => {
  const f = KINDS.find((x) => x.kind === k)
  if (!f) throw new Error(`unknown strip element "${k}"`)
  return f
}

const el = (kind: string, x: number, y: number, w: number, h: number, label: string | null,
  labelPos?: number): StripElement => (labelPos == null ? { kind, x, y, w, h, label } : { kind, x, y, w, h, label, labelPos })

/** scripts/tap_view.py's card, 644 x 164 (+30 for AP lamps). */
export const SPEAKER_CARD: Strip = {
  id: 'speaker-card', name: 'Speaker card', target: 'channel', w: 644, h: 164, frame: true,
  title: '{side} · {name}', apRow: true,
  elements: [
    el('channel', 13, 36, 172, 98, null),
    el('inMeter', 193, 36, 16, 98, 'In'),
    el('outMeter', 219, 36, 16, 98, 'Out'),
    el('mute', 247, 36, 52, 52, 'Mute'),
    el('gr', 249, 100, 20, 20, 'GR'),
    el('delayOn', 359, 36, 100, 24, 'Delay'),
    el('delayTime', 359, 66, 100, 24, 'Time'),
    el('toneMode', 521, 36, 110, 24, 'Tone'),
    el('toneFreq', 521, 66, 110, 24, 'Freq.'),
    el('toneLevel', 521, 96, 110, 24, 'Level'),
  ],
}

/** scripts/tap_view.py's tap-wide row: mute, delay, relative delay. */
export const SECTION_HEADER: Strip = {
  id: 'section-header', name: 'Section header', target: 'group', w: 420, h: 72, frame: false,
  title: '{name}', apRow: false,
  elements: [
    el('mute', 13, 36, 100, 24, 'Mute {name}'),
    el('delayOn', 125, 36, 100, 24, 'Delay'),
    el('delayTime', 311, 36, 100, 24, 'rel. Delay'),
  ],
}

/** A row per channel for time alignment: walk the room with pink noise. */
export const TIMING_ROW: Strip = {
  id: 'timing-row', name: 'Timing row', target: 'channel', w: 812, h: 28, frame: false,
  title: '{name}', apRow: false,
  elements: [
    el('name', 12, 2, 160, 24, null),
    el('mute', 180, 2, 64, 24, 'Mute'),
    el('delayOn', 252, 2, 72, 24, 'Delay'),
    el('delayTime', 332, 2, 100, 24, null),
    el('toneMode', 448, 2, 96, 24, null),
    el('toneFreq', 552, 2, 96, 24, null),
    el('toneLevel', 656, 2, 96, 24, null),
    el('gr', 768, 4, 20, 20, null),
  ],
}

/** The section header for timing rows, with column titles over them. */
export const TIMING_HEADER: Strip = {
  id: 'timing-header', name: 'Timing header', target: 'group', w: 812, h: 100, frame: false,
  title: '{name}', apRow: false,
  elements: [
    el('mute', 180, 36, 64, 24, 'Mute'),
    el('delayOn', 252, 36, 72, 24, 'Delay'),
    el('delayTime', 332, 36, 100, 24, null),
    el('toneMode', 448, 36, 96, 24, null),
    el('label', 12, 36, 160, 24, 'Whole group'),
    el('label', 12, 72, 160, 24, 'Channel'),
    el('label', 332, 72, 100, 24, 'Delay (ms)'),
    el('label', 448, 72, 96, 24, 'Tone'),
    el('label', 552, 72, 96, 24, 'Freq. (Hz)'),
    el('label', 656, 72, 96, 24, 'Level (dBu)'),
    el('label', 760, 72, 40, 24, 'GR'),
  ],
}

/** A row per channel under a section's EQ. */
export const TUNING_ROW: Strip = {
  id: 'tuning-row', name: 'Tuning row', target: 'channel', w: 666, h: 28, frame: false,
  title: '{name}', apRow: false,
  elements: [
    el('name', 0, 2, 170, 24, null),
    el('levelBox', 178, 2, 90, 24, null),
    el('filter1', 276, 2, 70, 24, '{filter1}'),
    el('cpl', 354, 2, 90, 24, null),
    el('eq1On', 452, 2, 60, 24, 'EQ 1'),
    el('eq2On', 520, 2, 60, 24, 'EQ 2'),
    el('gr', 596, 4, 20, 20, null),
  ],
}

/** A small card for a floorplan: mute, output meter and lamps. */
export const COMPACT_CARD: Strip = {
  id: 'compact-card', name: 'Compact card', target: 'channel', w: 148, h: 104, frame: true,
  title: '{name}', apRow: false,
  elements: [
    el('mute', 10, 32, 52, 52, 'Mute'),
    el('outMeter', 70, 32, 14, 62, null),
    el('gr', 94, 32, 20, 20, 'GR'),
    el('ovl', 94, 60, 20, 20, 'OVL'),
  ],
}

/** R1's Channel control alone, in a frame titled with the amp. */
export const CHANNEL_TILE: Strip = {
  id: 'channel-tile', name: 'Channel tile', target: 'channel', w: 188, h: 140, frame: true,
  title: '{amp} ch{ch}', apRow: false,
  elements: [el('channel', 8, 34, 172, 98, null)],
}

/** A card for a walk-round: mute, delay and the generator. */
export const WALK_CARD: Strip = {
  id: 'walk-card', name: 'Walk-round card', target: 'channel', w: 236, h: 132, frame: true,
  title: '{name}', apRow: false,
  elements: [
    el('mute', 10, 34, 52, 52, 'Mute'),
    el('gr', 22, 98, 20, 20, null),
    el('delayOn', 72, 34, 56, 24, 'Delay'),
    el('delayTime', 136, 34, 90, 24, null),
    el('toneMode', 136, 64, 90, 24, 'Tone'),
    el('toneLevel', 136, 94, 90, 24, 'Level'),
  ],
}

/** A group card in AutoCreate's shape: mute, rel. Level, delay, rel. Delay. */
export const GROUP_CARD: Strip = {
  id: 'group-card', name: 'Group card', target: 'group', w: 350, h: 222, frame: true,
  title: '{name}', apRow: false,
  elements: [
    el('mute', 13, 40, 52, 52, 'Mute'),
    el('levelFader', 96, 30, 100, 154, 'rel. Level'),
    el('filter1', 237, 40, 100, 24, '{filter1}'),
    el('cpl', 237, 70, 100, 24, 'CPL', 64),
    el('delayOn', 237, 130, 100, 24, 'Delay'),
    el('delayTime', 237, 160, 100, 24, 'rel. Delay', 64),
  ],
}

/** A group tile for a floorplan: mute and relative delay. */
export const GROUP_TILE: Strip = {
  id: 'group-tile', name: 'Group tile', target: 'group', w: 200, h: 100, frame: true,
  title: '{name}', apRow: false,
  elements: [
    el('mute', 10, 34, 52, 52, 'Mute'),
    el('delayOn', 72, 34, 118, 24, 'Delay'),
    el('delayTime', 90, 64, 100, 24, 'Δ'),
  ],
}

/** R1's Channel control and nothing else, for a grid. */
export const CHANNEL_ONLY: Strip = {
  id: 'channel-only', name: 'Channel control only', target: 'channel', w: 172, h: 98, frame: false,
  title: '{name}', apRow: false, elements: [el('channel', 0, 0, 172, 98, null)],
}

/** The whole system in one row, over timing rows. */
export const MASTER_ROW: Strip = {
  id: 'master-row', name: 'Master row', target: 'group', w: 812, h: 64, frame: false,
  title: 'Master', apRow: false,
  elements: [
    el('label', 12, 32, 160, 24, 'Whole system'),
    el('mute', 180, 32, 64, 24, 'Mute'),
    el('delayOn', 252, 32, 72, 24, 'Delay'),
    el('delayTime', 332, 32, 100, 24, null),
    el('toneMode', 448, 32, 96, 24, null),
  ],
}

export const BUILTIN_STRIPS: Strip[] = [
  SPEAKER_CARD, COMPACT_CARD, WALK_CARD, CHANNEL_TILE, CHANNEL_ONLY, TIMING_ROW, TUNING_ROW,
  SECTION_HEADER, TIMING_HEADER, MASTER_ROW, GROUP_CARD, GROUP_TILE,
]

export function fillTitle(tpl: string, v: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m)
}

export interface StripHost {
  p: Project
  /** Channel: [the channel]; group: its members. */
  members: Member[]
  /** Group id when the strip is for a group. */
  groupId?: number
  name: string
  side?: 'L' | 'R'
}

/** How tall a strip comes out in this project: channel strips with an AP row
 * grow by 30 px when any channel has ArrayProcessing slots. */
export function stripHeight(s: Strip, p: Project): number {
  return s.h + (s.apRow && [...p.channels.values()].some((c) => c.ap.length) ? 30 : 0)
}

/** Draw a strip at (x, y).  A framed strip gets its own frame and unit;
 * otherwise its controls join `j`. */
export function drawStrip(b: PageBuilder, s: Strip, x: number, y: number, h: StripHost, j?: number): void {
  const m = h.members[0]
  const dev = m ? h.p.devices.get(m.dev) : undefined
  const vars: Record<string, string> = {
    name: h.name, side: h.side === 'L' ? 'Left' : h.side === 'R' ? 'Right' : '',
    amp: dev?.name ?? '', ch: m ? String(m.ch) : '', remote: dev?.remoteId ?? '',
    // Filter 1 is CUT on a top and 100Hz on a sub; the name is the only clue
    filter1: /sub/i.test(h.name) ? '100Hz' : 'CUT',
  }
  const unit = j ?? b.join()
  if (s.frame) b.frame(x, y, s.w, stripHeight(s, h.p), fillTitle(s.title, vars), unit, 4)
  const isGroup = s.target === 'group'
  const target = isGroup ? group(h.groupId!) : chan(m.dev, m.ch)
  const ctx: StripContext = {
    p: h.p, target, isGroup, members: h.members, name: h.name, notes: b.page.notes,
  }
  for (const e of s.elements) {
    const k = kindOf(e.kind)
    if (!k.targets.includes(s.target)) continue
    const dn = e.label == null ? null : fillTitle(e.label, vars)
    const before = b.page.ctls.length
    k.build(b, x + e.x, y + e.y, k.fixed ? k.w : e.w, k.fixed ? k.h : e.h, dn, unit, ctx)
    if (e.labelPos != null) for (const c of b.page.ctls.slice(before)) c.la = e.labelPos
  }
  if (s.apRow && !isGroup) {
    const ap = h.p.channels.get(key(m.dev, m.ch))?.ap ?? []
    ap.slice(0, 10).forEach((a, k) => {
      b.led(x + 13 + k * 62, y + s.h - 2, `AP ${a.slot}`, unit, target, 'ArrayProcessing_Enable', 1, a.slot)
    })
  }
}

/** Problems with a strip's own layout, for the designer. */
export function stripProblems(s: Strip): string[] {
  const out: string[] = []
  const els = s.elements.map((e) => {
    const k = KINDS.find((x) => x.kind === e.kind)
    return { e, k, w: k?.fixed ? k.w : e.w, h: k?.fixed ? k.h : e.h }
  })
  els.forEach(({ e, k, w, h }, i) => {
    if (!k) { out.push(`unknown element ${e.kind}`); return }
    if (!k.targets.includes(s.target)) out.push(`${k.title} only works on a ${k.targets.join(' or ')} strip`)
    if (e.x < 0 || e.y < 0 || e.x + w > s.w || e.y + h > s.h) out.push(`${k.title} sticks out of the strip`)
    if (s.frame && e.y < 24) out.push(`${k.title} covers the title`)
    for (const o of els.slice(i + 1)) {
      if (e.x < o.e.x + o.w && o.e.x < e.x + w && e.y < o.e.y + o.h && o.e.y < e.y + h) {
        out.push(`${k.title} overlaps ${o.k?.title ?? o.e.kind}`)
      }
    }
  })
  return out
}
