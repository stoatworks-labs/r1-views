// sql.js in the browser: SQLite compiled to WebAssembly, served with the app.
import initSqlJs, { type SqlJsStatic } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

export function loadSql(): Promise<SqlJsStatic> {
  return initSqlJs({ locateFile: () => wasmUrl })
}
