// utils.js — Funções compartilhadas Aiko Sistema
'use strict';

// ── CONFIG CENTRAL (Supabase) ─────────────────────────────────────
// FONTE ÚNICA da URL e da chave. As telas usam window.SUPA_URL / window.SUPA_KEY.
// Pra trocar/rotacionar a chave, muda SÓ aqui.
window.SUPA_URL = 'https://trczpnjidqfippbfxtpe.supabase.co';
window.SUPA_KEY = 'sb_publishable_GJqQ_qWVg5Y8GWaKy1qe7w_VvZiIQ3i';

// ── FEEDBACK VISUAL ───────────────────────────────────────────────
// Coloca botão em estado de loading e retorna função para restaurar
function btnLoading(btn, loadingText) {
  if (!btn) return () => {};
  const original = btn.innerHTML;
  const originalDisabled = btn.disabled;
  btn.disabled = true;
  btn.classList.add('btn-loading');
  if (loadingText) btn.textContent = loadingText;
  return function restore(restoredText) {
    btn.disabled = originalDisabled;
    btn.classList.remove('btn-loading');
    btn.innerHTML = restoredText !== undefined ? restoredText : original;
  };
}

// ── PADRONIZAÇÃO DE NOMES ──────────────────────────────────────────
// Converte para MAIÚSCULO mantendo acentos (SALMÃO, CAMARÃO, AÇÚCAR)
function toUpperName(str) {
  return (str || '').toUpperCase();
}

// Normaliza para busca insensível a maiúsculas E acentos
// "salmao" ou "salmão" ou "SALMÃO" → "salmao" para comparação
function normalizeSearch(str) {
  return (str || '').toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Aplica maiúsculo em campo de input enquanto digita
function bindUpperInput(el) {
  if (!el) return;
  el.addEventListener('input', function() {
    const pos = this.selectionStart;
    this.value = toUpperName(this.value);
    try { this.setSelectionRange(pos, pos); } catch {}
  });
}

// Aplica bindUpperInput por ID
function upperInput(id) {
  bindUpperInput(document.getElementById(id));
}

// ── TITLE CASE (PT-BR): "salsa crespa" / "SALSA CRESPA" → "Salsa Crespa" ──
// Primeira letra de cada palavra em maiúscula; conectores (de/da/do/e...) ficam
// minúsculos, menos quando são a 1ª palavra. Use em NOMES DE ITEM (não em fornecedor).
const _TITLE_CONNECTORS = new Set(['de','da','do','das','dos','e','com','sem','para','por','a','o','as','os','à','às','ao','aos','em','no','na','nos','nas']);
function titleName(str) {
  let first = true;
  return (str || '').toLowerCase().replace(/\S+/g, (w) => {
    if (!first && _TITLE_CONNECTORS.has(w)) return w;
    first = false;
    return w.charAt(0).toUpperCase() + w.slice(1);
  });
}
// Aplica Title Case ao vivo enquanto digita (preserva a posição do cursor)
function bindTitleInput(el) {
  if (!el) return;
  el.addEventListener('input', function () {
    const pos = this.selectionStart;
    this.value = titleName(this.value);
    try { this.setSelectionRange(pos, pos); } catch {}
  });
}
function titleInput(id) {
  bindTitleInput(document.getElementById(id));
}

// ── ESCAPE DE HTML ─────────────────────────────────────────────────
// Fonte única. Escapa texto E atributos (& < > "). As telas NÃO devem
// redefinir esc() localmente — usam esta. (Centralizado 2026-06-13.)
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

async function _refreshToken(supaUrl, supaKey) {
  const refreshToken = localStorage.getItem('sb_refresh_token');
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${supaUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'apikey': supaKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.access_token) {
      localStorage.setItem('sb_token', data.access_token);
      if (data.refresh_token) localStorage.setItem('sb_refresh_token', data.refresh_token);
      return true;
    }
  } catch {}
  return false;
}

function createApi(supaUrl, supaKey) {
  return async function(endpoint, opts={}) {
    const method = (opts.method||'GET').toUpperCase();
    const doRequest = async () => {
      const token = localStorage.getItem('sb_token') || supaKey;
      const headers = { 'apikey': supaKey, 'Authorization': 'Bearer ' + token };
      if (opts.body) headers['Content-Type'] = 'application/json';
      if (opts.prefer) headers['Prefer'] = opts.prefer;
      else if (method==='POST') headers['Prefer'] = 'return=representation';
      else if (method==='PATCH') headers['Prefer'] = 'return=representation';
      return fetch(`${supaUrl}/rest/v1/${endpoint}`, {method, headers, body: opts.body||undefined});
    };

    let res = await doRequest();

    // Se JWT expirou, tenta renovar e refaz a requisição
    if (res.status === 401 || res.status === 403) {
      let body = '';
      try { body = await res.clone().text(); } catch {}
      if (body.includes('expired') || body.includes('JWT')) {
        const refreshed = await _refreshToken(supaUrl, supaKey);
        if (refreshed) res = await doRequest();
      }
    }

    if (!res.ok) {
      let msg = res.statusText;
      try { const j = await res.json(); msg = j.message||j.error||msg; } catch {}
      throw new Error(`[${res.status}] ${msg}`);
    }
    const ct = res.headers.get('content-type')||'';
    if (ct.includes('application/json')) { const t = await res.text(); return t ? JSON.parse(t) : []; }
    return [];
  };
}

// ── BUSCA PAGINADA (pega TODAS as linhas) ──────────────────────────
// O PostgREST devolve no máximo ~1000 linhas por requisição. Esta função
// pagina (limit/offset) até trazer tudo — use em telas que SOMAM/LISTAM
// tabelas grandes (entradas, saídas, saldos…) pra não subcontar.
async function apiAll(endpoint, pageSize) {
  pageSize = pageSize || 1000;
  const _api = createApi(window.SUPA_URL, window.SUPA_KEY);
  const sep = endpoint.includes('?') ? '&' : '?';
  let all = [], offset = 0;
  for (let guard = 0; guard < 500; guard++) {
    const page = await _api(`${endpoint}${sep}limit=${pageSize}&offset=${offset}`);
    if (!Array.isArray(page) || page.length === 0) break;
    all = all.concat(page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}
window.apiAll = apiAll;

// ── PREFERÊNCIAS DO USUÁRIO (por usuário, no banco: usuarios.preferencias) ──
// Guarda config de colunas por relatório: preferencias.colunas[reportKey] = {colId:bool}.
// Leitura: do cache sb_user (carregado no login). Gravação: RPC salvar_preferencia
// (security definer — usuário só grava a PRÓPRIA preferência). Ver supabase/preferencias_usuario.sql.
function getUserPrefs() {
  try { return (JSON.parse(localStorage.getItem('sb_user') || '{}').preferencias) || {}; } catch { return {}; }
}
function getColPref(reportKey) {
  const p = getUserPrefs();
  return (p.colunas && p.colunas[reportKey]) || null;
}
async function saveColPref(reportKey, colsMap) {
  const prefs = getUserPrefs();
  prefs.colunas = prefs.colunas || {};
  prefs.colunas[reportKey] = colsMap;
  const _api = createApi(window.SUPA_URL, window.SUPA_KEY);
  await _api('rpc/salvar_preferencia', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify({ p_prefs: prefs }) });
  // atualiza o cache local pra refletir na hora (sem precisar relogar)
  try { const u = JSON.parse(localStorage.getItem('sb_user') || '{}'); u.preferencias = prefs; localStorage.setItem('sb_user', JSON.stringify(u)); } catch {}
  return true;
}
window.getColPref = getColPref;
window.saveColPref = saveColPref;

// ── FILTRO DE LOJA ─────────────────────────────────────────────────
// Monta as <option> do filtro de loja mantendo o padrão visual em todas as telas.
// Com apenas 1 loja, mostra o NOME dela direto (value="" = sem filtro, seguro —
// não esconde dados sem loja). Com 2+ lojas, mostra "Todas as lojas" + as opções.
function lojaFiltroHtml(lojas, allLabel) {
  allLabel = allLabel || 'Todas as lojas';
  const e = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  if (lojas && lojas.length === 1) return `<option value="">${e(lojas[0].nome)}</option>`;
  return `<option value="">${allLabel}</option>` + (lojas || []).map(l => `<option value="${l.id}">${e(l.nome)}</option>`).join('');
}

// ── FILTRO DE PERÍODO RÁPIDO ───────────────────────────────────────
// Padrão usado em todas as telas: dropdown "Período / Mês Atual / Mês Anterior".
// Preenche os dois inputs de data (deId/ateId) e dispara o callback fn.
function setPeriodoRange(tipo, deId, ateId, fn) {
  const d = new Date();
  if (tipo === 'mes_atual') {
    document.getElementById(deId).value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
    document.getElementById(ateId).value = d.toISOString().split('T')[0];
  } else if (tipo === 'mes_anterior') {
    const prev = new Date(d.getFullYear(), d.getMonth()-1, 1);
    const last = new Date(d.getFullYear(), d.getMonth(), 0);
    document.getElementById(deId).value = `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}-01`;
    document.getElementById(ateId).value = `${last.getFullYear()}-${String(last.getMonth()+1).padStart(2,'0')}-${String(last.getDate()).padStart(2,'0')}`;
  }
  if (fn) fn();
}

// ── CÓDIGO INTERNO ─────────────────────────────────────────────────
// Formata o código interno do item (número sequencial guardado no banco) com 6 dígitos.
// Mesmo código em todas as telas, estável (não muda quando se adiciona/remove item).
function fmtCodigoInterno(v) {
  if (v == null || v === '') return '—';
  const n = parseInt(v, 10);
  return isNaN(n) ? String(v) : String(n).padStart(6, '0');
}

// ── FONTE ÚNICA DE CUSTO (ver ARQUITETURA.md §5) ───────────────────
// Reconstrói o custo médio de um insumo COMO ESTAVA numa data (média móvel ponderada,
// igual ao Kardex). Percorre entradas/saídas até dataLimite. custo_unitario já é por unidade.
// ctx = { entradas, saidas }. dataLimite = 'YYYY-MM-DD' (ou ISO); null/ausente = considera tudo.
function custoMedioNaData(insumoId, dataLimite, ctx) {
  ctx = ctx || {};
  const lim = dataLimite ? (String(dataLimite).length === 10 ? dataLimite + 'T23:59:59' : dataLimite) : null;
  const dt = m => m.criado_em || m.created_at || '';
  const movs = [];
  (ctx.entradas || []).forEach(e => { if (e.insumo_id === insumoId && (!lim || dt(e) <= lim)) movs.push({ d: dt(e), ent: true, q: +e.quantidade || 0, v: +e.custo_unitario || 0 }); });
  (ctx.saidas || []).forEach(s => { if (s.insumo_id === insumoId && (!lim || dt(s) <= lim)) movs.push({ d: dt(s), ent: false, q: +s.quantidade || 0 }); });
  movs.sort((a, b) => a.d < b.d ? -1 : (a.d > b.d ? 1 : 0));
  let q = 0, cm = 0;
  movs.forEach(m => {
    if (m.ent) {
      if (m.q === 0) { cm = m.v; }                                  // ajuste de custo médio (redefine o custo)
      else { const nq = q + m.q; cm = nq > 0 ? (q * cm + m.q * m.v) / nq : cm; q = nq; }
    }
    else { q = Math.max(0, q - m.q); }
  });
  return { custo: cm, quantidade: q };
}

// Custo de UM insumo (R$ por unidade de estoque — kg/un/litro).
// Se ctx.dataLimite estiver definido (+ entradas/saidas no ctx), reconstrói o custo médio
// HISTÓRICO daquela data (modo "Everest" — custo do período). Senão, usa a fonte atual, nesta ordem:
//   1) custo_medio do saldo (da loja)  2) preco_unitario do vínculo  3) preco_compra do insumo
// ctx = { saldos, vinculos, insumos, entradas?, saidas?, dataLimite? }
function custoDoInsumo(insumoId, lojaId, ctx) {
  ctx = ctx || {};
  if (ctx.dataLimite && (ctx.entradas || ctx.saidas)) {
    const r = custoMedioNaData(insumoId, ctx.dataLimite, ctx);
    if (r.custo > 0) return r.custo;
  }
  const saldos = ctx.saldos || [], vinculos = ctx.vinculos || [], insumos = ctx.insumos || [];
  const salLoja = lojaId && saldos.find(s => s.insumo_id === insumoId && s.loja_id === lojaId && +s.custo_medio > 0);
  if (salLoja) return +salLoja.custo_medio;
  const salAny = saldos.find(s => s.insumo_id === insumoId && +s.custo_medio > 0);
  if (salAny) return +salAny.custo_medio;
  const vin = vinculos.find(v => v.insumo_id === insumoId && +v.preco_unitario > 0);
  if (vin) return +vin.preco_unitario;
  const ins = insumos.find(i => i.id === insumoId);
  return ins && +ins.preco_compra > 0 ? +ins.preco_compra : 0;
}

// Custo de UMA PORÇÃO de uma ficha técnica, usando custoDoInsumo + rendimento dos insumos.
// itens = [{insumo_id, quantidade_g}], rendimentoPorcoes = nº de porções da receita.
// Fórmula por ingrediente: custo_kg / (rendimento_pct/100) / 1000 × quantidade_g; soma ÷ porções.
function custoFichaPorcao(itens, rendimentoPorcoes, lojaId, ctx) {
  ctx = ctx || {};
  const insumos = ctx.insumos || [];
  let total = 0;
  (itens || []).forEach(it => {
    const ins = insumos.find(i => i.id === it.insumo_id);
    const custoBase = custoDoInsumo(it.insumo_id, lojaId, ctx);
    const um = ins ? (ins.unidade_medida || ins.unidade_compra || 'g') : 'g';
    if (um === 'un' || um === 'pct' || um === 'cx') {
      // insumo unitário: custo direto × quantidade (sem /1000 e sem rendimento)
      total += custoBase * (+it.quantidade_g || 0);
    } else {
      const rend = (ins && +ins.rendimento_pct > 0) ? ins.rendimento_pct / 100 : 1;
      total += (custoBase / rend / 1000) * (+it.quantidade_g || 0);
    }
  });
  const por = +rendimentoPorcoes > 0 ? +rendimentoPorcoes : 1;
  return total / por;
}

// Custo unitário de um item de venda: pela FICHA (fonte única) quando há ficha vinculada;
// senão, cai no custo_unitario gravado na venda. v = registro de vendas_item.
// ctx = { saldos, vinculos, insumos, fichas, lojaId }
function custoVendaItem(v, ctx) {
  ctx = ctx || {};
  const fichas = ctx.fichas || [];
  const ficha = v && v.ficha_id ? fichas.find(f => f.id === v.ficha_id) : null;
  if (ficha && (ficha.itens_ficha || ficha.itens)) {
    return custoFichaPorcao(ficha.itens_ficha || ficha.itens, ficha.rendimento_porcoes, ctx.lojaId, ctx);
  }
  return +(v && v.custo_unitario) || 0;
}

// ── SELETOR COM BUSCA (searchable select) ──────────────────────────
// Converte um <select> em um seletor com CAMPO DE BUSCA, mantendo o value e o evento change.
// Aplica-se AUTOMATICAMENTE nos selects com muitas opções (ver searchableAuto, abaixo).
function searchableSelect(sel){
  if(!sel || sel._ss) return;
  sel._ss = true;
  sel.style.display = 'none';
  const wrap = document.createElement('div'); wrap.className = 'ss-wrap';
  const r = sel.getBoundingClientRect(); if(r.width > 0) wrap.style.width = r.width + 'px';
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'ss-btn';
  const drop = document.createElement('div'); drop.className = 'ss-drop';
  drop.innerHTML = '<input class="ss-search" placeholder="Digite para buscar..."><div class="ss-list"></div>';
  wrap.appendChild(btn); wrap.appendChild(drop);
  sel.parentNode.insertBefore(wrap, sel.nextSibling);
  const search = drop.querySelector('.ss-search'), list = drop.querySelector('.ss-list');
  const e2 = s => String(s==null?'':s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function sync(){ const o = sel.options[sel.selectedIndex]; const txt = o ? o.text : ''; if(btn.textContent !== txt) btn.textContent = txt; btn.classList.toggle('ss-ph', !sel.value); }
  function render(f){ f = (f||'').toLowerCase();
    list.innerHTML = [...sel.options].filter(o => o.text.toLowerCase().includes(f))
      .map(o => `<div class="ss-opt${o.value && o.value===sel.value?' sel':''}" data-v="${e2(o.value)}">${e2(o.text)}</div>`).join('')
      || '<div class="ss-empty">Nada encontrado</div>'; }
  // Posiciona o dropdown como "fixed" (flutua por cima — não é cortado por tabela/modal com overflow)
  function place(){
    const rect = btn.getBoundingClientRect();
    drop.style.position = 'fixed';
    drop.style.right = 'auto';
    drop.style.width = rect.width + 'px';
    drop.style.minWidth = '220px';
    // Se o dropdown (220px) passar da borda direita da tela, alinha pela direita do botão
    const dw = Math.max(rect.width, 220);
    drop.style.left = Math.min(rect.left, window.innerWidth - dw - 8) + 'px';
    drop.style.zIndex = '99999';
    const below = window.innerHeight - rect.bottom - 8, above = rect.top - 8;
    const up = below < 200 && above > below;
    const maxH = Math.max(140, Math.min(300, up ? above : below));
    if(up){ drop.style.top = 'auto'; drop.style.bottom = (window.innerHeight - rect.top + 4) + 'px'; }
    else { drop.style.bottom = 'auto'; drop.style.top = (rect.bottom + 4) + 'px'; }
    list.style.maxHeight = (maxH - 44) + 'px';
  }
  drop._place = place;
  btn.onclick = ev => { ev.stopPropagation(); if(sel.disabled) return; const open = drop.classList.toggle('open'); if(open){ place(); render(''); search.value = ''; setTimeout(() => search.focus(), 0); } };
  search.oninput = () => render(search.value);
  list.onclick = ev => { const o = ev.target.closest('.ss-opt'); if(!o) return; sel.value = o.dataset.v; sync(); drop.classList.remove('open'); sel.dispatchEvent(new Event('change', { bubbles: true })); };
  sel._ssSync = sync; sync();
}

// Aplica busca automaticamente nos selects "grandes" (>= min opções). Lê as opções AO VIVO,
// então funciona mesmo com selects preenchidos depois (reaplica via MutationObserver).
// Para excluir um select específico: adicione o atributo data-no-search nele.
let _ssObs = null;
function searchableAuto(min){
  min = min || 12;
  // Não reprocessa enquanto um dropdown está aberto (senão o re-render fecha/atrapalha o seletor)
  if(document.querySelector('.ss-drop.open')) return;
  if(_ssObs) _ssObs.disconnect();
  document.querySelectorAll('select').forEach(sel => {
    if(sel.hasAttribute('data-no-search') || sel.multiple) return;
    if(sel._ss){ sel._ssSync && sel._ssSync(); return; }
    if(sel.options.length >= min) searchableSelect(sel);
  });
  _removePagination();
  if(_ssObs){ try { _ssObs.observe(document.body, { childList:true, subtree:true }); } catch {} }
}

// Remove a paginação: nos seletores "X por página", adiciona "Todos" (mostra a lista inteira)
// e esconde os botões de página do mesmo bloco. Não mexe em telas sem esse seletor.
function _removePagination(){
  document.querySelectorAll('select').forEach(sel => {
    if(![...sel.options].some(o => /por p[áa]g/i.test(o.text))) return;
    if(!sel._allP){
      sel._allP = true;
      const o = document.createElement('option'); o.value = '100000'; o.textContent = 'Todos'; sel.appendChild(o);
      sel.style.display = 'none';
      const btns = sel.parentElement && sel.parentElement.querySelector('.pag-btns');
      if(btns) btns.style.display = 'none';
    }
    if(sel.value !== '100000'){ sel.value = '100000'; sel.dispatchEvent(new Event('change', { bubbles:true })); }
  });
}

// Injeta o CSS do seletor + liga o auto (em qualquer página que carregue o utils.js).
if(typeof document !== 'undefined'){
  const _ssStyle = document.createElement('style');
  _ssStyle.textContent = '.ss-wrap{position:relative}.ss-btn{width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:9px 12px;font-size:13px;color:#0f172a;text-align:left;cursor:pointer;font-family:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ss-btn:hover{border-color:#f97316}.ss-btn.ss-ph{color:#94a3b8}.ss-drop{display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.14);z-index:1000;margin-top:4px;overflow:hidden}.ss-drop.open{display:block}.ss-search{width:100%;border:none;border-bottom:1px solid #e2e8f0;padding:9px 12px;font-size:13px;outline:none;font-family:inherit}.ss-list{max-height:230px;overflow-y:auto}.ss-opt{padding:8px 12px;font-size:13px;cursor:pointer;color:#0f172a;border-bottom:1px solid #f5f7fa}.ss-opt:hover{background:#fff7ed}.ss-opt.sel{background:#fff7ed;color:#f97316;font-weight:600}.ss-empty{padding:10px 12px;color:#94a3b8;font-size:12px}';
  (document.head || document.documentElement).appendChild(_ssStyle);
  document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('click', e => {
      document.querySelectorAll('.ss-drop.open').forEach(d => { if(!d.parentNode.contains(e.target)) d.classList.remove('open'); });
    }, true);
    // Fecha o dropdown ao rolar (já que ele flutua em posição fixa)
    // Ao rolar, o dropdown ACOMPANHA o botão (não fecha). Fecha só ao clicar fora.
    window.addEventListener('scroll', () => { document.querySelectorAll('.ss-drop.open').forEach(d => d._place && d._place()); }, true);
    let t;
    _ssObs = new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => searchableAuto(), 200); });
    searchableAuto();
  });
}

// ── DANFE (impressão de nota) ─ centralizado: usado em entradas_processadas.html e fiscal.html ──
const _NFE_WEBHOOK = 'https://trczpnjidqfippbfxtpe.supabase.co/functions/v1/nfe-webhook';

// Abre o DANFE (PDF oficial) da nota recebida — busca a URL pré-assinada no Focus via Edge Function.
async function imprimirDanfe(chave, btn){
  if(!chave){ toast('Nota sem chave de acesso.','err'); return; }
  const _orig = btn ? btn.innerHTML : '';
  if(btn){ btn.disabled=true; btn.style.opacity='.6'; btn.innerHTML='Gerando DANFE...'; }
  try{
    const r = await fetch(_NFE_WEBHOOK, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ danfe:true, chave }) });
    const j = await r.json();
    if(j && j.ok && j.url){ window.open(j.url, '_blank'); }
    else { toast('DANFE indisponível para esta nota (o Focus não tem o PDF dela).','err'); }
  }catch(e){ toast('Erro ao gerar DANFE: '+(e&&e.message||e),'err'); }
  if(btn){ btn.disabled=false; btn.style.opacity=''; btn.innerHTML=_orig; }
}

// Gera o "DANFE padrão Aiko" (documento INTERNO) a partir da nota completa do Focus.
async function gerarDanfeAiko(chave, btn){
  if(!chave){ toast('Nota sem chave de acesso.','err'); return; }
  const _o = btn ? btn.innerHTML : '';
  if(btn){ btn.disabled=true; btn.style.opacity='.6'; btn.innerHTML='Gerando...'; }
  try{
    const r = await fetch(_NFE_WEBHOOK, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ completa:true, chave }) });
    const j = await r.json();
    if(j && j.ok && j.nota && j.nota.requisicao_nota_fiscal){ _abrirDanfeAiko(j.nota); }
    else { toast('Nota completa indisponível no Focus para gerar o DANFE.','err'); }
  }catch(e){ toast('Erro ao gerar DANFE: '+(e&&e.message||e),'err'); }
  if(btn){ btn.disabled=false; btn.style.opacity=''; btn.innerHTML=_o; }
}

function _abrirDanfeAiko(nota){
  const req = nota.requisicao_nota_fiscal || {};
  const its = req.itens || [];
  const E  = s => esc(s==null?'':String(s));
  const v2 = v => Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const vu = v => Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:4});
  const qt = v => Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:3,maximumFractionDigits:4});
  const docf = v => { const s=String(v||'').replace(/\D/g,''); if(s.length===14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5'); if(s.length===11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4'); return v?String(v):'—'; };
  const dt = v => { if(!v) return ''; const s=String(v).slice(0,10).split('-'); return s.length===3?`${s[2]}/${s[1]}/${s[0]}`:String(v); };
  const cepf = v => { const s=String(v||'').replace(/\D/g,''); return s.length===8?s.replace(/(\d{5})(\d{3})/,'$1-$2'):(v||''); };
  const chaveF = c => String(c||'').replace(/\D/g,'').replace(/(\d{4})(?=\d)/g,'$1 ').trim();
  const FRETE = {'0':'0 - Emitente','1':'1 - Destinatário','2':'2 - Terceiros','3':'3 - Próprio (Rem.)','4':'4 - Próprio (Dest.)','9':'9 - Sem Frete'};
  const vol  = (req.volumes && req.volumes[0]) || {};
  const dups = Array.isArray(req.duplicatas) ? req.duplicatas : (req.duplicatas ? [req.duplicatas] : []);
  const tipo = String(req.tipo_documento)==='0' ? '0 - ENTRADA' : '1 - SAÍDA';
  const endE = [req.logradouro_emitente, req.numero_emitente, req.complemento_emitente, req.bairro_emitente].filter(Boolean).join(', ');
  const endD = [req.logradouro_destinatario, req.numero_destinatario, req.complemento_destinatario].filter(Boolean).join(', ');
  const pr = nota.protocolo_nota_fiscal;
  const protTxt = (pr && typeof pr==='object')
    ? `${pr.numero_protocolo||''}${pr.data_recebimento?' - '+dt(pr.data_recebimento)+' '+String(pr.data_recebimento).slice(11,19):''}`.trim()
    : (pr||'—');

  const linhas = its.map(it => {
    const cst = String(it.icms_origem||'') + String(it.icms_situacao_tributaria||'');
    return `<tr><td>${E(it.codigo_produto)}</td><td class="pdesc">${E(it.descricao)}</td><td class="c">${E(it.codigo_ncm)}</td><td class="c">${E(cst)}</td><td class="c">${E(it.cfop)}</td><td class="c">${E(it.unidade_comercial)}</td><td class="r">${qt(it.quantidade_comercial)}</td><td class="r">${vu(it.valor_unitario_comercial)}</td><td class="r">0,00</td><td class="r">${v2(it.valor_bruto)}</td><td class="r">0,00</td><td class="r">0,00</td><td class="r">0,00</td><td class="r">0,00</td><td class="r">0,00</td><td class="c">0,00</td><td class="c">0,00</td></tr>`;
  }).join('');
  const dupTxt = dups.length ? dups.map(d=>`${E(d.numero||'')} · venc ${dt(d.data_vencimento)} · R$ ${v2(d.valor)}`).join(' &nbsp;|&nbsp; ') : '—';

  const css = `
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{height:100%}
    body{font-family:Arial,Helvetica,sans-serif;background:#64748b;padding:18px;color:#000}
    .toolbar{max-width:1000px;margin:0 auto 12px;display:flex;gap:10px;align-items:center;color:#fff}
    .toolbar .h{font-size:14px;font-weight:700;flex:1}
    .btn{background:#f97316;color:#fff;border:none;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
    .danfe{max-width:1000px;margin:0 auto;background:#fff;padding:10px;font-size:10px;line-height:1.35;color:#000}
    .bx{border:1px solid #000}.row{display:flex}
    .cell{border:1px solid #000;padding:3px 7px;flex:1;min-width:0}
    .lbl{font-size:7.5px;color:#333;text-transform:uppercase;display:block;margin-bottom:1px}
    .val{font-size:11px;font-weight:600}.b{font-weight:700}.center{text-align:center}
    .sec{font-size:8.5px;font-weight:700;text-transform:uppercase;padding:3px 7px;margin-top:5px;background:#f3f4f6}
    .receb{display:flex;border:1px solid #000;font-size:9px}.receb>div{padding:5px 7px;border-right:1px solid #000}
    .receb .canhoto{width:58%}.receb .sig{flex:1}.receb .nf{width:96px;border-right:none;text-align:center}
    .tracejado{border-top:1px dashed #000;margin:4px 0}
    .topo{display:flex}.emit{flex:2;border:1px solid #000;padding:10px;text-align:center}
    .emit .nome{font-size:15px;font-weight:800;margin-bottom:4px}
    .dbox{flex:1.05;border:1px solid #000;border-left:none;padding:7px;text-align:center}
    .dbox .t{font-size:19px;font-weight:800;letter-spacing:1px}.dbox .s{font-size:7.5px}.dbox .es{font-size:9.5px;margin-top:4px}
    .barra{flex:1.5;border:1px solid #000;border-left:none;padding:7px}
    .bars{height:36px;background:repeating-linear-gradient(90deg,#000 0 1.5px,#fff 1.5px 3px,#000 3px 5px,#fff 5px 7px);margin-bottom:4px}
    .chave{font-size:10.5px;font-family:monospace;word-break:break-all;text-align:center;font-weight:700}
    table{width:100%;border-collapse:collapse;margin-top:3px}
    th,td{border:1px solid #000;padding:3px 4px;font-size:9px}
    th{background:#eee;font-size:7.5px;text-transform:uppercase}
    td.r,th.r{text-align:right}td.c,th.c{text-align:center}
    .prodtbl th,.prodtbl td{font-size:7.6px;padding:2px 3px;white-space:nowrap}
    .prodtbl th{font-size:6.8px}
    .prodtbl .pdesc{min-width:240px;white-space:normal;text-align:left}
    .dados-add{margin-top:8px}
    @page{size:A4;margin:8mm}
    @media print{html,body{height:auto}body{background:#fff;padding:0}.toolbar{display:none}.danfe{max-width:100%;padding:0 0 86px}.dados-add{position:fixed;left:0;right:0;bottom:0;background:#fff;margin:0}}
  `;

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>DANFE ${E(req.numero)} - ${E(req.nome_emitente)}</title><style>${css}</style></head><body>
    <div class="toolbar"><div class="h">DANFE padrão Aiko — Nº ${E(req.numero)} · ${E(req.nome_emitente)} (documento interno)</div><button class="btn" onclick="window.print()">🖨️ Imprimir</button></div>
    <div class="danfe">
      <div class="receb">
        <div class="canhoto"><span class="lbl">Recebemos de ${E(req.nome_emitente)} os produtos constantes da Nota Fiscal indicada ao lado</span></div>
        <div class="sig"><span class="lbl">Data de recebimento</span><br><span class="lbl">Identificação e assinatura do recebedor</span></div>
        <div class="nf"><b>NF-e</b><br>Nº ${E(req.numero)}<br>Série ${E(req.serie)}</div>
      </div>
      <div class="tracejado"></div>
      <div class="topo">
        <div class="emit">
          <div class="nome">${E(req.nome_emitente)}</div>
          <div>${E(endE)}<br>${E(req.municipio_emitente)} / ${E(req.uf_emitente)} — CEP ${E(cepf(req.cep_emitente))}<br>Fone: ${E(req.telefone_emitente||'—')}</div>
        </div>
        <div class="dbox">
          <div class="t">DANFE</div><div class="s">Documento Auxiliar da<br>Nota Fiscal Eletrônica</div>
          <div class="es">${E(tipo)}</div>
          <div class="b" style="margin-top:4px">Nº ${E(req.numero)}<br>Série ${E(req.serie)}</div>
        </div>
        <div class="barra">
          <div class="bars"></div>
          <div class="lbl center">Chave de acesso</div>
          <div class="chave">${E(chaveF(req.chave_nfe||nota.chave_nfe))}</div>
          <div class="lbl center" style="margin-top:3px">Consulta de autenticidade no portal nacional da NF-e (www.nfe.fazenda.gov.br) ou no site da Sefaz</div>
        </div>
      </div>
      <div class="row">
        <div class="cell" style="flex:2"><span class="lbl">Natureza da operação</span><span class="val">${E(req.natureza_operacao)}</span></div>
        <div class="cell" style="flex:1.6"><span class="lbl">Protocolo de autorização de uso</span><span class="val">${E(protTxt)}</span></div>
      </div>
      <div class="row">
        <div class="cell"><span class="lbl">Inscrição Estadual</span><span class="val">${E(req.inscricao_estadual_emitente||'—')}</span></div>
        <div class="cell"><span class="lbl">CNPJ Emitente</span><span class="val">${E(docf(req.cnpj_emitente))}</span></div>
      </div>
      <div class="sec">Destinatário / Remetente</div>
      <div class="row">
        <div class="cell" style="flex:2.4"><span class="lbl">Nome / Razão Social</span><span class="val">${E(req.nome_destinatario)}</span></div>
        <div class="cell"><span class="lbl">CNPJ / CPF</span><span class="val">${E(docf(req.cnpj_destinatario||nota.cnpj_destinatario||nota.cpf_destinatario))}</span></div>
        <div class="cell"><span class="lbl">Data da Emissão</span><span class="val">${E(dt(req.data_emissao||nota.data_emissao))}</span></div>
      </div>
      <div class="row">
        <div class="cell" style="flex:2"><span class="lbl">Endereço</span><span class="val">${E(endD)}</span></div>
        <div class="cell"><span class="lbl">Bairro</span><span class="val">${E(req.bairro_destinatario||'—')}</span></div>
        <div class="cell"><span class="lbl">CEP</span><span class="val">${E(cepf(req.cep_destinatario))}</span></div>
        <div class="cell"><span class="lbl">Inscrição Estadual</span><span class="val">${E(req.inscricao_estadual_destinatario||'—')}</span></div>
      </div>
      <div class="row">
        <div class="cell"><span class="lbl">Município</span><span class="val">${E(req.municipio_destinatario)}</span></div>
        <div class="cell"><span class="lbl">UF</span><span class="val">${E(req.uf_destinatario)}</span></div>
      </div>
      <div class="sec">Fatura / Duplicatas</div>
      <div class="row">
        <div class="cell"><span class="lbl">Nº Fatura</span><span class="val">${E(req.numero_fatura||'—')}</span></div>
        <div class="cell"><span class="lbl">Valor Original</span><span class="val">${v2(req.valor_original_fatura)}</span></div>
        <div class="cell"><span class="lbl">Valor Desconto</span><span class="val">${v2(req.valor_desconto_fatura)}</span></div>
        <div class="cell"><span class="lbl">Valor Líquido</span><span class="val">${v2(req.valor_liquido_fatura)}</span></div>
        <div class="cell" style="flex:2"><span class="lbl">Duplicatas</span><span class="val">${dupTxt}</span></div>
      </div>
      <div class="sec">Cálculo do Imposto</div>
      <div class="row">
        <div class="cell"><span class="lbl">Base ICMS</span><span class="val">${v2(req.icms_base_calculo)}</span></div>
        <div class="cell"><span class="lbl">Valor ICMS</span><span class="val">${v2(req.icms_valor_total)}</span></div>
        <div class="cell"><span class="lbl">Base ICMS ST</span><span class="val">${v2(req.icms_base_calculo_st)}</span></div>
        <div class="cell"><span class="lbl">Valor ICMS ST</span><span class="val">${v2(req.icms_valor_total_st)}</span></div>
        <div class="cell"><span class="lbl">Valor Frete</span><span class="val">${v2(req.valor_frete)}</span></div>
        <div class="cell"><span class="lbl">Valor Seguro</span><span class="val">${v2(req.valor_seguro)}</span></div>
        <div class="cell"><span class="lbl">Total Produtos</span><span class="val">${v2(req.valor_produtos)}</span></div>
      </div>
      <div class="row">
        <div class="cell"><span class="lbl">Desconto</span><span class="val">${v2(req.valor_desconto)}</span></div>
        <div class="cell"><span class="lbl">Outras Despesas</span><span class="val">${v2(req.valor_outras_despesas)}</span></div>
        <div class="cell"><span class="lbl">Valor IPI</span><span class="val">${v2(req.valor_ipi)}</span></div>
        <div class="cell"><span class="lbl">Valor PIS</span><span class="val">${v2(req.valor_pis)}</span></div>
        <div class="cell"><span class="lbl">Valor COFINS</span><span class="val">${v2(req.valor_cofins)}</span></div>
        <div class="cell" style="background:#f3f4f6;flex:2"><span class="lbl">Valor Total da Nota</span><span class="val b" style="font-size:11px">${v2(req.valor_total||nota.valor_total)}</span></div>
      </div>
      <div class="sec">Transportador / Volumes</div>
      <div class="row">
        <div class="cell" style="flex:2"><span class="lbl">Modalidade do Frete</span><span class="val">${E(FRETE[String(req.modalidade_frete)]||req.modalidade_frete||'—')}</span></div>
        <div class="cell"><span class="lbl">Qtd. Volumes</span><span class="val">${E(vol.quantidade||'—')}</span></div>
        <div class="cell"><span class="lbl">Espécie</span><span class="val">${E(vol.especie||'—')}</span></div>
        <div class="cell"><span class="lbl">Peso Bruto</span><span class="val">${E(vol.peso_bruto||'0,000')}</span></div>
        <div class="cell"><span class="lbl">Peso Líquido</span><span class="val">${E(vol.peso_liquido||'0,000')}</span></div>
      </div>
      <div class="sec">Dados dos Produtos / Serviços</div>
      <table class="prodtbl">
        <thead>
          <tr>
            <th rowspan="2" style="width:70px">Cód. Prod.</th>
            <th rowspan="2" class="pdesc">Descrição do Produto / Serviço</th>
            <th rowspan="2" class="c">NCM/SH</th><th rowspan="2" class="c">CST</th><th rowspan="2" class="c">CFOP</th>
            <th rowspan="2" class="c">Un.</th><th rowspan="2" class="r">Quant.</th><th rowspan="2" class="r">Valor Unitário</th>
            <th rowspan="2" class="r">Valor Desconto</th><th rowspan="2" class="r">Valor Total</th>
            <th rowspan="2" class="r">B. Cálc. ICMS</th><th rowspan="2" class="r">B. Cálc. ICMS ST</th>
            <th rowspan="2" class="r">Valor ICMS</th><th rowspan="2" class="r">Valor ICMS ST</th><th rowspan="2" class="r">Valor IPI</th>
            <th colspan="2" class="c">Alíquota %</th>
          </tr>
          <tr><th class="c">ICMS</th><th class="c">IPI</th></tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
      <div class="dados-add">
        <div class="sec">Dados Adicionais</div>
        <div class="bx" style="padding:8px;min-height:78px;font-size:9.5px;line-height:1.4">${E(req.informacoes_adicionais_contribuinte||req.observacoes_contribuinte||'—')}<br><br><b>Espelho interno gerado pelo Aiko</b> — para fins fiscais, vale o DANFE oficial (SEFAZ).</div>
      </div>
    </div>
  </body></html>`;

  const w = window.open('', '_blank');
  if(!w){ toast('Permita pop-ups para abrir o DANFE.','err'); return; }
  w.document.write(html); w.document.close();
}
