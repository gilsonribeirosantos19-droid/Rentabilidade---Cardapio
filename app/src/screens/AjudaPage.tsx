import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/db'
import { useAuth } from '../lib/auth'

// Central de Ajuda — página completa (manual do sistema). Mesma fonte da gaveta: ajuda_artigos.

type Artigo = { id: string; modulo: string; titulo: string; conteudo: string; ordem?: number }
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
// ordem lógica dos módulos no índice (o que não estiver na lista vai pro fim, alfabético)
const MOD_ORDER = ['Primeiros passos', 'Cadastros', 'Estoque', 'Fiscal', 'Compras', 'Gestão', 'PDV', 'Produção', 'Configurações', 'Conceitos', 'Geral', 'Sistema', 'Acesso', 'Vendas']
const modRank = (m: string) => { const i = MOD_ORDER.indexOf(m); return i < 0 ? MOD_ORDER.length + 1 : i }

export function AjudaPage() {
  const { tenantId } = useAuth()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(null)

  const { data: artigos = [] } = useQuery({
    queryKey: ['ajuda-page', tenantId], staleTime: 10 * 60_000,
    queryFn: async () => { const { data } = await supabase.from('ajuda_artigos').select('*').order('modulo').order('ordem'); return (data ?? []) as Artigo[] },
  })

  const filtrados = useMemo(() => { const t = norm(q); if (!t) return artigos; return artigos.filter((a) => norm(a.titulo + ' ' + a.conteudo + ' ' + a.modulo).includes(t)) }, [artigos, q])
  const grupos = useMemo(() => { const m = new Map<string, Artigo[]>(); filtrados.forEach((a) => { const k = a.modulo || 'Geral'; (m.get(k) || m.set(k, []).get(k)!).push(a) }); return [...m.entries()].sort((x, y) => modRank(x[0]) - modRank(y[0]) || x[0].localeCompare(y[0])) }, [filtrados])
  const atual = useMemo(() => artigos.find((a) => a.id === sel) || filtrados[0] || null, [artigos, filtrados, sel])
  useEffect(() => { if (filtrados.length && (!sel || !filtrados.find((a) => a.id === sel))) setSel(filtrados[0].id) }, [filtrados, sel])

  return (
    <div style={{ padding: '14px 18px 40px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#14315f', display: 'flex', alignItems: 'center', gap: 9 }}>❓ Central de Ajuda</div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Manual do sistema — guias por módulo. Também disponível no ícone <b>?</b> no topo, pra ajuda rápida.</div>
      </div>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ajuda (ex.: inventário, nota fiscal, orçamento)…"
        style={{ width: '100%', height: 40, border: '1px solid #d3dbe8', borderRadius: 10, padding: '0 14px', fontSize: 14, fontFamily: 'inherit', color: '#0f172a', background: '#fff', marginBottom: 16 }} />

      {artigos.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3c4', background: '#fff', border: '1px solid #d3dbe8', borderRadius: 13 }}>Ajuda ainda não cadastrada. Rode o SQL <b>ajuda_central.sql</b>.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 260px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
          {/* índice */}
          <div style={{ background: '#fff', border: '1px solid #d3dbe8', borderRadius: 13, overflow: 'hidden', position: 'sticky', top: 14 }}>
            {grupos.length === 0 ? <div style={{ padding: 20, textAlign: 'center', color: '#94a3c4', fontSize: 13 }}>Nada encontrado.</div>
              : grupos.map(([mod, arts]) => (
                <div key={mod}>
                  <div style={{ padding: '10px 14px 4px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: '#14315f' }}>{mod}</div>
                  {arts.map((a) => {
                    const on = atual?.id === a.id
                    return (
                      <button key={a.id} onClick={() => setSel(a.id)}
                        style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, borderLeft: on ? '3px solid #f97316' : '3px solid transparent', background: on ? '#fff7ed' : 'none', padding: '8px 14px', font: 'inherit', fontSize: 13, fontWeight: on ? 700 : 500, color: on ? '#ea580c' : '#334155', cursor: 'pointer' }}>
                        {a.titulo}
                      </button>
                    )
                  })}
                </div>
              ))}
          </div>

          {/* conteúdo */}
          <div style={{ background: '#fff', border: '1px solid #d3dbe8', borderRadius: 13, padding: '20px 24px', minHeight: 320 }}>
            {atual ? (
              <>
                <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: '#94a3c4', marginBottom: 4 }}>{atual.modulo}</div>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1e2030', margin: '0 0 14px' }}>{atual.titulo}</h2>
                <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{atual.conteudo}</div>
              </>
            ) : <div style={{ color: '#94a3c4', fontSize: 13 }}>Selecione um guia no índice.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
