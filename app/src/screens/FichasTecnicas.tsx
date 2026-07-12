import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { FichaModal } from './FichaModal'
import './fichas.css'

type Item = { id?: string; insumo_id?: string | null; produto_id?: string | null; quantidade_g?: number; ordem?: number }
type Ficha = {
  id: string; nome?: string; categoria?: string; rendimento_porcoes?: number; preco_venda?: number | null
  status?: string; insumo_vinculado_id?: string | null; rendimento_receita_g?: number | null; produto_id?: string | null
  preco_delivery?: number | null; observacoes?: string | null; created_at?: string; atualizado_em?: string
  itens_ficha?: Item[]
}
type PrecoParams = { txDel: number; txCar: number; txImp: number; margMin: number }
type Insumo = { id: string; nome?: string; categoria?: string; preco_compra?: number; rendimento_pct?: number; unidade_medida?: string; unidade_compra?: string }
type ProdutoMin = { id: string; nome?: string; grupo?: string; categoria?: string }
type Saldo = { insumo_id: string; custo_medio?: number; loja_id?: string }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const uniq = (a: (string | undefined)[]) => [...new Set(a.filter(Boolean) as string[])].sort()

export function FichasTecnicas() {
  const { tenantId } = useAuth()
  const [busca, setBusca] = useState('')
  const [fCat, setFCat] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fCmv, setFCmv] = useState('')
  const [ver, setVer] = useState<Ficha | null>(null)
  const [editing, setEditing] = useState<Ficha | 'new' | null>(null)
  const [lojaSel, setLojaSel] = useState('')

  const { data: fichas = [], isLoading } = useQuery({
    queryKey: ['fichas', tenantId], enabled: !!tenantId,
    // fetchAll: vence o teto de 1000 do PostgREST (o range vale pra ficha; o embed dos itens vem junto)
    queryFn: () => fetchAll<Ficha>((f, t) => supabase.from('fichas_tecnicas')
      .select('*, itens_ficha(id,insumo_id,produto_id,quantidade_g,ordem)')
      .eq('tenant_id', tenantId).order('nome').range(f, t)),
  })
  const { data: insumos = [] } = useQuery({
    queryKey: ['insumos-min', tenantId], enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from('insumos').select('id,nome,categoria,preco_compra,rendimento_pct,unidade_medida,unidade_compra').eq('tenant_id', tenantId).eq('ativo', true).order('nome')
      return (data ?? []) as Insumo[]
    },
  })
  const { data: produtos = [] } = useQuery({
    queryKey: ['produtos-min', tenantId], enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from('produtos').select('id,nome,grupo,categoria').eq('tenant_id', tenantId).order('nome')
      return (data ?? []) as ProdutoMin[]
    },
  })
  const { data: saldos = [] } = useQuery({
    queryKey: ['saldos', tenantId], enabled: !!tenantId,
    queryFn: () => fetchAll<Saldo>((f, t) => supabase.from('saldo_estoque').select('insumo_id,custo_medio,loja_id').eq('tenant_id', tenantId).range(f, t)),
  })
  const { data: lojas = [] } = useQuery({ queryKey: ['fic-lojas', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('lojas').select('id,nome').eq('tenant_id', tenantId).eq('ativo', true).order('nome'); return (data ?? []) as { id: string; nome?: string }[] } })
  useEffect(() => { if (!lojaSel && lojas.length) setLojaSel(lojas[0].id) }, [lojas, lojaSel])
  // parâmetros de precificação (taxas que saem da venda) — pra Margem Salão/Delivery
  const { data: precoParams } = useQuery({
    queryKey: ['fic-precparams', tenantId], enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from('parametros').select('chave,valor').eq('tenant_id', tenantId).eq('modulo', 'precificacao')
      const mp = Object.fromEntries((data ?? []).map((r: { chave: string; valor: string }) => [r.chave, parseFloat(r.valor)]))
      return { txDel: mp.taxa_delivery ?? 27, txCar: mp.taxa_cartao ?? 3, txImp: mp.imposto ?? 6, margMin: mp.margem_minima ?? 20 } as PrecoParams
    },
  })
  const params: PrecoParams = precoParams ?? { txDel: 27, txCar: 3, txImp: 6, margMin: 20 }

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])), [insumos])
  // custo médio POR LOJA (não mistura entre lojas) — a ficha reflete a loja selecionada
  const cmByLoja = useMemo(() => {
    const m: Record<string, Record<string, number>> = {}
    saldos.forEach((s) => { if (s.loja_id) (m[s.insumo_id] ||= {})[s.loja_id] = s.custo_medio || 0 })
    return m
  }, [saldos])
  const fichaByProduto = useMemo(() => Object.fromEntries(fichas.filter((f) => f.produto_id).map((f) => [f.produto_id!, f])), [fichas])

  // ── custo ──
  const custoBase = (ins: Insumo) => {
    const porLoja = cmByLoja[ins.id] || {}
    if (lojaSel) { const c = porLoja[lojaSel] || 0; return c > 0 ? c : (ins.preco_compra || 0) }
    const mx = Math.max(0, ...Object.values(porLoja))
    return mx > 0 ? mx : (ins.preco_compra || 0)
  }
  const custoIngrediente = (ins: Insumo, qtdG: number) => {
    const cb = custoBase(ins)
    const um = ins.unidade_medida || ins.unidade_compra || 'g'
    if (um === 'un' || um === 'pct' || um === 'cx') return cb * qtdG
    return cb / ((ins.rendimento_pct || 100) / 100) / 1000 * qtdG
  }
  const custoProduto = (pid: string, seen: Set<string>): number => {
    if (seen.has(pid)) return 0
    seen.add(pid)
    const f = fichaByProduto[pid]
    return f ? custoFicha(f, seen) : 0
  }
  const custoItem = (it: Item, seen: Set<string>): number => {
    const q = Number(it.quantidade_g) || 0
    if (it.produto_id) return custoProduto(it.produto_id, seen) * q
    const ins = insMap[it.insumo_id || '']
    return ins ? custoIngrediente(ins, q) : 0
  }
  const custoTotal = (f: Ficha, seen = new Set<string>()) => (f.itens_ficha || []).reduce((a, it) => a + custoItem(it, seen), 0)
  function custoFicha(f: Ficha, seen = new Set<string>()): number {
    if (f.insumo_vinculado_id && Number(f.rendimento_receita_g) > 0) return custoTotal(f, seen) / (Number(f.rendimento_receita_g) / 1000)
    const por = Number(f.rendimento_porcoes) > 0 ? Number(f.rendimento_porcoes) : 1
    return custoTotal(f, seen) / por
  }

  const metricas = (f: Ficha) => {
    const custo = custoFicha(f)
    const pv = Number(f.preco_venda) || 0
    const cmv = custo > 0 && pv > 0 ? (custo / pv) * 100 : null
    const margem = custo > 0 && pv > 0 ? ((pv - custo) / pv) * 100 : null
    return { custo, pv, cmv, margem }
  }
  const cmvCls = (cmv: number | null) => (cmv === null ? '' : cmv <= 30 ? 'cmv-ok' : cmv <= 38 ? 'cmv-warn' : 'cmv-bad')
  const statusPill = (f: Ficha, cmv: number | null, pv: number) => {
    if (f.status === 'rascunho') return { t: 'Rascunho', bg: '#f1f5f9', c: '#64748b' }
    if (f.status === 'arquivada') return { t: 'Arquivada', bg: '#f1f5f9', c: '#94a3b8' }
    if (!pv) return { t: 'Sem preço', bg: '#f1f5f9', c: '#64748b' }
    if (cmv !== null && cmv > 38) return { t: 'Crítica', bg: '#fee2e2', c: '#e11d48' }
    if (cmv !== null && cmv > 30) return { t: 'Atenção', bg: '#fef3c7', c: '#f59e0b' }
    return { t: 'Ativa', bg: '#dcfce7', c: '#16a34a' }
  }

  const categorias = useMemo(() => uniq(fichas.map((f) => f.categoria)), [fichas])
  const filtrada = useMemo(() => {
    const q = norm(busca.trim())
    return fichas.filter((f) => {
      if (q && !norm(f.nome || '').includes(q)) return false
      if (fCat && (f.categoria || '') !== fCat) return false
      if (fStatus && (f.status || 'ativa') !== fStatus) return false
      if (fCmv) {
        const { cmv, pv } = metricas(f)
        if (fCmv === 'sem' && pv) return false
        if (fCmv === 'verde' && !(cmv !== null && cmv <= 30)) return false
        if (fCmv === 'amarelo' && !(cmv !== null && cmv > 30 && cmv <= 38)) return false
        if (fCmv === 'vermelho' && !(cmv !== null && cmv > 38)) return false
      }
      return true
    })
  }, [fichas, busca, fCat, fStatus, fCmv]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fic-screen">
      <div className="fic-toolbar">
        <div className="fic-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input placeholder="Buscar ficha..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="fic-field"><span className="fic-label">Loja (custo)</span>
          <select className="fic-sel" value={lojaSel} onChange={(e) => setLojaSel(e.target.value)}>
            <option value="">Custo geral (maior)</option>
            {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </div>
        <div className="fic-field"><span className="fic-label">Categoria</span>
          <select className="fic-sel" value={fCat} onChange={(e) => setFCat(e.target.value)}>
            <option value="">Todas categorias</option>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="fic-field"><span className="fic-label">Status</span>
          <select className="fic-sel" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="">Todos</option><option value="ativa">Ativa</option><option value="rascunho">Rascunho</option><option value="arquivada">Arquivada</option>
          </select>
        </div>
        <div className="fic-field"><span className="fic-label">CMV</span>
          <select className="fic-sel" value={fCmv} onChange={(e) => setFCmv(e.target.value)}>
            <option value="">Todos</option>
            <option value="verde">🟢 Bom (≤30%)</option>
            <option value="amarelo">🟡 Atenção (≤38%)</option>
            <option value="vermelho">🔴 Crítico (&gt;38%)</option>
            <option value="sem">Sem preço</option>
          </select>
        </div>
        <button className="fic-mais"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg> Mais filtros</button>
        <button className="fic-nova" onClick={() => setEditing('new')}>+ Nova ficha</button>
      </div>

      <div className="fic-body">
      <div className="fic-left">
      <div className="tbl-card"><div className="tbl-scroll">
        <table>
          <thead><tr>
            <th>Nome da Ficha</th><th>Categoria</th><th>Rendimento</th>
            <th className="r">Custo</th><th className="r">Preço Venda</th><th className="r">CMV%</th><th className="r">Margem%</th><th>Status</th><th>Ações</th>
          </tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={9} className="empty">Carregando…</td></tr>
              : filtrada.length === 0 ? <tr><td colSpan={9} className="empty" style={{ height: 70 }}>Nenhuma ficha encontrada</td></tr>
              : filtrada.map((f) => {
                const { custo, pv, cmv, margem } = metricas(f)
                const st = statusPill(f, cmv, pv)
                return (
                  <tr key={f.id} onClick={() => setVer(f)}>
                    <td>{f.nome}</td>
                    <td style={{ color: '#475569' }}>{f.categoria || '—'}</td>
                    <td style={{ color: '#64748b', fontSize: 12 }}>{f.rendimento_porcoes || 1} un</td>
                    <td className="r mono">{custo > 0 ? brl(custo) : '—'}</td>
                    <td className="r mono">{pv > 0 ? brl(pv) : '—'}</td>
                    <td className="r"><b className={cmvCls(cmv)}>{cmv !== null ? cmv.toFixed(1) + '%' : '—'}</b></td>
                    <td className="r"><b style={{ color: margem !== null && margem > 0 ? '#16a34a' : '#e11d48' }}>{margem !== null ? margem.toFixed(1) + '%' : '—'}</b></td>
                    <td><span className="st-pill" style={{ background: st.bg, color: st.c }}>{st.t}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="ed-btn" onClick={(e) => { e.stopPropagation(); setEditing(f) }}>✎ Editar</button>
                      <button className="ver-btn" onClick={(e) => { e.stopPropagation(); setVer(f) }}>👁 Ver</button>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div></div>

      <div className="fic-foot">{filtrada.length} fichas</div>
      </div>

      {ver && (() => { const mm = metricas(ver); const st = statusPill(ver, mm.cmv, mm.pv); return (
        <VerFicha ficha={ver} m={mm} st={st} insMap={insMap} custoItem={(it) => custoItem(it, new Set())} custoBase={custoBase} params={params} tenantId={tenantId} onClose={() => setVer(null)} onEdit={() => { setEditing(ver); setVer(null) }} />
      ) })()}
      </div>
      {editing && <FichaModal ficha={editing === 'new' ? null : editing} produtos={produtos} insumos={insumos} insMap={insMap} custoIng={custoIngrediente} tenantId={tenantId} onClose={() => setEditing(null)} onSaved={() => setEditing(null)} />}
    </div>
  )
}

function VerFicha({ ficha, m, st, insMap, custoItem, custoBase, params, tenantId, onClose, onEdit }: {
  ficha: Ficha
  m: { custo: number; pv: number; cmv: number | null; margem: number | null }
  st: { t: string; bg: string; c: string }
  insMap: Record<string, Insumo>
  custoItem: (it: Item) => number
  custoBase: (ins: Insumo) => number
  params: PrecoParams
  tenantId?: string | null
  onClose: () => void
  onEdit: () => void
}) {
  const [tab, setTab] = useState<'resumo' | 'ingredientes' | 'financeiro' | 'historico'>('resumo')
  const itens = [...(ficha.itens_ficha || [])].sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
  const custo = m.custo                                   // custo por unidade/porção
  const custoTot = itens.reduce((s, it) => s + custoItem(it), 0)  // custo total da receita
  const pv = m.pv
  const pvDel = Number(ficha.preco_delivery) > 0 ? Number(ficha.preco_delivery) : pv
  const cmv = m.cmv
  const markup = custo > 0 && pv > 0 ? pv / custo : null
  const margemRs = pv > 0 && custo > 0 ? pv - custo : null
  const margemPct = m.margem
  const { txDel, txCar, txImp, margMin } = params
  const margSalao = pv > 0 && custo > 0 ? ((pv - custo - pv * (txCar + txImp) / 100) / pv) * 100 : null
  const margDeliv = pvDel > 0 && custo > 0 ? ((pvDel - custo - pvDel * (txDel + txImp) / 100) / pvDel) * 100 : null
  const corMarg = (v: number | null) => (v === null ? '#64748b' : v < margMin ? '#e11d48' : '#16a34a')
  const cmvColor = cmv === null ? '#64748b' : cmv <= 30 ? '#16a34a' : cmv <= 38 ? '#f59e0b' : '#e11d48'

  const insIds = itens.map((it) => it.insumo_id).filter(Boolean) as string[]
  const { data: hist = [] } = useQuery({
    queryKey: ['fic-hist', ficha.id, insIds.join(',')], enabled: !!tenantId && tab === 'historico' && insIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from('historico_custo').select('*').eq('tenant_id', tenantId).in('insumo_id', insIds).order('created_at', { ascending: false }).limit(20)
      return (data ?? []) as Record<string, unknown>[]
    },
  })
  const dt = (s?: string) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—')
  const dth = (s?: string) => (s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
  const qtdFmt = (it: Item, ins?: Insumo) => {
    const um = ins ? ins.unidade_medida || ins.unidade_compra || 'g' : 'g'
    const q = Number(it.quantidade_g) || 0
    return um === 'kg' || um === 'litro' ? (q / 1000).toFixed(3) + ' ' + um : q + ' ' + um
  }

  const finCards = (
    <div className="fin-grid">
      <div className="fin-card"><div className="l">Custo/un</div><div className="v">{custo > 0 ? brl(custo) : '—'}</div></div>
      <div className="fin-card"><div className="l">Preço de venda</div><div className="v">{pv > 0 ? brl(pv) : '—'}</div></div>
      <div className="fin-card"><div className="l">CMV%</div><div className="v" style={{ color: cmvColor }}>{cmv !== null ? cmv.toFixed(1) + '%' : '—'}</div></div>
      <div className="fin-card"><div className="l">Margem (R$)</div><div className="v">{margemRs !== null ? brl(margemRs) : '—'}</div></div>
      <div className="fin-card"><div className="l">Margem%</div><div className="v">{margemPct !== null ? margemPct.toFixed(1) + '%' : '—'}</div></div>
      <div className="fin-card"><div className="l">Markup</div><div className="v">{markup !== null ? markup.toFixed(2) + 'x' : '—'}</div></div>
      <div className="fin-card salao"><div className="l">Margem Salão</div><div className="v" style={{ color: corMarg(margSalao) }}>{margSalao !== null ? margSalao.toFixed(1) + '%' : '—'}</div></div>
      <div className="fin-card deliv"><div className="l">Margem Delivery</div><div className="v" style={{ color: corMarg(margDeliv) }}>{margDeliv !== null ? margDeliv.toFixed(1) + '%' : '—'}</div></div>
    </div>
  )

  return (
    <aside className="dp">
        <div className="dp-hdr">
          <h2>{ficha.nome}</h2>
          <span className="dp-badge" style={{ background: st.bg, color: st.c }}>{st.t}</span>
          <button className="dp-x" onClick={onClose}>✕</button>
        </div>
        <div className="dp-tabs">
          <button className={'dp-tab' + (tab === 'resumo' ? ' on' : '')} onClick={() => setTab('resumo')}>Visão geral</button>
          <button className={'dp-tab' + (tab === 'ingredientes' ? ' on' : '')} onClick={() => setTab('ingredientes')}>Ingredientes</button>
          <button className={'dp-tab' + (tab === 'financeiro' ? ' on' : '')} onClick={() => setTab('financeiro')}>Preços e custos</button>
          <button className={'dp-tab' + (tab === 'historico' ? ' on' : '')} onClick={() => setTab('historico')}>Histórico</button>
        </div>
        <div className="dp-body">
          {tab === 'resumo' && (
            <>
              <div className="dp-sec">Ingredientes (rendimento: {ficha.rendimento_porcoes || 1} un)</div>
              <table className="vg-tbl">
                <thead><tr><th>Ingrediente</th><th>Categoria</th><th className="r">Qtd. utilizada</th><th className="r">Custo (R$)</th><th className="r">% do custo</th></tr></thead>
                <tbody>
                  {itens.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: 16 }}>Nenhum ingrediente</td></tr>
                    : itens.map((it, idx) => {
                      const ins = insMap[it.insumo_id || '']
                      const sub = custoItem(it)
                      const pct = custoTot > 0 ? (sub / custoTot) * 100 : 0
                      return (
                        <tr key={it.id || idx}>
                          <td style={{ fontWeight: 600 }}>{ins?.nome || (it.produto_id ? '(produto)' : '—')}</td>
                          <td style={{ color: '#64748b', fontSize: 11 }}>{ins?.categoria || '—'}</td>
                          <td className="r">{qtdFmt(it, ins)}</td>
                          <td className="r">{brl(sub)}</td>
                          <td className="r" style={{ color: '#94a3b8' }}>{pct.toFixed(1)}%</td>
                        </tr>
                      )
                    })}
                </tbody>
                <tfoot><tr><td colSpan={2}>TOTAL</td><td className="r">{(() => { const t = itens.reduce((s, it) => s + (Number(it.quantidade_g) || 0), 0); return t >= 1000 ? (t / 1000).toFixed(3) + ' kg' : t + ' g' })()}</td><td className="r">{brl(custoTot)}</td><td className="r">100%</td></tr></tfoot>
              </table>
              <div className="dp-sec">Resumo financeiro</div>
              {finCards}
              {ficha.observacoes && <><div className="dp-sec">Observações</div><div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{ficha.observacoes}</div></>}
            </>
          )}
          {tab === 'ingredientes' && (
            <table className="vg-tbl">
              <thead><tr><th>Ingrediente</th><th>Un.</th><th className="r">Qtd</th><th className="r">Custo/kg</th><th className="r">Subtotal</th></tr></thead>
              <tbody>
                {itens.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: 16 }}>Nenhum ingrediente cadastrado</td></tr>
                  : itens.map((it, idx) => {
                    const ins = insMap[it.insumo_id || '']
                    const um = ins ? ins.unidade_medida || ins.unidade_compra || 'g' : 'g'
                    const isUnit = um === 'un' || um === 'pct' || um === 'cx'
                    const cb = ins ? custoBase(ins) : 0
                    const ckg = ins ? (isUnit ? cb : cb / ((ins.rendimento_pct || 100) / 100)) : 0
                    return (
                      <tr key={it.id || idx}>
                        <td style={{ fontWeight: 600 }}>{ins?.nome || (it.produto_id ? '(produto)' : '—')}</td>
                        <td style={{ color: '#64748b' }}>{um}</td>
                        <td className="r">{qtdFmt(it, ins)}</td>
                        <td className="r">{brl(ckg)}</td>
                        <td className="r" style={{ color: '#00b890' }}>{brl(custoItem(it))}</td>
                      </tr>
                    )
                  })}
              </tbody>
              <tfoot><tr><td colSpan={4}>Custo total</td><td className="r">{brl(custoTot)}</td></tr></tfoot>
            </table>
          )}
          {tab === 'financeiro' && (
            <>
              <div className="dp-sec">Custos</div>
              <div className="fin-rows">
                <div className="fin-row"><span>Custo total da receita</span><b>{brl(custoTot)}</b></div>
                <div className="fin-row"><span>Rendimento</span><b>{ficha.rendimento_porcoes || 1} un</b></div>
                <div className="fin-row"><span>Custo por unidade</span><b>{custo > 0 ? brl(custo) : '—'}</b></div>
              </div>
              <div className="dp-sec">Preços</div>
              <div className="fin-rows">
                <div className="fin-row"><span>Preço salão</span><b>{pv > 0 ? brl(pv) : '—'}</b></div>
                <div className="fin-row"><span>Preço delivery</span><b>{Number(ficha.preco_delivery) > 0 ? brl(Number(ficha.preco_delivery)) : <span style={{ color: '#94a3b8', fontWeight: 400 }}>igual ao salão</span>}</b></div>
              </div>
              <div className="dp-sec">Taxas aplicadas (parâmetros)</div>
              <div className="fin-rows">
                <div className="fin-row"><span>Cartão (salão)</span><b>{txCar}%</b></div>
                <div className="fin-row"><span>Delivery / iFood</span><b>{txDel}%</b></div>
                <div className="fin-row"><span>Imposto sobre venda</span><b>{txImp}%</b></div>
                <div className="fin-row"><span>Margem mínima alvo</span><b>{margMin}%</b></div>
              </div>
              <div className="dp-sec">Resultado</div>
              {finCards}
            </>
          )}
          {tab === 'historico' && (
            <>
              <div className="dp-sec">Dados da ficha</div>
              <div className="fin-rows">
                <div className="fin-row"><span>Criada em</span><b>{dt(ficha.created_at)}</b></div>
                <div className="fin-row"><span>Última atualização</span><b>{dth(ficha.atualizado_em)}</b></div>
                <div className="fin-row"><span>Preço salão atual</span><b>{pv > 0 ? brl(pv) : '—'}</b></div>
                <div className="fin-row"><span>Preço delivery atual</span><b>{Number(ficha.preco_delivery) > 0 ? brl(Number(ficha.preco_delivery)) : '—'}</b></div>
                <div className="fin-row"><span>Custo por unidade atual</span><b>{custo > 0 ? brl(custo) : '—'}</b></div>
              </div>
              <div className="dp-sec">Histórico de custo dos ingredientes</div>
              {hist.length === 0 ? (
                <div style={{ fontSize: 12, color: '#94a3b8', padding: '8px 0' }}>Sem eventos de custo registrados para os ingredientes desta ficha.</div>
              ) : (
                <table className="vg-tbl">
                  <thead><tr><th>Data</th><th>Ingrediente</th><th className="r">Custo ant.</th><th className="r">Novo custo</th><th className="r">Impacto</th></tr></thead>
                  <tbody>
                    {hist.map((h, i) => {
                      const ins = insMap[(h.insumo_id as string) || '']
                      const imp = (h.impacto_pct as number | null) ?? null
                      const ca = h.custo_medio_anterior as number | null
                      const cn = h.novo_custo_medio as number | null
                      return (
                        <tr key={i}>
                          <td style={{ color: '#64748b', fontSize: 11 }}>{dt(h.created_at as string)}</td>
                          <td>{ins?.nome || '—'}</td>
                          <td className="r">{ca != null ? brl(Number(ca)) : '—'}</td>
                          <td className="r">{cn != null ? brl(Number(cn)) : '—'}</td>
                          <td className="r" style={{ color: imp == null ? '#94a3b8' : imp > 0 ? '#e11d48' : '#16a34a' }}>{imp != null ? (imp > 0 ? '+' : '') + imp.toFixed(1) + '%' : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, lineHeight: 1.5 }}>O histórico de custo vem das entradas de NF-e/estoque dos ingredientes. O histórico de <b>preço de venda</b> da própria ficha passa a ser registrado quando ligarmos o log de alterações (posso ativar quando quiser).</div>
            </>
          )}
        </div>
        <div className="dp-ftr">
          <button className="dp-edit" onClick={onEdit}>✎ Editar ficha</button>
          <button className="dp-close" onClick={onClose}>Fechar</button>
        </div>
    </aside>
  )
}
