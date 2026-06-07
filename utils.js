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
