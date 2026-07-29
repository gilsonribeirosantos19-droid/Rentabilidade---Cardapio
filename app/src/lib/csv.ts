// Exporta linhas pra CSV e dispara o download.
// Separador ';' + BOM (﻿) pro Excel PT-BR abrir com acentos certos.
// Números saem com vírgula decimal (padrão BR); texto vai entre aspas (escapa aspas internas).
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    if (typeof v === 'number') return String(v).replace('.', ',')
    let s = String(v ?? '')
    // Neutraliza injeção de fórmula: o Excel avalia célula que começa com = + - @ (ou tab/CR).
    // Prefixar com apóstrofo faz o Excel tratar como texto puro.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
    return `"${s.replace(/"/g, '""')}"`
  }
  const csv = '﻿' + rows.map((r) => r.map(esc).join(';')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
