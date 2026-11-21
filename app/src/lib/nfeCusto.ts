// Custo REAL dos itens de uma NF-e de entrada (2026-11-21).
// Antes: custo = só o preço do produto (vUnCom). Ficava de fora o que vem destacado à parte na nota —
// ICMS-ST, FCP-ST, IPI, frete, seguro, outras despesas — e o desconto (que reduz). Ex. real: Coca-Cola comprada
// direto da Brasil Norte (CST 10): produtos R$ 2.314,91 + ST R$ 231,49 = nota R$ 2.546,40 → lata R$ 3,32 → R$ 3,65.
//
// Regra: fator da nota = TOTAL DA NOTA (o que se paga) ÷ SOMA DOS PRODUTOS. Cada item entra com custo × fator.
//  · fator 1 (imposto já embutido no preço, ex.: CST 60 de atacadista) → nada muda
//  · a soma do custo dos itens passa a bater com o total da nota (trava de conferência)
//  · fora de 0,5–1,6 = dado suspeito → NÃO aplica (mantém o custo de antes) e avisa
// Limitação: nota que MISTURA item com e sem ST espalha o imposto por todos os itens (total certo, divisão aproximada).

export type ItemNota = { quantidade?: number | null; valor_unitario?: number | null; valor_total?: number | null }
export type FatorNota = { fator: number; aplicado: boolean; motivo?: string; somaProdutos: number; totalNota: number }

export const FATOR_MIN = 0.5
export const FATOR_MAX = 1.6

const valorItem = (it: ItemNota) => {
  const vt = Number(it.valor_total) || 0
  return vt > 0 ? vt : (Number(it.quantidade) || 0) * (Number(it.valor_unitario) || 0)
}

export function fatorCustoNota(totalNota: number | null | undefined, itens: ItemNota[]): FatorNota {
  const somaProdutos = (itens || []).reduce((s, it) => s + valorItem(it), 0)
  const total = Number(totalNota) || 0
  const base = { somaProdutos, totalNota: total }
  if (!(somaProdutos > 0) || !(total > 0)) return { ...base, fator: 1, aplicado: false, motivo: 'sem total da nota ou sem valor nos itens' }
  const f = total / somaProdutos
  if (Math.abs(f - 1) < 0.0005) return { ...base, fator: 1, aplicado: false }   // imposto/frete já dentro do preço
  if (f < FATOR_MIN || f > FATOR_MAX) return { ...base, fator: 1, aplicado: false, motivo: `total da nota ÷ produtos = ${f.toFixed(3)} (fora de ${FATOR_MIN}–${FATOR_MAX}); custo mantido sem ajuste` }
  return { ...base, fator: f, aplicado: true }
}

// custo por unidade de ESTOQUE de um item: (preço do produto na nota × fator da nota) ÷ fator de conversão da embalagem
export const custoUnitarioReal = (valorUnitario: number | null | undefined, fatorNota: number, fatorConversao: number) =>
  +(((Number(valorUnitario) || 0) * (fatorNota || 1)) / (fatorConversao || 1)).toFixed(6)
