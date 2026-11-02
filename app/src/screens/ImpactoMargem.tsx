import { Fragment, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import { custoDoInsumo, type CostCtx } from '../lib/cost'
import { downloadCsv } from '../lib/csv'
import { precosPeriodo, criarExplosao, custoConsumo, custoUnitario, precoParaManter, ligarRodizio, listarPeriodos, intervaloPeriodo, rotuloPeriodo, type FichaX, type InsumoUn, type Consumo, type PrecoPer, type ModoPeriodo } from '../lib/impactoMargem'
import { ImpLineChart, SERIE_CORES } from './impactoChart'
import { useRodizioMapa } from '../lib/useRodizioMapa'
import { normGrupo } from '../lib/rodizio'
import './impacto.css'

// Gestão › Impacto na Margem — quanto a variação do preço de COMPRA dos insumos tirou (ou devolveu)
// da margem, com o volume que foi VENDIDO no mês. Só leitura (não mexe em custo médio/CMV).
//  • preço do insumo no mês = média ponderada das compras da REDE (NF-e + manual; sem transferência/ajuste)
//  • custo do produto = ficha explodida até o insumo cru (processados e combos descem)
//  • vendas = vendas_produto_dia com o portão (só dia 'processado'), loja = seletor global

type Insumo = InsumoUn & { nome: string; categoria?: string | null; preco_compra?: number }
type Ficha = { id: string; produto_id?: string | null; rendimento_porcoes?: number | null; insumo_vinculado_id?: string | null; rendimento_receita_g?: number | null; itens_ficha?: { insumo_id?: string | null; produto_id?: string | null; quantidade_g?: number | null }[] }
type Venda = { loja_id: string; data: string; produto_id: string; produto_nome?: string; grupo?: string; qtd?: number; faturado?: number }
type Ent = { insumo_id: string; quantidade?: number; custo_unitario?: number; criado_em?: string; tipo?: string | null }
type ProdRow = { cod: string; nome: string; grupo: string; qtd: number; fat: number; preco: number; consumo: Consumo | null; cA: number; cB: number; cmvA: number; cmvB: number; perda: number; sug: number; itens?: string[]; cabecas?: string }

const brl = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = (v: number) => 'R$ ' + Math.round(v).toLocaleString('pt-BR')
const pc = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
const qtdFmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const titleCase = (s: string) => (s || '').toLowerCase().replace(/(^|[\s\-/(])(\S)/g, (_m, p, c) => p + (c as string).toUpperCase())
const dot = (c: number) => c <= 30 ? 'g' : c <= 38 ? 'y' : 'r'
const unLabel = (i?: Insumo) => { const u = (i?.unidade_medida || i?.unidade_compra || 'kg').toLowerCase(); return u === 'un' || u === 'pct' || u === 'cx' ? u : (u === 'litro' || u === 'ml' || u === 'l') ? 'L' : 'kg' }
const discreto = (i?: Insumo) => ['un', 'pct', 'cx'].includes((i?.unidade_medida || i?.unidade_compra || 'g').toLowerCase())

// meses: 'YYYY-MM' → [primeiro dia, último dia]
const mesKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const mesRange = (k: string): [string, string] => { const [y, m] = k.split('-').map(Number); return [`${k}-01`, new Date(y, m, 0).toLocaleDateString('en-CA')] }
const MESES = (() => { const h = new Date(); return Array.from({ length: 13 }, (_, i) => mesKey(new Date(h.getFullYear(), h.getMonth() - i, 1))) })()

function VarPill({ v }: { v: number }) {
  const cls = v > 0.05 ? 'up' : v < -0.05 ? 'dn' : 'eq'
  return <span className={'imp-pill ' + cls}>{v > 0.05 ? '▲' : v < -0.05 ? '▼' : ''} {pc(Math.abs(v))}</span>
}
function Fonte({ p }: { p: PrecoPer }) {
  if (p.fonte === 'compra') return null
  const t = p.fonte === 'ultima' ? 'sem compra no período — usa o último preço pago' : p.fonte === 'cadastro' ? 'nunca comprado — usa o custo do cadastro' : 'sem preço'
  return <span className="imp-src" title={t}>{p.fonte === 'ultima' ? 'últ.' : p.fonte === 'cadastro' ? 'cad.' : '—'}</span>
}
const Cmv = ({ v }: { v: number }) => <span className="imp-cmv"><i className={'imp-dot ' + dot(v)} />{pc(v)}</span>

export function ImpactoMargem() {
  const { tenantId } = useAuth()
  const { data: rodMapa = new Map<string, string>() } = useRodizioMapa(tenantId)   // Cadastros › Rodízios (cabeça → grupo)
  const { lojaId, lojas } = useLoja()
  // período: mês / trimestre / semestre / ano / personalizado.
  // padrão = último período FECHADO × o anterior (o corrente ainda está incompleto); no ano, o ano corrente × o anterior
  const [modo, setModo] = useState<ModoPeriodo | 'pers'>('mes')
  const lista = useMemo(() => modo === 'pers' ? [] : listarPeriodos(modo), [modo])
  const [keyB, setKeyB] = useState(() => listarPeriodos('mes')[1])
  const [keyA, setKeyA] = useState(() => listarPeriodos('mes')[2])
  const diasAtras = (n: number) => new Date(Date.now() - n * 86400000).toLocaleDateString('en-CA')
  const [pers, setPers] = useState(() => ({ bIni: diasAtras(29), bFim: diasAtras(0), aIni: diasAtras(59), aFim: diasAtras(30) }))
  const trocarModo = (m: ModoPeriodo | 'pers') => {
    setModo(m)
    if (m === 'pers') return
    const l = listarPeriodos(m), ib = m === 'ano' ? 0 : 1
    setKeyB(l[ib]); setKeyA(l[ib + 1])
  }
  const [aba, setAba] = useState<'vil' | 'prod' | 'sim' | 'evo'>('vil')
  const [cat, setCat] = useState('')   // categoria (grupo do PDV) — filtra TUDO: resumo, vilões, produtos e simulador
  const [busca, setBusca] = useState('')
  const [ord, setOrd] = useState<{ k: keyof ProdRow; desc: boolean }>({ k: 'perda', desc: true })
  const [aberto, setAberto] = useState<string | null>(null)
  const [sim, setSim] = useState<Record<string, number>>({})
  const [buscaSim, setBuscaSim] = useState('')
  const [soComPreco, setSoComPreco] = useState(true)   // esconde itens de rodízio (vendidos a R$ 0) das TABELAS — os totais seguem incluindo

  const [iniB, fimB] = modo === 'pers' ? [pers.bIni, pers.bFim] : intervaloPeriodo(keyB)
  const [iniA, fimA] = modo === 'pers' ? [pers.aIni, pers.aFim] : intervaloPeriodo(keyA)
  const dm = (d: string) => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '?'
  const labB = modo === 'pers' ? `${dm(iniB)}–${dm(fimB)}` : rotuloPeriodo(keyB, true)
  const labA = modo === 'pers' ? `${dm(iniA)}–${dm(fimA)}` : rotuloPeriodo(keyA, true)
  const evoMeses = useMemo(() => [...MESES.slice(0, 12)].reverse(), [])   // Evolução: últimos 12 meses
  const fimMax = [fimA, fimB, mesRange(MESES[0])[1]].sort().pop() as string
  // histórico de compras até 12 meses antes do período mais antigo (p/ o "último preço pago") — cobre a Evolução também
  const desde = useMemo(() => { const base = [iniA, iniB, mesRange(evoMeses[0])[0]].sort()[0]; const d = new Date(base + 'T12:00:00'); d.setFullYear(d.getFullYear() - 1); return d.toLocaleDateString('en-CA') }, [iniA, iniB, evoMeses])

  const en = !!tenantId
  const { data: insumos = [], isLoading: l1 } = useQuery({ queryKey: ['imp-ins', tenantId], enabled: en, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,categoria,unidade_medida,unidade_compra,rendimento_pct,preco_compra').eq('tenant_id', tenantId).order('id').range(f, t)) })
  const { data: saldos = [] } = useQuery({ queryKey: ['imp-sld', tenantId], enabled: en, queryFn: () => fetchAll<{ insumo_id: string; custo_medio?: number; loja_id?: string }>((f, t) => supabase.from('saldo_estoque').select('insumo_id,custo_medio,loja_id').eq('tenant_id', tenantId).order('id').range(f, t)) })
  const { data: fichas = [], isLoading: l2 } = useQuery({ queryKey: ['imp-fichas', tenantId], enabled: en, queryFn: () => fetchAll<Ficha>((f, t) => supabase.from('fichas_tecnicas').select('id,produto_id,rendimento_porcoes,insumo_vinculado_id,rendimento_receita_g,itens_ficha(insumo_id,produto_id,quantidade_g)').eq('tenant_id', tenantId).neq('status', 'arquivada').order('id').range(f, t)) })
  const { data: produtos = [] } = useQuery({ queryKey: ['imp-prod', tenantId], enabled: en, queryFn: () => fetchAll<{ id: string; codigo_pdv?: string }>((f, t) => supabase.from('produtos').select('id,codigo_pdv').eq('tenant_id', tenantId).order('id').range(f, t)) })
  const { data: entradas = [], isLoading: l3 } = useQuery({
    queryKey: ['imp-ent', tenantId, desde, fimMax], enabled: en,
    queryFn: () => fetchAll<Ent>((f, t) => supabase.from('entradas_estoque').select('insumo_id,quantidade,custo_unitario,criado_em,tipo').eq('tenant_id', tenantId).gte('criado_em', desde + 'T00:00:00').lte('criado_em', fimMax + 'T23:59:59').order('id').range(f, t)),
  })
  // vendas do mês "agora" com o PORTÃO (só dia processado) — igual Engenharia/Faturamento
  const { data: vendas = [], isLoading: l4 } = useQuery({
    queryKey: ['imp-vendas', tenantId, iniB, fimB], enabled: en,
    queryFn: async () => {
      // 1º: RPC que já soma por loja×produto no banco (rápido p/ trimestre/ano). Sem a RPC → busca dia a dia (ok p/ mês).
      // PAGINADA: o PostgREST corta em 1000 linhas por chamada (a RPC também) — sem paginar, perdia ~60% das vendas
      try {
        return await fetchAll<Venda>((f, t) => supabase.rpc('vendas_produto_periodo', { p_ini: iniB, p_fim: fimB }).order('loja_id').order('produto_id').range(f, t))
      } catch (e) {
        if (!['PGRST202', '42883'].includes((e as { code?: string }).code || '')) throw e
      }
      const [v, gate] = await Promise.all([
        fetchAll<Venda>((f, t) => supabase.from('vendas_produto_dia').select('*').eq('tenant_id', tenantId).gte('data', iniB).lte('data', fimB).order('loja_id').order('data').order('produto_id').range(f, t)),
        fetchAll<{ loja_id: string; data: string; status: string }>((f, t) => supabase.from('recebimento_vendas').select('loja_id,data,status').eq('tenant_id', tenantId).gte('data', iniB).lte('data', fimB).order('loja_id').order('data').range(f, t)),
      ])
      const ok = new Set(gate.filter((g) => g.status === 'processado').map((g) => `${g.loja_id}|${g.data}`))
      return v.filter((r) => ok.has(`${r.loja_id}|${r.data}`))
    },
  })
  const loading = l1 || l2 || l3 || l4

  const insMap = useMemo(() => new Map(insumos.map((i) => [i.id, i])), [insumos])
  const fallback = useMemo(() => { const ctx = { saldos, insumos: insumos as CostCtx['insumos'] }; return (id: string) => custoDoInsumo(id, null, ctx) }, [saldos, insumos])
  const precoA = useMemo(() => precosPeriodo(entradas, iniA, fimA, fallback), [entradas, iniA, fimA, fallback])
  const precoB = useMemo(() => precosPeriodo(entradas, iniB, fimB, fallback), [entradas, iniB, fimB, fallback])
  const explosao = useMemo(() => criarExplosao(fichas.map((f): FichaX => ({ ...f, itens: f.itens_ficha || [] }))), [fichas])
  const prodByCod = useMemo(() => { const m = new Map<string, string>(); produtos.forEach((p) => { const c = (p.codigo_pdv || '').trim(); if (c) m.set(c, p.id) }); return m }, [produtos])

  // produtos vendidos (agrupados por código do PDV; loja = seletor global)
  const base = useMemo(() => {
    const agg = new Map<string, { cod: string; nome: string; grupo: string; qtd: number; fat: number }>()
    for (const v of vendas) {
      if (lojaId && v.loja_id !== lojaId) continue
      const cod = String(v.produto_id ?? '').trim(); if (!cod) continue
      const a = agg.get(cod) || { cod, nome: v.produto_nome || cod, grupo: v.grupo || '', qtd: 0, fat: 0 }
      a.qtd += +(v.qtd || 0); a.fat += +(v.faturado || 0); agg.set(cod, a)
    }
    let fatTotal = 0, fatFicha = 0
    // RODÍZIO: o garçom lança o "Rodízio Sushi R$ 86,90" (SEM ficha) e depois os itens do grupo rodízio a R$ 0 (COM ficha).
    // A receita está na cabeça, o custo nos itens → a cabeça entra na receita (margem) e na cobertura.
    const rod = { fat: 0, qtd: 0, nomes: [] as string[], heads: [] as { cod: string; nome: string; grupo: string; qtd: number; fat: number }[] }
    // cabeça = cadastrada em Cadastros › Rodízios (grupo ≠ '') ou, sem cadastro, "rodízio" no nome/grupo
    const ehRod = (a: { cod: string; nome: string; grupo: string }) => rodMapa.has(a.cod) ? rodMapa.get(a.cod) !== '' : /rod[ií]zio/i.test(a.nome + ' ' + a.grupo)
    const rows: { cod: string; nome: string; grupo: string; qtd: number; fat: number; consumo: Consumo | null }[] = []
    agg.forEach((a) => {
      fatTotal += a.fat
      const pid = prodByCod.get(a.cod); const f = pid ? explosao.fichaDoProduto(pid) : undefined
      const consumo = f ? explosao.porPorcao(f.id) : null
      const ok = !!consumo && consumo.size > 0
      if (ok) fatFicha += a.fat
      else if (a.fat > 0 && a.qtd > 0 && ehRod(a)) { rod.fat += a.fat; rod.qtd += a.qtd; rod.nomes.push(titleCase(a.nome)); rod.heads.push({ cod: a.cod, nome: a.nome, grupo: a.grupo, qtd: a.qtd, fat: a.fat }) }
      if (a.qtd > 0) rows.push({ ...a, consumo: ok ? consumo : null })
    })
    return { rows, fatTotal, fatFicha, rod }
  }, [vendas, lojaId, prodByCod, explosao, rodMapa])

  const custoCom = (c: Consumo, pr: (id: string) => number) => custoConsumo(c, insMap, pr)
  const pA = (id: string) => precoA(id).preco
  const pB = (id: string) => precoB(id).preco

  // ── impacto REAL (antes × agora) ──
  const real = useMemo(() => {
    const prods: ProdRow[] = []
    const vil = new Map<string, { v: number; n: number }>()
    for (const r of base.rows) {
      if (!r.consumo) continue
      if (cat && titleCase(r.grupo) !== cat) continue
      const cA = custoCom(r.consumo, pA), cB = custoCom(r.consumo, pB)
      const preco = r.qtd ? r.fat / r.qtd : 0
      prods.push({ ...r, preco, cA, cB, cmvA: preco > 0 ? cA / preco * 100 : 0, cmvB: preco > 0 ? cB / preco * 100 : 0, perda: (cB - cA) * r.qtd, sug: precoParaManter(cA, cB, preco) })
      r.consumo.forEach((q, id) => {
        const ins = insMap.get(id)
        const d = q * (custoUnitario(ins, pB(id)) - custoUnitario(ins, pA(id))) * r.qtd
        const o = vil.get(id) || { v: 0, n: 0 }; o.v += d; o.n++; vil.set(id, o)
      })
    }
    // rodízio: só entra sem filtro de categoria ou com categoria de rodízio
    const rodOk = base.rod.qtd > 0 && (!cat || /rod[ií]zio/i.test(cat))
    const itens0 = prods.filter((p) => p.fat <= 0)
    // linha sintética de rodízio: receita das CABEÇAS × custo dos ITENS a R$0 (por rodízio vendido)
    const mkRod = (cod: string, nome: string, cabecas: string, qtd: number, fatH: number, itens: ProdRow[]): ProdRow | null => {
      if (!(qtd > 0) || !itens.length) return null
      const consumo: Consumo = new Map()
      itens.forEach((p) => p.consumo?.forEach((q, id) => consumo.set(id, (consumo.get(id) || 0) + q * p.qtd / qtd)))
      const cA = itens.reduce((s, p) => s + p.cA * p.qtd, 0) / qtd, cB = itens.reduce((s, p) => s + p.cB * p.qtd, 0) / qtd
      const preco = fatH / qtd
      return { cod, nome, grupo: 'Rodízio', cabecas, qtd, fat: fatH, preco, consumo, cA, cB, cmvA: preco > 0 ? cA / preco * 100 : 0, cmvB: preco > 0 ? cB / preco * 100 : 0, perda: (cB - cA) * qtd, sug: precoParaManter(cA, cB, preco), itens: itens.map((p) => p.cod) }
    }
    let rodRow: ProdRow | null = null
    const rodRows: ProdRow[] = []
    if (rodOk && itens0.length) {
      rodRow = mkRod('__rodizio', 'Rodízios (todos)', 'Rodízio', base.rod.qtd, base.rod.fat, itens0)
      // um por tipo: cabeça ligada ao grupo de lançamento dos itens dela
      const gruposItens = [...new Set(itens0.map((p) => p.grupo))]
      const porGrupo = new Map<string, { qtd: number; fat: number; nomes: string[] }>()
      for (const h of base.rod.heads) {
        const cad = rodMapa.get(h.cod)   // cadastro manda; sem cadastro → sugestão pelo nome
        const g = (cad ? gruposItens.find((x) => normGrupo(x) === cad) : undefined) ?? ligarRodizio(h.nome, h.grupo, gruposItens) ?? '__outros'
        const o = porGrupo.get(g) || { qtd: 0, fat: 0, nomes: [] }; o.qtd += h.qtd; o.fat += h.fat; o.nomes.push(titleCase(h.nome)); porGrupo.set(g, o)
      }
      const semCabeca: ProdRow[] = []
      for (const g of gruposItens) {
        const its = itens0.filter((p) => p.grupo === g), h = porGrupo.get(g)
        if (!h) { semCabeca.push(...its); continue }
        const r = mkRod('__rod_' + g, 'Rodízio · ' + titleCase(g), h.nomes.join(', '), h.qtd, h.fat, its); if (r) rodRows.push(r)
      }
      const out = porGrupo.get('__outros')
      if (out && semCabeca.length) { const r = mkRod('__rod_outros', 'Rodízios (outros)', out.nomes.join(', '), out.qtd, out.fat, semCabeca); if (r) rodRows.push(r) }
    }
    const fat = prods.reduce((s, p) => s + p.fat, 0) + (rodRow ? rodRow.fat : 0)
    const cuA = prods.reduce((s, p) => s + p.cA * p.qtd, 0), cuB = prods.reduce((s, p) => s + p.cB * p.qtd, 0)
    const viloes = [...vil.entries()].map(([id, o]) => ({ id, ins: insMap.get(id), a: precoA(id), b: precoB(id), ...o })).filter((x) => Math.abs(x.v) >= 0.5).sort((x, y) => y.v - x.v)
    return { prods, rodRow, rodRows, viloes, fat, cuA, cuB, mA: fat > 0 ? (fat - cuA) / fat * 100 : 0, mB: fat > 0 ? (fat - cuB) / fat * 100 : 0 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, precoA, precoB, insMap, cat, rodMapa])
  const cats = useMemo(() => [...new Set(base.rows.filter((r) => r.consumo).map((r) => titleCase(r.grupo)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [base])

  const prodsView = useMemo(() => {
    const q = norm(busca.trim())
    const l = [...(real.rodRow ? [real.rodRow] : []), ...real.rodRows, ...real.prods].filter((p) => (!soComPreco || p.preco > 0) && (!q || norm(p.nome + ' ' + p.grupo + ' ' + p.cod).includes(q)))
    const k = ord.k
    return l.sort((x, y) => { const a = x[k] as number | string, b = y[k] as number | string; const r = typeof a === 'string' ? String(a).localeCompare(String(b)) : (a as number) - (b as number); return ord.desc ? -r : r })
  }, [real.prods, busca, ord, soComPreco])

  // ── simulador (parte dos preços do mês "agora") ──
  const pS = (id: string) => pB(id) * (1 + (sim[id] || 0) / 100)
  const simulado = useMemo(() => {
    const prods = real.prods.map((p) => { const cS = custoCom(p.consumo as Consumo, pS); return { ...p, cS, cmvS: p.preco > 0 ? cS / p.preco * 100 : 0, perdaS: (cS - p.cB) * p.qtd, sugS: precoParaManter(p.cB, cS, p.preco) } })
    const cuS = prods.reduce((s, p) => s + p.cS * p.qtd, 0)
    const lista = [...prods], byCod = new Map(prods.map((p) => [p.cod, p]))
    for (const r of [...(real.rodRow ? [real.rodRow] : []), ...real.rodRows]) {
      const cS = (r.itens || []).reduce((s, c) => { const p = byCod.get(c); return s + (p ? p.cS * p.qtd : 0) }, 0) / r.qtd
      lista.push({ ...r, cS, cmvS: r.preco > 0 ? cS / r.preco * 100 : 0, perdaS: (cS - r.cB) * r.qtd, sugS: precoParaManter(r.cB, cS, r.preco) })
    }
    return { prods: lista.filter((p) => Math.abs(p.perdaS) >= 0.5).sort((a, b) => b.perdaS - a.perdaS), cuS, mS: real.fat > 0 ? (real.fat - cuS) / real.fat * 100 : 0, viram: lista.filter((p) => p.preco > 0 && p.cmvS > 38 && p.cmvB <= 38) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [real, sim, precoB])
  // insumos usados nas vendas, por peso no custo do mês
  const usados = useMemo(() => {
    const peso = new Map<string, number>()
    for (const p of real.prods) p.consumo?.forEach((q, id) => peso.set(id, (peso.get(id) || 0) + q * custoUnitario(insMap.get(id), pB(id)) * p.qtd))
    return [...peso.entries()].map(([id, v]) => ({ id, ins: insMap.get(id), v })).filter((x) => x.ins && x.v > 0).sort((a, b) => b.v - a.v)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [real.prods, insMap, precoB])
  const catsTop = useMemo(() => { const m = new Map<string, number>(); usados.forEach((u) => { const c = u.ins?.categoria || ''; if (c) m.set(c, (m.get(c) || 0) + u.v) }); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c) }, [usados])
  const aplicar = (fn: (i: Insumo) => boolean, v: number) => setSim((s) => { const n = { ...s }; usados.forEach((u) => { if (u.ins && fn(u.ins)) n[u.id] = v }); return n })
  const usadosView = useMemo(() => { const q = norm(buscaSim.trim()); return usados.filter((u) => !q || norm(u.ins?.nome || '').includes(q) || norm(u.ins?.categoria || '').includes(q)) }, [usados, buscaSim])

  // ── EVOLUÇÃO (12 meses): mesmo mix vendido no período analisado, custeado com o preço de CADA mês
  //    → isola o efeito do preço. Mês sem compra suficiente (< 50% do custo com preço comprado no mês) = sem ponto.
  const evo = useMemo(() => {
    if (aba !== 'evo') return null
    const top = usados.slice(0, 5)
    const margem: (number | null)[] = [], precos: (number | null)[][] = top.map(() => [])
    for (const m of evoMeses) {
      const [i, f] = mesRange(m)
      const pr = precosPeriodo(entradas, i, f, fallback)
      let custo = 0, comCompra = 0
      for (const p of real.prods) p.consumo?.forEach((q, id) => {
        const x = pr(id), c = q * custoUnitario(insMap.get(id), x.preco) * p.qtd
        custo += c; if (x.fonte === 'compra') comCompra += c
      })
      margem.push(real.fat > 0 && custo > 0 && comCompra / custo >= 0.5 ? (real.fat - custo) / real.fat * 100 : null)
      top.forEach((t, k) => { const x = pr(t.id); precos[k].push(x.fonte === 'compra' ? x.preco : null) })
    }
    const indices = precos.map((vals) => { const b = vals.find((v) => v != null); return vals.map((v) => v != null && b ? v / b * 100 : null) })
    return { top, margem, precos, indices }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, evoMeses, entradas, fallback, real, usados, insMap])
  const mesCurto = (k: string) => rotuloPeriodo(k, true)

  const cobertura = base.fatTotal > 0 ? (base.fatFicha + base.rod.fat) / base.fatTotal * 100 : 0
  const topVil = real.viloes[0]
  const viraram = [...(real.rodRow ? [real.rodRow] : []), ...real.rodRows, ...real.prods].filter((p) => p.preco > 0 && p.cmvB > 38 && p.cmvA <= 38)
  const lojaNome = lojaId ? (lojas.find((l) => l.id === lojaId)?.nome || 'loja') : 'todas as lojas'
  const th = (k: keyof ProdRow, label: string, cls = '') => <th className={cls} onClick={() => setOrd((o) => ({ k, desc: o.k === k ? !o.desc : true }))}>{label}{ord.k === k ? (ord.desc ? ' ▾' : ' ▴') : ''}</th>

  const exportar = () => downloadCsv(`impacto_margem_${labA}_x_${labB}.csv`.replace(/[/ º–]/g, '-'), [
    ['Produto', 'Grupo', 'Código PDV', 'Vendidos', 'Preço médio', `Custo ${labA}`, `Custo ${labB}`, `CMV ${labA} %`, `CMV ${labB} %`, 'Perda R$', 'Preço p/ manter'],
    ...prodsView.map((p) => [titleCase(p.nome), titleCase(p.grupo), p.cod, +p.qtd.toFixed(2), +p.preco.toFixed(2), +p.cA.toFixed(4), +p.cB.toFixed(4), +p.cmvA.toFixed(2), +p.cmvB.toFixed(2), +p.perda.toFixed(2), +p.sug.toFixed(2)]),
  ])

  return (
    <div className="imp-screen">
      <div className="imp-filters">
        <div className="imp-fg"><label htmlFor="imp-modo">Comparar por</label>
          <select id="imp-modo" className="imp-field sm" value={modo} onChange={(e) => trocarModo(e.target.value as ModoPeriodo | 'pers')}>
            <option value="mes">Mês</option><option value="tri">Trimestre</option><option value="sem">Semestre</option><option value="ano">Ano</option><option value="pers">Personalizado</option>
          </select></div>
        <div className="imp-fg"><label htmlFor="imp-mesb">Período analisado</label>
          {modo === 'pers'
            ? <div className="imp-dates"><input type="date" className="imp-field" value={pers.bIni} onChange={(e) => setPers({ ...pers, bIni: e.target.value })} /><span>até</span><input type="date" className="imp-field" value={pers.bFim} onChange={(e) => setPers({ ...pers, bFim: e.target.value })} /></div>
            : <select id="imp-mesb" className="imp-field" value={keyB} onChange={(e) => { const v = e.target.value; setKeyB(v); const i = lista.indexOf(v); if (i >= 0 && lista[i + 1]) setKeyA(lista[i + 1]) }}>{lista.map((m) => <option key={m} value={m}>{rotuloPeriodo(m)}</option>)}</select>}</div>
        <div className="imp-fg"><label htmlFor="imp-mesa">Comparar com</label>
          {modo === 'pers'
            ? <div className="imp-dates"><input type="date" className="imp-field" value={pers.aIni} onChange={(e) => setPers({ ...pers, aIni: e.target.value })} /><span>até</span><input type="date" className="imp-field" value={pers.aFim} onChange={(e) => setPers({ ...pers, aFim: e.target.value })} /></div>
            : <select id="imp-mesa" className="imp-field" value={keyA} onChange={(e) => setKeyA(e.target.value)}>{lista.filter((m) => m < keyB).map((m) => <option key={m} value={m}>{rotuloPeriodo(m)}</option>)}</select>}</div>
        <div className="imp-fg"><label htmlFor="imp-cat">Categoria</label>
          <select id="imp-cat" className="imp-field" value={cat} onChange={(e) => { setCat(e.target.value); setAberto(null) }}><option value="">Todas</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
        <div className="imp-fg"><label>Loja</label><div className="imp-ro">{titleCase(lojaNome)} <span>(seletor do topo)</span></div></div>
        <div className="imp-cov" title={'Produtos com ficha ligada pelo código do PDV + rodízios (o custo vem dos itens lançados a R$ 0).' + (base.rod.nomes.length ? '\nRodízios reconhecidos: ' + base.rod.nomes.join(', ') : '')}>
          <span>Cobertura: <b>{pc(cobertura)}</b> do faturamento tem ficha</span>
          <span className="imp-covbar"><i style={{ width: Math.min(100, cobertura) + '%' }} /></span>
        </div>
        <button className="imp-btn" onClick={exportar} disabled={!prodsView.length}>↓ Exportar</button>
      </div>

      {loading ? <div className="imp-empty">Carregando compras, fichas e vendas…</div>
        : !base.rows.length ? <div className="imp-empty">Sem vendas processadas em {labB}{lojaId ? ' nesta loja' : ''}. Escolha outro período ou confira o Recebimento de Vendas.</div>
        : <>
          <div className="imp-kbar">
            <div className="it" title="Soma de TODOS os produtos vendidos no período (valor dos itens; não inclui taxa de serviço/entrega — por isso pode diferir do caixa)."><span className="k">Vendas em produtos</span><span className="v">{brl0(base.fatTotal)}</span></div>
            <div className="it" title="Parte das vendas em que dá pra calcular o custo: produtos com ficha + rodízios (custo vem dos itens a R$ 0). É sobre ela que a margem é calculada."><span className="k">Analisado ({pc(cobertura)})</span><span className="v">{brl0(real.fat)}</span></div>
            <div className="it"><span className="k">Margem bruta</span><span className="v">{pc(real.mA)} → {pc(real.mB)}</span></div>
            <div className="it"><span className="k">Variação</span><span className={'v ' + (real.mB < real.mA ? 'neg' : 'pos')}>{real.mB < real.mA ? '−' : '+'}{Math.abs(real.mA - real.mB).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.</span></div>
            <div className="it"><span className="k">{real.cuB >= real.cuA ? 'Margem perdida' : 'Margem ganha'}</span><span className={'v ' + (real.cuB > real.cuA ? 'neg' : 'pos')}>{brl0(Math.abs(real.cuB - real.cuA))}</span></div>
            <div className="it"><span className="k">Maior vilão</span><span className="v warn">{topVil ? titleCase(topVil.ins?.nome || '—') : '—'}</span>{topVil && topVil.a.preco > 0 && <VarPill v={(topVil.b.preco / topVil.a.preco - 1) * 100} />}</div>
            <div className="it"><span className="k">Viraram vermelho</span><span className={'v ' + (viraram.length ? 'neg' : '')}>{viraram.length}</span></div>
          </div>

          <div className="imp-tabs" role="tablist">
            <button role="tab" className={aba === 'vil' ? 'on' : ''} onClick={() => setAba('vil')}>Vilões da margem <span className="imp-cnt">{real.viloes.length}</span></button>
            <button role="tab" className={aba === 'prod' ? 'on' : ''} onClick={() => setAba('prod')}>Produtos afetados <span className="imp-cnt">{prodsView.length}</span></button>
            <button role="tab" className={aba === 'sim' ? 'on' : ''} onClick={() => setAba('sim')}>Simulador “e se…?”</button>
            <button role="tab" className={aba === 'evo' ? 'on' : ''} onClick={() => setAba('evo')}>Evolução (12 meses)</button>
          </div>

          {aba === 'vil' ? (
              <div className="imp-card">
                <h2>Vilões da margem <span className="hint">insumos que mais pesaram em R$</span></h2>
                <div className="imp-scroll">
                  <table className="imp-tbl">
                    <thead><tr><th>Insumo</th><th className="r">Antes ({labA})</th><th className="r">Agora ({labB})</th><th className="r">Var.</th><th className="r">Impacto</th><th /></tr></thead>
                    <tbody>
                      {real.viloes.length === 0 ? <tr><td colSpan={6} className="imp-empty">Nenhum insumo mudou de preço entre os dois meses.</td></tr>
                        : real.viloes.map((v) => {
                          const max = Math.abs(real.viloes[0].v) || 1
                          return <tr key={v.id}>
                            <td>{titleCase(v.ins?.nome || '—')} <span className="muted">· {v.n} prod.</span></td>
                            <td className="r">{brl(v.a.preco)}<Fonte p={v.a} /></td>
                            <td className="r">{brl(v.b.preco)}<Fonte p={v.b} /> <span className="muted">/{unLabel(v.ins)}</span></td>
                            <td className="r">{v.a.preco > 0 ? <VarPill v={(v.b.preco / v.a.preco - 1) * 100} /> : '—'}</td>
                            <td className={'r strong ' + (v.v > 0 ? 'neg' : 'pos')}>{v.v > 0 ? '−' : '+'} {brl0(Math.abs(v.v))}</td>
                            <td><div className="imp-bar"><i className={v.v < 0 ? 'pos' : ''} style={{ width: Math.min(100, Math.abs(v.v) / max * 100) + '%' }} /></div></td>
                          </tr>
                        })}
                    </tbody>
                  </table>
                </div>
                <div className="imp-note">Preço = <b>média ponderada das compras</b> de cada período na rede (NF-e e entradas manuais; transferências e ajustes não contam). <b>últ.</b> = sem compra no período, usa o último preço pago. O custo já desconta a perda na limpeza (rendimento do insumo).</div>
              </div>
          ) : aba === 'prod' ? (
              <div className="imp-card">
                <h2>Produtos afetados <label className="imp-tog" title="Itens de rodízio são vendidos a R$ 0 (o preço está no rodízio). Os totais de cima continuam contando o custo deles."><input type="checkbox" checked={soComPreco} onChange={(e) => setSoComPreco(e.target.checked)} />Só com preço de venda</label> <input className="imp-search" placeholder="Buscar produto…" value={busca} onChange={(e) => setBusca(e.target.value)} /></h2>
                <div className="imp-scroll tall">
                  <table className="imp-tbl">
                    <thead><tr>{th('nome', 'Produto')}{th('preco', 'Preço médio', 'r')}{th('cB', 'Custo antes → agora', 'r')}{th('cmvB', 'CMV antes → agora')}{th('qtd', 'Vendidos', 'r')}{th('perda', 'Perda R$', 'r')}{th('sug', 'Preço p/ manter', 'r')}</tr></thead>
                    <tbody>
                      {prodsView.length === 0 ? <tr><td colSpan={7} className="imp-empty">Nenhum produto com ficha no filtro.</td></tr>
                        : prodsView.slice(0, 400).map((p) => (
                          <Fragment key={p.cod}>
                            <tr className="clk" onClick={() => setAberto((a) => a === p.cod ? null : p.cod)}>
                              <td title={p.cabecas ? 'Rodízios lançados: ' + p.cabecas : undefined}>{aberto === p.cod ? '▾' : '▸'} {titleCase(p.nome)} <span className="muted">· {titleCase(p.grupo)}</span></td>
                              <td className="r">{p.preco > 0 ? brl(p.preco) : <span className="muted">R$ 0 (rodízio)</span>}</td>
                              <td className="r">{brl(p.cA)} → <b>{brl(p.cB)}</b></td>
                              <td>{p.preco > 0 ? <><Cmv v={p.cmvA} /> → <b><Cmv v={p.cmvB} /></b></> : <span className="muted">—</span>}</td>
                              <td className="r">{qtdFmt(p.qtd)}</td>
                              <td className={'r strong ' + (p.perda > 0 ? 'neg' : 'pos')}>{Math.abs(p.perda) < 0.5 ? <span className="muted">—</span> : <>{p.perda > 0 ? '−' : '+'} {brl0(Math.abs(p.perda))}</>}</td>
                              <td className="r">{p.sug > 0 && p.cB > p.cA ? brl(p.sug) : <span className="muted">—</span>}</td>
                            </tr>
                            {aberto === p.cod && p.consumo && (
                              <tr className="imp-detail"><td colSpan={7}>
                                <table className="imp-mini">
                                  <thead><tr><th>Insumo (já descido até o cru)</th><th className="r">Qtd/porção</th><th className="r">Custo antes</th><th className="r">Custo agora</th><th className="r">Diferença</th></tr></thead>
                                  <tbody>
                                    {[...p.consumo.entries()].map(([id, q]) => { const ins = insMap.get(id); return { id, ins, q, a: q * custoUnitario(ins, pA(id)), b: q * custoUnitario(ins, pB(id)) } })
                                      .sort((x, y) => (y.b - y.a) - (x.b - x.a)).map((l) => (
                                        <tr key={l.id}><td>{titleCase(l.ins?.nome || '(insumo removido)')}</td><td className="r">{discreto(l.ins) ? qtdFmt(l.q) + ' un' : qtdFmt(l.q) + ' g'}</td><td className="r">{brl(l.a)}</td><td className="r">{brl(l.b)}</td>
                                          <td className={'r ' + (l.b > l.a ? 'neg' : l.b < l.a ? 'pos' : 'muted')}>{l.b >= l.a ? '+' : '−'} {brl(Math.abs(l.b - l.a))}</td></tr>
                                      ))}
                                  </tbody>
                                </table>
                              </td></tr>
                            )}
                          </Fragment>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div className="imp-note">Mesmo volume vendido em {labB}, custeado com os preços dos dois períodos. Semáforo do CMV: <Cmv v={25} /> até 30% · <Cmv v={35} /> até 38% · <Cmv v={40} /> acima. “Preço p/ manter” = preço que devolve o CMV de antes.{prodsView.length > 400 ? ` Mostrando 400 de ${prodsView.length} (use a busca ou o Exportar).` : ''}</div>
              </div>
          ) : aba === 'evo' ? (
            <div className="imp-col">
              <div className="imp-card">
                <h2>Margem bruta com os preços de cada mês <span className="hint">mix vendido em {labB}{cat ? ' · ' + cat : ''} — só o efeito do preço</span></h2>
                <div className="imp-chart-pad">
                  {evo && <ImpLineChart labels={evoMeses.map(mesCurto)} series={[{ nome: 'Margem bruta', cor: SERIE_CORES[0], vals: evo.margem }]} fmtY={(v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'} />}
                </div>
                <div className="imp-note">Cada ponto = quanto seria a margem do que foi vendido em {labB} se os insumos custassem o preço médio daquele mês. Mês sem compras suficientes fica sem ponto.</div>
              </div>
              <div className="imp-card">
                <h2>Preço dos principais insumos <span className="hint">índice: 1º mês com compra = 100</span></h2>
                <div className="imp-chart-pad">
                  {evo && <ImpLineChart labels={evoMeses.map(mesCurto)} refY={100}
                    series={evo.top.map((t, k) => ({ nome: titleCase(t.ins?.nome || ''), cor: SERIE_CORES[k], vals: evo.indices[k], tip: (i: number) => { const v = evo.precos[k][i]; return v != null ? `${brl(v)}/${unLabel(t.ins)} (índice ${Math.round(evo.indices[k][i] || 0)})` : 'sem compra' } }))}
                    fmtY={(v) => Math.round(v).toString()} />}
                </div>
                <div className="imp-note">Os 5 insumos que mais pesam no custo do que foi vendido. Índice 120 = 20% mais caro que no primeiro mês com compra. Passe o mouse para ver o preço em R$.</div>
              </div>
            </div>
          ) : (
            <div className="imp-grid">
              <div className="imp-card">
                <h2>Cenário <span className="hint">parte dos preços de {labB}</span></h2>
                <div className="imp-chips">
                  {catsTop.map((c) => <button key={c} className="imp-chip" onClick={() => aplicar((i) => i.categoria === c, 10)}>{titleCase(c)} +10%</button>)}
                  {usados[0] && <button className="imp-chip" onClick={() => aplicar((i) => i.id === usados[0].id, 15)}>{titleCase(usados[0].ins?.nome || '')} +15%</button>}
                  <button className="imp-chip" onClick={() => aplicar(() => true, 5)}>Tudo +5%</button>
                  <button className="imp-chip reset" onClick={() => setSim({})}>Zerar cenário</button>
                  <input className="imp-search" placeholder="Buscar insumo…" value={buscaSim} onChange={(e) => setBuscaSim(e.target.value)} />
                </div>
                <div className="imp-scroll tall">
                  <table className="imp-tbl">
                    <thead><tr><th>Insumo</th><th className="r">Hoje</th><th className="r">Variação %</th><th className="r">Simulado</th></tr></thead>
                    <tbody>
                      {usadosView.slice(0, 300).map((u) => { const v = sim[u.id] || 0; return (
                        <tr key={u.id} className={v ? 'chg' : ''}>
                          <td>{titleCase(u.ins?.nome || '')} <span className="muted">· {titleCase(u.ins?.categoria || '')}</span></td>
                          <td className="r">{brl(pB(u.id))} <span className="muted">/{unLabel(u.ins)}</span></td>
                          <td className="r"><input className="imp-pct" type="number" step="1" id={'imp-sim-' + u.id} aria-label={'Variação % ' + (u.ins?.nome || '')} value={v || ''} placeholder="0"
                            onChange={(e) => { const n = parseFloat(e.target.value) || 0; setSim((s) => { const x = { ...s }; if (n) x[u.id] = n; else delete x[u.id]; return x }) }} /></td>
                          <td className="r">{brl(pS(u.id))}</td>
                        </tr>) })}
                    </tbody>
                  </table>
                </div>
                <div className="imp-note">Ordenado pelo peso do insumo no custo do que foi vendido.</div>
              </div>

              <div className="imp-col">
                <div className="imp-kbar">
                  <div className="it"><span className="k">Margem hoje → simulada</span><span className="v">{pc(real.mB)} → {pc(simulado.mS)}</span></div>
                  <div className="it"><span className="k">Variação</span><span className={'v ' + (simulado.mS < real.mB ? 'neg' : Object.keys(sim).length ? 'pos' : '')}>{Object.keys(sim).length ? (simulado.mS < real.mB ? '−' : '+') + Math.abs(real.mB - simulado.mS).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' p.p.' : '—'}</span></div>
                  <div className="it"><span className="k">Impacto no mês</span><span className={'v ' + (simulado.cuS > real.cuB ? 'neg' : '')}>{simulado.cuS >= real.cuB ? '−' : '+'}{brl0(Math.abs(simulado.cuS - real.cuB))}</span></div>
                  <div className="it"><span className="k">Passariam a vermelho</span><span className={'v ' + (simulado.viram.length ? 'neg' : '')}>{simulado.viram.length}</span></div>
                </div>
                <div className="imp-card">
                  <h2>Produtos no cenário <label className="imp-tog" title="Itens de rodízio são vendidos a R$ 0 (o preço está no rodízio). Os totais de cima continuam contando o custo deles."><input type="checkbox" checked={soComPreco} onChange={(e) => setSoComPreco(e.target.checked)} />Só com preço de venda</label><span className="hint">o que mais perde primeiro</span></h2>
                  <div className="imp-scroll tall">
                    <table className="imp-tbl">
                      <thead><tr><th>Produto</th><th className="r">Preço médio</th><th>CMV hoje → simulado</th><th className="r">Perda/mês</th><th className="r">Preço p/ manter</th></tr></thead>
                      <tbody>
                        {!Object.keys(sim).length ? <tr><td colSpan={5} className="imp-empty">Escolha um atalho ou digite a variação de um insumo.</td></tr>
                          : simulado.prods.length === 0 ? <tr><td colSpan={5} className="imp-empty">Nenhum produto vendido usa os insumos alterados.</td></tr>
                          : simulado.prods.filter((p) => !soComPreco || p.preco > 0).slice(0, 300).map((p) => (
                            <tr key={p.cod}>
                              <td>{titleCase(p.nome)} {p.preco > 0 && p.cmvS > 38 && p.cmvB <= 38 && <span className="imp-flag">● vira vermelho</span>}</td>
                              <td className="r">{p.preco > 0 ? brl(p.preco) : <span className="muted">R$ 0</span>}</td>
                              <td>{p.preco > 0 ? <><Cmv v={p.cmvB} /> → <b><Cmv v={p.cmvS} /></b></> : <span className="muted">—</span>}</td>
                              <td className={'r strong ' + (p.perdaS > 0 ? 'neg' : 'pos')}>{p.perdaS > 0 ? '−' : '+'} {brl0(Math.abs(p.perdaS))}</td>
                              <td className="r">{p.sugS > 0 && p.cS > p.cB ? brl(p.sugS) : <span className="muted">—</span>}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>}
    </div>
  )
}
