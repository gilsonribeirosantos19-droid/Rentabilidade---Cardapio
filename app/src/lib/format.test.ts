// Testes da fonte única de formatação de moeda (format.ts). São as funções que desenham
// TODO dinheiro na tela — se uma variante trocar o comportamento de null/zero, telas inteiras
// passam a mostrar valor errado ou travessão onde não devia. Nomes em PT (relatório legível).

import { describe, it, expect } from 'vitest'
import { brl, brlDash, brlNum, brlZero, brlCur, num, parseQtdBR, fmtQtdBR } from './format'

describe('parseQtdBR / fmtQtdBR (quantidade digitada no padrão brasileiro)', () => {
  it('ponto = milhar, vírgula = decimal', () => {
    expect(parseQtdBR('1.550')).toBe(1550)
    expect(parseQtdBR('1550')).toBe(1550)
    expect(parseQtdBR('1,55')).toBe(1.55)
    expect(parseQtdBR('2.650,5')).toBe(2650.5)
    expect(parseQtdBR('12.300.000')).toBe(12300000)
  })
  it('ponto fora de grupo de 3 = decimal; vazio/lixo = null', () => {
    expect(parseQtdBR('1.5')).toBe(1.5)
    expect(parseQtdBR(' 0,250 ')).toBe(0.25)
    expect(parseQtdBR('')).toBeNull()
    expect(parseQtdBR('abc')).toBeNull()
    expect(parseQtdBR('1,2,3')).toBeNull()
  })
  it('ida e volta: valor salvo → campo → valor (2,125 kg não vira 2125)', () => {
    for (const n of [2.125, 1550, 1.55, 0.001, 0, 2650.5]) expect(parseQtdBR(fmtQtdBR(n))).toBe(n)
    expect(fmtQtdBR(1550)).toBe('1.550')
    expect(fmtQtdBR(2.125)).toBe('2,125')
  })
})

const semNbsp = (s: string) => s.replace(/ /g, ' ')   // Intl usa espaço-fixo; normaliza p/ comparar

describe('brl (padrão: null/vazio/NaN → travessão; zero → R$ 0,00)', () => {
  it('formata milhar e centavos no padrão pt-BR', () => {
    expect(brl(1234.56)).toBe('R$ 1.234,56')
  })
  it('zero vira R$ 0,00 (não travessão)', () => {
    expect(brl(0)).toBe('R$ 0,00')
  })
  it('null, undefined e NaN viram travessão', () => {
    expect(brl(null)).toBe('—')
    expect(brl(undefined)).toBe('—')
    expect(brl(NaN)).toBe('—')
  })
})

describe('brlDash (igual ao brl, mas ZERO também vira travessão)', () => {
  it('zero vira travessão (telas de estoque: 0 = sem valor)', () => {
    expect(brlDash(0)).toBe('—')
  })
  it('valor normal formata igual ao brl', () => {
    expect(brlDash(1234.56)).toBe('R$ 1.234,56')
  })
  it('null continua travessão', () => {
    expect(brlDash(null)).toBe('—')
  })
})

describe('brlNum (só o número, sem o "R$ ")', () => {
  it('formata sem o prefixo de moeda', () => {
    expect(brlNum(1234.56)).toBe('1.234,56')
  })
  it('null e zero viram 0,00 (nunca travessão)', () => {
    expect(brlNum(null)).toBe('0,00')
    expect(brlNum(0)).toBe('0,00')
  })
})

describe('brlZero (null/0/inválido → R$ 0,00, nunca travessão)', () => {
  it('null vira R$ 0,00', () => {
    expect(brlZero(null)).toBe('R$ 0,00')
  })
  it('completa os centavos (1234,5 → R$ 1.234,50)', () => {
    expect(brlZero(1234.5)).toBe('R$ 1.234,50')
  })
})

describe('brlCur (estilo currency nativo do Intl)', () => {
  it('formata como moeda BRL (normalizando o espaço-fixo)', () => {
    expect(semNbsp(brlCur(1234.56))).toBe('R$ 1.234,56')
  })
  it('null vira travessão', () => {
    expect(brlCur(null)).toBe('—')
  })
})

describe('num (texto do campo → número, aceita vírgula decimal pt-BR)', () => {
  it('converte vírgula decimal (2,5 → 2.5)', () => {
    expect(num('2,5')).toBe(2.5)
  })
  it('número inteiro em texto vira número', () => {
    expect(num('10')).toBe(10)
  })
  it('vazio, undefined e texto inválido viram 0', () => {
    expect(num('')).toBe(0)
    expect(num(undefined)).toBe(0)
    expect(num('abc')).toBe(0)
  })
})
