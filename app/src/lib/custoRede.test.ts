// Custo da REDE (Rendimentos em "Todas as lojas") e custo ESTRITO por loja (Fechamento).
import { describe, it, expect } from 'vitest'
import { custoMedioRede, custoDoInsumo } from './cost'

const insumos = [{ id: 'sal', preco_compra: 60 }, { id: 'goch', preco_compra: 25 }, { id: 'novo', preco_compra: 0 }]

describe('custoMedioRede (média ponderada pelo estoque)', () => {
  it('pondera pelo estoque de cada loja', () => {
    // 300 kg a 62 + 50 kg a 70 → (18600 + 3500) / 350 = 63,14
    const saldos = [
      { insumo_id: 'sal', loja_id: 'PN', custo_medio: 62, quantidade: 300 },
      { insumo_id: 'sal', loja_id: 'CT', custo_medio: 70, quantidade: 50 },
    ]
    expect(custoMedioRede('sal', saldos, insumos)).toBeCloseTo(63.142857, 5)
  })
  it('ignora estoque zerado/negativo no peso; sem estoque positivo usa média simples dos custos', () => {
    const saldos = [
      { insumo_id: 'sal', loja_id: 'PN', custo_medio: 60, quantidade: 0 },
      { insumo_id: 'sal', loja_id: 'CT', custo_medio: 70, quantidade: -5 },
    ]
    expect(custoMedioRede('sal', saldos, insumos)).toBe(65)
  })
  it('loja sem custo não entra; sem nenhum custo cai no preço de compra; sem nada = 0', () => {
    const saldos = [{ insumo_id: 'goch', loja_id: 'PN', custo_medio: 0, quantidade: 10 }]
    expect(custoMedioRede('goch', saldos, insumos)).toBe(25)
    expect(custoMedioRede('novo', [], insumos)).toBe(0)
  })
})

describe('custoDoInsumo strictLoja (Fechamento) — nunca usa custo de outra loja', () => {
  const saldos = [{ insumo_id: 'goch', loja_id: 'PN', custo_medio: 30 }]
  it('loja SEM custo próprio cai no preço de compra (não pega os 30 da outra loja)', () => {
    expect(custoDoInsumo('goch', 'CT', { saldos, insumos, strictLoja: true })).toBe(25)
  })
  it('sem strictLoja (modo antigo) pegava o custo da outra loja', () => {
    expect(custoDoInsumo('goch', 'CT', { saldos, insumos })).toBe(30)
  })
  it('loja COM custo próprio usa o dela', () => {
    expect(custoDoInsumo('goch', 'PN', { saldos, insumos, strictLoja: true })).toBe(30)
  })
})
