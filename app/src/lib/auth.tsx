import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type Usuario = {
  id: string
  nome?: string
  email?: string
  role?: string
  perfil?: string
  tenant_id?: string
  loja_id?: string | null
}

type AuthCtx = {
  session: Session | null
  usuario: Usuario | null
  tenantId: string | null
  loading: boolean
  recovery: boolean                 // veio de um link "esqueci minha senha" → mostrar tela de nova senha
  clearRecovery: () => void
  signIn: (email: string, senha: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)

  async function loadUsuario(s: Session | null, attempt = 0) {
    if (!s) {
      setUsuario(null)
      return
    }
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', s.user.id)
      .limit(1)
      .maybeSingle()
    if (data) { setUsuario(data as Usuario); return }
    // Releitura falhou (erro/RLS logo após renovação de token idle). NUNCA rebaixa um
    // perfil já carregado — perder o `perfil` faria o gerente cair no sistema principal.
    // Tenta de novo algumas vezes enquanto o token novo se estabiliza.
    if (error && attempt < 3) {
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
      return loadUsuario(s, attempt + 1)
    }
    // Mantém o perfil anterior se houver; só usa o fallback mínimo (id/email) quando
    // realmente não existe linha em `usuarios` (sem erro) e nada foi carregado ainda.
    setUsuario((prev) => prev ?? (error ? null : { id: s.user.id, email: s.user.email }))
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadUsuario(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      if (evt === 'PASSWORD_RECOVERY') setRecovery(true)   // clicou no link de redefinição de senha
      setSession(s)
      void loadUsuario(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function signIn(email: string, senha: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) return { error: error.message }
    return {}
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <Ctx.Provider
      value={{ session, usuario, tenantId: usuario?.tenant_id ?? null, loading, recovery, clearRecovery: () => setRecovery(false), signIn, signOut }}
    >
      {children}
    </Ctx.Provider>
  )
}
