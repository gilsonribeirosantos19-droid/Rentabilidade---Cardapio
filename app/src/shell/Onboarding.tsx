import { useLayoutEffect, useState } from 'react'

// Onboarding guiado: tour leve (sem lib externa). Destaca elementos estáveis (menu, ícone de ajuda)
// e mostra cards explicativos. Aparece 1x no 1º login (localStorage); refaz pelo ? › "Refazer tour".

type Step = { titulo: string; corpo: string; target?: string }
const STEPS: Step[] = [
  { titulo: 'Bem-vindo ao Aiko 👋', corpo: 'Em 30 segundos eu te mostro onde fica cada coisa. Pode pular quando quiser.' },
  { titulo: 'O menu', corpo: 'Aqui ficam todas as áreas: Estoque, Fiscal, Cadastros, Gestão e mais. Clique numa área pra abrir as telas (elas viram abas no topo).', target: '.modbar' },
  { titulo: '1. Comece pelos Cadastros', corpo: 'Cadastre seus insumos (matéria-prima), fichas técnicas e fornecedores. É a base de tudo — o custo sai daí.' },
  { titulo: '2. Receba as notas no Fiscal', corpo: 'As compras chegam no Monitor de NF-e. Ao processar, viram entrada no estoque e recalculam o custo automaticamente.' },
  { titulo: '3. Acompanhe na Gestão', corpo: 'CMV, rendimentos e o DRE de Compras — pra saber quanto você gasta, em quê, e quanto sobra.' },
  { titulo: 'Precisa de ajuda?', corpo: 'Dúvidas: clique no ? pra abrir a Central de Ajuda. As novidades do sistema ficam no sininho 🔔 ao lado.', target: '#tour-help' },
  { titulo: 'Pronto! 🎉', corpo: 'Pode começar. Pra rever este tour depois, abra o ? e clique em "Refazer tour".' },
]

export function Onboarding({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const s = STEPS[step]
  const ultimo = step === STEPS.length - 1

  useLayoutEffect(() => {
    if (!s.target) { setRect(null); return }
    const update = () => { const el = document.querySelector(s.target!) as HTMLElement | null; const r = el?.getBoundingClientRect(); setRect(r && r.width ? r : null) }
    update()
    window.addEventListener('resize', update); window.addEventListener('scroll', update, true)
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true) }
  }, [step, s.target])

  // posição do card: ao lado de alvo alto (menu), abaixo/acima de alvo baixo, senão centralizado
  const W = 330
  let cardStyle: React.CSSProperties = { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: W }
  if (rect) {
    const alto = rect.height > innerHeight * 0.5
    if (alto) {
      cardStyle = { position: 'fixed', left: Math.min(rect.right + 14, innerWidth - W - 12), top: Math.max(14, Math.min(rect.top + 20, innerHeight - 240)), width: W }
    } else {
      const left = Math.max(12, Math.min(rect.left, innerWidth - W - 12))
      const abaixo = rect.bottom + 200 < innerHeight
      cardStyle = { position: 'fixed', left, top: abaixo ? rect.bottom + 12 : Math.max(12, rect.top - 212), width: W }
    }
  }

  const pad = 6
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000 }}>
      {/* bloqueia cliques no app durante o tour */}
      <div style={{ position: 'fixed', inset: 0, background: rect ? 'transparent' : 'rgba(10,15,25,.55)' }} />
      {/* recorte (spotlight) no alvo */}
      {rect && (
        <div style={{ position: 'fixed', left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, borderRadius: 12, boxShadow: '0 0 0 9999px rgba(10,15,25,.55)', border: '2px solid #f97316', pointerEvents: 'none' }} />
      )}
      {/* card */}
      <div style={{ ...cardStyle, background: '#fff', borderRadius: 14, boxShadow: '0 18px 50px rgba(10,20,40,.35)', padding: 18, zIndex: 9001 }}>
        <div style={{ fontSize: 11, color: '#94a3c4', fontWeight: 700, marginBottom: 6 }}>Passo {step + 1} de {STEPS.length}</div>
        <div style={{ fontSize: 16.5, fontWeight: 800, color: '#14315f', marginBottom: 7 }}>{s.titulo}</div>
        <div style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.55 }}>{s.corpo}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ border: 0, background: 'none', color: '#94a3c4', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 4, font: 'inherit' }}>Pular</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {step > 0 && <button onClick={() => setStep((n) => n - 1)} style={{ height: 34, padding: '0 13px', border: '1px solid #d3dbe8', background: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, color: '#334155', cursor: 'pointer', font: 'inherit' }}>Voltar</button>}
            <button onClick={() => ultimo ? onClose() : setStep((n) => n + 1)} style={{ height: 34, padding: '0 16px', border: 0, background: '#f97316', color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}>{ultimo ? 'Começar ✓' : 'Próximo ›'}</button>
          </div>
        </div>
        {/* pontinhos */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 14 }}>
          {STEPS.map((_, i) => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i === step ? '#f97316' : '#dde3ee' }} />)}
        </div>
      </div>
    </div>
  )
}
