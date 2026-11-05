// Lay strips out over a floorplan: one tile per speaker (or group), where it is.
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { pageProblems } from '../engine/check.ts'
import { TITLE_BAND, floorplanPage, tileName, tileSize, type FloorplanDesign, type Tile, type TileTarget } from '../engine/pages/floorplan.ts'
import { folderTree, key, type Project, type Section } from '../engine/project.ts'
import { COMPACT_CARD, GROUP_TILE, type Strip } from '../engine/strips.ts'
import { defaultLook, fit, loadImage, renderPlan, type PlanLook } from './image.ts'
import { Preview } from './Preview.tsx'

export interface FloorplanProps {
  project: Project
  sections: Section[]
  design: FloorplanDesign
  onChange: (d: FloorplanDesign) => void
  strips: Map<string, Strip>
}

const SIZES: [number, number, string][] = [[1680, 900, '16" MacBook Pro'], [1920, 1000, '1920 × 1080 screen'], [1340, 760, '13" laptop'], [1180, 760, 'iPad, landscape']]

export function FloorplanEditor({ project, sections, design, onChange, strips }: FloorplanProps) {
  const [sel, setSel] = useState<string | null>(null)
  const [chanStrip, setChanStrip] = useState(COMPACT_CARD.id)
  const [groupStrip, setGroupStrip] = useState(GROUP_TILE.id)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [look, setLook] = useState<PlanLook>(defaultLook)
  const [busy, setBusy] = useState('')
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1000)
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null)
  // the drawing finishes later; by then tiles may have moved
  const latest = useRef(design)
  latest.current = design

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const scale = Math.min(1, width / design.w)

  // re-draw the picture when it, the page size or the look changes
  useEffect(() => {
    if (!img) return
    let gone = false
    const area = fit(img.naturalWidth, img.naturalHeight, design.w, design.h - TITLE_BAND)
    setBusy('Drawing the floorplan…')
    renderPlan(img, area.w, area.h, look).then(({ day, night }) => {
      if (gone) return
      setBusy('')
      const d = latest.current
      onChange({ ...d, image: { day, night, x: area.x, y: TITLE_BAND + area.y, w: area.w, h: area.h, pw: area.w, ph: area.h, name: d.image?.name ?? 'Floorplan' } })
    }).catch((e) => { setBusy(String(e)) })
    return () => { gone = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, look, design.w, design.h])

  const page = useMemo(() => floorplanPage(project, design, strips), [project, design, strips])
  const problems = useMemo(() => pageProblems(page), [page])
  const flagged = useMemo(() => new Set(problems.flatMap((p) => p.idx)), [problems])

  const placed = new Set(design.tiles.map((t) => t.target.kind === 'channel' ? `c${key(t.target.dev, t.target.ch)}` : `g${t.target.id}`))
  const stripFor = (t: TileTarget) => strips.get(t.kind === 'channel' ? chanStrip : groupStrip)!

  const freeSpot = (s: Strip, tiles: Tile[]) => {
    const { w, h } = tileSize(s, project)
    for (let y = TITLE_BAND + 8; y + h <= design.h; y += 8) {
      for (let x = 8; x + w <= design.w; x += 8) {
        const hit = tiles.some((t) => {
          const ts = tileSize(strips.get(t.stripId) ?? s, project)
          return x < t.x + ts.w + 8 && t.x < x + w + 8 && y < t.y + ts.h + 8 && t.y < y + h + 8
        })
        if (!hit) return { x, y }
      }
    }
    return { x: 8, y: TITLE_BAND + 8 }
  }
  const place = (targets: TileTarget[]) => {
    const tiles = [...design.tiles]
    for (const target of targets) {
      const s = stripFor(target)
      const at = freeSpot(s, tiles)
      tiles.push({ id: `t${Date.now().toString(36)}${tiles.length}`, stripId: s.id, target, ...at })
    }
    onChange({ ...design, tiles })
    if (targets.length === 1) setSel(tiles[tiles.length - 1].id)
  }

  const toR1 = (e: RPointerEvent) => {
    const r = wrap.current!.querySelector('svg')!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }
  }
  const start = (t: Tile) => (e: RPointerEvent) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const p = toR1(e)
    drag.current = { id: t.id, sx: p.x, sy: p.y, ox: t.x, oy: t.y }
    setSel(t.id)
  }
  const move = (e: RPointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = toR1(e)
    onChange({
      ...design, tiles: design.tiles.map((t) => {
        if (t.id !== d.id) return t
        const { w, h } = tileSize(strips.get(t.stripId) ?? COMPACT_CARD, project)
        const x = Math.round((d.ox + p.x - d.sx) / 2) * 2, y = Math.round((d.oy + p.y - d.sy) / 2) * 2
        return { ...t, x: Math.min(Math.max(0, x), design.w - w), y: Math.min(Math.max(TITLE_BAND, y), design.h - h) }
      }),
    })
  }

  const tile = design.tiles.find((t) => t.id === sel)
  const setTile = (t: Partial<Tile>) => onChange({ ...design, tiles: design.tiles.map((x) => (x.id === sel ? { ...x, ...t } : x)) })
  const chanStrips = [...strips.values()].filter((s) => s.target === 'channel')
  const groupStrips = [...strips.values()].filter((s) => s.target === 'group')
  const inSections = new Set(sections.flatMap((s) => s.members.map((m) => key(m.dev, m.ch))))
  const loose = [...project.channels.values()].filter((c) => !inSections.has(key(c.dev, c.ch)))

  return (
    <div className="floorplan">
      <section className="panel">
        <div className="row wrap">
          <label>Page name<input value={design.name} onChange={(e) => onChange({ ...design, name: e.target.value })} /></label>
          <label>Size<select value={`${design.w}x${design.h}`} onChange={(e) => {
            const [w, h] = e.target.value.split('x').map(Number)
            onChange({ ...design, w, h })
          }}>
            {SIZES.map(([w, h, n]) => <option key={n} value={`${w}x${h}`}>{w} × {h} · {n}</option>)}
            {!SIZES.some(([w, h]) => w === design.w && h === design.h) && <option value={`${design.w}x${design.h}`}>{design.w} × {design.h}</option>}
          </select></label>
          <label>Width<input type="number" value={design.w} min={400} onChange={(e) => onChange({ ...design, w: Math.max(400, +e.target.value) })} /></label>
          <label>Height<input type="number" value={design.h} min={300} onChange={(e) => onChange({ ...design, h: Math.max(300, +e.target.value) })} /></label>
          <label className="file-btn">Floorplan picture…
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              try {
                const i = await loadImage(f)
                const blank = { day: new Uint8Array(), night: new Uint8Array(), x: 0, y: TITLE_BAND, w: 1, h: 1, pw: 1, ph: 1 }
                onChange({ ...design, image: { ...(design.image ?? blank), name: f.name } })
                setImg(i)
              } catch { setBusy(`Couldn't read ${f.name} as a picture.`) }
              e.target.value = ''
            }} />
          </label>
          {design.image && <button onClick={() => { setImg(null); onChange({ ...design, image: null }) }}>Remove picture</button>}
        </div>
        {img && <div className="row wrap">
          <label className="check"><input type="checkbox" checked={look.invert} onChange={(e) => setLook({ ...look, invert: e.target.checked })} />
            Invert (dark lines on white become light on dark, for R1's dark theme)</label>
          <label>Brightness<input type="range" min={0.15} max={1} step={0.05} value={look.brightness}
            onChange={(e) => setLook({ ...look, brightness: +e.target.value })} /></label>
          <label>Night copy<input type="range" min={0.15} max={1} step={0.05} value={look.night}
            onChange={(e) => setLook({ ...look, night: +e.target.value })} /></label>
          {design.image && <span className="dim small">{design.image.w} × {design.image.h} px, {(design.image.day.length / 1024).toFixed(0)} KB
            + night {(design.image.night.length / 1024).toFixed(0)} KB in the project</span>}
        </div>}
        {!img && design.image && design.image.day.length === 0 && <p className="note">Pick the picture again: pictures aren't kept between visits.</p>}
        {busy && <p className="dim small">{busy}</p>}
      </section>

      <div className="fp-body">
        <aside className="panel fp-list">
          <label>New channel tiles<select value={chanStrip} onChange={(e) => setChanStrip(e.target.value)}>
            {chanStrips.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>New group tiles<select value={groupStrip} onChange={(e) => setGroupStrip(e.target.value)}>
            {groupStrips.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <button onClick={() => place([...project.channels.values()].filter((c) => !placed.has(`c${key(c.dev, c.ch)}`))
            .map((c) => ({ kind: 'channel' as const, dev: c.dev, ch: c.ch })))}>Place every channel</button>
          {sections.map((s) => <div key={s.id} className="fp-group">
            <TargetRow name={s.name} sub="group" on={placed.has(`g${s.id}`)} onClick={() => place([{ kind: 'group', id: s.id }])} />
            {s.members.map((m) => <TargetRow key={key(m.dev, m.ch)} name={m.name}
              sub={`${project.devices.get(m.dev)?.name ?? m.dev} ch${m.ch}`} on={placed.has(`c${key(m.dev, m.ch)}`)} indent
              onClick={() => place([{ kind: 'channel', dev: m.dev, ch: m.ch }])} />)}
          </div>)}
          {loose.length > 0 && <div className="fp-group"><p className="dim small">Not in a section</p>
            {loose.map((c) => <TargetRow key={key(c.dev, c.ch)} name={c.name} sub={`${project.devices.get(c.dev)?.name ?? c.dev} ch${c.ch}`}
              on={placed.has(`c${key(c.dev, c.ch)}`)} indent onClick={() => place([{ kind: 'channel', dev: c.dev, ch: c.ch }])} />)}
          </div>}
          <details><summary className="dim small">Other groups</summary>
            {folderTree(project).filter((f) => !sections.some((s) => s.id === f.id)).map((f) =>
              <TargetRow key={f.id} name={f.name} sub="group" on={placed.has(`g${f.id}`)} onClick={() => place([{ kind: 'group', id: f.id }])} />)}
          </details>
        </aside>

        <section className="panel fp-canvas">
          <div className="canvas-wrap" ref={wrap} onPointerMove={move} onPointerUp={() => { drag.current = null }}
            onPointerDown={() => setSel(null)}>
            <Preview page={page} project={project} scale={scale} flagged={flagged}>
              {design.tiles.map((t) => {
                const s = strips.get(t.stripId)
                if (!s) return null
                const { w, h } = tileSize(s, project)
                return <rect key={t.id} x={t.x} y={t.y} width={w} height={h} className={`hit${t.id === sel ? ' sel' : ''}`}
                  onPointerDown={start(t)} />
              })}
            </Preview>
          </div>
          {problems.length > 0 && <ul className="problems">{problems.slice(0, 8).map((p, i) => <li key={i}>{p.text}</li>)}
            {problems.length > 8 && <li>…and {problems.length - 8} more</li>}</ul>}
          {page.notes.length > 0 && <ul className="notes">{page.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
        </section>

        <aside className="panel inspector">
          {tile ? <>
            <h3>{tileName(project, tile.target)}</h3>
            <label>Strip<select value={tile.stripId} onChange={(e) => setTile({ stripId: e.target.value })}>
              {(tile.target.kind === 'channel' ? chanStrips : groupStrips).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></label>
            <div className="grid2">
              <label>X<input type="number" value={tile.x} onChange={(e) => setTile({ x: +e.target.value })} /></label>
              <label>Y<input type="number" value={tile.y} onChange={(e) => setTile({ y: +e.target.value })} /></label>
            </div>
            <button className="danger" onClick={() => { onChange({ ...design, tiles: design.tiles.filter((t) => t.id !== sel) }); setSel(null) }}>Remove tile</button>
          </> : <>
            <h3>Tiles</h3>
            <p className="dim small">Click a channel or group on the left to drop a tile, then drag it to where the speaker is. Tiles are strips:
              design your own on the Strips tab.</p>
            <p className="dim small">{design.tiles.length} placed.</p>
            {design.tiles.length > 0 && <button className="danger" onClick={() => onChange({ ...design, tiles: [] })}>Remove every tile</button>}
          </>}
        </aside>
      </div>
    </div>
  )
}

function TargetRow({ name, sub, on, onClick, indent }: { name: string; sub: string; on: boolean; onClick: () => void; indent?: boolean }) {
  return <button className={`target-row${on ? ' on' : ''}${indent ? ' indent' : ''}`} onClick={onClick} title={on ? 'Placed; click to add another' : 'Place a tile'}>
    <span>{on ? '●' : '○'} {name}</span><span className="dim small">{sub}</span>
  </button>
}
