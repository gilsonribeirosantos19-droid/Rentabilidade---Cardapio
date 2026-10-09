import { AuthProvider, useAuth } from './lib/auth'
import { LojaProvider } from './lib/loja'
import { Login } from './screens/Login'
import { ResetPassword } from './screens/ResetPassword'
import { Shell } from './shell/Shell'
import { PortalShell } from './portal/PortalShell'
import { PortalHub } from './portal/PortalHub'

function Gate() {
  const { session, loading, usuario, recovery } = useAuth()
  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    )
  }
  if (recovery) return <ResetPassword />   // veio do link "esqueci minha senha" → definir nova senha
  if (!session) return <Login />
  // Gerente e Supervisor caem direto no Portal do Gerente (multi-loja); admin/operador seguem no ERP.
  const perfil = (usuario?.role || usuario?.perfil || '').toLowerCase()
  const path = typeof window !== 'undefined' ? window.location.pathname.replace(/\/+$/, '') : ''
  if (perfil === 'gerente' || perfil === 'supervisor') return <PortalShell />
  // Admin pode abrir o "Portal das Lojas" pelo atalho no ERP (rota /portal-lojas) — vê todas as lojas.
  const isAdmin = perfil === 'admin' || perfil === 'administrador'
  if (path === '/portal-lojas' && isAdmin && usuario?.tenant_id) return <PortalShell />
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
  return <LojaProvider><Shell /></LojaProvider>
}

export default function App() {
  // PORTAL de módulos num endereço PRÓPRIO (/portal) — separado e opcional.
  // Não afeta o app normal: quem abre app.aikosistema.com continua caindo no login/Portal/ERP de hoje.
  const path = typeof window !== 'undefined' ? window.location.pathname.replace(/\/+$/, '') : ''
  if (path === '/portal') return <PortalHub />

  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
