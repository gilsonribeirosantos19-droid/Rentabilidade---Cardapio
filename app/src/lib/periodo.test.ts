// Testes da pró-rata do ORÇAMENTO (mesesEquivalentes). É o número que diz "quanto de
// mês" o período representa — base do esperado/ritmo do DRE Orçamento. Se quebrar, o
// semáforo (no ritmo / estourou) mente. Nomes em PT de propósito (relatório legível).

import { describe, it, expect } from 'vitest'
import { mesesEquivalentes } from './periodo'

describe('mesesEquivalentes (pró-rata do período do orçamento)', () => {
  it('mês cheio (janeiro inteiro) = 1,0', () => {
    expect(mesesEquivalentes('2026-01-01', '2026-01-31')).toBeCloseTo(1, 6)
  })

  it('metade de um mês de 30 dias (1 a 15 de abril) ≈ 0,5', () => {
    // 15 dias dentro de 30 → 15/30 = 0,5
    expect(mesesEquivalentes('2026-04-01', '2026-04-15')).toBeCloseTo(15 / 30, 6)
  })

  it('um único dia = 1 dividido pelos dias do mês (1/31 em janeiro)', () => {
    expect(mesesEquivalentes('2026-01-10', '2026-01-10')).toBeCloseTo(1 / 31, 6)
  })

  it('soma mês a mês: janeiro inteiro + 10 dias de fevereiro = 1 + 10/28', () => {
    // 2026 não é bissexto → fevereiro tem 28 dias
    expect(mesesEquivalentes('2026-01-01', '2026-02-10')).toBeCloseTo(1 + 10 / 28, 6)
  })

  it('respeita fevereiro BISSEXTO (2024 tem 29 dias): mês cheio ainda é 1,0', () => {
    expect(mesesEquivalentes('2024-02-01', '2024-02-29')).toBeCloseTo(1, 6)
  })

  it('período de dois meses cheios (jan + fev) = 2,0', () => {
    expect(mesesEquivalentes('2026-01-01', '2026-02-28')).toBeCloseTo(2, 6)
  })

  it('atravessa a virada de ano (dez inteiro + jan inteiro) = 2,0', () => {
    expect(mesesEquivalentes('2025-12-01', '2026-01-31')).toBeCloseTo(2, 6)
  })

  it('datas vazias → 0 (nada a comparar)', () => {
    expect(mesesEquivalentes('', '2026-01-31')).toBe(0)
    expect(mesesEquivalentes('2026-01-01', '')).toBe(0)
  })

  it('fim antes do início → 0 (intervalo inválido)', () => {
    expect(mesesEquivalentes('2026-02-10', '2026-01-10')).toBe(0)
  })
})
