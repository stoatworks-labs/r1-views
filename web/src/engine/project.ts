// What a page generator needs to know about an R1 project, read once from the
// .dbpr.  docs/FORMAT.md has the tables.  Nothing here writes.
import type { Database } from 'sql.js'
import { q, one } from './sql.ts'

export interface Device { id: number; model: string; name: string; remoteId: string }

/** An amp channel as a group lists it: Groups.Name of the Type 1 row. */
export interface Member { name: string; dev: number; ch: number }

export interface Channel extends Member {
  speakerId: number | null
  /** ArrayProcessing slots this channel can recall, via its cabinet's source group. */
  ap: { slot: number; name: string }[]
}

export interface Folder {
  id: number
  name: string
  parentId: number
  depth: number
  children: Folder[]
  /** Type 1 rows directly in this folder, by DeviceId then channel. */
  direct: Member[]
}

export interface Project {
  name: string
  r1Version: string
  devices: Map<number, Device>
  channels: Map<string, Channel>
  folders: Map<number, Folder>
  master: Folder
  views: { id: number; name: string; type: number }[]
  /** Every name in Groups, folders and channel rows alike (fader_view.py refuses a new folder whose name is taken). */
  groupNames: Set<string>
}

export const key = (dev: number, ch: number) => `${dev}/${ch}`

/** Longest delay each amp accepts, in ms.  D6 and D12 stop at 340 ms, which is
 * why R1's AutoCreate gives a group holding one a relative delay of ±339.5
 * (seen on a D20 and D6 rig) where an all-D40 project gets ±9999.5. */
export function maxDelay(model: string): number {
  return /^D(6|12)$/i.test(model.trim()) ? 340 : 10000
}

export function readProject(db: Database): Project {
  const devices = new Map<number, Device>()
  for (const [id, model, sub, rid, name] of q(db,
    'select DeviceId, Model, RemoteIdSubnet, RemoteIdDevice, Name from Devices')) {
    devices.set(id as number, {
      id: id as number, model: String(model ?? ''), name: String(name ?? ''),
      remoteId: `${sub}.${rid}`,
    })
  }

  const channels = new Map<string, Channel>()
  for (const [dev, ch, name] of q(db,
    'select DeviceId, AmplifierChannel, Name from AmplifierChannels order by DeviceId, AmplifierChannel')) {
    channels.set(key(dev as number, ch as number), {
      dev: dev as number, ch: ch as number, name: String(name ?? ''), speakerId: null, ap: [],
    })
  }
  // A channel can drive several cabinets (two per channel on one row of an all-D40 project), so take
  // each slot once.
  for (const [dev, ch, spk] of q(db,
    'select DeviceId, AmplifierChannel, min(SpeakerId) from Cabinets group by 1, 2')) {
    const c = channels.get(key(dev as number, ch as number))
    if (c) c.speakerId = spk as number
  }
  if (one(db, "select 1 from sqlite_master where name='ArrayProcessingSlots'")) {
    for (const [dev, ch, slot, sname] of q(db,
      'select distinct c.DeviceId, c.AmplifierChannel, s.Slot, s.Name from Cabinets c ' +
      'join ArrayProcessingSlots s on s.SourceGroupId = c.SourceGroupId order by s.Slot')) {
      const c = channels.get(key(dev as number, ch as number))
      if (c && !c.ap.some((a) => a.slot === slot)) c.ap.push({ slot: slot as number, name: String(sname ?? '') })
    }
  }

  const folders = new Map<number, Folder>()
  for (const [id, name, parent] of q(db,
    'select GroupId, Name, ParentId from Groups where Type=0 order by GroupId')) {
    folders.set(id as number, {
      id: id as number, name: String(name ?? ''), parentId: parent as number, depth: 0, children: [], direct: [],
    })
  }
  for (const f of folders.values()) folders.get(f.parentId)?.children.push(f)
  for (const [parent, name, dev, ch] of q(db,
    'select ParentId, Name, TargetId, TargetChannel from Groups where Type=1 order by TargetId, TargetChannel')) {
    folders.get(parent as number)?.direct.push({ name: String(name ?? ''), dev: dev as number, ch: ch as number })
  }
  const setDepth = (f: Folder, d: number) => { f.depth = d; f.children.forEach((c) => setDepth(c, d + 1)) }
  for (const f of folders.values()) if (!folders.has(f.parentId)) setDepth(f, 0)

  const masterId = one(db, "select GroupId from Groups where Name='Master' and Type=0")
  if (masterId == null) throw new Error('This project has no Master group, so it has no group tree to build pages from.')
  const master = folders.get(masterId as number)!

  const info = q(db, 'select ProjectName, AppVersionR1 from ProjectInformation order by AuthorDateTime desc limit 1')
  const views = q(db, 'select ViewId, Name, Type from Views order by ViewId')
    .map(([id, name, type]) => ({ id: id as number, name: String(name ?? ''), type: type as number }))

  return {
    name: String(info[0]?.[0] ?? ''), r1Version: String(info[0]?.[1] ?? ''),
    devices, channels, folders, master, views,
    groupNames: new Set(q(db, 'select distinct Name from Groups').map((r) => String(r[0]))),
  }
}

/** Every channel in a folder and the folders under it, once, by DeviceId then channel. */
export function membersOf(f: Folder): Member[] {
  const seen = new Map<string, Member>()
  const walk = (g: Folder) => {
    for (const m of g.direct) if (!seen.has(key(m.dev, m.ch))) seen.set(key(m.dev, m.ch), m)
    g.children.forEach(walk)
  }
  walk(f)
  return [...seen.values()].sort((a, b) => a.dev - b.dev || a.ch - b.ch)
}

export type Side = 'L' | 'R'

export interface Section {
  id: number
  name: string
  members: Member[]
  side: Map<string, Side>
}

/** A section's channels, Left and Right.  A name ending " L" or " R" decides;
 * otherwise the first half of the section's channels on one amp go Left and
 * the rest Right (scripts/r1db.py View.taps does the same). */
export function section(f: Folder): Section {
  const members = membersOf(f)
  const perDev = new Map<number, number[]>()
  for (const m of members) perDev.set(m.dev, [...(perDev.get(m.dev) ?? []), m.ch])
  const side = new Map<string, Side>()
  for (const m of members) {
    let s: Side
    if (m.name.endsWith(' L')) s = 'L'
    else if (m.name.endsWith(' R')) s = 'R'
    else {
      const chs = perDev.get(m.dev)!
      s = chs.indexOf(m.ch) < Math.floor((chs.length + 1) / 2) ? 'L' : 'R'
    }
    side.set(key(m.dev, m.ch), s)
  }
  return { id: f.id, name: f.name, members, side }
}

export function sides(s: Section): Record<Side, Member[]> {
  return {
    L: s.members.filter((m) => s.side.get(key(m.dev, m.ch)) === 'L'),
    R: s.members.filter((m) => s.side.get(key(m.dev, m.ch)) === 'R'),
  }
}

/** Python's ORDER BY Name: SQLite's BINARY collation, byte order of UTF-8. */
function binaryCompare(a: string, b: string): number {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b)
  for (let i = 0; i < Math.min(ea.length, eb.length); i++) if (ea[i] !== eb[i]) return ea[i] - eb[i]
  return ea.length - eb.length
}

/** The default sections: Master's "Tap…" folders by name, as the Taps script
 * picks them, or every folder directly under Master when there are none. */
export function defaultSections(p: Project): Folder[] {
  const taps = p.master.children.filter((c) => /^tap/i.test(c.name))
  if (taps.length) return [...taps].sort((a, b) => binaryCompare(a.name, b.name))
  return p.master.children
}

/** Folder ids in tree order under Master, for a picker. */
export function folderTree(p: Project): Folder[] {
  const out: Folder[] = []
  const walk = (f: Folder) => { out.push(f); f.children.forEach(walk) }
  walk(p.master)
  return out
}

export function deviceOf(p: Project, dev: number): Device | undefined {
  return p.devices.get(dev)
}

/** The smallest maximum delay of the amps behind these channels. */
export function delayCeiling(p: Project, members: Member[]): number {
  let lim = 10000
  for (const m of members) lim = Math.min(lim, maxDelay(p.devices.get(m.dev)?.model ?? ''))
  return lim
}

/** True when every channel drives the same loudspeaker (one SpeakerId), so a
 * group-wide CUT or CPL switches one kind of filter rather than a top's CUT and
 * a sub's 100 Hz at once. */
export function oneSpeakerType(p: Project, members: Member[]): boolean {
  const ids = new Set(members.map((m) => p.channels.get(key(m.dev, m.ch))?.speakerId ?? null))
  return ids.size === 1 && !ids.has(null)
}
