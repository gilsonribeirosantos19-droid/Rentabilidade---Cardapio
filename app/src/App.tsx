import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { LojaProvider } from './lib/loja'
import { Login } from './screens/Login'
import { ResetPassword } from './screens/ResetPassword'
import { Shell } from './shell/Shell'
import { PortalShell } from './portal/PortalShell'
import { PortalHub } from './portal/PortalHub'

function Gate() {
  const { session, loading, usuario, recovery, signOut } = useAuth()
  // view do portal: 'hub' = tela de seleção de módulos; 'login' = clicou em Estoque e precisa logar;
  // 'app' = dentro do módulo Estoque (ERP/Portal do Gerente, conforme o login da pessoa).
  const [view, setView] = useState<'hub' | 'login' | 'app'>('hub')
  // logou (na tela de login) → entra no módulo; deslogou (Sair dentro do app) → volta pro portal
  useEffect(() => { if (session && view === 'login') setView('app') }, [session, view])
  useEffect(() => { if (!session && view === 'app') setView('hub') }, [session, view])

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    )
  }
  if (recovery) return <ResetPassword />   // veio do link "esqueci minha senha" → definir nova senha
  const perfil = (usuario?.role || usuario?.perfil || '').toLowerCase()

  // PORTAL (tela inicial): mostra os módulos. "Estoque" → tela de login (ou entra, se já logado);
  // os demais abrem em nova aba (cada um com seu próprio login).
  if (view === 'hub') return <PortalHub usuario={session ? usuario : null} perfil={perfil} signOut={signOut} onEstoque={() => setView(session ? 'app' : 'login')} />
  if (view === 'login' && !session) return <Login />

  // dentro do módulo Estoque → app atual + atalho flutuante de volta ao portal
  const voltar = <button className="phub-back" onClick={() => setView('hub')}>⬑ Portal</button>
  // Gerente cai no Portal do Gerente; admin/operador no app normal.
  if (perfil === 'gerente') return <>{<PortalShell />}{voltar}</>
  // Falha FECHADA: sessão válida mas o perfil ainda não resolveu (ex.: releitura vazia
  // logo após a renovação de token idle). Sem saber o perfil, NÃO liberamos o sistema
  // principal — senão um gerente cairia no ERP inteiro. Segura numa reconexão até o
  // perfil (com tenant) carregar. Todo usuário legítimo tem tenant_id.
  if (!usuario?.tenant_id) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
        <div style={{ fontSize: 13, color: '#64748b' }}>Reconectando sua sessão…</div>
        <button onClick={() => window.location.reload()} style={{ fontSize: 13, fontWeight: 600, color: '#334155', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '7px 16px', cursor: 'pointer' }}>Recarregar</button>
      </div>
    )
  }
  return <LojaProvider><Shell />{voltar}</LojaProvider>
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
