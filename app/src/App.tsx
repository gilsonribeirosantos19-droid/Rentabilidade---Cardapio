import { AuthProvider, useAuth } from './lib/auth'
import { LojaProvider } from './lib/loja'
import { Login } from './screens/Login'
import { Shell } from './shell/Shell'
import { PortalShell } from './portal/PortalShell'

function Gate() {
  const { session, loading, usuario } = useAuth()
  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    )
  }
  if (!session) return <Login />
  // Gerente cai direto no Portal do Gerente; admin/operador seguem no app normal.
  const perfil = (usuario?.role || usuario?.perfil || '').toLowerCase()
  if (perfil === 'gerente') return <PortalShell />
  return <LojaProvider><Shell /></LojaProvider>
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
