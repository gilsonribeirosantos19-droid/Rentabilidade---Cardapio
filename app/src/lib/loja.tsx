import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

export type Loja = { id: string; nome: string }
type LojaCtx = { lojas: Loja[]; lojaId: string | null; setLojaId: (id: string | null) => void }

const Ctx = createContext<LojaCtx>({ lojas: [], lojaId: null, setLojaId: () => {} })
export const useLoja = () => useContext(Ctx)

export function LojaProvider({ children }: { children: ReactNode }) {
  const { tenantId } = useAuth()
  const [lojas, setLojas] = useState<Loja[]>([])
  const [lojaId, setLojaId] = useState<string | null>(null)

  useEffect(() => {
    if (!tenantId) { setLojas([]); setLojaId(null); return }
    let alive = true
    supabase.from('lojas').select('id,nome').eq('tenant_id', tenantId).eq('ativo', true).order('nome').then(({ data }) => {
      if (!alive) return
      const ls = (data ?? []) as Loja[]
      setLojas(ls)
      // padrão de abertura: 1 loja → ela; várias → se existir "Ponta Negra", abre nela
      // (pedido do dono do Sushi PN); senão mantém "Todas" (null), como antes.
      const pn = ls.find((l) => (l.nome || '').toLowerCase().includes('ponta negra'))
      setLojaId(ls.length === 1 ? ls[0].id : (pn ? pn.id : null))
    })
    return () => { alive = false }
  }, [tenantId])

  return <Ctx.Provider value={{ lojas, lojaId, setLojaId }}>{children}</Ctx.Provider>
}
