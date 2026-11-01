// Alerta "preço fora do padrão" (Fiscal › Auditoria de Conversão) — função PURA, testável.
// Pega erro de conversão que o fator sozinho não denuncia (ex.: display de 24 entrando como
// 1 un a R$144; frasco de 0,5 L entrando como fardo de 6 L a R$0,42/L).
// Regra: o custo unitário da entrada é comparado com a MEDIANA das compras do MESMO insumo
// nos 90 dias ANTERIORES a ela (rede toda). Fora de [metade, dobro] = fora do padrão.
// Usa só o passado: o 1º lançamento errado já acende, antes de o erro virar "o normal".
import { TIPOS_NAO_COMPRA } from './impactoMargem'

export type EntPreco = { id: string; insumo_id: string; custo_unitario?: number | null; quantidade?: number | null; criado_em?: string | null; tipo?: string | null }
export type PrecoFora = { ref: number; ratio: number }

export const PF_JANELA_DIAS = 90
export const PF_MIN_AMOSTRAS = 3
export const PF_LIMITE = 2   // ×2 acima ou ÷2 abaixo

const ehCompra = (e: EntPreco) => +(e.quantidade || 0) > 0 && +(e.custo_unitario || 0) > 0 && !!e.criado_em && !TIPOS_NAO_COMPRA.has(e.tipo || '')

export function mediana(v: number[]): number {
  if (!v.length) return 0
  const s = [...v].sort((a, b) => a - b), m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// alvo = entradas a avaliar; historico = compras do insumo (pode incluir as próprias do alvo)
export function marcarPrecoFora(alvo: EntPreco[], historico: EntPreco[]): Map<string, PrecoFora> {
  const porIns = new Map<string, { t: number; c: number }[]>()
  for (const h of historico) {
    if (!ehCompra(h)) continue
    const a = porIns.get(h.insumo_id) || []; a.push({ t: Date.parse(h.criado_em as string), c: +(h.custo_unitario as number) }); porIns.set(h.insumo_id, a)
  }
  const out = new Map<string, PrecoFora>()
  const jan = PF_JANELA_DIAS * 86400000
  for (const e of alvo) {
    if (!ehCompra(e)) continue
    const t = Date.parse(e.criado_em as string), c = +(e.custo_unitario as number)
    const prev = (porIns.get(e.insumo_id) || []).filter((h) => h.t < t && h.t >= t - jan).map((h) => h.c)
    if (prev.length < PF_MIN_AMOSTRAS) continue
    const ref = mediana(prev)
    if (!(ref > 0)) continue
    const ratio = c / ref
    if (ratio > PF_LIMITE || ratio < 1 / PF_LIMITE) out.set(e.id, { ref, ratio })
  }
  return out
}
