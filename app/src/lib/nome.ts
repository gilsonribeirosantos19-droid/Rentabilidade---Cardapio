// Fonte única de comparação de NOMES (busca e anti-duplicidade).
// Mesma regra da função do banco public.norm_nome_insumo (sql_avulso/insumos_nome_unico.sql):
// minúsculas, sem acento, sem espaço nas pontas, espaços repetidos viram um só.
// "  Kani " = "kani" = "KANÍ" → o mesmo item.

export const normNome = (s?: string | null): string =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')

// Busca tolerante: TODAS as palavras digitadas precisam aparecer no texto, em qualquer ordem.
// "salmao file" acha "Filé de Salmão"; espaço a mais ou acento não atrapalham.
// Nunca acha MENOS que a busca antiga por trecho contínuo (só mais).
export function matchBusca(texto: string | null | undefined, q: string | null | undefined): boolean {
  const termos = normNome(q).split(' ').filter(Boolean)
  if (!termos.length) return true
  const alvo = normNome(texto)
  return termos.every((t) => alvo.includes(t))
}

// Procura, numa lista, outro item ATIVO com o mesmo nome normalizado (ignora o próprio id).
export function acharDuplicado<T extends { id: string; nome?: string | null; ativo?: boolean | null }>(
  lista: T[], nome: string, idProprio?: string | null,
): T | undefined {
  const alvo = normNome(nome)
  if (!alvo) return undefined
  return lista.find((x) => x.id !== idProprio && x.ativo !== false && normNome(x.nome) === alvo)
}
