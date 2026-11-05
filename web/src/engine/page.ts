// A page is a list of Controls rows, held in memory until it is written.  The
// field values follow R1 3.46.1: controls R1 wrote into projects (two real
// projects' AutoCreate pages) and the d&b templates in templates.r2t.
// scripts/r1db.py View.ctl is the Python twin of Page.ctl.

export const FONT = 'Arial,12,-1,5,400,0,0,0,0,0,0,0,0,0,0,1'
export const DIM = Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255])

/** An amp channel's level (Config_PotiLevel): -57.5 dB to +6 dB in 0.5 dB
 * steps (R1 help 6.1.4, Channel control).  The amps refuse anything outside it. */
export const LEVEL_MIN = -57.5
export const LEVEL_MAX = 6.0

export interface Ctl {
  t: number
  x: number; y: number; w: number; h: number
  dn: string | null
  /** Index of this control's unit on the page; becomes JoinedId when written. */
  j: number
  mn: number; mx: number
  mc: number; sc: number; lc: number; la: number
  th: number
  flags: number
  act: number; tt: number; ti: number; tc: number
  tp: string | null
  tr: number
  align: number
  confirmOn: string | null
  /** Index into Page.pictures, for a Picture control. */
  pic: number | null
  /** Index into Page.groups when the control drives a group this page adds;
   * TargetId is filled in when the group is written. */
  ng: number | null
}

/** A group the page adds, as scripts/r1db.py View.group writes one: a Type 0
 * row and a Type 1 row per amp channel.  New groups never go inside Master
 * (a channel listed twice under it would be moved twice by a relative
 * Master), so a group's parent is the root or another new group. */
export interface NewGroup {
  name: string
  /** 'root', or the index of an earlier new group. */
  parent: 'root' | number
  members: { name: string; dev: number; ch: number }[]
}

export interface Picture {
  name: string
  /** PNG bytes for R1's day and night colour schemes. */
  day: Uint8Array
  night: Uint8Array
  /** Pixel size, for the preview. */
  width: number
  height: number
}

export interface Page {
  name: string
  w: number
  h: number
  ctls: Ctl[]
  pictures: Picture[]
  groups: NewGroup[]
  /** Lines for the person building the page: what went where. */
  notes: string[]
}

export type Target = { tt?: number; ti?: number; tc?: number; ng?: number }
type Opts = Partial<Omit<Ctl, 't' | 'x' | 'y' | 'w' | 'h' | 'dn' | 'j'>>

/** Direct access to an amp channel. */
export const chan = (dev: number, ch: number): Target => ({ tt: 2, ti: dev, tc: ch })
/** A group from the project's tree. */
export const group = (id: number): Target => ({ tt: 0, ti: id, tc: -1 })
/** A group this page adds (index into Page.groups). */
export const newGroup = (i: number): Target => ({ tt: 0, ti: 0, tc: -1, ng: i })

export const MUTE_ALL = 'This will mute all speakers.\n\nDo you want to proceed?'
export const POWER_ALL = 'This will power on all devices.\n\nDo you want to proceed?'

export class PageBuilder {
  page: Page
  private joined = 0

  constructor(name: string) {
    this.page = { name, w: 0, h: 0, ctls: [], pictures: [], groups: [], notes: [] }
  }

  /** A fresh unit: controls that share one move together in R1. */
  join(): number {
    return this.joined++
  }

  /** One Controls row.  Defaults are a direct-access control (TargetType 2):
   * pass chan(dev, ch), or group(id) for a group. */
  ctl(t: number, x: number, y: number, w: number, h: number, dn: string | null, j: number, o: Opts = {}): Ctl {
    const c: Ctl = {
      t, x, y, w, h, dn, j,
      mn: 0, mx: 0, mc: 0, sc: 0, lc: 0, la: 64, th: 0, flags: 6,
      act: 1, tt: 2, ti: 0, tc: -1, tp: null, tr: 0, align: 132, confirmOn: null, pic: null, ng: null,
      ...o,
    }
    this.page.ctls.push(c)
    return c
  }

  /** Add a group; returns its index for newGroup(). */
  group(name: string, parent: 'root' | number, members: NewGroup['members'] = []): number {
    this.page.groups.push({ name, parent, members })
    return this.page.groups.length - 1
  }

  /** A titled frame; mc 14 is R1's Master style, 4 its Group style. */
  frame(x: number, y: number, w: number, h: number, title: string, j: number, mc: number): Ctl {
    return this.ctl(12, x, y, w, h, title, j, {
      mc, sc: 1, lc: 19, flags: 70, act: 0, tt: -1, tp: null, tr: 65535, align: 129,
    })
  }

  /** Static text, as R1 writes the project name on AutoCreate's Overview. */
  label(x: number, y: number, w: number, h: number, text: string, j: number, align = 129): Ctl {
    return this.ctl(11, x, y, w, h, text, j, {
      mc: 19, sc: 1, lc: 0, flags: 6, act: 0, tt: -1, tp: null, tr: 65535, align,
    })
  }

  // ---- channel and group controls, values as R1 writes them ---------------

  /** R1's Channel control: speaker, remote ID, ISP/GR/OVL, level, mute, name.  Fixed 172 x 98. */
  channel(x: number, y: number, j: number, t: Target): Ctl {
    return this.ctl(1, x, y, 172, 98, null, j, { mc: 1, sc: 1, lc: 1, tp: '', tr: 65535, ...t })
  }

  mute(x: number, y: number, w: number, h: number, dn: string, j: number, t: Target, confirm = false): Ctl {
    return this.ctl(4, x, y, w, h, dn, j, {
      mx: 1, mc: 13, sc: 13, flags: confirm ? 3334 : 262, tp: 'Config_Mute', confirmOn: confirm ? MUTE_ALL : null, ...t,
    })
  }

  power(x: number, y: number, j: number, t: Target): Ctl {
    return this.ctl(4, x, y, 52, 52, 'Power', j, {
      mx: 1, mc: 4, sc: 4, flags: 3334, tp: 'Settings_PwrOn', confirmOn: POWER_ALL, ...t,
    })
  }

  delayOn(x: number, y: number, w: number, h: number, j: number, t: Target, dn = 'Delay', sc = 1): Ctl {
    return this.ctl(4, x, y, w, h, dn, j, { mx: 1, mc: 0, sc, flags: 262, tp: 'Config_DelayOn', ...t })
  }

  /** Absolute delay time on a channel (0.3 ms up to the amp's limit). */
  delayTime(x: number, y: number, w: number, h: number, dn: string | null, j: number, t: Target, max = 10000, la = 1): Ctl {
    return this.ctl(3, x, y, w, h, dn, j, {
      mn: 0.3, mx: max, mc: -1, sc: -1, lc: 1, la, tp: 'ChStatus_MsDelay', align: 130, ...t,
    })
  }

  /** Relative delay on a group, ± the smallest member amp's limit less 0.5 ms (as AutoCreate). */
  relDelay(x: number, y: number, w: number, h: number, dn: string | null, j: number, t: Target, span: number, la = 1): Ctl {
    return this.ctl(3, x, y, w, h, dn, j, {
      mn: -span, mx: span, mc: -1, sc: -1, lc: 0, la, flags: 14, tp: 'ChStatus_MsDelay', align: 130, ...t,
    })
  }

  /** Level fader: absolute (Flags 6) or relative (Flags 14, groups only).  By
   * default relative on a group; a linked pair's fader is absolute on its group. */
  fader(x: number, y: number, w: number, h: number, dn: string | null, j: number, t: Target, mn = LEVEL_MIN, mx = LEVEL_MAX,
    relative = t.tt === 0): Ctl {
    return this.ctl(2, x, y, w, h, dn, j, {
      mn, mx, mc: 5, sc: 1, flags: relative ? 14 : 6, tp: 'Config_PotiLevel', ...t,
    })
  }

  /** AutoCreate's group "rel. Level" fader: ±12 dB, colours 5/5. */
  relLevel(x: number, y: number, j: number, t: Target, w = 100, h = 154, dn: string | null = 'rel. Level'): Ctl {
    return this.ctl(2, x, y, w, h, dn, j, { mn: -12, mx: 12, mc: 5, sc: 5, flags: 14, tp: 'Config_PotiLevel', ...t })
  }

  /** Level as a number box, absolute on a channel. */
  levelBox(x: number, y: number, w: number, h: number, dn: string | null, j: number, t: Target, la = 1): Ctl {
    return this.ctl(3, x, y, w, h, dn, j, {
      mn: LEVEL_MIN, mx: LEVEL_MAX, mc: -1, sc: -1, lc: 1, la, tp: 'Config_PotiLevel', align: 130, ...t,
    })
  }

  /** Output meter: R1's GR/Headroom, 0 dB = full output (R1 help 6.1.4, range 7.4.4). */
  outMeter(x: number, y: number, w: number, h: number, dn: string | null, j: number, t: Target): Ctl {
    return this.ctl(7, x, y, w, h, dn, j, {
      mn: -32, mx: 32.0001, mc: 5, sc: 13, lc: 1, th: 0, flags: 166, tp: 'ChStatus_GrHead', ...t,
    })
  }

  /** Input peak in dBu.  The -60..+25 range and +19 threshold are a choice, not read from R1. */
  inMeter(x: number, y: number, w: number, h: number, dn: string | null, j: number, t: Target): Ctl {
    return this.ctl(7, x, y, w, h, dn, j, {
      mn: -60, mx: 25.0001, mc: 3, sc: 13, lc: 1, th: 19, flags: 166, tp: 'ChStatus_InputVoltagePeak', ...t,
    })
  }

  /** A lamp, fields as templates.r2t's 20 x 20 LEDs, label to the right. */
  led(x: number, y: number, dn: string, j: number, t: Target, tp: string, mc: number, tr = 0): Ctl {
    return this.ctl(8, x, y, 20, 20, dn, j, { mc, sc: 1, la: 2, th: 1, tp, tr, ...t })
  }

  toneMode(x: number, y: number, w: number, h: number, dn: string | null, j: number, t: Target, la = 1): Ctl {
    return this.ctl(5, x, y, w, h, dn, j, { mc: 8, sc: 8, la, tp: 'Config_FreqGenMode', ...t })
  }

  toneFreq(x: number, y: number, w: number, h: number, dn: string | null, j: number, t: Target, la = 1): Ctl {
    return this.ctl(3, x, y, w, h, dn, j, {
      mn: 10, mx: 20000, mc: -1, sc: -1, lc: 1, la, tp: 'Config_FreqGenFreq', align: 130, ...t,
    })
  }

  toneLevel(x: number, y: number, w: number, h: number, dn: string | null, j: number, t: Target, la = 1): Ctl {
    return this.ctl(3, x, y, w, h, dn, j, {
      mn: -57.5, mx: 6, mc: -1, sc: -1, lc: 1, la, tp: 'Config_FreqGenLevel', align: 130, ...t,
    })
  }

  /** Filter 1: CUT on a top, 100Hz / Infra on a sub (the speaker decides; the label is ours). */
  filter1(x: number, y: number, w: number, h: number, dn: string, j: number, t: Target): Ctl {
    return this.ctl(4, x, y, w, h, dn, j, { mx: 1, mc: 1, sc: 1, flags: 262, tp: 'Config_Filter1', ...t })
  }

  /** CPL, -9..+5 dB, as AutoCreate writes it. */
  cpl(x: number, y: number, w: number, h: number, dn: string | null, j: number, t: Target, la = 64): Ctl {
    return this.ctl(3, x, y, w, h, dn, j, {
      mn: -9, mx: 5, mc: -1, sc: -1, lc: 0, la, tp: 'Config_Filter3', align: 130, ...t,
    })
  }

  /** An EQ enable switch: EQ 1, EQ 2, or the pair (Config_EqsEnabled). */
  eqSwitch(x: number, y: number, w: number, h: number, dn: string, j: number, t: Target, tp: string): Ctl {
    return this.ctl(4, x, y, w, h, dn, j, { mx: 1, mc: 10, sc: 10, flags: 262, tp, ...t })
  }

  /** R1's EQ control as AutoCreate's EQ view places it: 554 x 426. */
  eq(x: number, y: number, j: number, t: Target, bank: 1 | 2, w = 554, h = 426): Ctl {
    return this.ctl(6, x, y, w, h, null, j, { mx: 1, mc: -1, sc: -1, lc: 0, tp: `Config_Eq${bank}Enable`, ...t })
  }

  /** A live text box, such as the channel's name (Config_ChannelName). */
  display(x: number, y: number, w: number, h: number, dn: string | null, j: number, t: Target, tp: string, align = 129): Ctl {
    return this.ctl(9, x, y, w, h, dn, j, { mc: -1, sc: -1, lc: 1, la: 1, tp, align, ...t })
  }

  /** A picture, fields as templates.r2t's 27 room pictures (En-Space): TargetProperty NULL. */
  picture(x: number, y: number, w: number, h: number, j: number, pic: number): Ctl {
    return this.ctl(14, x, y, w, h, null, j, {
      mc: 1, sc: 1, lc: 1, flags: 38, act: 0, tt: -1, ti: 0, tc: -1, tp: null, tr: 65535, pic,
    })
  }

  finish(w: number, h: number): Page {
    this.page.w = w
    this.page.h = h
    return this.page
  }
}
