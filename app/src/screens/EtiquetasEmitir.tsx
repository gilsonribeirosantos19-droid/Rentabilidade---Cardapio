import { useMemo, useState } from 'react'
import { buildQrItems, EtqPrintArea, applyFormato, type EtqForLabel, type LojaFull, type PrintData } from './etqLabel'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { usePerms } from '../lib/perms'
import { useToastTipo } from '../lib/toast'
import './etiquetas.css'

type Grupo = { id: string; nome: string }
type Item = { id: string; nome: string; grupo_id?: string | null }
type Prazo = { item_id: string; modo: string; prazo_horas: number; temperatura?: string | null }
type Resp = { id: string; nome: string }
type Cred = { op: string; pin: string } | null
type EmitOpts = { copias?: number; quantidade?: string; unidade?: string; marca?: string; sif?: string; lote?: string; valOriginal?: string }
type AvulsaForm = EmitOpts & { nome: string; modo: string; dias: string; horas: string }

const getResp = () => { try { return localStorage.getItem('etq_resp_nome') || '' } catch { return '' } }
const setRespLS = (v: string) => { try { localStorage.setItem('etq_resp_nome', v) } catch { /* ignore */ } }
const getOpLS = () => { try { return localStorage.getItem('etq_op_id') || '' } catch { return '' } }
const setOpLS = (v: string) => { try { localStorage.setItem('etq_op_id', v) } catch { /* ignore */ } }
const PIN_TTL = 2 * 60_000   // PIN digitado vale 2 min p/ emissões seguidas do mesmo operador

const MODO_LABEL: Record<string, string> = {
  resfriado: 'Refrigerado', congelado: 'Congelado', ambiente: 'Temperatura Ambiente',
  quente: 'Quente', descongelado: 'Descongelado', aberto: 'Aberto',
}
const fmtPrazo = (h: number) => { const d = Math.floor(h / 24), r = h % 24; return [d ? `${d}d` : '', r ? `${r}h` : ''].filter(Boolean).join(' ') || '0h' }
const fmtDT = (iso?: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Manaus', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(',', ' -') : '—'

export function EtiquetasEmitir({ lojaId }: { lojaId: string | null }) {
  const { tenantId } = useAuth()
  const { podeEditar } = usePerms()
  const canEmit = podeEditar('etiquetas/emitir')
  const canDel = podeEditar('etiquetas/prazos')
  const qc = useQueryClient()
  const { toast, showToast } = useToastTipo(2800)
  const [busca, setBusca] = useState('')
  const [fGrupo, setFGrupo] = useState('')
  const [fModo, setFModo] = useState('')
  const [resp, setResp] = useState(getResp())
  const [drawer, setDrawer] = useState<Item | null>(null)
  const [printData, setPrintData] = useState<PrintData>(null)
  const [emitindo, setEmitindo] = useState(false)
  const [avulsa, setAvulsa] = useState(false)
  const [opId, setOpId] = useState(getOpLS())
  const [pinCache, setPinCache] = useState<{ op: string; pin: string; at: number } | null>(null)
  const [pinAsk, setPinAsk] = useState<{ run: (c: Cred) => void } | null>(null)

  const { data: grupos = [] } = useQuery({ queryKey: ['etq-grupos', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Grupo>((f, t) => supabase.from('etiqueta_grupos').select('id,nome').eq('tenant_id', tenantId).order('nome').order('id').range(f, t)) })
  const { data: itens = [], isLoading } = useQuery({ queryKey: ['etq-itens', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Item>((f, t) => supabase.from('etiqueta_itens').select('id,nome,grupo_id').eq('tenant_id', tenantId).eq('ativo', true).order('nome').order('id').range(f, t)) })
  const { data: prazos = [] } = useQuery({ queryKey: ['etq-prazos', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Prazo>((f, t) => supabase.from('etiqueta_prazos').select('item_id,modo,prazo_horas,temperatura').eq('tenant_id', tenantId).order('item_id').range(f, t)) })
  const { data: lojasFull = [] } = useQuery({ queryKey: ['etq-lojas-full', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('lojas').select('*').eq('tenant_id', tenantId); return (data ?? []) as LojaFull[] } })
  const { data: resps = [] } = useQuery({ queryKey: ['etq-resps', tenantId, 'ativos'], enabled: !!tenantId, queryFn: () => fetchAll<Resp>((f, t) => supabase.from('etiqueta_responsaveis').select('id,nome').eq('tenant_id', tenantId).eq('ativo', true).order('nome').order('id').range(f, t)) })
  // operadores ativos também servem de responsáveis (evita recadastrar as mesmas pessoas)
  const { data: operadores = [] } = useQuery({ queryKey: ['etq-ops', tenantId, 'ativos'], enabled: !!tenantId, queryFn: () => fetchAll<{ id: string; nome: string; loja_id?: string | null }>((f, t) => supabase.from('operadores').select('id,nome,loja_id').eq('tenant_id', tenantId).eq('ativo', true).order('nome').order('id').range(f, t)) })

  const grupoById = useMemo(() => Object.fromEntries(grupos.map((g) => [g.id, g.nome])) as Record<string, string>, [grupos])
  const prazosByItem = useMemo(() => { const m: Record<string, Prazo[]> = {}; prazos.forEach((p) => { (m[p.item_id] ||= []).push(p) }); return m }, [prazos])
  const modosDistintos = useMemo(() => [...new Set(prazos.map((p) => p.modo))].sort(), [prazos])
  const respNomes = useMemo(() => {
    const set = new Set<string>()
    operadores.forEach((o) => { if (o.nome && (!lojaId || !o.loja_id || o.loja_id === lojaId)) set.add(o.nome.trim()) })
    resps.forEach((r) => { if (r.nome) set.add(r.nome.trim()) })
    return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [operadores, resps, lojaId])

  const rows = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return itens.filter((it) => (!q || it.nome.toLowerCase().includes(q)) && (!fGrupo || it.grupo_id === fGrupo)
      && (!fModo || (prazosByItem[it.id] || []).some((p) => p.modo === fModo)))
  }, [itens, busca, fGrupo, fModo, prazosByItem])

  // PIN por loja (Configurações › Operadores): ligado = emite só com operador + PIN
  const exigePin = !!(lojasFull.find((l) => l.id === lojaId) as { etq_exige_pin?: boolean } | undefined)?.etq_exige_pin
  const opsLoja = useMemo(() => operadores.filter((o) => o.loja_id === lojaId), [operadores, lojaId])
  const opSel = opsLoja.some((o) => o.id === opId) ? opId : ''

  const excluir = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('etiqueta_itens').delete().eq('id', id); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['etq-itens'] }); qc.invalidateQueries({ queryKey: ['etq-prazos'] }); showToast('Produto excluído.', 'ok') },
    onError: (e: Error) => showToast('Erro: ' + e.message, 'err'),
  })

  // pede o PIN (se a loja exige) e então roda a emissão com as credenciais do operador
  function comPin(run: (c: Cred) => void) {
    if (!exigePin) { run(null); return }
    if (!opSel) { showToast('Esta loja exige operador + PIN: escolha o operador no topo.', 'err'); return }
    if (pinCache && pinCache.op === opSel && Date.now() - pinCache.at < PIN_TTL) { run({ op: opSel, pin: pinCache.pin }); return }
    setPinAsk({ run })
  }

  async function gerar(fn: 'emitir_etiqueta' | 'emitir_avulsa', params: Record<string, unknown>, cred: Cred) {
    setEmitindo(true)
    try {
      const { data, error } = await supabase.rpc(fn, {
        ...params, p_loja_id: lojaId,
        p_operador_id: cred?.op ?? null, p_pin: cred?.pin ?? null,
        p_responsavel: cred ? null : (resp || null),
      })
      if (error) throw error
      const etiquetas = (data ?? []) as EtqForLabel[]
      if (!etiquetas.length) {
        if (cred) { setPinCache(null); throw new Error('PIN incorreto. Após 5 erros o operador fica bloqueado por 15 min.') }
        throw new Error('Nada foi gerado.')
      }
      if (cred) setPinCache({ ...cred, at: Date.now() })
      const loja = lojasFull.find((l) => l.id === lojaId) || null
      const items = await buildQrItems(etiquetas)
      setPrintData({ loja, items })
      setDrawer(null); setAvulsa(false)
      showToast(`${etiquetas.length} etiqueta(s) gerada(s).`, 'ok')
      setTimeout(() => { applyFormato(); window.print(); setTimeout(() => setPrintData(null), 500) }, 120)
    } catch (e) { showToast('Erro: ' + (e as Error).message, 'err') } finally { setEmitindo(false) }
  }

  const baseParams = (opts?: EmitOpts) => {
    const qNum = opts?.quantidade ? parseFloat(opts.quantidade.replace(',', '.')) : null
    return {
      p_copias: opts?.copias ?? 1,
      p_quantidade: isFinite(qNum as number) ? qNum : null,
      p_unidade: opts?.unidade || null,
      p_marca_forn: opts?.marca || null, p_sif: opts?.sif || null,
      p_lote: opts?.lote || null, p_val_original: opts?.valOriginal || null,
    }
  }

  function emitir(item: Item, modo: string, opts?: EmitOpts) {
    if (!lojaId) { showToast('Selecione uma loja no topo para emitir.', 'err'); return }
    if (emitindo) return
    comPin((cred) => gerar('emitir_etiqueta', { p_item_id: item.id, p_modo: modo, ...baseParams(opts) }, cred))
  }

  function emitirAvulsa(f: AvulsaForm) {
    if (!lojaId) { showToast('Selecione uma loja no topo para emitir.', 'err'); return }
    if (emitindo) return
    const horas = (parseInt(f.dias) || 0) * 24 + (parseInt(f.horas) || 0)
    if (!f.nome.trim()) { showToast('Informe o nome do produto.', 'err'); return }
    if (horas < 1) { showToast('Informe o prazo (dias e/ou horas).', 'err'); return }
    comPin((cred) => gerar('emitir_avulsa', { p_nome: f.nome.trim(), p_modo: f.modo, p_prazo_horas: horas, ...baseParams(f) }, cred))
  }

  return (
    <div className="etq-screen">
      <div className="etq-head">
        <h1>Emitir etiqueta</h1>
        <span className="sub">Clique em Imprimir no modo desejado (rápido) ou no produto para mais opções</span>
      </div>

      <div className="etq-toolbar">
        <div className="etq-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input placeholder="Buscar produto..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <select className="etq-sel" value={fGrupo} onChange={(e) => setFGrupo(e.target.value)}>
          <option value="">Todos os grupos</option>
          {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
        </select>
        <select className="etq-sel" value={fModo} onChange={(e) => setFModo(e.target.value)}>
          <option value="">Todos os estados</option>
          {modosDistintos.map((m) => <option key={m} value={m}>{MODO_LABEL[m] || m}</option>)}
        </select>
        {exigePin
          ? <select className="etq-sel" value={opSel} onChange={(e) => { setOpId(e.target.value); setOpLS(e.target.value); setPinCache(null) }} title="Esta loja exige operador + PIN para emitir">
            <option value="">Operador: —</option>
            {opsLoja.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
          : <select className="etq-sel" value={resp} onChange={(e) => { setResp(e.target.value); setRespLS(e.target.value) }} title="Responsável que vai no RESP: da etiqueta">
            <option value="">Responsável: —</option>
            {respNomes.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>}
        {canEmit && <button className="etq-btn" onClick={() => { if (!lojaId) { showToast('Selecione uma loja no topo para emitir a etiqueta avulsa.', 'err'); return } setAvulsa(true) }} title="Etiqueta de um item que não está no cadastro">+ Etiqueta avulsa</button>}
      </div>

      {isLoading ? <div className="etq-empty">Carregando…</div>
        : rows.length === 0 ? <div className="etq-empty">Nenhum produto. Cadastre em “Prazos por produto”.</div>
        : <div className="etq-grid">
          {rows.map((it) => {
            const ps = (prazosByItem[it.id] || []).filter((p) => !fModo || p.modo === fModo).slice().sort((a, b) => a.prazo_horas - b.prazo_horas)
            return (
              <div className="etq-pcard" key={it.id}>
                <div className="etq-pc-head" onClick={() => canEmit && ps.length > 0 && setDrawer(it)} title={ps.length ? 'Mais opções' : ''}>
                  <span className="nm">{it.nome}</span>
                  <span className="gr">{it.grupo_id ? (grupoById[it.grupo_id] || '') : ''}</span>
                  {canDel && <button className="etq-del" title="Excluir produto" onClick={(e) => { e.stopPropagation(); if (confirm(`Excluir o produto "${it.nome}"? As etiquetas já emitidas são mantidas.`)) excluir.mutate(it.id) }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                  </button>}
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

      {avulsa && <AvulsaDrawer emitindo={emitindo} onClose={() => setAvulsa(false)} onEmit={emitirAvulsa} />}

      {drawer && <EmitDrawer item={drawer} prazos={prazosByItem[drawer.id] || []} grupo={drawer.grupo_id ? grupoById[drawer.grupo_id] : ''} emitindo={emitindo} onClose={() => setDrawer(null)} onEmit={(modo, opts) => emitir(drawer, modo, opts)} />}

      {/* PIN por último: fica por cima dos outros modais */}
      {pinAsk && <PinModal operador={opsLoja.find((o) => o.id === opSel)?.nome || ''} onClose={() => setPinAsk(null)}
        onOk={(pin) => { const run = pinAsk.run; setPinAsk(null); run({ op: opSel, pin }) }} />}

      {/* área de impressão (só aparece no print) */}
      <EtqPrintArea data={printData} />

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

function PinModal({ operador, onClose, onOk }: { operador: string; onClose: () => void; onOk: (pin: string) => void }) {
  const [pin, setPin] = useState('')
  const ok = /^[0-9]{4,6}$/.test(pin)
  return (
    <div className="etq-ov" onClick={onClose}>
      <div className="etq-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(340px,100%)' }}>
        <div className="etq-mh"><h2>PIN de {operador}</h2><button className="x" onClick={onClose}>✕</button></div>
        <div className="etq-mb">
          <div className="etq-fg"><label>Digite seu PIN (4 a 6 dígitos)</label>
            <input type="password" inputMode="numeric" autoFocus maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter' && ok) onOk(pin) }} placeholder="••••" style={{ fontSize: 20, letterSpacing: 6, textAlign: 'center' }} />
          </div>
        </div>
        <div className="etq-mf">
          <button className="etq-btn" onClick={onClose}>Cancelar</button>
          <button className="etq-btn etq-btn-pri" disabled={!ok} onClick={() => onOk(pin)}>Confirmar</button>
        </div>
      </div>
    </div>
  )
}

function AvulsaDrawer({ emitindo, onClose, onEmit }: { emitindo: boolean; onClose: () => void; onEmit: (f: AvulsaForm) => void }) {
  const [f, setF] = useState<AvulsaForm>({ nome: '', modo: 'resfriado', dias: '', horas: '', copias: 1, quantidade: '', unidade: '', marca: '', sif: '', lote: '', valOriginal: '' })
  const set = (k: keyof AvulsaForm, v: string | number) => setF((p) => ({ ...p, [k]: v }))
  const horas = (parseInt(f.dias) || 0) * 24 + (parseInt(f.horas) || 0)
  const validadePreview = horas > 0 ? new Date(Date.now() + horas * 3600_000) : null
  const copias = f.copias ?? 1
  return (
    <div className="etq-ov" onClick={onClose}>
      <div className="etq-modal" onClick={(e) => e.stopPropagation()}>
        <div className="etq-mh"><h2>Etiqueta avulsa</h2><button className="x" onClick={onClose}>✕</button></div>
        <div className="etq-mb">
          <div className="etq-fg"><label>Produto *</label><input autoFocus value={f.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex.: Molho especial do dia" /></div>
          <div className="etq-fg">
            <label>Modo de conservação</label>
            <div className="etq-seg" style={{ flexWrap: 'wrap' }}>
              {Object.entries(MODO_LABEL).map(([k, l]) => <button key={k} className={f.modo === k ? 'on' : ''} onClick={() => set('modo', k)}>{l}</button>)}
            </div>
          </div>
          <div className="etq-row2">
            <div className="etq-fg"><label>Prazo — dias</label><input inputMode="numeric" value={f.dias} onChange={(e) => set('dias', e.target.value.replace(/\D/g, ''))} placeholder="0" /></div>
            <div className="etq-fg"><label>Prazo — horas</label><input inputMode="numeric" value={f.horas} onChange={(e) => set('horas', e.target.value.replace(/\D/g, ''))} placeholder="0" /></div>
          </div>
          <div className="valbox"><div className="k">Validade (prévia)</div><div className="v">{validadePreview ? fmtDT(validadePreview.toISOString()) : '—'}</div></div>
          <div className="etq-row2">
            <div className="etq-fg"><label>Quantidade</label><input value={f.quantidade} onChange={(e) => set('quantidade', e.target.value)} placeholder="Ex.: 250" /></div>
            <div className="etq-fg"><label>Unidade</label>
              <select value={f.unidade} onChange={(e) => set('unidade', e.target.value)}><option value="">—</option><option>g</option><option>kg</option><option>un</option><option>mL</option><option>L</option></select>
            </div>
          </div>
          <div className="etq-row2">
            <div className="etq-fg"><label>Cópias</label>
              <div className="stepper"><button type="button" onClick={() => set('copias', Math.max(1, copias - 1))}>−</button><span>{copias}</span><button type="button" onClick={() => set('copias', copias + 1)}>+</button></div>
            </div>
            <div className="etq-fg"><label>Val. original (opcional)</label><input type="date" value={f.valOriginal} onChange={(e) => set('valOriginal', e.target.value)} /></div>
          </div>
          <div className="etq-row2">
            <div className="etq-fg"><label>Marca / fornecedor</label><input value={f.marca} onChange={(e) => set('marca', e.target.value)} placeholder="—" /></div>
            <div className="etq-fg"><label>SIF</label><input value={f.sif} onChange={(e) => set('sif', e.target.value)} placeholder="—" /></div>
          </div>
          <div className="etq-fg"><label>Lote (opcional)</label><input value={f.lote} onChange={(e) => set('lote', e.target.value)} placeholder="—" /></div>
          <div className="etq-hint">Item fora do cadastro — sai no grupo “Avulsa”. A validade final é calculada no servidor.</div>
        </div>
        <div className="etq-mf">
          <button className="etq-btn" onClick={onClose}>Cancelar</button>
          <button className="etq-btn etq-btn-pri" disabled={emitindo || !f.nome.trim() || horas < 1} onClick={() => onEmit(f)}>{emitindo ? 'Gerando…' : `🖨 Imprimir ${copias > 1 ? `(${copias})` : ''}`}</button>
        </div>
      </div>
    </div>
  )
}
