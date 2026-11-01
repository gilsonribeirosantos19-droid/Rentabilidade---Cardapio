// Impacto do custo na margem — funções PURAS (testáveis) usadas pela tela Gestão › Impacto na Margem.
// Só LEITURA: não grava nada e não muda o custo médio/CMV do sistema.
//
// Ideia: o mesmo volume vendido, custeado com os preços de compra de DOIS períodos.
//   custo do produto = Σ (consumo por porção do insumo CRU × custo unitário do insumo)
//   impacto (R$)     = Σ qtd vendida × (custo agora − custo antes)

// entradas que NÃO são compra (não definem preço de fornecedor)
export const TIPOS_NAO_COMPRA = new Set(['ajuste', 'transferencia', 'producao', 'porcionamento', 'inventario'])

export type EntradaPreco = { insumo_id: string; quantidade?: number | null; custo_unitario?: number | null; criado_em?: string | null; tipo?: string | null }
export type FontePreco = 'compra' | 'ultima' | 'cadastro' | 'nenhum'
export type PrecoPer = { preco: number; fonte: FontePreco }

// data local (Brasil) de um timestamp → 'YYYY-MM-DD'
export const ymdLocal = (iso: string) => new Date(iso).toLocaleDateString('en-CA')

// Preço de cada insumo num período = MÉDIA PONDERADA das compras (Σ qtd×custo ÷ Σ qtd).
// Sem compra no período → último preço pago ANTES do fim do período ('ultima');
// sem histórico → fallback do cadastro/custo atual ('cadastro'); senão 0 ('nenhum').
export function precosPeriodo(entradas: EntradaPreco[], ini: string, fim: string, fallback: (insumoId: string) => number) {
  const acc = new Map<string, { q: number; v: number }>()
  const ult = new Map<string, { d: string; c: number }>()
  for (const e of entradas) {
    const q = +(e.quantidade || 0), c = +(e.custo_unitario || 0)
    if (!e.criado_em || q <= 0 || c <= 0 || TIPOS_NAO_COMPRA.has(e.tipo || '')) continue
    const d = ymdLocal(e.criado_em)
    if (d > fim) continue
    if (d >= ini) { const a = acc.get(e.insumo_id) || { q: 0, v: 0 }; a.q += q; a.v += q * c; acc.set(e.insumo_id, a) }
    const u = ult.get(e.insumo_id)
    if (!u || e.criado_em > u.d) ult.set(e.insumo_id, { d: e.criado_em, c })
  }
  const cache = new Map<string, PrecoPer>()
  return (insumoId: string): PrecoPer => {
    const hit = cache.get(insumoId); if (hit) return hit
    const a = acc.get(insumoId), u = ult.get(insumoId)
    let r: PrecoPer
    if (a && a.q > 0) r = { preco: a.v / a.q, fonte: 'compra' }
    else if (u) r = { preco: u.c, fonte: 'ultima' }
    else { const f = +(fallback(insumoId) || 0); r = f > 0 ? { preco: f, fonte: 'cadastro' } : { preco: 0, fonte: 'nenhum' } }
    cache.set(insumoId, r)
    return r
  }
}

export type InsumoUn = { id: string; unidade_medida?: string | null; unidade_compra?: string | null; rendimento_pct?: number | null }
// unidade discreta (un/pct/cx) → custo por unidade; peso/volume → preço por kg/L ÷ rendimento ÷ 1000 por g/ml
// (MESMA regra do custoFichaPorcao em cost.ts)
export function custoUnitario(ins: InsumoUn | undefined, preco: number): number {
  const um = (ins ? (ins.unidade_medida || ins.unidade_compra || 'g') : 'g').toLowerCase()
  if (um === 'un' || um === 'pct' || um === 'cx') return preco
  const rend = ins && +(ins.rendimento_pct || 0) > 0 ? +(ins.rendimento_pct as number) / 100 : 1
  return preco / rend / 1000
}

export type ItemX = { insumo_id?: string | null; produto_id?: string | null; quantidade_g?: number | null }
export type FichaX = { id: string; produto_id?: string | null; rendimento_porcoes?: number | null; insumo_vinculado_id?: string | null; rendimento_receita_g?: number | null; itens: ItemX[] }
export type Consumo = Map<string, number>   // insumo CRU → quantidade (g/ml líquidos ou unidades)

// "Explode" a ficha até o insumo CRU (igual ao CMV Teórico):
//  • item de PRODUTO (combo/meia porção) → porção do prato base × multiplicador
//  • insumo PROCESSADO (tem ficha com insumo_vinculado_id) → receita dele × (g usados ÷ rendimento_receita_g)
//  • insumo cru → soma direto
// Devolve o consumo de UMA porção. Ciclos são cortados (não trava).
export function criarExplosao(fichas: FichaX[]) {
  const byId = new Map(fichas.map((f) => [f.id, f]))
  const byProduto = new Map<string, FichaX>()
  const byVinc = new Map<string, FichaX>()
  for (const f of fichas) {
    if (f.produto_id && !byProduto.has(f.produto_id)) byProduto.set(f.produto_id, f)
    if (f.insumo_vinculado_id && +(f.rendimento_receita_g || 0) > 0) byVinc.set(f.insumo_vinculado_id, f)
  }
  const add = (dst: Consumo, src: Consumo, k: number) => { if (!k) return; src.forEach((q, id) => dst.set(id, (dst.get(id) || 0) + q * k)) }
  const memo = new Map<string, Consumo>()
  // receita INTEIRA (todas as porções) da ficha
  const receita = (fid: string, seen: Set<string>): Consumo => {
    const m = memo.get(fid); if (m) return m
    const out: Consumo = new Map()
    const f = byId.get(fid)
    if (!f || seen.has(fid)) return out
    const s2 = new Set(seen); s2.add(fid)
    for (const it of f.itens || []) {
      const q = +(it.quantidade_g || 0); if (!q) continue
      if (it.produto_id) {
        const base = byProduto.get(it.produto_id)
        if (base && !s2.has(base.id)) add(out, receita(base.id, s2), q / (+(base.rendimento_porcoes || 0) || 1))
        continue
      }
      if (!it.insumo_id) continue
      const proc = byVinc.get(it.insumo_id)
      if (proc && proc.id !== fid && !s2.has(proc.id)) { add(out, receita(proc.id, s2), q / +(proc.rendimento_receita_g as number)); continue }
      out.set(it.insumo_id, (out.get(it.insumo_id) || 0) + q)
    }
    if (seen.size === 0) memo.set(fid, out)   // só memoriza o cálculo "de topo" (sem corte de ciclo parcial)
    return out
  }
  return {
    fichaDoProduto: (produtoId: string) => byProduto.get(produtoId),
    porPorcao: (fid: string): Consumo => {
      const f = byId.get(fid); const r = receita(fid, new Set())
      const por = +(f?.rendimento_porcoes || 0) || 1
      const out: Consumo = new Map(); r.forEach((q, id) => out.set(id, q / por)); return out
    },
  }
}

// custo de um consumo com um "preço por insumo"
export function custoConsumo(c: Consumo, insMap: Map<string, InsumoUn>, preco: (insumoId: string) => number): number {
  let t = 0
  c.forEach((q, id) => { t += q * custoUnitario(insMap.get(id), preco(id)) })
  return t
}

// preço que devolve o CMV de antes: custo novo ÷ CMV antigo (0 se não dá pra calcular)
export function precoParaManter(custoAntes: number, custoAgora: number, precoVenda: number): number {
  if (!(custoAntes > 0) || !(precoVenda > 0)) return 0
  return custoAgora / (custoAntes / precoVenda)
}

// ── períodos de comparação (mês / trimestre / semestre / ano) ──
// chaves: mês 'YYYY-MM' · tri 'YYYY-T1..4' · sem 'YYYY-S1|2' · ano 'YYYY'
export type ModoPeriodo = 'mes' | 'tri' | 'sem' | 'ano'
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const pad2 = (n: number) => String(n).padStart(2, '0')
const ultimoDia = (y: number, m: number) => new Date(y, m, 0).getDate()   // m = 1..12

// lista do mais recente (o período corrente) para trás
export function listarPeriodos(modo: ModoPeriodo, hoje: Date = new Date()): string[] {
  const y = hoje.getFullYear(), m = hoje.getMonth() + 1
  if (modo === 'mes') return Array.from({ length: 13 }, (_, i) => { const d = new Date(y, m - 1 - i, 1); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}` })
  if (modo === 'tri') { const out: string[] = []; let yy = y, q = Math.ceil(m / 3); for (let i = 0; i < 8; i++) { out.push(`${yy}-T${q}`); q--; if (q < 1) { q = 4; yy-- } } return out }
  if (modo === 'sem') { const out: string[] = []; let yy = y, s = m <= 6 ? 1 : 2; for (let i = 0; i < 6; i++) { out.push(`${yy}-S${s}`); s--; if (s < 1) { s = 2; yy-- } } return out }
  return [String(y), String(y - 1), String(y - 2)]
}

export function intervaloPeriodo(key: string): [string, string] {
  const y = +key.slice(0, 4)
  let m1 = 1, m2 = 12
  if (/^\d{4}-\d{2}$/.test(key)) { m1 = m2 = +key.slice(5) }
  else if (/-T\d$/.test(key)) { const q = +key.slice(-1); m1 = (q - 1) * 3 + 1; m2 = q * 3 }
  else if (/-S\d$/.test(key)) { const s = +key.slice(-1); m1 = s === 1 ? 1 : 7; m2 = s === 1 ? 6 : 12 }
  return [`${y}-${pad2(m1)}-01`, `${y}-${pad2(m2)}-${pad2(ultimoDia(y, m2))}`]
}

export function rotuloPeriodo(key: string, curto = false): string {
  const y = +key.slice(0, 4), yy = String(y).slice(2)
  if (/^\d{4}-\d{2}$/.test(key)) {
    const m = +key.slice(5)
    if (curto) return `${MES_CURTO[m - 1]}/${yy}`
    const s = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })
    return `${s.charAt(0).toUpperCase() + s.slice(1)} de ${y}`
  }
  if (/-T\d$/.test(key)) { const q = +key.slice(-1); return curto ? `${q}º tri/${yy}` : `${q}º trimestre ${y} (${MES_CURTO[(q - 1) * 3]}–${MES_CURTO[q * 3 - 1]})` }
  if (/-S\d$/.test(key)) { const s = +key.slice(-1); return curto ? `${s}º sem/${yy}` : `${s}º semestre ${y} (${s === 1 ? 'jan–jun' : 'jul–dez'})` }
  return String(y)
}

// ── RODÍZIO: liga a "cabeça" (ex.: "Rodízio Sushi" R$86,90, sem ficha) ao GRUPO de lançamento
// dos itens dela (ex.: "Rodízio De Sushis", itens a R$0 com ficha) pelas palavras do nome.
// Ignora "rodízio", artigos e plural ("sushi" casa com "sushis"). Sem par → null ("outros").
const STOP_ROD = new Set(['rodizio', 'rodizios', 'de', 'do', 'da', 'dos', 'das', 'e', 'o', 'a', 'com', 'sem', 'r'])
export function tokensRodizio(s: string): string[] {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z]+/).filter((w) => w.length > 1 && !STOP_ROD.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
}
export function ligarRodizio(nomeCabeca: string, grupoCabeca: string, gruposItens: string[]): string | null {
  const tc = new Set([...tokensRodizio(nomeCabeca), ...tokensRodizio(grupoCabeca)])
  let melhor: string | null = null, pts = 0
  for (const g of gruposItens) {
    const n = tokensRodizio(g).filter((t) => tc.has(t)).length
    if (n > pts) { pts = n; melhor = g }
  }
  return melhor
}
