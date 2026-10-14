import { useEffect, useRef, useState } from 'react'
import './searchselect.css'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = 'Selecione...',
  meta,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
  meta?: Record<string, string>
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxH?: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onScroll = (e: Event) => { if (ref.current && ref.current.contains(e.target as Node)) return; setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll) }
  }, [open])

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const MARG = 10, MINLIST = 150, MAXPOP = 300     // altura máx. do popup (busca + lista)
      const abaixo = window.innerHeight - r.bottom - MARG
      const acima = r.top - MARG
      // PREFERE abrir pra BAIXO; só vira pra cima se embaixo não cabe o mínimo E em cima cabe mais.
      // Em ambos os casos a lista encolhe pro espaço disponível (scrolla) em vez de ser cortada.
      if (abaixo < MINLIST && acima > abaixo)
        setPos({ bottom: window.innerHeight - r.top + 4, left: r.left, width: r.width, maxH: Math.min(MAXPOP, acima) })
      else
        setPos({ top: r.bottom + 4, left: r.left, width: r.width, maxH: Math.min(MAXPOP, abaixo) })
    }
    setQ('')
    setOpen((o) => !o)
  }

  const filtered = options.filter((o) => norm(o + ' ' + (meta?.[o] || '')).includes(norm(q)))

  return (
    <div className="ass" ref={ref}>
      <button ref={btnRef} type="button" className={'ass-btn' + (value ? '' : ' ph')} onClick={toggle}>
        {value || placeholder}
      </button>
      {open && pos && (
        <div className="ass-pop" style={{ top: pos.top, bottom: pos.bottom, left: pos.left, minWidth: Math.max(pos.width, 200) }}>
          <input className="ass-q" autoFocus placeholder="Digite para buscar..." value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="ass-list" style={pos.maxH ? { maxHeight: Math.max(110, pos.maxH - 46) } : undefined}>
            <div className="ass-opt" onClick={() => { onChange(''); setOpen(false) }}>{placeholder}</div>
            {filtered.map((o) => (
              <div key={o} className={'ass-opt' + (o === value ? ' on' : '')} onClick={() => { onChange(o); setOpen(false) }}><span>{o}</span>{meta?.[o] ? <span className="ass-meta">{meta[o]}</span> : null}</div>
            ))}
            {filtered.length === 0 && <div className="ass-none">Nada encontrado</div>}
          </div>
        </div>
      )}
    </div>
  )
}
