// A synthetic R1 project: R1 3.46.1's schema (test/fixtures/schema-r1-3.46.1.sql,
// tables and triggers only, no venue) with made-up amps and groups.  Real
// project files stay out of git (AGENTS.md).
import { readFileSync } from 'node:fs'
import initSqlJs, { type SqlJsStatic } from 'sql.js'

let SQL: SqlJsStatic | undefined
export async function sql(): Promise<SqlJsStatic> {
  return (SQL ??= await initSqlJs())
}

const schema = readFileSync(new URL('./fixtures/schema-r1-3.46.1.sql', import.meta.url), 'utf8')

// a 1x1 PNG, standing in for a view thumbnail
export const PNG_1x1 = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'))

export interface FixtureOptions {
  /** Give one channel two cabinets, as some real rigs have. */
  twoCabinets?: boolean
  /** Leave out every D6, so every group is 10 s amps only. */
  noD6?: boolean
}

export async function fixture(o: FixtureOptions = {}): Promise<Uint8Array> {
  const SQL = await sql()
  const db = new SQL.Database()
  db.run('PRAGMA page_size=4096')
  db.exec(schema.split('\n').filter((l) => !l.startsWith('CREATE TABLE sqlite_sequence')).join('\n'))
  const r = (s: string, ...a: (string | number | Uint8Array | null)[]) => db.run(s, a)

  r("insert into ProjectInformation(ProjectName,ProjectDateTime,AuthorName,AuthorDateTime,Comment,Password," +
    "AppVersionR1,AppVersionArrayCalc,DbVersion) values('Synthetic hall','2026-11-05','test','2026-11-05',''," +
    "'','3.46.1','10.26.0','3.0')")
  const d6 = o.noD6 ? 'D20' : 'D6'
  const devices: [number, string, string, number, number][] = [
    [1, 'D20', 'Amp A', 1, 1], [2, d6, 'Amp B', 1, 2], [3, 'D20', 'Amp C', 1, 3], [4, d6, 'Amp D', 1, 4],
  ]
  for (const d of devices) r('insert into Devices(DeviceId,Model,Name,RemoteIdSubnet,RemoteIdDevice) values(?,?,?,?,?)', ...d)

  // dev, ch, name, speakerId, source group
  const chans: [number, number, string, number, number][] = [
    [1, 1, 'Main L', 10, 1], [1, 2, 'Main Sub', 20, 1], [1, 3, 'Main R', 10, 1], [1, 4, 'Main Sub', 20, 1],
    [2, 1, 'Out Fill', 11, 1], [2, 2, 'Fill R', 11, 1],
    [3, 1, 'Delay 1', 10, 2], [3, 2, 'Delay 2', 10, 2], [3, 3, 'Sub 3', 20, 2], [3, 4, 'Balcony', 20, 2],
    [4, 1, 'Lobby', 11, 1], [4, 2, 'Lobby', 11, 1],
  ]
  for (const [dev, ch, name, spk, sg] of chans) {
    r('insert into AmplifierChannels(DeviceId,AmplifierChannel,Name) values(?,?,?)', dev, ch, name)
    r('insert into Cabinets(DeviceId,AmplifierChannel,SpeakerId,SourceGroupId,PositionIndex,OrderIndex) values(?,?,?,?,1,1)',
      dev, ch, spk, sg)
  }
  if (o.twoCabinets) {
    r('insert into Cabinets(DeviceId,AmplifierChannel,SpeakerId,SourceGroupId,PositionIndex,OrderIndex) values(3,3,20,2,2,1)')
  }
  r("insert into SourceGroups(SourceGroupId,Type,Name,OrderIndex) values(1,4,'Group 1',0)")
  r("insert into SourceGroups(SourceGroupId,Type,Name,OrderIndex) values(2,1,'Array',1)")
  r("insert into ArrayProcessingSlots(SourceGroupId,Slot,Name) values(2,1,'Warm')")
  r("insert into ArrayProcessingSlots(SourceGroupId,Slot,Name) values(2,2,'Bright')")

  // the group tree: id, name, parent, type, dev, ch
  const groups: [number, string, number, number, number, number][] = [
    [1, 'Groups', 0, 0, 0, -1], [2, 'Master', 1, 0, 0, -1],
    [3, 'Tap 1', 2, 0, 0, -1],
    [4, 'Main L', 3, 1, 1, 1], [5, 'Main Sub', 3, 1, 1, 2], [6, 'Main R', 3, 1, 1, 3], [7, 'Main Sub', 3, 1, 1, 4],
    [8, 'Out Fill', 3, 1, 2, 1],
    [9, 'Tap 2', 2, 0, 0, -1],
    [10, 'Fill R', 9, 1, 2, 2], [11, 'Delay 1', 9, 1, 3, 1], [12, 'Delay 2', 9, 1, 3, 2],
    [13, 'Tap 10', 2, 0, 0, -1],
    [14, 'Lobby', 13, 1, 4, 1], [15, 'Lobby', 13, 1, 4, 2], [16, 'Sub 3', 13, 1, 3, 3],
    [17, 'Upstairs', 2, 0, 0, -1], [18, 'Balcony subs', 17, 0, 0, -1], [19, 'Balcony', 18, 1, 3, 4],
  ]
  for (const g of groups) r('insert into Groups(GroupId,Name,ParentId,Type,TargetId,TargetChannel,Flags) values(?,?,?,?,?,?,0)', ...g)

  const icon = new Uint8Array([0, 0, 0, 1, ...PNG_1x1])
  r("insert into Views(ViewId,Type,Name,Icon,Flags,HomeViewIndex,NaviBarIndex) values(1,1,'Home',?,2,-1,0)", new Uint8Array(4))
  r("insert into Views(ViewId,Type,Name,Icon,Flags,HomeViewIndex,NaviBarIndex) values(2,2,'Devices',?,2,0,3)", new Uint8Array(4))
  r("insert into Views(ViewId,Type,Name,Icon,Flags,HomeViewIndex,NaviBarIndex) values(3,3,'Groups',?,2,1,1)", new Uint8Array(4))
  r("insert into Views(ViewId,Type,Name,Icon,Flags,HomeViewIndex,NaviBarIndex,HRes,VRes,ZoomLevel) " +
    "values(1012,1000,'Overview',?,4,0,-1,1016,1016,100)", icon)
  // one control R1 would have put there, so JoinedId does not start at 1
  r("insert into Controls(Type,PosX,PosY,Width,Height,ViewId,DisplayName,JoinedId,LimitMin,LimitMax,MainColor," +
    "SubColor,LabelColor,LabelFont,LabelAlignment,LineThickness,ThresholdValue,Flags,ActionType,TargetType,TargetId," +
    "TargetChannel,TargetProperty,TargetRecord,PictureIdDay,PictureIdNight,Font,Alignment,Dimension,LogoId) " +
    "values(12,16,16,350,222,1012,'Master',7,0.0,0.0,14,1,19,5,64,0,0.0,70,0,-1,0,-1,NULL,65535,0,0," +
    "'Arial,12,-1,5,400,0,0,0,0,0,0,0,0,0,0,1',129,?,0)", new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255]))
  const bytes = db.export()
  db.close()
  return bytes
}
