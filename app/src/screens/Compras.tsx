import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { SearchSelect } from '../components/SearchSelect'
import './estoque.css'

type Pedido = { id: string; loja_id?: string | null; status?: string; observacao?: string | null; data_pedido?: string; created_at?: string; fornecedor_id?: string | null }
type LojaQtd = { loja_id: string; qtd: number }
type ItemPedido = { id?: string; pedido_id: string; insumo_id: string; quantidade?: number; unidade?: string; preco_unitario?: number | null; observacao?: string | null; detalhe_lojas?: LojaQtd[] | null }
type Loja = { id: string; nome: string }
type Insumo = { id: string; nome: string; unidade_medida?: string; codigo_interno?: number | string; categoria?: string }
type Forn = { id: string; nome: string; whatsapp?: string | null }
type Vinc = { insumo_id: string; fornecedor_id: string; principal?: boolean; preco_unitario?: number | null; updated_at?: string; created_at?: string }

const brl = (v?: number | null) => (v == null || !(+v)) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtQty = (v?: number) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
const fmtQtyDoc = (v?: number) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const fmtCod = (c?: number | string) => (c != null && c !== '' ? String(c).padStart(6, '0') : '—')
const fmtDH = (iso?: string) => { if (!iso) return '—'; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}` }
const fmtData = (iso?: string) => iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('pt-BR') : '—'
const isoD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const hoje = () => isoD(new Date())
const primeiroDia = () => { const d = new Date(); return isoD(new Date(d.getFullYear(), d.getMonth(), 1)) }
const SOL_PER_PAGE = 15
const BADGE: Record<string, string> = { solicitado: 'b-solicitado', processado: 'b-processado', cancelado: 'b-cancelado', pendente: 'b-pendente' }
const LABEL: Record<string, string> = { solicitado: 'Aguardando', processado: 'Processado', cancelado: 'Cancelado', pendente: 'Pendente' }
const PED_ST: Record<string, { l: string; b: string }> = { pendente: { l: 'Aguardando envio', b: 'b-pendente' }, enviado: { l: 'Enviado', b: 'b-enviado' }, baixado: { l: 'Baixado', b: 'b-baixado' }, cancelado: { l: 'Cancelado', b: 'b-cancelado' }, aguardando_aprovacao: { l: 'Aguard. aprovação', b: 'b-solicitado' }, aprovado: { l: 'Aprovado', b: 'b-processado' } }
const PED_ORDEM: Record<string, number> = { aguardando_aprovacao: 0, pendente: 1, enviado: 2, aprovado: 3, baixado: 4, cancelado: 5 }

// dados compartilhados (leves) usados por várias abas
function useCompras(tenantId: string) {
  const insumos = useQuery({ queryKey: ['cmp-ins', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,unidade_medida,codigo_interno,categoria').eq('tenant_id', tenantId).order('nome').range(f, t)) })
  const fornecedores = useQuery({ queryKey: ['cmp-forn', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('fornecedores').select('id,nome,whatsapp').eq('tenant_id', tenantId).eq('ativo', true).order('nome'); return (data ?? []) as Forn[] } })
  const lojas = useQuery({ queryKey: ['cmp-lojas', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('lojas').select('id,nome').eq('tenant_id', tenantId).eq('ativo', true).order('nome'); return (data ?? []) as Loja[] } })
  const vinculos = useQuery({ queryKey: ['cmp-vinc', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Vinc>((f, t) => supabase.from('insumo_fornecedores').select('insumo_id,fornecedor_id,principal,preco_unitario,updated_at,created_at').eq('tenant_id', tenantId).range(f, t)) })
  return { insumos: insumos.data ?? [], fornecedores: fornecedores.data ?? [], lojas: lojas.data ?? [], vinculos: vinculos.data ?? [] }
}

export function Compras() {
  const { tenantId } = useAuth()
  const [tab, setTab] = useState<'solicitacoes' | 'processar' | 'pedidos'>('solicitacoes')
  const shared = useCompras(tenantId!)
  return (
    <div className="est-screen">
      <div className="ci-subtabs">
        <button className={'ci-subtab ' + (tab === 'solicitacoes' ? 'on' : '')} onClick={() => setTab('solicitacoes')}>Solicitações</button>
        <button className={'ci-subtab ' + (tab === 'processar' ? 'on' : '')} onClick={() => setTab('processar')}>Processar</button>
        <button className={'ci-subtab ' + (tab === 'pedidos' ? 'on' : '')} onClick={() => setTab('pedidos')}>Pedidos Gerados</button>
      </div>
      {tab === 'solicitacoes' && <Solicitacoes tenantId={tenantId!} shared={shared} />}
      {tab === 'processar' && <Processar tenantId={tenantId!} shared={shared} onGerado={() => setTab('pedidos')} />}
      {tab === 'pedidos' && <PedidosGerados tenantId={tenantId!} shared={shared} />}
    </div>
  )
}

type Shared = ReturnType<typeof useCompras>

// ═══════════════════════ SOLICITAÇÕES ═══════════════════════
function Solicitacoes({ tenantId, shared }: { tenantId: string; shared: Shared }) {
  const { lojas, insumos } = shared
  const [lojaF, setLojaF] = useState(''); const [statusF, setStatusF] = useState('')
  const [periodo, setPeriodo] = useState('mes_atual')
  const [de, setDe] = useState(primeiroDia()); const [ate, setAte] = useState(hoje())
  const [pag, setPag] = useState(1); const [verId, setVerId] = useState<string | null>(null)

  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ['cmp-sol', tenantId, lojaF, statusF, de, ate], enabled: !!tenantId,
    queryFn: () => fetchAll<Pedido>((f, t) => {
      let q = supabase.from('pedidos_compra').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })
      if (statusF) q = q.eq('status', statusF); else q = q.in('status', ['solicitado', 'processado', 'cancelado', 'pendente'])
      if (lojaF) q = q.eq('loja_id', lojaF); if (de) q = q.gte('data_pedido', de); if (ate) q = q.lte('data_pedido', ate)
      return q.range(f, t)
    }),
  })
  const { data: countMap = {} } = useQuery({
    queryKey: ['cmp-solcount', tenantId, pedidos.map((p) => p.id).join(',')], enabled: !!tenantId && pedidos.length > 0,
    queryFn: async () => { const rows = await fetchAll<{ pedido_id: string }>((f, t) => supabase.from('itens_pedido').select('pedido_id').in('pedido_id', pedidos.map((p) => p.id)).range(f, t)); const m: Record<string, number> = {}; rows.forEach((r) => { m[r.pedido_id] = (m[r.pedido_id] || 0) + 1 }); return m },
  })
  const lojaMap = useMemo(() => Object.fromEntries(lojas.map((l) => [l.id, l.nome])) as Record<string, string>, [lojas])
  const totalPags = Math.max(1, Math.ceil(pedidos.length / SOL_PER_PAGE)); const pagAtual = Math.min(pag, totalPags)
  const page = pedidos.slice((pagAtual - 1) * SOL_PER_PAGE, pagAtual * SOL_PER_PAGE)
  const aplicarPeriodo = (v: string) => { setPeriodo(v); const d = new Date(); if (v === 'mes_atual') { setDe(isoD(new Date(d.getFullYear(), d.getMonth(), 1))); setAte(isoD(d)) } else if (v === 'mes_anterior') { setDe(isoD(new Date(d.getFullYear(), d.getMonth() - 1, 1))); setAte(isoD(new Date(d.getFullYear(), d.getMonth(), 0))) } else { setDe(''); setAte('') }; setPag(1) }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div><div style={{ fontSize: 13, fontWeight: 700 }}>1. SOLICITAÇÕES</div><div style={{ fontSize: 12, color: '#94a3b8' }}>Lista de solicitações enviadas pelas lojas</div></div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <select className="field" style={{ minWidth: 150 }} value={lojaF} onChange={(e) => { setLojaF(e.target.value); setPag(1) }}><option value="">Todas as lojas</option>{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select>
          <select className="field" style={{ minWidth: 130 }} value={periodo} onChange={(e) => aplicarPeriodo(e.target.value)}><option value="periodo">Período</option><option value="mes_atual">Mês Atual</option><option value="mes_anterior">Mês Anterior</option></select>
          <input type="date" className="field" style={{ width: 150 }} value={de} onChange={(e) => { setDe(e.target.value); setPeriodo('periodo'); setPag(1) }} /><span style={{ fontSize: 12, color: '#94a3b8' }}>até</span><input type="date" className="field" style={{ width: 150 }} value={ate} onChange={(e) => { setAte(e.target.value); setPeriodo('periodo'); setPag(1) }} />
          <select className="field" value={statusF} onChange={(e) => { setStatusF(e.target.value); setPag(1) }}><option value="">Todos os status</option><option value="solicitado">Aguardando</option><option value="processado">Processado</option><option value="pendente">Pendente</option><option value="cancelado">Cancelado</option></select>
        </div>
      </div>
      <div className="tbl-wrap"><div className="tbl-scroll">
        <table className="tbl"><thead><tr><th>Data</th><th>Loja</th><th className="c">Itens</th><th>Observação</th><th>Status</th><th className="c">Ações</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={6} className="empty">Carregando…</td></tr>
              : page.length === 0 ? <tr><td colSpan={6} className="empty">Nenhuma solicitação encontrada</td></tr>
              : page.map((s) => <tr key={s.id}>
                <td className="mono" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDH(s.created_at)}</td>
                <td>{lojaMap[s.loja_id || ''] || '—'}</td>
                <td className="c" style={{ fontWeight: 500 }}>{countMap[s.id] || '—'}</td>
                <td style={{ color: '#94a3b8', fontSize: 12 }}>{s.observacao || '—'}</td>
                <td><span className={'badge ' + (BADGE[s.status || ''] || 'b-solicitado')}>{LABEL[s.status || ''] || s.status}</span></td>
                <td className="c"><button className="btn-ghost" style={{ height: 28, padding: '0 10px' }} onClick={() => setVerId(s.id)}>Ver itens</button></td>
              </tr>)}
          </tbody>
        </table>
      </div>
      <div className="pag-bar"><span>{pedidos.length ? `${pedidos.length} solicitação(ões)` : ''}</span>{totalPags > 1 && <div style={{ display: 'flex', gap: 4 }}><button className="pag-btn" disabled={pagAtual === 1} onClick={() => setPag(pagAtual - 1)}>‹</button><span className="pag-btn active">{pagAtual}</span><button className="pag-btn" disabled={pagAtual === totalPags} onClick={() => setPag(pagAtual + 1)}>›</button></div>}</div>
      </div>
      {verId && <VerModal titulo={`Solicitação — ${lojaMap[pedidos.find((p) => p.id === verId)?.loja_id || ''] || '—'}`} sub={`${fmtDH(pedidos.find((p) => p.id === verId)?.created_at)} · ${pedidos.find((p) => p.id === verId)?.status}`} id={verId} insumos={insumos} onClose={() => setVerId(null)} />}
    </>
  )
}

// ═══════════════════════ PROCESSAR ═══════════════════════
function Processar({ tenantId, shared, onGerado }: { tenantId: string; shared: Shared; onGerado: () => void }) {
  const { insumos, fornecedores, lojas, vinculos } = shared
  const { usuario } = useAuth()
  const qc = useQueryClient()
  const [qComprar, setQComprar] = useState<Record<string, number>>({})
  const [fornSel, setFornSel] = useState<Record<string, string>>({})
  const [verLojas, setVerLojas] = useState<{ nome: string; unidade: string; lojas: { nome: string; qty: number }[] } | null>(null)
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 3200) }

  const { data: sols = [], isLoading, refetch, isFetching } = useQuery({ queryKey: ['cmp-cons-sols', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Pedido>((f, t) => supabase.from('pedidos_compra').select('id,loja_id').eq('tenant_id', tenantId).eq('status', 'solicitado').order('created_at').range(f, t)) })
  const { data: itensSol = [] } = useQuery({ queryKey: ['cmp-cons-itens', tenantId, sols.map((s) => s.id).join(',')], enabled: !!tenantId && sols.length > 0, queryFn: async () => { const rows = await fetchAll<ItemPedido>((f, t) => supabase.from('itens_pedido').select('*').in('pedido_id', sols.map((s) => s.id)).range(f, t)); return rows } })
  // Parâmetros de Compras (Configurações › Parâmetros › Compras)
  const { data: params = [] } = useQuery({ queryKey: ['cmp-params', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('parametros').select('chave,valor').eq('tenant_id', tenantId).eq('modulo', 'compras'); return (data ?? []) as { chave: string; valor: string }[] } })
  const permitirSemForn = useMemo(() => (params.find((p) => p.chave === 'permitir_sem_fornecedor')?.valor ?? 'sim') !== 'nao', [params])
  const exigirAprovacao = useMemo(() => params.find((p) => p.chave === 'exigir_aprovacao')?.valor === 'sim', [params])

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const lojaMap = useMemo(() => Object.fromEntries(lojas.map((l) => [l.id, l.nome])) as Record<string, string>, [lojas])
  const fornMap = useMemo(() => Object.fromEntries(fornecedores.map((f) => [f.id, f.nome])) as Record<string, string>, [fornecedores])

  const consolidado = useMemo(() => {
    const solById = Object.fromEntries(sols.map((s) => [s.id, s]))
    const c: Record<string, { insId: string; nome: string; unidade: string; total: number; lojas: { loja_id: string; nome: string; qty: number }[]; fornecedorId: string | null }> = {}
    itensSol.forEach((it) => {
      const s = solById[it.pedido_id]; if (!s) return
      const ins = insMap[it.insumo_id]
      if (!c[it.insumo_id]) {
        const vincs = vinculos.filter((v) => v.insumo_id === it.insumo_id)
        const principal = vincs.find((v) => v.principal) || vincs[0]
        c[it.insumo_id] = { insId: it.insumo_id, nome: ins?.nome || it.insumo_id, unidade: it.unidade || ins?.unidade_medida || 'un', total: 0, lojas: [], fornecedorId: principal?.fornecedor_id || null }
      }
      c[it.insumo_id].total += Number(it.quantidade) || 0
      const ex = c[it.insumo_id].lojas.find((l) => l.loja_id === s.loja_id)
      if (ex) ex.qty += Number(it.quantidade) || 0
      else c[it.insumo_id].lojas.push({ loja_id: s.loja_id || '', nome: lojaMap[s.loja_id || ''] || 'Sem loja', qty: Number(it.quantidade) || 0 })
    })
    return Object.values(c)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sols, itensSol, insMap, lojaMap, vinculos])

  // inicializa qComprar/fornSel quando o consolidado muda
  useEffect(() => { const q: Record<string, number> = {}, f: Record<string, string> = {}; consolidado.forEach((d) => { q[d.insId] = d.total; f[d.insId] = d.fornecedorId || '' }); setQComprar(q); setFornSel(f) }, [consolidado])

  const fornOptsDe = (insId: string) => { const vincs = vinculos.filter((v) => v.insumo_id === insId); if (vincs.length) return vincs.map((v) => ({ id: v.fornecedor_id, nome: (fornMap[v.fornecedor_id] || v.fornecedor_id) + (v.principal ? ' ★' : '') })); return fornecedores.map((f) => ({ id: f.id, nome: f.nome })) }
  const ultCompra = (insId: string) => { const v = vinculos.find((x) => x.insumo_id === insId && x.fornecedor_id === fornSel[insId]) || vinculos.find((x) => x.insumo_id === insId); if (!v?.preco_unitario) return '—'; const dt = v.updated_at || v.created_at ? new Date(v.updated_at || v.created_at!).toLocaleDateString('pt-BR') : ''; return `${dt} - ${brl(v.preco_unitario)}` }

  const nLojas = new Set(sols.map((s) => s.loja_id)).size

  const gerarMut = useMutation({
    mutationFn: async () => {
      if (!consolidado.length) throw new Error('Nada para gerar.')
      for (const d of consolidado) { if (!(qComprar[d.insId] > 0)) throw new Error('Informe Q. Comprar para todos os itens.') }
      // Parâmetro: fornecedor obrigatório
      if (!permitirSemForn) { const semForn = consolidado.filter((d) => !fornSel[d.insId]); if (semForn.length) throw new Error(`${semForn.length} item(ns) sem fornecedor. Obrigatório (Parâmetros › Compras).`) }
      // Parâmetro: exigir aprovação → pedido nasce "aguardando aprovação"
      const statusInicial = exigirAprovacao ? 'aguardando_aprovacao' : 'pendente'
      const porForn: Record<string, typeof consolidado> = {}
      consolidado.forEach((d) => { const k = fornSel[d.insId] || '__sem__'; (porForn[k] = porForn[k] || []).push(d) })
      for (const [fKey, itensForn] of Object.entries(porForn)) {
        const fornId = fKey === '__sem__' ? null : fKey
        const lojasResumo = [...new Set(itensForn.flatMap((it) => it.lojas.map((l) => l.nome)))]
        const obs = 'Lojas: ' + lojasResumo.join(', ')
        const { data: ped, error: e1 } = await supabase.from('pedidos_compra').insert({ tenant_id: tenantId, loja_id: null, fornecedor_id: fornId, status: statusInicial, data_pedido: hoje(), observacao: obs, solicitante_id: usuario?.id || null }).select('id').single()
        if (e1) throw e1
        const itensPay = itensForn.map((it) => ({ pedido_id: ped!.id, insumo_id: it.insId, quantidade: qComprar[it.insId], unidade: it.unidade, preco_unitario: vinculos.find((v) => v.insumo_id === it.insId && v.fornecedor_id === fornId)?.preco_unitario || null, observacao: it.lojas.map((l) => l.nome + ': ' + fmtQtyDoc(l.qty)).join(', '), detalhe_lojas: it.lojas.filter((l) => l.loja_id).map((l) => ({ loja_id: l.loja_id, qtd: l.qty })) }))
        const { error: e2 } = await supabase.from('itens_pedido').insert(itensPay); if (e2) throw e2
      }
      for (const s of sols) { await supabase.from('pedidos_compra').update({ status: 'processado' }).eq('id', s.id) }
      return Object.keys(porForn).length
    },
    onSuccess: (n) => { showToast(`${n} pedido(s) gerado(s) com sucesso!`, 'ok'); qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && /^cmp-/.test(q.queryKey[0] as string) }); setTimeout(onGerado, 400) },
    onError: (e: Error) => showToast('Erro: ' + e.message, 'err'),
  })

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div><div style={{ fontSize: 13, fontWeight: 700 }}>2. PROCESSAR</div><div style={{ fontSize: 12, color: '#94a3b8' }}>{sols.length ? `${sols.length} solicitação(ões) de ${nLojas} loja(s) · ${consolidado.length} insumo(s)` : 'Consolidação de solicitações de todas as lojas'}</div></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" disabled={isFetching} onClick={() => refetch()}>↻ Recalcular sugestões</button>
          <button className="btn-primary" disabled={!consolidado.length || gerarMut.isPending} onClick={() => gerarMut.mutate()}>{gerarMut.isPending ? 'Gerando…' : 'Gerar pedidos por fornecedor'}</button>
        </div>
      </div>
      <div className="tbl-wrap"><div className="tbl-scroll">
        <table className="tbl"><thead><tr><th>Item</th><th className="r">Qtd. solicitada total</th><th className="r">Qtd. a comprar</th><th>Un.</th><th>Última compra</th><th>Fornecedor sugerido</th><th>Fornecedor selecionado</th><th className="c">Ações</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={8} className="empty">Carregando…</td></tr>
              : consolidado.length === 0 ? <tr><td colSpan={8} className="empty">Nenhuma solicitação pendente</td></tr>
              : consolidado.map((d) => <tr key={d.insId}>
                <td>{d.nome}</td>
                <td className="r mono">{fmtQty(d.total)}</td>
                <td className="r"><input type="number" className="field" style={{ width: 100, height: 30, textAlign: 'right' }} min="0" step="0.001" value={qComprar[d.insId] ?? d.total} onChange={(e) => setQComprar((p) => ({ ...p, [d.insId]: parseFloat(e.target.value) || 0 }))} /></td>
                <td>{d.unidade}</td>
                <td style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{ultCompra(d.insId)}</td>
                <td style={{ fontSize: 12 }}>{d.fornecedorId ? <span style={{ color: '#16a34a', fontWeight: 600 }}>{fornMap[d.fornecedorId]}</span> : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                <td style={{ minWidth: 190 }}>{(() => {
                  const opts = fornOptsDe(d.insId)
                  const nameToId: Record<string, string> = {}; opts.forEach((o) => { nameToId[o.nome] = o.id })
                  const curName = opts.find((o) => o.id === fornSel[d.insId])?.nome || ''
                  return <SearchSelect value={curName} placeholder="— Sem fornecedor —" options={opts.map((o) => o.nome)} onChange={(nm) => setFornSel((p) => ({ ...p, [d.insId]: nameToId[nm] || '' }))} />
                })()}</td>
                <td className="c"><button className="btn-ghost" style={{ height: 28, padding: '0 10px' }} onClick={() => setVerLojas({ nome: d.nome, unidade: d.unidade, lojas: d.lojas })}>Ver lojas</button></td>
              </tr>)}
          </tbody>
        </table>
      </div></div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 12 }}>ℹ O sistema sugere o fornecedor com base no último preço e histórico de compras. Altere se necessário.</div>

      {verLojas && <div className="ov" onClick={(e) => { if (e.target === e.currentTarget) setVerLojas(null) }}>
        <div className="modal" style={{ width: 'min(480px,95vw)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}><h2>{verLojas.nome}</h2><button className="icon-btn" onClick={() => setVerLojas(null)}>✕</button></div>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Loja</th><th className="r">Quantidade</th><th>Un.</th></tr></thead><tbody>{verLojas.lojas.map((l, i) => <tr key={i}><td>{l.nome}</td><td className="r mono">{fmtQty(l.qty)}</td><td>{verLojas.unidade}</td></tr>)}</tbody></table></div>
        </div>
      </div>}
      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </>
  )
}

// romaneio consolidado: 1 página por loja (portado do HTML antigo)
type LojaFull = { id?: string; nome?: string; razao_social?: string; cnpj?: string; endereco?: string; horario_manha?: string; horario_tarde?: string }
type PorLoja = Record<string, { loja: LojaFull; itens: Record<string, { qty: number; un: string }> }>
function gerarImpressaoPorLoja(porLoja: PorLoja, dataRef: string) {
  const dataFormatada = new Date(dataRef.length === 10 ? dataRef + 'T12:00:00' : dataRef).toLocaleDateString('pt-BR')
  const paginas = Object.values(porLoja).map(({ loja, itens }) => {
    const linhas: ({ nome: string; qty: number; un: string } | null)[] = Object.entries(itens).map(([nome, { qty, un }]) => ({ nome, qty, un }))
    while (linhas.length < 8) linhas.push(null)
    const nomeLoja = loja?.nome || '—', razao = loja?.razao_social || '', cnpj = loja?.cnpj || '', ende = loja?.endereco || '', hrManha = loja?.horario_manha || '-', hrTarde = loja?.horario_tarde || '-'
    return `<div class="pagina"><table class="doc">
      <tr><td class="cel-loja">${nomeLoja.toUpperCase()}</td><td class="cel-data-label">DATA:</td><td class="cel-data">${dataFormatada}</td></tr>
      <tr><td colspan="3" class="cel-info">RAZÃO SOCIAL: ${razao}${cnpj ? ' CNPJ: ' + cnpj : ''}</td></tr>
      <tr><td colspan="3" class="cel-info">ENDEREÇO: ${ende}</td></tr>
      <tr><td colspan="2" class="cel-th">ITENS</td><td class="cel-th" style="text-align:center">QUANTIDADE</td></tr>
      ${linhas.map((it) => it ? `<tr><td colspan="2" class="cel-item">${it.nome.toUpperCase()}</td><td class="cel-qty">${fmtQtyDoc(it.qty)} ${it.un.toUpperCase()}</td></tr>` : `<tr><td colspan="2" class="cel-item">&nbsp;</td><td class="cel-qty">&nbsp;</td></tr>`).join('')}
      <tr><td class="cel-footer">HORÁRIO DE RECEBIMENTO</td><td class="cel-footer">MANHÃ</td><td class="cel-footer">${hrManha}</td></tr>
      <tr><td class="cel-footer">&nbsp;</td><td class="cel-footer">TARDE</td><td class="cel-footer">${hrTarde}</td></tr>
    </table></div>`
  }).join('')
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Pedidos por Loja — ${dataFormatada}</title><style>
    *{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif}body{background:#fff}
    .pagina{page-break-after:always;padding:20px;max-width:700px;margin:0 auto}.pagina:last-child{page-break-after:avoid}
    .doc{width:100%;border-collapse:collapse;font-size:13px}.doc td{border:1px solid #000;padding:6px 8px;vertical-align:middle}
    .cel-loja{font-weight:700;font-size:14px;width:55%}.cel-data-label{font-weight:700;width:15%;text-align:center}.cel-data{font-weight:700;font-size:14px;width:30%;text-align:right}
    .cel-info{background:#f4cccc;font-size:12px;line-height:1.5;height:36px}.cel-th{background:#ffff00;font-weight:700;font-size:13px;text-align:center;padding:8px}
    .cel-item{height:28px;font-size:12px}.cel-qty{text-align:center;font-weight:600;font-size:12px}.cel-footer{background:#ffff00;font-weight:700;font-size:12px;text-align:center;padding:6px}
    @media print{body{margin:0}.pagina{padding:10px;max-width:100%}}
  </style></head><body>${paginas}<script>window.onload=function(){window.onafterprint=function(){window.close()};window.print();}<\/script></body></html>`
  const win = window.open('', '_blank'); if (!win) return
  win.document.write(html); win.document.close()
}

// ═══════════════════════ PEDIDOS GERADOS ═══════════════════════
function PedidosGerados({ tenantId, shared }: { tenantId: string; shared: Shared }) {
  const { insumos, fornecedores, lojas } = shared
  const qc = useQueryClient()
  const [statusF, setStatusF] = useState('ativos'); const [busca, setBusca] = useState(''); const [filData, setFilData] = useState(''); const [ordenar, setOrdenar] = useState('forn')
  const [verId, setVerId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 3000) }

  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ['cmp-ped', tenantId, statusF], enabled: !!tenantId,
    queryFn: () => fetchAll<Pedido>((f, t) => {
      let q = supabase.from('pedidos_compra').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })
      if (statusF === 'ativos' || statusF === '') q = q.in('status', ['aguardando_aprovacao', 'pendente', 'enviado'])
      else if (statusF === 'todos') q = q.in('status', ['pendente', 'enviado', 'baixado', 'cancelado', 'aguardando_aprovacao', 'aprovado'])
      else q = q.eq('status', statusF)
      return q.range(f, t)
    }),
  })
  const { data: itensMap = {} } = useQuery({
    queryKey: ['cmp-peditens', tenantId, pedidos.map((p) => p.id).join(',')], enabled: !!tenantId && pedidos.length > 0,
    queryFn: async () => { const rows = await fetchAll<ItemPedido>((f, t) => supabase.from('itens_pedido').select('*').in('pedido_id', pedidos.map((p) => p.id)).range(f, t)); const m: Record<string, ItemPedido[]> = {}; rows.forEach((r) => { (m[r.pedido_id] = m[r.pedido_id] || []).push(r) }); return m },
  })
  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const fornMap = useMemo(() => Object.fromEntries(fornecedores.map((f) => [f.id, f])) as Record<string, Forn>, [fornecedores])
  // lojas completas (razão/cnpj/endereço/horários) p/ o romaneio consolidado — select('*') evita zerar por coluna inexistente
  const { data: lojasFull = [] } = useQuery({ queryKey: ['cmp-lojas-full', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('lojas').select('*').eq('tenant_id', tenantId).eq('ativo', true); return (data ?? []) as LojaFull[] } })
  const lojaNomeMap = useMemo(() => Object.fromEntries(lojas.map((l) => [l.id, l.nome])) as Record<string, string>, [lojas])
  // "Por loja" robusto: usa o detalhe ESTRUTURADO (loja_id → nome atual); cai no texto antigo só p/ pedidos legados
  const porLojaText = (it: ItemPedido) => (it.detalhe_lojas?.length)
    ? it.detalhe_lojas.map((d) => (lojaNomeMap[d.loja_id] || 'Sem loja') + ': ' + fmtQtyDoc(d.qtd)).join(', ')
    : (it.observacao || '—')

  // "Baixar todos por loja": consolida os itens de TODOS os pedidos da lista atual, agrupando por loja
  const imprimirTodos = () => {
    if (!pedidos.length) { showToast('Nenhum pedido para imprimir.', 'err'); return }
    const porLoja: PorLoja = {}
    const dataRef = pedidos[0]?.data_pedido || pedidos[0]?.created_at || hoje()
    const addItem = (nomeIns: string, un: string, key: string, loja: LojaFull, qty: number) => {
      (porLoja[key] = porLoja[key] || { loja, itens: {} })
      const prev = porLoja[key].itens[nomeIns]; porLoja[key].itens[nomeIns] = { qty: (prev?.qty || 0) + qty, un }
    }
    pedidos.forEach((p) => {
      (itensMap[p.id] || []).forEach((it) => {
        const nomeIns = insMap[it.insumo_id]?.nome || it.insumo_id
        const un = it.unidade || 'un'
        if (it.detalhe_lojas?.length) { // estruturado: agrupa por loja_id (imune a renomear)
          it.detalhe_lojas.forEach((d) => { const loja = lojasFull.find((l) => l.id === d.loja_id) || { id: d.loja_id, nome: lojaNomeMap[d.loja_id] || 'Sem loja' }; addItem(nomeIns, un, loja.id || d.loja_id || 'sem', loja, Number(d.qtd) || 0) })
        } else if (it.observacao) { // legado: parse do texto (casa por nome)
          it.observacao.split(', ').forEach((parte) => { const m = parte.match(/^(.+?):\s*([\d.]+)$/); if (!m) return; const nomeLoja = m[1].trim(), qty = parseFloat(m[2]) || 0; const loja = lojasFull.find((l) => (l.nome || '').toLowerCase() === nomeLoja.toLowerCase()) || { nome: nomeLoja }; addItem(nomeIns, un, loja.id || nomeLoja, loja, qty) })
        } else {
          addItem(nomeIns, un, '__geral__', { nome: 'Geral' }, Number(it.quantidade) || 0)
        }
      })
    })
    if (!Object.keys(porLoja).length) { showToast('Sem itens para consolidar.', 'err'); return }
    gerarImpressaoPorLoja(porLoja, dataRef)
  }

  const linhas = useMemo(() => {
    const porForn: Record<string, Pedido[]> = {}
    pedidos.forEach((p) => { const k = p.fornecedor_id || '__sem__'; (porForn[k] = porForn[k] || []).push(p) })
    let rows = Object.entries(porForn).map(([fKey, peds]) => {
      const forn = fKey === '__sem__' ? null : fornMap[fKey]
      let nItens = 0, valor = 0; const lojasSet = new Set<string>()
      peds.forEach((p) => {
        (itensMap[p.id] || []).forEach((it) => {
          nItens++; valor += (Number(it.quantidade) || 0) * (Number(it.preco_unitario) || 0)
          if (it.detalhe_lojas?.length) it.detalhe_lojas.forEach((d) => { if (d.loja_id) lojasSet.add(d.loja_id) })
          else if (it.observacao) it.observacao.split(', ').forEach((parte) => { const mm = parte.match(/^(.+?):\s*[\d.]+$/); if (mm) lojasSet.add(mm[1].trim()) }) // legado
        })
      })
      const st = peds.map((p) => p.status || '').sort((a, b) => (PED_ORDEM[a] ?? 9) - (PED_ORDEM[b] ?? 9))[0]
      return { fKey, fornNome: forn?.nome || 'Sem fornecedor', peds, primId: peds[0].id, nItens, valor, nLojas: lojasSet.size, st, data: peds[0].data_pedido || peds[0].created_at || '', whatsapp: forn?.whatsapp }
    })
    if (busca) rows = rows.filter((r) => r.fornNome.toLowerCase().includes(busca.toLowerCase()))
    if (filData) { const now = Date.now(); rows = rows.filter((r) => { if (filData === 'hoje') return new Date(r.data).toDateString() === new Date().toDateString(); return (now - new Date(r.data).getTime()) / 864e5 <= parseInt(filData) }) }
    rows.sort((a, b) => ordenar === 'valor' ? b.valor - a.valor : ordenar === 'data' ? +new Date(b.data) - +new Date(a.data) : a.fornNome.localeCompare(b.fornNome))
    return rows
  }, [pedidos, itensMap, fornMap, busca, filData, ordenar])

  const totItens = linhas.reduce((s, r) => s + r.nItens, 0), totValor = linhas.reduce((s, r) => s + r.valor, 0)

  const mudarStatus = async (id: string, status: string) => { const { error } = await supabase.from('pedidos_compra').update({ status }).eq('id', id); if (error) { showToast('Erro: ' + error.message, 'err'); return } showToast(`Pedido marcado como ${status}.`, 'ok'); setVerId(null); qc.invalidateQueries({ queryKey: ['cmp-ped'] }) }
  const enviarWhats = async (pedId: string, forn?: Forn | null) => {
    if (!forn?.whatsapp) { showToast('Fornecedor sem WhatsApp.', 'err'); return }
    const its = itensMap[pedId] || []
    let msg = `*Pedido de Compra — Aiko*\nData: ${fmtData(hoje())}\n\n*Itens:*\n`
    its.forEach((it) => { msg += `• ${insMap[it.insumo_id]?.nome || '?'}: ${fmtQtyDoc(it.quantidade)} ${it.unidade || 'un'}\n`; const det = porLojaText(it); if (det && det !== '—') det.split(', ').forEach((part) => { msg += `    → ${part}\n` }) })
    window.open(`https://wa.me/55${forn.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank')
    await mudarStatus(pedId, 'enviado')
  }
  const imprimir = (fornNome: string, peds: Pedido[]) => {
    const its = peds.flatMap((p) => itensMap[p.id] || [])
    const rows = its.map((it) => { const det = porLojaText(it); return `<tr><td>${insMap[it.insumo_id]?.nome || it.insumo_id}</td><td style="text-align:right">${fmtQtyDoc(it.quantidade)}</td><td>${it.unidade || 'un'}</td><td style="font-size:11px;color:#666">${det === '—' ? '' : det}</td></tr>` }).join('')
    const w = window.open('', '_blank'); if (!w) return
    w.document.write(`<html><head><title>Pedido - ${fornNome}</title><style>body{font-family:Arial;padding:24px;color:#111}h1{font-size:18px}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f1f5f9}</style></head><body><h1>Pedido de Compra — ${fornNome}</h1><div>Data: ${fmtData(hoje())}</div><table><thead><tr><th>Item</th><th style="text-align:right">Qtd</th><th>Un</th><th>Por loja</th></tr></thead><tbody>${rows}</tbody></table><script>window.print()</script></body></html>`)
    w.document.close()
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '4px 0 12px' }}>
        <input className="field" style={{ minWidth: 200 }} placeholder="Buscar fornecedor..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="field" value={statusF} onChange={(e) => setStatusF(e.target.value)}><option value="ativos">Ativos (a enviar / enviados)</option><option value="aguardando_aprovacao">Aguardando aprovação</option><option value="pendente">Aguardando envio</option><option value="enviado">Enviado</option><option value="baixado">Baixados</option><option value="cancelado">Cancelados</option><option value="todos">Todos</option></select>
        <select className="field" value={filData} onChange={(e) => setFilData(e.target.value)}><option value="">Qualquer data</option><option value="hoje">Hoje</option><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option></select>
        <select className="field" value={ordenar} onChange={(e) => setOrdenar(e.target.value)}><option value="forn">Fornecedor (A-Z)</option><option value="data">Data (mais recente)</option><option value="valor">Valor (maior)</option></select>
        <button className="btn-ghost" onClick={() => { setStatusF('ativos'); setBusca(''); setFilData(''); setOrdenar('forn') }}>Limpar filtros</button>
        <button className="btn-ghost" style={{ marginLeft: 'auto' }} title="Imprime 1 folha por loja com todos os itens consolidados dos pedidos listados" onClick={imprimirTodos}>🖨 Baixar todos (por loja)</button>
      </div>
      <div className="tbl-wrap"><div className="tbl-scroll">
        <table className="tbl"><thead><tr><th>Fornecedor</th><th className="r">Itens</th><th className="r">Valor Total</th><th className="r">Lojas</th><th>Data</th><th>Status</th><th className="c">Ações</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={7} className="empty">Carregando…</td></tr>
              : linhas.length === 0 ? <tr><td colSpan={7} className="empty">Nenhum pedido encontrado</td></tr>
              : linhas.map((r) => { const si = PED_ST[r.st] || { l: r.st, b: 'b-baixado' }; return <tr key={r.fKey}>
                <td>{r.fornNome}</td>
                <td className="r mono">{r.nItens}</td>
                <td className="r mono">{brl(r.valor)}</td>
                <td className="r">{r.nLojas ? r.nLojas + (r.nLojas > 1 ? ' lojas' : ' loja') : '—'}</td>
                <td className="mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtData(r.data)}</td>
                <td><span className={'badge ' + si.b}>{si.l}</span></td>
                <td className="c" style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn-ghost" style={{ height: 28, padding: '0 9px' }} onClick={() => setVerId(r.primId)}>Visualizar</button>
                  <button className="btn-ghost" style={{ height: 28, padding: '0 9px' }} onClick={() => imprimir(r.fornNome, r.peds)}>PDF</button>
                  {r.whatsapp && <button className="btn-ghost" style={{ height: 28, padding: '0 9px' }} title="WhatsApp" onClick={() => enviarWhats(r.primId, fornMap[r.fKey])}>💬</button>}
                </td>
              </tr> })}
          </tbody>
          {linhas.length > 0 && <tfoot><tr style={{ background: '#f8fafc', fontWeight: 700 }}><td>TOTAL GERAL</td><td className="r mono">{totItens}</td><td className="r mono">{brl(totValor)}</td><td colSpan={4} /></tr></tfoot>}
        </table>
      </div></div>

      {verId && <VerPedido pedido={pedidos.find((p) => p.id === verId)!} itens={itensMap[verId] || []} forn={fornMap[pedidos.find((p) => p.id === verId)?.fornecedor_id || '']} insMap={insMap} porLoja={porLojaText} onClose={() => setVerId(null)} onStatus={mudarStatus} onWhats={enviarWhats} onPrint={imprimir} />}
      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </>
  )
}

function VerPedido({ pedido, itens, forn, insMap, porLoja, onClose, onStatus, onWhats, onPrint }: { pedido: Pedido; itens: ItemPedido[]; forn?: Forn; insMap: Record<string, Insumo>; porLoja: (it: ItemPedido) => string; onClose: () => void; onStatus: (id: string, s: string) => void; onWhats: (id: string, f?: Forn | null) => void; onPrint: (nome: string, peds: Pedido[]) => void }) {
  const si = PED_ST[pedido.status || ''] || { l: pedido.status || '', b: 'b-baixado' }
  return (
    <div className="ov" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 'min(720px,96vw)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div><h2 style={{ marginBottom: 4 }}>Pedido — {forn?.nome || '—'}</h2><div style={{ fontSize: 12, color: '#94a3b8' }}>Data: {fmtData(pedido.data_pedido)} · <span className={'badge ' + si.b}>{si.l}</span> {pedido.observacao ? ' · ' + pedido.observacao : ''}</div></div>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Insumo</th><th>Código</th><th>Categoria</th><th className="r">Qtd</th><th>Un.</th><th>Por loja</th></tr></thead>
          <tbody>{itens.map((it, i) => <tr key={i}><td style={{ fontWeight: 500 }}>{insMap[it.insumo_id]?.nome || it.insumo_id}</td><td className="mono" style={{ fontSize: 12, color: '#94a3b8' }}>{fmtCod(insMap[it.insumo_id]?.codigo_interno)}</td><td style={{ fontSize: 12, color: '#94a3b8' }}>{insMap[it.insumo_id]?.categoria || '—'}</td><td className="r mono">{fmtQtyDoc(it.quantidade)}</td><td>{it.unidade || 'un'}</td><td style={{ fontSize: 11, color: '#94a3b8' }}>{porLoja(it)}</td></tr>)}</tbody>
        </table></div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn-ghost" onClick={() => onPrint(forn?.nome || '—', [pedido])}>🖨 Imprimir / PDF</button>
          {pedido.status === 'aguardando_aprovacao' && <>
            <button className="btn-primary" style={{ background: '#16a34a' }} onClick={() => onStatus(pedido.id, 'pendente')}>✓ Aprovar</button>
            <button className="btn-ghost" style={{ color: '#e11d48' }} onClick={() => onStatus(pedido.id, 'cancelado')}>✕ Cancelar</button>
          </>}
          {pedido.status === 'pendente' && <>
            <button className="btn-primary" style={{ background: '#16a34a' }} onClick={() => onStatus(pedido.id, 'enviado')}>📤 Marcar como Enviado</button>
            <button className="btn-ghost" style={{ color: '#e11d48' }} onClick={() => onStatus(pedido.id, 'cancelado')}>✕ Cancelar</button>
            {forn?.whatsapp && <button className="btn-primary" style={{ background: '#2563eb' }} onClick={() => onWhats(pedido.id, forn)}>💬 WhatsApp</button>}
          </>}
          {pedido.status === 'enviado' && <button className="btn-primary" style={{ background: '#16a34a' }} onClick={() => onStatus(pedido.id, 'baixado')}>✓ Baixar Pedido</button>}
        </div>
      </div>
    </div>
  )
}

// modal genérico "ver itens" de uma solicitação
function VerModal({ titulo, sub, id, insumos, onClose }: { titulo: string; sub: string; id: string; insumos: Insumo[]; onClose: () => void }) {
  const { data: itens = [], isLoading } = useQuery({ queryKey: ['cmp-solitens', id], queryFn: async () => { const { data } = await supabase.from('itens_pedido').select('*').eq('pedido_id', id); return (data ?? []) as ItemPedido[] } })
  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i.nome])) as Record<string, string>, [insumos])
  return (
    <div className="ov" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 'min(560px,95vw)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}><div><h2 style={{ marginBottom: 2 }}>{titulo}</h2><div style={{ fontSize: 12, color: '#94a3b8' }}>{sub}</div></div><button className="icon-btn" onClick={onClose}>✕</button></div>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Insumo</th><th className="r">Quantidade</th><th>Un.</th></tr></thead>
          <tbody>{isLoading ? <tr><td colSpan={3} className="empty">Carregando…</td></tr> : itens.length === 0 ? <tr><td colSpan={3} className="empty">Nenhum item</td></tr> : itens.map((it, i) => <tr key={i}><td>{insMap[it.insumo_id] || it.insumo_id}</td><td className="r mono">{fmtQty(it.quantidade)}</td><td>{it.unidade || 'un'}</td></tr>)}</tbody>
        </table></div>
      </div>
    </div>
  )
}
