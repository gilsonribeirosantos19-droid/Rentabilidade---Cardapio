// params.js — utilitário compartilhado de parâmetros do sistema
// Carrega do Supabase uma vez e mantém em cache por 5 minutos
(function () {
  const SUPA_URL  = 'https://trczpnjidqfippbfxtpe.supabase.co';
  const SUPA_KEY  = 'sb_publishable_GJqQ_qWVg5Y8GWaKy1qe7w_VvZiIQ3i';
  const TENANT_ID = localStorage.getItem('sb_tenant_id') || '00000000-0000-0000-0000-000000000001';
  const CACHE_KEY = 'aiko_params_v1';
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

  window.Params = {
    _data: null,

    // Carrega parâmetros do Supabase (ou do cache)
    async load() {
      if (this._data) return; // já carregado na sessão

      // Tentar cache do localStorage
      try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        if (cached && Date.now() - cached.ts < CACHE_TTL) {
          this._data = cached.data;
          return;
        }
      } catch {}

      // Buscar do Supabase
      try {
        const res = await fetch(
          `${SUPA_URL}/rest/v1/parametros?tenant_id=eq.${TENANT_ID}&select=modulo,chave,valor`,
          { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + (localStorage.getItem('sb_token') || SUPA_KEY) } }
        );
        if (res.ok) {
          const rows = await res.json();
          this._data = {};
          rows.forEach(r => {
            if (!this._data[r.modulo]) this._data[r.modulo] = {};
            this._data[r.modulo][r.chave] = r.valor;
          });
          localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: this._data }));
        } else {
          this._data = {};
        }
      } catch {
        this._data = {};
      }
    },

    // Invalida cache (chamar após salvar parâmetros em configuracoes.html)
    invalidate() {
      this._data = null;
      localStorage.removeItem(CACHE_KEY);
    },

    // Valor bruto
    get(modulo, chave, defaultVal = null) {
      return this._data?.[modulo]?.[chave] ?? defaultVal;
    },

    // Booleano: 'sim' → true, 'nao' → false
    bool(modulo, chave, defaultVal = false) {
      const v = this.get(modulo, chave);
      if (v === null || v === undefined) return defaultVal;
      return v === 'sim' || v === 'true' || v === '1';
    },

    // Numérico
    num(modulo, chave, defaultVal = 0) {
      const v = this.get(modulo, chave);
      if (v === null || v === undefined) return defaultVal;
      return parseFloat(v) || defaultVal;
    },

    // Texto
    str(modulo, chave, defaultVal = '') {
      return this.get(modulo, chave) ?? defaultVal;
    },
  };
})();
