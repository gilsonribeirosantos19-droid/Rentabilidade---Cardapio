// Testes do alerta "preço fora do padrão" (Auditoria de Conversão).
import { describe, it, expect } from 'vitest'
import { marcarPrecoFora, mediana } from './precoFora'

const ent = (id: string, dia: string, c: number, extra: Record<string, unknown> = {}) =>
  ({ id, insumo_id: 'kitkat', custo_unitario: c, quantidade: 24, criado_em: `${dia}T15:00:00Z`, tipo: 'nfe', ...extra })

describe('mediana', () => {
  it('ímpar e par', () => { expect(mediana([3, 1, 2])).toBe(2); expect(mediana([1, 2, 3, 10])).toBe(2.5); expect(mediana([])).toBe(0) })
})

describe('marcarPrecoFora', () => {
  const hist = [ent('a', '2026-08-20', 6), ent('b', '2026-08-25', 6.25), ent('c', '2026-09-01', 6), ent('d', '2026-09-02', 5.99)]
  it('Kit Kat a R$144 (display como 1 un) → fora do padrão', () => {
    const e = ent('x', '2026-09-09', 144, { quantidade: 1 })
    const r = marcarPrecoFora([e], [...hist, e]).get('x')
    expect(r).toBeDefined()
    expect(r!.ref).toBeCloseTo(6, 1)
    expect(r!.ratio).toBeGreaterThan(20)
  })
  it('vinagre a R$0,42 quando o normal é ~R$4,83 → fora (para baixo)', () => {
    const h = [1, 2, 3, 4].map((i) => ({ id: 'v' + i, insumo_id: 'vin', custo_unitario: 4.83, quantidade: 18, criado_em: `2026-08-1${i}T15:00:00Z`, tipo: 'nfe' }))
    const e = { id: 'y', insumo_id: 'vin', custo_unitario: 0.4167, quantidade: 720, criado_em: '2026-09-01T15:00:00Z', tipo: 'nfe' }
    expect(marcarPrecoFora([e], [...h, e]).get('y')?.ratio).toBeLessThan(0.5)
  })
  it('variação normal (+30%) NÃO acende', () => {
    const e = ent('z', '2026-09-10', 7.8)
    expect(marcarPrecoFora([e], [...hist, e]).has('z')).toBe(false)
  })
  it('sem histórico suficiente (menos de 3 compras antes) não julga', () => {
    const e = ent('w', '2026-09-10', 144)
    expect(marcarPrecoFora([e], [hist[0], hist[1], e]).has('w')).toBe(false)
  })
  it('transferência/ajuste não entram na referência nem são julgados', () => {
    const t = ent('t', '2026-09-10', 144, { tipo: 'transferencia' })
    const h2 = [...hist, ent('aj', '2026-09-05', 999, { tipo: 'ajuste' })]
    expect(marcarPrecoFora([t], [...h2, t]).has('t')).toBe(false)
    const e = ent('k', '2026-09-10', 6.1)
    expect(marcarPrecoFora([e], [...h2, e]).has('k')).toBe(false)
  })
  it('só olha os 90 dias ANTERIORES', () => {
    const velho = [ent('o1', '2026-01-01', 144), ent('o2', '2026-01-02', 144), ent('o3', '2026-01-03', 144)]
    const e = ent('n', '2026-09-10', 6)
    expect(marcarPrecoFora([e], [...velho, ...hist, e]).has('n')).toBe(false)
  })
})
