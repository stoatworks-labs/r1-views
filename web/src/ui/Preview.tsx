// A sketch of a page as R1 might draw it, from the Controls rows the engine
// would write.  Not R1's rendering: meters show a sample level and lamps are
// lit so they can be seen (as scripts/preview.py does).
import { useEffect, useMemo, type ReactNode } from 'react'
import type { Ctl, Page } from '../engine/page.ts'
import { key, type Project } from '../engine/project.ts'

const LABEL = '#c8c8c8'
const LINE = '#6e737d'
const SAMPLE: Record<string, number> = { ChStatus_InputVoltagePeak: -6, ChStatus_GrHead: -12 }
const LAMP: Record<string, string> = {
  ChStatus_Gr: '#e6be28', ChStatus_Isp: '#4ec98a', ChStatus_Ovl: '#e0685f', Config_Mute: '#e0685f',
  ArrayProcessing_Enable: '#3c96e6',
}
const SWITCH: Record<string, string> = {
  Config_Mute: '#be3232', Config_DelayOn: '#4678be', Config_Eq1Enable: '#3f9a5a', Config_Eq2Enable: '#3f9a5a',
  Config_EqsEnabled: '#3f9a5a', Config_Filter1: '#5a5f68', Settings_PwrOn: '#2a2c30',
}
const INNER: Record<string, string> = {
  ChStatus_MsDelay: '0.3 ms', Config_FreqGenFreq: '1000 Hz', Config_FreqGenLevel: '-20.0 dBu',
  Config_FreqGenMode: 'Off', Config_PotiLevel: '0.0 dB', Config_Filter3: '0.0 dB',
}

export function usePictureUrls(page: Page): string[] {
  const urls = useMemo(() => page.pictures.map((p) => {
    // a copy keeps the Blob off any buffer a worker might move
    return URL.createObjectURL(new Blob([p.day.slice()], { type: 'image/png' }))
  }), [page.pictures])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])
  return urls
}

export interface PreviewProps {
  page: Page
  project: Project
  /** Indices of controls to outline in red. */
  flagged?: Set<number>
  /** Draw at this many CSS pixels per R1 pixel; omit to fit the width. */
  scale?: number
  children?: ReactNode
  className?: string
}

export function Preview({ page, project, flagged, scale, children, className }: PreviewProps) {
  const urls = usePictureUrls(page)
  const style = scale ? { width: page.w * scale, height: page.h * scale } : { width: '100%', maxWidth: page.w }
  return (
    <svg className={className ?? 'preview'} viewBox={`0 0 ${page.w} ${page.h}`} style={style}
      xmlns="http://www.w3.org/2000/svg" fontFamily="Arial, Helvetica, sans-serif" fontSize={12}>
      <rect x={0} y={0} width={page.w} height={page.h} fill="#26282c" />
      {page.ctls.map((c, i) => <Control key={i} c={c} p={project} url={c.pic != null ? urls[c.pic] : undefined}
        bad={flagged?.has(i)} />)}
      {children}
    </svg>
  )
}

function label(c: Ctl, extra = 0) {
  if (!c.dn) return null
  if (c.la === 1) return <text x={c.x - 6} y={c.y + c.h / 2} fill={LABEL} textAnchor="end" dominantBaseline="middle">{c.dn}</text>
  if (c.la === 2) return <text x={c.x + c.w + 6} y={c.y + c.h / 2} fill={LABEL} dominantBaseline="middle">{c.dn}</text>
  return <text x={c.x + c.w / 2} y={c.y + c.h + 13 + extra} fill={LABEL} textAnchor="middle">{c.dn}</text>
}

function Control({ c, p, url, bad }: { c: Ctl; p: Project; url?: string; bad?: boolean }) {
  const { x, y, w, h } = c
  const outline = bad ? <rect x={x - 1} y={y - 1} width={w + 2} height={h + 2} fill="none" stroke="#ff4040" strokeWidth={2} /> : null
  const ch = c.tt === 2 ? p.channels.get(key(c.ti, c.tc)) : undefined
  let body: ReactNode
  switch (c.t) {
    case 12:
      body = <>
        <rect x={x} y={y} width={w} height={h} rx={6} fill={c.mc === 14 ? '#34373d' : '#40444b'} fillOpacity={c.mc === 14 ? 0.92 : 1}
          stroke={LINE} />
        <text x={x + 10} y={y + 18} fill="#ebebeb" fontSize={14}>{c.dn}</text>
      </>
      break
    case 14:
      body = url ? <image href={url} x={x} y={y} width={w} height={h} preserveAspectRatio="none" /> :
        <rect x={x} y={y} width={w} height={h} fill="#30333a" />
      break
    case 1: {
      const dev = p.devices.get(c.ti)
      body = <>
        <rect x={x} y={y} width={w} height={h} fill="#1c1e21" stroke="#5a5f68" />
        <text x={x + 6} y={y + 16} fill="#a0a5ac">{`${dev?.model ?? ''} ${dev?.remoteId ?? ''} ch${c.tc}`}</text>
        <text x={x + w - 6} y={y + 16} fill="#a0a5ac" textAnchor="end">ISP GR OVL</text>
        <rect x={x + 6} y={y + 36} width={94} height={22} fill="none" stroke="#5a5f68" />
        <text x={x + 10} y={y + 51} fill={LABEL}>0.0 dB</text>
        <rect x={x + 108} y={y + 36} width={40} height={22} rx={3} fill="#be3232" />
        <text x={x + 128} y={y + 51} fill="#fff" textAnchor="middle" fontSize={11}>Mute</text>
        <text x={x + 6} y={y + 84} fill="#ebebeb">{ch?.name ?? '?'}</text>
      </>
      break
    }
    case 7: {
      const at = (v: number) => y + h - ((v - c.mn) / (c.mx - c.mn)) * h
      const s = Math.min(Math.max(SAMPLE[c.tp ?? ''] ?? c.mn, c.mn), c.mx)
      body = <>
        <rect x={x} y={y} width={w} height={h} fill="#141517" stroke="#5a5f68" />
        <rect x={x + 3} y={at(s)} width={Math.max(w - 6, 1)} height={Math.max(y + h - 2 - at(s), 0)} fill="#3caa50" />
        <line x1={x} x2={x + w} y1={at(c.th)} y2={at(c.th)} stroke="#c83c3c" strokeWidth={2} />
        {label(c)}
      </>
      break
    }
    case 2: {
      const at = (v: number) => y + 10 + ((c.mx - v) / (c.mx - c.mn)) * (h - 20)
      const cx = x + w / 2
      const ticks = [6, 0, -6, -12, -20, -30, -40, -50, -57.5].filter((v) => v >= c.mn && v <= c.mx)
      const zero = c.mn <= 0 && c.mx >= 0 ? 0 : c.mn
      body = <>
        <rect x={x} y={y} width={w} height={h} fill="#1e2024" stroke="#5a5f68" />
        <rect x={cx - 3} y={y + 10} width={6} height={Math.max(h - 20, 0)} fill="#0c0c0e" />
        {w > 40 && ticks.map((v) => <g key={v}>
          <line x1={x + 4} x2={cx - 7} y1={at(v)} y2={at(v)} stroke="#787d87" />
          <text x={x + w - 3} y={at(v)} fill="#969ba2" textAnchor="end" dominantBaseline="middle" fontSize={10}>{v}</text>
        </g>)}
        <rect x={x + 6} y={at(zero) - 9} width={Math.max(w - 12, 4)} height={18} rx={3} fill="#aaafb9" />
        {label(c, 4)}
      </>
      break
    }
    case 8:
      body = <>
        <circle cx={x + w / 2} cy={y + h / 2} r={Math.min(w, h) / 2 - 1} fill={LAMP[c.tp ?? ''] ?? '#78c878'} stroke="#141414" />
        {label(c)}
      </>
      break
    case 6:
      body = <Eq c={c} />
      break
    case 11:
      body = <text x={c.align === 132 ? x + w / 2 : x + 2} y={y + Math.min(h / 2, 14)} fill="#ebebeb"
        textAnchor={c.align === 132 ? 'middle' : 'start'} dominantBaseline="middle" fontSize={h >= 48 ? 18 : 12}>{c.dn}</text>
      break
    case 9:
      body = <>
        <rect x={x} y={y} width={w} height={h} rx={3} fill="#15171a" stroke="#5a5f68" />
        <text x={x + 6} y={y + h / 2} fill="#ebebeb" dominantBaseline="middle">
          {c.tp === 'Config_ChannelName' ? (ch?.name ?? '?') : '—'}</text>
        {c.la === 1 && label(c)}
      </>
      break
    default: {
      const fill = c.t === 4 ? (SWITCH[c.tp ?? ''] ?? '#33363c') : c.t === 5 ? '#96702a' : '#1c1e21'
      let inner = c.t === 4 ? c.dn : (INNER[c.tp ?? ''] ?? c.dn)
      if (c.t === 3 && c.flags === 14) inner = c.tp === 'ChStatus_MsDelay' ? '±0.0 ms' : '±0.0 dB'
      body = <>
        <rect x={x} y={y} width={w} height={h} rx={4} fill={fill} stroke="#787d87" />
        <text x={x + w / 2} y={y + h / 2} fill="#f0f0f0" textAnchor="middle" dominantBaseline="middle">{inner}</text>
        {c.t !== 4 && label(c)}
      </>
    }
  }
  return <g>{body}{outline}</g>
}

function Eq({ c }: { c: Ctl }) {
  const { x, y, w, h } = c
  const px = x + 40, pw = w - 56, py = y + 40, ph = h - 90
  const fx = (f: number) => px + (Math.log10(f / 20) / 3) * pw
  const freqs = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
  const bank = c.tp?.includes('Eq2') ? 2 : 1
  return <>
    <rect x={x} y={y} width={w} height={h} fill="#17191c" stroke="#5a5f68" />
    <text x={x + 10} y={y + 22} fill="#ebebeb" fontSize={13}>{`EQ ${bank}`}</text>
    <text x={x + w - 10} y={y + 22} fill="#969ba2" textAnchor="end">On · A/B · Load · Save</text>
    {freqs.map((f) => <g key={f}>
      <line x1={fx(f)} x2={fx(f)} y1={py} y2={py + ph} stroke="#2e3238" />
      <text x={fx(f)} y={py + ph + 14} fill="#7d828a" textAnchor="middle" fontSize={10}>{f >= 1000 ? `${f / 1000}k` : f}</text>
    </g>)}
    {[12, 6, 0, -6, -12, -18].map((g) => {
      const gy = py + ((12 - g) / 30) * ph
      return <g key={g}><line x1={px} x2={px + pw} y1={gy} y2={gy} stroke={g === 0 ? '#4a4f57' : '#2e3238'} />
        <text x={px - 6} y={gy} fill="#7d828a" textAnchor="end" dominantBaseline="middle" fontSize={10}>{g}</text></g>
    })}
    <line x1={px} x2={px + pw} y1={py + (12 / 30) * ph} y2={py + (12 / 30) * ph} stroke={bank === 1 ? '#d04040' : '#d0b030'} strokeWidth={2} />
    <text x={x + 10} y={y + h - 14} fill="#7d828a">Band · Type · Freq · Gain · Q</text>
  </>
}
