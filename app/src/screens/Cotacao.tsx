import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { SearchSelect } from '../components/SearchSelect'
import { brlZero as brl } from '../lib/format'
import { isoD } from '../lib/date'
import { useToastTipo } from '../lib/toast'
import './cotacao.css'

// Cotação de Compras — puxa a DEMANDA das lojas (solicitações do Portal), compara preços de
// fornecedores por insumo e gera o pedido firme pelo MENOR preço (usa a RPC gerar_pedidos_compra,
// a mesma do "Processar": grava detalhe_lojas e marca as solicitações como processado).
type Cotacao = { id: string; titulo?: string; status?: string; prazo_resposta?: string | null; loja_id?: string | null; criado_em?: string; origem_sol_ids?: string[] | null }
type Forn = { id: string; nome?: string; nome_fantasia?: string; razao_social?: string }
type Insumo = { id: string; nome?: string; unidade_medida?: string }
type LojaQtd = { loja_id: string; qtd: number }
type CotItem = { id: string; insumo_id: string; quantidade: number; unidade?: string | null; detalhe_lojas?: LojaQtd[] | null }
type CotForn = { id: string; fornecedor_id: string }
type CotPreco = { cotacao_item_id: string; fornecedor_id: string; preco_unitario: number | null }
type Pedido = { id: string; loja_id?: string | null }
type ItemPed = { pedido_id: string; insumo_id: string; quantidade?: number; unidade?: string | null }

const STATUS_LBL: Record<string, string> = { aberta: 'Aberta', respondida: 'Respondida', fechada: 'Fechada', cancelada: 'Cancelada' }
const fmtData = (s?: string | null) => s ? new Date(s + (s.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('pt-BR') : '—'
const parseNum = (s: string) => { const n = Number((s || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? null : n }
const fornNome = (f?: Forn) => f ? (f.nome_fantasia || f.nome || f.razao_social || '—') : '—'

export function Cotacao() {
  const { tenantId } = useAuth()
  const [view, setView] = useState<'list' | 'nova' | 'det'>('list')
  const [selId, setSelId] = useState<string | null>(null)
  const { toast, showToast } = useToastTipo(3000)

  const { data: cotacoes = [], isLoading } = useQuery({
    queryKey: ['cot-list', tenantId], enabled: !!tenantId,
    queryFn: () => fetchAll<Cotacao>((f, t) => supabase.from('cotacoes').select('*').eq('tenant_id', tenantId).order('criado_em', { ascending: false }).order('id').range(f, t)),
  })
  const { data: fornecedores = [] } = useQuery({
    queryKey: ['cot-forns', tenantId], enabled: !!tenantId,
    queryFn: () => fetchAll<Forn>((f, t) => supabase.from('fornecedores').select('id,nome,nome_fantasia,razao_social').eq('tenant_id', tenantId).order('nome').order('id').range(f, t)),
  })
  const { data: insumos = [] } = useQuery({
    queryKey: ['cot-insumos', tenantId], enabled: !!tenantId,
    queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,unidade_medida').eq('tenant_id', tenantId).eq('ativo', true).order('nome').order('id').range(f, t)),
  })

  const abrir = (id: string) => { setSelId(id); setView('det') }

  return (
    <div className="cot-screen">
      {view === 'list' && (
        <>
          <div className="cot-top">
            <div><div className="cot-h">Cotação de Compras</div><div className="cot-sub">Puxe o pedido das lojas, compare fornecedores e compre pelo menor preço.</div></div>
            <button className="cot-btn pri" onClick={() => setView('nova')}>+ Nova cotação</button>
          </div>
          <div className="cot-card">
            <table className="cot-tbl">
              <thead><tr><th>Cotação</th><th className="c">Status</th><th className="c">Prazo</th><th className="c">Criada</th></tr></thead>
              <tbody>
                {isLoading ? <tr><td colSpan={4} className="cot-empty">Carregando…</td></tr>
                  : cotacoes.length === 0 ? <tr><td colSpan={4} className="cot-empty">Nenhuma cotação ainda. Clique em “+ Nova cotação”.</td></tr>
                    : cotacoes.map((c) => (
                      <tr key={c.id} className="cot-row" onClick={() => abrir(c.id)}>
                        <td><div className="cot-tit">{c.titulo || 'Cotação'}</div></td>
                        <td className="c"><span className={'cot-badge s-' + (c.status || 'aberta')}>{STATUS_LBL[c.status || 'aberta'] || c.status}</span></td>
                        <td className="c mono" style={{ fontSize: 12 }}>{fmtData(c.prazo_resposta)}</td>
                        <td className="c mono" style={{ fontSize: 12, color: '#94a3b8' }}>{fmtData(c.criado_em)}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view === 'nova' && (
        <NovaCotacao tenantId={tenantId!} fornecedores={fornecedores} insumos={insumos}
          onCancel={() => setView('list')} onCreated={(id) => { showToast('Cotação criada.', 'ok'); abrir(id) }} onMsg={showToast} />
      )}

      {view === 'det' && selId && (
        <Detalhe id={selId} tenantId={tenantId!} fornecedores={fornecedores} insumos={insumos}
          onBack={() => setView('list')} onMsg={showToast} />
      )}

      {toast && <div className={'cot-toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}

// ---------- Nova cotação (puxa a demanda das lojas) ----------
type NovoItem = { insumo_id: string; nome: string; quantidade: number; unidade: string; detalhe_lojas: LojaQtd[] | null }

function NovaCotacao({ tenantId, fornecedores, insumos, onCancel, onCreated, onMsg }: {
  tenantId: string; fornecedores: Forn[]; insumos: Insumo[]
  onCancel: () => void; onCreated: (id: string) => void; onMsg: (m: string, t?: 'ok' | 'err') => void
}) {
  const qc = useQueryClient()
  const [titulo, setTitulo] = useState('')
  const [prazo, setPrazo] = useState('')
  const [itens, setItens] = useState<NovoItem[]>([])
  const [solIds, setSolIds] = useState<string[]>([])
  const [fornIds, setFornIds] = useState<string[]>([])
  const [insPick, setInsPick] = useState(''); const [qtd, setQtd] = useState('')

  const insByNome = useMemo(() => Object.fromEntries(insumos.map((i) => [i.nome || '', i])) as Record<string, Insumo>, [insumos])
  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])

  // solicitações abertas das lojas (Portal) — a demanda do dia
  const { data: sols = [] } = useQuery({ queryKey: ['cot-sols', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Pedido>((f, t) => supabase.from('pedidos_compra').select('id,loja_id').eq('tenant_id', tenantId).eq('status', 'solicitado').not('loja_id', 'is', null).order('id').range(f, t)) })
  const { data: itensSol = [] } = useQuery({ queryKey: ['cot-solitens', tenantId, sols.map((s) => s.id).join(',')], enabled: !!tenantId && sols.length > 0, queryFn: () => fetchAll<ItemPed>((f, t) => supabase.from('itens_pedido').select('pedido_id,insumo_id,quantidade,unidade').in('pedido_id', sols.map((s) => s.id)).order('id').range(f, t)) })

  const puxarSolicitacoes = () => {
    if (!sols.length) { onMsg('Nenhuma solicitação pendente das lojas no momento.', 'err'); return }
    const solById = Object.fromEntries(sols.map((s) => [s.id, s]))
    const c: Record<string, NovoItem> = {}
    itensSol.forEach((it) => {
      const s = solById[it.pedido_id]; if (!s) return
      const ins = insMap[it.insumo_id]; const und = it.unidade || ins?.unidade_medida || 'un'
      const key = it.insumo_id + '|' + und
      if (!c[key]) c[key] = { insumo_id: it.insumo_id, nome: ins?.nome || it.insumo_id, quantidade: 0, unidade: und, detalhe_lojas: [] }
      const q = Number(it.quantidade) || 0
      c[key].quantidade += q
      const dl = c[key].detalhe_lojas!; const ex = dl.find((l) => l.loja_id === (s.loja_id || ''))
      if (ex) ex.qtd += q; else dl.push({ loja_id: s.loja_id || '', qtd: q })
    })
    setItens(Object.values(c))
    setSolIds(sols.map((s) => s.id))
    onMsg(`${Object.keys(c).length} insumo(s) puxado(s) de ${sols.length} solicitação(ões).`, 'ok')
  }

  const addManual = () => {
    const ins = insByNome[insPick]; const q = parseNum(qtd)
    if (!ins) { onMsg('Escolha o insumo.', 'err'); return }
    if (!q || q <= 0) { onMsg('Informe a quantidade.', 'err'); return }
    if (itens.some((x) => x.insumo_id === ins.id)) { onMsg('Esse insumo já está na lista.', 'err'); return }
    setItens((l) => [...l, { insumo_id: ins.id, nome: ins.nome || '—', quantidade: q, unidade: ins.unidade_medida || 'un', detalhe_lojas: null }])
    setInsPick(''); setQtd('')
  }
  const rmItem = (insumo_id: string) => setItens((l) => l.filter((x) => x.insumo_id !== insumo_id))
  const toggleForn = (id: string) => setFornIds((l) => l.includes(id) ? l.filter((x) => x !== id) : [...l, id])

  const salvar = useMutation({
    mutationFn: async () => {
      if (!itens.length) throw new Error('Puxe as solicitações ou adicione ao menos um item.')
      if (!fornIds.length) throw new Error('Escolha ao menos um fornecedor para cotar.')
      const { data: cot, error } = await supabase.from('cotacoes').insert({
        tenant_id: tenantId, loja_id: null, titulo: titulo.trim() || 'Cotação', status: 'aberta',
        prazo_resposta: prazo || null, origem_sol_ids: solIds.length ? solIds : null,
      }).select('id').single()
      if (error) throw error
      const cid = (cot as { id: string }).id
      const ei = await supabase.from('cotacao_itens').insert(itens.map((it) => ({ tenant_id: tenantId, cotacao_id: cid, insumo_id: it.insumo_id, quantidade: it.quantidade, unidade: it.unidade, detalhe_lojas: it.detalhe_lojas })))
      if (ei.error) throw ei.error
      const ef = await supabase.from('cotacao_fornecedores').insert(fornIds.map((fid) => ({ tenant_id: tenantId, cotacao_id: cid, fornecedor_id: fid })))
      if (ef.error) throw ef.error
      return cid
    },
    onSuccess: (cid) => { qc.invalidateQueries({ queryKey: ['cot-list'] }); onCreated(cid) },
    onError: (e: Error) => onMsg(e.message, 'err'),
  })

  return (
    <div className="cot-nova">
      <div className="cot-top">
        <div><div className="cot-h">Nova cotação</div><div className="cot-sub">Puxe o pedido das lojas e escolha os fornecedores que vão cotar.</div></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="cot-btn" onClick={onCancel}>Cancelar</button>
          <button className="cot-btn pri" disabled={salvar.isPending} onClick={() => salvar.mutate()}>{salvar.isPending ? 'Salvando…' : 'Criar cotação'}</button>
        </div>
      </div>

      <div className="cot-grid2">
        <div className="cot-card pad">
          <div className="cot-sec">Dados</div>
          <div className="cot-fg"><label>Título</label><input className="cot-in" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Hortifruti — Semana 39" /></div>
          <div className="cot-fg"><label>Prazo p/ resposta</label><input type="date" className="cot-in" value={prazo} onChange={(e) => setPrazo(e.target.value)} /></div>

          <div className="cot-sec" style={{ marginTop: 16 }}>Fornecedores a cotar *</div>
          <div className="cot-chips">
            {fornecedores.length === 0 ? <span className="cot-muted">Nenhum fornecedor cadastrado.</span>
              : fornecedores.map((f) => (
                <button key={f.id} className={'cot-chip' + (fornIds.includes(f.id) ? ' on' : '')} onClick={() => toggleForn(f.id)}>{fornNome(f)}</button>
              ))}
          </div>
        </div>

        <div className="cot-card pad">
          <div className="cot-sec" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Itens ({itens.length})</span>
            <button className="cot-btn" style={{ height: 30 }} onClick={puxarSolicitacoes} title="Traz o que as lojas pediram no Portal, somado por insumo">⬇ Puxar solicitações das lojas{sols.length ? ` (${sols.length})` : ''}</button>
          </div>
          <div className="cot-additem">
            <div style={{ flex: 1, minWidth: 150 }}><SearchSelect value={insPick} options={insumos.map((i) => i.nome || '')} placeholder="Adicionar item avulso…" onChange={setInsPick} /></div>
            <input className="cot-in" style={{ width: 80 }} placeholder="Qtd" value={qtd} onChange={(e) => setQtd(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addManual() }} />
            <button className="cot-btn" onClick={addManual}>+</button>
          </div>
          <div className="cot-itemlist">
            {itens.length === 0 ? <div className="cot-muted" style={{ padding: '10px 0' }}>Nenhum item. Use “Puxar solicitações das lojas”.</div>
              : itens.map((it) => (
                <div key={it.insumo_id} className="cot-itemrow">
                  <span className="n">{it.nome}{it.detalhe_lojas && it.detalhe_lojas.length > 1 ? <span className="cot-muted" style={{ fontSize: 11 }}> · {it.detalhe_lojas.length} lojas</span> : null}</span>
                  <span className="q mono">{it.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {it.unidade}</span>
                  <button className="cot-x" onClick={() => rmItem(it.insumo_id)}>✕</button>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- Detalhe (registrar preços + mapa + gerar pedido firme) ----------
function Detalhe({ id, tenantId, fornecedores, insumos, onBack, onMsg }: {
  id: string; tenantId: string; fornecedores: Forn[]; insumos: Insumo[]
  onBack: () => void; onMsg: (m: string, t?: 'ok' | 'err') => void
}) {
  const qc = useQueryClient()
  const { usuario } = useAuth()
  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const fornMap = useMemo(() => Object.fromEntries(fornecedores.map((f) => [f.id, f])) as Record<string, Forn>, [fornecedores])

  const { data: cot } = useQuery({ queryKey: ['cot-one', id], queryFn: async () => { const { data } = await supabase.from('cotacoes').select('*').eq('id', id).single(); return data as Cotacao } })
  const { data: itens = [] } = useQuery({ queryKey: ['cot-itens', id], queryFn: async () => { const { data } = await supabase.from('cotacao_itens').select('*').eq('cotacao_id', id).order('id'); return (data ?? []) as CotItem[] } })
  const { data: cotForns = [] } = useQuery({ queryKey: ['cot-cforns', id], queryFn: async () => { const { data } = await supabase.from('cotacao_fornecedores').select('*').eq('cotacao_id', id).order('id'); return (data ?? []) as CotForn[] } })
  const { data: precos = [] } = useQuery({ queryKey: ['cot-precos', id], queryFn: async () => { const { data } = await supabase.from('cotacao_precos').select('cotacao_item_id,fornecedor_id,preco_unitario').eq('cotacao_id', id); return (data ?? []) as CotPreco[] } })
  const { data: exigirAprovacao = false } = useQuery({ queryKey: ['cot-param-aprov', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('parametros').select('valor').eq('tenant_id', tenantId).eq('modulo', 'compras').eq('chave', 'exigir_aprovacao').limit(1); return (data?.[0]?.valor as string) === 'sim' } })

  const [px, setPx] = useState<Record<string, string>>({})
  useEffect(() => {
    const m: Record<string, string> = {}
    precos.forEach((p) => { if (p.preco_unitario != null) m[p.cotacao_item_id + '|' + p.fornecedor_id] = String(p.preco_unitario).replace('.', ',') })
    setPx(m)
  }, [precos])

  const salvarPreco = async (itemId: string, fornId: string, raw: string) => {
    const v = parseNum(raw)
    const { error } = await supabase.from('cotacao_precos').upsert(
      { tenant_id: tenantId, cotacao_id: id, cotacao_item_id: itemId, fornecedor_id: fornId, preco_unitario: v },
      { onConflict: 'cotacao_item_id,fornecedor_id' })
    if (error) { onMsg('Erro ao salvar preço: ' + error.message, 'err'); return }
    qc.invalidateQueries({ queryKey: ['cot-precos', id] })
  }

  const comp = useMemo(() => {
    const val = (itemId: string, fornId: string) => parseNum(px[itemId + '|' + fornId] ?? '')
    const totals: Record<string, number> = {}; const complete: Record<string, boolean> = {}
    cotForns.forEach((cf) => { totals[cf.fornecedor_id] = 0; complete[cf.fornecedor_id] = true })
    let bestTotal = 0; const winner: Record<string, string | null> = {}; let semPreco = 0
    itens.forEach((it) => {
      let min = Infinity, wf: string | null = null
      cotForns.forEach((cf) => {
        const v = val(it.id, cf.fornecedor_id)
        if (v == null) { complete[cf.fornecedor_id] = false; return }
        totals[cf.fornecedor_id] += v * (it.quantidade || 0)
        if (v < min) { min = v; wf = cf.fornecedor_id }
      })
      winner[it.id] = wf
      if (wf) bestTotal += min * (it.quantidade || 0); else semPreco++
    })
    const singles = cotForns.filter((cf) => complete[cf.fornecedor_id]).map((cf) => ({ id: cf.fornecedor_id, total: totals[cf.fornecedor_id] })).sort((a, b) => a.total - b.total)
    return { val, totals, complete, bestTotal, winner, singles, semPreco }
  }, [px, itens, cotForns])

  const copyWhats = () => {
    const linhas = itens.map((it, i) => `${i + 1}. ${insMap[it.insumo_id]?.nome || '—'} — ${it.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${it.unidade || ''}`).join('\n')
    const msg = `🧾 Cotação — ${cot?.titulo || ''}\nPrazo p/ resposta: ${fmtData(cot?.prazo_resposta)}\n\nItens:\n${linhas}\n\nPor favor, informe o *preço por unidade* de cada item e o prazo de entrega. Obrigado!\n— enviado pelo Aiko`
    navigator.clipboard?.writeText(msg).then(() => onMsg('Mensagem copiada! Cole no WhatsApp do fornecedor.', 'ok'), () => onMsg('Não consegui copiar.', 'err'))
  }

  const gerarPedido = useMutation({
    mutationFn: async () => {
      if (comp.bestTotal <= 0) throw new Error('Preencha os preços antes de gerar o pedido.')
      if (comp.semPreco > 0) throw new Error(`${comp.semPreco} item(ns) sem nenhum preço. Preencha ou remova antes de gerar.`)
      if (!confirm('Gerar o(s) pedido(s) de compra pelo menor preço? As solicitações das lojas serão baixadas.')) throw new Error('__cancel__')
      // agrupa itens vencedores por fornecedor (compra item a item)
      const porForn: Record<string, CotItem[]> = {}
      itens.forEach((it) => { const wf = comp.winner[it.id]; if (wf) (porForn[wf] = porForn[wf] || []).push(it) })
      const status = exigirAprovacao ? 'aguardando_aprovacao' : 'pendente'
      const pedidos = Object.entries(porForn).map(([fornId, its]) => ({
        fornecedor_id: fornId, status, observacao: `Cotação: ${cot?.titulo || ''}`,
        itens: its.map((it) => ({
          insumo_id: it.insumo_id, quantidade: it.quantidade, unidade: it.unidade,
          preco_unitario: comp.val(it.id, fornId) || 0,
          detalhe_lojas: (it.detalhe_lojas || []).filter((l) => l.loja_id).map((l) => ({ loja_id: l.loja_id, qtd: l.qtd })),
        })),
      }))
      const solIds = Array.isArray(cot?.origem_sol_ids) ? cot!.origem_sol_ids! : []
      const { data: n, error } = await supabase.rpc('gerar_pedidos_compra', { p_tenant: tenantId, p_solicitante: usuario?.id || null, p_data: isoD(new Date()), p_pedidos: pedidos, p_sol_ids: solIds })
      if (error) throw error
      await supabase.from('cotacoes').update({ status: 'fechada' }).eq('id', id)
      return (n as number) ?? Object.keys(porForn).length
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ['cot-one', id] }); qc.invalidateQueries({ queryKey: ['cot-list'] })
      qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && /^(cmp-|cot-sols|inc-pedidos)/.test(q.queryKey[0] as string) })
      onMsg(`${n} pedido(s) gerado(s) em Compras › Pedidos de Compra!`, 'ok')
    },
    onError: (e: Error) => { if (e.message !== '__cancel__') onMsg('Erro: ' + e.message, 'err') },
  })

  const bestSingle = comp.singles[0]
  const economia = bestSingle ? bestSingle.total - comp.bestTotal : 0
  const fechada = cot?.status === 'fechada'

  return (
    <div className="cot-det">
      <div className="cot-top">
        <div>
          <button className="cot-back" onClick={onBack}>‹ Cotações</button>
          <div className="cot-h">{cot?.titulo || 'Cotação'}</div>
          <div className="cot-sub">prazo {fmtData(cot?.prazo_resposta)} · <span className={'cot-badge s-' + (cot?.status || 'aberta')}>{STATUS_LBL[cot?.status || 'aberta']}</span></div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="cot-btn" onClick={copyWhats}>📋 Copiar WhatsApp</button>
          {!fechada && <button className="cot-btn pri" disabled={gerarPedido.isPending} onClick={() => gerarPedido.mutate()}>{gerarPedido.isPending ? 'Gerando…' : '✓ Gerar pedido'}</button>}
        </div>
      </div>

      {fechada && <div className="cot-fechada">Cotação fechada — os pedidos já foram gerados em <b>Compras › Pedidos de Compra</b>.</div>}

      <div className="cot-card">
        <div className="cot-cardhead"><b>Mapa de cotação</b><span>digite o preço por unidade · menor destacado</span></div>
        <div className="cot-scroll">
          <table className="cot-map">
            <thead><tr>
              <th className="item">Insumo</th>
              {cotForns.map((cf) => <th key={cf.id} className="c">{fornNome(fornMap[cf.fornecedor_id])}</th>)}
              <th className="c">Melhor</th>
            </tr></thead>
            <tbody>
              {itens.length === 0 ? <tr><td colSpan={cotForns.length + 2} className="cot-empty">Sem itens.</td></tr>
                : itens.map((it) => {
                  const wf = comp.winner[it.id]
                  return (
                    <tr key={it.id}>
                      <td className="item"><div className="n">{insMap[it.insumo_id]?.nome || '—'}</div><div className="q">{it.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {it.unidade}</div></td>
                      {cotForns.map((cf) => {
                        const k = it.id + '|' + cf.fornecedor_id
                        const win = wf === cf.fornecedor_id
                        return (
                          <td key={cf.id} className={'pc' + (win ? ' win' : '')}>
                            <div className="pin"><span>R$</span>
                              <input className="mono" inputMode="decimal" value={px[k] ?? ''} placeholder="0,00" disabled={fechada}
                                onChange={(e) => setPx((m) => ({ ...m, [k]: e.target.value }))}
                                onBlur={(e) => salvarPreco(it.id, cf.fornecedor_id, e.target.value)} />
                            </div>
                          </td>
                        )
                      })}
                      <td className="c best">{wf ? <><div className="mono">{brl(comp.val(it.id, wf) || 0)}</div><div className="q">{fornNome(fornMap[wf]).split(' ')[0]}</div></> : '—'}</td>
                    </tr>
                  )
                })}
            </tbody>
            {itens.length > 0 && <tfoot><tr>
              <td className="item">Total cotado</td>
              {cotForns.map((cf) => <td key={cf.id} className="c mono">{comp.totals[cf.fornecedor_id] > 0 ? brl(comp.totals[cf.fornecedor_id]) + (comp.complete[cf.fornecedor_id] ? '' : ' *') : '—'}</td>)}
              <td className="c mono win">{comp.bestTotal > 0 ? brl(comp.bestTotal) : '—'}</td>
            </tr></tfoot>}
          </table>
        </div>
      </div>

      {comp.bestTotal > 0 && (
        <div className="cot-reco">
          <div className="rc hl">
            <div className="k">Melhor compra — item a item</div>
            <div className="big mono">{brl(comp.bestTotal)}</div>
            {bestSingle && economia > 0 && <div className="save mono">▼ economia de {brl(economia)} vs {fornNome(fornMap[bestSingle.id]).split(' ')[0]}</div>}
            <p>Cada item vem do fornecedor mais barato. “Gerar pedido” cria 1 pedido firme por fornecedor e baixa as solicitações das lojas.</p>
          </div>
          <div className="rc">
            <div className="k">Fornecedor único (cotou tudo)</div>
            <div className="cot-opts">
              {comp.singles.length === 0 ? <span className="cot-muted">Nenhum fornecedor cotou todos os itens ainda.</span>
                : comp.singles.map((s, i) => (
                  <div key={s.id} className={'opt' + (i === 0 ? ' top' : '')}>
                    <span className="lab">{fornNome(fornMap[s.id])}</span>
                    <span className="amt mono">{brl(s.total)}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
      <p className="cot-note">* fornecedor não cotou todos os itens. Os preços são salvos automaticamente ao sair do campo.</p>
    </div>
  )
}
