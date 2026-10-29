import QRCode from 'qrcode'

// Etiqueta (campos usados no rótulo impresso) + loja (rodapé). Compartilhado por Emitir e Lista.
export type EtqForLabel = {
  codigo: string; nome_snap: string; grupo_snap?: string | null; modo: string
  quantidade?: number | null; unidade?: string | null
  manipulacao_em: string; validade_em: string; val_original?: string | null
  lote?: string | null; marca_forn?: string | null; sif?: string | null; responsavel_nome?: string | null
}
export type LojaFull = { id?: string; nome?: string; razao_social?: string; cnpj?: string; endereco?: string; cidade?: string; cep?: string }
export type PrintData = { loja: LojaFull | null; items: { r: EtqForLabel; qr: string }[] } | null

const MODO_LABEL: Record<string, string> = {
  resfriado: 'Resfriado', congelado: 'Congelado', ambiente: 'Temperatura Ambiente',
  quente: 'Quente', descongelado: 'Descongelado', aberto: 'Aberto',
}
const fmtDT = (iso?: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Manaus', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' ') : '—'
const fmtD = (d?: string | null) => d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR', { timeZone: 'America/Manaus' }) : ''

// gera o QR (dataURL) de cada etiqueta, preservando o tipo da linha
export async function buildQrItems<T extends { codigo: string }>(ets: T[]): Promise<{ r: T; qr: string }[]> {
  return Promise.all(ets.map(async (r) => ({ r, qr: await QRCode.toDataURL(r.codigo, { margin: 0, width: 256 }) })))
}

// formato da etiqueta (por dispositivo): aplica o tamanho ao @page e ao rótulo antes de imprimir
export function applyFormato() {
  let f = '60x40'
  try { f = localStorage.getItem('etq_formato') || '60x40' } catch { /* ignore */ }
  const [w, h] = f.split('x')
  let st = document.getElementById('etq-fmt') as HTMLStyleElement | null
  if (!st) { st = document.createElement('style'); st.id = 'etq-fmt'; document.head.appendChild(st) }
  st.textContent = `@media print{@page{size:${w}mm ${h}mm;margin:0}}#etq-print .etq-plabel{width:${w}mm;height:${h}mm}`
}

// área de impressão (só aparece no print, via CSS) — rótulo 60x60
export function EtqPrintArea({ data }: { data: PrintData }) {
  return (
    <div id="etq-print" className="etq-print">
      {(data?.items ?? []).map(({ r, qr }, i) => (
        <div className="etq-plabel" key={i}>
          <div className="pl-nome">{r.nome_snap}</div>
          <div className="pl-modo">{(MODO_LABEL[r.modo] || r.modo).toUpperCase()}{r.quantidade ? ` · ${r.quantidade}${r.unidade || ''}` : ''}</div>
          <div className="pl-dates">
            {r.val_original && <div className="pl-drow"><span>VAL. ORIG.</span><b>{fmtD(r.val_original)}</b></div>}
            <div className="pl-drow"><span>MANIPULAÇÃO</span><b>{fmtDT(r.manipulacao_em)}</b></div>
            <div className="pl-drow pl-util"><span>UTILIZAR ATÉ</span><b>{fmtDT(r.validade_em)}</b></div>
          </div>
          <div className="pl-bottom">
            <div className="pl-resp">RESP: {r.responsavel_nome || '—'}</div>
            <div className="pl-qrbox"><img className="pl-qr" src={qr} alt="QR" /><div className="pl-code">#{r.codigo}</div></div>
          </div>
        </div>
      ))}
    </div>
  )
}
