// Relatório "Compras por Fornecedor" — função PURA, testável.
// Agrupa as entradas de estoque por fornecedor e, dentro dele, por insumo (o que compramos de cada um).
// Conta como compra: quantidade > 0 e tipo que não seja ajuste/transferência/produção (TIPOS_NAO_COMPRA).
// Compra a R$ 0 (bonificação) entra na quantidade, mas não no valor.
import { TIPOS_NAO_COMPRA } from './impactoMargem'

export type EntCompra = {
  id: string; insumo_id: string; quantidade?: number | null; custo_unitario?: number | null; custo_total?: number | null
  fornecedor_id?: string | null; fornecedor_nome?: string | null; nfe_numero?: string | null; tipo?: string | null; criado_em?: string | null
}
export type ItemCompra = { insumoId: string; qtd: number; valor: number; compras: number; precoMin: number; precoMax: number; ultima: string }
export type FornCompra = { key: string; fornecedorId: string | null; nome: string; valor: number; notas: number; itens: ItemCompra[]; ultima: string }

export const valorEnt = (e: EntCompra) => e.custo_total != null ? Number(e.custo_total) : Number(e.quantidade || 0) * Number(e.custo_unitario || 0)
export const ehCompraEnt = (e: EntCompra) => Number(e.quantidade || 0) > 0 && !TIPOS_NAO_COMPRA.has(e.tipo || '')

export function agruparComprasFornecedor(ents: EntCompra[], fornNome: Record<string, string>): FornCompra[] {
  const porForn = new Map<string, { f: FornCompra; notas: Set<string>; itens: Map<string, ItemCompra> }>()
  for (const e of ents) {
    if (!ehCompraEnt(e)) continue
    const nomeLanc = (e.fornecedor_nome || '').trim()
    const key = e.fornecedor_id || (nomeLanc ? 'nome:' + nomeLanc.toUpperCase() : 'sem')
    let g = porForn.get(key)
    if (!g) {
      const nome = (e.fornecedor_id && fornNome[e.fornecedor_id]) || nomeLanc || 'Sem fornecedor'
      g = { f: { key, fornecedorId: e.fornecedor_id || null, nome, valor: 0, notas: 0, itens: [], ultima: '' }, notas: new Set(), itens: new Map() }
      porForn.set(key, g)
    }
    const v = valorEnt(e), q = Number(e.quantidade || 0), dt = e.criado_em || ''
    const pu = q > 0 ? v / q : 0
    g.f.valor += v
    if (dt > g.f.ultima) g.f.ultima = dt
    g.notas.add(e.nfe_numero ? 'nf:' + e.nfe_numero : 'man:' + e.id)
    let it = g.itens.get(e.insumo_id)
    if (!it) { it = { insumoId: e.insumo_id, qtd: 0, valor: 0, compras: 0, precoMin: Infinity, precoMax: 0, ultima: '' }; g.itens.set(e.insumo_id, it) }
    it.qtd += q; it.valor += v; it.compras += 1
    if (pu < it.precoMin) it.precoMin = pu
    if (pu > it.precoMax) it.precoMax = pu
    if (dt > it.ultima) it.ultima = dt
  }
  return [...porForn.values()].map(({ f, notas, itens }) => ({
    ...f, notas: notas.size,
    itens: [...itens.values()].map((i) => ({ ...i, precoMin: i.precoMin === Infinity ? 0 : i.precoMin })).sort((a, b) => b.valor - a.valor),
  })).sort((a, b) => b.valor - a.valor)
}
