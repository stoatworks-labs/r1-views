// Every (property, control type) pair the tool writes must be one R1 lists.
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PAIRS } from '../src/engine/catalogue.ts'
import { sql } from './fixture.ts'
import { readFileSync } from 'node:fs'

export const GUI = '/Applications/R1 V3.app/Contents/MacOS/GuiInfo.db'

describe.skipIf(!existsSync(GUI))('catalogue', () => {
  it('every pair is in R1’s ControlsAndFunctions', async () => {
    const SQL = await sql()
    const db = new SQL.Database(readFileSync(GUI))
    const have = new Set(db.exec('select ObjectName, ControlTypeId from ControlsAndFunctions')[0].values
      .map(([o, t]) => `${o}/${t}`))
    db.close()
    expect([...PAIRS].filter((p) => !have.has(p))).toEqual([])
  })
})
