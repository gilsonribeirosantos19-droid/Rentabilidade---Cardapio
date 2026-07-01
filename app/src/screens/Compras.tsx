import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import './estoque.css'

type Pedido = { id: string; loja_id?: string | null; status?: string; observacao?: string | null; data_pedido?: string; created_at?: string; fornecedor_id?: string | null }
type ItemPedido = { id?: string; pedido_id: string; insumo_id: string; quantidade?: number; unidade?: string }
type Loja = { id: string; nome: string }
type Insumo = { id: string; nome: string }

const fmtQty = (v?: number) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
const fmtDH = (iso?: string) => { if (!iso) return '—'; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}` }
const isoD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const primeiroDia = () => { const d = new Date(); return isoD(new Date(d.getFullYear(), d.getMonth(), 1)) }
const SOL_PER_PAGE = 15
const BADGE: Record<string, string> = { solicitado: 'b-solicitado', processado: 'b-processado', cancelado: 'b-cancelado', pendente: 'b-pendente' }
const LABEL: Record<string, string> = { solicitado: 'Aguardando', processado: 'Processado', cancelado: 'Cancelado', pendente: 'Pendente' }

export function Compras() {
  const { tenantId } = useAuth()
  const [tab, setTab] = useState<'solicitacoes' | 'processar' | 'pedidos'>('solicitacoes')

  return (
    <div className="est-screen">
      <div className="ci-subtabs">
        <button className={'ci-subtab ' + (tab === 'solicitacoes' ? 'on' : '')} onClick={() => setTab('solicitacoes')}>Solicitações</button>
        <button className={'ci-subtab ' + (tab === 'processar' ? 'on' : '')} onClick={() => setTab('processar')}>Processar</button>
        <button className={'ci-subtab ' + (tab === 'pedidos' ? 'on' : '')} onClick={() => setTab('pedidos')}>Pedidos Gerados</button>
      </div>
      {tab === 'solicitacoes' && <Solicitacoes tenantId={tenantId!} />}
      {tab === 'processar' && <div className="empty">Aba <b>Processar</b> — próxima fase da migração.</div>}
      {tab === 'pedidos' && <div className="empty">Aba <b>Pedidos Gerados</b> — próxima fase da migração.</div>}
    </div>
  )
}

function Solicitacoes({ tenantId }: { tenantId: string }) {
  const [lojaF, setLojaF] = useState(''); const [statusF, setStatusF] = useState('')
  const [periodo, setPeriodo] = useState('mes_atual')
  const [de, setDe] = useState(primeiroDia()); const [ate, setAte] = useState(isoD(new Date()))
  const [pag, setPag] = useState(1)
  const [verId, setVerId] = useState<string | null>(null)

  const { data: lojas = [] } = useQuery({ queryKey: ['cmp-lojas', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('lojas').select('id,nome').eq('tenant_id', tenantId).eq('ativo', true).order('nome'); return (data ?? []) as Loja[] } })
  const { data: insumos = [] } = useQuery({ queryKey: ['cmp-ins', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome').eq('tenant_id', tenantId).order('nome').range(f, t)) })
  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ['cmp-sol', tenantId, lojaF, statusF, de, ate], enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase.from('pedidos_compra').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })
      if (statusF) q = q.eq('status', statusF); else q = q.in('status', ['solicitado', 'processado', 'cancelado', 'pendente'])
      if (lojaF) q = q.eq('loja_id', lojaF)
      if (de) q = q.gte('data_pedido', de); if (ate) q = q.lte('data_pedido', ate)
      const { data } = await q; return (data ?? []) as Pedido[]
    },
  })
  const { data: countMap = {} } = useQuery({
    queryKey: ['cmp-solcount', tenantId, pedidos.map((p) => p.id).join(',')], enabled: !!tenantId && pedidos.length > 0,
    queryFn: async () => { const ids = pedidos.map((p) => p.id); const rows = await fetchAll<{ pedido_id: string }>((f, t) => supabase.from('itens_pedido').select('pedido_id').in('pedido_id', ids).range(f, t)); const m: Record<string, number> = {}; rows.forEach((r) => { m[r.pedido_id] = (m[r.pedido_id] || 0) + 1 }); return m },
  })

  const lojaMap = useMemo(() => Object.fromEntries(lojas.map((l) => [l.id, l.nome])) as Record<string, string>, [lojas])
  const totalPags = Math.max(1, Math.ceil(pedidos.length / SOL_PER_PAGE))
  const pagAtual = Math.min(pag, totalPags)
  const page = pedidos.slice((pagAtual - 1) * SOL_PER_PAGE, pagAtual * SOL_PER_PAGE)

  const aplicarPeriodo = (v: string) => { setPeriodo(v); const d = new Date(); if (v === 'mes_atual') { setDe(isoD(new Date(d.getFullYear(), d.getMonth(), 1))); setAte(isoD(d)) } else if (v === 'mes_anterior') { setDe(isoD(new Date(d.getFullYear(), d.getMonth() - 1, 1))); setAte(isoD(new Date(d.getFullYear(), d.getMonth(), 0))) }; setPag(1) }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div><div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>1. SOLICITAÇÕES</div><div style={{ fontSize: 12, color: '#94a3b8' }}>Lista de solicitações enviadas pelas lojas</div></div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <select className="field" style={{ minWidth: 150 }} value={lojaF} onChange={(e) => { setLojaF(e.target.value); setPag(1) }}><option value="">Todas as lojas</option>{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select>
          <select className="field" style={{ minWidth: 130 }} value={periodo} onChange={(e) => aplicarPeriodo(e.target.value)}><option value="periodo">Período</option><option value="mes_atual">Mês Atual</option><option value="mes_anterior">Mês Anterior</option></select>
          <input type="date" className="field" style={{ width: 150 }} value={de} onChange={(e) => { setDe(e.target.value); setPeriodo('periodo'); setPag(1) }} />
          <span style={{ fontSize: 12, color: '#94a3b8' }}>até</span>
          <input type="date" className="field" style={{ width: 150 }} value={ate} onChange={(e) => { setAte(e.target.value); setPeriodo('periodo'); setPag(1) }} />
          <select className="field" value={statusF} onChange={(e) => { setStatusF(e.target.value); setPag(1) }}><option value="">Todos os status</option><option value="solicitado">Aguardando</option><option value="processado">Processado</option><option value="pendente">Pendente</option><option value="cancelado">Cancelado</option></select>
        </div>
      </div>

      <div className="tbl-wrap"><div className="tbl-scroll">
        <table className="tbl">
          <thead><tr><th>Data</th><th>Loja</th><th className="c">Itens</th><th>Observação</th><th>Status</th><th className="c">Ações</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={6} className="empty">Carregando…</td></tr>
              : page.length === 0 ? <tr><td colSpan={6} className="empty">Nenhuma solicitação encontrada</td></tr>
              : page.map((s) => (
                <tr key={s.id}>
                  <td className="mono" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDH(s.created_at)}</td>
                  <td style={{ fontWeight: 600 }}>{lojaMap[s.loja_id || ''] || '—'}</td>
                  <td className="c" style={{ fontWeight: 500 }}>{countMap[s.id] || '—'}</td>
                  <td style={{ color: '#94a3b8', fontSize: 12 }}>{s.observacao || '—'}</td>
                  <td><span className={'badge ' + (BADGE[s.status || ''] || 'b-solicitado')}>{LABEL[s.status || ''] || s.status}</span></td>
                  <td className="c"><button className="btn-ghost" style={{ height: 28, padding: '0 10px' }} onClick={() => setVerId(s.id)}>Ver itens</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="pag-bar">
        <span>{pedidos.length ? `${pedidos.length} solicitação(ões)` : ''}</span>
        {totalPags > 1 && <div style={{ display: 'flex', gap: 4 }}><button className="pag-btn" disabled={pagAtual === 1} onClick={() => setPag(pagAtual - 1)}>‹</button><span className="pag-btn active">{pagAtual}</span><button className="pag-btn" disabled={pagAtual === totalPags} onClick={() => setPag(pagAtual + 1)}>›</button></div>}
      </div>
      </div>

      {verId && <VerSolicitacao id={verId} loja={lojaMap[pedidos.find((p) => p.id === verId)?.loja_id || ''] || '—'} ped={pedidos.find((p) => p.id === verId)!} insumos={insumos} onClose={() => setVerId(null)} />}
    </>
  )
}

function VerSolicitacao({ id, loja, ped, insumos, onClose }: { id: string; loja: string; ped: Pedido; insumos: Insumo[]; onClose: () => void }) {
  const { data: itens = [], isLoading } = useQuery({ queryKey: ['cmp-solitens', id], queryFn: async () => { const { data } = await supabase.from('itens_pedido').select('*').eq('pedido_id', id); return (data ?? []) as ItemPedido[] } })
  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i.nome])) as Record<string, string>, [insumos])
  return (
    <div className="ov" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 'min(560px, 95vw)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div><h2 style={{ marginBottom: 2 }}>Solicitação — {loja}</h2><div style={{ fontSize: 12, color: '#94a3b8' }}>{fmtDH(ped.created_at)} · {ped.status}{ped.observacao ? ` · ${ped.observacao}` : ''}</div></div>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Insumo</th><th className="r">Quantidade</th><th>Un.</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={3} className="empty">Carregando…</td></tr>
              : itens.length === 0 ? <tr><td colSpan={3} className="empty">Nenhum item</td></tr>
              : itens.map((it, i) => <tr key={i}><td>{insMap[it.insumo_id] || it.insumo_id}</td><td className="r mono">{fmtQty(it.quantidade)}</td><td>{it.unidade || 'un'}</td></tr>)}
          </tbody>
        </table></div>
      </div>
    </div>
  )
}
