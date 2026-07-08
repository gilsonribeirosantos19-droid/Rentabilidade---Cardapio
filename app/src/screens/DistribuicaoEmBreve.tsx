import './fiscal.css'

// Placeholder honesto pras seções da Distribuição ainda não construídas (Romaneios = Fase 2,
// NF-e de Transferência = Fase 3). Mostra o que a seção fará, sem fingir que já existe.

export function DistribuicaoEmBreve({ titulo, sub, fase, texto }: { titulo: string; sub: string; fase: string; texto: string }) {
  return (
    <div className="fiscal-screen">
      <div className="mon-top">
        <div><div className="fh-title">{titulo}</div><div className="fh-sub">{sub}</div></div>
      </div>
      <div style={{ marginTop: 16, background: '#fff', border: '1px solid #e7ebf0', borderRadius: 12, padding: '34px 28px', textAlign: 'center', maxWidth: 560 }}>
        <div style={{ fontSize: 34, marginBottom: 8 }}>🚧</div>
        <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: '.03em', background: '#eff6ff', color: '#1d4ed8', padding: '3px 10px', borderRadius: 20, marginBottom: 10 }}>EM BREVE · {fase}</div>
        <div style={{ fontSize: 14, color: '#475569', lineHeight: 1.55 }}>{texto}</div>
      </div>
    </div>
  )
}
