// Design a strip: place controls on a card, then use the card on the Strips,
// Timing and Master pages or as a floorplan tile.
import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { PageBuilder } from '../engine/page.ts'
import { membersOf, type Project } from '../engine/project.ts'
import {
  BUILTIN_STRIPS, KINDS, drawStrip, kindOf, stripHeight, stripProblems, type Strip, type StripElement,
} from '../engine/strips.ts'
import { Preview } from './Preview.tsx'

const SNAP = 2
const snap = (v: number) => Math.round(v / SNAP) * SNAP

export interface DesignerProps {
  project: Project
  custom: Strip[]
  onChange: (s: Strip[]) => void
  selected: string
  onSelect: (id: string) => void
}

type Drag = { kind: 'move' | 'size' | 'strip'; idx: number; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number }

export function StripDesigner({ project, custom, onChange, selected, onSelect }: DesignerProps) {
  const all = [...BUILTIN_STRIPS, ...custom]
  const strip = all.find((s) => s.id === selected) ?? BUILTIN_STRIPS[0]
  const builtin = BUILTIN_STRIPS.some((s) => s.id === strip.id)
  const [sel, setSel] = useState<number | null>(null)
  const drag = useRef<Drag | null>(null)
  const svgWrap = useRef<HTMLDivElement>(null)
  const scale = 1.25

  const update = (s: Strip) => onChange(custom.map((c) => (c.id === s.id ? s : c)))
  const setEl = (i: number, e: Partial<StripElement>) =>
    update({ ...strip, elements: strip.elements.map((x, k) => (k === i ? { ...x, ...e } : x)) })

  // a sample to draw it for: the first channel, or the first group under Master
  const sample = useMemo(() => {
    const first = [...project.channels.values()][0]
    const g = project.master.children[0] ?? project.master
    return strip.target === 'channel'
      ? { p: project, members: first ? [first] : [], name: first?.name ?? 'Channel', side: 'L' as const }
      : { p: project, members: membersOf(g), groupId: g.id, name: g.name }
  }, [project, strip.target])

  const page = useMemo(() => {
    const b = new PageBuilder(strip.name)
    const pad = 24
    if (sample.members.length) drawStrip(b, strip, pad, pad, sample)

    return b.finish(strip.w + pad * 2 + 60, stripHeight(strip, project) + pad * 2 + 20)
  }, [strip, sample, project])

  // the engine's problems, plus labels that may run into another control
  const problems = [...stripProblems(strip), ...labelClashes(strip)]

  const toR1 = (e: RPointerEvent) => {
    const r = svgWrap.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }
  }
  const start = (kind: Drag['kind'], idx: number) => (e: RPointerEvent) => {
    if (builtin) return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const p = toR1(e)
    const el = strip.elements[idx]
    drag.current = { kind, idx, sx: p.x, sy: p.y, ox: el?.x ?? 0, oy: el?.y ?? 0, ow: kind === 'strip' ? strip.w : el.w, oh: kind === 'strip' ? strip.h : el.h }
    if (kind !== 'strip') setSel(idx)
  }
  const move = (e: RPointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = toR1(e)
    const dx = p.x - d.sx, dy = p.y - d.sy
    if (d.kind === 'move') setEl(d.idx, { x: Math.max(0, snap(d.ox + dx)), y: Math.max(0, snap(d.oy + dy)) })
    else if (d.kind === 'size') setEl(d.idx, { w: Math.max(8, snap(d.ow + dx)), h: Math.max(8, snap(d.oh + dy)) })
    else update({ ...strip, w: Math.max(40, snap(d.ow + dx)), h: Math.max(24, snap(d.oh + dy)) })
  }
  const end = () => { drag.current = null }

  const add = (kind: string) => {
    const k = kindOf(kind)
    const size = (e: StripElement) => { const kk = kindOf(e.kind); return kk.fixed ? { w: kk.w, h: kk.h } : { w: e.w, h: e.h } }
    // the first gap that takes it and its label, with room around; else to the right
    const top = strip.frame ? 36 : 4
    const mine = labelled({ kind, x: 0, y: 0, w: k.w, h: k.h, label: k.label }, k.w, k.h)
    const taken = strip.elements.map((o) => labelled(o, size(o).w, size(o).h))
    const free = (x: number, y: number) => {
      const a = { x: x + mine.x, y: y + mine.y, w: mine.w, h: mine.h }
      return x + mine.x >= 4 && x + k.w <= strip.w - 8 && y + k.h <= strip.h - 4 &&
        !taken.some((o) => a.x < o.x + o.w + 8 && o.x < a.x + a.w + 8 && a.y < o.y + o.h + 6 && o.y < a.y + a.h + 6)
    }
    let at: { x: number; y: number } | null = null
    for (let y = top; !at && y + k.h <= strip.h; y += 4) for (let x = 12; x + k.w <= strip.w; x += 4) if (free(x, y)) { at = { x, y }; break }
    if (!at) at = { x: strip.elements.reduce((m, o) => Math.max(m, o.x + size(o).w), 0) + 16, y: top }
    const e: StripElement = { kind, x: at.x, y: at.y, w: k.w, h: k.h, label: k.label }
    const grow = { w: Math.max(strip.w, e.x + k.w + 12), h: Math.max(strip.h, e.y + k.h + 8) }
    update({ ...strip, ...grow, elements: [...strip.elements, e] })
    setSel(strip.elements.length)
  }

  const newStrip = (target: 'channel' | 'group', from?: Strip) => {
    const base: Strip = from
      ? { ...structuredClone(from), name: `${from.name} copy` }
      : { id: '', name: target === 'channel' ? 'My channel strip' : 'My group strip', target, w: 320, h: 120, frame: true,
        title: '{name}', apRow: false, elements: [] }
    const s = { ...base, id: `custom-${Date.now().toString(36)}` }
    onChange([...custom, s])
    onSelect(s.id)
    setSel(null)
  }

  const keys = (e: React.KeyboardEvent) => {
    if (builtin || sel == null || (e.target as HTMLElement).tagName === 'INPUT') return
    const step = e.shiftKey ? 10 : 1
    const el = strip.elements[sel]
    const mv: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (mv[e.key]) { e.preventDefault(); setEl(sel, { x: Math.max(0, el.x + mv[e.key][0]), y: Math.max(0, el.y + mv[e.key][1]) }) }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      update({ ...strip, elements: strip.elements.filter((_, k) => k !== sel) })
      setSel(null)
    }
  }

  const el = sel != null ? strip.elements[sel] : undefined
  const k = el ? kindOf(el.kind) : undefined
  const pad = 24

  return (
    <div className="designer" onKeyDown={keys} tabIndex={-1}>
      <aside className="panel strip-list">
        <h3>Strips</h3>
        <p className="dim small">Built in</p>
        {BUILTIN_STRIPS.map((s) => <StripItem key={s.id} s={s} active={s.id === strip.id} onClick={() => { onSelect(s.id); setSel(null) }} />)}
        <p className="dim small">Yours</p>
        {custom.length === 0 && <p className="dim small">None yet. Duplicate one above or start fresh.</p>}
        {custom.map((s) => <StripItem key={s.id} s={s} active={s.id === strip.id} onClick={() => { onSelect(s.id); setSel(null) }} />)}
        <div className="row wrap">
          <button onClick={() => newStrip('channel')}>New channel strip</button>
          <button onClick={() => newStrip('group')}>New group strip</button>
        </div>
      </aside>

      <section className="panel strip-canvas">
        <div className="row">
          <h3>{strip.name}</h3>
          <span className="pill">{strip.target === 'channel' ? 'per channel' : 'per group'}</span>
          <span className="dim small">{strip.w} × {stripHeight(strip, project)} px</span>
          <span className="grow" />
          <button onClick={() => newStrip(strip.target, strip)}>Duplicate{builtin ? ' to edit' : ''}</button>
          {!builtin && <button className="danger" onClick={() => {
            onChange(custom.filter((c) => c.id !== strip.id)); onSelect(BUILTIN_STRIPS[0].id); setSel(null)
          }}>Delete</button>}
        </div>
        {builtin && <p className="note">Built-in strips can't be changed. Duplicate one to make it yours.</p>}
        <div className="canvas-wrap" ref={svgWrap} onPointerMove={move} onPointerUp={end} onPointerDown={() => setSel(null)}>
          <Preview page={page} project={project} scale={scale}>
            <g transform={`translate(${pad} ${pad})`}>
              <rect x={0} y={0} width={strip.w} height={stripHeight(strip, project)} fill="none"
                stroke={strip.frame ? 'none' : '#5fb0d8'} strokeDasharray="4 4" />
              {strip.elements.map((e, i) => {
                const kk = KINDS.find((x) => x.kind === e.kind)
                const w = kk?.fixed ? kk.w : e.w, h = kk?.fixed ? kk.h : e.h
                return <g key={i}>
                  <rect x={e.x} y={e.y} width={w} height={h} className={`hit${i === sel ? ' sel' : ''}`}
                    onPointerDown={start('move', i)} />
                  {i === sel && !kk?.fixed && !builtin &&
                    <rect x={e.x + w - 5} y={e.y + h - 5} width={10} height={10} className="handle" onPointerDown={start('size', i)} />}
                </g>
              })}
              {!builtin && <rect x={strip.w - 6} y={stripHeight(strip, project) - 6} width={12} height={12} className="handle strip-handle"
                onPointerDown={start('strip', -1)} />}
            </g>
          </Preview>
        </div>
        {problems.length > 0 && <ul className="problems">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
        {!builtin && <>
          <h4>Add a control</h4>
          <div className="palette">
            {KINDS.filter((x) => x.targets.includes(strip.target)).map((x) =>
              <button key={x.kind} title={x.help} onClick={() => add(x.kind)}>{x.title}</button>)}
          </div>
          <p className="dim small">Drag to move, drag the corner to resize, arrow keys nudge (Shift for 10), Delete removes.
            Labels R1 draws outside a control (left of a number box, under a meter) aren't part of its box, so leave room for them.</p>
        </>}
      </section>

      <aside className="panel inspector">
        {el && k ? <>
          <h3>{k.title}</h3>
          <p className="dim small">{k.help}</p>
          <div className="grid2">
            <label>X<input type="number" value={el.x} disabled={builtin} onChange={(e) => setEl(sel!, { x: +e.target.value })} /></label>
            <label>Y<input type="number" value={el.y} disabled={builtin} onChange={(e) => setEl(sel!, { y: +e.target.value })} /></label>
            <label>Width<input type="number" value={k.fixed ? k.w : el.w} disabled={builtin || k.fixed} onChange={(e) => setEl(sel!, { w: +e.target.value })} /></label>
            <label>Height<input type="number" value={k.fixed ? k.h : el.h} disabled={builtin || k.fixed} onChange={(e) => setEl(sel!, { h: +e.target.value })} /></label>
          </div>
          {k.fixed && <p className="dim small">R1 draws this at one size only.</p>}
          <label>Label<input value={el.label ?? ''} disabled={builtin} placeholder="none"
            onChange={(e) => setEl(sel!, { label: e.target.value === '' ? null : e.target.value })} /></label>
          {(k.t === 3 || k.t === 5 || k.t === 7 || k.t === 9) && <label>Label goes
            <select value={el.labelPos ?? ''} disabled={builtin} onChange={(e) => setEl(sel!, { labelPos: e.target.value === '' ? undefined : +e.target.value })}>
              <option value="">{k.labelPos === 1 ? 'left (default)' : 'below (default)'}</option>
              <option value="1">left</option><option value="64">below</option>
            </select></label>}
          {!builtin && <button className="danger" onClick={() => { update({ ...strip, elements: strip.elements.filter((_, i) => i !== sel) }); setSel(null) }}>Remove</button>}
        </> : <>
          <h3>Strip</h3>
          <label>Name<input value={strip.name} disabled={builtin} onChange={(e) => update({ ...strip, name: e.target.value })} /></label>
          <div className="grid2">
            <label>Width<input type="number" value={strip.w} disabled={builtin} onChange={(e) => update({ ...strip, w: +e.target.value })} /></label>
            <label>Height<input type="number" value={strip.h} disabled={builtin} onChange={(e) => update({ ...strip, h: +e.target.value })} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={strip.frame} disabled={builtin}
            onChange={(e) => update({ ...strip, frame: e.target.checked })} />In its own frame</label>
          {strip.frame && <label>Title<input value={strip.title} disabled={builtin} onChange={(e) => update({ ...strip, title: e.target.value })} /></label>}
          <p className="dim small">In titles and labels: {'{name}'}, {'{side}'} (Left/Right), {'{amp}'}, {'{ch}'}, {'{remote}'}, {'{filter1}'} (CUT, or 100Hz when the name says sub).</p>
          {strip.target === 'channel' && <label className="check"><input type="checkbox" checked={strip.apRow} disabled={builtin}
            onChange={(e) => update({ ...strip, apRow: e.target.checked })} />A row of ArrayProcessing lamps underneath, when the project has slots</label>}
          <p className="dim small">Without a frame, a strip's controls join the section's frame; a row of them reads like a table.</p>
        </>}
      </aside>
    </div>
  )
}

function labelClashes(s: Strip): string[] {
  const out: string[] = []
  const box = (e: StripElement) => { const k = kindOf(e.kind); return k.fixed ? { x: e.x, y: e.y, w: k.w, h: k.h } : { x: e.x, y: e.y, w: e.w, h: e.h } }
  s.elements.forEach((e, i) => {
    const b = box(e)
    const l = labelled(e, b.w, b.h)
    if (l.w === b.w && l.h === b.h) return
    s.elements.forEach((o, k) => {
      if (k === i) return
      const ob = box(o)
      if (l.x < ob.x + ob.w && ob.x < l.x + l.w && l.y < ob.y + ob.h && ob.y < l.y + l.h &&
        !(b.x < ob.x + ob.w && ob.x < b.x + b.w && b.y < ob.y + ob.h && ob.y < b.y + b.h)) {
        out.push(`the label of ${kindOf(e.kind).title} may run into ${kindOf(o.kind).title}`)
      }
    })
  })
  return out
}

/** An element's box grown by the label R1 draws outside it (left of a number
 * box, right of a lamp, under a meter or fader), roughly: 7 px a character. */
function labelled(e: StripElement, w: number, h: number) {
  const k = kindOf(e.kind)
  const pos = e.labelPos ?? k.labelPos
  const text = e.label == null ? '' : e.label.replace(/\{name\}/g, 'Channel name').replace(/\{\w+\}/g, 'xxxx')
  const tw = text ? text.length * 7 + 8 : 0
  if (!tw || k.t === 4 || k.t === 11 || k.t === 1) return { x: e.x, y: e.y, w, h }
  if (pos === 1) return { x: e.x - tw, y: e.y, w: w + tw, h }
  if (pos === 2) return { x: e.x, y: e.y, w: w + tw, h }
  return { x: e.x + Math.min(0, (w - tw) / 2), y: e.y, w: Math.max(w, tw), h: h + 18 }
}

function StripItem({ s, active, onClick }: { s: Strip; active: boolean; onClick: () => void }) {
  return <button className={`strip-item${active ? ' active' : ''}`} onClick={onClick}>
    <span>{s.name}</span><span className="dim small">{s.target === 'channel' ? 'channel' : 'group'} · {s.w}×{s.h}</span>
  </button>
}
