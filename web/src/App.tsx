import { useEffect, useMemo, useState } from 'react'
import type { SqlJsStatic } from 'sql.js'
import { check, pageProblems, type CheckResult } from './engine/check.ts'
import type { Page } from './engine/page.ts'
import { defaultSections, folderTree, readProject, section, type Project } from './engine/project.ts'
import { SPEAKER_CARD, type Strip } from './engine/strips.ts'
import { writePages, type Written } from './engine/write.ts'
import { loadSql } from './sqljs.ts'
import { FloorplanEditor } from './ui/FloorplanEditor.tsx'
import { Preview } from './ui/Preview.tsx'
import { StripDesigner } from './ui/StripDesigner.tsx'
import {
  PAGE_KINDS, defaultConfigs, loadConfigs, loadStrips, makePage, saveConfigs, saveStrips, stripMap,
  type Configs, type PageKind,
} from './ui/state.ts'

type Tab = 'sections' | PageKind | 'designer' | 'build'
interface Loaded { name: string; bytes: Uint8Array; project: Project }

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

export default function App() {
  const [SQL, setSQL] = useState<SqlJsStatic | null>(null)
  const [file, setFile] = useState<Loaded | null>(null)
  const [error, setError] = useState('')
  const [sectionIds, setSectionIds] = useState<number[]>([])
  const [configs, setConfigs] = useState<Configs>(defaultConfigs)
  const [custom, setCustom] = useState<Strip[]>(loadStrips)
  const [tab, setTab] = useState<Tab>('sections')
  const [designerSel, setDesignerSel] = useState(SPEAKER_CARD.id)
  const [built, setBuilt] = useState<{ w: Written; c: CheckResult; url: string } | null>(null)

  useEffect(() => { loadSql().then(setSQL, (e) => setError(`Couldn't start SQLite: ${e}`)) }, [])
  useEffect(() => saveStrips(custom), [custom])
  useEffect(() => { if (file) saveConfigs(file.name, configs) }, [file, configs])
  useEffect(() => () => { if (built) URL.revokeObjectURL(built.url) }, [built])

  const open = async (f: File) => {
    if (!SQL) return
    setError('')
    setBuilt(null)
    try {
      const bytes = new Uint8Array(await f.arrayBuffer())
      const head = new TextDecoder().decode(bytes.slice(0, 15))
      if (head !== 'SQLite format 3') throw new Error(`${f.name} isn't an R1 project: a .dbpr is an SQLite file, and this isn't one.`)
      const db = new SQL.Database(bytes)
      let project: Project
      try {
        const tables = new Set(db.exec("select name from sqlite_master where type='table'")[0]?.values.map((r) => String(r[0])))
        for (const t of ['Views', 'Controls', 'Groups', 'Devices', 'AmplifierChannels']) {
          if (!tables.has(t)) throw new Error(`${f.name} has no ${t} table, so it isn't an R1 project this tool knows.`)
        }
        project = readProject(db)
      } finally {
        db.close()
      }
      if (!project.name || project.name === 'Untitled') project.name = f.name.replace(/\.dbpr$/i, '')
      setFile({ name: f.name, bytes, project })
      const defs = defaultSections(project)
      setSectionIds([...defs].sort((a, b) => natural(a.name, b.name)).map((s) => s.id))
      setConfigs(loadConfigs(f.name))
      setTab('sections')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const project = file?.project
  const strips = useMemo(() => stripMap(custom), [custom])
  const sections = useMemo(() => project
    ? sectionIds.map((id) => project.folders.get(id)).filter((f) => f != null).map(section)
    : [], [project, sectionIds])
  const pages = useMemo(() => {
    const out = new Map<PageKind, Page>()
    if (!project) return out
    for (const { kind } of PAGE_KINDS) {
      try { out.set(kind, makePage(kind, project, sections, configs, strips)) } catch (e) { console.error(kind, e) }
    }
    return out
  }, [project, sections, configs, strips])

  const enabled = PAGE_KINDS.filter((k) => configs[k.kind].enabled && pages.has(k.kind))
  const existing = new Set(project?.views.map((v) => v.name) ?? [])
  const nameProblem = (kind: PageKind): string | null => {
    const n = configs[kind].name.trim()
    if (!n) return 'needs a name'
    if (existing.has(n)) return `the project already has a view called "${n}"`
    if (enabled.some((k) => k.kind !== kind && configs[k.kind].name.trim() === n)) return `another page is also called "${n}"`
    const clash = pages.get(kind)?.groups.find((g) => g.parent === 'root' && project?.groupNames.has(g.name))
    if (clash) return `the project already has a group called "${clash.name}"; rename the page`
    return null
  }

  const build = () => {
    if (!SQL || !file) return
    try {
      const list = enabled.map((k) => pages.get(k.kind)!)
      const w = writePages(SQL, file.bytes, list)
      const c = check(SQL, w.bytes, file.bytes)
      if (built) URL.revokeObjectURL(built.url)
      const url = URL.createObjectURL(new Blob([w.bytes.slice()], { type: 'application/octet-stream' }))
      setBuilt({ w, c, url })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const set = <K extends PageKind>(kind: K, v: Partial<Configs[K]>) => {
    setConfigs((c) => ({ ...c, [kind]: { ...c[kind], ...v } }))
    setBuilt(null)
  }

  return (
    <div className="app">
      <header className="top">
        <h1>R1 Layout Builder</h1>
        <span className="tag">Remote views for d&amp;b R1 projects, built in your browser. Your project never leaves it.</span>
        <span className="ver">{__APP_VERSION__}</span>
        <button type="button" className="small" data-stoatworks-about>About</button>
      </header>

      {!file && <Drop onFile={open} ready={!!SQL} />}
      {error && <p className="error">{error}</p>}

      {file && project && <>
        <div className="project-bar">
          <strong>{project.name}</strong>
          <span className="dim">{file.name}</span>
          <span className="dim">{`${project.devices.size} amps · ${project.channels.size} channels · ${project.folders.size - 1} groups · ` +
            `${project.views.filter((v) => v.type === 1000).length} remote views · R1 ${project.r1Version || '?'}`}</span>
          {project.r1Version && project.r1Version !== '3.46.1' && <span className="warn">Only R1 3.46.1 files have been read so far</span>}
          <label className="file-btn small">Open another…<input type="file" accept=".dbpr" onChange={(e) => e.target.files?.[0] && open(e.target.files[0])} /></label>
        </div>

        <nav className="tabs">
          <TabBtn t="sections" cur={tab} set={setTab}>Sections</TabBtn>
          {/* The include box sits beside its tab, not inside it: a control inside a <button> is invalid HTML and
              browsers disagree on which of the two a click reaches. */}
          {PAGE_KINDS.map((k) => <span key={k.kind} className={'tab-pair' + (tab === k.kind ? ' on' : '')}>
            <input type="checkbox" checked={configs[k.kind].enabled} aria-label={`Include ${k.title}`}
              onChange={(e) => set(k.kind, { enabled: e.target.checked })} title="Include this page" />
            <TabBtn t={k.kind} cur={tab} set={setTab}>{k.title}</TabBtn>
          </span>)}
          <TabBtn t="designer" cur={tab} set={setTab}>Strip designer</TabBtn>
          <TabBtn t="build" cur={tab} set={setTab} accent>Build ({enabled.length})</TabBtn>
        </nav>

        {tab === 'sections' && <Sections project={project} ids={sectionIds} setIds={(ids) => { setSectionIds(ids); setBuilt(null) }} />}

        {PAGE_KINDS.map((k) => tab === k.kind && pages.get(k.kind) && (
          <PageTab key={k.kind} kind={k.kind} title={k.title} blurb={k.blurb} page={pages.get(k.kind)!} project={project}
            configs={configs} set={set} nameProblem={nameProblem(k.kind)} strips={strips} sections={sections}
            onDesign={(id) => { setDesignerSel(id); setTab('designer') }} />
        ))}

        {tab === 'designer' && <StripDesigner project={project} custom={custom} onChange={(s) => { setCustom(s); setBuilt(null) }}
          selected={designerSel} onSelect={setDesignerSel} />}

        {tab === 'build' && <section className="panel">
          <h2>Build</h2>
          <table className="summary">
            <thead><tr><th>Page</th><th>Size</th><th>Controls</th><th>Layout</th></tr></thead>
            <tbody>{enabled.map((k) => {
              const p = pages.get(k.kind)!
              const probs = pageProblems(p)
              const np = nameProblem(k.kind)
              return <tr key={k.kind}>
                <td>{configs[k.kind].name} <span className="dim small">({k.title})</span></td>
                <td>{p.w} × {p.h}</td><td>{p.ctls.length}</td>
                <td>{np ? <span className="bad">{np}</span> : probs.length ? <span className="bad">{probs.length} problem(s)</span> : <span className="ok">tidy</span>}</td>
              </tr>
            })}</tbody>
          </table>
          {enabled.length === 0 && <p>Tick at least one page.</p>}
          <button className="primary" disabled={!enabled.length || enabled.some((k) => nameProblem(k.kind))} onClick={build}>
            Build {file.name.replace(/\.dbpr$/i, '')} with {enabled.length} new view{enabled.length === 1 ? '' : 's'}</button>
          {built && <div className="result">
            {built.c.ok ? <p className="ok">Every check passed: nothing outside the new views changed, every control points at a real
              channel or group, and every control is one R1 offers.</p>
              : <><p className="bad">The check found problems. The file is below, but look at these first:</p>
                <ul className="problems">{built.c.problems.map((p, i) => <li key={i}>{p}</li>)}</ul></>}
            <ul>{built.c.views.map((v) => <li key={v.id}>View {v.id} <strong>{v.name}</strong>: {v.controls} controls, {v.w} × {v.h}</li>)}</ul>
            <a className="button primary" href={built.url} download={file.name.replace(/\.dbpr$/i, '') + ' + views.dbpr'}>
              Download {file.name.replace(/\.dbpr$/i, '')} + views.dbpr</a>
            <p className="note">R1 has not yet opened a file made by this tool. Open it in R1 (Configuration mode, offline) and look at every
              new view before it goes anywhere near a show. Your original file is unchanged.</p>
          </div>}
        </section>}
      </>}

      <footer className="dim small">Writes only new rows: views, their controls and, for a floorplan, its picture. Field values are copied from
        what R1 3.46.1 writes itself. Not made or checked by d&amp;b audiotechnik.</footer>
    </div>
  )
}

function TabBtn({ t, cur, set, children, accent }: { t: Tab; cur: Tab; set: (t: Tab) => void; children: React.ReactNode; accent?: boolean }) {
  return <button className={accent ? 'accent' : ''} aria-selected={t === cur} onClick={() => set(t)}>{children}</button>
}

function Drop({ onFile, ready }: { onFile: (f: File) => void; ready: boolean }) {
  const [over, setOver] = useState(false)
  return (
    <label className={`drop${over ? ' over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}>
      <input type="file" accept=".dbpr" disabled={!ready} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <strong>Drop an R1 project (.dbpr) here</strong>
      <span className="dim">or click to choose one. It's read here in the browser; nothing is uploaded.</span>
      <span className="dim small">You get a copy back with the new views added. The file you drop is never changed.</span>
    </label>
  )
}

function Sections({ project, ids, setIds }: { project: Project; ids: number[]; setIds: (ids: number[]) => void }) {
  const tree = folderTree(project).slice(1)
  const chosen = new Set(ids)
  const move = (i: number, d: number) => {
    const n = [...ids]
    ;[n[i], n[i + d]] = [n[i + d], n[i]]
    setIds(n)
  }
  return (
    <div className="cols">
      <section className="panel">
        <h2>Which groups are the sections?</h2>
        <p className="dim">Every page is built per section: a frame each, with its channels inside. A section holds every channel in the
          group and the groups under it. The default is Master's "Tap" groups, or every group directly under Master.</p>
        <ul className="tree">{tree.map((f) => {
          const n = section(f).members.length
          return <li key={f.id} style={{ paddingLeft: (f.depth - project.master.depth - 1) * 18 }}>
            <label className="check"><input type="checkbox" checked={chosen.has(f.id)}
              onChange={(e) => setIds(e.target.checked ? [...ids, f.id] : ids.filter((x) => x !== f.id))} />
              {f.name} <span className="dim small">{n} channel{n === 1 ? '' : 's'}</span></label>
          </li>
        })}</ul>
        {tree.length === 0 && <p>This project has no groups under Master yet. Make some in R1 first.</p>}
      </section>
      <section className="panel">
        <h2>In this order</h2>
        {ids.length === 0 && <p className="dim">None chosen.</p>}
        <ol className="order">{ids.map((id, i) => {
          const f = project.folders.get(id)
          if (!f) return null
          const s = section(f)
          const l = [...s.side.values()].filter((x) => x === 'L').length
          return <li key={id}>
            <span>{f.name}</span>
            <span className="dim small">{s.members.length} ch · {l} left, {s.members.length - l} right</span>
            <span className="grow" />
            <button disabled={i === 0} onClick={() => move(i, -1)} aria-label="Up">↑</button>
            <button disabled={i === ids.length - 1} onClick={() => move(i, 1)} aria-label="Down">↓</button>
          </li>
        })}</ol>
        <button onClick={() => setIds([...ids].sort((a, b) => natural(project.folders.get(a)!.name, project.folders.get(b)!.name)))}>Sort by name</button>
        <p className="dim small">Left and right: a channel whose name ends in " L" or " R" goes to that side. Otherwise the first half of a
          section's channels on one amp go left and the rest right. Rename channels in R1 to change it.</p>
      </section>
    </div>
  )
}

interface PageTabProps {
  kind: PageKind; title: string; blurb: string; page: Page; project: Project; configs: Configs
  set: <K extends PageKind>(k: K, v: Partial<Configs[K]>) => void
  nameProblem: string | null; strips: Map<string, Strip>; sections: ReturnType<typeof section>[]
  onDesign: (id: string) => void
}

function PageTab({ kind, title, blurb, page, project, configs, set, nameProblem, strips, sections, onDesign }: PageTabProps) {
  const problems = useMemo(() => pageProblems(page), [page])
  const flagged = useMemo(() => new Set(problems.flatMap((p) => p.idx)), [problems])
  const cfg = configs[kind]
  const chanStrips = [...strips.values()].filter((s) => s.target === 'channel')
  const groupStrips = [...strips.values()].filter((s) => s.target === 'group')
  const StripPick = ({ value, onChange, list, none }: { value: string; onChange: (v: string) => void; list: Strip[]; none?: boolean }) =>
    <span className="row"><select value={value} onChange={(e) => onChange(e.target.value)}>
      {none && <option value="">none</option>}
      {list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>{value && <button className="small" onClick={() => onDesign(value)}>Edit…</button>}</span>

  return (
    <div className="page-tab">
      <section className="panel options">
        <div className="row wrap">
          <h2>{title}</h2>
          <label className="check"><input type="checkbox" checked={cfg.enabled} onChange={(e) => set(kind, { enabled: e.target.checked })} />Include</label>
          <label>View name<input value={cfg.name} onChange={(e) => set(kind, { name: e.target.value })} /></label>
          {nameProblem && <span className="bad">{nameProblem}</span>}
        </div>
        <p className="dim">{blurb}</p>
        <div className="row wrap">
          {kind === 'master' && <>
            <label>Group strip<StripPick value={configs.master.groupStrip} list={groupStrips} onChange={(v) => set('master', { groupStrip: v })} /></label>
            <label>Channel strip<StripPick value={configs.master.channelStrip} list={chanStrips} onChange={(v) => set('master', { channelStrip: v })} /></label>
            <label>Channels per row<input type="number" min={1} max={12} value={configs.master.perRow} onChange={(e) => set('master', { perRow: Math.max(1, +e.target.value) })} /></label>
          </>}
          {kind === 'timing' && <>
            <label>Row<StripPick value={configs.timing.channelStrip} list={chanStrips} onChange={(v) => set('timing', { channelStrip: v })} /></label>
            <label>Header<StripPick value={configs.timing.groupStrip} list={groupStrips} onChange={(v) => set('timing', { groupStrip: v })} /></label>
            <label className="check"><input type="checkbox" checked={configs.timing.masterRow} onChange={(e) => set('timing', { masterRow: e.target.checked })} />Master row on top</label>
          </>}
          {kind === 'eq' && <>
            <label>Master EQ on<select value={configs.eq.masterBank} onChange={(e) => set('eq', { masterBank: +e.target.value as 1 | 2 })}>
              <option value={1}>EQ 1</option><option value={2}>EQ 2</option></select></label>
            <label>Section EQs on<select value={configs.eq.sectionBank} onChange={(e) => set('eq', { sectionBank: +e.target.value as 1 | 2 })}>
              <option value={1}>EQ 1</option><option value={2}>EQ 2</option></select></label>
            <label className="check"><input type="checkbox" checked={configs.eq.rows} onChange={(e) => set('eq', { rows: e.target.checked })} />A tuning row per channel</label>
            <label>Across<input type="number" min={1} max={4} value={configs.eq.perRow} onChange={(e) => set('eq', { perRow: Math.max(1, +e.target.value) })} /></label>
            <p className="dim small full">An EQ on a group writes the same curve to every channel in it; it doesn't add to theirs. Keep Master and
              the sections on different banks, or each overwrites the other. EQ 1 is the bank AutoCreate's EQ views use.</p>
          </>}
          {kind === 'faders' && <>
            <label>Width<input type="number" value={configs.faders.w} onChange={(e) => set('faders', { w: +e.target.value })} /></label>
            <label>Height<input type="number" value={configs.faders.h} onChange={(e) => set('faders', { h: +e.target.value })} /></label>
            <label className="check" title="R1 can't tie two faders together, so each pair gets a group, in a folder beside Master"><input type="checkbox" checked={configs.faders.link} onChange={(e) => set('faders', { link: e.target.checked })} />Link L/R pairs</label>
            <label className="check"><input type="checkbox" checked={configs.faders.sectionFaders} onChange={(e) => set('faders', { sectionFaders: e.target.checked })} />A fader per section</label>
            <label className="check"><input type="checkbox" checked={configs.faders.mutes} onChange={(e) => set('faders', { mutes: e.target.checked })} />Mutes</label>
            <label className="check"><input type="checkbox" checked={configs.faders.inMeters} onChange={(e) => set('faders', { inMeters: e.target.checked })} />Input meters</label>
          </>}
          {kind === 'strips' && <>
            <label>Channel strip<StripPick value={configs.strips.channelStrip} list={chanStrips} onChange={(v) => set('strips', { channelStrip: v })} /></label>
            <label>Group strip<StripPick value={configs.strips.groupStrip} list={groupStrips} none onChange={(v) => set('strips', { groupStrip: v })} /></label>
            <label>Columns<select value={String(configs.strips.columns)} onChange={(e) => set('strips', { columns: e.target.value === 'LR' ? 'LR' : +e.target.value })}>
              <option value="LR">Left and Right</option>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            <label>Gap<input type="number" min={0} max={40} value={configs.strips.gap} onChange={(e) => set('strips', { gap: Math.max(0, +e.target.value) })} /></label>
          </>}
        </div>
      </section>
      {kind === 'floorplan'
        ? <FloorplanEditor project={project} sections={sections} design={configs.floorplan} strips={strips}
          onChange={(d) => set('floorplan', d)} />
        : <section className="panel">
          <div className="row"><span className="dim small">{page.w} × {page.h} px · {page.ctls.length} controls</span></div>
          {problems.length > 0 && <ul className="problems">{problems.slice(0, 10).map((p, i) => <li key={i}>{p.text}</li>)}</ul>}
          <div className="preview-wrap"><Preview page={page} project={project} flagged={flagged} /></div>
          {page.notes.length > 0 && <details className="notes"><summary>What went where ({page.notes.length})</summary>
            <ul>{page.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></details>}
        </section>}
    </div>
  )
}
