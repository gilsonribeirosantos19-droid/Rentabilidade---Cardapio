// Lê o FATOR DE CONVERSÃO (quantos da unidade de estoque cabem em 1 embalagem)
// a partir do NOME da embalagem. Mesma lógica usada na entrada por NF-e (Monitor)
// e na entrada manual (Entradas), pra a conversão ser IDÊNTICA nos dois caminhos.
// Ex.: "CAIXA C/ 9 KG" -> 9 · "BISNAGA C/ 1,2 KG" -> 1,2 · termina em g/ml (ex.: "...400 g") -> 0,4
//      "CAIXA 20 X 0,900 ML" -> 18 · "PACOTE 50 UNI" -> 50 · sem número ("CAIXA") -> 1 · vazio -> null
export function calcFator(desc: string): number | null {
  const d = (desc || '').trim(); if (!d) return null
  const mult = d.replace(/,/g, '.').match(/(\d+\.?\d*)\s*[xX×]\s*(\d+\.?\d*)/)
  if (mult) return Math.round(parseFloat(mult[1]) * parseFloat(mult[2]) * 1000) / 1000
  const withU = d.match(/(\d+(?:[.,]\d+)?)\s*(ml|g)\s*$/i)
  if (withU) return Math.round(parseFloat(withU[1].replace(',', '.')) / 1000 * 1000) / 1000
  const nums = d.replace(/,/g, '.').match(/\d+\.?\d*/g)
  if (nums && nums.length) return parseFloat(nums[nums.length - 1])
  return 1
}
