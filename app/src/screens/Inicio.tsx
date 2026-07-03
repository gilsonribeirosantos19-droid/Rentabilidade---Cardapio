import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import './inicio.css'

type Insumo = { id: string; nome: string }
type Saldo = { insumo_id: string; loja_id?: string | null; quantidade?: number; custo_medio?: number; minimo?: number | null }
type Mov = { insumo_id: string; loja_id?: string | null; quantidade?: number; custo_total?: number; tipo?: string; motivo?: string | null; criado_em?: string }
type Inv = { loja_id?: string | null; status?: string }
type Cmp = { loja_id: string; valor_estoque?: number; compras_mes?: number; perdas_mes?: number; consumo_mes?: number; fat_mes?: number; inv_ativos?: number; inv_total?: number }

const brl = (v?: number | null) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function Inicio() {
  const { tenantId } = useAuth()
  const { lojas, lojaId } = useLoja()
  const now = new Date()
  const iniMesISO = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const iniMesDia = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const { data: insumos = [] } = useQuery({ queryKey: ['inc-insumos', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome').eq('tenant_id', tenantId).eq('ativo', true).order('nome').range(f, t)) })
  const { data: saldos = [] } = useQuery({ queryKey: ['inc-saldos', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Saldo>((f, t) => supabase.from('saldo_estoque').select('*').eq('tenant_id', tenantId).order('insumo_id').range(f, t)) })
  const { data: entradas = [] } = useQuery({ queryKey: ['inc-entradas', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Mov>((f, t) => supabase.from('entradas_estoque').select('insumo_id,loja_id,quantidade,custo_total,tipo,criado_em').eq('tenant_id', tenantId).order('criado_em').range(f, t)) })
  const { data: saidas = [] } = useQuery({ queryKey: ['inc-saidas', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Mov>((f, t) => supabase.from('saidas_estoque').select('insumo_id,loja_id,quantidade,tipo,motivo,criado_em').eq('tenant_id', tenantId).order('criado_em').range(f, t)) })
  const { data: inventarios = [] } = useQuery({ queryKey: ['inc-inv', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('inventarios').select('loja_id,status').eq('tenant_id', tenantId); return (data ?? []) as Inv[] } })
  const { data: pedidos = [] } = useQuery({ queryKey: ['inc-pedidos', tenantId], enabled: !!tenantId, queryFn: async () => { try { const { data } = await supabase.from('pedidos_compra').select('status,loja_id').eq('tenant_id', tenantId); return (data ?? []) as { status?: string; loja_id?: string }[] } catch { return [] } } })
  const { data: faturamentos = [] } = useQuery({ queryKey: ['inc-fat', tenantId, iniMesDia], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('faturamento').select('valor,data').eq('tenant_id', tenantId).gte('data', iniMesDia); return (data ?? []) as { valor?: number; data?: string }[] } })
  const { data: cmp = [] } = useQuery({ queryKey: ['inc-cmp', tenantId, iniMesISO], enabled: !!tenantId, queryFn: async () => { const { data, error } = await supabase.rpc('comparativo_lojas', { p_tenant: tenantId, p_inicio: iniMesISO }); if (error) throw error; return (data ?? []) as Cmp[] } })

  const byLoja = <T extends { loja_id?: string | null }>(arr: T[]) => lojaId ? arr.filter((x) => (x.loja_id || null) === lojaId) : arr
  const entradasL = useMemo(() => byLoja(entradas), [entradas, lojaId])
  const saidasL = useMemo(() => byLoja(saidas), [saidas, lojaId])
  const getSaldo = (id: string): Saldo => saldos.find((s) => s.insumo_id === id && (!lojaId || s.loja_id === lojaId)) || { insumo_id: id, quantidade: 0, custo_medio: 0, minimo: null }

  // ---- KPIs ----
  const k = useMemo(() => {
    const iniSem = new Date(now); iniSem.setDate(now.getDate() - 7); iniSem.setHours(0, 0, 0, 0)
    const iniMes = new Date(now.getFullYear(), now.getMonth(), 1)
    const iniSemAnt = new Date(iniSem); iniSemAnt.setDate(iniSemAnt.getDate() - 7)
    const dt = (m: Mov) => new Date(m.criado_em || '')
    const compSem = entradasL.filter((e) => dt(e) >= iniSem).length
    const compSemAnt = entradasL.filter((e) => dt(e) >= iniSemAnt && dt(e) < iniSem).length
    const compMes = entradasL.filter((e) => dt(e) >= iniMes).reduce((s, e) => s + (e.custo_total || 0), 0)
    const isPerda = (s: Mov) => ['perda', 'vencimento', 'descarte'].includes(s.tipo || '')
    const perdSem = saidasL.filter((s) => isPerda(s) && dt(s) >= iniSem).length
    const perdSemAnt = saidasL.filter((s) => isPerda(s) && dt(s) >= iniSemAnt && dt(s) < iniSem).length
    const perdMes = saidasL.filter((s) => isPerda(s) && dt(s) >= iniMes).length
    const valEst = insumos.reduce((s, i) => { const sd = getSaldo(i.id); return s + (sd.quantidade || 0) * (sd.custo_medio || 0) }, 0)
    return { compSem, compSemAnt, compMes, perdSem, perdSemAnt, perdMes, valEst }
  }, [entradasL, saidasL, insumos, saldos, lojaId])

  const cmpSem = k.compSemAnt === 0 ? null : { pct: Math.abs(((k.compSem - k.compSemAnt) / k.compSemAnt) * 100).toFixed(1), up: k.compSem >= k.compSemAnt }
  const cmpPerd = k.perdSemAnt === 0 ? null : { pct: Math.abs(((k.perdSem - k.perdSemAnt) / k.perdSemAnt) * 100).toFixed(1), good: k.perdSem <= k.perdSemAnt }

  // ---- Pendências ----
  const pedPend = byLoja(pedidos as any).filter((p: any) => p.status === 'pendente' || p.status === 'aprovado').length
  const diverg = saidasL.filter((s) => !s.motivo).length
  const invAbertos = byLoja(inventarios).filter((i) => i.status === 'ativo').length

  // ---- Alertas ----
  const ruptura = insumos.filter((i) => (getSaldo(i.id).quantidade || 0) <= 0).length
  const critico = insumos.filter((i) => { const s = getSaldo(i.id); return (s.quantidade || 0) > 0 && s.minimo != null && (s.quantidade || 0) <= (s.minimo || 0) }).length
  const vSaidaMes = saidasL.filter((s) => (s.criado_em || '') >= iniMesISO && s.tipo === 'consumo').reduce((acc, s) => acc + (s.quantidade || 0) * (getSaldo(s.insumo_id).custo_medio || 0), 0)
  const fatMes = (faturamentos as any[]).filter((f: any) => (f.data || '') >= iniMesDia).reduce((s: number, f: any) => s + (f.valor || 0), 0)
  const cmvPct = fatMes > 0 ? (vSaidaMes / fatMes * 100).toFixed(1) : null

  // ---- Cobertura (Estoque Crítico / Ruptura Prevista) ----
  const cobertura = useMemo(() => {
    const iniMes = new Date(now.getFullYear(), now.getMonth(), 1)
    const dias = now.getDate()
    return insumos.map((ins) => {
      const est = getSaldo(ins.id).quantidade || 0
      const consumo = saidasL.filter((x) => x.insumo_id === ins.id && x.tipo === 'consumo' && new Date(x.criado_em || '') >= iniMes).reduce((a, x) => a + (x.quantidade || 0), 0)
      const media = consumo / Math.max(dias, 1)
      const cob = media > 0 ? est / media : Infinity
      return { ins, cob }
    }).filter((r) => r.cob !== Infinity)
  }, [insumos, saidasL, saldos, lojaId])
  const criticos = cobertura.filter((r) => r.cob < 30).sort((a, b) => a.cob - b.cob).slice(0, 5)
  const rupturas = cobertura.filter((r) => r.cob < 7).sort((a, b) => a.cob - b.cob).slice(0, 5)

  // ---- Comparativo por loja ----
  const lojasFilt = lojaId ? lojas.filter((l) => l.id === lojaId) : lojas
  const aggMap = useMemo(() => Object.fromEntries(cmp.map((r) => [r.loja_id, r])) as Record<string, Cmp>, [cmp])
  const maxComp = Math.max(...lojasFilt.map((l) => Number(aggMap[l.id]?.compras_mes) || 0), 1)
  const tot = lojasFilt.reduce((t, l) => { const a = aggMap[l.id] || {}; t.val += +(a.valor_estoque || 0); t.comp += +(a.compras_mes || 0); t.perd += +(a.perdas_mes || 0); t.cons += +(a.consumo_mes || 0); t.fat += +(a.fat_mes || 0); t.inv += +(a.inv_ativos || 0); t.invT += +(a.inv_total || 0); return t }, { val: 0, comp: 0, perd: 0, cons: 0, fat: 0, inv: 0, invT: 0 })

  const covTxt = (d: number) => d < 1 ? `${(d * 24).toFixed(0)}h` : `${d.toFixed(1)} dia${d >= 2 ? 's' : ''}`
  const covColor = (d: number) => d < 2 ? '#e11d48' : d < 7 ? '#f97316' : '#f59e0b'

  return (
    <div className="inicio-screen">
      <div className="inc-grid">
        <div>
          {/* KPIs */}
          <div className="kpi-5">
            <div className="kpi-card"><div className="kpi-label">Compras da Semana</div><div className="kpi-icon-row"><div className="kpi-icon" style={{ background: '#f0fdf4' }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth={2}><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg></div><div><div className="kpi-val">{k.compSem}</div><div className="kpi-unit">entradas</div></div></div><div className={'kpi-cmp ' + (cmpSem ? (cmpSem.up ? 'up' : 'down') : 'neutral')}>{cmpSem ? `${cmpSem.up ? '↑' : '↓'} ${cmpSem.pct}% vs período anterior` : '— sem período anterior'}</div></div>
            <div className="kpi-card"><div className="kpi-label">Compras do Mês</div><div className="kpi-icon-row"><div className="kpi-icon" style={{ background: '#eff6ff' }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth={2}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg></div><div><div className="kpi-val" style={{ fontSize: 16 }}>{brl(k.compMes)}</div></div></div><div className="kpi-cmp neutral">total de entradas no mês</div></div>
            <div className="kpi-card"><div className="kpi-label">Valor do Estoque</div><div className="kpi-icon-row"><div className="kpi-icon" style={{ background: '#fff7ed' }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth={2}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 3H8" /></svg></div><div><div className="kpi-val" style={{ fontSize: 16 }}>{brl(k.valEst)}</div></div></div><div className="kpi-cmp neutral">custo médio × saldo</div></div>
            <div className="kpi-card"><div className="kpi-label">Perdas da Semana</div><div className="kpi-icon-row"><div className="kpi-icon" style={{ background: '#fff1f2' }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth={2}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /></svg></div><div><div className="kpi-val">{k.perdSem}</div><div className="kpi-unit">registros</div></div></div><div className={'kpi-cmp ' + (cmpPerd ? (cmpPerd.good ? 'up' : 'down') : 'neutral')}>{cmpPerd ? `${cmpPerd.good ? '↓' : '↑'} ${cmpPerd.pct}% vs período anterior` : '— sem período anterior'}</div></div>
            <div className="kpi-card"><div className="kpi-label">Perdas do Mês</div><div className="kpi-icon-row"><div className="kpi-icon" style={{ background: '#fff1f2' }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth={2}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg></div><div><div className="kpi-val">{k.perdMes}</div><div className="kpi-unit">registro(s)</div></div></div><div className="kpi-cmp neutral">perdas registradas no mês</div></div>
          </div>

          {/* Pendências */}
          <div className="sec-title">Pendências Operacionais</div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Item</th><th className="r">Quantidade</th><th style={{ width: 30 }} /></tr></thead>
              <tbody>
                {[
                  { ic: '#fff7ed', col: '#f97316', label: 'Pedidos pendentes para enviar', n: pedPend, nc: '#22c55e' },
                  { ic: '#fff7ed', col: '#f97316', label: 'Divergências de estoque', n: diverg, nc: '#f97316' },
                  { ic: '#f0fdf4', col: '#16a34a', label: 'Inventários em aberto', n: invAbertos, nc: '#22c55e' },
                  { ic: '#eff6ff', col: '#2563eb', label: 'Solicitações pendentes aguardando aprovação', n: 0, nc: '#22c55e' },
                ].map((r, i) => (
                  <tr key={i}>
                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div className="pend-ic" style={{ background: r.ic }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={r.col} strokeWidth={2}><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg></div><span style={{ fontSize: 13, fontWeight: 500 }}>{r.label}</span></div></td>
                    <td className="r"><span className="pend-num" style={{ color: r.nc }}>{r.n}</span></td>
                    <td><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth={2}><polyline points="9 18 15 12 9 6" /></svg></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Comparativo por Loja */}
          <div className="sec-title">Comparativo por Loja <span className="sec-sub">— mês atual</span></div>
          <div className="tbl-wrap" style={{ marginBottom: 6 }}>
            <table className="tbl">
              <thead><tr><th>Loja</th><th className="r">Valor do Estoque</th><th>Compras do Mês</th><th className="r">Perdas (R$)</th><th className="r">CMV Real</th><th className="r">Inventários</th></tr></thead>
              <tfoot><tr><td>TOTAL GERAL</td><td className="r mono">{brl(tot.val)}</td><td className="mono" style={{ fontSize: 12 }}>{brl(tot.comp)}</td><td className="r mono">{brl(tot.perd)}</td><td className="r mono">{tot.fat > 0 ? (tot.cons / tot.fat * 100).toFixed(1) + '%' : '—'}</td><td className="r">{tot.inv} / {tot.invT}</td></tr></tfoot>
              <tbody>
                {lojasFilt.length === 0 ? <tr><td colSpan={6} className="muted" style={{ textAlign: 'center' }}>Sem lojas cadastradas</td></tr>
                  : lojasFilt.map((loja) => {
                    const a = aggMap[loja.id] || {}
                    const compMes = +(a.compras_mes || 0), perdMes = +(a.perdas_mes || 0), fat = +(a.fat_mes || 0), cons = +(a.consumo_mes || 0)
                    const cmv = fat > 0 ? (cons / fat * 100).toFixed(1) : '—'
                    const barPct = maxComp > 0 ? Math.round(compMes / maxComp * 100) : 0
                    return (
                      <tr key={loja.id}>
                        <td style={{ fontWeight: 600 }}><span className="loja-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth={2}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg></span>{loja.nome}</td>
                        <td className="r mono">{brl(a.valor_estoque)}</td>
                        <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className="mini-bar-wrap"><div className="mini-bar" style={{ width: barPct + '%', background: compMes > 0 ? '#22c55e' : '#e2e8f0' }} /></div><span className="mono" style={{ fontSize: 12 }}>{brl(compMes)}</span></div></td>
                        <td className="r mono" style={{ color: perdMes > 0 ? '#e11d48' : undefined }}>{brl(perdMes)}</td>
                        <td className="r mono">{cmv !== '—' ? cmv + '%' : '—'}</td>
                        <td className="r" style={{ color: (+(a.inv_ativos || 0)) > 0 ? '#f97316' : '#94a3b8', fontWeight: 600 }}>{+(a.inv_ativos || 0)} / {+(a.inv_total || 0)}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
          <div className="muted">{lojasFilt.length === lojas.length ? 'Exibindo todos os registros' : `Exibindo ${lojasFilt.length} loja(s)`}</div>
        </div>

        {/* RIGHT SIDEBAR */}
        <div>
          <div className="right-panel">
            <div className="rp-title">Alertas Importantes</div>
            <div className="alert-row" style={{ background: '#fef2f2' }}>
              <div className="alert-dot" style={{ background: ruptura > 0 ? '#fee2e2' : '#f0fdf4', color: ruptura > 0 ? '#e11d48' : '#16a34a', fontFamily: 'DM Mono, monospace', fontWeight: 800 }}>{ruptura}</div>
              <div><div className="alert-row-title">{ruptura} {ruptura !== 1 ? 'itens' : 'item'} em ruptura</div><div className="alert-row-sub">Sem estoque disponível</div></div><span className="alert-row-arrow">›</span>
            </div>
            <div className="alert-row" style={{ background: '#fffbeb' }}>
              <div className="alert-dot" style={{ background: '#fff7ed', color: '#f97316', fontFamily: 'DM Mono, monospace', fontWeight: 800 }}>{critico}</div>
              <div><div className="alert-row-title">{critico} {critico !== 1 ? 'itens' : 'item'} com estoque crítico</div><div className="alert-row-sub">Abaixo da cobertura ideal</div></div><span className="alert-row-arrow">›</span>
            </div>
            <div className="alert-row" style={{ background: '#eff6ff' }}>
              <div className="alert-dot" style={{ background: '#dbeafe' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth={2.5}><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg></div>
              <div><div className="alert-row-title">CMV {cmvPct ? cmvPct + '%' : 'sem dados'}</div><div className="alert-row-sub">{cmvPct && +cmvPct > 30 ? 'Acima da meta (28,0%)' : 'Dentro da meta'}</div></div><span className="alert-row-arrow">›</span>
            </div>
            <div className="alert-row" style={{ background: '#f0fdf4' }}>
              <div className="alert-dot" style={{ background: '#dcfce7', color: '#16a34a', fontFamily: 'DM Mono, monospace', fontWeight: 800 }}>0</div>
              <div><div className="alert-row-title">0 inventários atrasados</div><div className="alert-row-sub">Tudo em dia</div></div><span className="alert-row-arrow">›</span>
            </div>
          </div>

          <div className="right-panel">
            <div className="rp-title">Estoque Crítico (Cobertura)</div>
            {criticos.length === 0 ? <div className="muted">Nenhum item crítico</div>
              : criticos.map((r) => <div key={r.ins.id} className="crit-row"><span className="crit-nome">{r.ins.nome}</span><span className="crit-dias" style={{ color: covColor(r.cob) }}>{covTxt(r.cob)}</span></div>)}
          </div>

          <div className="right-panel">
            <div className="rp-title">Ruptura Prevista</div>
            {rupturas.length === 0 ? <div className="muted">Nenhuma ruptura prevista</div>
              : rupturas.map((r) => { const d = r.cob; const txt = d < 1 ? 'hoje' : d < 2 ? 'amanhã' : d < 3 ? 'em 1 dia' : `em ${Math.floor(d)} dias`; const color = d < 3 ? '#e11d48' : d < 5 ? '#f97316' : '#f59e0b'; return <div key={r.ins.id} className="crit-row"><span className="crit-nome">{r.ins.nome}</span><span className="crit-dias" style={{ color }}>{txt}</span></div> })}
          </div>
        </div>
      </div>
    </div>
  )
}
