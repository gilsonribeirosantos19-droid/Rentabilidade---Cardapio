import { useMemo, useState } from 'react'

// Gráfico de linhas (SVG puro) da aba Evolução — Impacto na Margem.
// Um eixo só; linhas 2px; marcador no último ponto; rótulo direto no fim de cada linha
// (texto na cor do texto, a bolinha colorida é que identifica); legenda quando há ≥ 2 séries;
// passar o mouse mostra o mês com o valor de cada série. Ponto sem dado (null) = linha interrompida.

// paleta categórica validada (ordem fixa — cor segue a série, nunca a posição)
export const SERIE_CORES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4']

export type Serie = { nome: string; cor: string; vals: (number | null)[]; tip?: (i: number) => string }

export function ImpLineChart({ labels, series, fmtY, height = 230, refY }: { labels: string[]; series: Serie[]; fmtY: (v: number) => string; height?: number; refY?: number }) {
  const [hov, setHov] = useState<number | null>(null)
  const W = 900, H = height, padL = 52, padR = 150, padT = 14, padB = 26
  const n = labels.length

  const esc = useMemo(() => {
    const all = series.flatMap((s) => s.vals.filter((v): v is number => v != null))
    if (refY != null) all.push(refY)
    if (!all.length) return null
    let min = Math.min(...all), max = Math.max(...all)
    if (max - min < 1e-9) { min -= 1; max += 1 }
    const span = max - min; min -= span * 0.08; max += span * 0.08
    // 4 divisões "redondas"
    const raw = (max - min) / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= raw) || raw
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step
    const ticks: number[] = []; for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(6))
    return { lo, hi, ticks }
  }, [series, refY])

  if (!esc) return <div className="imp-empty">Sem compras suficientes no período para desenhar.</div>
  const x = (i: number) => padL + (n <= 1 ? 0 : i * (W - padL - padR) / (n - 1))
  const y = (v: number) => padT + (esc.hi - v) / (esc.hi - esc.lo) * (H - padT - padB)

  const caminho = (vals: (number | null)[]) => {
    let d = '', pen = false
    vals.forEach((v, i) => { if (v == null) { pen = false; return } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `; pen = true })
    return d
  }
  // rótulos diretos no último ponto de cada série, afastados p/ não encavalar
  const fim = series.map((s, si) => { let li = -1; s.vals.forEach((v, i) => { if (v != null) li = i }); return { si, li, yy: li >= 0 ? y(s.vals[li] as number) : 0 } }).filter((f) => f.li >= 0).sort((a, b) => a.yy - b.yy)
  for (let k = 1; k < fim.length; k++) if (fim[k].yy - fim[k - 1].yy < 14) fim[k].yy = fim[k - 1].yy + 14

  const slot = n > 1 ? (W - padL - padR) / (n - 1) : W
  return (
    <div className="imp-chart">
      {series.length >= 2 && (
        <div className="imp-legend">{series.map((s) => <span key={s.nome}><i style={{ background: s.cor }} />{s.nome}</span>)}</div>
      )}
      <div className="imp-chart-box">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={series.map((s) => s.nome).join(', ')} onMouseLeave={() => setHov(null)}>
          {esc.ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#eef2f7" />
              <text x={padL - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10.5" fill="#94a3b8">{fmtY(t)}</text>
            </g>
          ))}
          {refY != null && <line x1={padL} x2={W - padR} y1={y(refY)} y2={y(refY)} stroke="#cbd5e1" strokeDasharray="4 4" />}
          {labels.map((l, i) => <text key={l + i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10.5" fill="#94a3b8">{l}</text>)}
          {hov != null && <line x1={x(hov)} x2={x(hov)} y1={padT} y2={H - padB} stroke="#cbd5e1" />}
          {series.map((s) => <path key={s.nome} d={caminho(s.vals)} fill="none" stroke={s.cor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
          {series.map((s) => s.vals.map((v, i) => v != null && (hov === i || i === s.vals.reduce((a: number, w, j) => (w != null ? j : a), -1))
            ? <circle key={s.nome + i} cx={x(i)} cy={y(v)} r={4.5} fill={s.cor} stroke="#fff" strokeWidth={2} /> : null))}
          {fim.map((f) => { const s = series[f.si]; return (
            <g key={s.nome}>
              <circle cx={x(f.li) + 12} cy={f.yy - 1} r={3.5} fill={s.cor} />
              <text x={x(f.li) + 20} y={f.yy + 3} fontSize="11" fill="#334155">{s.nome.length > 16 ? s.nome.slice(0, 15) + '…' : s.nome}</text>
            </g>) })}
          {labels.map((_, i) => <rect key={'h' + i} x={x(i) - slot / 2} y={0} width={slot} height={H} fill="transparent" onMouseEnter={() => setHov(i)} />)}
        </svg>
        {hov != null && (
          <div className="imp-tip" style={{ left: `${Math.min(82, Math.max(12, (x(hov) / W) * 100))}%` }}>
            <b>{labels[hov]}</b>
            {series.map((s) => <div key={s.nome}><i style={{ background: s.cor }} />{s.nome}: <b>{s.vals[hov] != null ? (s.tip ? s.tip(hov) : fmtY(s.vals[hov] as number)) : 'sem compra'}</b></div>)}
          </div>
        )}
      </div>
    </div>
  )
}
