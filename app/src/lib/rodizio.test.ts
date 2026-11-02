// Testes do rateio de custo do rodízio (cabeça ← itens do grupo de lançamento).
import { describe, it, expect } from 'vitest'
import { ratearRodizio, type LinhaRod } from './rodizio'

const L = (lojaId: string, codigo: string, grupo: string, qVenda: number, vBruta: number, custoUnit = 0): LinhaRod => ({ lojaId, codigo, grupo, qVenda, vBruta, custoUnit })

describe('ratearRodizio', () => {
  const mapa = new Map([['3392', 'RODÍZIO DE SUSHIS'], ['3957', 'RODÍZIO DE SUSHIS'], ['4544', 'RODÍZIO DE SUSHIS'], ['9999', '']])
  const linhas = [
    L('A', '3392', 'RODIZIOS', 80, 80 * 86.9),          // Rodízio Sushi
    L('A', '3957', 'RODIZIOS', 10, 10 * 153.9),         // Dupla (sem peso: conta 1)
    L('A', '4544', 'RODIZIOS', 10, 10 * 59.9),          // Aniversário (variação, mesmo grupo)
    L('A', 'it1', 'Rodízio De Sushis', 500, 0, 4),      // itens R$0 com ficha
    L('A', 'it2', 'RODÍZIO DE SUSHIS', 300, 0, 2),
    L('A', 'x', 'TEMAKIS', 20, 20 * 35.9, 10),          // fora do rodízio
    L('B', 'it1', 'RODÍZIO DE SUSHIS', 50, 0, 4),        // loja B: item sem cabeça vendida
  ]
  const r = ratearRodizio(linhas, mapa)
  it('custo por rodízio = custo dos itens do grupo ÷ rodízios do grupo (sem peso)', () => {
    const esperado = (500 * 4 + 300 * 2) / 100
    expect(r.custoCabeca.get('A|3392')).toBeCloseTo(esperado, 9)
    expect(r.custoCabeca.get('A|3957')).toBeCloseTo(esperado, 9)
    expect(r.custoCabeca.get('A|4544')).toBeCloseTo(esperado, 9)
  })
  it('itens do grupo ficam marcados (não somam CMV de novo); item de fora não', () => {
    expect(r.itensDoRodizio.has('A|it1')).toBe(true)
    expect(r.itensDoRodizio.has('A|it2')).toBe(true)
    expect(r.itensDoRodizio.has('A|x')).toBe(false)
  })
  it('loja sem cabeça vendida → itens não são atribuídos', () => {
    expect(r.itensDoRodizio.has('B|it1')).toBe(false)
  })
  it('custo total se conserva (cabeças × custo = itens)', () => {
    const totCab = 80 * r.custoCabeca.get('A|3392')! + 10 * r.custoCabeca.get('A|3957')! + 10 * r.custoCabeca.get('A|4544')!
    expect(totCab).toBeCloseTo(500 * 4 + 300 * 2, 6)
  })
})

import { mapaEfetivo } from './rodizio'
describe('mapaEfetivo (automático pelo nome + cadastro manda)', () => {
  const linhas = [
    L('A', '3392', 'RODIZIOS', 80, 6952, 0), L('A', '4544', 'RODIZIOS', 10, 599, 0),
    L('A', '3364', 'RODIZIOS', 3, 260, 0),                      // voucher
    L('A', 'it1', 'RODÍZIO DE SUSHIS', 500, 0, 4), L('A', 'm1', 'RODÍZIO MIX', 50, 0, 3),
    L('A', '2017', 'RODIZIOS', 9, 1034, 0),
  ].map((l, i) => ({ ...l, nome: ['070 - Rodízio de Sushi', '070 - Rodízio de Sushi - Aniversário', 'Voucher Rodízio de Sushi', 'x', 'y', '072 - Rodízio Mix'][i] }))
  it('liga sozinho pelo nome (variações no mesmo grupo)', () => {
    const m = mapaEfetivo(linhas, new Map())
    expect(m.get('3392')).toBe('RODIZIO DE SUSHIS')
    expect(m.get('4544')).toBe('RODIZIO DE SUSHIS')
    expect(m.get('2017')).toBe('RODIZIO MIX')
  })
  it('cadastro "não é rodízio" (\'\') vence o automático', () => {
    const m = mapaEfetivo(linhas, new Map([['3364', '']]))
    expect(m.get('3364')).toBe('')
    expect(ratearRodizio(linhas, m).custoCabeca.has('A|3364')).toBe(false)
  })
})

import { ehRodNome } from './rodizio'
describe('ehRodNome (sem depender de acento)', () => {
  it('reconhece RODÍZIO, RODIZÍO, RODIZIO e minúsculo', () => {
    for (const s of ['070 - Rodízio de Sushi', '075 - RODIZÍO FESTIVAL', 'RODIZIO PREMIUM', 'rodizio infantil', 'Rodízios']) expect(ehRodNome(s)).toBe(true)
  })
  it('não marca o que não é rodízio', () => {
    for (const s of ['Hot Philadelphia', '', null, 'Combinado de Outubro']) expect(ehRodNome(s)).toBe(false)
  })
})
