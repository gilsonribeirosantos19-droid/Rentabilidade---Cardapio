import { useState } from 'react'
import { MODULES, type Module } from './nav'
import { ICONS } from './icons'
import { useAuth } from '../lib/auth'

const Chevron = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

function moduleHasKey(m: Module, key: string): boolean {
  return (m.sections ?? []).some((s) =>
    'group' in s ? s.items.some((i) => i.key === key) : s.key === key
  )
}

export function Sidebar({
  activeKey,
  onOpen,
  dived,
  setDived,
}: {
  activeKey: string
  onOpen: (key: string, label: string) => void
  dived: string | null
  setDived: (id: string | null) => void
}) {
  const { usuario, signOut } = useAuth()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const active = MODULES.find((m) => m.id === dived)
  const nome = usuario?.nome || usuario?.email || '—'

  return (
    <>
      {/* coluna de módulos */}
      <nav className="modbar">
        <div className="mlogo">
          <div className="mk">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1,21 8,6 13,13 17,8 23,21" />
              <line x1="1" y1="21" x2="23" y2="21" />
            </svg>
          </div>
          <div className="txt">
            <b>Aiko</b>
            <small>sistema</small>
          </div>
        </div>

        {MODULES.map((m) => {
          const on = m.id === dived || (m.home && activeKey === '__home')
          return (
            <div
              key={m.id}
              className={'mod' + (on ? ' on' : '')}
              onClick={() => {
                if (m.home) {
                  setDived(null)
                  onOpen('__home', 'Início')
                } else {
                  setDived(m.id)
                }
              }}
            >
              {ICONS[m.icon]}
              <span className="l">{m.label}</span>
              {m.sections && <span className="ch">›</span>}
            </div>
          )
        })}

        <div className="mgrow" />
        <div className="muser">
          <div className="mavatar">{(nome[0] || 'U').toUpperCase()}</div>
          <div className="muinfo">
            <div className="muname">{nome}</div>
            <div className="murole">{usuario?.role || usuario?.perfil || 'Usuário'}</div>
          </div>
          <button title="Sair" onClick={() => signOut()} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 17, padding: '4px 6px', borderRadius: 6, flexShrink: 0 }}>⎋</button>
        </div>
      </nav>

      {/* coluna de seções */}
      {active && (
        <nav className="secbar">
          <div className="sback" onClick={() => setDived(null)}>
            <span className="sbk">‹</span>
            <b>{active.label}</b>
          </div>

          {(active.sections ?? []).map((s, i) => {
            if ('group' in s) {
              const isCol = collapsed[active.id + i] ?? !s.items.some((it) => it.key === activeKey)
              return (
                <div key={i} className={'sgrp' + (isCol ? ' col' : '')}>
                  <div
                    className="sgrp-h"
                    onClick={() => setCollapsed((c) => ({ ...c, [active.id + i]: !isCol }))}
                  >
                    <span>{s.group}</span>
                    <Chevron />
                  </div>
                  <div className="sgrp-items">
                    {s.items.map((it) => (
                      <div
                        key={it.key}
                        className={'sitem' + (it.key === activeKey ? ' on' : '')}
                        onClick={() => onOpen(it.key, it.label)}
                      >
                        <span className="sdot" />
                        {it.label}
                      </div>
                    ))}
                  </div>
                </div>
              )
            }
            return (
              <div
                key={s.key}
                className={'sitem' + (s.key === activeKey ? ' on' : '')}
                onClick={() => onOpen(s.key, s.label)}
              >
                <span className="sdot" />
                {s.label}
              </div>
            )
          })}
        </nav>
      )}
    </>
  )
}
