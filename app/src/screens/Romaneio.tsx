import './fiscal.css'

// Romaneio de separação/entrega — componente compartilhado (Central de Distribuição e
// a tela de Romaneios usam o MESMO doc, pra não duplicar). Overlay imprimível.

type Linha = { nome: string; unidade?: string; qtd: number }
const fmtQ = (v?: number | null) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })

const TH: React.CSSProperties = { background: '#f1f5f9', padding: '6px 9px', border: '1px solid #e2e8f0', fontSize: 10, textTransform: 'uppercase', color: '#475569' }
const TD: React.CSSProperties = { padding: '6px 9px', border: '1px solid #eef2f6' }
const K: React.CSSProperties = { color: '#94a3b8', fontSize: 10.5, textTransform: 'uppercase' }

export function Romaneio({ numeroLabel, dataLabel, cd, filial, linhas, onClose }: {
  numeroLabel: string
  dataLabel: string
  cd?: { nome?: string; cnpj?: string } | null
  filial?: { nome?: string; cnpj?: string } | null
  linhas: Linha[]
  onClose: () => void
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(15,23,42,.4)', overflow: 'auto', padding: '28px 16px' }} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ maxWidth: 660, margin: '0 auto 12px', display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
        <button className="btn-g" onClick={onClose}>Fechar</button>
        <button className="btn-g" style={{ background: '#0f172a', color: '#fff', borderColor: '#0f172a' }} onClick={() => window.print()}>🖨 Imprimir</button>
      </div>
      <div style={{ maxWidth: 660, margin: '0 auto', background: '#fff', borderRadius: 10, padding: '26px 30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0f172a', paddingBottom: 12, marginBottom: 14 }}>
          <div><div style={{ fontSize: 22, fontWeight: 800 }}>AIKO</div><div style={{ color: '#64748b', fontSize: 11 }}>Romaneio de Separação / Entrega</div></div>
          <div style={{ textAlign: 'right', fontSize: 11.5, color: '#64748b' }}><b>{numeroLabel}</b><br />Emissão: {dataLabel}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px', fontSize: 12, marginBottom: 16 }}>
          <div><span style={K}>Origem (CD)</span><br />{cd?.nome || '—'}</div>
          <div><span style={K}>Destino (Filial)</span><br />{filial?.nome || '—'}</div>
          <div><span style={K}>CNPJ Origem</span><br /><span className="mono">{cd?.cnpj || '—'}</span></div>
          <div><span style={K}>CNPJ Destino</span><br /><span className="mono">{filial?.cnpj || '—'}</span></div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr><th style={{ ...TH, width: 34, textAlign: 'center' }}>#</th><th style={{ ...TH, textAlign: 'left' }}>Item</th><th style={{ ...TH, textAlign: 'center' }}>Un.</th><th style={{ ...TH, textAlign: 'right' }}>Qtd enviada</th><th style={{ ...TH, textAlign: 'center' }}>Conf.</th></tr></thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i}><td style={{ ...TD, textAlign: 'center' }}>{i + 1}</td><td style={TD}>{l.nome}</td><td style={{ ...TD, textAlign: 'center' }}>{l.unidade || '—'}</td><td style={{ ...TD, textAlign: 'right', fontFamily: 'DM Mono, monospace' }}>{fmtQ(l.qtd)}</td><td style={{ ...TD, textAlign: 'center' }}>☐</td></tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 34, fontSize: 11.5, color: '#64748b' }}>
          <div>Total: <b>{linhas.length} itens</b></div>
          <div style={{ borderTop: '1px solid #94a3b8', paddingTop: 5, width: 230, textAlign: 'center' }}>Recebido por / Data</div>
        </div>
      </div>
    </div>
  )
}
