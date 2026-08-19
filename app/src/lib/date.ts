// Helpers de data compartilhados — matam cópias IDÊNTICAS espalhadas nas telas (dívida de dedup).
// Só as versões byte-a-byte iguais foram centralizadas; variantes divergentes de propósito ficam
// locais (ex.: hojeStr via toISOString/UTC em Entradas/Saidas; fmtData específico de cada tela).

// Date → 'YYYY-MM-DD' no fuso LOCAL (usado como isoD/iso nas telas).
export const isoD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// ISO → 'DD/MM/YYYY HH:mm' (pt-BR). Usado como fmtDH / fmtDataHora.
export const fmtDH = (iso?: string) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

// Hoje como 'YYYY-MM-DD' no fuso LOCAL (Brasil). Usado como hojeStr (variante toLocaleDateString en-CA).
export const hojeStr = () => new Date().toLocaleDateString('en-CA')

// 'YYYY-MM-DD' → 'DD/MM/YYYY'. Usado como fmtDia.
export const fmtDia = (iso: string) => iso.split('-').reverse().join('/')
