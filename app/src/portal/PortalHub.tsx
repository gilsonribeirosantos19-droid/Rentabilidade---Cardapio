import { useMemo, type ReactNode } from 'react'
import './portalhub.css'

// Portal / Hub de módulos — primeira tela após o login. Mostra os sistemas da rede
// (Estoque é interno = entra no próprio app; os demais abrem em nova aba).
// v1: todos os perfis veem todos os módulos. Restrição por perfil entra depois
// (tabela portal_sistemas/portal_permissoes + tela de admin).

type Sistema = { id: string; nome: string; desc: string; icon: string; cor: string; url: string; interno?: boolean }
const SISTEMAS: Sistema[] = [
  { id: 'estoque', nome: 'Estoque', desc: 'Inventário, entradas, fichas técnicas e fechamento mensal.', icon: 'box', cor: '#e07b1a', url: 'https://app.aikosistema.com/', interno: true },
  { id: 'avaliacoes', nome: 'Avaliações', desc: 'Pesquisa com clientes, NPS e Central de Tratativas.', icon: 'star', cor: '#2563eb', url: 'https://avaliacao.aikosistema.com/painel.html' },
  { id: 'checklist', nome: 'Checklist', desc: 'Abertura, fechamento, produção, auditoria e avaliação de garçons.', icon: 'check', cor: '#14315f', url: 'https://checklist.aikosistema.com/' },
  { id: 'manutencao', nome: 'Manutenção', desc: 'Chamados, preventivas e pendências prediais das lojas.', icon: 'wrench', cor: '#b45309', url: 'https://manutencao.aikosistema.com/' },
]
// mapa perfil → módulos. Vazio = vê todos (v1). Ex. futuro: { garçom: ['checklist'] }
const PERM: Record<string, string[]> = {}
const permitidos = (perfil: string) => PERM[perfil] ?? SISTEMAS.map((s) => s.id)

const ICO: Record<string, ReactNode> = {
  box: <path d="M20 7 12 3 4 7m16 0-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />,
  star: <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9z" />,
  check: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.7-.7-.7-2.7z" />,
}
const svg = (n: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{ICO[n]}</svg>

export function PortalHub({ usuario, perfil = '', lojaNome, onEstoque, signOut }: {
  usuario?: { nome?: string } | null
  perfil?: string
  lojaNome?: string
  onEstoque: () => void
  signOut?: () => void
}) {
  const vis = useMemo(() => SISTEMAS.filter((s) => permitidos(perfil).includes(s.id)), [perfil])
  const nome = (usuario?.nome || '').split(' ')[0]
  const inicial = (usuario?.nome || '?')[0].toUpperCase()
  const h = new Date().getHours()
  const saud = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
  const hoje = useMemo(() => {
    const d = new Date()
    const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
    const mes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
    return `${dias[d.getDay()]}, ${d.getDate()} de ${mes[d.getMonth()]}`
  }, [])

  const abrir = (s: Sistema) => { if (s.interno) onEstoque(); else window.open(s.url, '_blank', 'noopener,noreferrer') }

  return (
    <div className="phub">
      <div className="phub-hero">
        <div className="phub-bigA" aria-hidden="true">A</div>
        <div className="phub-hero-in">
          <div className="phub-top">
            <div className="phub-logo">A</div>
            <div className="phub-brand"><b>Aiko</b><span>{lojaNome || 'Rede'}</span></div>
            {usuario && (
              <div className="phub-tr">
                <div className="phub-uchip"><span className="phub-uav">{inicial}</span><span>{usuario?.nome || '—'}</span></div>
                {signOut && <button className="phub-sair" onClick={signOut}>Sair</button>}
              </div>
            )}
          </div>
          <div className="phub-greet">
            <div className="phub-eyebrow">{hoje}</div>
            <h1>{nome ? `${saud}, ${nome}.` : `${saud}! Bem-vindo à rede Aiko.`}</h1>
            <p className="phub-lead">Estoque, avaliações, checklist e manutenção da rede num só lugar. Escolha por onde quer começar.</p>
          </div>
        </div>
      </div>

      <div className="phub-body">
        <div className="phub-wrap">
          <div className="phub-grid">
            {vis.map((s) => (
              <button key={s.id} className="phub-card" onClick={() => abrir(s)}>
                <div className="phub-ico" style={{ background: s.cor }}>{svg(s.icon)}</div>
                <h3>{s.nome}</h3>
                <p>{s.desc}</p>
                <span className="phub-enter">Entrar →</span>
              </button>
            ))}
          </div>

          <div className="phub-tips">
            <div className="phub-tip"><div className="phub-ti">📱</div><div><b>Use no celular como app</b><span>No navegador do celular, toque em "Adicionar à tela inicial".</span></div></div>
            <div className="phub-tip"><div className="phub-ti">🔑</div><div><b>Um acesso para tudo</b><span>Você entra aqui e abre os sistemas liberados para o seu usuário.</span></div></div>
            <div className="phub-tip"><div className="phub-ti">💬</div><div><b>Precisa de ajuda?</b><span>Fale com o suporte pelo WhatsApp da gestão.</span></div></div>
          </div>
        </div>
      </div>
    </div>
  )
}
