import { useMemo, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import './portalhub.css'

// Portal / Hub de módulos — primeira tela após o login. Mostra os sistemas da rede
// (Estoque é interno = entra no próprio app; os demais abrem em nova aba).
// v1: todos os perfis veem todos os módulos. Restrição por perfil entra depois
// (tabela portal_sistemas/portal_permissoes + tela de admin).

// url = pra onde ir no fallback (login normal). sso = página /sso do sistema que recebe o crachá
// (entrar direto). Estoque é o próprio AIKO (já logado) → sem sso.
type Sistema = { id: string; nome: string; desc: string; icon: string; cor: string; url: string; sso?: string; interno?: boolean }
const SISTEMAS: Sistema[] = [
  { id: 'estoque', nome: 'Estoque', desc: 'Inventário, entradas, fichas técnicas e fechamento mensal.', icon: 'box', cor: '#e07b1a', url: '/app' },
  { id: 'avaliacoes', nome: 'Avaliações', desc: 'Pesquisa com clientes, NPS e Central de Tratativas.', icon: 'star', cor: '#2563eb', url: 'https://avaliacao.aikosistema.com/', sso: 'https://avaliacao.aikosistema.com/sso' },
  { id: 'checklist', nome: 'Checklist', desc: 'Abertura, fechamento, produção, auditoria e avaliação de garçons.', icon: 'check', cor: '#14315f', url: 'https://checklist.aikosistema.com/', sso: 'https://checklist.aikosistema.com/sso' },
  { id: 'manutencao', nome: 'Manutenção', desc: 'Chamados, preventivas e pendências prediais das lojas.', icon: 'wrench', cor: '#b45309', url: 'https://manutencao.aikosistema.com/', sso: 'https://manutencao.aikosistema.com/sso' },
]

const ICO: Record<string, ReactNode> = {
  box: <path d="M20 7 12 3 4 7m16 0-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />,
  star: <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9z" />,
  check: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.7-.7-.7-2.7z" />,
}
const svg = (n: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{ICO[n]}</svg>

export function PortalHub({ usuario, lojaNome, signOut }: {
  usuario?: { nome?: string; sistemas_rede?: string[] | null } | null
  perfil?: string
  lojaNome?: string
  signOut?: () => void
}) {
  // LIBERADO: Estoque (o próprio AIKO / portal do gerente) sempre + os sistemas em que a pessoa
  // foi CADASTRADA (sistemas_rede). REGRA "na dúvida NEGA": sem o sistema na lista (null/vazio
  // incluídos) = NÃO liberado → card com cadeado, não clicável → a pessoa nem chega no login.
  // Admin segue a MESMA regra (o acesso dele é preenchido no cadastro, não por ser admin).
  const redes = usuario?.sistemas_rede
  const liberado = (s: Sistema) => s.id === 'estoque' || (redes?.includes(s.id) ?? false)
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

  // Todos os cards abrem em NOVA aba → o hub nunca fecha (fica na aba dele).
  // ENTRAR DIRETO: pede um crachá (sso-emitir) e abre o sistema já com ele (/sso#t=...).
  // Estoque é o próprio AIKO (já logado) → abre direto. Qualquer falha cai no login normal.
  // CELULAR/TABLET: abre na MESMA aba — no iPhone (Safari/WhatsApp) a aba nova nascia
  // em about:blank e nunca recebia o endereço depois do await (tela branca).
  const abrir = async (s: Sistema) => {
    const mobile = window.matchMedia?.('(pointer: coarse)').matches
    if (mobile) {
      if (!s.sso) { window.location.href = s.url; return }
      try {
        const { data } = await supabase.functions.invoke('sso-emitir', { body: { sistema: s.id } })
        const token = (data as { ok?: boolean; token?: string })?.token
        if (token) { window.location.href = `${s.sso}#t=${encodeURIComponent(token)}`; return }
      } catch { /* cai no login normal */ }
      window.location.href = s.url
      return
    }
    if (!s.sso) { window.open(s.url, '_blank', 'noopener,noreferrer'); return }
    const w = window.open('about:blank', '_blank')   // abre JÁ (gesto do usuário) p/ não ser bloqueado
    try {
      const { data } = await supabase.functions.invoke('sso-emitir', { body: { sistema: s.id } })
      const token = (data as { ok?: boolean; token?: string })?.token
      if (token) { if (w) w.location.href = `${s.sso}#t=${encodeURIComponent(token)}`; return }
    } catch { /* cai no fallback abaixo */ }
    if (w) w.location.href = s.url   // fallback: login normal do sistema
  }

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
            {SISTEMAS.map((s) => liberado(s) ? (
              <button key={s.id} className="phub-card" onClick={() => abrir(s)}>
                <div className="phub-ico" style={{ background: s.cor }}>{svg(s.icon)}</div>
                <h3>{s.nome}</h3>
                <p>{s.desc}</p>
                <span className="phub-enter">Entrar →</span>
              </button>
            ) : (
              <div key={s.id} className="phub-card locked" aria-disabled="true" title="Você não tem acesso a este sistema. Fale com o suporte da gestão.">
                <div className="phub-ico" style={{ background: s.cor }}>{svg(s.icon)}</div>
                <h3>{s.nome}</h3>
                <p>{s.desc}</p>
                <span className="phub-enter"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg> Sem acesso</span>
              </div>
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
