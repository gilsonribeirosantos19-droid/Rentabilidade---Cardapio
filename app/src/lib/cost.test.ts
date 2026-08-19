// Testes do CORAÇÃO do sistema: custo médio, CMV e custo de ficha.
// Rodam a cada build/push. Se um número quebrar, o teste falha ANTES de ir pro cliente.
// Nomes em português de propósito: o relatório (verde ✓ / vermelho ✗) tem que ser legível.

import { describe, it, expect } from 'vitest'
import { mediaPonderada, custoMedioNaData, custoDoInsumo, custoFichaPorcao } from './cost'
import type { CostCtx } from './cost'

describe('mediaPonderada (média móvel ponderada do custo médio)', () => {
  it('estoque zerado → custo médio vira o custo da entrada', () => {
    // 0 no saldo, entra 10 a R$5 → custo médio = R$5
    expect(mediaPonderada(0, 0, 10, 5)).toBe(5)
  })

  it('mistura dois lotes pelo peso (10kg a R$8 + 10kg a R$12 = R$10)', () => {
    // (10*8 + 10*12) / 20 = 200/20 = 10
    expect(mediaPonderada(10, 8, 10, 12)).toBe(10)
  })

  it('mistura com pesos diferentes (30kg a R$10 + 10kg a R$20 = R$12,50)', () => {
    // (30*10 + 10*20) / 40 = 500/40 = 12,50
    expect(mediaPonderada(30, 10, 10, 20)).toBe(12.5)
  })

  it('saldo NEGATIVO não distorce o custo (clampa em 0 → só a entrada conta)', () => {
    // saldo -5 é tratado como 0: (0*8 + 10*12)/10 = 12
    expect(mediaPonderada(-5, 8, 10, 12)).toBe(12)
  })

  it('entrada de quantidade 0 mantém o custo médio atual', () => {
    expect(mediaPonderada(10, 10, 0, 0)).toBe(10)
  })
})

describe('custoMedioNaData (refaz o histórico até uma data)', () => {
  it('duas entradas: recalcula a média ponderada e soma a quantidade', () => {
    const ctx: CostCtx = {
      entradas: [
        { insumo_id: 'a', quantidade: 10, custo_unitario: 8, criado_em: '2026-01-01' },
        { insumo_id: 'a', quantidade: 10, custo_unitario: 12, criado_em: '2026-01-02' },
      ],
    }
    const r = custoMedioNaData('a', null, ctx)
    expect(r.custo).toBe(10)       // (10*8 + 10*12)/20
    expect(r.quantidade).toBe(20)
  })

  it('saída abate a quantidade mas NÃO mexe no custo médio', () => {
    const ctx: CostCtx = {
      entradas: [{ insumo_id: 'a', quantidade: 10, custo_unitario: 10, criado_em: '2026-01-01' }],
      saidas: [{ insumo_id: 'a', quantidade: 4, criado_em: '2026-01-02' }],
    }
    const r = custoMedioNaData('a', null, ctx)
    expect(r.custo).toBe(10)       // saída não altera custo
    expect(r.quantidade).toBe(6)   // 10 - 4
  })

  it('linha qtd 0 / custo 0 NÃO zera o custo médio válido (anti-zeragem)', () => {
    const ctx: CostCtx = {
      entradas: [
        { insumo_id: 'a', quantidade: 10, custo_unitario: 10, criado_em: '2026-01-01' },
        { insumo_id: 'a', quantidade: 0, custo_unitario: 0, criado_em: '2026-01-02' },
      ],
    }
    expect(custoMedioNaData('a', null, ctx).custo).toBe(10)
  })

  it('linha qtd 0 com custo informado REDEFINE o custo médio (ajuste de custo)', () => {
    const ctx: CostCtx = {
      entradas: [
        { insumo_id: 'a', quantidade: 10, custo_unitario: 10, criado_em: '2026-01-01' },
        { insumo_id: 'a', quantidade: 0, custo_unitario: 15, criado_em: '2026-01-02' },
      ],
    }
    expect(custoMedioNaData('a', null, ctx).custo).toBe(15)
  })

  it('respeita a data-limite (ignora movimento posterior)', () => {
    const ctx: CostCtx = {
      entradas: [
        { insumo_id: 'a', quantidade: 10, custo_unitario: 10, criado_em: '2026-01-01' },
        { insumo_id: 'a', quantidade: 10, custo_unitario: 20, criado_em: '2026-02-01' },
      ],
    }
    // até 15/01 só a 1ª entrada conta → custo 10
    expect(custoMedioNaData('a', '2026-01-15', ctx).custo).toBe(10)
  })
})

describe('custoDoInsumo (cadeia de fallback do custo)', () => {
  it('usa o saldo da LOJA quando existe', () => {
    const ctx: CostCtx = { saldos: [{ insumo_id: 'a', loja_id: 'L1', custo_medio: 9 }] }
    expect(custoDoInsumo('a', 'L1', ctx)).toBe(9)
  })

  it('sem saldo, cai no preço de compra do insumo', () => {
    const ctx: CostCtx = { insumos: [{ id: 'a', preco_compra: 7 }] }
    expect(custoDoInsumo('a', 'L1', ctx)).toBe(7)
  })

  it('modo padrão: aceita saldo de OUTRA loja e vínculo de fornecedor', () => {
    const ctx: CostCtx = {
      saldos: [{ insumo_id: 'a', loja_id: 'L2', custo_medio: 9 }],
      vinculos: [{ insumo_id: 'a', preco_unitario: 8 }],
      insumos: [{ id: 'a', preco_compra: 7 }],
    }
    expect(custoDoInsumo('a', 'L1', ctx)).toBe(9) // pega o saldo de qualquer loja
  })

  it('modo strictLoja (Ficha): IGNORA outra loja e vínculo → vai pro preço de compra', () => {
    const ctx: CostCtx = {
      saldos: [{ insumo_id: 'a', loja_id: 'L2', custo_medio: 9 }],
      vinculos: [{ insumo_id: 'a', preco_unitario: 8 }],
      insumos: [{ id: 'a', preco_compra: 7 }],
      strictLoja: true,
    }
    expect(custoDoInsumo('a', 'L1', ctx)).toBe(7)
  })
})

describe('custoFichaPorcao (custo de uma porção da ficha)', () => {
  it('insumo em kg com 100% de rendimento: 200g a R$10/kg = R$2,00', () => {
    const ctx: CostCtx = { insumos: [{ id: 'a', preco_compra: 10, unidade_medida: 'kg', rendimento_pct: 100 }] }
    const custo = custoFichaPorcao([{ insumo_id: 'a', quantidade_g: 200 }], 1, 'L1', ctx)
    expect(custo).toBeCloseTo(2.0, 4)
  })

  it('rendimento de 85% encarece o custo real (aproveitamento)', () => {
    const ctx: CostCtx = { insumos: [{ id: 'a', preco_compra: 10, unidade_medida: 'kg', rendimento_pct: 85 }] }
    // (10 / 0,85 / 1000) * 200 = 2000 / 850 = 2,3529
    const custo = custoFichaPorcao([{ insumo_id: 'a', quantidade_g: 200 }], 1, 'L1', ctx)
    expect(custo).toBeCloseTo(2.3529, 3)
  })

  it('insumo em unidade (un): quantidade multiplica direto (3 un a R$5 = R$15)', () => {
    const ctx: CostCtx = { insumos: [{ id: 'b', preco_compra: 5, unidade_medida: 'un' }] }
    const custo = custoFichaPorcao([{ insumo_id: 'b', quantidade_g: 3 }], 1, 'L1', ctx)
    expect(custo).toBeCloseTo(15, 4)
  })

  it('divide pelo rendimento em porções (custo total / nº de porções)', () => {
    const ctx: CostCtx = { insumos: [{ id: 'a', preco_compra: 10, unidade_medida: 'kg', rendimento_pct: 100 }] }
    // 200g a R$10/kg = R$2,00 total; 2 porções → R$1,00 por porção
    const custo = custoFichaPorcao([{ insumo_id: 'a', quantidade_g: 200 }], 2, 'L1', ctx)
    expect(custo).toBeCloseTo(1.0, 4)
  })
})

describe('CMV e markup (indicadores da ficha)', () => {
  // Fórmulas do sistema: CMV% = custo / preço; markup = preço / custo; margem% = (preço - custo) / preço
  const cmvPct = (custo: number, preco: number) => (custo / preco) * 100
  const markup = (custo: number, preco: number) => preco / custo
  const margemPct = (custo: number, preco: number) => ((preco - custo) / preco) * 100

  it('CMV%: custo R$9 num prato de R$30 = 30%', () => {
    expect(cmvPct(9, 30)).toBeCloseTo(30, 4)
  })

  it('markup: preço R$30 sobre custo R$10 = 3x', () => {
    expect(markup(10, 30)).toBeCloseTo(3, 4)
  })

  it('margem%: custo R$12 num prato de R$40 = 70%', () => {
    expect(margemPct(12, 40)).toBeCloseTo(70, 4)
  })
})
