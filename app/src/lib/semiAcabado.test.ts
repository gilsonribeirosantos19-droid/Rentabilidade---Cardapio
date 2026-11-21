// Produto SEMI-ACABADO usado como ingrediente (caso real: Shari nos bentôs, 2026-11).
// Precificação/Engenharia/Curva ABC tratavam como "porção" (= lote inteiro) → custo 11,7× maior que a Ficha Técnica.
import { describe, it, expect } from 'vitest'
import { custoFichaPorcao, ehSemiAcabado, type FichasByProduto } from './cost'

// arroz 10 kg a R$ 5/kg + vinagre 1.700 g a R$ 6/kg = R$ 60,20 o lote; o lote rende 11.700 g de shari
const insumos = [
  { id: 'arroz', preco_compra: 5, unidade_medida: 'kg', rendimento_pct: 100 },
  { id: 'vinagre', preco_compra: 6, unidade_medida: 'kg', rendimento_pct: 100 },
  { id: 'frango', preco_compra: 20, unidade_medida: 'kg', rendimento_pct: 100 },
]
const ctx = { insumos, saldos: [], strictLoja: true }
const loteShari = [{ insumo_id: 'arroz', quantidade_g: 10000 }, { insumo_id: 'vinagre', quantidade_g: 1700 }]
const custoLote = 10 * 5 + 1.7 * 6            // 60,20
const porKg = custoLote / 11.7                 // ~5,145

const mapa: FichasByProduto = new Map([
  ['p-shari', { itens: loteShari, rendimento_porcoes: 1, insumo_vinculado_id: 'ins-shari', rendimento_receita_g: 11700 }],
  ['p-hot', { itens: [{ insumo_id: 'frango', quantidade_g: 100 }], rendimento_porcoes: 1 }],
])

describe('ehSemiAcabado', () => {
  it('só é semi-acabado com insumo vinculado E rendimento em gramas', () => {
    expect(ehSemiAcabado(mapa.get('p-shari'))).toBe(true)
    expect(ehSemiAcabado(mapa.get('p-hot'))).toBe(false)
    expect(ehSemiAcabado({ insumo_vinculado_id: 'x', rendimento_receita_g: 0 })).toBe(false)
    expect(ehSemiAcabado(null)).toBe(false)
  })
})

describe('produto semi-acabado como ingrediente = POR KG (igual à Ficha Técnica)', () => {
  it('bentô com 0,150 de Shari custa 0,150 kg × R$/kg (não 0,150 × o lote inteiro)', () => {
    const bento = [{ produto_id: 'p-shari', quantidade_g: 0.150 }]
    const c = custoFichaPorcao(bento, 1, null, ctx, mapa)
    expect(c).toBeCloseTo(porKg * 0.150, 6)            // ~0,77
    expect(c).not.toBeCloseTo(custoLote * 0.150, 2)    // o erro antigo (~9,03)
  })
  it('prato pronto continua POR PORÇÃO (combo com 2 Hot = 2 porções)', () => {
    const combo = [{ produto_id: 'p-hot', quantidade_g: 2 }]
    expect(custoFichaPorcao(combo, 1, null, ctx, mapa)).toBeCloseTo(2 * 0.1 * 20, 6)   // 2 × R$ 2,00
  })
})
