// Mini-modal de detalhes (somente leitura). Substitui os alert() de "Ver detalhes".
// Usa as classes .ov/.modal já existentes (estoque.css). Reutilizável entre telas.

export function DetailModal({ title, rows, onClose }: { title: string; rows: [string, string][]; onClose: () => void }) {
  return (
    <div className="ov" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(440px, 95vw)' }}>
        <h2 style={{ marginBottom: 14 }}>{title}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {rows.map(([k, v], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '7px 2px', borderBottom: '1px solid #eef1f6', fontSize: 13 }}>
              <span style={{ color: '#64748b' }}>{k}</span>
              <span style={{ fontWeight: 600, color: '#1e293b', textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </div>
        <div className="modal-foot" style={{ marginTop: 16 }}>
          <div style={{ flex: 1 }} />
          <button className="btn-pri" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
