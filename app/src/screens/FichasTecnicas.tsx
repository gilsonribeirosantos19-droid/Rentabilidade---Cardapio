import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { FichaModal } from './FichaModal'
import './fichas.css'

type Item = { id?: string; insumo_id?: string | null; produto_id?: string | null; quantidade_g?: number; ordem?: number }
type Ficha = {
  id: string; nome?: string; categoria?: string; rendimento_porcoes?: number; preco_venda?: number | null
  status?: string; insumo_vinculado_id?: string | null; rendimento_receita_g?: number | null; produto_id?: string | null
  itens_ficha?: Item[]
}
type Insumo = { id: string; nome?: string; categoria?: string; preco_compra?: number; rendimento_pct?: number; unidade_medida?: string; unidade_compra?: string }
type ProdutoMin = { id: string; nome?: string; grupo?: string; categoria?: string }
type Saldo = { insumo_id: string; custo_medio?: number }

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

  const { data: fichas = [], isLoading } = useQuery({
    queryKey: ['fichas', tenantId], enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.from('fichas_tecnicas')
        .select('*, itens_ficha(id,insumo_id,produto_id,quantidade_g,ordem)')
        .eq('tenant_id', tenantId).order('nome')
      if (error) throw error
      return data as Ficha[]
    },
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
    queryFn: async () => { const { data } = await supabase.from('saldo_estoque').select('insumo_id,custo_medio').eq('tenant_id', tenantId); return (data ?? []) as Saldo[] },
  })

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])), [insumos])
  const cmMap = useMemo(() => {
    const m: Record<string, number> = {}
    saldos.forEach((s) => { if ((s.custo_medio || 0) > (m[s.insumo_id] || 0)) m[s.insumo_id] = s.custo_medio || 0 })
    return m
  }, [saldos])
  const fichaByProduto = useMemo(() => Object.fromEntries(fichas.filter((f) => f.produto_id).map((f) => [f.produto_id!, f])), [fichas])

  // ── custo ──
  const custoBase = (ins: Insumo) => (cmMap[ins.id] > 0 ? cmMap[ins.id] : ins.preco_compra || 0)
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

      {ver && <VerFicha ficha={ver} m={metricas(ver)} insMap={insMap} custoItem={(it) => custoItem(it, new Set())} cmvCls={cmvCls} onClose={() => setVer(null)} />}
      {editing && <FichaModal ficha={editing === 'new' ? null : editing} produtos={produtos} insumos={insumos} insMap={insMap} custoIng={custoIngrediente} tenantId={tenantId} onClose={() => setEditing(null)} onSaved={() => setEditing(null)} />}
    </div>
  )
}

function VerFicha({ ficha, m, insMap, custoItem, cmvCls, onClose }: {
  ficha: Ficha
  m: { custo: number; pv: number; cmv: number | null; margem: number | null }
  insMap: Record<string, Insumo>
  custoItem: (it: Item) => number
  cmvCls: (cmv: number | null) => string
  onClose: () => void
}) {
  const itens = [...(ficha.itens_ficha || [])].sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
  return (
    <div className="overlay" onClick={onClose}>
      <div className="vm" onClick={(e) => e.stopPropagation()}>
        <div className="vm-head">
          <div><h2>{ficha.nome}</h2><div className="cat">{ficha.categoria || '—'} · rende {ficha.rendimento_porcoes || 1} porção(ões)</div></div>
          <button className="vm-x" onClick={onClose}>✕</button>
        </div>
        <div className="vm-body">
          <div className="kpis">
            <div className="kpi"><div className="l">Custo</div><div className="v">{m.custo > 0 ? brl(m.custo) : '—'}</div></div>
            <div className="kpi"><div className="l">Preço Venda</div><div className="v">{m.pv > 0 ? brl(m.pv) : '—'}</div></div>
            <div className="kpi"><div className="l">CMV</div><div className={'v ' + cmvCls(m.cmv)}>{m.cmv !== null ? m.cmv.toFixed(1) + '%' : '—'}</div></div>
            <div className="kpi"><div className="l">Margem</div><div className="v" style={{ color: m.margem !== null && m.margem > 0 ? '#16a34a' : '#e11d48' }}>{m.margem !== null ? m.margem.toFixed(1) + '%' : '—'}</div></div>
          </div>
          <table className="ing-tbl">
            <thead><tr><th>Ingrediente</th><th>UM</th><th className="r">Qtd</th><th className="r">Custo total</th></tr></thead>
            <tbody>
              {itens.length === 0 ? <tr><td colSpan={4} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>Sem ingredientes</td></tr>
                : itens.map((it, idx) => {
                  const ins = insMap[it.insumo_id || '']
                  const um = ins ? (ins.unidade_medida || ins.unidade_compra || 'g') : '—'
                  return (
                    <tr key={it.id || idx}>
                      <td>{ins?.nome || (it.produto_id ? '(produto)' : '—')}</td>
                      <td>{um}</td>
                      <td className="r">{Number(it.quantidade_g) || 0}</td>
                      <td className="r">{brl(custoItem(it))}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
