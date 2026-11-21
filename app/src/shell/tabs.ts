// Regras das abas do workspace (barra estilo navegador).
// Funções puras — testadas em tabs.test.ts.

export type Tab = { key: string; label: string }
export const HOME = '__home'

// Fecha as abas `keys`. Se a ativa for fechada, ativa a VIZINHA (a da direita; se não houver, a da esquerda),
// igual navegador — antes pulava pra última aba.
export function fecharAbas(tabs: Tab[], active: string, keys: string[]): { tabs: Tab[]; active: string } {
  const sai = new Set(keys)
  const novas = tabs.filter((t) => !sai.has(t.key))
  if (!sai.has(active)) return { tabs: novas, active }
  const i = tabs.findIndex((t) => t.key === active)
  const direita = tabs.slice(i + 1).find((t) => !sai.has(t.key))
  const esquerda = tabs.slice(0, Math.max(i, 0)).reverse().find((t) => !sai.has(t.key))
  return { tabs: novas, active: (direita ?? esquerda)?.key ?? HOME }
}

export const fecharOutras = (tabs: Tab[], key: string) => tabs.filter((t) => t.key !== key).map((t) => t.key)
export const fecharDireita = (tabs: Tab[], key: string) => tabs.slice(tabs.findIndex((t) => t.key === key) + 1).map((t) => t.key)

// Move a aba da posição `from` para ficar na posição `to` (índice no array final).
export function moverAba(tabs: Tab[], from: number, to: number): Tab[] {
  if (from === to || from < 0 || from >= tabs.length) return tabs
  const n = tabs.slice()
  const [t] = n.splice(from, 1)
  n.splice(Math.max(0, Math.min(to, n.length)), 0, t)
  return n
}
