import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/db'

// Novidades / changelog do produto (global — igual pra todos os clientes).
// "Lido" guardado no localStorage (por navegador); badge = itens mais novos que o último visto.

type Item = { id: string; data: string; titulo: string; descricao?: string | null; tipo?: string | null; modulo?: string | null; destaque?: boolean; created_at?: string }

const SEEN_KEY = 'aiko_changelog_seen'
const getSeen = (): string => { try { return localStorage.getItem(SEEN_KEY) || '' } catch { return '' } }
const putSeen = (v: string) => { try { localStorage.setItem(SEEN_KEY, v) } catch { /* ignore */ } }

const TIPO: Record<string, { lbl: string; bg: string; fg: string }> = {
  novo: { lbl: 'Novo', bg: 'rgba(22,163,74,.12)', fg: '#16a34a' },
  melhoria: { lbl: 'Melhoria', bg: 'rgba(37,99,235,.12)', fg: '#2563eb' },
  correcao: { lbl: 'Correção', bg: 'rgba(217,119,6,.14)', fg: '#d97706' },
}
const fmtData = (d: string) => { try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) } catch { return d } }

export function Novidades() {
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(getSeen())

  const { data: itens = [] } = useQuery({
    queryKey: ['changelog'], staleTime: 5 * 60_000,
    queryFn: async () => { const { data } = await supabase.from('changelog').select('*').order('data', { ascending: false }).order('created_at', { ascending: false }).limit(60); return (data ?? []) as Item[] },
  })

  const chave = (i: Item) => i.created_at || i.data || ''
  const naoLidos = useMemo(() => itens.filter((i) => chave(i) > seen).length, [itens, seen])

  const toggle = () => {
    const abrindo = !open
    setOpen(abrindo)
    if (abrindo && itens.length) { const latest = chave(itens[0]); putSeen(latest); setSeen(latest) }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button className="btn ghost" title="Novidades" onClick={toggle}
        style={{ height: 32, width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, position: 'relative' }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {naoLidos > 0 && <span style={{ position: 'absolute', top: 2, right: 3, minWidth: 15, height: 15, padding: '0 3px', borderRadius: 9, background: '#ef4444', color: '#fff', fontSize: 9.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>{naoLidos > 9 ? '9+' : naoLidos}</span>}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', right: 0, top: 40, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 14px 36px rgba(15,39,68,.18)', width: 340, maxWidth: '92vw', zIndex: 50, overflow: 'hidden' }}>
            <div style={{ padding: '12px 15px', borderBottom: '1px solid #eef1f7', fontSize: 14, fontWeight: 800, color: '#14315f', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>✨</span> Novidades do Aiko
            </div>
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              {itens.length === 0 ? (
                <div style={{ padding: '30px 16px', textAlign: 'center', color: '#94a3c4', fontSize: 13 }}>Nenhuma novidade por aqui ainda.</div>
              ) : itens.map((i) => {
                const t = TIPO[(i.tipo || '').toLowerCase()] || null
                return (
                  <div key={i.id} style={{ padding: '11px 15px', borderBottom: '1px solid #f1f5f9', background: i.destaque ? '#fffaf4' : '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      {t && <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.03em', textTransform: 'uppercase', color: t.fg, background: t.bg, borderRadius: 5, padding: '1px 6px' }}>{t.lbl}</span>}
                      {i.modulo && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>{i.modulo}</span>}
                      <span style={{ marginLeft: 'auto', fontSize: 10.5, color: '#94a3c4', fontFamily: 'DM Mono, monospace' }}>{fmtData(i.data)}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e2030', lineHeight: 1.35 }}>{i.titulo}</div>
                    {i.descricao && <div style={{ fontSize: 12, color: '#586084', lineHeight: 1.45, marginTop: 2 }}>{i.descricao}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
