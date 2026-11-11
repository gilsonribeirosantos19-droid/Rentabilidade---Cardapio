import { useState, type InputHTMLAttributes } from 'react'
import { parseQtdBR } from '../lib/format'

// Campo numérico no PADRÃO BRASILEIRO (substitui <input type="number">, que usa ponto americano:
// "1.550" virava 1,55). Aqui: vírgula = decimal, ponto = milhar → "1.550" = 1550 · "1,55" = 1,55.
// Drop-in: mesmo value/onChange de um <input>. A tela continua recebendo o valor no formato "de máquina"
// ("1550", "1.55") em e.target.value — então parseFloat/num/Number da tela seguem funcionando sem mudança.
// Fora de foco mostra formatado (1.550 / 1,55); digitado inválido = borda vermelha (e a tela recebe '').
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value?: string | number | null
  onChange?: (e: { target: { value: string } }) => void
}

// casas decimais na exibição: dinheiro (step 0.01/0.10) = 2 fixas; "any" = até 6; resto = até 3
function casas(step: Props['step']): [number, number] {
  const s = String(step ?? '')
  if (s === '0.01' || s === '0.10') return [2, 2]
  if (s === 'any') return [0, 6]
  return [0, 3]
}

export function NumInput({ value, onChange, step, style, onFocus, onBlur, ...rest }: Props) {
  const [txt, setTxt] = useState<string | null>(null)   // null = não está editando → mostra o valor formatado
  const raw = value == null ? '' : String(value)
  const n = raw.trim() === '' ? null : Number(raw)
  const [min, max] = casas(step)
  const fmt = n == null ? '' : Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max }) : raw
  const shown = txt ?? fmt
  const invalido = txt != null && txt.trim() !== '' && parseQtdBR(txt) == null
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      value={shown}
      title={rest.title ?? 'Padrão brasileiro: 1.550 = mil quinhentos e cinquenta · 1,55 = um vírgula cinquenta e cinco'}
      style={invalido ? { ...style, borderColor: '#e11d48', color: '#e11d48' } : style}
      onFocus={(e) => { setTxt(fmt); onFocus?.(e) }}
      onChange={(e) => {
        const t = e.target.value
        setTxt(t)
        const p = parseQtdBR(t)
        onChange?.({ target: { value: p == null ? '' : String(p) } })
      }}
      onBlur={(e) => { setTxt(null); onBlur?.(e) }}
    />
  )
}
