// utils.js — Funções compartilhadas Aiko Sistema
'use strict';

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
    const rend = (ins && +ins.rendimento_pct > 0) ? ins.rendimento_pct / 100 : 1;
    const custoKg = custoDoInsumo(it.insumo_id, lojaId, ctx);
    total += (custoKg / rend / 1000) * (+it.quantidade_g || 0);
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
