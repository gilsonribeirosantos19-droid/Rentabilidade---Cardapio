// Matemática de PERÍODO do DRE (pró-rata do orçamento). Função pura, isolada da tela
// pra poder ser testada sem arrastar o React. Portada FIEL de dentro do DreOrcamento.

// Quantos "meses cheios" o período [de,ate] representa: soma, por mês tocado,
// (dias do mês dentro do intervalo ÷ dias totais do mês). Mês inteiro = 1; metade ≈ 0,5.
// Datas no formato 'YYYY-MM-DD'. de/ate vazios ou ate < de → 0.
export function mesesEquivalentes(de: string, ate: string): number {
  if (!de || !ate) return 0
  const d0 = new Date(de + 'T00:00:00'), d1 = new Date(ate + 'T00:00:00')
  if (d1 < d0) return 0
  let mult = 0, y = d0.getFullYear(), m = d0.getMonth()
  while (y < d1.getFullYear() || (y === d1.getFullYear() && m <= d1.getMonth())) {
    const diasNoMes = new Date(y, m + 1, 0).getDate()
    const ini = Math.max(d0.getTime(), new Date(y, m, 1).getTime())
    const fim = Math.min(d1.getTime(), new Date(y, m, diasNoMes).getTime())
    mult += (Math.floor((fim - ini) / 86400000) + 1) / diasNoMes
    m++; if (m > 11) { m = 0; y++ }
  }
  return mult
}
