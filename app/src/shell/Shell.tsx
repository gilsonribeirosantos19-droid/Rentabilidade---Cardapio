import { useState } from 'react'
import './shell.css'
import { Sidebar } from './Sidebar'
import { labelForKey, titleForKey } from './nav'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import { Fornecedores } from '../screens/Fornecedores'
import { Insumos } from '../screens/Insumos'
import { Produtos } from '../screens/Produtos'
import { FichasTecnicas } from '../screens/FichasTecnicas'
import { SaldoEstoque } from '../screens/SaldoEstoque'
import { Movimentacao } from '../screens/Movimentacao'
import { Kardex } from '../screens/Kardex'
import { Saidas } from '../screens/Saidas'
import { Entradas } from '../screens/Entradas'
import { Inventario } from '../screens/Inventario'
import { Inicio } from '../screens/Inicio'
import { EntradasProcessadas } from '../screens/EntradasProcessadas'
import { MonitorNfe } from '../screens/MonitorNfe'
import { AuditoriaConversao } from '../screens/AuditoriaConversao'
import { HistoricoEntradas } from '../screens/HistoricoEntradas'
import { ConsumoInsumos } from '../screens/ConsumoInsumos'
import { Placeholder } from '../screens/Placeholder'

type Tab = { key: string; label: string }

function ScreenFor({ k, label }: { k: string; label: string }) {
  if (k === 'fornecedores') return <Fornecedores />
  if (k === 'insumos') return <Insumos />
  if (k === 'produtos') return <Produtos />
  if (k === 'fichas') return <FichasTecnicas />
  if (k === 'estoque/saldo') return <SaldoEstoque />
  if (k === 'estoque/movimentacao') return <Movimentacao />
  if (k === 'estoque/kardex') return <Kardex />
  if (k === 'estoque/saidas') return <Saidas />
  if (k === 'estoque/entradas') return <Entradas />
  if (k === 'estoque/inventario') return <Inventario />
  if (k === 'fiscal/entradas') return <EntradasProcessadas />
  if (k === 'fiscal/monitor') return <MonitorNfe />
  if (k === 'fiscal/auditoria') return <AuditoriaConversao />
  if (k === 'estoque/rel-entradas') return <HistoricoEntradas />
  if (k === 'estoque/rel-consumo') return <ConsumoInsumos />
  return <Placeholder label={label} />
}

function Home() {
  return (
    <div className="pane">
      <div className="scr-h">Início</div>
      <div className="scr-d">Bem-vindo ao Aiko (versão React). Use o menu à esquerda para abrir as telas.</div>
      <div className="empty" style={{ marginTop: 20 }}>
        🚀 Casca nova funcionando. A tela <b>Cadastros → Fornecedores</b> já está migrada e ligada no Supabase real.
      </div>
    </div>
  )
}

export function Shell() {
  const { usuario, signOut } = useAuth()
  const { lojas, lojaId, setLojaId } = useLoja()
  const [openTabs, setOpenTabs] = useState<Tab[]>([])
  const [active, setActive] = useState('__home')
  const [dived, setDived] = useState<string | null>(null)

  function openScreen(key: string, label: string) {
    if (key === '__home') {
      setActive('__home')
      return
    }
    setOpenTabs((t) => (t.find((x) => x.key === key) ? t : [...t, { key, label }]))
    setActive(key)
  }

  function closeTab(key: string) {
    setOpenTabs((t) => {
      const n = t.filter((x) => x.key !== key)
      if (active === key) setActive(n.length ? n[n.length - 1].key : '__home')
      return n
    })
  }

  const crumbSection = active === '__home' ? 'Início' : labelForKey(active)
  const crumbLong = active === '__home' ? '' : titleForKey(active)
  const hasLong = !!crumbLong && crumbLong !== crumbSection
  // telas que abrem em TELA CHEIA (sem topbar/abas do workspace) — têm cabeçalho próprio e precisam de espaço
  const isFull = active.startsWith('fiscal/')

  return (
    <div className={'shell' + (dived ? ' dived' : '')}>
      <Sidebar activeKey={active} onOpen={openScreen} dived={dived} setDived={setDived} />

      <div className="main">
        {!isFull && <div className="topbar">
          <div className="crumb">
            {hasLong
              ? <><span className="c1">{crumbSection}</span><span className="sep">›</span><span className="c2">{crumbLong}</span></>
              : <span className="c2">{crumbSection}</span>}
          </div>
          <div className="tr">
            <select className="input" style={{ width: 150, height: 34 }} value={lojaId ?? ''} onChange={(e) => setLojaId(e.target.value || null)}>
              <option value="">Todas as lojas</option>
              {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
            <span>{usuario?.nome || usuario?.email || '—'}</span>
            <button className="btn ghost" style={{ height: 32, color: 'var(--red)' }} onClick={() => signOut()}>
              ⎋ Sair
            </button>
          </div>
        </div>}

        {!isFull && <div className="tabs">
          <div className={'tab' + (active === '__home' ? ' on' : '')} onClick={() => setActive('__home')} title="Início">
            🏠
          </div>
          {openTabs.map((t) => (
            <div
              key={t.key}
              className={'tab' + (active === t.key ? ' on' : '')}
              onClick={() => setActive(t.key)}
            >
              {t.label}
              <span className="x" onClick={(e) => { e.stopPropagation(); closeTab(t.key) }}>×</span>
            </div>
          ))}
        </div>}

        <div className="content">
          <div style={{ display: active === '__home' ? 'block' : 'none', height: '100%', overflowY: 'auto' }}>
            <Inicio />
          </div>
          {openTabs.map((t) => (
            <div key={t.key} style={{ display: active === t.key ? 'block' : 'none', height: '100%' }}>
              <ScreenFor k={t.key} label={t.label} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
