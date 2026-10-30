import { useRef, useState } from 'react'
import { supabase } from '../lib/db'
import { useAuth } from '../lib/auth'
import { usePerms } from '../lib/perms'
import { useToastTipo } from '../lib/toast'
import { EtqCameraScanner } from './etqCamera'
import './etiquetas.css'

type Etiqueta = {
  id: string; codigo: string; nome_snap: string; grupo_snap?: string | null; modo: string
  quantidade?: number | null; unidade?: string | null
  manipulacao_em: string; validade_em: string
  status: string; motivo_descarte?: string | null; responsavel_nome?: string | null; baixado_em?: string | null
}

const MODO_LABEL: Record<string, string> = {
  resfriado: 'Refrigerado', congelado: 'Congelado', ambiente: 'Temperatura Ambiente',
  quente: 'Quente', descongelado: 'Descongelado', aberto: 'Aberto',
}
const MOTIVOS: [string, string][] = [
  ['vencido', 'Vencido'], ['qualidade', 'Qualidade'], ['contaminacao', 'Contaminação'],
  ['sobra', 'Sobra'], ['avaria', 'Avaria'], ['outro', 'Outro'],
]
const fmtDT = (iso?: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Manaus', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

function situacao(e: Etiqueta): { label: string; cls: string } {
  if (e.status === 'utilizada') return { label: 'Utilizada', cls: 'baixada' }
  if (e.status === 'descartada') return { label: 'Descartada', cls: 'baixada' }
  if (e.status === 'cancelada') return { label: 'Cancelada', cls: 'baixada' }
  const v = new Date(e.validade_em).getTime(), now = Date.now()
  if (v < now) return { label: 'Vencida', cls: 'vd' }
  if (v < now + 24 * 3600_000) return { label: 'Vence em breve', cls: 'venc' }
  return { label: 'OK', cls: 'ok' }
}

export function EtiquetasBaixa() {
  const { tenantId, usuario } = useAuth()
  const { podeEditar } = usePerms()
  const canBaixar = podeEditar('etiquetas/baixa')
  const isAdmin = (usuario?.role || usuario?.perfil || '').toLowerCase().startsWith('admin')
  const { toast, showToast } = useToastTipo(2800)
  const [codigo, setCodigo] = useState('')
  const [found, setFound] = useState<Etiqueta | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [descartando, setDescartando] = useState(false)
  const [motivo, setMotivo] = useState('vencido')
  const [camera, setCamera] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // aceita tanto o código puro quanto uma URL "...?c=CODIGO" (leitor/câmera)
  function extrairCodigo(raw: string): string {
    const s = raw.trim()
    const m = s.match(/[?&]c=([^&\s]+)/i)
    return (m ? m[1] : s).trim().toUpperCase()
  }

  async function buscar(raw?: string) {
    const cod = extrairCodigo(raw ?? codigo)
    if (!cod) return
    setBusy(true); setDescartando(false)
    try {
      const { data, error } = await supabase.from('etiquetas').select('*').eq('tenant_id', tenantId).eq('codigo', cod).limit(1)
      if (error) throw error
      setFound((data?.[0] as Etiqueta) ?? null)
    } catch (e) { showToast('Erro: ' + (e as Error).message, 'err') } finally { setBusy(false) }
  }

  async function baixar(status: 'utilizada' | 'descartada' | 'cancelada', mot?: string) {
    if (!found) return
    setBusy(true)
    try {
      const { error } = await supabase.rpc('baixar_etiqueta', { p_codigo: found.codigo, p_status: status, p_motivo: mot || null })
      if (error) throw error
      showToast('Baixa registrada.', 'ok')
      setDescartando(false)
      await buscar(found.codigo)      // re-exibe já com o novo status
      setCodigo(''); inputRef.current?.focus()
    } catch (e) { showToast('Erro: ' + (e as Error).message, 'err') } finally { setBusy(false) }
  }

  const sit = found ? situacao(found) : null
  const ativa = found?.status === 'ativa'

  return (
    <div className="etq-screen">
      <div className="etq-head">
        <h1>Dar baixa</h1>
        <span className="sub">Escaneie o QR (leitor USB ou câmera) ou digite o código da etiqueta</span>
      </div>

      <div className="etq-baixa">
        <div className="etq-scan">
          <label>Código da etiqueta</label>
          <div className="row">
            <input ref={inputRef} autoFocus value={codigo} onChange={(e) => setCodigo(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') buscar() }} placeholder="SPN-XXXXXXXX" />
            <button className="etq-btn etq-btn-pri" disabled={busy || !codigo.trim()} onClick={() => buscar()}>Buscar</button>
            <button className="etq-btn" disabled={busy} onClick={() => setCamera(true)} title="Ler o QR com a câmera do tablet/celular">📷 Câmera</button>
          </div>
        </div>

        {found === null && <div className="etq-det"><div className="etq-empty">Etiqueta não encontrada. Confira o código.</div></div>}

        {found && sit && (
          <div className="etq-det">
            <h3>{found.nome_snap} <span className={'etq-sit ' + sit.cls} style={{ marginLeft: 8 }}>{sit.label}</span></h3>
            <div className="dl"><span className="k">Código</span><span className="v" style={{ fontFamily: "'Roboto Condensed', monospace" }}>{found.codigo}</span></div>
            {found.grupo_snap && <div className="dl"><span className="k">Grupo</span><span className="v">{found.grupo_snap}</span></div>}
            <div className="dl"><span className="k">Modo · Qtd</span><span className="v">{(MODO_LABEL[found.modo] || found.modo)}{found.quantidade ? ` · ${found.quantidade}${found.unidade || ''}` : ''}</span></div>
            <div className="dl"><span className="k">Manipulação</span><span className="v">{fmtDT(found.manipulacao_em)}</span></div>
            <div className="dl"><span className="k">Validade</span><span className="v" style={{ color: sit.cls === 'vd' ? '#be123c' : sit.cls === 'venc' ? '#b45309' : '#1e293b' }}>{fmtDT(found.validade_em)}</span></div>
            {found.responsavel_nome && <div className="dl"><span className="k">Responsável</span><span className="v">{found.responsavel_nome}</span></div>}
            {!ativa && <div className="dl"><span className="k">Baixada em</span><span className="v">{fmtDT(found.baixado_em)}{found.motivo_descarte ? ` · ${found.motivo_descarte}` : ''}</span></div>}

            {ativa && canBaixar && !descartando && (
              <div className="etq-bacts">
                <button className="etq-btn etq-btn-ut" disabled={busy} onClick={() => baixar('utilizada')}>✓ Utilizado</button>
                <button className="etq-btn etq-btn-ds" disabled={busy} onClick={() => setDescartando(true)}>✕ Descartado</button>
                {isAdmin && <button className="etq-btn" disabled={busy} onClick={() => { if (confirm('Cancelar esta etiqueta? (erro de emissão — não entra como perda)')) baixar('cancelada') }}>Cancelar etiqueta</button>}
              </div>
            )}

            {ativa && descartando && (
              <div className="etq-bacts" style={{ alignItems: 'flex-end' }}>
                <div className="etq-fg" style={{ flex: 1, minWidth: 160 }}>
                  <label>Motivo do descarte</label>
                  <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                    {MOTIVOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <button className="etq-btn" disabled={busy} onClick={() => setDescartando(false)}>Voltar</button>
                <button className="etq-btn etq-btn-ds" disabled={busy} onClick={() => baixar('descartada', motivo)}>Confirmar descarte</button>
              </div>
            )}

            {!ativa && <div className="etq-hint" style={{ marginTop: 12 }}>Esta etiqueta já foi baixada — nenhuma ação disponível.</div>}
          </div>
        )}
      </div>

      {camera && <EtqCameraScanner onClose={() => setCamera(false)} onRead={(txt) => { setCamera(false); const cod = extrairCodigo(txt); setCodigo(cod); buscar(cod) }} />}

      {toast && <div className={'etq-toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}
