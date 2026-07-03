import { useAuth } from '../lib/auth'
import { OrdemPorcionamento } from '../screens/OrdemPorcionamento'
import { OrdemProducao } from '../screens/OrdemProducao'

// Portal › PCP — reusa as telas de LANÇAMENTO do admin (loja fixa = a do gerente).
// A navegação (Porcionamento / Produção) fica na sidebar como submenu.
// Cadastros (Setores, Item de Porcionamento) ficam só no admin.

export function PortalPcp({ view }: { view: 'porcionamento' | 'producao' }) {
  const { usuario } = useAuth()
  const lojaFixa = usuario?.loja_id || undefined

  return (
    <div>
      <div className="p-ttl">{view === 'porcionamento' ? 'Ordem de Porcionamento' : 'Ordem de Produção'}</div>
      <div className="p-sub">{view === 'porcionamento' ? 'Aponte a pesagem do porcionamento da sua loja.' : 'Lance a produção (item com ficha técnica) da sua loja.'}</div>
      {view === 'porcionamento' ? <OrdemPorcionamento lojaFixa={lojaFixa} /> : <OrdemProducao lojaFixa={lojaFixa} />}
    </div>
  )
}
