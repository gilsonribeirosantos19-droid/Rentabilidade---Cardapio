import { AuthProvider, useAuth } from './lib/auth'
import { LojaProvider } from './lib/loja'
import { Login } from './screens/Login'
import { ResetPassword } from './screens/ResetPassword'
import { Shell } from './shell/Shell'
import { PortalShell } from './portal/PortalShell'
import { PortalHub } from './portal/PortalHub'

function Gate() {
  const { session, loading, usuario, recovery, signOut } = useAuth()
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
  // Falha FECHADA: sessão válida mas o perfil/tenant ainda não resolveu (ex.: releitura vazia logo
  // após a renovação de token idle). Sem saber quem é, NÃO liberamos nada — segura numa reconexão.
  // Todo usuário legítimo tem tenant_id. Vem ANTES de qualquer rota.
  if (!usuario?.tenant_id) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
        <div style={{ fontSize: 13, color: '#64748b' }}>Reconectando sua sessão…</div>
        <button onClick={() => window.location.reload()} style={{ fontSize: 13, fontWeight: 600, color: '#334155', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '7px 16px', cursor: 'pointer' }}>Recarregar</button>
      </div>
    )
  }
  // O HUB é a ENTRADA: raiz ("") e /portal mostram o hub pra TODOS os perfis (depois do login).
  // O app de trabalho fica em /app (e nas rotas internas); o card "Estoque" do hub leva pra lá.
  if (path === '' || path === '/portal') return <PortalHub usuario={usuario} perfil={perfil} signOut={signOut} />
  // Gerente/Supervisor: app de trabalho = Portal do gerente (multi-loja). Admin/operador = ERP.
  if (perfil === 'gerente' || perfil === 'supervisor') return <PortalShell />
  // Admin pode abrir o "Portal das Lojas" pelo atalho no ERP (rota /portal-lojas) — vê todas as lojas.
  const isAdmin = perfil === 'admin' || perfil === 'administrador'
  if (path === '/portal-lojas' && isAdmin) return <PortalShell />
  return <LojaProvider><Shell /></LojaProvider>
}

export default function App() {
  // O hub da rede (/portal) agora é tratado DENTRO do Gate — exige login (ver Gate()).
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
