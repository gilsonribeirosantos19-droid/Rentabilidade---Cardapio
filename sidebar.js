// sidebar.js — navegação 2 níveis (módulos → seções), estilo Conta Azul
// Largura total = 220px nos dois estados (não quebra layout das páginas).
(function () {
  const page = (location.pathname.split('/').pop() || 'dashboard.html').split('?')[0].split('#')[0];
  if (page === 'loja.html' || page === 'login.html') return;

  const _params = new URLSearchParams(location.search);
  let _urlTab  = _params.get('tab')  || '';
  let _urlNome = _params.get('nome') || '';

  // ── Ícones ──
  const I = {
    home:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`,
    box:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.3 7 12 12 20.7 7"/></svg>`,
    cart:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`,
    nfe:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    db:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
    chart:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    chef:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
    gear:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    truck:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
  };
  const CHEV = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`;

  // ── Estrutura de módulos → seções → telas reais ──
  // href bare = filename usado p/ permissão (_MODULO_MAP)
  const MODULES = [
    { id:'inicio', label:'Início', icon:I.home, home:true, href:'dashboard.html' },
    { id:'estoque', label:'Estoque', icon:I.box, sections:[
      { label:'Visão Geral', href:'estoque.html' },
      { group:'Lançamentos', items:[
        { label:'Entradas',   href:'estoque.html?tab=entradas' },
        { label:'Saídas',     href:'estoque.html?tab=saidas' },
        { label:'Inventário', href:'estoque.html?tab=inventario' },
      ]},
      { group:'Consultas', items:[
        { label:'Saldo de Estoque', href:'estoque.html?tab=saldo-est' },
        { label:'Movimentação',     href:'estoque.html?tab=movimentacao' },
        { label:'Kardex',           href:'estoque.html?tab=kardex' },
      ]},
      { group:'Relatórios', items:[
        { label:'Histórico de Entradas', href:'relatorios.html?nome=entradas' },
        { label:'Consumo de Insumos',    href:'relatorios.html?nome=evolucao' },
        { label:'Histórico de Custos',   href:'relatorios.html?nome=historico-custo' },
      ]},
      { group:'Análises', items:[
        { label:'Curva ABC', href:'relatorios.html?nome=abc' },
        { label:'Inflação',  href:'relatorios.html?nome=inflacao' },
        { label:'Resumo',    href:'relatorios.html?nome=resumo' },
      ]},
      { label:'Ajustes',    href:'ajustes.html' },
    ]},
    { id:'compras', label:'Compras', icon:I.cart, sections:[
      { label:'Sugestão de Compras', href:'estoque.html?tab=compras' },
      { label:'Pedidos de Compra',   href:'compras.html' },
    ]},
    { id:'fiscal', label:'Fiscal', icon:I.nfe, sections:[
      { label:'Monitor NF-e',          href:'fiscal.html' },
      { label:'Entradas Processadas',  href:'entradas_processadas.html' },
      { label:'Auditoria de Conversão',href:'relatorios.html?nome=auditoria' },
    ]},
    { id:'cadastros', label:'Cadastros', icon:I.db, sections:[
      { label:'Insumos',         href:'insumos.html' },
      { label:'Produtos',        href:'produtos.html' },
      { label:'Fichas Técnicas', href:'fichas_tecnicas.html' },
      { label:'Fornecedores',    href:'fornecedores.html' },
    ]},
    { id:'gestao', label:'Gestão', icon:I.chart, sections:[
      { label:'CMV Teórico × Real', href:'cmv.html' },
      { label:'Rendimentos',        href:'rendimento.html' },
      { label:'Divergências',       href:'divergencias.html' },
      { label:'Fechamento de Custo',href:'fechamento_custo.html' },
    ]},
    { id:'pdv', label:'PDV', icon:I.cart, sections:[
      { label:'Dashboard',     href:'pdv.html?tab=dash' },
      { label:'Relatórios',    href:'pdv.html?tab=rel' },
      { label:'Importar / API',href:'pdv.html?tab=importar' },
    ]},
    { id:'producao', label:'Produção', icon:I.chef, sections:[
      { label:'Produção',      href:'pcp.html' },
      { label:'Porcionamento', href:'porcionamento.html' },
    ]},
    { id:'config', label:'Config', icon:I.gear, sections:[
      { label:'Geral',      href:'configuracoes.html?tab=geral' },
      { label:'Usuários',   href:'configuracoes.html?tab=usuarios' },
      { label:'Permissões', href:'configuracoes.html?tab=permissoes' },
      { label:'Parâmetros', href:'configuracoes.html?tab=parametros' },
    ]},
  ];

  // ── Permissões (mantido do modelo antigo) ──
  const _MODULO_MAP = {
    'dashboard.html':'dashboard', 'estoque.html':'estoque', 'ajustes.html':'ajustes',
    'insumos.html':'insumos', 'produtos.html':'produtos', 'fichas_tecnicas.html':'fichas_tecnicas',
    'fornecedores.html':'fornecedores', 'compras.html':'compras',
    'fiscal.html':'fiscal', 'entradas_processadas.html':'fiscal', 'relatorios.html':'relatorios',
    'cmv.html':'cmv', 'fechamento_custo.html':'fechamento_custo', 'rendimento.html':'rendimento',
    'divergencias.html':'divergencias', 'pdv.html':'pdv', 'pcp.html':'pcp',
    'porcionamento.html':'porcionamento', 'configuracoes.html':'configuracoes',
  };
  function pageOf(href){ return (href || '').split('?')[0]; }
  function canView(href) {
    try {
      const cached = localStorage.getItem('aiko_perms_v1');
      if (!cached) return true;
      const { perfil, data } = JSON.parse(cached);
      const u = JSON.parse(localStorage.getItem('sb_user') || '{}');
      const role = ((u.role || u.perfil || 'operador') + '').toLowerCase();
      if (role === 'administrador') return true;
      if (perfil !== role) return true;
      const modulo = _MODULO_MAP[pageOf(href)];
      if (!modulo) return true;
      const p = data.find(x => x.modulo === modulo);
      return p ? p.visualizar === true : true;
    } catch { return true; }
  }

  // ── Casamento da tela atual com um item do menu ──
  function hrefMatches(href) {
    const [hp, hq] = href.split('?');
    if (hp !== page) return false;
    const p = new URLSearchParams(hq || '');
    const ht = p.get('tab'), hn = p.get('nome');
    if (ht !== null) return ht === _urlTab;
    if (hn !== null) return hn === _urlNome;
    return !_urlTab && !_urlNome;   // item sem parâmetro (ex.: Visão Geral)
  }
  function moduleVisible(m) {
    if (m.home) return canView(m.href);
    return m.sections.some(s => (s.items || [s]).some(it => it.href && canView(it.href)));
  }

  // Descobre o módulo ativo pela URL (e já "mergulha" nele)
  let activeMod = null;
  outer:
  for (const m of MODULES) {
    if (!m.sections) continue;
    for (const s of m.sections) {
      for (const it of (s.items || [s])) {
        if (it.href && hrefMatches(it.href)) { activeMod = m.id; break outer; }
      }
    }
  }
  if (!activeMod && page !== 'dashboard.html') {       // fallback: arquivo bate com o módulo
    for (const m of MODULES) {
      if (!m.sections) continue;
      if (m.sections.some(s => (s.items || [s]).some(it => it.href && pageOf(it.href) === page))) { activeMod = m.id; break; }
    }
  }

  // ── Usuário (rodapé) ──
  const ROLE_LABELS = { admin:'Administrador', gerente:'Gerente', operador:'Operador', administrador:'Administrador' };
  let userNome = '—', userRole = '';
  try {
    const u = JSON.parse(localStorage.getItem('sb_user') || '{}');
    userNome = u.nome || u.email || '—';
    userRole = ROLE_LABELS[(u.role||'').toLowerCase()] || u.role || 'Usuário';
  } catch {}

  // ── Render ──
  const LOGO = `<div class="sb-logo">
    <div class="sb-mk"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,21 8,6 13,13 17,8 23,21"/><line x1="1" y1="21" x2="23" y2="21"/></svg></div>
    <div class="sb-brand"><div class="sb-brand-t">Aiko</div><div class="sb-brand-s">sistema</div></div>
  </div>`;

  function buildModbar() {
    let h = LOGO + '<div class="sb-mods">';
    MODULES.forEach(m => {
      if (!moduleVisible(m)) return;
      const on = (m.id === activeMod) || (m.home && page === 'dashboard.html');
      h += `<div class="sb-mod${on ? ' on' : ''}" data-mod="${m.id}" onclick="__aikoMod('${m.id}')">${m.icon}<span class="sb-l">${m.label}</span>${m.sections ? '<span class="sb-ch">›</span>' : ''}</div>`;
    });
    h += '</div><div class="sb-grow"></div>';
    h += `<div class="sb-help">Precisa de ajuda?<br><a href="https://wa.me/5592994948230?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20com%20o%20sistema%20Aiko" target="_blank" rel="noopener">Acesse o suporte</a></div>`;
    h += `<div class="sb-user"><div class="sb-avatar">${(userNome[0]||'U').toUpperCase()}</div><div class="sb-uinfo"><div class="sb-uname">${userNome}</div><div class="sb-urole">${userRole}</div></div></div>`;
    return h;
  }

  function buildSecbar() {
    const m = MODULES.find(x => x.id === activeMod);
    if (!m || !m.sections) return '';
    let h = `<div class="sb-back" onclick="__aikoBack()"><span class="sb-bk">‹</span><b>${m.label}</b></div><div class="sb-secs">`;
    m.sections.forEach((s, i) => {
      if (s.group) {
        const items = s.items.filter(it => canView(it.href));
        if (!items.length) return;
        const open = items.some(it => hrefMatches(it.href));
        h += `<div class="sb-grp${open ? '' : ' col'}" id="sbg${i}"><div class="sb-grp-h" onclick="this.parentNode.classList.toggle('col')"><span>${s.group}</span>${CHEV}</div><div class="sb-grp-items">`
          + items.map(it => `<a class="sb-item${hrefMatches(it.href) ? ' on' : ''}" href="${it.href}"><span class="sb-dot"></span>${it.label}</a>`).join('')
          + `</div></div>`;
      } else {
        if (!canView(s.href)) return;
        h += `<a class="sb-item${hrefMatches(s.href) ? ' on' : ''}" href="${s.href}"><span class="sb-dot"></span>${s.label}</a>`;
      }
    });
    return h + '</div>';
  }

  let modbarEl, secbarEl;
  function renderAll() {
    if (modbarEl) modbarEl.innerHTML = buildModbar();
    if (secbarEl) secbarEl.innerHTML = activeMod ? buildSecbar() : '';
  }

  // ── Ações globais ──
  window.__aikoMod = function (id) {
    const m = MODULES.find(x => x.id === id);
    if (!m) return;
    if (m.home) { location.href = m.href; return; }
    activeMod = id;
    document.body.classList.add('aiko-dived');
    renderAll();
  };
  window.__aikoBack = function () {
    activeMod = null;
    document.body.classList.remove('aiko-dived');
    renderAll();
  };

  // ── Injeta a tela ──
  const nav = document.querySelector('nav.sidebar');
  if (!nav) return;

  if (!document.getElementById('_aiko-sb-css')) {
    const s = document.createElement('style');
    s.id = '_aiko-sb-css';
    s.textContent = `
      nav.sidebar, .sidebar { width:220px !important; background:transparent !important; border:none !important; padding:0 !important; display:flex !important; flex-direction:row !important; align-items:stretch !important; overflow:visible !important; }
      nav.sidebar a { text-decoration:none; }
      /* coluna de módulos */
      .sb-modbar { width:220px; background:#1e293b; display:flex; flex-direction:column; padding:14px 0; transition:width .2s ease; overflow:hidden; }
      body.aiko-dived .sb-modbar { width:52px; }
      .sb-mods { overflow-y:auto; }
      .sb-mods::-webkit-scrollbar{width:6px}.sb-mods::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:4px}
      .sb-logo { display:flex; align-items:center; gap:9px; padding:2px 16px 14px; border-bottom:1px solid rgba(255,255,255,.07); margin-bottom:8px; }
      body.aiko-dived .sb-logo { justify-content:center; padding:2px 0 14px; }
      .sb-mk { width:36px; height:36px; background:#f97316; border-radius:10px; display:flex; align-items:center; justify-content:center; flex:none; box-shadow:0 2px 8px rgba(249,115,22,.35); }
      body.aiko-dived .sb-mk { width:32px; height:32px; }
      .sb-brand-t { font-size:18px; color:#f1f5f9; font-weight:800; line-height:1; font-family:Inter,system-ui,sans-serif; }
      .sb-brand-s { font-size:11px; color:#f97316; font-weight:600; }
      body.aiko-dived .sb-brand { display:none; }
      .sb-mod { display:flex; align-items:center; gap:12px; padding:12px 16px; border-radius:9px; margin:4px 10px; cursor:pointer; color:rgba(255,255,255,.74); position:relative; }
      .sb-mod:hover { background:rgba(255,255,255,.07); color:#fff; }
      .sb-mod.on { background:rgba(249,115,22,.16); color:#f97316; }
      .sb-mod svg { width:19px; height:19px; stroke:currentColor; fill:none; flex:none; }
      .sb-l { font-size:13.5px; font-weight:500; white-space:nowrap; font-family:Inter,system-ui,sans-serif; }
      .sb-ch { margin-left:auto; font-size:13px; color:rgba(255,255,255,.4); font-weight:700; }
      body.aiko-dived .sb-mod { justify-content:center; padding:11px 0; margin:5px 6px; }
      body.aiko-dived .sb-mod svg { width:18px; height:18px; }
      body.aiko-dived .sb-l, body.aiko-dived .sb-ch { display:none; }
      .sb-grow { flex:1; }
      .sb-help { padding:10px 16px; color:rgba(255,255,255,.3); font-size:11px; border-top:1px solid rgba(255,255,255,.07); }
      .sb-help a { color:#f97316 !important; }
      body.aiko-dived .sb-help { display:none; }
      .sb-user { padding:10px 14px; border-top:1px solid rgba(255,255,255,.07); display:flex; align-items:center; gap:8px; }
      .sb-avatar { width:30px; height:30px; background:#f97316; border-radius:50%; display:flex; align-items:center; justify-content:center; flex:none; font-size:12px; font-weight:700; color:#fff; font-family:Inter,system-ui,sans-serif; }
      .sb-uname { font-size:12px; font-weight:600; color:#f1f5f9; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px; font-family:Inter,system-ui,sans-serif; }
      .sb-urole { font-size:10px; color:rgba(255,255,255,.4); }
      body.aiko-dived .sb-user { justify-content:center; padding:10px 0; }
      body.aiko-dived .sb-uinfo { display:none; }
      /* coluna de seções */
      .sb-secbar { width:168px; background:#0f1a2e; display:none; flex-direction:column; padding:14px 0; overflow-y:auto; border-right:1px solid rgba(0,0,0,.25); }
      body.aiko-dived .sb-secbar { display:flex; }
      .sb-secbar::-webkit-scrollbar{width:6px}.sb-secbar::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:4px}
      .sb-secs { display:flex; flex-direction:column; }
      .sb-back { display:flex; align-items:center; gap:9px; padding:4px 14px 13px; border-bottom:1px solid rgba(255,255,255,.08); margin-bottom:8px; cursor:pointer; color:#f1f5f9; }
      .sb-back:hover .sb-bk { background:#f97316; color:#fff; border-color:#f97316; }
      .sb-bk { width:24px; height:24px; border-radius:7px; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.14); display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:800; flex:none; color:#cbd5e1; }
      .sb-back b { font-size:16px; font-weight:800; font-family:Inter,system-ui,sans-serif; }
      .sb-item { display:flex; align-items:center; gap:10px; padding:11px 14px; border-radius:8px; margin:3px 9px; cursor:pointer; color:rgba(255,255,255,.72) !important; font-size:13px; font-weight:500; font-family:Inter,system-ui,sans-serif; }
      .sb-item:hover { background:rgba(255,255,255,.07); color:#fff !important; }
      .sb-item.on { background:rgba(249,115,22,.2); color:#fff !important; font-weight:600; }
      .sb-dot { width:5px; height:5px; border-radius:50%; background:currentColor; opacity:.5; flex:none; }
      .sb-grp { margin-top:6px; }
      .sb-grp-h { display:flex; align-items:center; justify-content:space-between; padding:11px 14px 8px; cursor:pointer; color:rgba(255,255,255,.6); font-size:12.5px; font-weight:600; font-family:Inter,system-ui,sans-serif; }
      .sb-grp-h:hover { color:#fff; }
      .sb-grp-h svg { width:12px; height:12px; stroke:currentColor; fill:none; transition:transform .15s; }
      .sb-grp.col .sb-grp-h svg { transform:rotate(-90deg); }
      .sb-grp.col .sb-grp-items { display:none; }
      .sb-grp-items { margin-left:12px; padding-left:11px; border-left:1px solid rgba(255,255,255,.1); }
    `;
    document.head.appendChild(s);
  }

  if (activeMod) document.body.classList.add('aiko-dived');
  nav.innerHTML = '<div class="sb-modbar" id="aiko-modbar"></div><div class="sb-secbar" id="aiko-secbar"></div>';
  modbarEl = nav.querySelector('#aiko-modbar');
  secbarEl = nav.querySelector('#aiko-secbar');
  renderAll();

  // ── Troca de aba SEM recarregar (mesmo arquivo) — reaproveita switchTab da tela ──
  nav.addEventListener('click', function (e) {
    const a = e.target.closest('a.sb-item');
    if (!a) return;
    let url; try { url = new URL(a.href, location.href); } catch { return; }
    const aPage = url.pathname.split('/').pop();
    const tab = url.searchParams.get('tab');
    if (aPage === page && tab && typeof window.switchTab === 'function') {
      e.preventDefault();
      window.switchTab(tab);
      try { history.replaceState({}, '', a.getAttribute('href')); } catch (_) {}
      _urlTab = tab; _urlNome = '';
      renderAll();
    }
    // demais casos: navegação normal (recarrega)
  });
})();
