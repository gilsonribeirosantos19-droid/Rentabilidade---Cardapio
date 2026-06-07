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
