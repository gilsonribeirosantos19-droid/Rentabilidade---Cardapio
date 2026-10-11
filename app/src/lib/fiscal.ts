// Formatadores fiscais puros, centralizados (antes estavam copiados dentro do danfe.ts,
// em gerarDanfeLocal e abrirDanfeAiko). São funções puras → testáveis isoladas. Comportamento
// FIEL ao que já existia (não muda o DANFE).

// CNPJ (14 díg.) → 00.000.000/0000-00; CPF (11) → 000.000.000-00; senão devolve o valor cru (ou '—').
export function fmtDoc(v: any): string {
  const s = String(v || '').replace(/\D/g, '')
  if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  return v ? String(v) : '—'
}

// Chave de acesso da NF-e (44 díg.) → agrupada de 4 em 4 ("1234 5678 ...").
export function fmtChave(c: any): string {
  return String(c || '').replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}

// CEP (8 díg.) → 00000-000; senão devolve o valor cru (ou vazio).
export function fmtCep(v: any): string {
  const s = String(v || '').replace(/\D/g, '')
  return s.length === 8 ? s.replace(/(\d{5})(\d{3})/, '$1-$2') : (v || '')
}
