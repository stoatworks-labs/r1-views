// Writes pages into a copy of a project.  The input bytes are never touched:
// sql.js opens its own copy, and export() hands back a new file.  Insert only
// (the project's triggers cascade deletes), as scripts/r1db.py does.
import type { Database, SqlJsStatic } from 'sql.js'
import { DIM, FONT, type Page } from './page.ts'
import { q, one, run } from './sql.ts'

/** Pictures.PictureData and Views.Icon are a QImage written by QDataStream:
 * a 32-bit 1 (0 for no image), then the image as PNG. */
export function qimage(png: Uint8Array): Uint8Array {
  const out = new Uint8Array(png.length + 4)
  out.set([0, 0, 0, 1])
  out.set(png, 4)
  return out
}

export interface Written {
  bytes: Uint8Array
  views: { id: number; name: string; controls: number }[]
  integrity: string
}

export function existingViewNames(db: Database): Set<string> {
  return new Set(q(db, 'select Name from Views').map((r) => String(r[0])))
}

/** Names of the new groups a page would put at the top of the tree that the
 * project already has (fader_view.py refuses those too). */
export function groupClashes(db: Database, page: Page): string[] {
  return page.groups.filter((g) => g.parent === 'root' && one(db, 'select 1 from Groups where Name=?', g.name)).map((g) => g.name)
}

/** Add one view to an open database.  Throws, writing nothing, if the name is taken. */
export function addPage(db: Database, page: Page): { id: number; controls: number } {
  if (one(db, 'select 1 from Views where Name=?', page.name)) {
    throw new Error(`The project already has a view called "${page.name}".`)
  }
  const clash = groupClashes(db, page)
  if (clash.length) throw new Error(`The project already has a group called "${clash[0]}".`)
  run(db, 'PRAGMA foreign_keys=OFF')
  const joined = (one(db, 'select coalesce(max(JoinedId),0) from Controls') as number) + 1
  const icon = one(db, 'select Icon from Views where Type=1000 order by length(Icon) limit 1')
  const hv = one(db, 'select coalesce(max(HomeViewIndex),0)+1 from Views where Type=1000') as number
  const nb = one(db, 'select coalesce(max(NaviBarIndex),0)+1 from Views') as number

  run(db, 'BEGIN')
  try {
    run(db, 'insert into Views(Type,Name,Icon,Flags,HomeViewIndex,NaviBarIndex,HRes,VRes,ZoomLevel) ' +
      'values(1000,?,?,6,?,?,?,?,100)', page.name, icon, hv, nb, page.w, page.h)
    const id = one(db, 'select last_insert_rowid()') as number

    const picIds = page.pictures.map((p) => {
      run(db, 'insert into Pictures(Name,Comment,PictureData) values(?,NULL,?)', `${p.name}`, qimage(p.day))
      const day = one(db, 'select last_insert_rowid()') as number
      if (p.night === p.day) return { day, night: day }
      run(db, 'insert into Pictures(Name,Comment,PictureData) values(?,NULL,?)', `${p.name} (night)`, qimage(p.night))
      return { day, night: one(db, 'select last_insert_rowid()') as number }
    })

    // the root of the group tree, as r1db.py finds it
    const root = (one(db, 'select GroupId from Groups where ParentId=0 and Type=0 order by GroupId') as number | null) ?? 0
    const groupIds: number[] = []
    for (const g of page.groups) {
      const parent = g.parent === 'root' ? root : groupIds[g.parent]
      run(db, 'insert into Groups(Name,ParentId,TargetId,TargetChannel,Type,Flags) values(?,?,0,-1,0,0)', g.name, parent)
      const gid = one(db, 'select last_insert_rowid()') as number
      for (const m of g.members) {
        run(db, 'insert into Groups(Name,ParentId,TargetId,TargetChannel,Type,Flags) values(?,?,?,?,1,0)', m.name, gid, m.dev, m.ch)
      }
      groupIds.push(gid)
    }

    const st = db.prepare(
      'insert into Controls(Type,PosX,PosY,Width,Height,ViewId,DisplayName,' +
      'UniqueName,JoinedId,LimitMin,LimitMax,MainColor,SubColor,LabelColor,' +
      'LabelFont,LabelAlignment,LineThickness,ThresholdValue,Flags,ActionType,' +
      'TargetType,TargetId,TargetChannel,TargetProperty,TargetRecord,' +
      'ConfirmOnMsg,ConfirmOffMsg,PictureIdDay,PictureIdNight,Font,Alignment,' +
      'Dimension,LogoId) values(?,?,?,?,?,?,?,NULL,?,?,?,?,?,?,5,?,0,?,?,?,?,?,?,?,?,' +
      '?,NULL,?,?,?,?,?,0)')
    try {
      for (const c of page.ctls) {
        const pic = c.pic == null ? { day: 0, night: 0 } : picIds[c.pic]
        st.run([c.t, c.x, c.y, c.w, c.h, id, c.dn, joined + c.j, c.mn, c.mx, c.mc, c.sc, c.lc, c.la,
          c.th, c.flags, c.act, c.tt, c.ng == null ? c.ti : groupIds[c.ng], c.tc, c.tp, c.tr, c.confirmOn, pic.day, pic.night,
          FONT, c.align, DIM])
      }
    } finally {
      st.free()
    }
    run(db, 'COMMIT')
    return { id, controls: page.ctls.length }
  } catch (e) {
    run(db, 'ROLLBACK')
    throw e
  }
}

/** A new project file: the input with every page added, in order. */
export function writePages(SQL: SqlJsStatic, input: Uint8Array, pages: Page[]): Written {
  const db = new SQL.Database(input)
  try {
    const views = pages.map((p) => ({ name: p.name, ...addPage(db, p) }))
    const integrity = String(one(db, 'pragma integrity_check'))
    return { bytes: db.export(), views, integrity }
  } finally {
    db.close()
  }
}
