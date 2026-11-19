// Testes da comparação de nomes — base da trava anti-duplicidade de insumos e da busca tolerante.
import { describe, it, expect } from 'vitest'
import { normNome, matchBusca, acharDuplicado } from './nome'

describe('normNome (mesma regra do banco)', () => {
  it('ignora maiúsculas, acentos e espaços extras', () => {
    expect(normNome('  Kani ')).toBe('kani')
    expect(normNome('KANÍ')).toBe('kani')
    expect(normNome('Filé   de  Salmão')).toBe('file de salmao')
    expect(normNome(null)).toBe('')
  })
})

describe('matchBusca (todas as palavras, qualquer ordem)', () => {
  it('acha com acento, espaço a mais e palavras fora de ordem', () => {
    expect(matchBusca('Filé de Salmão', 'salmao file')).toBe(true)
    expect(matchBusca('Kani', 'kani ')).toBe(true)
    expect(matchBusca('Kani', '  KANI  ')).toBe(true)
    expect(matchBusca('Shari', 'kani')).toBe(false)
  })
  it('busca vazia acha tudo; trecho contínuo continua achando', () => {
    expect(matchBusca('Cream Cheese', '')).toBe(true)
    expect(matchBusca('Cream Cheese', 'am che')).toBe(true)
  })
})

describe('acharDuplicado', () => {
  const lista = [
    { id: '1', nome: 'Kani', ativo: true },
    { id: '2', nome: 'Shari', ativo: false },
  ]
  it('acha ativo com mesmo nome normalizado', () => {
    expect(acharDuplicado(lista, ' KANÍ ')?.id).toBe('1')
  })
  it('ignora o próprio item (edição) e os inativos', () => {
    expect(acharDuplicado(lista, 'Kani', '1')).toBeUndefined()
    expect(acharDuplicado(lista, 'Shari')).toBeUndefined()
  })
})
