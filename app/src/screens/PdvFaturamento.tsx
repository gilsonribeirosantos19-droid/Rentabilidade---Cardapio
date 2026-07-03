import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ChartConfiguration } from 'chart.js'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { ChartBox } from '../components/ChartBox'
import './pdv.css'

type Fat = { id: string; data: string; canal?: string; valor?: number; observacao?: string | null }

const CANAL_CORES: Record<string, string> = { 'salão': '#3b82f6', delivery: '#f97316', ifood: '#10b981', rappi: '#8b5cf6', 'balcão': '#f59e0b', outros: '#94a3b8' }
const CANAL_NOMES: Record<string, string> = { 'salão': 'Salão', delivery: 'Delivery (App)', ifood: 'iFood', rappi: 'Rappi', 'balcão': 'Balcão', outros: 'Outros' }

const brl = (v?: number | null) => (v == null || v === undefined) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const hojeLocal = () => new Date().toLocaleDateString('en-CA')
const mesInicio = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }

type Form = { id: string | null; data: string; canal: string; valor: string; obs: string }
const novoForm = (): Form => ({ id: null, data: hojeLocal(), canal: 'salão', valor: '', obs: '' })

export function PdvFaturamento() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const [de, setDe] = useState(mesInicio())
  const [ate, setAte] = useState(hojeLocal())
  const [agrup, setAgrup] = useState<'dia' | 'semana' | 'canal'>('dia')
  const [modal, setModal] = useState<Form | null>(null)
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 3200) }

  const { data: fats = [] } = useQuery({
    queryKey: ['pdv-fat', tenantId, de, ate], enabled: !!tenantId && !!de && !!ate,
    queryFn: async () => fetchAll<Fat>((f, t) => supabase.from('faturamento').select('id,data,canal,valor,observacao').eq('tenant_id', tenantId).gte('data', de).lte('data', ate).order('data').range(f, t)),
  })

  // KPIs
  const kpi = useMemo(() => {
    const total = fats.reduce((s, f) => s + (f.valor || 0), 0)
    const pedidos = fats.length
    const ticket = pedidos > 0 ? total / pedidos : 0
    const dias = new Set(fats.map((f) => f.data)).size
    const diario = dias > 0 ? total / dias : 0
    const canais = new Set(fats.map((f) => f.canal)).size
    return { total, pedidos, ticket, diario, canais }
  }, [fats])

  // agrupamento p/ gráfico de linha/barra + tabela diária
  const grupos = useMemo(() => {
    const g: Record<string, { fat: number; ped: number }> = {}
    fats.forEach((f) => {
      let key = f.data
      if (agrup === 'semana') { const d = new Date(f.data + 'T12:00:00'); const dow = d.getDay(); const diff = d.getDate() - dow + (dow === 0 ? -6 : 1); key = new Date(d.setDate(diff)).toISOString().split('T')[0] }
      else if (agrup === 'canal') key = f.canal || 'outros'
      if (!g[key]) g[key] = { fat: 0, ped: 0 }
      g[key].fat += (f.valor || 0); g[key].ped += 1
    })
    return g
  }, [fats, agrup])

  const lineConfig = useMemo<ChartConfiguration>(() => {
    const labels = Object.keys(grupos).sort()
    const values = labels.map((k) => grupos[k].fat)
    const fmtKey = (k: string) => agrup === 'canal' ? (CANAL_NOMES[k] || k) : k.split('-').slice(1).reverse().join('/')
    return {
      type: agrup === 'canal' ? 'bar' : 'line',
      data: { labels: labels.map(fmtKey), datasets: [{ data: values, borderColor: '#3b82f6', backgroundColor: agrup === 'canal' ? labels.map((k) => CANAL_CORES[k] || '#3b82f6') : 'rgba(59,130,246,.08)', borderWidth: 2, pointBackgroundColor: '#3b82f6', pointRadius: 4, tension: 0.4, fill: true }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => brl(c.raw as number) } } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#94a3b8' } }, y: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 }, color: '#94a3b8', callback: (v) => (v as number) >= 1000 ? Math.round((v as number) / 1000) + 'K' : v } } } },
    }
  }, [grupos, agrup])

  // donut por canal (independe do agrupamento)
  const porCanal = useMemo(() => {
    const p: Record<string, number> = {}
    fats.forEach((f) => { const c = f.canal || 'outros'; p[c] = (p[c] || 0) + (f.valor || 0) })
    return Object.entries(p).sort((a, b) => b[1] - a[1])
  }, [fats])

  const donutConfig = useMemo<ChartConfiguration>(() => ({
    type: 'doughnut',
    data: { labels: porCanal.map(([c]) => CANAL_NOMES[c] || c), datasets: [{ data: porCanal.map(([, v]) => v), backgroundColor: porCanal.map(([c]) => CANAL_CORES[c] || '#94a3b8'), borderWidth: 2, borderColor: '#fff', hoverOffset: 4 }] },
    options: { responsive: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${brl(ctx.raw as number)} (${kpi.total > 0 ? ((ctx.raw as number) / kpi.total * 100).toFixed(1) : 0}%)` } } }, cutout: '70%' },
  }), [porCanal, kpi.total])

  // tabela diária (só quando agrupado por dia): últimos 7 dias com VS dia anterior
  const diaria = useMemo(() => {
    if (agrup !== 'dia') return null
    const dias = Object.keys(grupos).filter((k) => /^\d{4}-/.test(k)).sort().reverse()
    return dias.slice(0, 7).map((d, i) => {
      const g = grupos[d], ant = dias[i + 1] ? grupos[dias[i + 1]] : null
      const varPct = ant && ant.fat ? ((g.fat - ant.fat) / ant.fat * 100) : null
      const semana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][new Date(d + 'T12:00:00').getDay()]
      const dFmt = d.split('-').slice(1).reverse().join('/') + '/' + d.split('-')[0].slice(2) + ' (' + semana + ')'
      return { d, dFmt, fat: g.fat, ped: g.ped, ticket: g.ped > 0 ? g.fat / g.ped : 0, varPct }
    })
  }, [grupos, agrup])

  const saveMut = useMutation({
    mutationFn: async (f: Form) => {
      const valor = parseFloat(f.valor)
      if (!f.data || !f.canal || isNaN(valor) || valor <= 0) throw new Error('Preencha data, canal e valor.')
      const payload = { tenant_id: tenantId, data: f.data, canal: f.canal, valor, observacao: f.obs.trim() || null }
      if (f.id) { const { error } = await supabase.from('faturamento').update(payload).eq('id', f.id); if (error) throw error }
      else { const { error } = await supabase.from('faturamento').insert(payload); if (error) throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pdv-fat'] }); setModal(null); showToast('Faturamento salvo!', 'ok') },
    onError: (e: Error) => showToast('Erro: ' + e.message, 'err'),
  })

  const exportCSV = () => {
    if (!fats.length) { showToast('Sem dados para exportar', 'err'); return }
    const header = 'Data,Canal,Valor,Observacao'
    const rows = fats.map((f) => `${f.data},${f.canal || ''},${f.valor || 0},"${(f.observacao || '').replace(/"/g, '""')}"`)
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'faturamento.csv'; a.click()
  }

  const setF = (k: keyof Form, v: string) => setModal((m) => m && ({ ...m, [k]: v }))

  return (
    <div className="pdv-screen">
      <div className="db-filter">
        <div className="date-range">
          <input type="date" className="field" value={de} onChange={(e) => setDe(e.target.value)} />
          <span style={{ color: '#94a3b8' }}>–</span>
          <input type="date" className="field" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        <button className="btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => setModal(novoForm())}>+ Lançar faturamento</button>
      </div>

      <div className="kpi-row">
        <div className="kpi-card"><div className="kpi-icon ki-blue"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg></div><div><div className="kpi-lbl">Faturamento Total</div><div className="kpi-val">{brl(kpi.total)}</div><div className="kpi-sub">no período</div></div></div>
        <div className="kpi-card"><div className="kpi-icon ki-green"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /></svg></div><div><div className="kpi-lbl">Faturamento Médio Diário</div><div className="kpi-val">{brl(kpi.diario)}</div><div className="kpi-sub">média por dia</div></div></div>
        <div className="kpi-card"><div className="kpi-icon ki-indigo"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg></div><div><div className="kpi-lbl">Nº de Pedidos</div><div className="kpi-val">{kpi.pedidos.toLocaleString('pt-BR')}</div><div className="kpi-sub">no período</div></div></div>
        <div className="kpi-card"><div className="kpi-icon ki-orange"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}><path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="2" /></svg></div><div><div className="kpi-lbl">Ticket Médio</div><div className="kpi-val">{brl(kpi.ticket)}</div><div className="kpi-sub">por pedido</div></div></div>
        <div className="kpi-card"><div className="kpi-icon ki-teal"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg></div><div><div className="kpi-lbl">Canais Ativos</div><div className="kpi-val">{kpi.canais}</div><div className="kpi-sub">no período</div></div></div>
      </div>

      <div className="dash-grid">
        <div>
          <div className="dash-card">
            <div className="dash-head">
              <span className="dash-head-title">Faturamento ao Longo do Tempo</span>
              <select className="field" style={{ height: 30, padding: '0 8px', fontSize: 11 }} value={agrup} onChange={(e) => setAgrup(e.target.value as 'dia' | 'semana' | 'canal')}>
                <option value="dia">Agrupado por: Dia</option><option value="semana">Semana</option><option value="canal">Canal</option>
              </select>
            </div>
            <div className="dash-body"><div className="chart-wrap"><ChartBox config={lineConfig} style={{ width: '100%', height: '100%' }} /></div></div>
          </div>

          <div className="dash-card">
            <div className="dash-head"><span className="dash-head-title">Faturamento por Dia</span></div>
            <table className="tbl">
              <thead><tr><th>Data</th><th className="r">Faturamento</th><th className="r">Nº Pedidos</th><th className="r">Ticket Médio</th><th className="r">VS Dia Anterior</th></tr></thead>
              <tbody>
                {!diaria ? <tr><td colSpan={5} className="empty">Selecione "Dia" para ver detalhes diários</td></tr>
                  : !diaria.length ? <tr><td colSpan={5} className="empty">Sem dados no período</td></tr>
                    : diaria.map((r) => (
                      <tr key={r.d}>
                        <td>{r.dFmt}</td>
                        <td className="r mono" style={{ fontWeight: 600 }}>{brl(r.fat)}</td>
                        <td className="r mono">{r.ped}</td>
                        <td className="r mono">{brl(r.ticket)}</td>
                        <td className="r" style={{ fontWeight: 600, color: r.varPct === null ? '#94a3b8' : r.varPct >= 0 ? '#10b981' : '#ef4444' }}>{r.varPct === null ? '—' : (r.varPct >= 0 ? '↑' : '↓') + Math.abs(r.varPct).toFixed(1) + '%'}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="dash-card">
            <div className="dash-head"><span className="dash-head-title">Faturamento por Canal</span></div>
            <div className="dash-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <div style={{ position: 'relative', width: 160, height: 160, flexShrink: 0 }}>
                  {porCanal.length > 0 && <ChartBox config={donutConfig} width={160} height={160} />}
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Total</div>
                    <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: '#0f172a' }}>{brl(kpi.total)}</div>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  {porCanal.map(([c, v]) => (
                    <div className="canal-leg-row" key={c}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div className="canal-dot" style={{ background: CANAL_CORES[c] || '#94a3b8' }} /><span>{CANAL_NOMES[c] || c}</span></div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><span className="mono" style={{ fontWeight: 600 }}>{brl(v)}</span><span style={{ color: '#94a3b8', minWidth: 38, textAlign: 'right' }}>{kpi.total > 0 ? (v / kpi.total * 100).toFixed(1) : 0}%</span></div>
                    </div>
                  ))}
                  <div className="canal-leg-row" style={{ borderTop: '1px solid #e2e8f0' }}>
                    <span style={{ fontWeight: 700 }}>Total</span>
                    <span className="mono" style={{ fontWeight: 600 }}>{brl(kpi.total)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="dash-card">
            <div className="dash-head"><span className="dash-head-title">Resumo do Período</span><button className="btn-ghost" style={{ height: 28, padding: '0 10px', fontSize: 11 }} onClick={exportCSV}>↓ Exportar</button></div>
            <div className="dash-body">
              <div className="resumo-row"><span>Faturamento bruto</span><span className="mono">{brl(kpi.total)}</span></div>
              <div className="resumo-row neg"><span>Descontos concedidos</span><span className="mono">—</span></div>
              <div className="resumo-row neg"><span>Taxas de entrega</span><span className="mono">—</span></div>
              <div className="resumo-row dest"><span>Faturamento líquido</span><span className="mono">{brl(kpi.total)}</span></div>
              <div className="resumo-row neg"><span>Impostos sobre vendas</span><span className="mono">—</span></div>
              <div className="resumo-row"><span>Total líquido (pós impostos)</span><span className="mono">{brl(kpi.total)}</span></div>
            </div>
          </div>
        </div>
      </div>

      {modal && (
        <div className="ov" onClick={(e) => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="modal">
            <h2>{modal.id ? 'Editar Faturamento' : 'Lançar Faturamento'}</h2>
            <div className="fg"><label>Data *</label><input type="date" value={modal.data} onChange={(e) => setF('data', e.target.value)} /></div>
            <div className="fg"><label>Canal *</label>
              <select value={modal.canal} onChange={(e) => setF('canal', e.target.value)}>
                <option value="salão">Salão</option><option value="delivery">Delivery próprio</option><option value="ifood">iFood</option><option value="rappi">Rappi</option><option value="outros">Outros</option>
              </select>
            </div>
            <div className="fg"><label>Valor (R$) *</label><input type="number" min="0" step="0.01" placeholder="0,00" value={modal.valor} onChange={(e) => setF('valor', e.target.value)} /></div>
            <div className="fg"><label>Observação</label><input type="text" placeholder="Opcional" value={modal.obs} onChange={(e) => setF('obs', e.target.value)} /></div>
            <div className="modal-foot">
              <button className="btn-sec" onClick={() => setModal(null)}>Cancelar</button>
              <div style={{ flex: 1 }} />
              <button className="btn-pri-lg" disabled={saveMut.isPending} onClick={() => saveMut.mutate(modal)}>{saveMut.isPending ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}
