// utils.js — Funções compartilhadas Aiko Sistema
'use strict';

function createApi(supaUrl, supaKey) {
  return async function(endpoint, opts={}) {
    const method = (opts.method||'GET').toUpperCase();
    const token = localStorage.getItem('sb_token') || supaKey;
    const headers = { 'apikey': supaKey, 'Authorization': 'Bearer ' + token };
    if (opts.body) headers['Content-Type'] = 'application/json';
    if (opts.prefer) headers['Prefer'] = opts.prefer;
    else if (method==='POST') headers['Prefer'] = 'return=representation';
    else if (method==='PATCH') headers['Prefer'] = 'return=representation';
    const res = await fetch(`${supaUrl}/rest/v1/${endpoint}`, {method, headers, body: opts.body||undefined});
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
