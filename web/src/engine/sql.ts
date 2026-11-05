// A thin layer over sql.js: rows as arrays, as Python's sqlite3 hands them back.
import type { Database, SqlValue } from 'sql.js'

export type Row = SqlValue[]

export function q(db: Database, sql: string, ...args: SqlValue[]): Row[] {
  const st = db.prepare(sql)
  try {
    if (args.length) st.bind(args)
    const out: Row[] = []
    while (st.step()) out.push(st.get())
    return out
  } finally {
    st.free()
  }
}

export function one(db: Database, sql: string, ...args: SqlValue[]): SqlValue {
  const r = q(db, sql, ...args)
  return r.length ? r[0][0] : null
}

export function run(db: Database, sql: string, ...args: SqlValue[]): void {
  db.run(sql, args)
}
