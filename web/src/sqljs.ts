// sql.js in the browser: SQLite compiled to WebAssembly, served with the app.
import initSqlJs, { type SqlJsStatic } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

export function loadSql(): Promise<SqlJsStatic> {
  return initSqlJs({
    locateFile: () => wasmUrl,
    // sql.js defaults this to true, which keeps its legacy math and string
    // extension functions. @types/sql.js 1.16 declares the option required,
    // so it is spelled out here at its default. No query in this app calls
    // a SQL math or string function, so false would also work; that is the
    // behaviour sql.js's next major version makes the default.
    useOldExtensionFunctions: true,
  })
}
