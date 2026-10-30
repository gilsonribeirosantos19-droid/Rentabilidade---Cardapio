import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLoja } from '../lib/loja'
import { useAuth } from '../lib/auth'
import { supabase, fetchAll } from '../lib/db'
import { custoFichaPorcao } from '../lib/cost'
import { SearchSelect } from '../components/SearchSelect'
import { downloadCsv } from '../lib/csv'
import './faturamento.css'

// Curva ABC (PDV) — ranqueia os PRODUTOS por faturamento (V. Venda Líquida).
// Lê as vendas REAIS do iComanda (tabela icomanda_vendas, por competência/loja/produto).
// Botão "Puxar do iComanda" chama a Edge Function icomanda-sync p/ atualizar a competência.
// Agrega por produto e classifica: A = até 80% do valor, B = 80-95%, C = resto.
// Filtro "Incluir itens com valor zerado": no rodízio os itens entram com R$ 0 — por padrão ocultos.

type Prod = { id: string; lojaId: string; loja: string; item: string; codigo: string; grupo: string; qVenda: number; vBruta: number; vDesc: number; vCustoMedio: number }
type Row = Prod & { rank: number; vLiquida: number; pct: number; acum: number; classe: 'A' | 'B' | 'C'; margem: number | null; margemClasse: 'A' | 'B' | 'C' | '—' }
type FichaEng = { id: string; produto_id?: string; rendimento_porcoes?: number; itens_ficha?: { insumo_id?: string; produto_id?: string | null; quantidade_g?: number }[] }
type Mov = { insumo_id: string; quantidade?: number; custo_unitario?: number; loja_id?: string; criado_em?: string }

const m2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const q4 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
const p1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s\-/(])(\S)/g, (_m, p, c) => p + (c as string).toUpperCase())

type ColKey = 'rank' | 'loja' | 'item' | 'codigo' | 'grupo' | 'qVenda' | 'vLiquida' | 'pctPart' | 'pctAcum' | 'classe' | 'margem' | 'classeMargem'
type Fmt = 'q' | 'm' | 'p'
type Col = { key: ColKey; label: string; cls?: 'r' | 'c'; title?: boolean; def: boolean; fixed?: boolean; filt?: boolean; fmt?: Fmt; sum?: boolean }
const COLS: Col[] = [
  { key: 'rank', label: '#', cls: 'c', def: true, fixed: true },
  { key: 'loja', label: 'Fantasia', def: true, filt: true },
  { key: 'item', label: 'Descrição Item', title: true, def: true },
  { key: 'codigo', label: 'Item', def: true },
  { key: 'grupo', label: 'Grupo', title: true, def: true, filt: true },
  { key: 'qVenda', label: 'Q. Venda', cls: 'r', fmt: 'q', def: true, sum: true },
  { key: 'vLiquida', label: 'V. Venda Líquida', cls: 'r', fmt: 'm', def: true, sum: true },
  { key: 'pctPart', label: '% Participação', cls: 'r', fmt: 'p', def: true },
  { key: 'pctAcum', label: '% Acumulado', cls: 'r', fmt: 'p', def: true },
  { key: 'classe', label: 'Classe', cls: 'c', def: true, filt: true },
  { key: 'classeMargem', label: 'Classe (Margem)', cls: 'c', def: true, filt: true },
]

const COLS_KEY = 'aiko_abc_cols'
function loadCols(): Record<string, boolean> {
  try { const s = localStorage.getItem(COLS_KEY); if (s) { const o = JSON.parse(s); COLS.forEach((c) => { if (c.fixed) o[c.key] = true }); return o } } catch { /* ignore */ }
  const d: Record<string, boolean> = {}; COLS.forEach((c) => { d[c.key] = !!c.def }); return d
}

const mesInicio = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const mesFim = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toLocaleDateString('en-CA') }
const PERIODO_OPTS = ['Personalizado', 'Mês Atual', 'Mês Anterior']

// competências 'YYYY-MM' tocadas pelo intervalo de/ate (os dados do iComanda são por MÊS)
function compsBetween(de: string, ate: string): string[] {
  if (!de || !ate) return []
  const [y1, m1] = de.slice(0, 7).split('-').map(Number)
  const [y2, m2] = ate.slice(0, 7).split('-').map(Number)
  const out: string[] = []
  let y = y1, m = m1
  while ((y < y2 || (y === y2 && m <= m2)) && out.length < 24) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++ } }
  return out
}

export function CurvaAbcVendas() {
  const { lojas } = useLoja()
  const { tenantId } = useAuth()
  const [de, setDe] = useState(mesInicio())
  const [ate, setAte] = useState(mesFim())
  const [periodoSel, setPeriodoSel] = useState('Mês Atual')
  const [busca, setBusca] = useState('')
  const [incluirZerado, setIncluirZerado] = useState(false)
  const [lojaSet, setLojaSet] = useState<Set<string>>(new Set())
  const [lojaOpen, setLojaOpen] = useState(false)
  const initRef = useRef(false)
  useEffect(() => { if (!initRef.current && lojas.length) { initRef.current = true; setLojaSet(new Set(lojas.map((l) => l.id))) } }, [lojas])
  const allSel = lojas.length > 0 && lojaSet.size === lojas.length
  const lojaLabel = allSel ? 'Todas as lojas' : lojaSet.size === 0 ? 'Nenhuma' : lojaSet.size === 1 ? (lojas.find((l) => lojaSet.has(l.id))?.nome || '1 loja') : `${lojaSet.size} lojas`
  const toggleLoja = (id: string) => setLojaSet((p) => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s })
  const toggleTodas = () => setLojaSet(allSel ? new Set() : new Set(lojas.map((l) => l.id)))

  // --- dados REAIS do iComanda (icomanda_vendas) ---
  const [rows, setRows] = useState<Prod[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')
  const [bloqueados, setBloqueados] = useState<string[]>([])
  const lojaNome = useMemo(() => { const m: Record<string, string> = {}; lojas.forEach((l) => { m[l.id] = l.nome }); return m }, [lojas])
  // agrega as linhas (por loja+produto) somando qtd/faturado dos meses do intervalo
  const buildRows = (data: Record<string, unknown>[]): Prod[] => {
    const map = new Map<string, Prod>()
    for (const r of data) {
      const key = `${r.loja_id}|${r.produto_id}`
      const ex = map.get(key)
      if (ex) { ex.qVenda += Number(r.qtd) || 0; ex.vBruta += Number(r.faturado) || 0 }
      else map.set(key, { id: key, lojaId: String(r.loja_id ?? ''), loja: lojaNome[r.loja_id as string] || '—', item: String(r.produto_nome || ''), codigo: String(r.produto_id ?? ''), grupo: String(r.grupo || ''), qVenda: Number(r.qtd) || 0, vBruta: Number(r.faturado) || 0, vDesc: 0, vCustoMedio: 0 })
    }
    return [...map.values()]
  }
  // busca produtos (icomanda_vendas) + PORTÃO (icomanda_recebimento). Regra: uma loja×mês só entra
  // se estiver RECEBIDA e SEM nenhum dia com erro no portão (erro não entra). fetchAll vence o teto de 1000.
  async function fetchVendas(comps: string[]): Promise<Prod[]> {
    const gateDe = comps[0] + '-01'
    const [ly, lm] = comps[comps.length - 1].split('-').map(Number)
    const gateAte = new Date(ly, lm, 0).toLocaleDateString('en-CA')
    // vendas por DIA (camada genérica vendas_produto_dia: iComanda + Saipos) — agregadas no buildRows por loja×produto
    const [vendas, gate] = await Promise.all([
      fetchAll<Record<string, unknown>>((f, t) => supabase.from('vendas_produto_dia').select('loja_id,produto_id,produto_nome,grupo,qtd,faturado,data').eq('tenant_id', tenantId).gte('data', gateDe).lte('data', gateAte).order('loja_id').order('data').order('produto_id').range(f, t)),
      fetchAll<Record<string, unknown>>((f, t) => supabase.from('recebimento_vendas').select('loja_id,data,status').eq('tenant_id', tenantId).gte('data', gateDe).lte('data', gateAte).order('loja_id').order('data').range(f, t)),
    ])
    // PORTÃO por loja×DIA: só entra a venda de (loja, dia) cujo recebimento está 'processado'.
    // (Antes era por loja×mês — 1 dia bom liberava o mês inteiro, deixando entrar dias com erro
    //  → não batia com o Faturamento, que é dia a dia. Agora casa exatamente com o Faturamento.)
    const okDia = new Set<string>()
    for (const r of gate) if (r.status === 'processado') okDia.add(`${r.loja_id}|${r.data}`)
    const bloq = new Set<string>()
    const okVendas = vendas.filter((r) => {
      if (okDia.has(`${r.loja_id}|${r.data}`)) return true
      bloq.add(`${lojaNome[String(r.loja_id)] || r.loja_id} · ${String(r.data).slice(0, 7)}`)
      return false
    })
    setBloqueados([...bloq])
    return buildRows(okVendas)
  }
  async function carregar(comps: string[]) {
    try { setRows(await fetchVendas(comps)) }
    catch (e) { setMsg('Erro ao carregar vendas: ' + (e as Error).message); setRows([]) }
  }
  useEffect(() => {
    if (!tenantId) { setRows([]); return }
    const comps = compsBetween(de, ate)
    if (!comps.length) { setRows([]); return }
    let alive = true
    setLoading(true)
    fetchVendas(comps)
      .then((r) => { if (alive) setRows(r) })
      .catch((e) => { if (alive) { setMsg('Erro ao carregar vendas: ' + (e as Error).message); setRows([]) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, de, ate, lojaNome])
  async function puxar() {
    if (!tenantId || syncing) return
    const comps = compsBetween(de, ate)
    if (!comps.length) { setMsg('Selecione um período.'); return }
    const gateDe = comps[0] + '-01'
    const [ly, lm] = comps[comps.length - 1].split('-').map(Number)
    const gateAte = new Date(ly, lm, 0).toLocaleDateString('en-CA')
    setSyncing(true); setMsg('Puxando do iComanda… (portão + produtos, pode levar ~1 min)')
    try {
      // 1) portão diário (define o que fica liberado)
      const d1 = await supabase.functions.invoke('icomanda-sync', { body: { tenant_id: tenantId, data_ini: gateDe, data_fim: gateAte } })
      if (d1.error) throw d1.error
      if (d1.data?.status !== 'ok') throw new Error(d1.data?.mensagem || 'erro no portão')
      // 2) produtos do(s) mês(es)
      let prods = 0
      for (const competencia of comps) {
        const { data, error } = await supabase.functions.invoke('icomanda-sync', { body: { tenant_id: tenantId, competencia } })
        if (error) throw error
        if (data?.status !== 'ok') throw new Error(data?.mensagem || 'erro nos produtos')
        prods += data.produtos_gravados
      }
      setMsg(`✓ ${d1.data.processados} dias processados · ${prods} produtos.`)
      await carregar(comps)
    } catch (e) {
      setMsg('Erro ao puxar: ' + (e as Error).message)
    } finally { setSyncing(false) }
  }

  const [cols, setCols] = useState(loadCols)
  const [ddPos, setDdPos] = useState({ top: 0, left: 0 })
  const [colsOpen, setColsOpen] = useState(false)
  const toggleCol = (k: ColKey) => setCols((c) => ({ ...c, [k]: !c[k] }))
  const salvarCols = () => { try { localStorage.setItem(COLS_KEY, JSON.stringify(cols)) } catch { /* ignore */ } setColsOpen(false) }
  const visCols = COLS.filter((c) => cols[c.key])

  const [colFilters, setColFilters] = useState<Record<string, Set<string>>>({})
  const [filtCol, setFiltCol] = useState<ColKey | null>(null)
  const openDd = (e: MouseEvent, which: 'cols' | ColKey) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setDdPos({ top: Math.max(8, Math.min(r.bottom + 4, window.innerHeight - 350)), left: Math.max(8, Math.min(r.left, window.innerWidth - 240)) })
    if (which === 'cols') { setFiltCol(null); setColsOpen((o) => !o) }
    else { setColsOpen(false); setFiltCol((c) => c === which ? null : which) }
  }

  const setPeriodo = (label: string) => {
    const lb = label || 'Personalizado'; setPeriodoSel(lb); const d = new Date()
    if (lb === 'Mês Atual') { setDe(mesInicio()); setAte(mesFim()) }
    else if (lb === 'Mês Anterior') { const p = new Date(d.getFullYear(), d.getMonth() - 1, 1); const l = new Date(d.getFullYear(), d.getMonth(), 0); setDe(`${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-01`); setAte(l.toLocaleDateString('en-CA')) }
    else { setDe(''); setAte('') }
  }

  // ── custo da ficha por produto (de-para código PDV → produto → ficha), POR LOJA — mesmas queries/chaves da Engenharia (compartilha cache) ──
  const { data: engProdutos = [] } = useQuery({ queryKey: ['eng-prod', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<{ id: string; codigo_pdv?: string }>((f, t) => supabase.from('produtos').select('id,codigo_pdv').eq('tenant_id', tenantId).order('id').range(f, t)) })
  const { data: engFichas = [] } = useQuery({ queryKey: ['eng-fichas', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<FichaEng>((f, t) => supabase.from('fichas_tecnicas').select('id,produto_id,rendimento_porcoes,itens_ficha(insumo_id,produto_id,quantidade_g)').eq('tenant_id', tenantId).order('id').range(f, t)) })
  const { data: engInsumos = [] } = useQuery({ queryKey: ['eng-ins', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<{ id: string; preco_compra?: number; rendimento_pct?: number; unidade_medida?: string; unidade_compra?: string }>((f, t) => supabase.from('insumos').select('id,preco_compra,rendimento_pct,unidade_medida,unidade_compra').eq('tenant_id', tenantId).order('id').range(f, t)) })
  const { data: engSaldos = [] } = useQuery({ queryKey: ['eng-sld', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<{ insumo_id: string; custo_medio?: number; loja_id?: string }>((f, t) => supabase.from('saldo_estoque').select('insumo_id,custo_medio,loja_id').eq('tenant_id', tenantId).order('id').range(f, t)) })
  const { data: engEntradas = [] } = useQuery({ queryKey: ['eng-ent', tenantId, ate], enabled: !!tenantId && !!ate, queryFn: () => fetchAll<Mov>((f, t) => supabase.from('entradas_estoque').select('insumo_id,quantidade,custo_unitario,loja_id,criado_em').eq('tenant_id', tenantId).lte('criado_em', ate + 'T23:59:59').order('criado_em').order('id').range(f, t)) })
  const { data: engSaidas = [] } = useQuery({ queryKey: ['eng-sai', tenantId, ate], enabled: !!tenantId && !!ate, queryFn: () => fetchAll<Mov>((f, t) => supabase.from('saidas_estoque').select('insumo_id,quantidade,loja_id,criado_em').eq('tenant_id', tenantId).lte('criado_em', ate + 'T23:59:59').order('criado_em').order('id').range(f, t)) })
  const prodByCod = useMemo(() => { const m = new Map<string, string>(); engProdutos.forEach((p) => { const c = (p.codigo_pdv || '').trim(); if (c) m.set(c, p.id) }); return m }, [engProdutos])
  const fichaByProduto = useMemo(() => { const m = new Map<string, FichaEng>(); engFichas.forEach((f) => { if (f.produto_id) m.set(f.produto_id, f) }); return m }, [engFichas])
  const fichasCostMap = useMemo(() => { const m = new Map<string, { itens: { insumo_id?: string; produto_id?: string | null; quantidade_g?: number }[]; rendimento_porcoes?: number }>(); engFichas.forEach((f) => { if (f.produto_id) m.set(f.produto_id, { itens: f.itens_ficha || [], rendimento_porcoes: f.rendimento_porcoes || 1 }) }); return m }, [engFichas])
  const engEntByLoja = useMemo(() => { const m: Record<string, Mov[]> = {}; engEntradas.forEach((e) => { const k = e.loja_id || ''; (m[k] = m[k] || []).push(e) }); return m }, [engEntradas])
  const engSaiByLoja = useMemo(() => { const m: Record<string, Mov[]> = {}; engSaidas.forEach((s) => { const k = s.loja_id || ''; (m[k] = m[k] || []).push(s) }); return m }, [engSaidas])
  // custo unitário da ficha por loja, reconstruído na data final do período → cache por (loja, produto)
  const rowsComCusto = useMemo(() => {
    const cache = new Map<string, number>()
    return rows.map((v) => {
      const pid = prodByCod.get(String(v.codigo).trim())
      const ficha = pid ? fichaByProduto.get(pid) : undefined
      if (!ficha || !(ficha.itens_ficha || []).length) return v
      const key = (v.lojaId || '') + '|' + pid
      let custoUnit = cache.get(key)
      if (custoUnit == null) {
        const ctxL = { entradas: engEntByLoja[v.lojaId || ''] || [], saidas: engSaiByLoja[v.lojaId || ''] || [], insumos: engInsumos, saldos: engSaldos, dataLimite: ate, strictLoja: true }
        custoUnit = custoFichaPorcao(ficha.itens_ficha || [], ficha.rendimento_porcoes || 1, v.lojaId || null, ctxL, fichasCostMap, new Set())
        cache.set(key, custoUnit)
      }
      return custoUnit > 0 ? { ...v, vCustoMedio: custoUnit } : v
    })
  }, [rows, prodByCod, fichaByProduto, fichasCostMap, engEntByLoja, engSaiByLoja, engInsumos, engSaldos, ate])

  // 1) filtra; 2) ordena V.Líquida desc; 3) ABC por FATURAMENTO + ABC por MARGEM (contribuição)
  const enriched = useMemo(() => {
    const q = norm(busca.trim())
    const filtraLoja = lojaSet.size > 0 && !allSel
    const base = rowsComCusto.map((v) => ({ ...v, vLiquida: v.vBruta - v.vDesc })).filter((v) => {
      if (!incluirZerado && v.vLiquida === 0) return false
      if (filtraLoja && !lojaSet.has(v.lojaId)) return false
      if (q && !norm([v.item, v.grupo, v.codigo].join(' ')).includes(q)) return false
      return true
    }).sort((a, b) => b.vLiquida - a.vLiquida)
    // margem por item: só quando tem custo da ficha (senão null = "—")
    const withM = base.map((v) => ({ ...v, margem: v.vCustoMedio > 0 ? v.vLiquida - v.vCustoMedio * v.qVenda : (null as number | null) }))
    // ABC por MARGEM: ranqueia (desc) só os itens com margem conhecida, acumulado 80/95
    const comM = withM.filter((v) => v.margem != null).slice().sort((a, b) => (b.margem as number) - (a.margem as number))
    const totM = comM.reduce((s, v) => s + (v.margem as number), 0) || 1
    let acM = 0
    const mClasse = new Map<string, 'A' | 'B' | 'C'>()
    comM.forEach((v) => { acM += (v.margem as number) / totM * 100; mClasse.set(v.id, acM <= 80 ? 'A' : acM <= 95 ? 'B' : 'C') })
    // ABC por FATURAMENTO (ordem de exibição) + anexa a classe de margem
    const total = base.reduce((s, v) => s + v.vLiquida, 0) || 1
    let acum = 0
    return withM.map((v, i) => { const pct = v.vLiquida / total * 100; acum += pct; const classe = acum <= 80 ? 'A' : acum <= 95 ? 'B' : 'C'; return { ...v, rank: i + 1, pct, acum, classe, margemClasse: mClasse.get(v.id) || '—' } as Row })
  }, [rowsComCusto, busca, lojaSet, allSel, incluirZerado])

  const cellVal = (v: Row, c: Col): string => {
    switch (c.key) {
      case 'rank': return String(v.rank)
      case 'loja': return v.loja
      case 'item': return titleCase(v.item)
      case 'codigo': return v.codigo
      case 'grupo': return titleCase(v.grupo)
      case 'qVenda': return q4(v.qVenda)
      case 'vLiquida': return m2(v.vLiquida)
      case 'pctPart': return p1(v.pct)
      case 'pctAcum': return p1(v.acum)
      case 'classe': return v.classe
      case 'margem': return v.margem == null ? '—' : m2(v.margem)
      case 'classeMargem': return v.margemClasse
      default: return ''
    }
  }
  const num = (v: Row, k: ColKey): number => k === 'qVenda' ? v.qVenda : k === 'vLiquida' ? v.vLiquida : k === 'margem' ? (v.margem ?? 0) : 0

  const lista = useMemo(() => enriched.filter((v) => Object.entries(colFilters).every(([k, set]) => set.has(cellVal(v, COLS.find((c) => c.key === k)!)))), [enriched, colFilters])

  const distinct = (k: ColKey) => { const c = COLS.find((x) => x.key === k)!; return [...new Set(enriched.map((v) => cellVal(v, c)))].sort() }
  const toggleFiltVal = (k: ColKey, val: string, all: string[]) => setColFilters((prev) => { const cur = new Set(prev[k] ?? all); cur.has(val) ? cur.delete(val) : cur.add(val); const next = { ...prev }; if (cur.size === all.length) delete next[k]; else next[k] = cur; return next })
  const toggleFiltTodos = (k: ColKey, all: string[]) => setColFilters((prev) => { const cur = prev[k] ?? new Set(all); const next = { ...prev }; if (cur.size === all.length) next[k] = new Set(); else delete next[k]; return next })

  const tot = useMemo(() => { const t: Record<string, number> = {}; COLS.filter((c) => c.sum).forEach((c) => { t[c.key] = lista.reduce((a, v) => a + num(v, c.key), 0) }); return t }, [lista])
  const nA = lista.filter((r) => r.classe === 'A').length, nB = lista.filter((r) => r.classe === 'B').length, nC = lista.filter((r) => r.classe === 'C').length

  const exportCSV = () => {
    if (!lista.length) { setMsg('Nada para exportar.'); return }
    const head = ['#', 'Fantasia', 'Descrição Item', 'Item', 'Grupo', 'Q. Venda', 'V. Venda Líquida', '% Participação', '% Acumulado', 'Classe', 'Classe (Margem)']
    const linhas = lista.map((v) => [v.rank, v.loja, titleCase(v.item), v.codigo, titleCase(v.grupo), +v.qVenda.toFixed(4), +v.vLiquida.toFixed(2), +v.pct.toFixed(1), +v.acum.toFixed(1), v.classe, v.margemClasse])
    downloadCsv(`curva_abc_${de}_${ate}.csv`, [head, ...linhas])
  }

  return (
    <div className="fatv-screen">
      <div className="ds-filterbar">
        <div className="ds-field"><label>Loja</label>
          <div className="ms">
            <button className="ms-btn" onClick={() => setLojaOpen((o) => !o)}>{lojaLabel}<span style={{ color: '#94a3b8' }}>▾</span></button>
            {lojaOpen && <>
              <div className="ms-back" onClick={() => setLojaOpen(false)} />
              <div className="ms-pop">
                <label className="ms-opt"><input type="checkbox" checked={allSel} onChange={toggleTodas} /><b>Todas as lojas</b></label>
                <div className="ms-sep" />
                {lojas.map((l) => <label key={l.id} className="ms-opt"><input type="checkbox" checked={lojaSet.has(l.id)} onChange={() => toggleLoja(l.id)} />{l.nome}</label>)}
              </div>
            </>}
          </div>
        </div>
        <div className="ds-field" style={{ minWidth: 130 }}><label>Período</label>
          <SearchSelect value={periodoSel} options={PERIODO_OPTS} placeholder="Período" onChange={setPeriodo} />
        </div>
        <div className="ds-field"><label>De</label><input type="date" className="field" value={de} onChange={(e) => { setDe(e.target.value); setPeriodoSel('Personalizado') }} /></div>
        <div className="ds-field"><label>até</label><input type="date" className="field" value={ate} onChange={(e) => { setAte(e.target.value); setPeriodoSel('Personalizado') }} /></div>
        <div className="ds-field"><label>&nbsp;</label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, fontSize: 13, color: '#334155', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={incluirZerado} onChange={(e) => setIncluirZerado(e.target.checked)} style={{ width: 15, height: 15, accentColor: '#f97316' }} />
            Incluir itens com valor zerado
          </label>
        </div>
        <div className="ds-actions">
          <button className="btn-ghost" onClick={puxar} disabled={syncing || !tenantId}>{syncing ? '⏳ Puxando…' : '↻ Puxar do iComanda'}</button>
          <button className="btn-ghost" onClick={exportCSV}>↓ Exportar</button>
        </div>
      </div>

      <div className="search-row">
        <input className="search" placeholder="Digite um texto para pesquisar..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        {msg
          ? <span className="mock-tag" style={{ background: msg.startsWith('Erro') ? '#fee2e2' : '#dcfce7', color: msg.startsWith('Erro') ? '#b91c1c' : '#166534', borderColor: 'transparent' }}>{msg}</span>
          : loading ? <span className="mock-tag">Carregando vendas…</span>
          : <span className="mock-tag" style={{ background: '#eef2ff', color: '#3730a3', borderColor: 'transparent' }}>● Vendas reais — só meses Processados na Recebimento de Vendas</span>}
        {bloqueados.length > 0 && <span className="mock-tag" style={{ background: '#fef2f2', color: '#b91c1c', borderColor: 'transparent' }} title={bloqueados.join(', ')}>⛔ {bloqueados.length} loja×mês ainda não recebido(s) no portão — puxe na Recebimento de Vendas</span>}
      </div>

      <div className="grid-wrap">
        <table>
          <thead>
            <tr>
              {visCols.map((c, i) => (
                <th key={c.key} className={c.cls}>
                  <span className="th-in">
                    {c.label}
                    {c.filt && <svg className={'hd-ico' + (colFilters[c.key] ? ' on' : '')} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} onClick={(e) => { e.stopPropagation(); openDd(e, c.key) }}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>}
                    {i === 0 && <svg className="hd-ico" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} onClick={(e) => { e.stopPropagation(); openDd(e, 'cols') }}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!lista.length
              ? <tr><td colSpan={visCols.length} className="empty">Nenhum produto no filtro.</td></tr>
              : <>
                {lista.map((v) => <tr key={v.id}>{visCols.map((c) => <td key={c.key} className={c.cls}>{c.key === 'classe' ? <span className={'badge b-' + v.classe}>{v.classe}</span> : c.key === 'classeMargem' ? (v.margemClasse === '—' ? '—' : <span className={'badge b-' + v.margemClasse}>{v.margemClasse}</span>) : cellVal(v, c)}</td>)}</tr>)}
                <tr className="fill" aria-hidden="true"><td colSpan={visCols.length} /></tr>
              </>}
          </tbody>
          {lista.length > 0 && <tfoot>
            <tr>{visCols.map((c, i) => <td key={c.key} className={c.cls}>{c.sum ? (c.fmt === 'm' ? m2(tot[c.key] || 0) : q4(tot[c.key] || 0)) : (i === 0 ? `${lista.length} itens` : '')}</td>)}</tr>
          </tfoot>}
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '8px 2px', flexWrap: 'wrap', fontSize: 11, color: '#64748b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#e11d48', display: 'inline-block' }} />A — até 80% do faturamento <b style={{ color: '#0f172a' }}>({nA})</b></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f97316', display: 'inline-block' }} />B — de 80% a 95% <b style={{ color: '#0f172a' }}>({nB})</b></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#94a3b8', display: 'inline-block' }} />C — acima de 95% <b style={{ color: '#0f172a' }}>({nC})</b></div>
        <div style={{ borderLeft: '1px solid #e5e9f0', paddingLeft: 20 }}><b style={{ color: '#0f172a' }}>Classe (Margem)</b> = ABC pela contribuição (margem R$). Itens sem ficha ficam <b style={{ color: '#0f172a' }}>“—”</b> (sem custo).</div>
      </div>

      {colsOpen && <>
        <div className="fatv-back" onClick={() => setColsOpen(false)} />
        <div className="fatv-dd" style={{ top: ddPos.top, left: ddPos.left }}>
          <div className="tit">Colunas visíveis</div>
          {COLS.filter((c) => !c.fixed).map((c) => <label key={c.key}><input type="checkbox" checked={!!cols[c.key]} onChange={() => toggleCol(c.key)} />{c.label}</label>)}
          <button className="save" onClick={salvarCols}>Salvar preferência</button>
        </div>
      </>}

      {filtCol && (() => {
        const all = distinct(filtCol); const cur = colFilters[filtCol]; const todos = !cur || cur.size === all.length
        return <>
          <div className="fatv-back" onClick={() => setFiltCol(null)} />
          <div className="fatv-dd" style={{ top: ddPos.top, left: ddPos.left }}>
            <div className="tit">Filtrar: {COLS.find((c) => c.key === filtCol)?.label}</div>
            <label><input type="checkbox" checked={todos} onChange={() => toggleFiltTodos(filtCol, all)} /><b>(Todos)</b></label>
            <div className="ms-sep" />
            {all.map((val) => <label key={val}><input type="checkbox" checked={!cur || cur.has(val)} onChange={() => toggleFiltVal(filtCol, val, all)} />{val || '(vazio)'}</label>)}
          </div>
        </>
      })()}
    </div>
  )
}
