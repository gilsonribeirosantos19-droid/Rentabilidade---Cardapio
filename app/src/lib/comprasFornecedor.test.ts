import { describe, it, expect } from 'vitest'
import { agruparComprasFornecedor } from './comprasFornecedor'

describe('agruparComprasFornecedor', () => {
  const ents = [
    { id: '1', insumo_id: 'sal', quantidade: 10, custo_unitario: 70, fornecedor_id: 'f1', nfe_numero: '100/1', tipo: 'nfe', criado_em: '2026-10-01T12:00:00Z' },
    { id: '2', insumo_id: 'sal', quantidade: 5, custo_unitario: 80, fornecedor_id: 'f1', nfe_numero: '101/1', tipo: 'nfe', criado_em: '2026-10-05T12:00:00Z' },
    { id: '3', insumo_id: 'arroz', quantidade: 20, custo_unitario: 5, fornecedor_id: 'f1', nfe_numero: '101/1', tipo: 'nfe', criado_em: '2026-10-05T12:00:00Z' },
    { id: '4', insumo_id: 'gas', quantidade: 1, custo_total: 120, fornecedor_nome: 'Fogás', tipo: 'manual', criado_em: '2026-10-03T12:00:00Z' },
    { id: '5', insumo_id: 'sal', quantidade: 3, custo_unitario: 70, fornecedor_id: 'f1', tipo: 'transferencia', criado_em: '2026-10-06T12:00:00Z' },
    { id: '6', insumo_id: 'sal', quantidade: 0, custo_unitario: 99, fornecedor_id: 'f1', tipo: 'ajuste', criado_em: '2026-10-06T12:00:00Z' },
  ]
  const r = agruparComprasFornecedor(ents, { f1: 'Peixaria X' })

  it('soma por fornecedor, ignora transferência/ajuste e ordena por valor', () => {
    expect(r.map((f) => f.nome)).toEqual(['Peixaria X', 'Fogás'])
    expect(r[0].valor).toBe(700 + 400 + 100)
    expect(r[0].notas).toBe(2)            // 100/1 e 101/1 (a 101 tem 2 itens)
    expect(r[1].notas).toBe(1)            // manual sem NF-e conta como 1
  })

  it('itens do fornecedor com qtd, preço mín/máx e nº de compras', () => {
    const sal = r[0].itens.find((i) => i.insumoId === 'sal')!
    expect(sal).toMatchObject({ qtd: 15, valor: 1100, compras: 2, precoMin: 70, precoMax: 80 })
    expect(r[0].itens[0].insumoId).toBe('sal')   // maior valor primeiro
  })
})
