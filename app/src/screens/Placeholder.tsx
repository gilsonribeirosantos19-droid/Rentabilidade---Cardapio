export function Placeholder({ label }: { label: string }) {
  return (
    <div className="pane">
      <div className="scr-h">{label}</div>
      <div className="empty" style={{ marginTop: 30 }}>
        🚧 Tela ainda no app antigo — será migrada para o React numa próxima etapa.
        <br />
        <span style={{ fontSize: 12 }}>
          (Esta é a casca nova; cada tela entra aqui aos poucos.)
        </span>
      </div>
    </div>
  )
}
