export default function App() {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '32px 36px',
          maxWidth: 460,
          boxShadow: '0 8px 30px rgba(15,23,42,.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'var(--orange)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 10px rgba(249,115,22,.4)',
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1,21 8,6 13,13 17,8 23,21" />
              <line x1="1" y1="21" x2="23" y2="21" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text1)' }}>Aiko</div>
            <div style={{ fontSize: 12, color: 'var(--orange)', fontWeight: 600 }}>sistema</div>
          </div>
        </div>

        <h1 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text1)', marginBottom: 6 }}>
          Fundação React pronta ✓
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.5 }}>
          Base profissional no ar: <b>React + Vite + TypeScript</b>, com <b>Supabase</b>,{' '}
          <b>React Router</b> e <b>React Query</b> configurados. Próximo passo: montar a casca
          (sidebar 2 níveis + abas) e migrar a primeira tela piloto.
        </p>
      </div>
    </div>
  )
}
