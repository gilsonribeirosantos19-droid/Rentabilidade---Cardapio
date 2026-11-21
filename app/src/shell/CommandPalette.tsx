// Busca rápida de telas (Ctrl+K / ⌘K). Lista as telas do menu (nav.ts) com as MESMAS regras de visibilidade
// da barra lateral (admin-only, permissão por grupo, módulo de CD e de Etiquetas). Enter abre; ↑/↓ navega; Esc fecha.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MODULES } from './nav'
import { ICONS } from './icons'
import { useAuth } from '../lib/auth'
import { usePerms } from '../lib/perms'
import { supabase } from '../lib/db'
import { useEtiquetasAtivo } from '../lib/modulos'
import { matchBusca } from '../lib/nome'

type Tela = { key: string; label: string; modulo: string; grupo?: string; icon: string }

export function CommandPalette({ onOpen }: { onOpen: (key: string, label: string) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const { usuario, tenantId } = useAuth()
  const { podeVer: podeModulo } = usePerms()
  const isAdmin = (usuario?.role || usuario?.perfil || '').toLowerCase().startsWith('admin')
  // mesma consulta (e mesmo cache) da barra lateral
  const { data: temCd = false } = useQuery({ queryKey: ['sidebar-tem-cd', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('lojas').select('id').eq('tenant_id', tenantId).eq('is_cd', true).limit(1); return (data?.length ?? 0) > 0 } })
  const etqAtivo = useEtiquetasAtivo(tenantId)

  // atalho global Ctrl+K / ⌘K (e evento p/ abrir pelo botão do topo)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o) } }
    const onEvt = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('aiko:busca-telas', onEvt)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('aiko:busca-telas', onEvt) }
  }, [])
  useEffect(() => { if (open) { setQ(''); setSel(0) } }, [open])

  const telas = useMemo<Tela[]>(() => {
    const out: Tela[] = [{ key: '__home', label: 'Visão geral', modulo: 'Início', icon: 'home' }]
    const pode = (it: { admin?: boolean; key: string }) => (!it.admin || isAdmin) && podeModulo(it.key)
    for (const m of MODULES) {
      if (m.home || (m.requiresCd && !temCd) || (m.requiresEtiquetas && !etqAtivo)) continue
      for (const s of m.sections ?? []) {
        if ('group' in s) s.items.forEach((it) => { if (pode(it)) out.push({ key: it.key, label: it.label, modulo: m.label, grupo: s.group, icon: m.icon }) })
        else if (pode(s)) out.push({ key: s.key, label: s.label, modulo: m.label, icon: m.icon })
      }
    }
    return out
  }, [isAdmin, podeModulo, temCd, etqAtivo])

  const achadas = useMemo(() => telas.filter((t) => matchBusca(`${t.label} ${t.modulo} ${t.grupo || ''}`, q)).slice(0, 40), [telas, q])
  useEffect(() => { setSel(0) }, [q])
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' }) }, [sel])

  if (!open) return null
  const abrir = (t?: Tela) => { if (!t) return; setOpen(false); onOpen(t.key, t.label) }

  return (
    <div className="cmdk-back" onMouseDown={() => setOpen(false)}>
      <div className="cmdk" role="dialog" aria-label="Buscar tela" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cmdk-in">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input autoFocus placeholder="Buscar tela… (ex.: entradas, cmv, ficha)" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, achadas.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
              else if (e.key === 'Enter') { e.preventDefault(); abrir(achadas[sel]) }
              else if (e.key === 'Escape') setOpen(false)
            }} />
          <kbd>Esc</kbd>
        </div>
        <div className="cmdk-list" ref={listRef}>
          {achadas.length === 0 && <div className="cmdk-vazio">Nenhuma tela encontrada</div>}
          {achadas.map((t, i) => (
            <div key={t.key} data-i={i} className={'cmdk-it' + (i === sel ? ' on' : '')} onMouseEnter={() => setSel(i)} onClick={() => abrir(t)}>
              <span className="ic">{ICONS[t.icon] ?? ICONS.home}</span>
              <span className="nm">{t.label}</span>
              <span className="md">{t.modulo}{t.grupo ? ' › ' + t.grupo : ''}</span>
            </div>
          ))}
        </div>
        <div className="cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Ctrl</kbd>+<kbd>K</kbd> abre/fecha</span></div>
      </div>
    </div>
  )
}
