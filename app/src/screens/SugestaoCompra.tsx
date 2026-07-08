import { useMemo, useState } from 'react'
import type { ChartConfiguration } from 'chart.js'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import { ChartBox } from '../components/ChartBox'
import { SearchSelect } from '../components/SearchSelect'
import { downloadCsv } from '../lib/csv'
import './sugestao.css'

// dropdowns com busca da toolbar (rótulo ↔ valor)
const PA_OPTS = ['Últimos 30 dias', 'Últimos 60 dias', 'Últimos 90 dias']
const PA_LBL: Record<number, string> = { 30: 'Últimos 30 dias', 60: 'Últimos 60 dias', 90: 'Últimos 90 dias' }
const PA_VAL: Record<string, number> = { 'Últimos 30 dias': 30, 'Últimos 60 dias': 60, 'Últimos 90 dias': 90 }
const CB_OPTS = ['7 dias', '15 dias', '30 dias']
const CB_LBL: Record<number, string> = { 7: '7 dias', 15: '15 dias', 30: '30 dias' }
const CB_VAL: Record<string, number> = { '7 dias': 7, '15 dias': 15, '30 dias': 30 }

// Sugestão de Compra (Compras) — responde "o que precisamos comprar?".
// DADOS REAIS: estoque/mínimo/custo (saldo_estoque), consumo (saidas_estoque),
// pedido aberto/em trânsito (pedidos_compra + itens_pedido). Sugestão calculada.
// A Tela 2 (Pedido) gera PDFs por fornecedor/loja (autocontida — não grava em pedidos_compra); gráficos do drawer são reais.

type Insumo = { id: string; nome?: string; categoria?: string; codigo_interno?: number; preco_compra?: number; unidade_medida?: string; unidade_compra?: string; minimo?: number }
type Saldo = { insumo_id: string; quantidade?: number; custo_medio?: number; minimo?: number | null; loja_id?: string }
type Saida = { insumo_id: string; quantidade?: number; loja_id?: string; criado_em?: string }
type Pedido = { id: string; status?: string; loja_id?: string }
type ItemPed = { pedido_id: string; insumo_id: string; quantidade?: number }
type Row = { insumoId: string; cod: string; desc: string; grp: string; un: string; est: number; min: number; cons: number; ab: number; tr: number; custo: number; sug: number }

const brl = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const q2 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const parseNum = (v: string) => parseFloat((v || '0').replace(/\./g, '').replace(',', '.')) || 0
const fmtCod = (c?: number) => (c != null ? String(c).padStart(6, '0') : '—')
const un = (i?: Insumo) => i?.unidade_medida || i?.unidade_compra || 'un'
const norm = (s?: string) => (s || '').toLowerCase().trim()
// Status de pedidos_compra (vocabulário real): solicitado, pendente, enviado,
// baixado, cancelado, aguardando_aprovacao, aprovado, processado.
// "baixado" = já recebido; "processado" = solicitação já virou pedido firme → NÃO conta como aberto.
const RECEBIDO = ['recebido', 'recebida', 'baixado', 'concluido', 'concluida', 'finalizado', 'finalizada', 'cancelado', 'cancelada', 'processado']
const TRANSITO = ['em_transito', 'em transito', 'transito', 'enviado', 'enviada', 'trânsito']
const addNest = (m: Record<string, Record<string, number>>, a: string, b: string, v: number) => { (m[a] ||= {})[b] = (m[a][b] || 0) + v }
const enderecoLoja = (l: Record<string, unknown>) => (l.endereco as string) || [l.logradouro, l.numero, l.bairro, l.cidade, l.uf, l.cep].filter(Boolean).join(', ') || '—'
type PedItem = { insumoId: string; cod: string; desc: string; grp: string; un: string; custo: number; qtd: number; porLoja: { lojaId: string; qty: number }[] }

const baseChart = (): ChartConfiguration['options'] => ({
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: { x: { grid: { display: false }, ticks: { font: { size: 9 } } }, y: { grid: { color: '#eef2f7' }, ticks: { font: { size: 9 } } } },
})

export function SugestaoCompra() {
  const { tenantId } = useAuth()
  const { lojas } = useLoja()
  const [view, setView] = useState<'sugestao' | 'pedido'>('sugestao')
  const [lojaFil, setLojaFil] = useState('')
  const [periodoDias, setPeriodoDias] = useState(30)
  const [coberturaDias, setCoberturaDias] = useState(7)
  const [cat, setCat] = useState('')
  const [busca, setBusca] = useState('')
  const [ideal, setIdeal] = useState<Record<string, string>>({})
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [drawer, setDrawer] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const showToast = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2600) }

  const desdeISO = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - periodoDias); return d.toISOString() }, [periodoDias])

  // fetchAll (paginação por range) — evita o cap silencioso de 1000 linhas do Supabase
  // select('*') de propósito: pedir uma coluna inexistente (ex.: `minimo`, que fica no saldo_estoque)
  // ZERA a query silenciosamente e esvazia a tela. Ver project_portal_select_star.
  const { data: insumos = [] } = useQuery({ queryKey: ['sug-ins', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('*').eq('tenant_id', tenantId).eq('ativo', true).order('nome').range(f, t)) })
  const { data: saldos = [] } = useQuery({ queryKey: ['sug-saldos', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Saldo>((f, t) => supabase.from('saldo_estoque').select('*').eq('tenant_id', tenantId).order('insumo_id').range(f, t)) })
  const { data: saidas = [] } = useQuery({ queryKey: ['sug-saidas', tenantId, desdeISO], enabled: !!tenantId, queryFn: () => fetchAll<Saida>((f, t) => supabase.from('saidas_estoque').select('insumo_id,quantidade,loja_id,criado_em').eq('tenant_id', tenantId).gte('criado_em', desdeISO).order('criado_em').range(f, t)) })
  // pedidos + seus itens: itens_pedido não tem tenant_id — busca pelos IDs dos pedidos do tenant
  const { data: ped = { pedidos: [] as Pedido[], itens: [] as ItemPed[] } } = useQuery({
    queryKey: ['sug-ped', tenantId], enabled: !!tenantId,
    queryFn: async () => {
      const ps = await fetchAll<Pedido>((f, t) => supabase.from('pedidos_compra').select('id,status,loja_id').eq('tenant_id', tenantId).order('id').range(f, t))
      if (!ps.length) return { pedidos: ps, itens: [] as ItemPed[] }
      const it = await fetchAll<ItemPed>((f, t) => supabase.from('itens_pedido').select('pedido_id,insumo_id,quantidade').in('pedido_id', ps.map((p) => p.id)).order('pedido_id').range(f, t))
      return { pedidos: ps, itens: it }
    },
  })

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])

  // Fase 1.5 — integração com o CD (só liga se o tenant tiver um Centro de Distribuição).
  // Aditivo: coluna "No CD" + botão "Requisitar do CD". Sem CD, a tela fica idêntica.
  const { data: cdLojaId = '' } = useQuery({ queryKey: ['sug-cd', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('lojas').select('id').eq('tenant_id', tenantId).eq('is_cd', true).limit(1); return (data?.[0]?.id as string) || '' } })
  const temCd = !!cdLojaId
  const cdSaldoMap = useMemo(() => { const m: Record<string, number> = {}; if (cdLojaId) saldos.forEach((s) => { if (s.loja_id === cdLojaId) m[s.insumo_id] = (m[s.insumo_id] || 0) + (Number(s.quantidade) || 0) }); return m }, [saldos, cdLojaId])

  // agregações por insumo (respeitando o filtro de loja)
  const est = useMemo(() => { const m: Record<string, number> = {}; saldos.forEach((s) => { if (lojaFil && s.loja_id !== lojaFil) return; m[s.insumo_id] = (m[s.insumo_id] || 0) + (Number(s.quantidade) || 0) }); return m }, [saldos, lojaFil])
  // mínimo por loja (saldo_estoque.minimo); se vazio, cai no mínimo global do insumo (insumos.minimo)
  const min = useMemo(() => { const m: Record<string, number> = {}; saldos.forEach((s) => { if (lojaFil && s.loja_id !== lojaFil) return; m[s.insumo_id] = (m[s.insumo_id] || 0) + (Number(s.minimo) || 0) }); insumos.forEach((i) => { if (!m[i.id] && Number(i.minimo) > 0) m[i.id] = Number(i.minimo) }); return m }, [saldos, lojaFil, insumos])
  // custo médio PONDERADO pela quantidade (respeita filtro de loja); se qtd 0, cai no maior custo conhecido
  const cmMap = useMemo(() => { const num: Record<string, number> = {}, den: Record<string, number> = {}, mx: Record<string, number> = {}; saldos.forEach((s) => { if (lojaFil && s.loja_id !== lojaFil) return; const q = Math.max(Number(s.quantidade) || 0, 0), c = Number(s.custo_medio) || 0; if (c > 0) { num[s.insumo_id] = (num[s.insumo_id] || 0) + c * q; den[s.insumo_id] = (den[s.insumo_id] || 0) + q; if (c > (mx[s.insumo_id] || 0)) mx[s.insumo_id] = c } }); const m: Record<string, number> = {}; for (const k in mx) m[k] = den[k] > 0 ? num[k] / den[k] : mx[k]; return m }, [saldos, lojaFil])
  // consumo médio diário = total de saídas ÷ dias REALMENTE cobertos (1ª saída → hoje, no máx. o período).
  // Assim, insumo/loja com pouco histórico não fica subestimado (não divide por período cheio).
  const consMap = useMemo(() => {
    const soma: Record<string, number> = {}, primeira: Record<string, string> = {}
    saidas.forEach((s) => {
      if (lojaFil && s.loja_id !== lojaFil) return
      soma[s.insumo_id] = (soma[s.insumo_id] || 0) + (Number(s.quantidade) || 0)
      const d = s.criado_em || ''
      if (d && (!primeira[s.insumo_id] || d < primeira[s.insumo_id])) primeira[s.insumo_id] = d
    })
    const agora = Date.now(), out: Record<string, number> = {}
    for (const k in soma) {
      const p = primeira[k]
      const cobertos = p ? Math.floor((agora - new Date(p).getTime()) / 864e5) + 1 : periodoDias
      const dias = Math.min(periodoDias, Math.max(1, cobertos))
      out[k] = soma[k] / dias
    }
    return out
  }, [saidas, lojaFil, periodoDias])
  const pedMap = useMemo(() => {
    const pById = Object.fromEntries(ped.pedidos.map((p) => [p.id, p])) as Record<string, Pedido>
    const ab: Record<string, number> = {}, tr: Record<string, number> = {}
    ped.itens.forEach((it) => { const p = pById[it.pedido_id]; if (!p) return; const st = norm(p.status); if (RECEBIDO.includes(st)) return; if (lojaFil && p.loja_id !== lojaFil) return; const q = Number(it.quantidade) || 0; if (TRANSITO.includes(st)) tr[it.insumo_id] = (tr[it.insumo_id] || 0) + q; else ab[it.insumo_id] = (ab[it.insumo_id] || 0) + q })
    return { ab, tr }
  }, [ped, lojaFil])

  const rows = useMemo<Row[]>(() => {
    const b = norm(busca)
    return insumos.map((i) => {
      const cons = consMap[i.id] || 0, e = est[i.id] || 0, mn = min[i.id] || 0, ab = pedMap.ab[i.id] || 0, tr = pedMap.tr[i.id] || 0
      const alvo = Math.max(cons * coberturaDias, mn)
      const sug = Math.max(0, alvo - e - ab - tr)
      const custo = cmMap[i.id] > 0 ? cmMap[i.id] : (i.preco_compra || 0)
      return { insumoId: i.id, cod: fmtCod(i.codigo_interno), desc: i.nome || '—', grp: i.categoria || '—', un: un(i), est: e, min: mn, cons, ab, tr, custo, sug }
    })
      .filter((r) => (r.sug > 0 || r.est > 0 || r.min > 0 || r.cons > 0))
      .filter((r) => (!cat || r.grp === cat))
      .filter((r) => (!b || r.desc.toLowerCase().includes(b) || r.cod.includes(b)))
      .sort((a, z) => z.sug - a.sug || a.desc.localeCompare(z.desc, 'pt-BR'))
  }, [insumos, consMap, est, min, pedMap, cmMap, coberturaDias, cat, busca])

  const cats = useMemo(() => [...new Set(insumos.map((i) => i.categoria).filter(Boolean))].sort() as string[], [insumos])
  const idealNum = (r: Row) => (ideal[r.insumoId] != null ? parseNum(ideal[r.insumoId]) : r.sug)
  const setIdealAt = (id: string, v: string) => setIdeal((p) => ({ ...p, [id]: v }))
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = (on: boolean) => setSel(on ? new Set(rows.map((r) => r.insumoId)) : new Set())
  const recalcular = () => { setIdeal({}); showToast('Sugestões recalculadas com base no consumo e estoque atuais.') }
  const exportar = () => {
    if (!rows.length) { showToast('Nada para exportar.'); return }
    const n2 = (v: unknown) => +(Number(v) || 0).toFixed(2)
    const head = ['Código', 'Descrição', 'Grupo', 'Un', 'Estoque', 'Consumo/dia', 'Mínimo', 'Pedido Aberto', 'Em Trânsito', 'Sugestão', 'Compra Ideal', 'Custo', 'Valor']
    const linhas = rows.map((r) => { const ci = idealNum(r); return [r.cod, r.desc, r.grp, r.un, n2(r.est), n2(r.cons), n2(r.min), n2(r.ab), n2(r.tr), n2(r.sug), n2(ci), n2(r.custo), n2(ci * r.custo)] })
    downloadCsv(`sugestao_compra_${new Date().toLocaleDateString('en-CA')}.csv`, [head, ...linhas])
  }

  const foot = useMemo(() => { let n = 0, qtd = 0, val = 0; rows.forEach((r) => { if (sel.has(r.insumoId)) { const q = idealNum(r); n++; qtd += q; val += q * r.custo } }); return { n, qtd, val } }, [rows, sel, ideal])

  // --- distribuição por loja (Tela 2): necessidade real de cada loja p/ o item ---
  const [pedItems, setPedItems] = useState<PedItem[]>([])
  const perLoja = useMemo(() => {
    const est2: Record<string, Record<string, number>> = {}, min2: Record<string, Record<string, number>> = {}, cons2: Record<string, Record<string, number>> = {}, ab2: Record<string, Record<string, number>> = {}, tr2: Record<string, Record<string, number>> = {}
    saldos.forEach((s) => { addNest(est2, s.insumo_id, s.loja_id || '?', Number(s.quantidade) || 0); addNest(min2, s.insumo_id, s.loja_id || '?', Number(s.minimo) || 0) })
    // consumo/dia por (insumo, loja) = soma ÷ dias REAIS cobertos (igual ao agregado, não período cheio)
    const somaIL: Record<string, Record<string, number>> = {}, primIL: Record<string, Record<string, string>> = {}
    saidas.forEach((s) => {
      const lj = s.loja_id || '?'
      addNest(somaIL, s.insumo_id, lj, Number(s.quantidade) || 0)
      const d = s.criado_em || ''
      if (d) { (primIL[s.insumo_id] ||= {}); if (!primIL[s.insumo_id][lj] || d < primIL[s.insumo_id][lj]) primIL[s.insumo_id][lj] = d }
    })
    for (const il in somaIL) for (const lj in somaIL[il]) {
      const p = primIL[il]?.[lj]
      const cobertos = p ? Math.floor((Date.now() - new Date(p).getTime()) / 864e5) + 1 : periodoDias
      ;(cons2[il] ||= {})[lj] = somaIL[il][lj] / Math.min(periodoDias, Math.max(1, cobertos))
    }
    const pById = Object.fromEntries(ped.pedidos.map((p) => [p.id, p])) as Record<string, Pedido>
    ped.itens.forEach((it) => { const p = pById[it.pedido_id]; if (!p) return; const st = norm(p.status); if (RECEBIDO.includes(st)) return; addNest(TRANSITO.includes(st) ? tr2 : ab2, it.insumo_id, p.loja_id || '?', Number(it.quantidade) || 0) })
    return { est: est2, min: min2, cons: cons2, ab: ab2, tr: tr2 }
  }, [saldos, saidas, ped, periodoDias])
  const needLoja = (insumoId: string, lojaId: string) => {
    const v = (m: Record<string, Record<string, number>>) => m[insumoId]?.[lojaId] || 0
    const alvo = Math.max(v(perLoja.cons) * coberturaDias, v(perLoja.min))
    return Math.max(0, alvo - v(perLoja.est) - v(perLoja.ab) - v(perLoja.tr))
  }
  const distribuir = (insumoId: string, total: number): { lojaId: string; qty: number }[] => {
    if (lojaFil) return [{ lojaId: lojaFil, qty: total }]
    const ls = lojas.map((l) => ({ lojaId: l.id, need: needLoja(insumoId, l.id) }))
    const soma = ls.reduce((a, x) => a + x.need, 0)
    if (soma > 0) return ls.map((x) => ({ lojaId: x.lojaId, qty: total * (x.need / soma) }))
    const eq = lojas.length ? total / lojas.length : total
    return lojas.map((l) => ({ lojaId: l.id, qty: eq }))
  }
  const gerarPedido = () => {
    const items = rows.filter((r) => sel.has(r.insumoId)).map((r) => { const q = idealNum(r); return { insumoId: r.insumoId, cod: r.cod, desc: r.desc, grp: r.grp, un: r.un, custo: r.custo, qtd: q, porLoja: distribuir(r.insumoId, q) } })
    if (!items.length) { showToast('Selecione itens para gerar o pedido.'); return }
    setPedItems(items); setView('pedido')
  }

  // Fase 1.5 — cria uma requisição ao CD com os itens selecionados (em vez de comprar do fornecedor).
  // Exige uma LOJA no filtro (a requisição é de uma filial → CD). Cai na Central de Distribuição.
  const requisitarCd = async () => {
    if (!cdLojaId) { showToast('Nenhum Centro de Distribuição configurado.'); return }
    if (!lojaFil) { showToast('Escolha uma loja no filtro para requisitar do CD.'); return }
    if (lojaFil === cdLojaId) { showToast('A loja do filtro é o próprio CD — escolha uma filial.'); return }
    const items = rows.filter((r) => sel.has(r.insumoId))
    if (!items.length) { showToast('Selecione itens para requisitar do CD.'); return }
    try {
      const { data: req, error } = await supabase.from('requisicoes').insert({ tenant_id: tenantId, loja_id: lojaFil, cd_loja_id: cdLojaId, status: 'enviada', origem: 'sugestao', modo: 'transferencia' }).select('id').single()
      if (error) throw error
      const reqId = (req as { id: string }).id
      const linhas = items.map((r) => ({ requisicao_id: reqId, tenant_id: tenantId, insumo_id: r.insumoId, qtd_pedida: idealNum(r), unidade: r.un, custo_unitario: r.custo }))
      const { error: e2 } = await supabase.from('requisicao_itens').insert(linhas); if (e2) throw e2
      setSel(new Set()); showToast(`Requisição ao CD enviada (${items.length} ${items.length === 1 ? 'item' : 'itens'}).`)
    } catch (e) { showToast('Erro: ' + (e as Error).message) }
  }

  // Histórico do drawer (real): movimentações dos últimos 6 meses do item selecionado
  type HEnt = { quantidade?: number; custo_unitario?: number; criado_em?: string }
  type HSai = { quantidade?: number; criado_em?: string }
  const { data: hist = { entradas: [] as HEnt[], saidas: [] as HSai[] } } = useQuery({
    queryKey: ['sug-hist', tenantId, drawer, lojaFil], enabled: !!tenantId && !!drawer,
    queryFn: async () => {
      const d = new Date(); d.setMonth(d.getMonth() - 5); d.setDate(1); d.setHours(0, 0, 0, 0); const desde = d.toISOString()
      let qe = supabase.from('entradas_estoque').select('quantidade,custo_unitario,criado_em').eq('tenant_id', tenantId).eq('insumo_id', drawer!).gte('criado_em', desde)
      let qs = supabase.from('saidas_estoque').select('quantidade,criado_em').eq('tenant_id', tenantId).eq('insumo_id', drawer!).gte('criado_em', desde)
      if (lojaFil) { qe = qe.eq('loja_id', lojaFil); qs = qs.eq('loja_id', lojaFil) }
      const [re, rs] = await Promise.all([qe, qs])
      return { entradas: (re.data ?? []) as HEnt[], saidas: (rs.data ?? []) as HSai[] }
    },
  })
  const histCharts = useMemo(() => {
    const now = new Date()
    const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1); return { key: d.getFullYear() * 12 + d.getMonth(), label: d.toLocaleDateString('pt-BR', { month: 'short' }) } })
    const keys = months.map((m) => m.key)
    const idxOf = (dt?: string) => { if (!dt) return -1; const d = new Date(dt); return keys.indexOf(d.getFullYear() * 12 + d.getMonth()) }
    const cons = keys.map(() => 0), cSum = keys.map(() => 0), cN = keys.map(() => 0), net = keys.map(() => 0)
    hist.entradas.forEach((e) => { const i = idxOf(e.criado_em); if (i < 0) return; const q = Number(e.quantidade) || 0; net[i] += q; if (e.custo_unitario) { cSum[i] += Number(e.custo_unitario) * q; cN[i] += q } })
    hist.saidas.forEach((s) => { const i = idxOf(s.criado_em); if (i < 0) return; const q = Number(s.quantidade) || 0; cons[i] += q; net[i] -= q })
    let lastC = drawer ? (rows.find((r) => r.insumoId === drawer)?.custo || 0) : 0
    const custo = keys.map((_, i) => { if (cN[i] > 0) lastC = cSum[i] / cN[i]; return Number(lastC.toFixed(2)) })
    const saldoAtual = drawer ? (est[drawer] || 0) : 0
    let run = saldoAtual - net.reduce((a, b) => a + b, 0)
    const estoque = keys.map((_, i) => { run += net[i]; return Math.max(0, Number(run.toFixed(2))) })
    return { labels: months.map((m) => m.label), cons: cons.map((v) => Number(v.toFixed(2))), custo, estoque }
  }, [hist, drawer, est, rows])
  const chMes = useMemo<ChartConfiguration>(() => ({ type: 'bar', data: { labels: histCharts.labels, datasets: [{ data: histCharts.cons, backgroundColor: '#334155', borderRadius: 3, barPercentage: 0.6 }] }, options: baseChart() }), [histCharts])
  const chPreco = useMemo<ChartConfiguration>(() => ({ type: 'line', data: { labels: histCharts.labels, datasets: [{ data: histCharts.custo, borderColor: '#334155', backgroundColor: 'rgba(51,65,85,.06)', fill: true, tension: 0.35, pointRadius: 2, borderWidth: 2 }] }, options: baseChart() }), [histCharts])
  const chEstoque = useMemo<ChartConfiguration>(() => ({ type: 'line', data: { labels: histCharts.labels, datasets: [{ data: histCharts.estoque, borderColor: '#94a3b8', backgroundColor: 'rgba(148,163,184,.08)', fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2 }] }, options: baseChart() }), [histCharts])

  if (view === 'pedido') return <TelaPedido itens={pedItems} onBack={() => setView('sugestao')} />

  const dr = drawer != null ? rows.find((r) => r.insumoId === drawer) : null
  const allSel = rows.length > 0 && rows.every((r) => sel.has(r.insumoId))

  return (
    <div className="sug-screen">
      <div className="sug-toolbar">
        <div className="fld"><label>Loja</label><SearchSelect value={lojaFil ? (lojas.find((l) => l.id === lojaFil)?.nome || '') : ''} options={lojas.map((l) => l.nome)} placeholder={`Todas as lojas (${lojas.length || '—'})`} onChange={(nm) => setLojaFil(lojas.find((l) => l.nome === nm)?.id || '')} /></div>
        <div className="fld"><label>Período de análise</label><SearchSelect value={PA_LBL[periodoDias]} options={PA_OPTS} placeholder="Período" onChange={(l) => setPeriodoDias(PA_VAL[l] || 30)} /></div>
        <div className="fld"><label>Cobertura desejada</label><SearchSelect value={CB_LBL[coberturaDias]} options={CB_OPTS} placeholder="Cobertura" onChange={(l) => setCoberturaDias(CB_VAL[l] || 7)} /></div>
        <div className="fld"><label>Categoria</label><SearchSelect value={cat} options={cats} placeholder="Todas" onChange={setCat} /></div>
        <div className="fld"><label>Buscar item</label><input placeholder="Código ou descrição..." value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <div className="grow" />
        <button className="btn btn-solid" onClick={recalcular}>Recalcular sugestão</button>
        <button className="btn" onClick={exportar}>Exportar</button>
      </div>

      <div className="sug-tabs">
        <button className="on">Por itens</button>
        <div className="right">
          <span className="mock-tag">{rows.length} itens · consumo dos últimos {periodoDias}d · cobertura {coberturaDias}d</span>
        </div>
      </div>

      <div className="grid-wrap">
        <table>
          <thead>
            <tr>
              <th className="c"><input type="checkbox" className="chk" onChange={(e) => toggleAll(e.target.checked)} checked={allSel} /></th>
              <th>Código</th><th>Descrição</th><th>Grupo</th>
              <th className="r">Estoque Atual</th>{temCd && <th className="r">No CD</th>}<th className="r">Consumo Médio</th>
              <th className="r">Estoque Mínimo</th><th className="r">Pedido Aberto<span className="q">?</span></th>
              <th className="r">Em Trânsito<span className="q">?</span></th><th className="r">Sugestão Sistema<span className="q">?</span></th>
              <th className="r">Compra Ideal<span className="q">?</span></th><th className="r">Último Custo</th><th className="r">Valor Total</th><th className="c">Ações</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length ? <tr><td colSpan={temCd ? 15 : 14} style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>Nenhum item com estoque/consumo/mínimo.</td></tr>
              : rows.map((r) => {
                const ci = idealNum(r), alterado = Math.abs(ci - r.sug) > 0.001
                return (
                  <tr key={r.insumoId}>
                    <td className="c"><input type="checkbox" className="chk" checked={sel.has(r.insumoId)} onChange={() => toggle(r.insumoId)} /></td>
                    <td className="mono muted">{r.cod}</td>
                    <td>{r.desc}</td>
                    <td className="muted">{r.grp}</td>
                    <td className="r mono">{q2(r.est)} {r.un}</td>
                    {temCd && <td className="r mono" style={{ color: (cdSaldoMap[r.insumoId] || 0) > 0 ? '#0f766e' : '#cbd5e1' }}>{(cdSaldoMap[r.insumoId] || 0) > 0 ? `${q2(cdSaldoMap[r.insumoId])} ${r.un}` : '—'}</td>}
                    <td className="r mono">{q2(r.cons)} {r.un}/d</td>
                    <td className="r mono">{q2(r.min)} {r.un}</td>
                    <td className={'r mono' + (r.ab === 0 ? ' muted' : '')}>{r.ab === 0 ? '—' : q2(r.ab) + ' ' + r.un}</td>
                    <td className={'r mono' + (r.tr === 0 ? ' muted' : '')}>{r.tr === 0 ? '—' : q2(r.tr) + ' ' + r.un}</td>
                    <td className="r mono"><span className="sug-link" onClick={() => setDrawer(r.insumoId)}>{q2(r.sug)} {r.un}</span></td>
                    <td className="r">
                      <input className="ci" value={ideal[r.insumoId] ?? q2(r.sug)} onChange={(e) => setIdealAt(r.insumoId, e.target.value)} />
                      {alterado && <span className="mark" title={`Sugestão do sistema: ${q2(r.sug)} → Compra ideal: ${q2(ci)}`}>✎</span>}
                    </td>
                    <td className="r mono muted">{brl(r.custo)} /{r.un}</td>
                    <td className="r mono">{brl(ci * r.custo)}</td>
                    <td className="c"><button className="mini" style={{ height: 24 }} onClick={() => setDrawer(r.insumoId)}>Analisar</button></td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      <div className="footbar">
        <span className="info">Itens selecionados: <b>{foot.n}</b></span>
        <span className="info">Qtd total da compra: <b>{q2(foot.qtd)}</b></span>
        <span className="info">Valor total da compra: <b>{brl(foot.val)}</b></span>
        <div className="grow" />
        <button className="btn" onClick={() => toggleAll(false)}>Limpar seleção</button>
        {temCd && <button className="btn" onClick={requisitarCd} title={lojaFil ? 'Requisitar os itens selecionados ao Centro de Distribuição' : 'Escolha uma loja no filtro para requisitar do CD'}>📦 Requisitar do CD</button>}
        <button className="btn btn-solid" onClick={gerarPedido}>Gerar Pedido de Compra →</button>
      </div>

      {dr && (
        <>
          <div className="backdrop" onClick={() => setDrawer(null)} />
          <div className="sug-drawer">
            <div className="dr-head">
              <div><h2>{dr.desc}</h2><div className="sub">{dr.cod} · {dr.grp}</div></div>
              <button className="dr-close" onClick={() => setDrawer(null)}>✕</button>
            </div>
            <div className="dr-body">
              <div className="dr-sec">
                <h3>Como o AIKO calculou a sugestão</h3>
                <div className="calc">
                  <div className="row"><span>Consumo médio diário</span><span>{q2(dr.cons)} {dr.un}/dia</span></div>
                  <div className="row"><span>Cobertura desejada</span><span>{coberturaDias} dias</span></div>
                  <div className="row"><span>Necessidade (consumo × cobertura)</span><span>{q2(dr.cons * coberturaDias)} {dr.un}</span></div>
                  <div className="row"><span>Alvo (máx. entre necessidade e mínimo {q2(dr.min)})</span><span>{q2(Math.max(dr.cons * coberturaDias, dr.min))} {dr.un}</span></div>
                  <div className="row"><span>(−) Estoque atual</span><span>{q2(dr.est)} {dr.un}</span></div>
                  <div className="row"><span>(−) Pedido em aberto</span><span>{q2(dr.ab)} {dr.un}</span></div>
                  <div className="row"><span>(−) Mercadoria em trânsito</span><span>{q2(dr.tr)} {dr.un}</span></div>
                  <div className="row total"><span>Sugestão final</span><span>{q2(dr.sug)} {dr.un}</span></div>
                </div>
              </div>

              <div className="dr-sec">
                <h3>Histórico <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>· últimos 6 meses</span></h3>
                <div className="chartbox"><div className="ct">Consumo por mês ({dr.un})</div><div style={{ height: 130 }}><ChartBox config={chMes} style={{ maxHeight: 130 }} /></div></div>
                <div className="chartbox"><div className="ct">Evolução do custo (R$/{dr.un})</div><div style={{ height: 130 }}><ChartBox config={chPreco} style={{ maxHeight: 130 }} /></div></div>
                <div className="chartbox"><div className="ct">Evolução do estoque ({dr.un})</div><div style={{ height: 130 }}><ChartBox config={chEstoque} style={{ maxHeight: 130 }} /></div></div>
              </div>
            </div>
          </div>
        </>
      )}

      {toast && <div className="sug-toast">{toast}</div>}
    </div>
  )
}

// ===================== TELA 2 — PEDIDO DE COMPRA (real, a partir da Sugestão) =====================
// AUTOCONTIDA: gera os PDFs por fornecedor/loja. NÃO grava em pedidos_compra
// (aquela aba vem das solicitações dos gerentes — não pode ser tocada aqui).

function gerarPDFReal(forn: string, itens: PedItem[], lojas: Record<string, unknown>[]) {
  const data = new Date().toLocaleDateString('pt-BR')
  const nomeLoja = (l: Record<string, unknown>) => (l.nome_fantasia as string) || (l.nome as string) || '—'
  const paginas = lojas.map((loja) => {
    const linhas = itens.map((it) => { const pl = it.porLoja.find((x) => x.lojaId === loja.id); const q = pl?.qty || 0; return q > 0.0001 ? { nome: it.desc, qty: q.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), un: it.un.toUpperCase() } : null }).filter(Boolean) as { nome: string; qty: string; un: string }[]
    if (!linhas.length) return ''
    const linhasP: ({ nome: string; qty: string; un: string } | null)[] = [...linhas]
    while (linhasP.length < 8) linhasP.push(null)
    const corpo = linhasP.map((it) => it ? `<tr><td colspan="2" class="cel-item">${it.nome.toUpperCase()}</td><td class="cel-qty">${it.qty} ${it.un}</td></tr>` : `<tr><td colspan="2" class="cel-item">&nbsp;</td><td class="cel-qty">&nbsp;</td></tr>`).join('')
    return `<div class="pagina"><table class="doc">
      <tr><td class="cel-loja">${nomeLoja(loja).toUpperCase()}</td><td class="cel-data-label">DATA:</td><td class="cel-data">${data}</td></tr>
      <tr><td colspan="3" class="cel-info">RAZÃO SOCIAL: ${(loja.razao_social as string) || '—'} CNPJ: ${(loja.cnpj as string) || '—'}</td></tr>
      <tr><td colspan="3" class="cel-info">ENDEREÇO: ${enderecoLoja(loja)}</td></tr>
      <tr><td colspan="2" class="cel-th">ITENS — ${forn.toUpperCase()}</td><td class="cel-th" style="text-align:center">QUANTIDADE</td></tr>
      ${corpo}
      <tr><td class="cel-footer">HORÁRIO DE RECEBIMENTO</td><td class="cel-footer">MANHÃ</td><td class="cel-footer">-</td></tr>
      <tr><td class="cel-footer">&nbsp;</td><td class="cel-footer">TARDE</td><td class="cel-footer">-</td></tr>
    </table></div>`
  }).filter(Boolean).join('')
  if (!paginas) { alert('Nenhuma quantidade distribuída para este fornecedor.'); return }
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Pedido — ${forn}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif;color:#000}
      body{background:#fff}
      .pagina{page-break-after:always;padding:20px;max-width:700px;margin:0 auto}
      .pagina:last-child{page-break-after:avoid}
      .doc{width:100%;border-collapse:collapse;font-size:13px}
      .doc td{border:1px solid #000;padding:6px 8px;vertical-align:middle}
      .cel-loja{font-weight:700;font-size:14px;width:55%}
      .cel-data-label{font-weight:700;width:15%;text-align:center}
      .cel-data{font-weight:700;font-size:14px;width:30%;text-align:right}
      .cel-info{font-size:12px;line-height:1.5;height:36px}
      .cel-th{font-weight:700;font-size:13px;text-align:center;padding:8px}
      .cel-item{height:28px;font-size:12px}
      .cel-qty{text-align:center;font-weight:700;font-size:12px}
      .cel-footer{font-weight:700;font-size:12px;text-align:center;padding:6px}
      @media print{body{margin:0}.pagina{padding:10px;max-width:100%}}
    </style></head><body>${paginas}
    <script>window.onload=function(){window.print()}</script></body></html>`
  const w = window.open('', '_blank'); if (!w) return
  w.document.write(html); w.document.close()
}

function TelaPedido({ itens, onBack }: { itens: PedItem[]; onBack: () => void }) {
  const { tenantId } = useAuth()
  const [fornSel, setFornSel] = useState<Record<string, string>>({})
  const [selItem, setSelItem] = useState(itens[0]?.insumoId || '')

  const { data: lojasFull = [] } = useQuery({ queryKey: ['ped-lojas', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('lojas').select('*').eq('tenant_id', tenantId).order('nome'); return (data ?? []) as Record<string, unknown>[] } })
  const { data: fornecedores = [] } = useQuery({ queryKey: ['ped-forn', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('fornecedores').select('id,nome').eq('tenant_id', tenantId).order('nome'); return (data ?? []) as { id: string; nome?: string }[] } })
  const insIds = itens.map((i) => i.insumoId)
  const { data: ultForn = {} } = useQuery({ queryKey: ['ped-ultforn', tenantId, insIds.join(',')], enabled: !!tenantId && insIds.length > 0, queryFn: async () => { const { data } = await supabase.from('entradas_estoque').select('insumo_id,fornecedor_id,criado_em').eq('tenant_id', tenantId).in('insumo_id', insIds).not('fornecedor_id', 'is', null).order('criado_em', { ascending: false }); const m: Record<string, string> = {}; (data ?? []).forEach((e) => { const r = e as { insumo_id: string; fornecedor_id?: string }; if (r.fornecedor_id && !m[r.insumo_id]) m[r.insumo_id] = r.fornecedor_id }); return m } })

  const lojaMap = useMemo(() => Object.fromEntries(lojasFull.map((l) => [l.id as string, l])) as Record<string, Record<string, unknown>>, [lojasFull])
  const fornMap = useMemo(() => Object.fromEntries(fornecedores.map((f) => [f.id, f.nome || '—'])) as Record<string, string>, [fornecedores])
  const fornOf = (it: PedItem) => fornSel[it.insumoId] ?? ultForn[it.insumoId] ?? ''
  const fornNome = (id: string) => (id ? fornMap[id] || '—' : 'Sem fornecedor')

  const grupos = useMemo(() => {
    const m: Record<string, PedItem[]> = {}
    itens.forEach((it) => { (m[fornOf(it)] ||= []).push(it) })
    return Object.entries(m).map(([fid, its]) => ({ fid, its, total: its.reduce((a, x) => a + x.qtd * x.custo, 0) })).sort((a, z) => z.total - a.total)
  }, [itens, fornSel, ultForn])

  const totalGeral = itens.reduce((a, x) => a + x.qtd * x.custo, 0)
  const cur = itens.find((i) => i.insumoId === selItem) || itens[0]
  const lojaNome = (id: string) => (lojaMap[id]?.nome_fantasia as string) || (lojaMap[id]?.nome as string) || id
  const gerarTodos = () => grupos.forEach((g) => gerarPDFReal(fornNome(g.fid), g.its, lojasFull))

  if (!itens.length) return (
    <div className="sug-screen"><div className="sug-toolbar"><button className="btn" onClick={onBack}>← Voltar</button><span className="mock-tag">Selecione itens na Sugestão e clique em “Gerar Pedido de Compra”.</span></div></div>
  )

  return (
    <div className="sug-screen">
      <div className="sug-toolbar">
        <button className="btn" onClick={onBack}>← Voltar</button>
        <div className="fld"><label>Data</label><input type="date" defaultValue={new Date().toLocaleDateString('en-CA')} /></div>
        <div className="fld"><label>Resumo</label><input value={`${itens.length} itens · ${lojasFull.length} lojas`} readOnly /></div>
        <div className="fld"><label>Valor total</label><input value={brl(totalGeral)} readOnly /></div>
        <div className="grow" />
        <span className="mock-tag">Gera PDFs — não grava na aba “Pedidos de Compra”</span>
        <button className="btn btn-solid" onClick={gerarTodos}>Gerar PDFs por fornecedor</button>
      </div>

      <div className="p2cols">
        <div className="panel">
          <div className="panel-h"><span className="t">Itens do pedido <span className="muted" style={{ fontWeight: 400 }}>(agrupados por fornecedor)</span></span></div>
          {grupos.map((g) => (
            <div className="forn-grp" key={g.fid || 'sem'}>
              <div className="forn-hd"><span className="muted">▾</span><span className="nm">{fornNome(g.fid)}</span><span className="cnt">{g.its.length} itens</span><span className="tot">{brl(g.total)}</span>
                <button className="mini" style={{ marginLeft: 8 }} onClick={() => gerarPDFReal(fornNome(g.fid), g.its, lojasFull)}>PDF</button></div>
              <table className="subtbl">
                <thead><tr><th>Item</th><th className="r">Total</th><th>Fornecedor</th><th className="r">Preço Unit.</th><th className="r">Valor Total</th></tr></thead>
                <tbody>
                  {g.its.map((it) => (
                    <tr key={it.insumoId} className={selItem === it.insumoId ? 'selrow' : ''} style={{ cursor: 'pointer' }} onClick={() => setSelItem(it.insumoId)}>
                      <td>{it.desc}</td><td className="r mono">{q2(it.qtd)} {it.un}</td>
                      <td><select className="fsel" value={fornOf(it)} onClick={(e) => e.stopPropagation()} onChange={(e) => setFornSel((p) => ({ ...p, [it.insumoId]: e.target.value }))}><option value="">Sem fornecedor</option>{fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></td>
                      <td className="r mono">{brl(it.custo)}</td><td className="r mono">{brl(it.qtd * it.custo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <div className="panel">
          {cur && <>
            <div className="panel-h"><span className="t">{cur.desc} <span className="mono muted" style={{ fontWeight: 400 }}>{cur.cod} · {cur.grp}</span></span></div>
            <div className="dtl-top">
              <div className="c2"><div className="k">Total do item</div><div className="v">{q2(cur.qtd)} {cur.un}</div></div>
              <div className="c2"><div className="k">Fornecedor</div><div className="v">{fornNome(fornOf(cur))}</div></div>
              <div className="c2"><div className="k">Preço unitário</div><div className="v">{brl(cur.custo)}</div></div>
              <div className="c2"><div className="k">Valor total</div><div className="v">{brl(cur.qtd * cur.custo)}</div></div>
            </div>
            <div style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 7 }}>Distribuição por loja <span className="muted" style={{ fontWeight: 400 }}>(vira PDF individual por loja)</span></div>
              <table className="subtbl" style={{ border: '1px solid #e5e9f0', borderRadius: 8 }}>
                <thead><tr><th>Loja</th><th className="r">Quantidade</th></tr></thead>
                <tbody>
                  {cur.porLoja.filter((pl) => pl.qty > 0.0001).map((pl) => <tr key={pl.lojaId}><td>{lojaNome(pl.lojaId)}</td><td className="r mono">{q2(pl.qty)} {cur.un}</td></tr>)}
                  {cur.porLoja.every((pl) => pl.qty <= 0.0001) && <tr><td colSpan={2} style={{ color: '#94a3b8' }}>Sem distribuição — defina estoque mínimo/consumo nas lojas.</td></tr>}
                </tbody>
              </table>
            </div>
          </>}
        </div>
      </div>

      <div className="footbar">
        <span className="info">Total geral do pedido: <b>{brl(totalGeral)}</b></span>
        <div className="grow" />
        <button className="btn btn-solid" onClick={gerarTodos}>Gerar PDFs por fornecedor</button>
      </div>
    </div>
  )
}
