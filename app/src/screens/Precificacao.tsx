import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { usePerms } from '../lib/perms'
import { useLoja } from '../lib/loja'
import { useToastErr } from '../lib/toast'
import { custoFichaPorcao, type CostCtx, type FichasByProduto, type FichaItem } from '../lib/cost'
import { brlCur as brl } from '../lib/format'
import './precificacao.css'

// Precificação (Gestão) — planilha em lote. Custo e preço vêm das fichas técnicas reais.
// 2 abas: "Por CMV" (simulador: digita novo preço, vê CMV/markup/margem novos) e
// "Tradicional" (markup divisor: Preço = Custo ÷ [1 − (DV+DF+ML)]).
// Reusa custoFichaPorcao (lib/cost) — mesma conta de custo do resto do app (não duplica o coração).

type Item = { id?: string; insumo_id?: string | null; produto_id?: string | null; quantidade_g?: number; ordem?: number }
type Ficha = {
  id: string; nome?: string; categoria?: string; rendimento_porcoes?: number; preco_venda?: number | null
  status?: string; produto_id?: string | null; itens_ficha?: Item[]
}
type Produto = { id: string; nome?: string; grupo?: string; categoria?: string; preco_venda?: number | null; codigo_pdv?: string }
type Insumo = { id: string; preco_compra?: number; rendimento_pct?: number; unidade_medida?: string; unidade_compra?: string }
type Saldo = { insumo_id: string; custo_medio?: number; loja_id?: string }
type Params = { txCar: number; txIfood: number; txImp: number; margMin: number }

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const uniq = (a: (string | undefined)[]) => [...new Set(a.filter(Boolean) as string[])].sort((x, y) => x.localeCompare(y, 'pt-BR'))
const n2 = (n: number) => (isFinite(n) ? n : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (n: number) => (isFinite(n) ? n : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
const cls = (c: number) => (c <= 30 ? 'g' : c <= 38 ? 'a' : 'r')
const to90 = (v: number) => {
  if (v <= 0) return 0
  const base = Math.floor(v)
  const cands = [base - 0.1, base + 0.9, base + 1.9].filter((c) => c > 0)
  let best = cands[0], bd = Math.abs(cands[0] - v)
  cands.forEach((c) => { const d = Math.abs(c - v); if (d < bd) { bd = d; best = c } })
  return +best.toFixed(2)
}

export function Precificacao() {
  const { tenantId } = useAuth()
  const { podeEditar } = usePerms()
  const canEdit = podeEditar('gestao/precificacao')
  const { lojas, lojaId } = useLoja()
  // custo por loja: respeita a loja global selecionada. Em "Todas" → MÉDIA entre as lojas.
  const isTodas = !lojaId
  const custoLoja = isTodas ? '__all__' : lojaId
  const lojaNome = isTodas ? 'Todas (média)' : (lojas.find((l) => l.id === lojaId)?.nome || '—')
  const qc = useQueryClient()
  const { toast, showToast } = useToastErr(2600, 7000)

  const [tab, setTab] = useState<'cmv' | 'trad'>('cmv')
  const [q, setQ] = useState('')
  const [fCat, setFCat] = useState('')
  const [fCmv, setFCmv] = useState('')
  const [soPreco, setSoPreco] = useState(true)   // só com preço de venda (exclui rodízios sem preço próprio)
  const [cmvAlvo, setCmvAlvo] = useState('30')
  const [canal, setCanal] = useState<'salao' | 'ifood'>('ifood')
  const [dDv, setDDv] = useState('17')
  const [dDf, setDDf] = useState('10')
  const [dMl, setDMl] = useState('20')
  const [novoById, setNovoById] = useState<Record<string, number>>({})
  const [tradById, setTradById] = useState<Record<string, { dv: number; df: number; ml: number }>>({})

  const { data: fichas = [], isLoading } = useQuery({
    queryKey: ['fichas', tenantId], enabled: !!tenantId,
    queryFn: () => fetchAll<Ficha>((f, t) => supabase.from('fichas_tecnicas')
      .select('id,nome,categoria,rendimento_porcoes,preco_venda,status,produto_id, itens_ficha(id,insumo_id,produto_id,quantidade_g,ordem)')
      .eq('tenant_id', tenantId).order('nome').order('id').range(f, t)),
  })
  const { data: produtos = [] } = useQuery({
    queryKey: ['produtos-min', tenantId], enabled: !!tenantId,
    queryFn: () => fetchAll<Produto>((f, t) => supabase.from('produtos').select('id,nome,grupo,categoria,preco_venda,codigo_pdv').eq('tenant_id', tenantId).order('id').range(f, t)),
  })
  const { data: insumos = [] } = useQuery({
    queryKey: ['insumos-min', tenantId], enabled: !!tenantId,
    queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,preco_compra,rendimento_pct,unidade_medida,unidade_compra').eq('tenant_id', tenantId).eq('ativo', true).order('id').range(f, t)),
  })
  const { data: saldos = [] } = useQuery({
    queryKey: ['saldos', tenantId], enabled: !!tenantId,
    queryFn: () => fetchAll<Saldo>((f, t) => supabase.from('saldo_estoque').select('insumo_id,custo_medio,loja_id').eq('tenant_id', tenantId).order('id').range(f, t)),
  })
  const { data: params } = useQuery({
    queryKey: ['prec-params', tenantId], enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from('parametros').select('chave,valor').eq('tenant_id', tenantId).eq('modulo', 'precificacao')
      const mp = Object.fromEntries((data ?? []).map((r: { chave: string; valor: string }) => [r.chave, parseFloat(r.valor)]))
      return { txCar: mp.taxa_cartao ?? 3, txIfood: mp.taxa_ifood ?? 27, txImp: mp.imposto ?? 0, margMin: mp.margem_minima ?? 20 } as Params
    },
  })
  const P: Params = params ?? { txCar: 3, txIfood: 27, txImp: 0, margMin: 20 }

  // ao carregar os parâmetros, ajusta o DV padrão ao canal (iFood/cartão)
  useEffect(() => { if (params) setDDv(String(canal === 'ifood' ? params.txIfood : params.txCar)) }, [params, canal])

  const produtoById = useMemo(() => Object.fromEntries(produtos.map((p) => [p.id, p])) as Record<string, Produto>, [produtos])
  const fichasByProduto: FichasByProduto = useMemo(() => {
    const m = new Map<string, { itens: Item[]; rendimento_porcoes?: number }>()
    fichas.forEach((f) => { if (f.produto_id) m.set(f.produto_id, { itens: f.itens_ficha || [], rendimento_porcoes: f.rendimento_porcoes }) })
    return m as FichasByProduto
  }, [fichas])
  // em "Todas": média do custo médio de cada insumo entre as lojas (onde tem custo > 0)
  const avgSaldos = useMemo(() => {
    const acc = new Map<string, { sum: number; n: number }>()
    saldos.forEach((s) => { const cm = Number(s.custo_medio) || 0; if (cm > 0) { const a = acc.get(s.insumo_id) || { sum: 0, n: 0 }; a.sum += cm; a.n++; acc.set(s.insumo_id, a) } })
    return [...acc.entries()].map(([insumo_id, a]) => ({ insumo_id, custo_medio: a.sum / a.n, loja_id: '__all__' }))
  }, [saldos])
  const costCtx: CostCtx = useMemo(() => ({ saldos: isTodas ? avgSaldos : saldos, insumos, strictLoja: true }), [isTodas, avgSaldos, saldos, insumos])

  // base: fichas vendáveis (vinculadas a um produto) e não arquivadas — custo e preço atual
  const base = useMemo(() => {
    return fichas
      .filter((f) => f.produto_id && (f.status || 'ativa') !== 'arquivada')
      .map((f) => {
        const custo = custoFichaPorcao((f.itens_ficha || []) as FichaItem[], f.rendimento_porcoes || 1, custoLoja, costCtx, fichasByProduto)
        const prod = f.produto_id ? produtoById[f.produto_id] : undefined
        const precoAtual = Number(f.preco_venda) || Number(prod?.preco_venda) || 0
        return { id: f.id, nome: f.nome || '—', cat: f.categoria || prod?.grupo || '—', custo, precoAtual }
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [fichas, produtoById, costCtx, fichasByProduto, custoLoja])

  const categorias = useMemo(() => uniq(base.map((r) => r.cat)), [base])

  // linha enriquecida com as contas (atual + cenário)
  const rows = useMemo(() => {
    const dvD = parseFloat(dDv) || 0, dfD = parseFloat(dDf) || 0, mlD = parseFloat(dMl) || 0
    return base.map((r) => {
      const cmv = r.precoAtual > 0 ? (r.custo / r.precoAtual) * 100 : 0
      const mk = r.custo > 0 ? r.precoAtual / r.custo : 0
      const mg = r.precoAtual - r.custo
      const mgp = r.precoAtual > 0 ? (mg / r.precoAtual) * 100 : 0
      const novo = novoById[r.id] ?? r.precoAtual
      const ncmv = novo > 0 ? (r.custo / novo) * 100 : 0
      const nmk = r.custo > 0 ? novo / r.custo : 0
      const nmg = novo - r.custo
      const nmgp = novo > 0 ? (nmg / novo) * 100 : 0
      const tp = tradById[r.id] || { dv: dvD, df: dfD, ml: mlD }
      const soma = tp.dv + tp.df + tp.ml
      const tOk = soma < 100
      const tPreco = tOk ? r.custo / (1 - soma / 100) : 0
      const tMk = r.custo > 0 ? tPreco / r.custo : 0
      const tCmv = tPreco > 0 ? (r.custo / tPreco) * 100 : 0
      const tMgp = tPreco > 0 ? ((tPreco - r.custo) / tPreco) * 100 : 0
      const tLuc = tOk ? tPreco * tp.ml / 100 : 0
      return { ...r, cmv, mk, mg, mgp, novo, ncmv, nmk, nmg, nmgp, tp, soma, tOk, tPreco, tMk, tCmv, tMgp, tLuc }
    })
  }, [base, novoById, tradById, dDv, dDf, dMl])

  const vis = useMemo(() => {
    const qq = norm(q)
    return rows.filter((r) => {
      if (soPreco && !(r.precoAtual > 0)) return false
      if (qq && !norm(r.nome).includes(qq)) return false
      if (fCat && r.cat !== fCat) return false
      if (fCmv) { const c = tab === 'trad' ? r.tCmv : r.cmv; if (!r.precoAtual && tab === 'cmv') return false; if (cls(c) !== fCmv) return false }
      return true
    })
  }, [rows, q, fCat, fCmv, soPreco, tab])

  const setTrad = (id: string, k: 'dv' | 'df' | 'ml', v: number, row: (typeof rows)[number]) =>
    setTradById((p) => ({ ...p, [id]: { dv: row.tp.dv, df: row.tp.df, ml: row.tp.ml, [k]: v } }))

  const aplicarVisiveis = () => {
    const dv = parseFloat(dDv) || 0, df = parseFloat(dDf) || 0, ml = parseFloat(dMl) || 0
    setTradById((p) => { const n = { ...p }; vis.forEach((r) => { n[r.id] = { dv, df, ml } }); return n })
  }
  const sugerir = () => {
    const alvo = parseFloat(cmvAlvo) || 0; if (alvo <= 0) return
    setNovoById((p) => { const n = { ...p }; vis.forEach((r) => { if (r.custo > 0) n[r.id] = +(r.custo / (alvo / 100)).toFixed(2) }); return n })
  }
  const arredondar = () => setNovoById((p) => { const n = { ...p }; vis.forEach((r) => { n[r.id] = to90(r.novo) }); return n })

  const salvarMut = useMutation({
    mutationFn: async (changes: { id: string; preco: number }[]) => {
      for (const c of changes) { const { error } = await supabase.from('fichas_tecnicas').update({ preco_venda: c.preco }).eq('id', c.id); if (error) throw error }
      return changes.length
    },
    onSuccess: (n) => { qc.invalidateQueries({ queryKey: ['fichas'] }); setNovoById({}); setTradById({}); showToast(`${n} preço(s) salvos nas fichas.`) },
    onError: (e: Error) => { console.error('[Precificacao]', e); showToast('Erro ao salvar: ' + e.message, true) },
  })
  const salvar = () => {
    const alvo = tab === 'cmv'
      ? vis.filter((r) => r.novo > 0 && Math.abs(r.novo - r.precoAtual) > 0.001).map((r) => ({ id: r.id, preco: +r.novo.toFixed(2) }))
      : vis.filter((r) => r.tOk && r.tPreco > 0 && Math.abs(r.tPreco - r.precoAtual) > 0.001).map((r) => ({ id: r.id, preco: +r.tPreco.toFixed(2) }))
    if (!alvo.length) { showToast('Nenhum preço alterado pra salvar.'); return }
    if (!window.confirm(`Salvar ${alvo.length} novo(s) preço(s) de venda nas fichas? Isso altera o preço real (CMV, Engenharia etc.).`)) return
    salvarMut.mutate(alvo)
  }

  const alterados = tab === 'cmv'
    ? vis.filter((r) => r.novo > 0 && Math.abs(r.novo - r.precoAtual) > 0.001).length
    : vis.filter((r) => r.tOk && r.tPreco > 0 && Math.abs(r.tPreco - r.precoAtual) > 0.001).length

  return (
    <div className="prec-screen">
      {/* filtros comuns */}
      <div className="prec-card prec-bar">
        <div className="fld"><label>Buscar produto</label><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome do produto..." style={{ width: 200 }} /></div>
        <div className="fld"><label>Categoria</label><select value={fCat} onChange={(e) => setFCat(e.target.value)} style={{ width: 160 }}><option value="">Todas categorias</option>{categorias.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
        <div className="fld"><label>CMV</label><select value={fCmv} onChange={(e) => setFCmv(e.target.value)} style={{ width: 160 }}><option value="">Todos</option><option value="g">🟢 Bom (≤30%)</option><option value="a">🟡 Atenção (≤38%)</option><option value="r">🔴 Crítico (&gt;38%)</option></select></div>
        <label className="prec-check" title="Esconde produtos sem preço (ex.: rodízios que apontam pro RP)"><input type="checkbox" checked={soPreco} onChange={(e) => setSoPreco(e.target.checked)} /> Somente com preço de venda</label>
        <div className="prec-spacer" />
        <div className="prec-loja">Custo da loja: <b>{lojaNome}</b></div>
        <div className="prec-count">{vis.length} de {base.length} produtos</div>
      </div>

      <div className="prec-tabs">
        <button className={'prec-tab' + (tab === 'cmv' ? ' on' : '')} onClick={() => setTab('cmv')}>Por CMV (simulador)</button>
        <button className={'prec-tab' + (tab === 'trad' ? ' on' : '')} onClick={() => setTab('trad')}>Tradicional (markup)</button>
      </div>

      {/* sub-toolbar por aba */}
      <div className="prec-card prec-bar prec-sub">
        {tab === 'cmv' ? (
          <>
            <div className="fld"><label>CMV alvo %</label><input type="number" step="0.5" value={cmvAlvo} onChange={(e) => setCmvAlvo(e.target.value)} style={{ width: 84, textAlign: 'right' }} /></div>
            <button className="prec-btn ghost" onClick={sugerir}>Sugerir novo preço</button>
            <button className="prec-btn ghost" onClick={arredondar}>Arredondar p/ ,90</button>
          </>
        ) : (
          <>
            <div className="fld"><label>Canal</label><select value={canal} onChange={(e) => setCanal(e.target.value as 'salao' | 'ifood')} style={{ width: 150 }}><option value="salao">Salão / própria</option><option value="ifood">iFood</option></select></div>
            <div className="fld"><label>DV padrão %</label><input type="number" step="0.1" value={dDv} onChange={(e) => setDDv(e.target.value)} style={{ width: 84, textAlign: 'right' }} /></div>
            <div className="fld"><label>DF padrão %</label><input type="number" step="0.1" value={dDf} onChange={(e) => setDDf(e.target.value)} style={{ width: 84, textAlign: 'right' }} /></div>
            <div className="fld"><label>ML padrão %</label><input type="number" step="0.1" value={dMl} onChange={(e) => setDMl(e.target.value)} style={{ width: 84, textAlign: 'right' }} /></div>
            <button className="prec-btn ghost" onClick={aplicarVisiveis}>Aplicar aos visíveis</button>
          </>
        )}
        <div className="prec-spacer" />
        {canEdit && <button className="prec-btn pri" disabled={salvarMut.isPending || !alterados} onClick={salvar}>{salvarMut.isPending ? 'Salvando…' : `Salvar preços${alterados ? ' (' + alterados + ')' : ''}`}</button>}
      </div>

      <div className="prec-hint">
        {tab === 'cmv'
          ? <>Edite o <b>Novo preço</b> (coluna laranja) e veja o <b>CMV, markup e margem</b> novos. Margem % = (preço − custo) ÷ preço.</>
          : <><b>Preço = Custo ÷ [1 − (DV+DF+ML)]</b>. DV variáveis (canal+imposto) · DF fixas · ML lucro. “Aplicar aos visíveis” joga o padrão no grupo filtrado.</>}
      </div>

      <div className="prec-tblwrap">
        <div className="prec-scroll">
          {isLoading ? <div className="prec-empty">Carregando fichas…</div> : tab === 'cmv' ? (
            <table className="prec-tbl">
              <thead><tr>
                <th className="l">Produto</th><th className="l">Categoria</th>
                <th>Custo</th><th>Preço atual</th><th>CMV</th><th>Markup</th><th>Margem R$</th><th>Margem %</th>
                <th className="grp sepL">Novo preço</th><th className="grp">CMV novo</th><th className="grp">Markup</th><th className="grp">Margem R$</th><th className="grp">Margem %</th>
              </tr></thead>
              <tbody>
                {!vis.length ? <tr><td colSpan={13} className="prec-empty">Nenhum produto com esses filtros.</td></tr> : vis.map((r) => (
                  <tr key={r.id}>
                    <td className="l nm">{r.nome}</td>
                    <td className="l cat">{r.cat}</td>
                    <td className="num val">{n2(r.custo)}</td>
                    <td className="num val">{n2(r.precoAtual)}</td>
                    <td className={'num cmv ' + cls(r.cmv)}>{r.precoAtual > 0 ? pct(r.cmv) : '—'}</td>
                    <td className="num mk">{r.precoAtual > 0 ? r.mk.toFixed(2) + 'x' : '—'}</td>
                    <td className="num marg">{n2(r.mg)}</td>
                    <td className="num marg">{r.precoAtual > 0 ? pct(r.mgp) : '—'}</td>
                    <td className="sepL"><input className="cin hot num" type="number" step="0.10" value={r.novo} onChange={(e) => setNovoById((p) => ({ ...p, [r.id]: parseFloat(e.target.value) || 0 }))} /></td>
                    <td className={'num cmv ' + cls(r.ncmv)}>{r.novo > 0 ? pct(r.ncmv) : '—'}</td>
                    <td className="num mk">{r.novo > 0 ? r.nmk.toFixed(2) + 'x' : '—'}</td>
                    <td className="num marg">{n2(r.nmg)}</td>
                    <td className="num marg">{r.novo > 0 ? pct(r.nmgp) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="prec-tbl">
              <thead><tr>
                <th className="l">Produto</th><th className="l">Categoria</th><th>Custo</th>
                <th>DV %</th><th>DF %</th><th>ML %</th>
                <th className="grp sepL">Preço sugerido</th><th className="grp">Markup</th><th className="grp">CMV %</th><th className="grp">Margem %</th><th className="grp">Lucro R$</th>
              </tr></thead>
              <tbody>
                {!vis.length ? <tr><td colSpan={11} className="prec-empty">Nenhum produto com esses filtros.</td></tr> : vis.map((r) => (
                  <tr key={r.id} className={r.tOk ? '' : 'bad'}>
                    <td className="l nm">{r.nome}</td>
                    <td className="l cat">{r.cat}</td>
                    <td className="num val">{n2(r.custo)}</td>
                    <td><input className="cin hot num" type="number" step="0.1" value={r.tp.dv} onChange={(e) => setTrad(r.id, 'dv', parseFloat(e.target.value) || 0, r)} /></td>
                    <td><input className="cin hot num" type="number" step="0.1" value={r.tp.df} onChange={(e) => setTrad(r.id, 'df', parseFloat(e.target.value) || 0, r)} /></td>
                    <td><input className="cin hot num" type="number" step="0.1" value={r.tp.ml} onChange={(e) => setTrad(r.id, 'ml', parseFloat(e.target.value) || 0, r)} /></td>
                    <td className="num preco sepL">{r.tOk ? brl(r.tPreco) : '—'}</td>
                    <td className="num mk">{r.tOk ? r.tMk.toFixed(2) + 'x' : '—'}</td>
                    <td className={'num cmv ' + cls(r.tCmv)}>{r.tOk ? pct(r.tCmv) : '—'}</td>
                    <td className="num marg">{r.tOk ? pct(r.tMgp) : '—'}</td>
                    <td className="num marg">{r.tOk ? brl(r.tLuc) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="prec-legend">
        <span>CMV: <b style={{ color: '#16a34a' }}>≤30%</b> / <b style={{ color: '#f59e0b' }}>≤38%</b> / <b style={{ color: '#e11d48' }}>&gt;38%</b></span>
        <span>· Margem R$ = preço − custo · Markup = preço ÷ custo · Margem mínima alvo: {P.margMin}%</span>
        {tab === 'trad' && <span>· linha vermelha = DV+DF+ML ≥ 100% (impossível)</span>}
      </div>

      {toast && <div className={'prec-toast' + (toast.err ? ' err' : '')}>{toast.msg}</div>}
    </div>
  )
}
