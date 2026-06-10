// perms.js — controle de permissões por perfil (cache 5 min no localStorage)
(function(){
  const SUPA_URL='https://trczpnjidqfippbfxtpe.supabase.co';
  const SUPA_KEY='sb_publishable_GJqQ_qWVg5Y8GWaKy1qe7w_VvZiIQ3i';
  const TENANT_ID=localStorage.getItem('sb_tenant_id')||'00000000-0000-0000-0000-000000000001';
  const CACHE_KEY='aiko_perms_v1';
  const TTL=300000;

  async function _fetch(perfil){
    const res=await fetch(
      `${SUPA_URL}/rest/v1/permissoes?tenant_id=eq.${TENANT_ID}&perfil=eq.${encodeURIComponent(perfil)}`,
      {headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+(localStorage.getItem('sb_token')||SUPA_KEY)}}
    );
    if(!res.ok) return null;
    const t=await res.text();
    return t?JSON.parse(t):[];
  }

  window.Perms={
    _data:null,
    _perfil:null,

    async load(){
      const u=JSON.parse(localStorage.getItem('sb_user')||'{}');
      this._perfil=((u.role||u.perfil||'operador')+'').toLowerCase();
      if(this._perfil==='administrador'){this._data=null;return;}
      try{
        const cached=localStorage.getItem(CACHE_KEY);
        if(cached){
          const{ts,perfil,data}=JSON.parse(cached);
          if(Date.now()-ts<TTL&&perfil===this._perfil){this._data=data;return;}
        }
        const data=await _fetch(this._perfil);
        if(data){
          this._data=data;
          localStorage.setItem(CACHE_KEY,JSON.stringify({ts:Date.now(),perfil:this._perfil,data}));
        }
      }catch{}
    },

    // Verifica se o perfil atual pode executar a ação no módulo
    can(modulo,acao='visualizar'){
      if(!this._data||this._data.length===0) return true; // sem dados = acesso total (fail open)
      const p=this._data.find(x=>x.modulo===modulo);
      if(!p) return false;
      return p[acao]===true;
    },

    // Lê do cache sem async (usado pelo sidebar)
    canSync(modulo,acao='visualizar'){
      try{
        const cached=localStorage.getItem(CACHE_KEY);
        if(!cached) return true;
        const{perfil,data}=JSON.parse(cached);
        const u=JSON.parse(localStorage.getItem('sb_user')||'{}');
        const role=((u.role||u.perfil||'operador')+'').toLowerCase();
        if(role==='administrador') return true;
        if(perfil!==role) return true; // cache desatualizado, liberar por segurança
        const p=data.find(x=>x.modulo===modulo);
        if(!p) return false;
        return p[acao]===true;
      }catch{return true;}
    },

    invalidate(){
      this._data=null;
      localStorage.removeItem(CACHE_KEY);
    }
  };
})();
