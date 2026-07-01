import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import { custoDoInsumo } from '../lib/cost'
import './cmv.css'

type Insumo = { id: string; nome?: string; categoria?: string; unidade_medida?: string; unidade_compra?: string; rendimento_pct?: number }
type Ficha = { id: string; rendimento_porcoes?: number }
type ItemFicha = { ficha_id: string; insumo_id: string; quantidade_g?: number }
type Venda = { ficha_id?: string; produto_id?: string; quantidade?: number; valor_total?: number; loja_id?: string | null }
type Fat = { valor?: number; total?: number; valor_total?: number }
type Saida = { insumo_id: string; quantidade?: number; tipo?: string; loja_id?: string | null; criado_em?: string }
type Mov = { insumo_id: string; quantidade?: number; custo_unitario?: number; loja_id?: string | null; criado_em?: string; created_at?: string }
type Saldo = { insumo_id: string; loja_id?: string | null; custo_medio?: number }

const brl = (v?: number) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brlSigned = (v: number) => (v >= 0 ? '+' : '-') + 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fq = (v: number) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const getStatus = (pct: number): 'critico' | 'atencao' | 'ok' => { const a = Math.abs(pct); return a > 15 ? 'critico' : a > 5 ? 'atencao' : 'ok' }
const getCausa = (pct: number) => { if (Math.abs(pct) <= 5) return '—'; if (pct > 300) return 'Produção / Padrão'; if (pct > 50) return 'Perda não lançada'; if (pct > 15) return pct > 30 ? 'Rendimento / Perda' : 'Rendimento'; return 'Rendimento' }
const SC = { critico: { dot: '#e11d48', txt: 'Crítico' }, atencao: { dot: '#f59e0b', txt: 'Atenção' }, ok: { dot: '#22c55e', txt: 'Dentro do padrão' } }

function periodoRange(tipo: string): { de: string; ate: string } | null {
  const d = new Date()
  if (tipo === 'mes_atual') return { de: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`, ate: d.toLocaleDateString('en-CA') }
  if (tipo === 'mes_anterior') { const p = new Date(d.getFullYear(), d.getMonth() - 1, 1); const l = new Date(d.getFullYear(), d.getMonth(), 0); return { de: `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-01`, ate: l.toLocaleDateString('en-CA') } }
  return null
}

export function CmvTeoricoReal() {
  const { tenantId } = useAuth()
  const { lojaId } = useLoja()
  const ini = periodoRange('mes_atual')!
  const [de, setDe] = useState(ini.de)
  const [ate, setAte] = useState(ini.ate)
  const [cat, setCat] = useState('')
  const [apenasDiv, setApenasDiv] = useState(false)
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 3200) }

  // grupos p/ o filtro (categorias distintas dos insumos)
  const { data: grupos = [] } = useQuery({
    queryKey: ['cmv-grupos', tenantId], enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from('insumos').select('categoria').eq('tenant_id', tenantId)
      return [...new Set((data ?? []).map((i: { categoria?: string }) => i.categoria).filter(Boolean))].sort() as string[]
    },
  })

  const { data, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['cmv', tenantId, de, ate, cat], enabled: !!tenantId && !!de && !!ate,
    queryFn: async () => {
      const catEq = (q: any) => cat ? q.eq('categoria', cat) : q
      const [fats, vendas, fichas, insumos, saldos, entradas, saidas] = await Promise.all([
        supabase.from('faturamento').select('*').eq('tenant_id', tenantId).gte('data', de).lte('data', ate).then((r) => (r.data ?? []) as Fat[], () => [] as Fat[]),
        fetchAll<Venda>((f, t) => supabase.from('vendas_item').select('ficha_id,produto_id,quantidade,valor_total,loja_id').eq('tenant_id', tenantId).gte('data', de).lte('data', ate).order('id').range(f, t)).catch(() => [] as Venda[]),
        fetchAll<Ficha>((f, t) => supabase.from('fichas_tecnicas').select('id,rendimento_porcoes').eq('tenant_id', tenantId).eq('status', 'ativa').order('id').range(f, t)),
        fetchAll<Insumo>((f, t) => catEq(supabase.from('insumos').select('id,nome,categoria,unidade_medida,unidade_compra,rendimento_pct').eq('tenant_id', tenantId).eq('ativo', true)).order('nome').range(f, t)),
        fetchAll<Saldo>((f, t) => supabase.from('saldo_estoque').select('insumo_id,loja_id,custo_medio').eq('tenant_id', tenantId).order('insumo_id').range(f, t)),
        fetchAll<Mov>((f, t) => supabase.from('entradas_estoque').select('insumo_id,quantidade,custo_unitario,loja_id,criado_em').eq('tenant_id', tenantId).gte('criado_em', de).lte('criado_em', ate + 'T23:59:59').order('criado_em').range(f, t)).catch(() => [] as Mov[]),
        fetchAll<Saida>((f, t) => supabase.from('saidas_estoque').select('insumo_id,quantidade,tipo,loja_id,criado_em').eq('tenant_id', tenantId).gte('criado_em', de).lte('criado_em', ate + 'T23:59:59').order('criado_em').range(f, t)).catch(() => [] as Saida[]),
      ])
      const ids = fichas.map((f) => f.id)
      const itensFicha = ids.length
        ? await fetchAll<ItemFicha>((f, t) => supabase.from('itens_ficha').select('ficha_id,insumo_id,quantidade_g').in('ficha_id', ids).order('id').range(f, t)).catch(() => [] as ItemFicha[])
        : []
      return { fats, vendas, fichas, itensFicha, insumos, saldos, entradas, saidas }
    },
  })

  const calc = useMemo(() => {
    if (!data) return null
    const byLoja = <T extends { loja_id?: string | null }>(arr: T[]) => lojaId ? arr.filter((x) => (x.loja_id || null) === lojaId) : arr
    const vendas = byLoja(data.vendas)
    const saidas = byLoja(data.saidas)
    const entradas = byLoja(data.entradas)
    const saldos = byLoja(data.saldos)
    const { insumos, fichas, itensFicha, fats } = data

    const totalFat = fats.reduce((s, f) => s + (f.valor ?? f.total ?? f.valor_total ?? 0), 0) + vendas.reduce((s, v) => s + (v.valor_total || 0), 0)

    const teoMap: Record<string, number> = {}
    vendas.forEach((v) => {
      const fid = v.ficha_id || v.produto_id; if (!fid) return
      const f = fichas.find((x) => x.id === fid); if (!f) return
      const por = f.rendimento_porcoes || 1
      itensFicha.filter((i) => i.ficha_id === fid).forEach((it) => { teoMap[it.insumo_id] = (teoMap[it.insumo_id] || 0) + (it.quantidade_g || 0) / por * (v.quantidade || 0) })
    })
    const realMap: Record<string, number> = {}
    saidas.filter((s) => ['consumo', 'producao'].includes(s.tipo || '')).forEach((s) => { realMap[s.insumo_id] = (realMap[s.insumo_id] || 0) + (s.quantidade || 0) })

    const ctx = { saldos, insumos, entradas, saidas, dataLimite: ate }
    const rows = insumos.filter((i) => teoMap[i.id] || realMap[i.id]).map((i) => {
      const un = i.unidade_medida || i.unidade_compra || 'un'
      const div = ['kg', 'litro'].includes(un) ? 1000 : 1
      const qTeo = (teoMap[i.id] || 0) / div
      const qReal = realMap[i.id] || 0
      const cm = custoDoInsumo(i.id, null, ctx)
      const cTeo = qTeo * (cm / ((i.rendimento_pct || 100) / 100))
      const cReal = qReal * cm
      const dQtd = qReal - qTeo
      const dPct = qTeo > 0 ? dQtd / qTeo * 100 : 0
      const imp = cReal - cTeo
      return { i, un, qTeo, qReal, cTeo, cReal, dQtd, dPct, imp, st: getStatus(dPct) }
    })

    const totalTeo = rows.reduce((s, r) => s + r.cTeo, 0)
    const totalReal = rows.reduce((s, r) => s + r.cReal, 0)
    const dif = totalReal - totalTeo
    const divPct = totalTeo > 0 ? dif / totalTeo * 100 : 0
    const insAll = rows.length
    const comDiv = rows.filter((r) => r.qTeo > 0 && Math.abs(r.dPct) > 5).length
    return { totalFat, totalTeo, totalReal, dif, divPct, insAll, comDiv, rows }
  }, [data, lojaId, ate])

  const rows = useMemo(() => {
    if (!calc) return []
    let r = calc.rows
    if (apenasDiv) r = r.filter((x) => Math.abs(x.dPct) > 5)
    return [...r].sort((a, b) => Math.abs(b.dPct) - Math.abs(a.dPct))
  }, [calc, apenasDiv])

  const foot = useMemo(() => {
    const tTeo = rows.reduce((s, r) => s + r.cTeo, 0)
    const tReal = rows.reduce((s, r) => s + r.cReal, 0)
    const tDQ = rows.reduce((s, r) => s + r.dQtd, 0)
    const sumQTeo = rows.reduce((s, r) => s + r.qTeo, 0)
    const tPct = sumQTeo > 0 ? tDQ / sumQTeo * 100 : 0
    const tImp = tReal - tTeo
    const crit = rows.filter((r) => r.st === 'critico').length
    const okC = rows.filter((r) => r.st === 'ok').length
    const atenC = rows.filter((r) => r.st === 'atencao').length
    return { tTeo, tReal, tDQ, tPct, tImp, crit, okC, atenC }
  }, [rows])

  const setPeriodo = (tipo: string) => { const p = periodoRange(tipo); if (p) { setDe(p.de); setAte(p.ate) } }

  const exportCSV = () => {
    if (!calc) { showToast('Calcule primeiro.', 'err'); return }
    let csv = 'Insumo;UN;Qtd Teo;Custo Teo;Qtd Real;Custo Real;Dif Qtd;Dif%;Impacto;Status\n'
    calc.rows.forEach((r) => { csv += `${r.i.nome};${r.un};${r.qTeo.toFixed(3)};${r.cTeo.toFixed(2)};${r.qReal.toFixed(3)};${r.cReal.toFixed(2)};${r.dQtd.toFixed(3)};${r.dPct.toFixed(1)};${r.imp.toFixed(2)};${r.st}\n` })
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `cmv_${de}_${ate}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const ultimo = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleDateString('pt-BR') + ' ' + new Date(dataUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <div className="cmv-screen">
      <div className="ds-filterbar">
        <div className="ds-field">
          <label>Período</label>
          <select className="field" defaultValue="mes_atual" onChange={(e) => setPeriodo(e.target.value)} style={{ minWidth: 130 }}>
            <option value="periodo">Personalizado</option>
            <option value="mes_atual">Mês Atual</option>
            <option value="mes_anterior">Mês Anterior</option>
          </select>
        </div>
        <div className="ds-field"><label>De</label><input type="date" className="field" value={de} onChange={(e) => setDe(e.target.value)} /></div>
        <div className="ds-field"><label>Até</label><input type="date" className="field" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
        <div className="ds-field">
          <label>Grupo</label>
          <select className="field" value={cat} onChange={(e) => setCat(e.target.value)} style={{ minWidth: 130 }}>
            <option value="">Todos os grupos</option>
            {grupos.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className="ds-field">
          <label>Mostrar</label>
          <div className="tog-wrap">
            <label className="tog"><input type="checkbox" checked={apenasDiv} onChange={(e) => setApenasDiv(e.target.checked)} /><span className="tog-sl" /></label>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', whiteSpace: 'nowrap' }}>Apenas divergências</span>
          </div>
        </div>
        <div className="ds-actions">
          <button className="btn-primary" onClick={() => refetch()}>{isFetching ? 'Calculando…' : 'Calcular'}</button>
          <button className="btn-ghost" onClick={exportCSV}>Exportar CSV</button>
        </div>
      </div>

      <div className="kbar">
        <div className="it"><span className="k">Faturamento</span><span className="v">{brl(calc?.totalFat)}</span></div>
        <div className="it"><span className="k">CMV Teórico</span><span className="v">{brl(calc?.totalTeo)}</span></div>
        <div className="it"><span className="k">CMV Real</span><span className="v">{brl(calc?.totalReal)}</span></div>
        <div className="it"><span className="k">Diferença</span><span className="v" style={{ color: (calc?.dif ?? 0) > 0 ? '#e11d48' : (calc?.dif ?? 0) < 0 ? '#16a34a' : '#0f172a' }}>{calc ? (calc.dif >= 0 ? '+' : '') + brl(calc.dif) : 'R$ 0,00'}</span></div>
        <div className="it"><span className="k">Divergência</span><span className="v" style={{ color: Math.abs(calc?.divPct ?? 0) > 10 ? '#e11d48' : Math.abs(calc?.divPct ?? 0) > 5 ? '#f97316' : '#16a34a' }}>{(calc && calc.divPct >= 0 ? '+' : '') + (calc?.divPct ?? 0).toFixed(1)}%</span></div>
        <div className="it"><span className="k">Prod. c/ divergência</span><span className="v" style={{ color: '#f97316' }}>{calc?.comDiv ?? 0} / {calc?.insAll ?? 0}</span></div>
      </div>

      <div className="tbl-card">
        <div className="tbl-scroll">
          <table>
            <thead>
              <tr className="th-main">
                <th rowSpan={2} style={{ width: 150 }}>Insumo</th>
                <th rowSpan={2} style={{ width: 40 }}>UN.</th>
                <th colSpan={2} style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,.12)' }}>Consumo Teórico (Ficha)</th>
                <th colSpan={2} style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,.12)' }}>Consumo Real (Estoque)</th>
                <th rowSpan={2} style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,.12)', width: 90 }}>%</th>
                <th colSpan={2} style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,.12)' }}>Diferença</th>
                <th rowSpan={2} style={{ borderLeft: '1px solid rgba(255,255,255,.12)', width: 120 }}>Status</th>
                <th rowSpan={2} style={{ borderLeft: '1px solid rgba(255,255,255,.12)' }}>Possível Causa</th>
              </tr>
              <tr className="th-sub">
                <th style={{ borderLeft: '1px solid rgba(255,255,255,.06)' }}>Quantidade</th><th>Custo (R$)</th>
                <th style={{ borderLeft: '1px solid rgba(255,255,255,.06)' }}>Quantidade</th><th>Custo (R$)</th>
                <th style={{ borderLeft: '1px solid rgba(255,255,255,.06)' }}>Impacto (R$)</th><th>%</th>
              </tr>
            </thead>
            <tbody>
              {isFetching && !calc
                ? <tr><td colSpan={11} className="empty">Calculando…</td></tr>
                : !rows.length
                  ? <tr><td colSpan={11} className="empty">Nenhum insumo com dados no período</td></tr>
                  : rows.map((r) => {
                    const c = SC[r.st]
                    const sign = r.dQtd >= 0 ? '+' : '', psign = r.dPct >= 0 ? '+' : '', isign = r.imp >= 0 ? '+' : ''
                    return (
                      <tr key={r.i.id}>
                        <td style={{ fontWeight: 600 }}>{r.i.nome}</td>
                        <td style={{ color: '#64748b' }}>{r.un}</td>
                        <td className="r mono">{fq(r.qTeo)}</td>
                        <td className="r mono">{brl(r.cTeo)}</td>
                        <td className="r mono">{fq(r.qReal)}</td>
                        <td className="r mono">{brl(r.cReal)}</td>
                        <td className="c">
                          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{psign}{r.dPct.toFixed(1)}%</div>
                          <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: "'DM Mono', monospace" }}>{r.cReal > 0 ? brl(r.cReal).replace('R$ ', '') : ''}</div>
                        </td>
                        <td className="r mono" style={{ fontWeight: 600 }}>{sign}{fq(r.dQtd)}</td>
                        <td className="r mono" style={{ fontWeight: 600 }}>{isign}{brl(Math.abs(r.imp))}</td>
                        <td><span className="status-dot"><span className="dot" style={{ background: c.dot }} /><span style={{ color: c.dot, fontSize: 11, fontWeight: 600 }}>{c.txt}</span></span></td>
                        <td style={{ color: '#64748b', fontSize: 12 }}>{getCausa(r.dPct)}</td>
                      </tr>
                    )
                  })}
            </tbody>
            {rows.length > 0 && <tfoot>
              <tr>
                <td>TOTAL GERAL</td><td>—</td>
                <td /><td className="r mono">{brl(foot.tTeo)}</td>
                <td /><td className="r mono">{brl(foot.tReal)}</td>
                <td className="c" style={{ fontFamily: "'DM Mono', monospace" }}>{(foot.tPct >= 0 ? '+' : '') + foot.tPct.toFixed(1)}%</td>
                <td className="r mono">{(foot.tDQ >= 0 ? '+' : '') + fq(foot.tDQ)}</td>
                <td className="r mono">{brlSigned(foot.tImp)}</td>
                <td style={{ color: foot.crit > 0 ? '#fca5a5' : 'rgba(255,255,255,.6)', fontSize: 12 }}>{foot.crit} crítico{foot.crit !== 1 ? 's' : ''}</td>
                <td />
              </tr>
            </tfoot>}
          </table>
        </div>
      </div>

      <div className="bottom-row">
        <div className="bottom-left">
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>Resumo das Divergências</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#64748b' }}><span className="dot" style={{ background: '#22c55e' }} />Dentro do padrão: <strong>{foot.okC}</strong></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#64748b' }}><span className="dot" style={{ background: '#f59e0b' }} />Atenção (5% a 15%): <strong>{foot.atenC}</strong></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#64748b' }}><span className="dot" style={{ background: '#e11d48' }} />Crítico (&gt; 15%): <strong>{foot.crit}</strong></div>
            <div style={{ marginLeft: 12, fontSize: 13, color: '#64748b' }}>Impacto financeiro total: <strong style={{ color: foot.tImp >= 0 ? '#e11d48' : '#16a34a', fontFamily: "'DM Mono', monospace" }}>{brlSigned(foot.tImp)}</strong></div>
          </div>
        </div>
        <div className="bottom-right">
          <div style={{ fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Regras de classificação:</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <span><span className="dot" style={{ background: '#e11d48', display: 'inline-block', verticalAlign: 'middle', marginRight: 3 }} />Crítico &gt; 15%</span>
            <span style={{ color: '#e2e8f0' }}>·</span>
            <span><span className="dot" style={{ background: '#f59e0b', display: 'inline-block', verticalAlign: 'middle', marginRight: 3 }} />Atenção 5% a 15%</span>
            <span style={{ color: '#e2e8f0' }}>·</span>
            <span><span className="dot" style={{ background: '#22c55e', display: 'inline-block', verticalAlign: 'middle', marginRight: 3 }} />Dentro do padrão ≤ 5%</span>
          </div>
        </div>
      </div>

      <div className="bottom-bar">
        <span>Último cálculo: {ultimo}</span>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', padding: 0 }} onClick={() => refetch()}>↻ Atualizar cálculo</button>
      </div>

      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}
