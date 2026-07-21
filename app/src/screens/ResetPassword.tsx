import { useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import './login.css'

// Tela de "definir nova senha" — mostrada quando o usuário volta do link de "esqueci minha senha".
export function ResetPassword() {
  const { clearRecovery, signOut } = useAuth()
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErro(''); setOk('')
    if (senha.length < 6) { setErro('A senha precisa ter pelo menos 6 caracteres.'); return }
    if (senha !== senha2) { setErro('As senhas não coincidem.'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setLoading(false)
    if (error) {
      setErro(/should be different/i.test(error.message) ? 'A nova senha precisa ser diferente da atual.' : error.message)
      return
    }
    // Redefinida: desloga e volta pro login pra a pessoa entrar com a senha nova.
    setOk('Senha redefinida! Faça login com a nova senha.')
    setTimeout(async () => { await signOut(); clearRecovery() }, 1500)
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
          <h1>Quase lá! Crie sua <span>nova senha</span>.</h1>
          <p>Escolha uma senha nova para voltar a acessar sua conta com segurança.</p>
        </div>
        <div className="lg-foot">© 2026 Aiko · Todos os direitos reservados</div>
      </div>

      {/* FORM */}
      <div className="lg-panel">
        <form className="lg-form" onSubmit={submit}>
          <h2>Definir nova senha</h2>
          <div className="sub">Crie uma nova senha para acessar sua conta.</div>

          {erro && <div className="lg-err">{erro}</div>}
          {ok && <div className="lg-err" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#16a34a' }}>{ok}</div>}

          <div className="lg-fld">
            <label>Nova senha</label>
            <div className="lg-inp">
              <input
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoFocus
              />
              <button type="button" className="ic" onClick={() => setShowPw((v) => !v)} title="Mostrar/ocultar">
                <svg viewBox="0 0 24 24">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
          </div>

          <div className="lg-fld">
            <label>Confirmar nova senha</label>
            <div className="lg-inp">
              <input
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                value={senha2}
                onChange={(e) => setSenha2(e.target.value)}
              />
            </div>
          </div>

          <button className="lg-btn" type="submit" disabled={loading}>
            {loading ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        </form>
      </div>
    </div>
  )
}
