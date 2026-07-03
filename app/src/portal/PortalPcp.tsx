import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { OrdemPorcionamento } from '../screens/OrdemPorcionamento'
import { OrdemProducao } from '../screens/OrdemProducao'

// Portal › PCP — reusa as telas de LANÇAMENTO do admin (loja fixa = a do gerente).
// Cadastros (Setores, Item de Porcionamento) ficam só no admin.

type Sub = 'porcionamento' | 'producao'
const TABS: [Sub, string][] = [['porcionamento', 'Ordem de Porcionamento'], ['producao', 'Ordem de Produção']]

export function PortalPcp() {
  const { usuario } = useAuth()
  const lojaFixa = usuario?.loja_id || undefined
  const [sub, setSub] = useState<Sub>('porcionamento')

  return (
    <div>
      <div className="p-ttl">PCP — Produção</div>
      <div className="p-sub">Lance as ordens de porcionamento e de produção da sua loja.</div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0', marginBottom: 14 }}>
        {TABS.map(([k, l]) => <button key={k} onClick={() => setSub(k)} style={{ border: 0, background: 'none', padding: '8px 14px', fontSize: 13, fontWeight: sub === k ? 700 : 500, color: sub === k ? '#ea6a0a' : '#64748b', borderBottom: sub === k ? '2px solid #f97316' : '2px solid transparent', cursor: 'pointer', marginBottom: -1 }}>{l}</button>)}
      </div>

      {sub === 'porcionamento' ? <OrdemPorcionamento lojaFixa={lojaFixa} /> : <OrdemProducao lojaFixa={lojaFixa} />}
    </div>
  )
}
