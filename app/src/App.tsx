import { AuthProvider, useAuth } from './lib/auth'
import { LojaProvider } from './lib/loja'
import { Login } from './screens/Login'
import { Shell } from './shell/Shell'

function Gate() {
  const { session, loading } = useAuth()
  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    )
  }
  return session ? <LojaProvider><Shell /></LojaProvider> : <Login />
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
