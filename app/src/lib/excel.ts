// Exporta linhas (1ª linha = cabeçalho) como .xlsx de verdade — abre direto no Excel.
// Carrega o SheetJS sob demanda (dynamic import) pra não pesar o carregamento do app.
export async function downloadXlsx(filename: string, sheetName: string, rows: (string | number)[][]) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31)) // nome da aba: máx 31 chars
  XLSX.writeFile(wb, filename)
}
