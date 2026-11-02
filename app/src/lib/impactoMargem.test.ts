// Testes do relatório Impacto do Custo na Margem (Gestão).
import { describe, it, expect } from 'vitest'
import { precosPeriodo, custoUnitario, criarExplosao, custoConsumo, precoParaManter, type FichaX, type InsumoUn } from './impactoMargem'

const dia = (d: string) => `${d}T15:00:00-04:00`   // meio da tarde (não vira o dia em nenhum fuso BR)

describe('precosPeriodo (preço do insumo no período)', () => {
  const ent = [
    { insumo_id: 'salmao', quantidade: 200, custo_unitario: 72, criado_em: dia('2026-10-05'), tipo: 'nfe' },
    { insumo_id: 'salmao', quantidade: 20, custo_unitario: 85, criado_em: dia('2026-10-20'), tipo: 'manual' },
    { insumo_id: 'salmao', quantidade: 100, custo_unitario: 61, criado_em: dia('2026-09-10'), tipo: 'nfe' },
    { insumo_id: 'salmao', quantidade: 50, custo_unitario: 40, criado_em: dia('2026-10-08'), tipo: 'transferencia' },
    { insumo_id: 'nori', quantidade: 5, custo_unitario: 210, criado_em: dia('2026-08-15'), tipo: 'nfe' },
  ]
  it('média PONDERADA pela quantidade (200kg a 72 + 20kg a 85 = 73,18)', () => {
    const p = precosPeriodo(ent, '2026-10-01', '2026-10-31', () => 0)('salmao')
    expect(p.fonte).toBe('compra')
    expect(p.preco).toBeCloseTo((200 * 72 + 20 * 85) / 220, 6)
  })
  it('transferência NÃO entra como preço de compra', () => {
    const p = precosPeriodo(ent, '2026-10-01', '2026-10-31', () => 0)('salmao')
    expect(p.preco).toBeGreaterThan(70)
  })
  it('sem compra no período → último preço pago antes', () => {
    const p = precosPeriodo(ent, '2026-10-01', '2026-10-31', () => 0)('nori')
    expect(p).toEqual({ preco: 210, fonte: 'ultima' })
  })
  it('compra DEPOIS do período não vale', () => {
    const p = precosPeriodo(ent, '2026-09-01', '2026-09-30', () => 0)('salmao')
    expect(p).toEqual({ preco: 61, fonte: 'compra' })
  })
  it('sem histórico → cadastro; sem nada → 0', () => {
    expect(precosPeriodo([], '2026-10-01', '2026-10-31', () => 9.5)('x')).toEqual({ preco: 9.5, fonte: 'cadastro' })
    expect(precosPeriodo([], '2026-10-01', '2026-10-31', () => 0)('x')).toEqual({ preco: 0, fonte: 'nenhum' })
  })
})

describe('custoUnitario (mesma regra da ficha)', () => {
  it('peso: R$/kg ÷ rendimento ÷ 1000 por grama', () => {
    expect(custoUnitario({ id: 's', unidade_medida: 'kg', rendimento_pct: 62 }, 61)).toBeCloseTo(61 / 0.62 / 1000, 9)
  })
  it('unidade: preço cheio por unidade, sem rendimento', () => {
    expect(custoUnitario({ id: 'h', unidade_medida: 'un', rendimento_pct: 50 }, 2)).toBe(2)
  })
})

describe('criarExplosao (desce até o insumo cru)', () => {
  const fichas: FichaX[] = [
    // processado: shari = 1000 g arroz + 100 g vinagre → rende 1500 g
    { id: 'f-shari', insumo_vinculado_id: 'shari', rendimento_receita_g: 1500, rendimento_porcoes: 1, itens: [{ insumo_id: 'arroz', quantidade_g: 1000 }, { insumo_id: 'vinagre', quantidade_g: 100 }] },
    // temaki: 70 g salmão + 150 g shari
    { id: 'f-temaki', produto_id: 'p-temaki', rendimento_porcoes: 1, itens: [{ insumo_id: 'salmao', quantidade_g: 70 }, { insumo_id: 'shari', quantidade_g: 150 }] },
    // combo: 2 temakis
    { id: 'f-combo', produto_id: 'p-combo', rendimento_porcoes: 1, itens: [{ produto_id: 'p-temaki', quantidade_g: 2 }] },
    // receita que rende 4 porções
    { id: 'f-4', produto_id: 'p-4', rendimento_porcoes: 4, itens: [{ insumo_id: 'salmao', quantidade_g: 400 }] },
    // ciclo (dado errado) não pode travar
    { id: 'f-a', produto_id: 'p-a', itens: [{ produto_id: 'p-b', quantidade_g: 1 }, { insumo_id: 'salmao', quantidade_g: 10 }] },
    { id: 'f-b', produto_id: 'p-b', itens: [{ produto_id: 'p-a', quantidade_g: 1 }] },
  ]
  const ex = criarExplosao(fichas)
  it('processado abre a receita dele (150 g de shari = 100 g arroz + 10 g vinagre)', () => {
    const c = ex.porPorcao('f-temaki')
    expect(c.get('salmao')).toBe(70)
    expect(c.get('arroz')).toBeCloseTo(100, 9)
    expect(c.get('vinagre')).toBeCloseTo(10, 9)
    expect(c.has('shari')).toBe(false)
  })
  it('combo desce no prato base × multiplicador', () => {
    const c = ex.porPorcao('f-combo')
    expect(c.get('salmao')).toBe(140)
    expect(c.get('arroz')).toBeCloseTo(200, 9)
  })
  it('divide pelo rendimento em porções', () => {
    expect(ex.porPorcao('f-4').get('salmao')).toBe(100)
  })
  it('ciclo é cortado sem travar', () => {
    expect(ex.porPorcao('f-a').get('salmao')).toBe(10)
  })
})

describe('impacto no produto', () => {
  const ins = new Map<string, InsumoUn>([['salmao', { id: 'salmao', unidade_medida: 'kg', rendimento_pct: 62 }]])
  const consumo = new Map([['salmao', 180]])
  const antes = custoConsumo(consumo, ins, () => 61)
  const agora = custoConsumo(consumo, ins, () => 73.9)
  it('custo do salmão no combo: 180 g a R$61/kg com 62% de rendimento = R$17,71', () => {
    expect(antes).toBeCloseTo(17.71, 2)
    expect(agora).toBeCloseTo(21.45, 2)
  })
  it('preço para manter o CMV de antes', () => {
    const p = precoParaManter(antes, agora, 89.9)
    expect(agora / p).toBeCloseTo(antes / 89.9, 9)
    expect(precoParaManter(0, 10, 50)).toBe(0)
  })
})

import { listarPeriodos, intervaloPeriodo, rotuloPeriodo } from './impactoMargem'
describe('períodos (mês/tri/sem/ano)', () => {
  const hoje = new Date(2026, 10, 1)   // 01/11/2026
  it('lista do mais recente para trás', () => {
    expect(listarPeriodos('mes', hoje).slice(0, 3)).toEqual(['2026-11', '2026-10', '2026-09'])
    expect(listarPeriodos('tri', hoje).slice(0, 4)).toEqual(['2026-T4', '2026-T3', '2026-T2', '2026-T1'])
    expect(listarPeriodos('tri', hoje)[4]).toBe('2025-T4')
    expect(listarPeriodos('sem', hoje).slice(0, 3)).toEqual(['2026-S2', '2026-S1', '2025-S2'])
    expect(listarPeriodos('ano', hoje)).toEqual(['2026', '2025', '2024'])
  })
  it('intervalo de datas de cada período', () => {
    expect(intervaloPeriodo('2026-02')).toEqual(['2026-02-01', '2026-02-28'])
    expect(intervaloPeriodo('2026-T3')).toEqual(['2026-07-01', '2026-09-30'])
    expect(intervaloPeriodo('2026-S1')).toEqual(['2026-01-01', '2026-06-30'])
    expect(intervaloPeriodo('2025')).toEqual(['2025-01-01', '2025-12-31'])
  })
  it('rótulos', () => {
    expect(rotuloPeriodo('2026-10', true)).toBe('out/26')
    expect(rotuloPeriodo('2026-T3')).toBe('3º trimestre 2026 (jul–set)')
    expect(rotuloPeriodo('2026-S2', true)).toBe('2º sem/26')
  })
})

import { ligarRodizio } from './impactoMargem'
describe('ligarRodizio (cabeça → grupo dos itens)', () => {
  const grupos = ['Rodízio De Sushis', 'Rodízio Festival', 'Rodízio Premium']
  it('Rodízio Sushi → Rodízio De Sushis (plural/artigo ignorados)', () => { expect(ligarRodizio('Rodízio Sushi', 'Rodízios', grupos)).toBe('Rodízio De Sushis') })
  it('Festival e Premium', () => {
    expect(ligarRodizio('RODIZIO FESTIVAL 99,90', '', grupos)).toBe('Rodízio Festival')
    expect(ligarRodizio('Rodizio Premium', 'Rodizio', grupos)).toBe('Rodízio Premium')
  })
  it('Rodízio Dupla → itens do Rodízio Sushi (apelido)', () => { expect(ligarRodizio('077 - Rodizio Dupla', '', grupos)).toBe('Rodízio De Sushis') })
  it('Rodízio Em Casa → grupo Rodízio Em Casa ("em" ignorado, casa pelo "casa")', () => { expect(ligarRodizio('071 - Rodízio Em Casa', '', [...grupos, 'RODÍZIO EM CASA'])).toBe('RODÍZIO EM CASA') })
  it('sem palavra em comum → null', () => { expect(ligarRodizio('Rodízio Kids', '', grupos)).toBeNull() })
})

describe('criarExplosao — produto com 2 fichas', () => {
  it('usa a ficha ATIVA, mesmo vindo depois do rascunho', () => {
    const ex = criarExplosao([
      { id: 'r', produto_id: 'P', status: 'rascunho', rendimento_porcoes: 1, itens: [{ insumo_id: 'X', quantidade_g: 999 }] },
      { id: 'a', produto_id: 'P', status: 'ativa', rendimento_porcoes: 1, itens: [{ insumo_id: 'X', quantidade_g: 10 }] },
    ])
    expect(ex.fichaDoProduto('P')?.id).toBe('a')
  })
})
