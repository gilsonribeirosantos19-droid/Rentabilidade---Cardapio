import { useEffect, useRef, useState } from 'react'

// Leitor de QR pela câmera (tablet/celular). Usa a câmera traseira; a lib jsqr só é
// baixada quando o leitor abre. Precisa de HTTPS (Vercel ok) e permissão de câmera.
export function EtqCameraScanner({ onRead, onClose }: { onRead: (texto: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [erro, setErro] = useState('')
  const cbRef = useRef(onRead)   // callback atual sem reiniciar a câmera a cada render
  cbRef.current = onRead

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let ativo = true
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador não dá acesso à câmera.')
        const [{ default: jsQR }, s] = await Promise.all([
          import('jsqr'),
          navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }),
        ])
        stream = s
        if (!ativo) { s.getTracks().forEach((t) => t.stop()); return }
        const v = videoRef.current!
        v.srcObject = s
        await v.play()
        const tick = () => {
          if (!ativo) return
          if (v.readyState >= 2 && ctx && v.videoWidth) {
            canvas.width = v.videoWidth; canvas.height = v.videoHeight
            ctx.drawImage(v, 0, 0)
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
            if (r?.data) { ativo = false; cbRef.current(r.data); return }
          }
          raf = requestAnimationFrame(tick)
        }
        tick()
      } catch (e) {
        const msg = (e as Error).name === 'NotAllowedError' ? 'Permissão da câmera negada. Libere nas configurações do navegador.' : (e as Error).message
        setErro(msg)
      }
    })()

    return () => { ativo = false; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()) }
  }, [])

  return (
    <div className="etq-ov" onClick={onClose}>
      <div className="etq-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(460px,100%)' }}>
        <div className="etq-mh"><h2>Ler QR com a câmera</h2><button className="x" onClick={onClose}>✕</button></div>
        <div className="etq-mb">
          {erro
            ? <div className="etq-empty" style={{ color: '#be123c' }}>{erro}</div>
            : <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: 8, background: '#0f172a', aspectRatio: '4 / 3', objectFit: 'cover' }} />}
          <div className="etq-hint">Aponte para o QR da etiqueta — a leitura é automática.</div>
        </div>
        <div className="etq-mf"><button className="etq-btn" onClick={onClose}>Fechar</button></div>
      </div>
    </div>
  )
}
