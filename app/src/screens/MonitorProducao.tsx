import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import './config.css'

// Produção › Planejar › Monitor de Produção — lista todas as ordens (Produção +
// Porcionamento) do período, status A Produzir / Finalizada. Fonte real.

type Ins = { id: string; nome?: string }
type OrdP = { id: string; data?: string; insumo_produzido_id?: string; quantidade?: number; custo_total?: number; status?: string; loja_id?: string }
type OrdPorc = { id: string; data?: string; insumo_id?: string; quantidade?: number; peso?: number; status?: string; loja_id?: string }
type Row = { id: string; data?: string; tipo: 'producao' | 'porcionamento'; insumoId: string; qtd?: number; custo?: number; status?: string }

const brl = (n?: number) => (n != null ? 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')
const q3 = (n?: number) => (n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
const fmtDH = (d?: string) => (d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const p2 = (n: number) => String(n).padStart(2, '0')

export function MonitorProducao() {
  const { tenantId } = useAuth()
  const { lojaId } = useLoja()
  const [periodo, setPeriodo] = useState<'hoje' | 'semana' | 'mes'>('mes')
  const [tipoFil, setTipoFil] = useState('')
  const [statusFil, setStatusFil] = useState('')

  const range = useMemo(() => {
    const now = new Date(); const fmt = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
    if (periodo === 'hoje') return { de: fmt(now), ate: fmt(now) }
    if (periodo === 'semana') { const dow = (now.getDay() + 6) % 7; const seg = new Date(now); seg.setDate(now.getDate() - dow); return { de: fmt(seg), ate: fmt(now) } }
    return { de: `${now.getFullYear()}-${p2(now.getMonth() + 1)}-01`, ate: fmt(now) }
  }, [periodo])

  const { data: insumos = [] } = useQuery({ queryKey: ['mprod-ins', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('insumos').select('id,nome').eq('tenant_id', tenantId); return (data ?? []) as Ins[] } })
  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i.nome])) as Record<string, string>, [insumos])

  const { data: ordens = [], isFetching } = useQuery({
    queryKey: ['mprod-ordens', tenantId, lojaId, range.de, range.ate], enabled: !!tenantId,
    queryFn: async () => {
      let qp = supabase.from('ordens_producao').select('*').eq('tenant_id', tenantId).gte('data', range.de + 'T00:00:00').lte('data', range.ate + 'T23:59:59')
      let qo = supabase.from('ordens_porcionamento').select('*').eq('tenant_id', tenantId).gte('data', range.de + 'T00:00:00').lte('data', range.ate + 'T23:59:59')
      if (lojaId) { qp = qp.eq('loja_id', lojaId); qo = qo.eq('loja_id', lojaId) }
      const [rp, ro] = await Promise.all([qp, qo])
      const prod: Row[] = ((rp.data ?? []) as OrdP[]).map((o) => ({ id: o.id, data: o.data, tipo: 'producao', insumoId: o.insumo_produzido_id || '', qtd: o.quantidade, custo: o.custo_total, status: o.status }))
      const porc: Row[] = ((ro.data ?? []) as OrdPorc[]).map((o) => ({ id: o.id, data: o.data, tipo: 'porcionamento', insumoId: o.insumo_id || '', qtd: o.peso || o.quantidade, custo: undefined, status: o.status }))
      return [...prod, ...porc].sort((a, b) => (b.data || '').localeCompare(a.data || ''))
    },
  })

  const lista = useMemo(() => ordens.filter((o) => (!tipoFil || o.tipo === tipoFil) && (!statusFil || (o.status || 'aberta') === statusFil)), [ordens, tipoFil, statusFil])

  const badge = (st?: string) => {
    const s = st || 'aberta'
    return s === 'finalizada'
      ? <span className="badge" style={{ background: '#dcfce7', color: '#16a34a' }}>Finalizada</span>
      : <span className="badge" style={{ background: '#fef3c7', color: '#b45309' }}>A Produzir</span>
  }

  return (
    <div className="cfg-screen">
      <div className="usr-top"><div className="t">Todas as ordens do período — Produção e Porcionamento — com status simples: A Produzir ou Finalizada.</div></div>

      <div className="cfg-card" style={{ padding: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <div className="cfg-fg" style={{ marginBottom: 0 }}><label>Período</label><select value={periodo} onChange={(e) => setPeriodo(e.target.value as 'hoje' | 'semana' | 'mes')}><option value="hoje">Hoje</option><option value="semana">Esta semana</option><option value="mes">Este mês</option></select></div>
          <div className="cfg-fg" style={{ marginBottom: 0 }}><label>Tipo</label><select value={tipoFil} onChange={(e) => setTipoFil(e.target.value)}><option value="">Todos</option><option value="producao">Ordem de Produção</option><option value="porcionamento">Ordem de Porcionamento</option></select></div>
          <div className="cfg-fg" style={{ marginBottom: 0 }}><label>Status</label><select value={statusFil} onChange={(e) => setStatusFil(e.target.value)}><option value="">Todos</option><option value="aberta">A Produzir</option><option value="finalizada">Finalizada</option></select></div>
        </div>
      </div>

      <div className="cfg-card">
        <table>
          <thead><tr><th>Nº</th><th>Data</th><th>Tipo</th><th>Item</th><th className="r">Qtd</th><th className="r">Custo</th><th className="c">Status</th></tr></thead>
          <tbody>
            {isFetching ? <tr><td colSpan={7} className="empty">Carregando…</td></tr>
              : !lista.length ? <tr><td colSpan={7} className="empty">Nenhuma ordem no período.</td></tr>
                : lista.map((o) => (
                  <tr key={o.tipo + o.id}>
                    <td className="mono muted">#{o.id.slice(0, 8)}</td>
                    <td>{fmtDH(o.data)}</td>
                    <td><span className="badge" style={{ background: o.tipo === 'producao' ? '#eff6ff' : '#fff7ed', color: o.tipo === 'producao' ? '#2563eb' : '#ea6a0a' }}>{o.tipo === 'producao' ? 'Produção' : 'Porcionam.'}</span></td>
                    <td>{insMap[o.insumoId] || '—'}</td>
                    <td className="r mono">{q3(o.qtd)}</td>
                    <td className="r mono">{brl(o.custo)}</td>
                    <td className="c">{badge(o.status)}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
