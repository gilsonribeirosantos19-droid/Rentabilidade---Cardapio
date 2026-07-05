// Exporta linhas pra CSV e dispara o download.
// Separador ';' + BOM (﻿) pro Excel PT-BR abrir com acentos certos.
// Números saem com vírgula decimal (padrão BR); texto vai entre aspas (escapa aspas internas).
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) =>
    typeof v === 'number' ? String(v).replace('.', ',') : `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = '﻿' + rows.map((r) => r.map(esc).join(';')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
