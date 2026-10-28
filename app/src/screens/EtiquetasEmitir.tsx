import { useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import { usePerms } from '../lib/perms'
import { useToastTipo } from '../lib/toast'
import './etiquetas.css'

type Grupo = { id: string; nome: string }
type Item = { id: string; nome: string; grupo_id?: string | null }
type Prazo = { item_id: string; modo: string; prazo_horas: number; temperatura?: string | null }
type LojaFull = { id: string; nome?: string; razao_social?: string; cnpj?: string; endereco?: string; cidade?: string; cep?: string }
type Etiqueta = {
  codigo: string; nome_snap: string; grupo_snap?: string | null; modo: string
  quantidade?: number | null; unidade?: string | null
  manipulacao_em: string; validade_em: string; val_original?: string | null
  lote?: string | null; fabricacao?: string | null; marca_forn?: string | null; sif?: string | null
  responsavel_nome?: string | null
}

const MODO_LABEL: Record<string, string> = {
  resfriado: 'Resfriado', congelado: 'Congelado', ambiente: 'Temperatura Ambiente',
  quente: 'Quente', descongelado: 'Descongelado', aberto: 'Aberto',
}
const fmtPrazo = (h: number) => { const d = Math.floor(h / 24), r = h % 24; return [d ? `${d}d` : '', r ? `${r}h` : ''].filter(Boolean).join(' ') || '0h' }
const fmtDT = (iso?: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Manaus', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(',', ' -') : '—'
const fmtD = (d?: string | null) => d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR', { timeZone: 'America/Manaus' }) : ''

export function EtiquetasEmitir() {
  const { tenantId } = useAuth()
  const { lojas, lojaId } = useLoja()
  const { podeEditar } = usePerms()
  const canEmit = podeEditar('etiquetas/emitir')
  const { toast, showToast } = useToastTipo(2800)
  const [busca, setBusca] = useState('')
  const [fGrupo, setFGrupo] = useState('')
  const [drawer, setDrawer] = useState<Item | null>(null)
  const [printData, setPrintData] = useState<{ loja: LojaFull | null; items: { r: Etiqueta; qr: string }[] } | null>(null)
  const [emitindo, setEmitindo] = useState(false)

  const { data: grupos = [] } = useQuery({ queryKey: ['etq-grupos', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Grupo>((f, t) => supabase.from('etiqueta_grupos').select('id,nome').eq('tenant_id', tenantId).order('nome').order('id').range(f, t)) })
  const { data: itens = [], isLoading } = useQuery({ queryKey: ['etq-itens', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Item>((f, t) => supabase.from('etiqueta_itens').select('id,nome,grupo_id').eq('tenant_id', tenantId).eq('ativo', true).order('nome').order('id').range(f, t)) })
  const { data: prazos = [] } = useQuery({ queryKey: ['etq-prazos', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Prazo>((f, t) => supabase.from('etiqueta_prazos').select('item_id,modo,prazo_horas,temperatura').eq('tenant_id', tenantId).order('item_id').range(f, t)) })
  const { data: lojasFull = [] } = useQuery({ queryKey: ['etq-lojas-full', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('lojas').select('*').eq('tenant_id', tenantId); return (data ?? []) as LojaFull[] } })

  const grupoById = useMemo(() => Object.fromEntries(grupos.map((g) => [g.id, g.nome])) as Record<string, string>, [grupos])
  const prazosByItem = useMemo(() => { const m: Record<string, Prazo[]> = {}; prazos.forEach((p) => { (m[p.item_id] ||= []).push(p) }); return m }, [prazos])

  const rows = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return itens.filter((it) => (!q || it.nome.toLowerCase().includes(q)) && (!fGrupo || it.grupo_id === fGrupo))
  }, [itens, busca, fGrupo])

  async function emitir(item: Item, modo: string, opts?: { copias?: number; quantidade?: string; unidade?: string; marca?: string; sif?: string; lote?: string; valOriginal?: string }) {
    if (!lojaId) { showToast('Selecione uma loja no topo para emitir.', 'err'); return }
    if (emitindo) return
    setEmitindo(true)
    try {
      const qNum = opts?.quantidade ? parseFloat(opts.quantidade.replace(',', '.')) : null
      const { data, error } = await supabase.rpc('emitir_etiqueta', {
        p_item_id: item.id, p_modo: modo, p_loja_id: lojaId,
        p_copias: opts?.copias ?? 1,
        p_quantidade: isFinite(qNum as number) ? qNum : null,
        p_unidade: opts?.unidade || null,
        p_marca_forn: opts?.marca || null, p_sif: opts?.sif || null,
        p_lote: opts?.lote || null, p_val_original: opts?.valOriginal || null,
      })
      if (error) throw error
      const etiquetas = (data ?? []) as Etiqueta[]
      if (!etiquetas.length) throw new Error('Nada foi gerado.')
      const loja = lojasFull.find((l) => l.id === lojaId) || null
      const items = await Promise.all(etiquetas.map(async (r) => ({ r, qr: await QRCode.toDataURL(r.codigo, { margin: 0, width: 140 }) })))
      setPrintData({ loja, items })
      setDrawer(null)
      showToast(`${etiquetas.length} etiqueta(s) gerada(s).`, 'ok')
      setTimeout(() => { window.print(); setTimeout(() => setPrintData(null), 500) }, 120)
    } catch (e) { showToast('Erro: ' + (e as Error).message, 'err') } finally { setEmitindo(false) }
  }

  return (
    <div className="etq-screen">
      <div className="etq-head">
        <h1>Emitir etiqueta</h1>
        <span className="sub">Clique em Imprimir no modo desejado (rápido) ou no produto para mais opções</span>
      </div>

      {!lojaId && <div className="etq-banner">⚠️ Selecione uma <b>loja</b> no seletor do topo para poder emitir.</div>}

      <div className="etq-toolbar">
        <div className="etq-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input placeholder="Buscar produto..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <select className="etq-sel" value={fGrupo} onChange={(e) => setFGrupo(e.target.value)}>
          <option value="">Todos os grupos</option>
          {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
        </select>
      </div>

      {isLoading ? <div className="etq-empty">Carregando…</div>
        : rows.length === 0 ? <div className="etq-empty">Nenhum produto. Cadastre em “Prazos por produto”.</div>
        : <div className="etq-grid">
          {rows.map((it) => {
            const ps = (prazosByItem[it.id] || []).slice().sort((a, b) => a.prazo_horas - b.prazo_horas)
            return (
              <div className="etq-pcard" key={it.id}>
                <div className="etq-pc-head" onClick={() => canEmit && ps.length > 0 && setDrawer(it)} title={ps.length ? 'Mais opções' : ''}>
                  <span className="nm">{it.nome}</span>
                  <span className="gr">{it.grupo_id ? (grupoById[it.grupo_id] || '') : ''}</span>
                </div>
                {ps.length === 0
                  ? <div className="etq-pc-nomodo">sem prazo cadastrado</div>
                  : ps.map((p) => (
                    <div className="etq-pc-modo" key={p.modo}>
                      <span className="ml">{MODO_LABEL[p.modo] || p.modo} · <b>{fmtPrazo(p.prazo_horas)}</b></span>
                      {canEmit && <button className="etq-btn etq-btn-pri etq-btn-sm" disabled={!lojaId || emitindo} onClick={() => emitir(it, p.modo)}>🖨 Imprimir</button>}
                    </div>
                  ))}
              </div>
            )
          })}
        </div>}

      {drawer && <EmitDrawer item={drawer} prazos={prazosByItem[drawer.id] || []} grupo={drawer.grupo_id ? grupoById[drawer.grupo_id] : ''} emitindo={emitindo} onClose={() => setDrawer(null)} onEmit={(modo, opts) => emitir(drawer, modo, opts)} />}

      {/* área de impressão (só aparece no print) */}
      <div id="etq-print" className="etq-print">
        {printData?.items.map(({ r, qr }, i) => (
          <div className="etq-plabel" key={i}>
            <div className="pl-nome">{r.nome_snap}</div>
            <div className="pl-modo"><span>{(MODO_LABEL[r.modo] || r.modo).toUpperCase()}</span><span>{r.quantidade ? `${r.quantidade}${r.unidade || ''}` : ''}</span></div>
            {r.val_original && <div className="pl-row"><span>VAL. ORIGINAL</span><b>{fmtD(r.val_original)}</b></div>}
            <div className="pl-row"><span>MANIPULAÇÃO</span><b>{fmtDT(r.manipulacao_em)}</b></div>
            <div className="pl-row big"><span>VALIDADE</span><b>{fmtDT(r.validade_em)}</b></div>
            <div className="pl-row"><span>MARCA / FORN</span><b>{r.marca_forn || ''}</b></div>
            <div className="pl-row"><span>SIF</span><b>{r.sif || ''}</b></div>
            {r.lote && <div className="pl-row"><span>LOTE</span><b>{r.lote}</b></div>}
            <div className="pl-foot">
              <div className="txt">
                RESP: {r.responsavel_nome || ''}<br />
                {printData.loja?.razao_social || printData.loja?.nome || ''}{printData.loja?.cnpj ? ' · CNPJ ' + printData.loja.cnpj : ''}<br />
                {[printData.loja?.endereco, printData.loja?.cidade].filter(Boolean).join(' · ')}
                <div className="pl-code">#{r.codigo}</div>
              </div>
              <img className="pl-qr" src={qr} alt="QR" />
            </div>
          </div>
        ))}
      </div>

      {toast && <div className={'etq-toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}

function EmitDrawer({ item, prazos, grupo, emitindo, onClose, onEmit }: {
  item: Item; prazos: Prazo[]; grupo?: string; emitindo: boolean; onClose: () => void
  onEmit: (modo: string, opts: { copias: number; quantidade: string; unidade: string; marca: string; sif: string; lote: string; valOriginal: string }) => void
}) {
  const ps = prazos.slice().sort((a, b) => a.prazo_horas - b.prazo_horas)
  const [modo, setModo] = useState(ps[0]?.modo || '')
  const [copias, setCopias] = useState(1)
  const [quantidade, setQuantidade] = useState('')
  const [unidade, setUnidade] = useState('')
  const [marca, setMarca] = useState('')
  const [sif, setSif] = useState('')
  const [lote, setLote] = useState('')
  const [valOriginal, setValOriginal] = useState('')

  const prazoSel = ps.find((p) => p.modo === modo)
  const validadePreview = prazoSel ? new Date(Date.now() + prazoSel.prazo_horas * 3600_000) : null

  return (
    <div className="etq-ov" onClick={onClose}>
      <div className="etq-modal" onClick={(e) => e.stopPropagation()}>
        <div className="etq-mh"><h2>{item.nome}{grupo ? ` · ${grupo}` : ''}</h2><button className="x" onClick={onClose}>✕</button></div>
        <div className="etq-mb">
          <div className="etq-fg">
            <label>Modo de conservação</label>
            <div className="etq-seg" style={{ flexWrap: 'wrap' }}>
              {ps.map((p) => <button key={p.modo} className={modo === p.modo ? 'on' : ''} onClick={() => setModo(p.modo)}>{MODO_LABEL[p.modo] || p.modo} · {fmtPrazo(p.prazo_horas)}</button>)}
            </div>
          </div>
          <div className="valbox"><div className="k">Validade (prévia)</div><div className="v">{validadePreview ? fmtDT(validadePreview.toISOString()) : '—'}</div></div>
          <div className="etq-row2">
            <div className="etq-fg"><label>Quantidade</label><input value={quantidade} onChange={(e) => setQuantidade(e.target.value)} placeholder="Ex.: 250" /></div>
            <div className="etq-fg"><label>Unidade</label>
              <select value={unidade} onChange={(e) => setUnidade(e.target.value)}><option value="">—</option><option>g</option><option>kg</option><option>un</option><option>mL</option><option>L</option></select>
            </div>
          </div>
          <div className="etq-row2">
            <div className="etq-fg"><label>Cópias</label>
              <div className="stepper"><button type="button" onClick={() => setCopias((c) => Math.max(1, c - 1))}>−</button><span>{copias}</span><button type="button" onClick={() => setCopias((c) => c + 1)}>+</button></div>
            </div>
            <div className="etq-fg"><label>Val. original (opcional)</label><input type="date" value={valOriginal} onChange={(e) => setValOriginal(e.target.value)} /></div>
          </div>
          <div className="etq-row2">
            <div className="etq-fg"><label>Marca / fornecedor</label><input value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="(usa o padrão se vazio)" /></div>
            <div className="etq-fg"><label>SIF</label><input value={sif} onChange={(e) => setSif(e.target.value)} placeholder="(usa o padrão se vazio)" /></div>
          </div>
          <div className="etq-fg"><label>Lote (opcional)</label><input value={lote} onChange={(e) => setLote(e.target.value)} placeholder="—" /></div>
          <div className="etq-hint">Manipulação = agora (registrada no servidor). A validade final é calculada no servidor.</div>
        </div>
        <div className="etq-mf">
          <button className="etq-btn" onClick={onClose}>Cancelar</button>
          <button className="etq-btn etq-btn-pri" disabled={emitindo || !modo} onClick={() => onEmit(modo, { copias, quantidade, unidade, marca, sif, lote, valOriginal })}>{emitindo ? 'Gerando…' : `🖨 Imprimir ${copias > 1 ? `(${copias})` : ''}`}</button>
        </div>
      </div>
    </div>
  )
}
