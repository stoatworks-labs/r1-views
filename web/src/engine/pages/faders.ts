// Faders and meters, in a frame per section, and a Master fader.  Each
// Left/Right pair (the first Left with the first Right, and so on) gets one
// linked fader with an L and an R output meter; a speaker without a partner,
// or every speaker when linking is off, gets a fader and meter of its own.
// The faders are as tall as the page allows.  With the extra options off this
// writes exactly what scripts/fader_view.py writes, linked or with --no-link
// (test/parity.test.ts).
//
// Linking: R1 can't tie two fader controls together, so each pair becomes a
// group, in a folder "<view> links" at the top of the tree (never inside
// Master, where a channel listed twice would be moved twice by the relative
// Master).  The pair's fader drives its group absolutely, so both sides
// follow it like a console's stereo link.
//
// Channel faders cover the amps' own range, -57.5 to +6 dB in 0.5 dB steps.
// Master and the section faders are relative faders on their groups over the
// same span, as AutoCreate builds "rel. Level": each moves its channels by the
// same amount, keeping their balance, and each channel stops at its limits.
import { PageBuilder, chan, group, newGroup, type Page, type Target } from '../page.ts'
import { sides, type Member, type Project, type Section } from '../project.ts'

const M = 16
const PAD = 12
const GAP = 12
const SG = 16
const METER_W = 18
const METER_GAP = 6
const IN_GAP = 4
const TITLE = 40
const LABEL = 22
const MUTE_ROW = 30
const MIN_STRIP = 80

export interface FadersOptions {
  name: string
  /** Page size in R1 pixels.  1680 x 900 fills a 16" MacBook Pro once R1's bars are off. */
  w: number
  h: number
  /** One fader per Left/Right pair, through a group per pair. */
  link: boolean
  /** A relative fader for each section, after its channels. */
  sectionFaders: boolean
  /** A mute under every fader. */
  mutes: boolean
  /** An input meter beside each output meter. */
  inMeters: boolean
}

export const fadersDefaults: FadersOptions = {
  name: 'Faders', w: 1680, h: 900, link: true, sectionFaders: false, mutes: false, inMeters: false,
}

type Side = Member & { side: 'L' | 'R' }
interface FaderStrip { label: string; members: Side[] }

const base = (n: string) => (n.endsWith(' L') || n.endsWith(' R') ? n.slice(0, -2) : n)
const single = (c: Side): FaderStrip => ({ label: c.name.endsWith(' L') || c.name.endsWith(' R') ? c.name : `${c.name} ${c.side}`, members: [c] })

/** fader_view.py's strips_for: one strip per linked pair, or per channel. */
export function stripsFor(s: Section, link: boolean): FaderStrip[] {
  const sd = sides(s)
  const L = sd.L.map((c): Side => ({ ...c, side: 'L' }))
  const R = sd.R.map((c): Side => ({ ...c, side: 'R' }))
  if (!link) return [...L, ...R].map(single)
  const out: FaderStrip[] = []
  for (let i = 0; i < Math.max(L.length, R.length); i++) {
    const pair = [L[i], R[i]].filter((c): c is Side => c != null)
    if (pair.length === 1) { out.push(single(pair[0])); continue }
    const l = base(pair[0].name), r = base(pair[1].name)
    out.push({ label: l === r ? `${l} L/R` : `${l} / ${r}`, members: pair })
  }
  return out
}

export function fadersPage(p: Project, sections: Section[], o: FadersOptions = fadersDefaults): Page {
  const b = new PageBuilder(o.name)
  const cols = sections.map((s) => ({ s, strips: stripsFor(s, o.link) }))
  const pairs = cols.some((c) => c.strips.some((st) => st.members.length > 1))
  const folder = pairs ? b.group(`${o.name} links`, 'root') : null

  const frames = cols.length + 1
  const strips = cols.reduce((n, c) => n + c.strips.length + (o.sectionFaders ? 1 : 0), 0) + 1
  const meters = pairs ? 2 : 1                       // output meters a strip has room for
  const inW = o.inMeters ? IN_GAP + METER_W : 0      // each input meter sits right of its output meter
  const minStrip = MIN_STRIP + meters * inW
  let stripW = Math.floor((o.w - 2 * M - (frames - 1) * GAP - frames * (2 * PAD - SG)) / strips)
  if (stripW < minStrip) stripW = minStrip
  const faderW = stripW - SG - meters * (METER_GAP + METER_W + inW)
  const top = M + TITLE
  const faderH = o.h - M - PAD - LABEL - top - (o.mutes ? MUTE_ROW : 0)
  const frameH = o.h - 2 * M

  const strip = (x: number, label: string, j: number, t: Target, relative: boolean, metered: { label: string; m: Member }[]) => {
    b.fader(x, top, faderW, faderH, label, j, t, undefined, undefined, relative)
    metered.forEach(({ label: ml, m }, k) => {
      const mx = x + faderW + METER_GAP + k * (METER_GAP + METER_W + inW)
      b.outMeter(mx, top, METER_W, faderH, ml, j, chan(m.dev, m.ch))
      if (o.inMeters) b.inMeter(mx + METER_W + IN_GAP, top, METER_W, faderH, 'In', j, chan(m.dev, m.ch))
    })
    // Master's mute asks first, as AutoCreate's does
    if (o.mutes) b.mute(x, top + faderH + LABEL + 2, stripW - SG, 24, 'Mute', j, t, t.tt === 0 && t.ng == null && t.ti === p.master.id)
  }

  let x = M
  const used = new Set<string>()
  for (const { s, strips: ss } of cols) {
    const n = ss.length + (o.sectionFaders ? 1 : 0)
    const fw = 2 * PAD + n * stripW - SG
    b.frame(x, M, fw, frameH, s.name, b.join(), 4)
    let sx = x + PAD
    for (const { label, members } of ss) {
      const j = b.join()
      if (members.length > 1) {
        const gname = used.has(label) ? `${s.name} ${label}` : label
        used.add(gname)
        const g = b.group(gname, folder!, members.map(({ name, dev, ch }) => ({ name, dev, ch })))
        strip(sx, label, j, newGroup(g), false, members.map((m) => ({ label: m.side, m })))
        b.page.notes.push(`${s.name} · ${label} · linked: ${members.map((m) => `${p.devices.get(m.dev)?.name ?? m.dev} ch${m.ch}`).join(' + ')}`)
      } else {
        const m = members[0]
        strip(sx, label, j, chan(m.dev, m.ch), false, [{ label: 'Out', m }])
        b.page.notes.push(`${s.name} · ${label} · ${p.devices.get(m.dev)?.name ?? m.dev} ch${m.ch}`)
      }
      sx += stripW
    }
    if (o.sectionFaders) strip(sx, `rel. ${s.name}`, b.join(), group(s.id), true, [])
    x += fw + GAP
  }
  const fw = 2 * PAD + stripW - SG
  const j = b.join()
  b.frame(x, M, fw, frameH, 'Master', j, 14)
  strip(x + PAD, 'Master', j, group(p.master.id), true, [])
  x += fw
  const linked = b.page.groups.length - (folder == null ? 0 : 1)
  b.page.notes.unshift(`Faders ${faderW} × ${faderH} px, ${(faderH / 127).toFixed(1)} px per 0.5 dB step` +
    (linked ? `; ${linked} linked pair${linked === 1 ? '' : 's'}, through new groups in "${o.name} links"` : ''))
  return b.finish(Math.max(o.w, x + M), o.h)
}
