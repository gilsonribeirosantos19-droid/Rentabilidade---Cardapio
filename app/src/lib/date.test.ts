// Testes dos helpers de data (date.ts). Datas erradas aqui = movimento caindo no dia errado,
// filtro de período cortando evento, etc. Testo só as funções 100% determinísticas (que não
// dependem do relógio nem do fuso ao comparar). Nomes em PT (relatório legível).

import { describe, it, expect } from 'vitest'
import { isoD, fmtDia, fmtDH, hojeStr } from './date'

describe('isoD (Date → YYYY-MM-DD no fuso local)', () => {
  it('monta a data local com mês e dia preenchidos (05/01/2026)', () => {
    // mês 0 = janeiro; construído e lido em componentes locais → sem efeito de fuso
    expect(isoD(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
  it('preenche o zero à esquerda (março, dia 9 → 2026-03-09)', () => {
    expect(isoD(new Date(2026, 2, 9))).toBe('2026-03-09')
  })
  it('último dia do ano (31/12/2026)', () => {
    expect(isoD(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

describe('fmtDia (YYYY-MM-DD → DD/MM/YYYY)', () => {
  it('inverte a data para o formato brasileiro', () => {
    expect(fmtDia('2026-01-05')).toBe('05/01/2026')
  })
})

describe('fmtDH (ISO → DD/MM/YYYY HH:mm; vazio → travessão)', () => {
  it('vazio/undefined vira travessão', () => {
    expect(fmtDH('')).toBe('—')
    expect(fmtDH(undefined)).toBe('—')
  })
  it('data válida contém dia, mês e ano', () => {
    const s = fmtDH('2026-01-05T14:30:00')
    expect(s).toContain('05')
    expect(s).toContain('01')
    expect(s).toContain('2026')
  })
})

describe('hojeStr (hoje como YYYY-MM-DD)', () => {
  it('devolve no formato YYYY-MM-DD', () => {
    expect(hojeStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
