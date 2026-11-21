// Custo real dos itens da NF-e (impostos destacados, frete e desconto entram no custo).
import { describe, it, expect } from 'vitest'
import { fatorCustoNota, custoUnitarioReal } from './nfeCusto'

describe('fatorCustoNota', () => {
  it('nota real da Coca (Brasil Norte, ST destacado): lata R$ 3,3182 → R$ 3,65', () => {
    const itens = [
      { quantidade: 480, valor_unitario: 3.1636, valor_total: 1518.55 },   // Coca sem açúcar
      { quantidade: 240, valor_unitario: 3.3182, valor_total: 796.36 },    // Coca-Cola lata
    ]
    const r = fatorCustoNota(2546.40, itens)
    expect(r.aplicado).toBe(true)
    expect(r.fator).toBeCloseTo(1.1, 3)
    expect(custoUnitarioReal(3.3182, r.fator, 1)).toBeCloseTo(3.65, 2)
    // TRAVA: soma do custo de todos os itens = total da nota
    const soma = itens.reduce((s, it) => s + custoUnitarioReal(it.valor_unitario, r.fator, 1) * it.quantidade, 0)
    expect(soma).toBeCloseTo(2546.40, 1)
  })
  it('imposto já embutido no preço (atacadista, CST 60): fator 1, nada muda', () => {
    const r = fatorCustoNota(466.80, [{ quantidade: 120, valor_unitario: 3.89, valor_total: 466.80 }])
    expect(r.aplicado).toBe(false)
    expect(r.fator).toBe(1)
  })
  it('desconto na nota reduz o custo', () => {
    const r = fatorCustoNota(950, [{ quantidade: 100, valor_unitario: 10, valor_total: 1000 }])
    expect(r.aplicado).toBe(true)
    expect(custoUnitarioReal(10, r.fator, 1)).toBeCloseTo(9.5, 6)
  })
  it('respeita o fator de conversão da embalagem (caixa com 12 → custo por unidade)', () => {
    expect(custoUnitarioReal(36, 1.1, 12)).toBeCloseTo(3.3, 6)
  })
  it('dado suspeito (fora de 0,5–1,6) NÃO aplica e avisa', () => {
    const r = fatorCustoNota(3000, [{ quantidade: 100, valor_unitario: 10, valor_total: 1000 }])
    expect(r.aplicado).toBe(false)
    expect(r.fator).toBe(1)
    expect(r.motivo).toMatch(/fora de/)
  })
  it('sem total da nota ou itens sem valor: não aplica', () => {
    expect(fatorCustoNota(0, [{ quantidade: 1, valor_unitario: 5 }]).aplicado).toBe(false)
    expect(fatorCustoNota(100, [{ quantidade: 1, valor_unitario: 0, valor_total: 0 }]).aplicado).toBe(false)
  })
  it('item sem valor_total usa quantidade × unitário', () => {
    const r = fatorCustoNota(110, [{ quantidade: 10, valor_unitario: 10, valor_total: null }])
    expect(r.fator).toBeCloseTo(1.1, 6)
  })
})
