// scripts/check.py, in the browser: the new file against the one it came from.
// It fails if anything outside the new views changed (new groups are allowed,
// for linked faders, but must hang off existing groups, list real channels and
// stay out of Master; new pictures only if a new Picture control uses them),
// a control points at a
// channel or group that doesn't exist, R1 has no such property for that
// control type, or controls overlap or stray outside their frames.  A Picture
// is a background, so it may sit under other controls.  Passing means the
// file is consistent, not that R1 accepts it.
import type { Database, SqlJsStatic } from 'sql.js'
import { q } from './sql.ts'
import { PAIRS } from './catalogue.ts'
import type { Ctl, Page } from './page.ts'

export interface CheckResult {
  ok: boolean
  problems: string[]
  views: { id: number; name: string; controls: number; w: number; h: number }[]
}

export function check(SQL: SqlJsStatic, newBytes: Uint8Array, oldBytes: Uint8Array): CheckResult {
  const nu = new SQL.Database(newBytes)
  const old = new SQL.Database(oldBytes)
  try {
    return compare(nu, old)
  } finally {
    nu.close()
    old.close()
  }
}

const rowKey = (r: unknown[]) => JSON.stringify(r, (_k, v) => (v instanceof Uint8Array ? `blob:${Array.from(v).join(',')}` : v))

function compare(nu: Database, old: Database): CheckResult {
  const bad: string[] = []
  const oldViews = new Set(q(old, 'select ViewId from Views').map((r) => r[0] as number))
  const views = q(nu, 'select ViewId, Name, HRes, VRes from Views')
    .filter((r) => !oldViews.has(r[0] as number))
    .map(([id, name, w, h]) => ({ id: id as number, name: String(name), w: w as number, h: h as number, controls: 0 }))
  if (!views.length) return { ok: false, problems: ['no new view found'], views }
  const ids = new Set(views.map((v) => v.id))
  const newPics = new Set<number>()
  for (const v of views) {
    for (const [d, n] of q(nu, 'select PictureIdDay, PictureIdNight from Controls where ViewId=?', v.id)) {
      if (d) newPics.add(d as number)
      if (n) newPics.add(n as number)
    }
  }

  const oldGroups = new Set(q(old, 'select GroupId from Groups').map((r) => r[0] as number))

  // 1. only Views, Controls, Pictures and Groups may differ, and only by new rows
  const tables = q(nu, "select name from sqlite_master where type='table' and name<>'sqlite_sequence'").map((r) => String(r[0]))
  for (const t of tables) {
    const a = q(old, `select rowid, * from "${t}"`)
    const bRows = q(nu, `select rowid, * from "${t}"`)
    const oldSet = new Set(a.map((r) => rowKey(r.slice(1))))
    const newSet = new Set(bRows.map((r) => rowKey(r.slice(1))))
    const gone = a.filter((r) => !newSet.has(rowKey(r.slice(1)))).length
    let extra = bRows.filter((r) => !oldSet.has(rowKey(r.slice(1))))
    if (t === 'Views') extra = extra.filter((r) => !ids.has(r[1] as number))
    if (t === 'Controls') extra = extra.filter((r) => !ids.has(r[7] as number))
    if (t === 'Pictures') extra = extra.filter((r) => !newPics.has(r[1] as number))
    if (t === 'Groups') extra = extra.filter((r) => oldGroups.has(r[1] as number))   // new groups may be added, old ones not touched
    if (extra.length || gone) bad.push(`${t}: ${extra.length} rows added or changed, ${gone} removed outside the new views`)
  }

  // 2. added groups hang off real groups, list real channels, and stay out of
  // Master (a channel twice under Master would be moved twice by a relative Master)
  const parent = new Map(q(nu, 'select GroupId, ParentId from Groups').map((r) => [r[0] as number, r[1] as number]))
  const gtype = new Map(q(nu, 'select GroupId, Type from Groups').map((r) => [r[0] as number, r[1] as number]))
  const master = new Set(q(nu, "select GroupId from Groups where Name='Master' and Type=0").map((r) => r[0] as number))
  const chanSet = new Set(q(nu, 'select DeviceId, AmplifierChannel from AmplifierChannels').map((r) => `${r[0]}/${r[1]}`))
  for (const [gid, gname, par, gt, ti, tc] of q(nu, 'select GroupId, Name, ParentId, Type, TargetId, TargetChannel from Groups')) {
    if (oldGroups.has(gid as number)) continue
    const label = `group ${gid} "${gname}"`
    if (!parent.has(par as number)) bad.push(`${label}: parent ${par} does not exist`)
    if (gt === 1 && !chanSet.has(`${ti}/${tc}`)) bad.push(`${label}: no amp channel ${ti}/${tc}`)
    if (gt === 1 && gtype.get(par as number) !== 0) bad.push(`${label}: a channel must sit in a group, not in a channel`)
    for (let a = par as number | undefined, seen = new Set<number>(); a && !seen.has(a); seen.add(a), a = parent.get(a)) {
      if (master.has(a)) { bad.push(`${label}: added under Master`); break }
    }
  }

  const channels = new Set(q(nu, 'select DeviceId, AmplifierChannel from AmplifierChannels').map((r) => `${r[0]}/${r[1]}`))
  const groups = new Set(q(nu, 'select GroupId from Groups').map((r) => r[0] as number))
  const pictures = new Set(q(nu, 'select PictureId from Pictures').map((r) => r[0] as number))
  const ap = new Set(q(nu, 'select c.DeviceId, c.AmplifierChannel, s.Slot from Cabinets c join ArrayProcessingSlots s on ' +
    's.SourceGroupId=c.SourceGroupId').map((r) => `${r[0]}/${r[1]}/${r[2]}`))

  for (const v of views) {
    const rows = q(nu, 'select ControlId, Type, PosX, PosY, Width, Height, TargetType, TargetId, TargetChannel, ' +
      'TargetProperty, TargetRecord, PictureIdDay, PictureIdNight from Controls where ViewId=?', v.id)
      .map(([cid, t, x, y, w, h, tt, ti, tc, tp, tr, pd, pn]) => ({
        cid: cid as number, t: t as number, x: x as number, y: y as number, w: w as number, h: h as number,
        tt: tt as number, ti: ti as number, tc: tc as number, tp: tp as string | null, tr: tr as number,
        pd: pd as number, pn: pn as number,
      }))
    v.controls = rows.length
    for (const r of rows) {
      if (r.tp?.startsWith('ArrayProcessing_') && !ap.has(`${r.ti}/${r.tc}/${r.tr}`)) {
        bad.push(`control ${r.cid}: channel ${r.ti}/${r.tc} has no AP slot ${r.tr}`)
      }
      if (r.tt === 2 && !channels.has(`${r.ti}/${r.tc}`)) bad.push(`control ${r.cid}: no amp channel ${r.ti}/${r.tc}`)
      if (r.tt === 0 && !groups.has(r.ti)) bad.push(`control ${r.cid}: no group ${r.ti}`)
      if (r.tp && !PAIRS.has(`${r.tp}/${r.t}`)) bad.push(`control ${r.cid}: R1 has no type-${r.t} control for ${r.tp}`)
      if (r.t === 14 && (!pictures.has(r.pd) || !pictures.has(r.pn))) bad.push(`control ${r.cid}: its picture is missing`)
      if (r.x < 0 || r.y < 0 || r.x + r.w > v.w || r.y + r.h > v.h) bad.push(`control ${r.cid}: outside the ${v.w}x${v.h} canvas`)
    }
    const ctl = rows.filter((r) => r.t !== 12)
    const solid = ctl.filter((r) => r.t !== 14)
    const frames = rows.filter((r) => r.t === 12)
    solid.forEach((a, i) => {
      for (const o of solid.slice(i + 1)) {
        if (a.x < o.x + o.w && o.x < a.x + a.w && a.y < o.y + o.h && o.y < a.y + a.h) bad.push(`controls ${a.cid} and ${o.cid} overlap`)
      }
    })
    for (const a of ctl) {
      if (!frames.some((f) => f.x <= a.x && f.y <= a.y && a.x + a.w <= f.x + f.w && a.y + a.h <= f.y + f.h)) {
        bad.push(`control ${a.cid}: not inside any frame`)
      }
    }
  }
  const integrity = String(q(nu, 'pragma integrity_check')[0][0])
  if (integrity !== 'ok') bad.push('sqlite integrity_check failed')
  return { ok: !bad.length, problems: bad, views }
}

/** The layout half of the check, on a page before it is written: overlaps,
 * controls off the canvas or outside every frame.  For the editor. */
export function pageProblems(page: Page): { text: string; idx: number[] }[] {
  const out: { text: string; idx: number[] }[] = []
  const c = page.ctls.map((x, i) => ({ ...x, i }))
  const frames = c.filter((x) => x.t === 12)
  const solid = c.filter((x) => x.t !== 12 && x.t !== 14)
  for (const a of c) {
    if (a.x < 0 || a.y < 0 || a.x + a.w > page.w || a.y + a.h > page.h) out.push({ text: `${what(a)} is off the page`, idx: [a.i] })
  }
  solid.forEach((a, k) => {
    for (const o of solid.slice(k + 1)) {
      if (a.x < o.x + o.w && o.x < a.x + a.w && a.y < o.y + o.h && o.y < a.y + a.h) {
        out.push({ text: `${what(a)} overlaps ${what(o)}`, idx: [a.i, o.i] })
      }
    }
  })
  for (const a of c.filter((x) => x.t !== 12)) {
    if (!frames.some((f) => f.x <= a.x && f.y <= a.y && a.x + a.w <= f.x + f.w && a.y + a.h <= f.y + f.h)) {
      out.push({ text: `${what(a)} is not inside a frame`, idx: [a.i] })
    }
  }
  return out
}

const TYPE_NAMES: Record<number, string> = {
  1: 'Channel', 2: 'Fader', 3: 'Number box', 4: 'Switch', 5: 'List', 6: 'EQ', 7: 'Meter', 8: 'Lamp', 9: 'Display',
  11: 'Text', 12: 'Frame', 14: 'Picture',
}
function what(c: Ctl): string {
  return `${TYPE_NAMES[c.t] ?? `type ${c.t}`}${c.dn ? ` "${c.dn}"` : ''} at ${c.x},${c.y}`
}
