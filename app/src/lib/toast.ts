// Hooks de "toast" (aviso) centralizados — matam a cópia de useState+showToast espalhada em ~37 telas
// (dívida useToast da auditoria). SÓ o estado+timer é centralizado; o JSX que DESENHA o toast fica em
// cada tela (por isso não muda nada visualmente). Migração preserva o comportamento exato: cada tela
// passa os MESMOS tempos que tinha, e a forma do estado ({msg,err} ou {msg,tipo}) é idêntica.
import { useState } from 'react'

// Família {msg, err}: showToast(msg, err=false); tempo diferente p/ ok e erro.
export function useToastErr(okMs = 2600, errMs = 6000) {
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const showToast = (msg: string, err = false) => { setToast({ msg, err }); window.setTimeout(() => setToast(null), err ? errMs : okMs) }
  return { toast, setToast, showToast }
}

// Família {msg, tipo}: showToast(msg, tipo='ok'); tempo único.
export function useToastTipo(ms = 3000) {
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setToast({ msg, tipo }); window.setTimeout(() => setToast(null), ms) }
  return { toast, setToast, showToast }
}
