import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import './estoque.css'

type Insumo = { id: string; nome: string; unidade_medida?: string; categoria?: string; preco_compra?: number; ativo?: boolean }
type Saida = { insumo_id: string; quantidade?: number; criado_em?: string }
type Saldo = { insumo_id: string; custo_medio?: number }
type Forn = { id: string; nome: string }
type Vinc = { insumo_id: string; fornecedor_id: string }

const brl = (v?: number | null) => (v == null) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtQ = (v?: number | null) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
const LBL = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
const LBL2 = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const labelMes = (ym: string) => { const [y, m] = ym.split('-').map(Number); return `${LBL2[m - 1]}/${y}` }
const nowYear = new Date().getFullYear()

function mesesEntre(de: string, ate: string) {
  const out: { key: string; label: string }[] = []
  let cur = de; let guard = 0
  while (cur <= ate && guard++ < 240) {
    const [y, m] = cur.split('-').map(Number)
    out.push({ key: cur, label: `${LBL[m - 1]}/${String(y).slice(2)}` })
    const nx = new Date(y, m, 1); cur = `${nx.getFullYear()}-${String(nx.getMonth() + 1).padStart(2, '0')}`
  }
  return out
}
function compPeriodo(de: string, ate: string, modo: string): { de: string; ate: string } | null {
  if (modo === 'nenhuma') return null
  const [dy, dm] = de.split('-').map(Number); const [ay, am] = ate.split('-').map(Number)
  if (modo === 'ano_anterior') return { de: `${dy - 1}-${String(dm).padStart(2, '0')}`, ate: `${ay - 1}-${String(am).padStart(2, '0')}` }
  const n = (ay - dy) * 12 + (am - dm) + 1
  const dDe = new Date(dy, dm - 1 - n, 1); const dAte = new Date(dy, dm - 2, 1)
  return { de: `${dDe.getFullYear()}-${String(dDe.getMonth() + 1).padStart(2, '0')}`, ate: `${dAte.getFullYear()}-${String(dAte.getMonth() + 1).padStart(2, '0')}` }
}

export function ConsumoInsumos() {
  const { tenantId } = useAuth()
  const { lojaId } = useLoja()
  const [tipoVis, setTipoVis] = useState<'ano' | 'custom'>('ano')
  const [ano, setAno] = useState(String(nowYear))
  const [mDe, setMDe] = useState(`${nowYear}-01`); const [mAte, setMAte] = useState(`${nowYear}-12`)
  const [compara, setCompara] = useState('ano_anterior')
  const [busca, setBusca] = useState(''); const [grupo, setGrupo] = useState(''); const [forn, setForn] = useState('')
  const [modo, setModo] = useState<'qtd' | 'valor'>('qtd')
  const [sub, setSub] = useState<'consumo' | 'resumo'>('consumo')
  const [top, setTop] = useState(5)
  const [chartModo, setChartModo] = useState<'qtd' | 'valor'>('qtd')
  const [maisFiltros, setMaisFiltros] = useState(false)
  const [pag, setPag] = useState(1); const [pageSize, setPageSize] = useState(10)

  const periodo = tipoVis === 'ano' ? { de: `${ano}-01`, ate: `${ano}-12` } : { de: mDe, ate: mAte }
  const cmpP = compPeriodo(periodo.de, periodo.ate, compara)
  const meses = useMemo(() => mesesEntre(periodo.de, periodo.ate), [periodo.de, periodo.ate])

  const { data: insumos = [] } = useQuery({ queryKey: ['ci-ins', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,unidade_medida,categoria,preco_compra,ativo').eq('tenant_id', tenantId).order('nome').range(f, t)) })
  const { data: saldos = [] } = useQuery({ queryKey: ['ci-sld', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Saldo>((f, t) => supabase.from('saldo_estoque').select('insumo_id,custo_medio').eq('tenant_id', tenantId).range(f, t)) })
  const { data: fornecedores = [] } = useQuery({ queryKey: ['ci-forn', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('fornecedores').select('id,nome').eq('tenant_id', tenantId).order('nome'); return (data ?? []) as Forn[] } })
  const { data: vincs = [] } = useQuery({ queryKey: ['ci-vinc', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Vinc>((f, t) => supabase.from('insumo_fornecedores').select('insumo_id,fornecedor_id').eq('tenant_id', tenantId).range(f, t)) })
  const { data: saidas = [], isLoading } = useQuery({
    queryKey: ['ci-sai', tenantId, lojaId, periodo.de, periodo.ate], enabled: !!tenantId,
    queryFn: () => fetchAll<Saida>((f, t) => { let q = supabase.from('saidas_estoque').select('insumo_id,quantidade,criado_em').eq('tenant_id', tenantId).gte('criado_em', periodo.de + '-01').lte('criado_em', periodo.ate + '-31T23:59:59'); if (lojaId) q = q.eq('loja_id', lojaId); return q.range(f, t) }),
  })
  const { data: saidasCmp = [] } = useQuery({
    queryKey: ['ci-saiC', tenantId, lojaId, cmpP?.de, cmpP?.ate], enabled: !!tenantId && !!cmpP,
    queryFn: () => fetchAll<Saida>((f, t) => { let q = supabase.from('saidas_estoque').select('insumo_id,quantidade,criado_em').eq('tenant_id', tenantId).gte('criado_em', cmpP!.de + '-01').lte('criado_em', cmpP!.ate + '-31T23:59:59'); if (lojaId) q = q.eq('loja_id', lojaId); return q.range(f, t) }),
  })

  const custo = (insId: string) => { const s = saldos.find((x) => x.insumo_id === insId); if (s && s.custo_medio) return Number(s.custo_medio) || 0; const i = insumos.find((x) => x.id === insId); return Number(i?.preco_compra) || 0 }
  const cats = useMemo(() => [...new Set(insumos.map((i) => i.categoria).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR')), [insumos])

  const { rows, resumo } = useMemo(() => {
    const insForn = forn ? new Set(vincs.filter((v) => v.fornecedor_id === forn).map((v) => v.insumo_id)) : null
    let insFilt = insumos.filter((i) => i.ativo !== false)
    if (grupo) insFilt = insFilt.filter((i) => (i.categoria || '') === grupo)
    if (insForn) insFilt = insFilt.filter((i) => insForn.has(i.id))
    if (busca) insFilt = insFilt.filter((i) => i.nome.toLowerCase().includes(busca.toLowerCase()))
    const val = (s: Saida, insId: string) => modo === 'valor' ? (Number(s.quantidade) || 0) * custo(insId) : (Number(s.quantidade) || 0)

    const resumoData = insFilt.map((ins) => {
      const c = custo(ins.id)
      const porMesQtd = meses.map((m) => saidas.filter((s) => s.insumo_id === ins.id && (s.criado_em || '').startsWith(m.key)).reduce((a, s) => a + (Number(s.quantidade) || 0), 0))
      const totalQtd = porMesQtd.reduce((a, v) => a + v, 0)
      return { ins, porMesQtd, totalQtd, cust: c, totalValor: totalQtd * c }
    }).filter((r) => r.totalQtd !== 0)

    const evRows = insFilt.map((ins) => {
      const porMes = meses.map((m) => saidas.filter((s) => s.insumo_id === ins.id && (s.criado_em || '').startsWith(m.key)).reduce((a, s) => a + val(s, ins.id), 0))
      const total = porMes.reduce((a, v) => a + v, 0)
      const media = meses.length ? total / meses.length : 0
      let cmpTotal: number | null = null, dif: number | null = null, difPct: number | null = null
      if (cmpP) { cmpTotal = saidasCmp.filter((s) => s.insumo_id === ins.id).reduce((a, s) => a + val(s, ins.id), 0); dif = total - cmpTotal; difPct = cmpTotal > 0 ? (dif / cmpTotal * 100) : (total > 0 ? 100 : 0) }
      if (total === 0 && !cmpTotal) return null
      return { ins, porMes, total, media, cmpTotal, dif, difPct }
    }).filter(Boolean) as { ins: Insumo; porMes: number[]; total: number; media: number; cmpTotal: number | null; dif: number | null; difPct: number | null }[]
    evRows.sort((a, b) => b.total - a.total)
    return { rows: evRows, resumo: resumoData }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insumos, saidas, saidasCmp, meses, modo, grupo, forn, busca, vincs, saldos, compara])

  const fmtCell = (v: number) => modo === 'valor' ? (v ? brl(v) : '–') : (v > 0 ? fmtQ(v) : '–')
  const totalLabels = () => {
    const ay = periodo.de.split('-')[0], ay2 = periodo.ate.split('-')[0]
    const atual = ay === ay2 ? `TOTAL ${ay}` : 'TOTAL'
    let cmp = 'TOTAL ANTERIOR'
    if (cmpP) { const cy = cmpP.de.split('-')[0], cy2 = cmpP.ate.split('-')[0]; cmp = cy === cy2 ? `TOTAL ${cy}` : 'TOTAL ANTERIOR' }
    return { atual, cmp }
  }
  const lbls = totalLabels()

  const totalPags = Math.max(1, Math.ceil(rows.length / pageSize))
  const pagAtual = Math.min(pag, totalPags)
  const page = rows.slice((pagAtual - 1) * pageSize, pagAtual * pageSize)

  const exportCSV = () => {
    if (!rows.length) return
    const fmtN = (v: number) => (Number(v) || 0).toFixed(modo === 'valor' ? 2 : 3)
    let header = ['Insumo', 'UN', ...meses.map((m) => m.label), 'Media Mensal', 'Total']
    if (compara !== 'nenhuma') header = header.concat(['Total Comparado', 'Diferenca', 'Diferenca %'])
    const body = rows.map((r) => { let c = [`"${r.ins.nome}"`, r.ins.unidade_medida || '', ...r.porMes.map(fmtN), fmtN(r.media), fmtN(r.total)]; if (compara !== 'nenhuma') c = c.concat([fmtN(r.cmpTotal || 0), fmtN(r.dif || 0), (r.difPct || 0).toFixed(0)]); return c.join(';') })
    const csv = '﻿' + header.join(';') + '\n' + body.join('\n')
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = `consumo_insumos_${new Date().toISOString().split('T')[0]}.csv`; a.click()
  }

  // resumo
  const consumoArr = [...resumo].sort((a, b) => b.totalQtd - a.totalQtd)
  const totalQtdGeral = resumo.reduce((s, r) => s + r.totalQtd, 0)
  const finArr = [...resumo].sort((a, b) => b.totalValor - a.totalValor)
  const totalValorGeral = resumo.reduce((s, r) => s + r.totalValor, 0)
  const chartData = { labels: meses.map((m) => m.label), qtd: meses.map((_, i) => resumo.reduce((s, r) => s + (r.porMesQtd[i] || 0), 0)), valor: meses.map((_, i) => resumo.reduce((s, r) => s + (r.porMesQtd[i] || 0) * r.cust, 0)) }
  const pct = (v: number, tot: number) => tot > 0 ? (v / tot * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : '–'
  const seg = (on: boolean) => (on ? 'on' : '')

  return (
    <div className="est-screen">
      <div className="ds-filterbar" style={{ alignItems: 'flex-end' }}>
        <div><div className="flbl">Tipo de visualização</div>
          <select className="field" style={{ width: 190 }} value={tipoVis} onChange={(e) => setTipoVis(e.target.value as 'ano' | 'custom')}><option value="ano">Ano</option><option value="custom">Período personalizado</option></select>
        </div>
        {tipoVis === 'ano'
          ? <div><div className="flbl">Ano</div><select className="field" style={{ width: 120 }} value={ano} onChange={(e) => setAno(e.target.value)}>{Array.from({ length: 5 }, (_, i) => nowYear - i).map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
          : <div><div className="flbl">Período</div><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="month" className="field" style={{ width: 140 }} value={mDe} onChange={(e) => setMDe(e.target.value)} /><span style={{ color: '#94a3b8' }}>—</span><input type="month" className="field" style={{ width: 140 }} value={mAte} onChange={(e) => setMAte(e.target.value)} /></div></div>}
        <div style={{ width: 220 }}><div className="flbl">Comparar com</div>
          <select className="field" style={{ width: '100%' }} value={compara} onChange={(e) => setCompara(e.target.value)}><option value="nenhuma">Nenhuma comparação</option><option value="anterior">Período anterior</option><option value="ano_anterior">Mesmo período do ano anterior</option></select>
        </div>
        <div style={{ width: 200 }}><div className="flbl">Insumo</div><input className="field" style={{ width: '100%' }} placeholder="Buscar insumo..." value={busca} onChange={(e) => { setBusca(e.target.value); setPag(1) }} /></div>
        <div><div className="flbl">Visualizar</div><div className="seg"><button className={seg(modo === 'qtd')} onClick={() => setModo('qtd')}>Quantidade</button><button className={seg(modo === 'valor')} onClick={() => setModo('valor')}>Valor (R$)</button></div></div>
        <button className="btn-ghost" onClick={() => setMaisFiltros((v) => !v)}>▽ Mais filtros</button>
        <div className="ds-actions"><button className="btn-ghost" onClick={exportCSV}>↓ Exportar CSV</button></div>
      </div>

      {maisFiltros && <div className="ds-filterbar" style={{ marginTop: -6 }}>
        <div style={{ width: 220 }}><div className="flbl">Grupo de insumos</div><select className="field" style={{ width: '100%' }} value={grupo} onChange={(e) => setGrupo(e.target.value)}><option value="">Todos</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
        <div style={{ width: 240 }}><div className="flbl">Fornecedor</div><select className="field" style={{ width: '100%' }} value={forn} onChange={(e) => setForn(e.target.value)}><option value="">Todos</option>{fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></div>
      </div>}

      {cmpP && <div className="ci-banner" style={{ margin: '4px 0 12px' }}><span style={{ opacity: .7 }}>Comparando</span> <b>{labelMes(periodo.de)} a {labelMes(periodo.ate)}</b> <span style={{ opacity: .7 }}>com</span> <b>{labelMes(cmpP.de)} a {labelMes(cmpP.ate)}</b>.</div>}

      <div className="ci-subtabs">
        <button className={'ci-subtab ' + seg(sub === 'consumo')} onClick={() => setSub('consumo')}>Consumo por Insumo</button>
        <button className={'ci-subtab ' + seg(sub === 'resumo')} onClick={() => setSub('resumo')}>Resumo do Período</button>
      </div>

      {sub === 'consumo' ? <>
        <div className="tbl-wrap"><div className="tbl-scroll">
          <table className="tbl">
            <thead><tr>
              <th style={{ minWidth: 160 }}>INSUMO</th><th className="r">UN</th>
              {meses.map((m) => <th key={m.key} className="r">{m.label}</th>)}
              <th className="r">MÉDIA MENSAL</th><th className="r">{lbls.atual}</th>
              {compara !== 'nenhuma' && <><th className="r">{lbls.cmp}</th><th className="r">DIFERENÇA</th><th className="r">DIF. %</th></>}
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td className="empty" colSpan={meses.length + 4}>Calculando…</td></tr>
                : page.length === 0 ? <tr><td className="empty" colSpan={meses.length + 4}>Nenhuma saída encontrada no período.</td></tr>
                : page.map((r) => {
                  const dc = (r.dif || 0) > 0 ? '#16a34a' : (r.dif || 0) < 0 ? '#e11d48' : '#94a3b8'
                  const sign = (r.dif || 0) > 0 ? '+' : ''
                  return (
                    <tr key={r.ins.id}>
                      <td style={{ fontWeight: 600, color: '#334155' }}>{r.ins.nome}</td>
                      <td className="r" style={{ color: '#64748b', fontSize: 12 }}>{r.ins.unidade_medida || '–'}</td>
                      {r.porMes.map((v, i) => <td key={i} className="r mono" style={{ color: '#334155' }}>{fmtCell(v)}</td>)}
                      <td className="r mono" style={{ color: '#334155' }}>{fmtCell(r.media)}</td>
                      <td className="r mono" style={{ fontWeight: 700, color: '#334155' }}>{fmtCell(r.total)}</td>
                      {compara !== 'nenhuma' && <>
                        <td className="r mono" style={{ color: '#64748b' }}>{fmtCell(r.cmpTotal || 0)}</td>
                        <td className="r mono" style={{ color: dc }}>{sign}{modo === 'valor' ? brl(r.dif || 0) : fmtQ(r.dif || 0)}</td>
                        <td className="r mono" style={{ color: dc }}>{sign}{(r.difPct || 0).toFixed(0)}%</td>
                      </>}
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
        <div className="pag-bar">
          <span>{rows.length ? `Mostrando ${(pagAtual - 1) * pageSize + 1} a ${Math.min(pagAtual * pageSize, rows.length)} de ${rows.length} registros` : ''}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="pag-btn" disabled={pagAtual === 1} onClick={() => setPag(pagAtual - 1)}>‹</button><span className="pag-btn active">{pagAtual}</span><button className="pag-btn" disabled={pagAtual === totalPags} onClick={() => setPag(pagAtual + 1)}>›</button>
            <select className="field" style={{ height: 30 }} value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPag(1) }}><option value={10}>10 por página</option><option value={25}>25 por página</option><option value={50}>50 por página</option></select>
          </div>
        </div>
        </div>
      </> : (
        !resumo.length ? <div className="empty">Nenhuma saída encontrada no período.</div> : <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))', gap: 14, marginBottom: 14, alignItems: 'start' }}>
            <ResumoCard titulo="Mais consumidos" top={top} setTop={setTop} onVerTodos={() => setSub('consumo')}
              rows={consumoArr.slice(0, top === 0 ? consumoArr.length : top).map((r, i) => ({ i, nome: r.ins.nome, val: <>{fmtQ(r.totalQtd)} <span style={{ color: '#94a3b8', fontSize: 11 }}>{r.ins.unidade_medida || ''}</span></>, pct: pct(r.totalQtd, totalQtdGeral) }))} colVal="CONSUMO" />
            <ResumoCard titulo="Maior impacto financeiro (R$)" top={top} setTop={setTop} onVerTodos={() => setSub('consumo')}
              rows={finArr.slice(0, top === 0 ? finArr.length : top).map((r, i) => ({ i, nome: r.ins.nome, val: brl(r.totalValor), pct: pct(r.totalValor, totalValorGeral) }))} colVal="VALOR CONSUMIDO" />
          </div>
          <div className="ci-card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
              <div style={{ fontWeight: 700, color: '#0f172a' }}>Evolução do consumo <span style={{ color: '#94a3b8', fontWeight: 500, fontSize: 12 }}>(total do período)</span></div>
              <div style={{ display: 'flex', gap: 4 }}><button className={'ci-chip ' + seg(chartModo === 'qtd')} onClick={() => setChartModo('qtd')}>Quantidade</button><button className={'ci-chip ' + seg(chartModo === 'valor')} onClick={() => setChartModo('valor')}>Valor (R$)</button></div>
            </div>
            <Chart labels={chartData.labels} data={chartModo === 'valor' ? chartData.valor : chartData.qtd} valor={chartModo === 'valor'} />
          </div>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>Os dados consideram apenas as saídas de estoque (consumo efetivo). Entradas de notas fiscais não são consideradas.</div>
        </>
      )}
    </div>
  )
}

function ResumoCard({ titulo, top, setTop, onVerTodos, rows, colVal }: { titulo: string; top: number; setTop: (n: number) => void; onVerTodos: () => void; rows: { i: number; nome: string; val: React.ReactNode; pct: string }[]; colVal: string }) {
  return (
    <div className="ci-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 700, color: '#0f172a' }}>{titulo}</div>
        <select className="field" style={{ width: 108, height: 30, padding: '0 8px', fontSize: 12 }} value={top} onChange={(e) => setTop(Number(e.target.value))}>{[5, 10, 20, 0].map((n) => <option key={n} value={n}>{n === 0 ? 'Todos' : 'Top ' + n}</option>)}</select>
      </div>
      <table>
        <thead><tr><th>#</th><th>INSUMO</th><th className="r" style={{ whiteSpace: 'nowrap' }}>{colVal}</th><th className="r" style={{ whiteSpace: 'nowrap' }}>% DO TOTAL</th></tr></thead>
        <tbody>
          {rows.length ? rows.map((r) => <tr key={r.i}><td style={{ color: '#94a3b8', fontSize: 12 }}>{r.i + 1}.</td><td style={{ color: '#334155', fontSize: 13 }}>{r.nome}</td><td className="r mono" style={{ color: '#0f172a', fontSize: 13 }}>{r.val}</td><td className="r mono" style={{ color: '#64748b', fontSize: 12 }}>{r.pct}</td></tr>)
            : <tr><td colSpan={4} style={{ color: '#94a3b8', fontSize: 12, padding: '8px 6px' }}>Sem dados</td></tr>}
        </tbody>
      </table>
      <div style={{ textAlign: 'center', marginTop: 8 }}><span className="ci-vertodos" onClick={onVerTodos}>Ver todos</span></div>
    </div>
  )
}

function kfmt(v: number) { v = Number(v) || 0; const a = Math.abs(v); if (a >= 1e6) return (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi'; if (a >= 1e3) return (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil'; return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) }
function Chart({ labels, data, valor }: { labels: string[]; data: number[]; valor: boolean }) {
  if (!data.length || data.every((v) => !v)) return <div className="empty">Sem dados</div>
  const W = 1200, H = 360, padL = 70, padR = 20, padT = 18, padB = 34
  const max = Math.max(...data, 1), n = data.length
  const x = (i: number) => n <= 1 ? padL : (padL + (W - padL - padR) * i / (n - 1))
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max)
  const line = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${padL.toFixed(1)},${y(0).toFixed(1)} ${line} ${x(n - 1).toFixed(1)},${y(0).toFixed(1)}`
  const fmtY = (v: number) => valor ? 'R$ ' + kfmt(v) : kfmt(v)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {[0, 1, 2].map((g) => { const gv = max * g / 2, gy = y(gv); return <g key={g}><line x1={padL} y1={gy} x2={W - padR} y2={gy} stroke="#eef2f7" /><text x={padL - 8} y={gy + 4} textAnchor="end" fontSize={10} fill="#94a3b8">{fmtY(gv)}</text></g> })}
      <polygon points={area} fill="rgba(249,115,22,.10)" />
      <polyline points={line} fill="none" stroke="#f97316" strokeWidth={2} />
      {data.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={3} fill="#fff" stroke="#f97316" strokeWidth={2} />)}
      {labels.map((l, i) => (n <= 12 || i % 2 === 0) ? <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="#94a3b8">{l}</text> : null)}
    </svg>
  )
}
