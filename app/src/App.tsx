import { useState } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { LojaProvider } from './lib/loja'
import { Login } from './screens/Login'
import { ResetPassword } from './screens/ResetPassword'
import { Shell } from './shell/Shell'
import { PortalShell } from './portal/PortalShell'
import { PortalHub } from './portal/PortalHub'

function Gate() {
  const { session, loading, usuario, recovery, signOut } = useAuth()
  // módulo escolhido no hub: 'hub' = tela de seleção; 'app' = entrou no Estoque (ERP/Portal do Gerente)
  const [modulo, setModulo] = useState<'hub' | 'app'>('hub')
  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    )
  }
  if (recovery) return <ResetPassword />   // veio do link "esqueci minha senha" → definir nova senha
  if (!session) return <Login />
  const perfil = (usuario?.role || usuario?.perfil || '').toLowerCase()

  // 1ª tela após o login: HUB de módulos. "Estoque" entra no app; os demais abrem em nova aba.
  if (modulo === 'hub') return <PortalHub usuario={usuario} perfil={perfil} onEstoque={() => setModulo('app')} signOut={signOut} />

  // entrou no módulo Estoque → app atual, com atalho flutuante de volta ao portal
  const voltar = <button className="phub-back" onClick={() => setModulo('hub')}>⬑ Portal</button>

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
