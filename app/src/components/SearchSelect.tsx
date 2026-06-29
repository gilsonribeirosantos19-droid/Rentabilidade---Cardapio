import { useEffect, useRef, useState } from 'react'
import './searchselect.css'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = 'Selecione...',
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = options.filter((o) => norm(o).includes(norm(q)))

  return (
    <div className="ass" ref={ref}>
      <button type="button" className={'ass-btn' + (value ? '' : ' ph')} onClick={() => { setOpen((o) => !o); setQ('') }}>
        {value || placeholder}
      </button>
      {open && (
        <div className="ass-pop">
          <input className="ass-q" autoFocus placeholder="Digite para buscar..." value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="ass-list">
            <div className="ass-opt" onClick={() => { onChange(''); setOpen(false) }}>{placeholder}</div>
            {filtered.map((o) => (
              <div key={o} className={'ass-opt' + (o === value ? ' on' : '')} onClick={() => { onChange(o); setOpen(false) }}>{o}</div>
            ))}
            {filtered.length === 0 && <div className="ass-none">Nada encontrado</div>}
          </div>
        </div>
      )}
    </div>
  )
}
