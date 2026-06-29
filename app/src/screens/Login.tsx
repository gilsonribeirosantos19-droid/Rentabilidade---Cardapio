import { useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'

export function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    const { error } = await signIn(email.trim(), senha)
    setLoading(false)
    if (error) setErro('E-mail ou senha inválidos.')
  }

  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form
        onSubmit={submit}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '32px 34px',
          width: 380,
          maxWidth: '100%',
          boxShadow: '0 12px 40px rgba(15,23,42,.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 22 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(249,115,22,.4)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1,21 8,6 13,13 17,8 23,21" />
              <line x1="1" y1="21" x2="23" y2="21" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 21, fontWeight: 800 }}>Aiko</div>
            <div style={{ fontSize: 12, color: 'var(--orange)', fontWeight: 600 }}>sistema</div>
          </div>
        </div>

        <label className="lbl">E-mail</label>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" autoFocus style={{ marginBottom: 14 }} />

        <label className="lbl">Senha</label>
        <input className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••••" style={{ marginBottom: 18 }} />

        {erro && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 14 }}>{erro}</div>}

        <button className="btn primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', height: 42 }}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
