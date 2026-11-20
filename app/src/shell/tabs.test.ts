import { describe, it, expect } from 'vitest'
import { fecharAbas, fecharOutras, fecharDireita, moverAba, HOME } from './tabs'

const T = (...k: string[]) => k.map((key) => ({ key, label: key }))

describe('fecharAbas', () => {
  it('fechar aba inativa mantém a ativa', () => {
    const r = fecharAbas(T('a', 'b', 'c'), 'c', ['a'])
    expect(r.tabs.map((t) => t.key)).toEqual(['b', 'c'])
    expect(r.active).toBe('c')
  })
  it('fechar a ativa abre a vizinha da direita', () => {
    expect(fecharAbas(T('a', 'b', 'c'), 'b', ['b']).active).toBe('c')
  })
  it('fechar a ativa que é a última abre a da esquerda', () => {
    expect(fecharAbas(T('a', 'b', 'c'), 'c', ['c']).active).toBe('b')
  })
  it('fechar todas volta pra Visão geral', () => {
    const r = fecharAbas(T('a', 'b'), 'a', ['a', 'b'])
    expect(r.tabs).toEqual([])
    expect(r.active).toBe(HOME)
  })
  it('com a Visão geral ativa, fechar abas não muda a ativa', () => {
    expect(fecharAbas(T('a', 'b'), HOME, ['a']).active).toBe(HOME)
  })
  it('fechar as da direita com a ativa entre elas cai na que sobrou à esquerda', () => {
    const tabs = T('a', 'b', 'c', 'd')
    expect(fecharAbas(tabs, 'c', fecharDireita(tabs, 'b')).active).toBe('b')
  })
})

describe('fecharOutras / fecharDireita', () => {
  it('listam as keys certas', () => {
    const tabs = T('a', 'b', 'c', 'd')
    expect(fecharOutras(tabs, 'b')).toEqual(['a', 'c', 'd'])
    expect(fecharDireita(tabs, 'b')).toEqual(['c', 'd'])
    expect(fecharDireita(tabs, 'd')).toEqual([])
  })
})

describe('moverAba', () => {
  it('move pra frente e pra trás', () => {
    expect(moverAba(T('a', 'b', 'c', 'd'), 0, 2).map((t) => t.key)).toEqual(['b', 'c', 'a', 'd'])
    expect(moverAba(T('a', 'b', 'c', 'd'), 3, 0).map((t) => t.key)).toEqual(['d', 'a', 'b', 'c'])
  })
  it('índices inválidos não quebram', () => {
    const tabs = T('a', 'b')
    expect(moverAba(tabs, 5, 0)).toBe(tabs)
    expect(moverAba(tabs, 0, 99).map((t) => t.key)).toEqual(['b', 'a'])
  })
})
