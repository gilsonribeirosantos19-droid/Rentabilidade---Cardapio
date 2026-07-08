import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { PortalInventario } from './PortalInventario'
import { PortalSolicitacao } from './PortalSolicitacao'
import { PortalPerdas } from './PortalPerdas'
import { PortalEstoque } from './PortalEstoque'
import { PortalPcp } from './PortalPcp'
import { PortalRequisicaoCD } from './PortalRequisicaoCD'
import './portal.css'

// Portal do Gerente — casca (sidebar escura + navegação). Migração fiel do loja.html.
// As abas são preenchidas uma a uma; por enquanto mostram um placeholder.

type TabKey = 'inventario' | 'solicitacao' | 'requisicao-cd' | 'perdas' | 'estoque' | 'pcp-porcionamento' | 'pcp-producao'
const LABEL: Record<TabKey, string> = { inventario: 'Inventário', solicitacao: 'Solicitação de Compra', 'requisicao-cd': 'Requisição ao CD', perdas: 'Perdas', estoque: 'Estoque', 'pcp-porcionamento': 'Ordem de Porcionamento', 'pcp-producao': 'Ordem de Produção' }

const ico = (d: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>{d.split('|').map((p, i) => <path key={i} d={p} />)}</svg>
const ICONS: Record<string, ReactNode> = {
  inventario: ico('M9 11l3 3L22 4|M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'),
  solicitacao: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>,
  perdas: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  estoque: ico('M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4'),
  pcp: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" /></svg>,
  'requisicao-cd': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="1" y="3" width="15" height="13" /><path d="M16 8h4l3 3v5h-7z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>,
}
const OPS: TabKey[] = ['inventario', 'solicitacao', 'perdas', 'estoque']
const PCP_SUB: TabKey[] = ['pcp-porcionamento', 'pcp-producao']

export function PortalShell() {
  const { usuario, signOut, tenantId } = useAuth()
  const [tab, setTab] = useState<TabKey>('inventario')
  const [open, setOpen] = useState(false)
  const [pcpOpen, setPcpOpen] = useState(false)
  const pcpAtivo = tab === 'pcp-porcionamento' || tab === 'pcp-producao'
  const lojaId = usuario?.loja_id

  const { data: loja } = useQuery({ queryKey: ['portal-loja', lojaId], enabled: !!lojaId, queryFn: async () => { const { data } = await supabase.from('lojas').select('nome').eq('id', lojaId!).maybeSingle(); return data as { nome?: string } | null } })
  // O módulo Distribuição só aparece p/ tenants que têm um CD configurado (opcional por cliente)
  const { data: temCd = false } = useQuery({ queryKey: ['portal-tem-cd', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('lojas').select('id').eq('tenant_id', tenantId).eq('is_cd', true).limit(1); return (data?.length ?? 0) > 0 } })
  const opsList: TabKey[] = temCd ? ['inventario', 'solicitacao', 'requisicao-cd', 'perdas', 'estoque'] : OPS
  const lojaNome = loja?.nome || 'Minha loja'
  const inicial = (usuario?.nome || '?')[0].toUpperCase()

  const go = (k: TabKey) => { setTab(k); setOpen(false) }

  return (
    <div className="portal">
      {open && <div className="p-backdrop" onClick={() => setOpen(false)} />}
      <aside className={'p-sidebar' + (open ? ' open' : '')}>
        <div className="p-logo"><div className="b">Aiko</div><div className="s">Portal do Gerente</div></div>
        <div className="p-loja"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>{lojaNome}</div>
        <nav className="p-nav">
          <div>
            <div className="p-navlabel">Operações</div>
            {opsList.map((k) => (
              <button key={k} className={'p-navitem' + (tab === k ? ' on' : '')} onClick={() => go(k)}>{ICONS[k]}{LABEL[k]}</button>
            ))}
          </div>
          <div>
            <div className="p-navlabel">Produção</div>
            <button className={'p-navitem' + (pcpAtivo ? ' on' : '')} onClick={() => setPcpOpen((o) => !o)}>{ICONS.pcp}PCP<span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}>{(pcpOpen || pcpAtivo) ? '▾' : '▸'}</span></button>
            {(pcpOpen || pcpAtivo) && PCP_SUB.map((k) => (
              <button key={k} className={'p-navitem' + (tab === k ? ' on' : '')} style={{ paddingLeft: 34, fontSize: 12 }} onClick={() => go(k)}>{LABEL[k]}</button>
            ))}
          </div>
        </nav>
        <div className="p-foot">
          <div className="p-user"><div className="p-avatar">{inicial}</div><div><div className="n">{usuario?.nome || '—'}</div><div className="p">Gerente</div></div></div>
          <button className="p-sair" onClick={() => signOut()}>⎋ Sair</button>
        </div>
      </aside>

      <div className="p-main">
        <div className="p-topbar">
          <button className="p-hamb" onClick={() => setOpen(true)}>☰</button>
          <div className="p-title">Portal do Gerente — {lojaNome}</div>
          <div className="p-conn"><span className="p-dot" /> conectado</div>
        </div>
        <div className="p-content">
          {tab === 'inventario' ? <PortalInventario /> : tab === 'solicitacao' ? <PortalSolicitacao /> : tab === 'requisicao-cd' ? <PortalRequisicaoCD /> : tab === 'perdas' ? <PortalPerdas /> : tab === 'estoque' ? <PortalEstoque /> : tab === 'pcp-porcionamento' ? <PortalPcp view="porcionamento" /> : tab === 'pcp-producao' ? <PortalPcp view="producao" /> : (
            <div className="p-holder">
              <div className="t">{LABEL[tab]}</div>
              <div>Esta área será migrada em seguida (fiel ao portal atual).</div>
            </div>
          )}
        </div>
      </div>

      <nav className="p-mobnav">
        {(['inventario', 'solicitacao', 'perdas', 'estoque'] as TabKey[]).map((k) => (
          <button key={k} className={'p-mobitem' + (tab === k ? ' on' : '')} onClick={() => go(k)}>{ICONS[k]}<span>{k === 'solicitacao' ? 'Compras' : LABEL[k]}</span></button>
        ))}
      </nav>
    </div>
  )
}
