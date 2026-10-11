// Testes dos formatadores fiscais (fiscal.ts) usados no DANFE. CNPJ/CPF/CEP/chave mal formatados
// deixam o DANFE feio ou ilegível. São funções puras com resposta certa bem definida.
// Nomes em PT (relatório legível).

import { describe, it, expect } from 'vitest'
import { fmtDoc, fmtChave, fmtCep } from './fiscal'

describe('fmtDoc (CNPJ / CPF)', () => {
  it('14 dígitos → CNPJ 00.000.000/0000-00', () => {
    expect(fmtDoc('11222333000181')).toBe('11.222.333/0001-81')
  })
  it('11 dígitos → CPF 000.000.000-00', () => {
    expect(fmtDoc('12345678909')).toBe('123.456.789-09')
  })
  it('ignora pontuação que já venha no valor (limpa antes)', () => {
    expect(fmtDoc('11.222.333/0001-81')).toBe('11.222.333/0001-81')
  })
  it('tamanho inesperado devolve o valor cru', () => {
    expect(fmtDoc('123')).toBe('123')
  })
  it('vazio/null vira travessão', () => {
    expect(fmtDoc('')).toBe('—')
    expect(fmtDoc(null)).toBe('—')
  })
})

describe('fmtChave (chave de acesso da NF-e)', () => {
  it('agrupa de 4 em 4 dígitos', () => {
    const chave = '35200114200166000187550010000000071000000017'
    expect(fmtChave(chave)).toBe('3520 0114 2001 6600 0187 5500 1000 0000 0710 0000 0017')
  })
  it('vazio vira string vazia', () => {
    expect(fmtChave('')).toBe('')
    expect(fmtChave(null)).toBe('')
  })
})

describe('fmtCep (CEP)', () => {
  it('8 dígitos → 00000-000', () => {
    expect(fmtCep('01310100')).toBe('01310-100')
  })
  it('tamanho diferente devolve o valor cru', () => {
    expect(fmtCep('123')).toBe('123')
  })
  it('vazio vira string vazia', () => {
    expect(fmtCep('')).toBe('')
  })
})
