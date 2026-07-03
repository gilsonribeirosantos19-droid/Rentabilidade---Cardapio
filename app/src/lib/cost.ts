// Lógica de custo portada FIEL do utils.js (custoMedioNaData + custoDoInsumo).
// Reconstrói o custo médio histórico por média móvel ponderada até uma data.

export type Mov = { insumo_id: string; quantidade?: number; custo_unitario?: number; criado_em?: string; created_at?: string }
export type Saldo = { insumo_id: string; loja_id?: string | null; custo_medio?: number }
export type Vinculo = { insumo_id: string; preco_unitario?: number }
export type InsumoLike = { id: string; preco_compra?: number; unidade_medida?: string; unidade_compra?: string; rendimento_pct?: number }
export type FichaItem = { insumo_id: string; quantidade_g?: number }
export type CostCtx = { entradas?: Mov[]; saidas?: Mov[]; saldos?: Saldo[]; vinculos?: Vinculo[]; insumos?: InsumoLike[]; dataLimite?: string | null }

// Média móvel ponderada: novo custo médio ao ENTRAR `qEnt` unidades a `custoEnt`
// (mesma regra do custoMedioNaData/recalc do banco). Fonte única p/ Entradas manual e NF-e.
export function mediaPonderada(qAtual: number, cmAtual: number, qEnt: number, custoEnt: number): number {
  const qA = +(qAtual || 0), cmA = +(cmAtual || 0), qE = +(qEnt || 0), cE = +(custoEnt || 0)
  const qN = qA + qE
  return qN > 0 ? (qA * cmA + qE * cE) / qN : cE
}

export function custoMedioNaData(insumoId: string, dataLimite: string | null, ctx: CostCtx) {
  const lim = dataLimite ? (String(dataLimite).length === 10 ? dataLimite + 'T23:59:59' : dataLimite) : null
  const dt = (m: Mov) => m.criado_em || m.created_at || ''
  const movs: { d: string; ent: boolean; q: number; v: number }[] = []
  ;(ctx.entradas || []).forEach((e) => { if (e.insumo_id === insumoId && (!lim || dt(e) <= lim)) movs.push({ d: dt(e), ent: true, q: +(e.quantidade || 0), v: +(e.custo_unitario || 0) }) })
  ;(ctx.saidas || []).forEach((s) => { if (s.insumo_id === insumoId && (!lim || dt(s) <= lim)) movs.push({ d: dt(s), ent: false, q: +(s.quantidade || 0), v: 0 }) })
  movs.sort((a, b) => a.d < b.d ? -1 : (a.d > b.d ? 1 : 0))
  let q = 0, cm = 0
  movs.forEach((m) => {
    if (m.ent) {
      if (m.q === 0) { cm = m.v }                                  // ajuste de custo médio (redefine)
      else { const nq = q + m.q; cm = nq > 0 ? (q * cm + m.q * m.v) / nq : cm; q = nq }
    } else { q = Math.max(0, q - m.q) }
  })
  return { custo: cm, quantidade: q }
}

// custo de UMA porção da ficha (soma dos itens, respeitando unidade e rendimento do insumo)
export function custoFichaPorcao(itens: FichaItem[], rendimentoPorcoes: number, lojaId: string | null, ctx: CostCtx): number {
  const insumos = ctx.insumos || []
  let total = 0
  ;(itens || []).forEach((it) => {
    const ins = insumos.find((i) => i.id === it.insumo_id)
    const custoBase = custoDoInsumo(it.insumo_id, lojaId, ctx)
    const um = ins ? (ins.unidade_medida || ins.unidade_compra || 'g') : 'g'
    if (um === 'un' || um === 'pct' || um === 'cx') { total += custoBase * (+(it.quantidade_g || 0)) }
    else { const rend = (ins && +(ins.rendimento_pct || 0) > 0) ? (ins.rendimento_pct as number) / 100 : 1; total += (custoBase / rend / 1000) * (+(it.quantidade_g || 0)) }
  })
  const por = +rendimentoPorcoes > 0 ? +rendimentoPorcoes : 1
  return total / por
}

export function custoDoInsumo(insumoId: string, lojaId: string | null, ctx: CostCtx): number {
  if (ctx.dataLimite && (ctx.entradas || ctx.saidas)) {
    const r = custoMedioNaData(insumoId, ctx.dataLimite, ctx)
    if (r.custo > 0) return r.custo
  }
  const saldos = ctx.saldos || [], vinculos = ctx.vinculos || [], insumos = ctx.insumos || []
  const salLoja = lojaId && saldos.find((s) => s.insumo_id === insumoId && s.loja_id === lojaId && +(s.custo_medio || 0) > 0)
  if (salLoja) return +(salLoja.custo_medio || 0)
  const salAny = saldos.find((s) => s.insumo_id === insumoId && +(s.custo_medio || 0) > 0)
  if (salAny) return +(salAny.custo_medio || 0)
  const vin = vinculos.find((v) => v.insumo_id === insumoId && +(v.preco_unitario || 0) > 0)
  if (vin) return +(vin.preco_unitario || 0)
  const ins = insumos.find((i) => i.id === insumoId)
  return ins && +(ins.preco_compra || 0) > 0 ? +(ins.preco_compra || 0) : 0
}
