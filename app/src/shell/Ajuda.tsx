import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/db'

// Central de ajuda in-app: guias curtos por módulo, com busca. Conteúdo na tabela global ajuda_artigos.

type Artigo = { id: string; modulo: string; titulo: string; conteudo: string; ordem?: number }
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function Ajuda() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)

  const { data: artigos = [] } = useQuery({
    queryKey: ['ajuda'], staleTime: 10 * 60_000,
    queryFn: async () => { const { data } = await supabase.from('ajuda_artigos').select('*').order('modulo').order('ordem'); return (data ?? []) as Artigo[] },
  })
  const filtrados = useMemo(() => { const t = norm(q); if (!t) return artigos; return artigos.filter((a) => norm(a.titulo + ' ' + a.conteudo + ' ' + a.modulo).includes(t)) }, [artigos, q])
  const grupos = useMemo(() => { const m = new Map<string, Artigo[]>(); filtrados.forEach((a) => { const k = a.modulo || 'Geral'; (m.get(k) || m.set(k, []).get(k)!).push(a) }); return [...m.entries()] }, [filtrados])

  return (
    <div style={{ position: 'relative' }}>
      <button className="btn ghost" title="Ajuda" onClick={() => setOpen((o) => !o)}
        style={{ height: 32, width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', right: 0, top: 40, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 14px 36px rgba(15,39,68,.18)', width: 380, maxWidth: '94vw', zIndex: 50, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 560 }}>
            <div style={{ padding: '12px 15px', borderBottom: '1px solid #eef1f7', fontSize: 14, fontWeight: 800, color: '#14315f', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>❓</span> Central de ajuda
            </div>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #eef1f7' }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ajuda…" autoFocus
                style={{ width: '100%', height: 34, border: '1px solid #d3dbe8', borderRadius: 8, padding: '0 11px', fontSize: 13, fontFamily: 'inherit', color: '#0f172a', background: '#f6f8fb' }} />
            </div>
            <div style={{ overflowY: 'auto', padding: '4px 0 8px' }}>
              {artigos.length === 0 ? (
                <div style={{ padding: '30px 16px', textAlign: 'center', color: '#94a3c4', fontSize: 13 }}>Ajuda ainda não cadastrada.</div>
              ) : grupos.length === 0 ? (
                <div style={{ padding: '30px 16px', textAlign: 'center', color: '#94a3c4', fontSize: 13 }}>Nada encontrado para "{q}".</div>
              ) : grupos.map(([mod, arts]) => (
                <div key={mod}>
                  <div style={{ padding: '10px 15px 4px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: '#14315f' }}>{mod}</div>
                  {arts.map((a) => {
                    const ativo = aberto === a.id
                    return (
                      <div key={a.id} style={{ borderBottom: '1px solid #f4f6fa' }}>
                        <button onClick={() => setAberto(ativo ? null : a.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', background: ativo ? '#f6f8fb' : 'none', border: 0, padding: '9px 15px', font: 'inherit', fontSize: 13, fontWeight: 600, color: '#1e2030', cursor: 'pointer' }}>
                          <span style={{ color: '#94a3c4', fontSize: 11, transform: ativo ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
                          <span style={{ flex: 1 }}>{a.titulo}</span>
                        </button>
                        {ativo && <div style={{ padding: '2px 16px 13px 32px', fontSize: 12.5, color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{a.conteudo}</div>}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
