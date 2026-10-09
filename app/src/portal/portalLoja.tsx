import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

// "Loja atual" do Portal — uma fonte única que TODAS as telas do Portal usam.
// - Gerente (usuario.loja_id setado): fica travado na loja dele (como sempre).
// - Admin / Supervisor (sem loja fixa): vê todas as lojas do tenant e ESCOLHE qual olhar.
//   (Fase C: supervisor com lojas concedidas → só o subconjunto. Hoje sem concessão = todas.)

type Loja = { id: string; nome?: string }
type Ctx = { lojas: Loja[]; lojaAtual: string; setLojaAtual: (id: string) => void; travada: boolean; lojaNome: string }

const PortalLojaCtx = createContext<Ctx>({ lojas: [], lojaAtual: '', setLojaAtual: () => {}, travada: true, lojaNome: '' })
export const usePortalLoja = () => useContext(PortalLojaCtx)

export function PortalLojaProvider({ children }: { children: ReactNode }) {
  const { tenantId, usuario } = useAuth()
  const lojaProprio = usuario?.loja_id ?? null

  const { data: todas = [] } = useQuery({
    queryKey: ['portal-lojas-acess', tenantId],
    enabled: !!tenantId,
    queryFn: async () => { const { data } = await supabase.from('lojas').select('id,nome').eq('tenant_id', tenantId).eq('ativo', true).order('nome'); return (data ?? []) as Loja[] },
  })

  const lojas = useMemo(() => (lojaProprio ? todas.filter((l) => l.id === lojaProprio) : todas), [todas, lojaProprio])
  const [sel, setSel] = useState('')
  const lojaAtual = sel || lojaProprio || lojas[0]?.id || ''
  const travada = !!lojaProprio
  const lojaNome = useMemo(() => todas.find((l) => l.id === lojaAtual)?.nome || 'Minha loja', [todas, lojaAtual])

  return <PortalLojaCtx.Provider value={{ lojas, lojaAtual, setLojaAtual: setSel, travada, lojaNome }}>{children}</PortalLojaCtx.Provider>
}
