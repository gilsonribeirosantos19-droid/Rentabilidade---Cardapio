import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react'
import './shell.css'
import { Sidebar } from './Sidebar'
import { labelForKey, titleForKey, ADMIN_ONLY_KEYS } from './nav'
import { useAuth } from '../lib/auth'
import { usePerms } from '../lib/perms'
import { useLoja } from '../lib/loja'
import { Novidades } from './Novidades'
import { Ajuda } from './Ajuda'
// Telas carregadas SOB DEMANDA (2026-11-21): cada tela vira um arquivo à parte, baixado só na 1ª vez que abre.
// Antes o app baixava as ~70 telas de uma vez ao entrar (~2 MB). Visão geral (Inicio) segue junto.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lz(f: () => Promise<Record<string, any>>, nome: string) { return lazy(() => f().then((m) => ({ default: m[nome] as ComponentType<any> }))) }
const AjudaPage = lz(() => import('../screens/AjudaPage'), 'AjudaPage')
const Fornecedores = lz(() => import('../screens/Fornecedores'), 'Fornecedores')
const Insumos = lz(() => import('../screens/Insumos'), 'Insumos')
const Produtos = lz(() => import('../screens/Produtos'), 'Produtos')
const FichasTecnicas = lz(() => import('../screens/FichasTecnicas'), 'FichasTecnicas')
const SaldoEstoque = lz(() => import('../screens/SaldoEstoque'), 'SaldoEstoque')
const Movimentacao = lz(() => import('../screens/Movimentacao'), 'Movimentacao')
const Kardex = lz(() => import('../screens/Kardex'), 'Kardex')
const Saidas = lz(() => import('../screens/Saidas'), 'Saidas')
const Entradas = lz(() => import('../screens/Entradas'), 'Entradas')
const Inventario = lz(() => import('../screens/Inventario'), 'Inventario')
import { Inicio } from '../screens/Inicio'
const EntradasProcessadas = lz(() => import('../screens/EntradasProcessadas'), 'EntradasProcessadas')
const MonitorNfe = lz(() => import('../screens/MonitorNfe'), 'MonitorNfe')
const AuditoriaConversao = lz(() => import('../screens/AuditoriaConversao'), 'AuditoriaConversao')
const NfeExcluidas = lz(() => import('../screens/NfeExcluidas'), 'NfeExcluidas')
const DistribuicaoCentral = lz(() => import('../screens/DistribuicaoCentral'), 'DistribuicaoCentral')
const Metas = lz(() => import('../screens/Metas'), 'Metas')
const DistribuicaoNovaRequisicao = lz(() => import('../screens/DistribuicaoNovaRequisicao'), 'DistribuicaoNovaRequisicao')
const DistribuicaoRomaneios = lz(() => import('../screens/DistribuicaoRomaneios'), 'DistribuicaoRomaneios')
const DistribuicaoEmBreve = lz(() => import('../screens/DistribuicaoEmBreve'), 'DistribuicaoEmBreve')
const HistoricoEntradas = lz(() => import('../screens/HistoricoEntradas'), 'HistoricoEntradas')
const ConsumoInsumos = lz(() => import('../screens/ConsumoInsumos'), 'ConsumoInsumos')
const HistoricoCustos = lz(() => import('../screens/HistoricoCustos'), 'HistoricoCustos')
const CurvaABC = lz(() => import('../screens/CurvaABC'), 'CurvaABC')
const InflacaoInsumos = lz(() => import('../screens/InflacaoInsumos'), 'InflacaoInsumos')
const ResumoEstoque = lz(() => import('../screens/ResumoEstoque'), 'ResumoEstoque')
const AjusteEstoque = lz(() => import('../screens/AjusteEstoque'), 'AjusteEstoque')
const AjusteCustoMedio = lz(() => import('../screens/AjusteCustoMedio'), 'AjusteCustoMedio')
const Recalcular = lz(() => import('../screens/Recalcular'), 'Recalcular')
const Compras = lz(() => import('../screens/Compras'), 'Compras')
const Divergencias = lz(() => import('../screens/Divergencias'), 'Divergencias')
const Rendimentos = lz(() => import('../screens/Rendimentos'), 'Rendimentos')
const CmvTeoricoReal = lz(() => import('../screens/CmvTeoricoReal'), 'CmvTeoricoReal')
const Precificacao = lz(() => import('../screens/Precificacao'), 'Precificacao')
const ImpactoMargem = lz(() => import('../screens/ImpactoMargem'), 'ImpactoMargem')
const Fechamento = lz(() => import('../screens/Fechamento'), 'Fechamento')
const Dre = lz(() => import('../screens/Dre'), 'Dre')
const DreOrcamento = lz(() => import('../screens/DreOrcamento'), 'DreOrcamento')
const DrePlanoContas = lz(() => import('../screens/DrePlanoContas'), 'DrePlanoContas')
const DreLancamentos = lz(() => import('../screens/DreLancamentos'), 'DreLancamentos')
const FaturamentoVendas = lz(() => import('../screens/FaturamentoVendas'), 'FaturamentoVendas')
const VendasDiario = lz(() => import('../screens/VendasDiario'), 'VendasDiario')
const MonitorVendas = lz(() => import('../screens/MonitorVendas'), 'MonitorVendas')
const EngenhariaCardapio = lz(() => import('../screens/EngenhariaCardapio'), 'EngenhariaCardapio')
const CurvaAbcVendas = lz(() => import('../screens/CurvaAbcVendas'), 'CurvaAbcVendas')
const SugestaoCompra = lz(() => import('../screens/SugestaoCompra'), 'SugestaoCompra')
const Cotacao = lz(() => import('../screens/Cotacao'), 'Cotacao')
const ComprasFornecedor = lz(() => import('../screens/ComprasFornecedor'), 'ComprasFornecedor')
const ConfigGeral = lz(() => import('../screens/ConfigGeral'), 'ConfigGeral')
const ConfigParametros = lz(() => import('../screens/ConfigParametros'), 'ConfigParametros')
const ConfigAuditoria = lz(() => import('../screens/ConfigAuditoria'), 'ConfigAuditoria')
const ConfigUsuarios = lz(() => import('../screens/ConfigUsuarios'), 'ConfigUsuarios')
const ConfigPermissoes = lz(() => import('../screens/ConfigPermissoes'), 'ConfigPermissoes')
const SetorProducao = lz(() => import('../screens/SetorProducao'), 'SetorProducao')
const ItemPorcionamento = lz(() => import('../screens/ItemPorcionamento'), 'ItemPorcionamento')
const OrdemPorcionamento = lz(() => import('../screens/OrdemPorcionamento'), 'OrdemPorcionamento')
const OrdemProducao = lz(() => import('../screens/OrdemProducao'), 'OrdemProducao')
const MonitorProducao = lz(() => import('../screens/MonitorProducao'), 'MonitorProducao')
const PlanejamentoProducao = lz(() => import('../screens/PlanejamentoProducao'), 'PlanejamentoProducao')
const CalendarioProducao = lz(() => import('../screens/CalendarioProducao'), 'CalendarioProducao')
const AtividadesProducao = lz(() => import('../screens/AtividadesProducao'), 'AtividadesProducao')
const EtiquetasPrazos = lz(() => import('../screens/EtiquetasPrazos'), 'EtiquetasPrazos')
const EtiquetasEmitir = lz(() => import('../screens/EtiquetasEmitir'), 'EtiquetasEmitir')
const EtiquetasBaixa = lz(() => import('../screens/EtiquetasBaixa'), 'EtiquetasBaixa')
const EtiquetasLista = lz(() => import('../screens/EtiquetasLista'), 'EtiquetasLista')
const EtiquetasDashboard = lz(() => import('../screens/EtiquetasDashboard'), 'EtiquetasDashboard')
const EtiquetasRelatorios = lz(() => import('../screens/EtiquetasRelatorios'), 'EtiquetasRelatorios')
const EtiquetasConfig = lz(() => import('../screens/EtiquetasConfig'), 'EtiquetasConfig')
const Placeholder = lz(() => import('../screens/Placeholder'), 'Placeholder')

import { TabBar } from './TabBar'
import { CommandPalette } from './CommandPalette'
import { fecharAbas, moverAba, type Tab } from './tabs'

function ScreenFor({ k, label, isAdmin }: { k: string; label: string; isAdmin: boolean }) {
  const { podeVer } = usePerms()
  const { lojaId, lojas } = useLoja()
  // FAIL-CLOSED: tela restrita a admin não renderiza pra não-admin (defesa além do menu escondido).
  if (ADMIN_ONLY_KEYS.has(k) && !isAdmin) {
    return <div className="pane"><div className="scr-h">Acesso restrito</div><div className="empty" style={{ marginTop: 20 }}>Esta tela é exclusiva de administradores.</div></div>
  }
  // RBAC: bloqueia a tela se o grupo do usuário não tem permissão de ver o módulo dela.
  if (!podeVer(k)) {
    return <div className="pane"><div className="scr-h">Acesso restrito</div><div className="empty" style={{ marginTop: 20 }}>Você não tem permissão para acessar esta tela. Fale com o administrador.</div></div>
  }
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
  if (k === 'fiscal/excluidas') return <NfeExcluidas />
  if (k === 'distribuicao/central') return <DistribuicaoCentral />
  if (k === 'distribuicao/nova') return <DistribuicaoNovaRequisicao />
  if (k === 'distribuicao/romaneios') return <DistribuicaoRomaneios />
  if (k === 'distribuicao/nfe') return <DistribuicaoEmBreve titulo="NF-e de Transferência" sub="Notas fiscais de transferência CD → filiais" fase="Fase 3" texto="Aqui o CD vai emitir a NF-e de transferência (CFOP 5152) para cada envio às filiais, direto na SIEG. A nota cairá automaticamente no recebimento da filial. Depende da ativação da conta SIEG." />
  if (k === 'estoque/rel-entradas') return <HistoricoEntradas />
  if (k === 'estoque/rel-consumo') return <ConsumoInsumos />
  if (k === 'estoque/rel-custos') return <HistoricoCustos />
  if (k === 'estoque/abc') return <CurvaABC />
  if (k === 'estoque/inflacao') return <InflacaoInsumos />
  if (k === 'estoque/resumo') return <ResumoEstoque />
  if (k === 'ajustes/estoque') return <AjusteEstoque />
  if (k === 'ajustes/custo') return <AjusteCustoMedio />
  if (k === 'ajustes/recalcular') return <Recalcular />
  if (k === 'compras/pedidos') return <Compras />
  if (k === 'compras/sugestao') return <SugestaoCompra />
  if (k === 'compras/cotacao') return <Cotacao />
  if (k === 'compras/por-fornecedor') return <ComprasFornecedor />
  if (k === 'ajuda') return <AjudaPage />
  if (k === 'config/geral') return <ConfigGeral />
  if (k === 'config/auditoria') return <ConfigAuditoria />
  if (k === 'config/parametros') return <ConfigParametros />
  if (k === 'config/usuarios') return <ConfigUsuarios />
  if (k === 'config/permissoes') return <ConfigPermissoes />
  if (k === 'pcp/setores') return <SetorProducao />
  if (k === 'pcp/itens-porc') return <ItemPorcionamento />
  if (k === 'pcp/oporc') return <OrdemPorcionamento />
  if (k === 'pcp/op') return <OrdemProducao />
  if (k === 'pcp/monitor') return <MonitorProducao />
  if (k === 'pcp/planejamento') return <PlanejamentoProducao />
  if (k === 'pcp/calendario') return <CalendarioProducao />
  if (k === 'pcp/atividades') return <AtividadesProducao />
  if (k === 'gestao/metas') return <Metas />
  if (k === 'gestao/divergencias') return <Divergencias />
  if (k === 'gestao/rendimentos') return <Rendimentos />
  if (k === 'gestao/cmv') return <CmvTeoricoReal />
  if (k === 'gestao/precificacao') return <Precificacao />
  if (k === 'gestao/impacto-margem') return <ImpactoMargem />
  if (k === 'gestao/fechamento') return <Fechamento />
  if (k === 'gestao/dre') return <Dre />
  if (k === 'gestao/dre-orcamento') return <DreOrcamento />
  if (k === 'gestao/dre-plano') return <DrePlanoContas />
  if (k === 'gestao/dre-lancamentos') return <DreLancamentos />
  if (k === 'pdv/faturamento') return <FaturamentoVendas />
  if (k === 'pdv/vendas-dia') return <VendasDiario />
  if (k === 'pdv/importar') return <MonitorVendas />
  if (k === 'pdv/engenharia') return <EngenhariaCardapio />
  if (k === 'pdv/abc') return <CurvaAbcVendas />
  if (k === 'etiquetas/prazos') return <EtiquetasPrazos />
  if (k === 'etiquetas/emitir') return <EtiquetasEmitir lojaId={lojaId} />
  if (k === 'etiquetas/baixa') return <EtiquetasBaixa />
  if (k === 'etiquetas/lista') return <EtiquetasLista lojaId={lojaId} />
  if (k === 'etiquetas/dashboard') return <EtiquetasDashboard lojaId={lojaId} />
  if (k === 'etiquetas/relatorios') return <EtiquetasRelatorios lojaId={lojaId} lojas={lojas} />
  if (k === 'etiquetas/config') return <EtiquetasConfig lojas={lojas} />
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
  const isAdmin = (usuario?.role || usuario?.perfil || '').toLowerCase().startsWith('admin')
  const [userMenu, setUserMenu] = useState(false)
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

  // Canal p/ uma tela pedir pra abrir outra (ex.: clicar numa divergência → vai resolver).
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent).detail; if (d?.key) openScreen(d.key, d.label || d.key) }
    window.addEventListener('aiko:open-screen', h as EventListener)
    return () => window.removeEventListener('aiko:open-screen', h as EventListener)
  }, [])

  // fecha 1 ou várias abas; se a ativa sair, abre a vizinha (regra em ./tabs.ts)
  function closeTabs(keys: string[]) {
    const r = fecharAbas(openTabs, active, keys)
    setOpenTabs(r.tabs)
    setActive(r.active)
  }

  const crumbSection = active === '__home' ? 'Visão geral' : labelForKey(active)
  const crumbLong = active === '__home' ? '' : titleForKey(active)
  const hasLong = !!crumbLong && crumbLong !== crumbSection
  // telas que abrem em TELA CHEIA (sem topbar/abas do workspace) — têm cabeçalho próprio e precisam de espaço
  const isFull = active.startsWith('fiscal/')

  return (
    <div className={'shell' + (dived ? ' dived' : '')}>
      <CommandPalette onOpen={openScreen} />
      <Sidebar activeKey={active} onOpen={openScreen} dived={dived} setDived={setDived} />

      <div className="main">
        {!isFull && <div className="topbar">
          <div className="crumb">
            {hasLong
              ? <><span className="c1">{crumbSection}</span><span className="sep">›</span><span className="c2">{crumbLong}</span></>
              : <span className="c2">{crumbSection}</span>}
          </div>
          <div className="tr">
            {/* telas com filtro de loja próprio ou de config do tenant escondem o seletor global de loja */}
            {!['pdv/importar', 'pdv/faturamento', 'pdv/vendas-dia', 'pdv/engenharia', 'pdv/abc', 'compras/sugestao', 'pcp/setores', 'pcp/itens-porc', 'pcp/calendario', 'pcp/atividades', 'gestao/dre', 'gestao/dre-orcamento', 'gestao/dre-plano', 'gestao/dre-lancamentos'].includes(active) && !active.startsWith('config/') && (
              <select className="input" style={{ width: 150, height: 34 }} value={lojaId ?? ''} onChange={(e) => setLojaId(e.target.value || null)}>
                <option value="">Todas as lojas</option>
                {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            )}
            <button className="cmdk-btn" title="Buscar e abrir uma tela (Ctrl+K)" onClick={() => window.dispatchEvent(new Event('aiko:busca-telas'))}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <span>Buscar tela</span><kbd>Ctrl K</kbd>
            </button>
            <Ajuda onOpenCentral={() => openScreen('ajuda', 'Central de Ajuda')} />
            <Novidades />
            <div style={{ position: 'relative' }}>
              <button className="btn ghost" style={{ height: 32, display: 'flex', alignItems: 'center', gap: 7 }} onClick={() => setUserMenu((o) => !o)}>
                <span>{usuario?.nome?.trim().split(/\s+/)[0] || usuario?.email || '—'}</span>
                <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>
              </button>
              {userMenu && (
                <>
                  <div onClick={() => setUserMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                  <div style={{ position: 'absolute', right: 0, top: 38, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 12px 30px rgba(15,39,68,.16)', minWidth: 200, zIndex: 50, overflow: 'hidden', padding: 4 }}>
                    {isAdmin && <button onClick={() => { window.location.href = '/portal-lojas' }} onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')} onMouseLeave={(e) => (e.currentTarget.style.background = 'none')} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', background: 'none', border: 'none', borderRadius: 7, padding: '10px 12px', font: 'inherit', fontSize: 13, fontWeight: 600, color: '#334155', cursor: 'pointer' }}>🏬 Portal das Lojas</button>}
                    <button onClick={() => signOut()} onMouseEnter={(e) => (e.currentTarget.style.background = '#fef2f2')} onMouseLeave={(e) => (e.currentTarget.style.background = 'none')} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', background: 'none', border: 'none', borderRadius: 7, padding: '10px 12px', font: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--red)', cursor: 'pointer' }}>⎋ Sair</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>}

        {!isFull && <TabBar tabs={openTabs} active={active} onActivate={setActive} onClose={closeTabs}
          onMove={(from, to) => setOpenTabs((t) => moverAba(t, from, to))} />}

        <div className="content">
          <div style={{ display: active === '__home' ? 'block' : 'none', height: '100%', overflowY: 'auto' }}>
            <Inicio />
          </div>
          {openTabs.map((t) => (
            <div key={t.key} style={{ display: active === t.key ? 'block' : 'none', height: '100%' }}>
              {/* tela sob demanda: enquanto o arquivo dela baixa (só na 1ª vez), mostra "Carregando…" */}
              <Suspense fallback={<div className="empty">Carregando…</div>}>
                <ScreenFor k={t.key} label={t.label} isAdmin={isAdmin} />
              </Suspense>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
