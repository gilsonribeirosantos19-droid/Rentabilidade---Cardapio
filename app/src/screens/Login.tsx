import { useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import './login.css'

// mensagens do Supabase (inglês) traduzidas; o resto aparece cru pra diagnóstico
function traduzErro(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha inválidos.'
  if (/email not confirmed/i.test(msg)) return 'E-mail ainda não confirmado. Verifique sua caixa de entrada.'
  if (/only request this after|rate limit|too many/i.test(msg)) return 'Muitas tentativas. Aguarde um instante e tente de novo.'
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'Sem conexão com o servidor. Verifique a internet.'
  return msg // qualquer outro: mostra o texto real pra sabermos a causa
}

export function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErro(''); setOk('')
    setLoading(true)
    const { error } = await signIn(email.trim(), senha)
    setLoading(false)
    if (error) setErro(traduzErro(error))
  }

  async function esqueciSenha() {
    setErro(''); setOk('')
    const mail = email.trim()
    if (!mail) { setErro('Digite seu e-mail acima para receber o link de redefinição.'); return }
    const { error } = await supabase.auth.resetPasswordForEmail(mail, {
      redirectTo: window.location.origin,   // volta pro PRÓPRIO app (preview ou produção) → tela de nova senha
    })
    if (error) setErro(traduzErro(error.message))
    else setOk('Link de redefinição enviado! Verifique seu e-mail (inclusive o spam).')
  }

  return (
    <div className="lg-wrap">
      {/* MARCA */}
      <div className="lg-brand">
        <div className="lg-btop">
          <img className="lg-img" src="/aiko_marca.png" alt="AIKO" />
          <div>
            <b>AIKO</b>
            <span className="lg-uline" />
          </div>
        </div>

        <div className="lg-mid">
          <h1>
            Gestão inteligente para o seu <span>restaurante</span>.
          </h1>
          <p>
            Controle de estoque, custos e rentabilidade num só lugar — com a precisão que o seu
            negócio merece.
          </p>

          <div className="lg-feat">
            <div className="ic">
              <svg viewBox="0 0 24 24">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4z" />
                <polyline points="3.3 7 12 12 20.7 7" />
              </svg>
            </div>
            <div>
              <div className="ft">Estoque em tempo real</div>
              <div className="fd">Saldo, custo médio e movimentação por loja.</div>
            </div>
          </div>
          <div className="lg-feat">
            <div className="ic">
              <svg viewBox="0 0 24 24">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
            <div>
              <div className="ft">CMV e rentabilidade</div>
              <div className="fd">Saiba quanto cada prato realmente lucra.</div>
            </div>
          </div>
          <div className="lg-feat">
            <div className="ic">
              <svg viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <div>
              <div className="ft">Fichas técnicas</div>
              <div className="fd">Receitas, rendimentos e custo automático.</div>
            </div>
          </div>
        </div>

        <div className="lg-foot">© 2026 Aiko · Todos os direitos reservados</div>
      </div>

      {/* FORM */}
      <div className="lg-panel">
        <form className="lg-form" onSubmit={submit}>
          <h2>Acesse sua conta</h2>
          <div className="sub">Bem-vindo de volta! Entre para continuar.</div>

          {erro && <div className="lg-err">{erro}</div>}
          {ok && <div className="lg-err" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#16a34a' }}>{ok}</div>}

          <div className="lg-fld">
            <label>E-mail</label>
            <div className="lg-inp">
              <input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
              <span className="ic">
                <svg viewBox="0 0 24 24">
                  <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </span>
            </div>
          </div>

          <div className="lg-fld">
            <label>Senha</label>
            <div className="lg-inp">
              <input
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
              <button type="button" className="ic" onClick={() => setShowPw((v) => !v)} title="Mostrar/ocultar">
                <svg viewBox="0 0 24 24">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
          </div>

          <div className="lg-row">
            <label className="lg-chk">
              <input type="checkbox" defaultChecked /> Lembrar de mim
            </label>
            <button type="button" className="lg-link" onClick={esqueciSenha}>Esqueci minha senha</button>
          </div>

          <button className="lg-btn" type="submit" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
            {!loading && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            )}
          </button>

          <div className="lg-help">
            Problemas para acessar? <button type="button" className="lg-link">Fale com o suporte</button>
          </div>
        </form>
      </div>
    </div>
  )
}
