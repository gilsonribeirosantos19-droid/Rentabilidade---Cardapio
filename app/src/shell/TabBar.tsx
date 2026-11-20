// Barra de abas do workspace — estilo NAVEGADOR (Chrome).
// Aba ativa "encaixa" no conteúdo; × só aparece na aba ativa; com muitas abas elas encolhem pra caber.
// Recursos: ▾ lista/busca de abas abertas, botão direito (fechar esta/outras/da direita/todas),
// rodinha do mouse fecha, arrastar reordena. Regras puras em ./tabs.ts.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ICONS } from './icons'
import { moduleForKey } from './nav'
import { HOME, fecharDireita, fecharOutras, type Tab } from './tabs'
import { matchBusca } from '../lib/nome'

type Props = {
  tabs: Tab[]
  active: string
  onActivate: (key: string) => void
  onClose: (keys: string[]) => void
  onMove: (from: number, to: number) => void
}

type Pop = { kind: 'ctx'; key: string; x: number; y: number } | { kind: 'list'; x: number; y: number } | null

export function TabBar({ tabs, active, onActivate, onClose, onMove }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [larg, setLarg] = useState<Record<string, number>>({})
  const [pop, setPop] = useState<Pop>(null)
  const [q, setQ] = useState('')
  const [drag, setDrag] = useState<{ from: number; over: number; lado: 'l' | 'r' } | null>(null)

  // mede a largura de cada aba → classe tight/mini (encolhe como o Chrome)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const medir = () => {
      const m: Record<string, number> = {}
      el.querySelectorAll<HTMLElement>('[data-tab]').forEach((t) => { m[t.dataset.tab!] = t.getBoundingClientRect().width })
      setLarg((old) => (JSON.stringify(old) === JSON.stringify(m) ? old : m))
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [tabs])

  // fecha popups com Esc / clique fora / scroll / resize
  useEffect(() => {
    if (!pop) return
    const fechar = () => setPop(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    const onDown = (e: MouseEvent) => { const t = e.target; if (!(t instanceof Element) || !t.closest('.wtabs-pop, .wtabs-more')) fechar() }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', fechar)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); window.removeEventListener('resize', fechar) }
  }, [pop])

  const iconOf = (key: string) => ICONS[moduleForKey(key)?.icon ?? ''] ?? ICONS.home
  const modName = (key: string) => moduleForKey(key)?.label ?? ''
  const posPop = (x: number, y: number, w: number) => ({ left: Math.max(8, Math.min(x, window.innerWidth - w - 8)), top: Math.max(8, Math.min(y, window.innerHeight - 340)) })

  function abrirLista(e: React.MouseEvent<HTMLButtonElement>) {
    if (pop?.kind === 'list') { setPop(null); return }
    const r = e.currentTarget.getBoundingClientRect()
    setQ('')
    setPop({ kind: 'list', x: r.right - 300, y: r.bottom + 6 })
  }

  const idxAtiva = tabs.findIndex((t) => t.key === active)

  return (
    <div className="wtabs">
      <div className={'wtab home' + (active === HOME ? ' on' : '')} role="tab" tabIndex={0} aria-selected={active === HOME} title="Visão geral"
        onClick={() => onActivate(HOME)} onKeyDown={(e) => { if (e.key === 'Enter') onActivate(HOME) }}>
        <span className="ic">{ICONS.home}</span>
      </div>

      <div className="wtabs-scroll" ref={scrollRef} role="tablist">
        {tabs.map((t, i) => {
          const on = t.key === active
          const w = larg[t.key] ?? 999
          const cls = ['wtab',
            on && 'on',
            (i === 0 || i - 1 === idxAtiva || (i === 0 && active === HOME)) && 'nosep',
            w < 104 && 'tight',
            w < 60 && 'mini',
            drag?.from === i && 'dragging',
            drag && drag.over === i && drag.from !== i && (drag.lado === 'l' ? 'drop-l' : 'drop-r'),
          ].filter(Boolean).join(' ')
          return (
            <div key={t.key} data-tab={t.key} className={cls} role="tab" tabIndex={0} aria-selected={on} draggable
              title={(modName(t.key) ? modName(t.key) + ' › ' : '') + t.label}
              onClick={() => onActivate(t.key)}
              onKeyDown={(e) => { if (e.key === 'Enter') onActivate(t.key); if (e.key === 'Delete') onClose([t.key]) }}
              onMouseDown={(e) => { if (e.button === 1) e.preventDefault() }}
              onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose([t.key]) } }}
              onContextMenu={(e) => { e.preventDefault(); setPop({ kind: 'ctx', key: t.key, x: e.clientX, y: e.clientY }) }}
              onDragStart={(e) => { setDrag({ from: i, over: i, lado: 'l' }); try { e.dataTransfer.setData('text/plain', t.key); e.dataTransfer.effectAllowed = 'move' } catch { /* ignore */ } }}
              onDragOver={(e) => {
                if (!drag) return
                e.preventDefault()
                const r = e.currentTarget.getBoundingClientRect()
                const lado = e.clientX < r.left + r.width / 2 ? 'l' : 'r'
                if (drag.over !== i || drag.lado !== lado) setDrag({ ...drag, over: i, lado })
              }}
              onDrop={(e) => {
                if (!drag) return
                e.preventDefault()
                let to = i + (drag.lado === 'l' ? 0 : 1)
                if (to > drag.from) to--
                const from = drag.from
                setDrag(null)
                if (to !== from) onMove(from, to)
              }}
              onDragEnd={() => setDrag(null)}>
              <span className="sep" />
              <span className="ic">{iconOf(t.key)}</span>
              <span className="lbl">{t.label}</span>
              {on && <span className="x" title="Fechar aba" onClick={(e) => { e.stopPropagation(); onClose([t.key]) }}>×</span>}
            </div>
          )
        })}
      </div>

      <button className={'wtabs-more' + (pop?.kind === 'list' ? ' on' : '')} title="Abas abertas" onClick={abrirLista}>
        ▾ <span className="n">{tabs.length}</span>
      </button>

      {pop?.kind === 'ctx' && (() => {
        const outras = fecharOutras(tabs, pop.key)
        const direita = fecharDireita(tabs, pop.key)
        const act = (keys: string[]) => { setPop(null); if (keys.length) onClose(keys) }
        return (
          <div className="wtabs-pop" role="menu" style={posPop(pop.x, pop.y, 230)}>
            <button className="it" onClick={() => act([pop.key])}>Fechar esta aba</button>
            <button className="it" disabled={!outras.length} onClick={() => act(outras)}>Fechar as outras ({outras.length})</button>
            <button className="it" disabled={!direita.length} onClick={() => act(direita)}>Fechar as da direita ({direita.length})</button>
            <hr />
            <button className="it danger" onClick={() => act(tabs.map((t) => t.key))}>Fechar todas</button>
          </div>
        )
      })()}

      {pop?.kind === 'list' && (
        <div className="wtabs-pop" style={{ ...posPop(pop.x, pop.y, 300), width: 300 }}>
          <input className="q" autoFocus placeholder="Buscar aba aberta…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="head">{tabs.length} {tabs.length === 1 ? 'aba aberta' : 'abas abertas'}</div>
          <div className="list">
            {tabs.filter((t) => matchBusca(t.label + ' ' + modName(t.key), q)).map((t) => (
              <div key={t.key} className={'row' + (t.key === active ? ' on' : '')} onClick={() => { setPop(null); onActivate(t.key) }}>
                <span className="ic">{iconOf(t.key)}</span>
                <span className="nm">{t.label}</span>
                <span className="mn">{modName(t.key)}</span>
                <span className="x" title="Fechar" onClick={(e) => { e.stopPropagation(); onClose([t.key]) }}>×</span>
              </div>
            ))}
            {!tabs.length && <div className="row vazio">Nenhuma aba aberta</div>}
          </div>
          <hr />
          <button className="it danger" disabled={!tabs.length} onClick={() => { setPop(null); onClose(tabs.map((t) => t.key)) }}>Fechar todas</button>
        </div>
      )}
    </div>
  )
}
