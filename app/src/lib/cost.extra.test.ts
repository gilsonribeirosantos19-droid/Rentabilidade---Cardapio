// Testes EXTRA do coração (cost.ts) — cenários mais fundos que os 21 originais, sem tocar neles.
// Foco: (1) custo médio histórico em sequências realistas (ordem, saída no meio, ajuste+entrada,
// clamp, isolamento entre insumos, data-limite com hora); (2) CMV teórico descendo processados/combos
// (recursão por produto_id + proteção de ciclo) — a "explosão" que é dor conhecida do sistema.
// Nomes em PT (relatório legível).

import { describe, it, expect } from 'vitest'
import { custoMedioNaData, custoFichaPorcao } from './cost'
import type { CostCtx, FichasByProduto } from './cost'

describe('custoMedioNaData — sequências realistas', () => {
  it('ordena por DATA antes de calcular (movimento fora de ordem no array)', () => {
    const ctx: CostCtx = {
      entradas: [
        { insumo_id: 'a', quantidade: 10, custo_unitario: 12, criado_em: '2026-01-02' }, // depois
        { insumo_id: 'a', quantidade: 10, custo_unitario: 8, criado_em: '2026-01-01' },  // antes
      ],
    }
    const r = custoMedioNaData('a', null, ctx)
    expect(r.custo).toBeCloseTo(10, 6)   // (10*8 + 10*12)/20, independente da ordem no array
    expect(r.quantidade).toBe(20)
  })

  it('saída no meio reduz o saldo e a entrada seguinte mistura sobre o que sobrou', () => {
    const ctx: CostCtx = {
      entradas: [
        { insumo_id: 'a', quantidade: 10, custo_unitario: 10, criado_em: '2026-01-01' },
        { insumo_id: 'a', quantidade: 6, custo_unitario: 20, criado_em: '2026-01-03' },
      ],
      saidas: [{ insumo_id: 'a', quantidade: 4, criado_em: '2026-01-02' }],
    }
    // após saída: q=6 a R$10; entra 6 a R$20 → (6*10 + 6*20)/12 = 15
    const r = custoMedioNaData('a', null, ctx)
    expect(r.custo).toBeCloseTo(15, 6)
    expect(r.quantidade).toBe(12)
  })

  it('ajuste de custo (qtd 0, custo>0) redefine e a entrada seguinte pesa sobre o saldo existente', () => {
    const ctx: CostCtx = {
      entradas: [
        { insumo_id: 'a', quantidade: 10, custo_unitario: 10, criado_em: '2026-01-01' },
        { insumo_id: 'a', quantidade: 0, custo_unitario: 15, criado_em: '2026-01-02' }, // redefine p/ 15
        { insumo_id: 'a', quantidade: 10, custo_unitario: 25, criado_em: '2026-01-03' },
      ],
    }
    // saldo 10 a R$15; entra 10 a R$25 → (10*15 + 10*25)/20 = 20
    const r = custoMedioNaData('a', null, ctx)
    expect(r.custo).toBeCloseTo(20, 6)
    expect(r.quantidade).toBe(20)
  })

  it('saída maior que o saldo clampa em 0 (não fica negativo); custo preservado', () => {
    const ctx: CostCtx = {
      entradas: [{ insumo_id: 'a', quantidade: 5, custo_unitario: 10, criado_em: '2026-01-01' }],
      saidas: [{ insumo_id: 'a', quantidade: 8, criado_em: '2026-01-02' }],
    }
    const r = custoMedioNaData('a', null, ctx)
    expect(r.quantidade).toBe(0)
    expect(r.custo).toBe(10)
  })

  it('isola por insumo (b não contamina o custo de a)', () => {
    const ctx: CostCtx = {
      entradas: [
        { insumo_id: 'a', quantidade: 10, custo_unitario: 10, criado_em: '2026-01-01' },
        { insumo_id: 'b', quantidade: 10, custo_unitario: 99, criado_em: '2026-01-01' },
      ],
    }
    expect(custoMedioNaData('a', null, ctx).custo).toBe(10)
  })

  it('data-limite com HORA respeita o horário (corta a entrada da tarde)', () => {
    const ctx: CostCtx = {
      entradas: [
        { insumo_id: 'a', quantidade: 10, custo_unitario: 10, criado_em: '2026-01-01T10:00:00' },
        { insumo_id: 'a', quantidade: 10, custo_unitario: 30, criado_em: '2026-01-01T14:00:00' },
      ],
    }
    // limite ao meio-dia → só a entrada das 10h conta
    expect(custoMedioNaData('a', '2026-01-01T12:00:00', ctx).custo).toBe(10)
  })
})

describe('custoFichaPorcao — CMV teórico descendo processados/combos', () => {
  // base: prato "P" = 200g do insumo a (R$10/kg, 100% rend) → R$2,00 a porção
  const ctx: CostCtx = { insumos: [
    { id: 'a', preco_compra: 10, unidade_medida: 'kg', rendimento_pct: 100 },
    { id: 'b', preco_compra: 5, unidade_medida: 'un' },
  ] }
  const fichasByProduto: FichasByProduto = new Map([
    ['P', { itens: [{ insumo_id: 'a', quantidade_g: 200 }], rendimento_porcoes: 1 }],
  ])

  it('combo desce no prato base (2× a porção do base = R$4,00)', () => {
    const custo = custoFichaPorcao([{ produto_id: 'P', quantidade_g: 2 }], 1, 'L1', ctx, fichasByProduto)
    expect(custo).toBeCloseTo(4, 6)
  })

  it('meia porção (multiplicador 0,5) = metade do custo do base (R$1,00)', () => {
    const custo = custoFichaPorcao([{ produto_id: 'P', quantidade_g: 0.5 }], 1, 'L1', ctx, fichasByProduto)
    expect(custo).toBeCloseTo(1, 6)
  })

  it('SEM o mapa de fichas, o item de produto é ignorado (não inventa custo)', () => {
    const custo = custoFichaPorcao([{ produto_id: 'P', quantidade_g: 2 }], 1, 'L1', ctx)
    expect(custo).toBe(0)
  })

  it('insumo direto + produto na mesma ficha SOMAM (R$5 do insumo b + R$2 do base = R$7)', () => {
    const itens = [{ insumo_id: 'b', quantidade_g: 1 }, { produto_id: 'P', quantidade_g: 1 }]
    const custo = custoFichaPorcao(itens, 1, 'L1', ctx, fichasByProduto)
    expect(custo).toBeCloseTo(7, 6)
  })

  it('proteção de CICLO: produto que referencia a si mesmo não trava (retorna sem loop)', () => {
    const ciclo: FichasByProduto = new Map([
      ['P', { itens: [{ produto_id: 'P', quantidade_g: 1 }], rendimento_porcoes: 1 }],
    ])
    const custo = custoFichaPorcao([{ produto_id: 'P', quantidade_g: 1 }], 1, 'L1', ctx, ciclo)
    expect(custo).toBe(0)   // não encontra insumo real na recursão; o importante é NÃO travar
  })
})
