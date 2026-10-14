import { describe, it, expect } from 'vitest'
import { calcFator } from './embalagem'

describe('calcFator — lê o fator do nome da embalagem', () => {
  it('kg no fim do nome', () => { expect(calcFator('CAIXA C/ 9 KG')).toBe(9) })
  it('decimal com vírgula', () => { expect(calcFator('BISNAGA C/ 1,2 KG')).toBe(1.2) })
  it('kg maior', () => { expect(calcFator('FARDO C/ 30KG')).toBe(30) })
  it('termina em g -> converte p/ kg (÷1000)', () => { expect(calcFator('MAIONESE 400 g')).toBe(0.4) })
  it('termina em ml -> converte p/ L (÷1000)', () => { expect(calcFator('REFRI 900 ml')).toBe(0.9) })
  it('multiplicação N x M (20 x 0,900)', () => { expect(calcFator('CAIXA 20 X 0,900 ML')).toBe(18) })
  it('unidades', () => { expect(calcFator('PACOTE 50 UNI')).toBe(50) })
  it('caixa de 24 un', () => { expect(calcFator('CAIXA C/ 24UNI')).toBe(24) })
  it('sem número = 1', () => { expect(calcFator('CAIXA')).toBe(1) })
  it('pacote sem número = 1', () => { expect(calcFator('PACOTE')).toBe(1) })
  it('vazio = null', () => { expect(calcFator('')).toBe(null) })
  it('só espaços = null', () => { expect(calcFator('   ')).toBe(null) })
})
