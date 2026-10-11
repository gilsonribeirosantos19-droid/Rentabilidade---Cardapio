// Testes da exportação CSV (parte PURA: montagem do texto). Cobre o que importa pro arquivo abrir
// certo no Excel PT-BR (separador, vírgula decimal, aspas) e a PROTEÇÃO contra injeção de fórmula
// (célula começando com = + - @ é neutralizada). Nomes em PT (relatório legível).

import { describe, it, expect } from 'vitest'
import { escCsvCell, toCsv } from './csv'

describe('escCsvCell (escapa uma célula)', () => {
  it('número sai com vírgula decimal (1234.5 → 1234,5)', () => {
    expect(escCsvCell(1234.5)).toBe('1234,5')
  })
  it('texto vai entre aspas', () => {
    expect(escCsvCell('Salmão')).toBe('"Salmão"')
  })
  it('aspas internas são duplicadas (padrão CSV)', () => {
    expect(escCsvCell('cana "boa"')).toBe('"cana ""boa"""')
  })
  it('neutraliza injeção de fórmula: =, +, -, @ ganham apóstrofo na frente', () => {
    expect(escCsvCell('=SOMA(A1:A2)')).toBe('"\'=SOMA(A1:A2)"')
    expect(escCsvCell('+1')).toBe('"\'+1"')
    expect(escCsvCell('-1')).toBe('"\'-1"')
    expect(escCsvCell('@cmd')).toBe('"\'@cmd"')
  })
  it('texto comum não é prefixado', () => {
    expect(escCsvCell('Tomate')).toBe('"Tomate"')
  })
})

describe('toCsv (monta o arquivo inteiro)', () => {
  it('começa com BOM (pro Excel abrir acento certo)', () => {
    expect(toCsv([['a']]).startsWith('﻿')).toBe(true)
  })
  it('usa ; como separador de colunas e quebra de linha entre linhas', () => {
    const csv = toCsv([['Nome', 'Valor'], ['Salmão', 10.5]])
    expect(csv).toBe('﻿"Nome";"Valor"\n"Salmão";10,5')
  })
  it('linha única sem quebra de linha sobrando', () => {
    expect(toCsv([['x', 'y']])).toBe('﻿"x";"y"')
  })
})
