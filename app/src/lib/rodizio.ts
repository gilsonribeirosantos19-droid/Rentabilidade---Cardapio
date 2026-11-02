// Rodízio: a "cabeça" (ex.: "070 - Rodízio de Sushi", R$86,90, SEM ficha) recebe o custo de tudo
// que foi lançado nos ITENS do grupo de lançamento dela (itens a R$0, COM ficha), na mesma loja.
// Sem peso (regra do dono): custo por rodízio = custo dos itens do grupo ÷ quantidade de cabeças do grupo.
// Ligação: AUTOMÁTICA pelo nome (ligarRodizio) + correção no cadastro do Produto (tabela rodizio_grupos:
// cabeca_codigo → grupo; '' = "não é rodízio").
import { ligarRodizio } from './impactoMargem'

// grupo normalizado: maiúsculo, sem acento, sem espaço sobrando ("Rodízio de Sushis" = "RODIZIO DE SUSHIS")
export const normGrupo = (g?: string | null) => (g || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase().replace(/\s+/g, ' ')

// cabeça (código do PDV) → grupo dos itens (normalizado). '' = marcado como "não é rodízio".
export type RodMapa = Map<string, string>

export type LinhaRod = { lojaId: string; codigo: string; grupo: string; qVenda: number; vBruta: number; custoUnit: number; nome?: string }

// "rodízio" no nome — sem depender de acento (o PDV manda RODÍZIO, RODIZÍO, RODIZIO…)
export const ehRodNome = (s?: string | null) => /RODIZIO/.test(normGrupo(s))

// Mapa efetivo = cadastro (manda) + ligação automática pelo nome p/ cabeças sem cadastro:
// cabeça = vendida COM preço, SEM custo de ficha, com "rodízio" no nome/grupo.
export function mapaEfetivo(linhas: LinhaRod[], cadastro: RodMapa): RodMapa {
  const gruposItens = [...new Set(linhas.filter((l) => !(l.vBruta > 0) && l.custoUnit > 0).map((l) => normGrupo(l.grupo)).filter(Boolean))]
  const out: RodMapa = new Map()
  cadastro.forEach((g, cod) => out.set(cod, normGrupo(g)))
  for (const l of linhas) {
    const cod = String(l.codigo).trim()
    if (out.has(cod) || !(l.vBruta > 0) || l.custoUnit > 0) continue
    if (!ehRodNome((l.nome || '') + ' ' + l.grupo)) continue
    const g = ligarRodizio(l.nome || '', l.grupo, gruposItens)
    if (g) out.set(cod, g)
  }
  return out
}

// Devolve: custo médio por rodízio de cada cabeça (chave loja|código) e o conjunto de itens
// que já estão DENTRO de um rodízio (chave loja|código) — esses não devem somar CMV de novo.
export function ratearRodizio(linhas: LinhaRod[], mapa: RodMapa) {
  const custoCabeca = new Map<string, number>()
  const itensDoRodizio = new Set<string>()
  const m = new Map([...mapa.entries()].map(([k, v]) => [String(k).trim(), normGrupo(v)]))
  const grupos = new Set([...m.values()].filter(Boolean))
  const porLoja = new Map<string, LinhaRod[]>()
  for (const l of linhas) { const a = porLoja.get(l.lojaId) || []; a.push(l); porLoja.set(l.lojaId, a) }
  porLoja.forEach((ls, loja) => {
    for (const g of grupos) {
      const cabecas = ls.filter((l) => m.get(String(l.codigo).trim()) === g)
      const qCab = cabecas.reduce((s, l) => s + (l.qVenda || 0), 0)
      if (!(qCab > 0)) continue                                   // sem cabeça vendida → não dá p/ atribuir
      const itens = ls.filter((l) => normGrupo(l.grupo) === g && !(l.vBruta > 0) && !m.has(String(l.codigo).trim()))
      const custo = itens.reduce((s, l) => s + (l.custoUnit || 0) * (l.qVenda || 0), 0)
      cabecas.forEach((c) => custoCabeca.set(`${loja}|${c.codigo}`, custo / qCab))
      itens.forEach((i) => itensDoRodizio.add(`${loja}|${i.codigo}`))
    }
  })
  return { custoCabeca, itensDoRodizio }
}
