// Escapa UMA célula do CSV. Números → vírgula decimal (BR). Texto → entre aspas (escapa aspas
// internas) + neutraliza injeção de fórmula (célula que começa com = + - @ ou tab/CR: o Excel
// avaliaria como fórmula; o apóstrofo faz tratar como texto puro).
export function escCsvCell(v: string | number): string {
  if (typeof v === 'number') return String(v).replace('.', ',')
  let s = String(v ?? '')
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return `"${s.replace(/"/g, '""')}"`
}

// Monta o texto CSV completo (função PURA, testável). Separador ';' + BOM (﻿) pro Excel PT-BR
// abrir com acentos certos. É o coração do downloadCsv — o download só embrulha isto num arquivo.
export function toCsv(rows: (string | number)[][]): string {
  return '﻿' + rows.map((r) => r.map(escCsvCell).join(';')).join('\n')
}

// Exporta linhas pra CSV e dispara o download.
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = toCsv(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
