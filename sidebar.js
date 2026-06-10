// sidebar.js — menu lateral hierárquico compartilhado
(function () {
  const page = (location.pathname.split('/').pop() || 'dashboard.html').split('?')[0].split('#')[0];

  if (page === 'loja.html' || page === 'login.html') return;

  const GROUP_ICONS = {
    operacao:       `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>`,
    cadastros:      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
    compras:        `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`,
    analises:       `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    pdv:            `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`,
    pcp:            `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
    fiscal:         `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    configuracoes:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  };

  const I = {
    box:       `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
    sliders:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`,
    package:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
    clipboard: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
    truck:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
    cart:      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`,
    chart:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    trending:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
    receipt:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    nfe:       `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    chef:      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
    scissors:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>`,
    gear:      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    users:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    shield:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    knobs:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M4.22 4.22l2.12 2.12m11.32 11.32 2.12 2.12M2 12h3m14 0h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>`,
  };

  const GROUPS = [
    {
      id: 'operacao', label: 'Operação',
      items: [
        { href: 'estoque.html', label: 'Estoque',  icon: I.box },
        { href: 'ajustes.html', label: 'Ajustes',  icon: I.sliders },
      ]
    },
    {
      id: 'cadastros', label: 'Cadastros',
      items: [
        { href: 'insumos.html',         label: 'Insumos',         icon: I.package },
        { href: 'produtos.html',        label: 'Produtos',        icon: I.box },
        { href: 'fichas_tecnicas.html', label: 'Fichas Técnicas', icon: I.clipboard },
        { href: 'fornecedores.html',    label: 'Fornecedores',    icon: I.truck },
      ]
    },
    {
      id: 'compras', label: 'Compras',
      items: [
        { href: 'compras.html', label: 'Pedidos de Compra', icon: I.cart },
      ]
    },
    {
      id: 'fiscal', label: 'Fiscal',
      items: [
        { href: 'fiscal.html',              label: 'Monitor NF-e',        icon: I.nfe },
        { href: 'entradas_processadas.html', label: 'Entradas Processadas', icon: I.clipboard },
      ]
    },
    {
      id: 'analises', label: 'Análises',
      items: [
        { href: 'relatorios.html', label: 'Relatórios',        icon: I.receipt },
        { href: 'cmv.html',        label: 'CMV Teórico x Real', icon: I.chart },
        { href: 'rendimento.html', label: 'Rendimentos',        icon: I.trending },
        { href: 'divergencias.html', label: 'Divergências',     icon: I.shield },
      ]
    },
    {
      id: 'pdv', label: 'PDV',
      items: [
        { href: 'pdv.html', tab: 'dash',     label: 'Dashboard',      icon: I.chart },
        { href: 'pdv.html', tab: 'rel',      label: 'Relatórios',     icon: I.trending },
        { href: 'pdv.html', tab: 'importar', label: 'Importar / API', icon: I.box },
      ]
    },
    {
      id: 'pcp', label: 'PCP',
      items: [
        { href: 'pcp.html',           label: 'Produção',      icon: I.chef },
        { href: 'porcionamento.html', label: 'Porcionamento', icon: I.scissors },
      ]
    },
    {
      id: 'configuracoes', label: 'Configurações',
      items: [
        { href: 'configuracoes.html', tab: 'geral',      label: 'Geral',       icon: I.gear },
        { href: 'configuracoes.html', tab: 'usuarios',   label: 'Usuários',    icon: I.users },
        { href: 'configuracoes.html', tab: 'permissoes', label: 'Permissões',  icon: I.shield },
        { href: 'configuracoes.html', tab: 'parametros', label: 'Parâmetros',  icon: I.knobs },
      ]
    },
  ];

  const _urlTab = new URLSearchParams(location.search).get('tab') || '';
  const _urlRel = new URLSearchParams(location.search).get('rel') || '';

  // Mapeamento href → módulo para filtragem por permissão
  const _MODULO_MAP = {
    'portal_gerente.html':  'portal_gerente',
    'dashboard.html':       'dashboard',
    'estoque.html':         'estoque',
    'ajustes.html':         'ajustes',
    'insumos.html':         'insumos',
    'fichas_tecnicas.html': 'fichas_tecnicas',
    'fornecedores.html':    'fornecedores',
    'compras.html':         'compras',
    'fiscal.html':               'fiscal',
    'entradas_processadas.html': 'fiscal',
    'relatorios.html':      'relatorios',
    'cmv.html':             'cmv',
    'rendimento.html':      'rendimento',
    'pdv.html':             'pdv',
    'pcp.html':             'pcp',
    'porcionamento.html':   'porcionamento',
    'configuracoes.html':   'configuracoes',
  };

  // Lê permissões em cache para filtragem síncrona
  function _canView(href) {
    try {
      const cached = localStorage.getItem('aiko_perms_v1');
      if (!cached) return true;
      const { perfil, data } = JSON.parse(cached);
      const u = JSON.parse(localStorage.getItem('sb_user') || '{}');
      const role = ((u.role || u.perfil || 'operador') + '').toLowerCase();
      if (role === 'administrador') return true;
      if (perfil !== role) return true;
      const modulo = _MODULO_MAP[href];
      if (!modulo) return true;
      const p = data.find(x => x.modulo === modulo);
      return p ? p.visualizar === true : true;
    } catch { return true; }
  }

  function navItem(item) {
    if (!_canView(item.href)) return '';
    let active = false;
    if (item.tab) {
      active = item.href === page && item.tab === _urlTab;
    } else {
      active = item.href === page;
    }
    // Se estiver em configuracoes.html sem tab, marca Geral como ativo
    if (item.href === 'configuracoes.html' && item.tab === 'geral' && page === 'configuracoes.html' && !_urlTab) {
      active = true;
    }
    const href = item.tab ? `${item.href}?tab=${item.tab}` : item.href;
    // Sub-itens: dot pequeno (sem ícone SVG grande)
    const dot = `<span style="width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.5;flex-shrink:0"></span>`;
    return `<a class="nav-item${active ? ' active' : ''}" href="${href}" style="display:flex;align-items:center;gap:9px">${dot}${item.label}</a>`;
  }

  // Submenu aninhado dentro de um grupo (ex.: PDV → Relatórios → Curva ABC / CMV / Engenharia)
  function navSubmenu(item) {
    const kids = item.children.filter(c => _canView(c.href));
    if (!kids.length) return '';
    const anyActive = kids.some(c => c.href === page && c.tab === _urlTab && (c.rel ? c.rel === _urlRel : true));
    const key = 'nav-sub-' + item.id;
    const saved = localStorage.getItem(key);
    const collapsed = saved === '1' ? true : saved === '0' ? false : !anyActive;
    const dot = `<span style="width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.5;flex-shrink:0"></span>`;
    const kidsHtml = kids.map(c => {
      const active = c.href === page && c.tab === _urlTab && (c.rel ? c.rel === _urlRel : true);
      const href = `${c.href}?tab=${c.tab}${c.rel ? '&rel=' + c.rel : ''}`;
      return `<a class="nav-item nav-subitem${active ? ' active' : ''}" href="${href}" style="display:flex;align-items:center;gap:9px">${dot}${c.label}</a>`;
    }).join('');
    return `<div class="nav-sub${collapsed ? ' collapsed' : ''}" id="${key}">
      <div class="nav-subhead" onclick="toggleNavGroup('${key}')">
        <span style="display:flex;align-items:center;gap:9px">${dot}${item.label}</span>
        <svg class="nav-sub-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="nav-sub-items">${kidsHtml}</div>
    </div>`;
  }

  function navGroup(g) {
    // Item único (sem submenu) — clica e vai direto (ex.: PCP abre o hub)
    if (g.single) {
      if (!_canView(g.href)) return '';
      const act = page === g.href;
      return `<div class="nav-group"><a class="nav-group-header" href="${g.href}" style="text-decoration:none;cursor:pointer">
        <span class="nav-label" style="display:flex;align-items:center;gap:6px;margin-bottom:0;${act ? 'color:#f97316 !important' : ''}">${GROUP_ICONS[g.id] || ''}${g.label}</span>
      </a></div>`;
    }
    const visibleItems = g.items.filter(i => i.children ? i.children.some(c => _canView(c.href)) : _canView(i.href));
    if (!visibleItems.length) return '';
    const hasActive = visibleItems.some(i => {
      if (i.children) return i.children.some(c => c.href === page && c.tab === _urlTab && (c.rel ? c.rel === _urlRel : true));
      if (i.tab) return i.href === page && i.tab === _urlTab;
      if (i.href === page) return true;
      // Expandir configuracoes quando estiver na página
      if (g.id === 'configuracoes' && page === 'configuracoes.html') return true;
      return false;
    });
    const key = 'nav-grp-' + g.id;
    const saved = localStorage.getItem(key);
    const collapsed = saved === '1' ? true : saved === '0' ? false : !hasActive;
    return `<div class="nav-group${collapsed ? ' collapsed' : ''}" id="${key}">
      <div class="nav-group-header" onclick="toggleNavGroup('${key}')">
        <span class="nav-label" style="display:flex;align-items:center;gap:6px">
          ${GROUP_ICONS[g.id] || ''}${g.label}
        </span>
        <svg class="nav-group-arrow" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="nav-group-items">${visibleItems.map(it => it.children ? navSubmenu(it) : navItem(it)).join('')}</div>
    </div>`;
  }

  const isDash = page === 'dashboard.html';

  // Usuário do localStorage
  const ROLE_LABELS = { admin: 'Administrador', gerente: 'Gerente', operador: 'Operador' };
  let userNome = '—', userRole = '';
  try {
    const u = JSON.parse(localStorage.getItem('sb_user') || '{}');
    userNome = u.nome || u.email || '—';
    userRole = ROLE_LABELS[(u.role||'').toLowerCase()] || u.role || 'Usuário';
  } catch {}

  const html = `
    <div class="logo">
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:36px;height:36px;background:#f97316;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 8px rgba(249,115,22,.35)">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.95)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1,21 8,6 13,13 17,8 23,21"/>
            <line x1="1" y1="21" x2="23" y2="21"/>
          </svg>
        </div>
        <div>
          <div class="logo-mark">Aiko</div>
          <div class="logo-sub">sistema</div>
        </div>
      </div>
    </div>
    <div class="nav-group" style="border-bottom:1px solid rgba(255,255,255,.06);padding-bottom:10px;margin-bottom:4px">
      <a class="nav-item nav-dash${isDash ? ' active' : ''}" href="dashboard.html">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        Dashboard
      </a>
    </div>
    ${GROUPS.map(navGroup).join('')}
    <div style="flex:1"></div>
    <div class="nav-bottom">
      Precisa de ajuda?<br>
      <a href="https://wa.me/5592994948230?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20com%20o%20sistema%20Aiko" target="_blank" rel="noopener">Acesse o suporte</a>
    </div>
    <div style="padding:10px 14px;border-top:1px solid rgba(255,255,255,.06);display:flex;align-items:center;gap:8px">
      <div style="width:30px;height:30px;background:#f97316;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;font-weight:700;color:#fff">${(userNome[0]||'U').toUpperCase()}</div>
      <div style="min-width:0">
        <div style="font-size:12px;font-weight:600;color:#f1f5f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${userNome}</div>
        <div style="font-size:10px;color:rgba(255,255,255,.4)">${userRole}</div>
      </div>
    </div>`;

  const nav = document.querySelector('nav.sidebar');
  if (nav) {
    // Injecta dark theme ANTES de popular o conteúdo
    if (!document.getElementById('_sidebar-dark-css')) {
      const s = document.createElement('style');
      s.id = '_sidebar-dark-css';
      s.textContent = `
        /* ── BASE ── */
        nav.sidebar, .sidebar {
          background: #0B4A8B !important;
          border-right: 1px solid rgba(255,255,255,.07) !important;
        }
        nav.sidebar .logo, .sidebar .logo {
          border-bottom: 1px solid rgba(255,255,255,.07) !important;
        }
        nav.sidebar .logo-mark, .sidebar .logo-mark { color: #f1f5f9 !important; }
        nav.sidebar .logo-sub,  .sidebar .logo-sub  { color: #f97316 !important; }

        /* ── GRUPO (menu principal) ── */
        nav.sidebar .nav-group-header, .sidebar .nav-group-header {
          padding: 10px 16px 5px !important;
          color: rgba(255,255,255,.95) !important;
          display: flex !important; align-items: center !important; justify-content: space-between !important; cursor: pointer !important;
        }
        nav.sidebar .nav-group-header:hover, .sidebar .nav-group-header:hover {
          background: transparent !important;
        }
        nav.sidebar .nav-label, .sidebar .nav-label {
          font-size: 14px !important;
          font-weight: 500 !important;
          color: rgba(255,255,255,.75) !important;
          font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
          text-transform: none !important;
          letter-spacing: 0 !important;
        }
        nav.sidebar .nav-group-arrow, .sidebar .nav-group-arrow {
          stroke: rgba(255,255,255,.35) !important;
          transition: transform .15s !important;
        }
        nav.sidebar .nav-group.collapsed .nav-group-items, .sidebar .nav-group.collapsed .nav-group-items { display: none !important; }
        nav.sidebar .nav-group.collapsed .nav-group-arrow, .sidebar .nav-group.collapsed .nav-group-arrow { transform: rotate(-90deg) !important; }

        /* ── SUBMENU (itens) — linha vertical + recuo ── */
        nav.sidebar .nav-group-items, .sidebar .nav-group-items {
          margin-left: 22px !important;
          padding-left: 12px !important;
          border-left: 1px solid rgba(255,255,255,.1) !important;
        }

        /* ── ITEM (sub-item) ── */
        nav.sidebar .nav-item, .sidebar .nav-item {
          color: rgba(148,163,184,.85) !important;
          text-decoration: none !important;
          font-size: 12.5px !important;
          font-weight: 400 !important;
          font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
          padding: 6px 10px !important;
          border-radius: 6px !important;
          margin: 1px 0 !important;
        }
        nav.sidebar .nav-item:hover, .sidebar .nav-item:hover {
          background: #1565C0 !important;
          color: #ffffff !important;
        }

        /* ── ITEM ATIVO ── */
        nav.sidebar .nav-item.active, .sidebar .nav-item.active {
          background: #F97316 !important;
          color: #ffffff !important;
          font-weight: 600 !important;
        }

        /* ── DASHBOARD: mesmo destaque dos títulos de grupo ── */
        nav.sidebar .nav-item.nav-dash, .sidebar .nav-item.nav-dash {
          font-size: 14px !important;
          font-weight: 500 !important;
        }
        nav.sidebar .nav-item.nav-dash:not(.active), .sidebar .nav-item.nav-dash:not(.active) {
          color: rgba(255,255,255,.75) !important;
        }

        /* ── SUBMENU ANINHADO (ex.: Relatórios) ── */
        nav.sidebar .nav-subhead, .sidebar .nav-subhead {
          display: flex !important; align-items: center !important; justify-content: space-between !important;
          color: rgba(148,163,184,.85) !important;
          font-size: 12.5px !important;
          font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
          padding: 6px 10px !important;
          border-radius: 6px !important;
          margin: 1px 0 !important;
          cursor: pointer !important;
        }
        nav.sidebar .nav-subhead:hover, .sidebar .nav-subhead:hover {
          background: rgba(255,255,255,.07) !important;
          color: rgba(255,255,255,.9) !important;
        }
        nav.sidebar .nav-sub-arrow, .sidebar .nav-sub-arrow { stroke: rgba(255,255,255,.35) !important; transition: transform .15s; }
        nav.sidebar .nav-sub.collapsed .nav-sub-items, .sidebar .nav-sub.collapsed .nav-sub-items { display: none !important; }
        nav.sidebar .nav-sub.collapsed .nav-sub-arrow, .sidebar .nav-sub.collapsed .nav-sub-arrow { transform: rotate(-90deg); }
        nav.sidebar .nav-sub-items, .sidebar .nav-sub-items {
          margin-left: 10px !important;
          padding-left: 10px !important;
          border-left: 1px solid rgba(255,255,255,.1) !important;
        }

        /* ── RODAPÉ ── */
        nav.sidebar .nav-bottom, .sidebar .nav-bottom {
          color: rgba(255,255,255,.3) !important;
          border-top: 1px solid rgba(255,255,255,.07) !important;
        }
        nav.sidebar .nav-bottom a, .sidebar .nav-bottom a { color: #f97316 !important; }
      `;
      document.head.appendChild(s);
    }

    // Tipografia global — títulos das páginas
    if (!document.getElementById('_aiko-typography')) {
      const t = document.createElement('style');
      t.id = '_aiko-typography';
      t.textContent = `
        /* Título principal da topbar */
        .topbar-title, [class*="topbar"] .title, #topbar-heading {
          font-size: 22px !important;
          font-weight: 800 !important;
          color: #0f172a !important;
          letter-spacing: -0.3px !important;
          line-height: 1.1 !important;
        }
        /* Subtítulo da topbar */
        .topbar-sub { font-size: 12px !important; color: #94a3b8 !important; margin-top: 2px !important; }
        /* Títulos de seção dentro das páginas */
        .sec-title { font-size: 11px !important; font-weight: 700 !important; letter-spacing: .08em !important; color: #64748b !important; }
        .rp-title  { font-size: 11px !important; font-weight: 700 !important; letter-spacing: .08em !important; color: #64748b !important; }
        /* Topbar altura e separação */
        .topbar { border-bottom: 1px solid #e2e8f0 !important; }
      `;
      document.head.appendChild(t);
    }

    nav.innerHTML = html;
    if (window.lucide) lucide.createIcons();

    // Multi-abas pelo menu: já estando no PDV, clicar num item abre a aba no MESMO workspace
    // (sem recarregar a página), acumulando as abas. Vindo de outra tela, navega normalmente.
    if (page === 'pdv.html') {
      nav.addEventListener('click', function (e) {
        const a = e.target.closest('a.nav-item');
        if (!a) return;
        let url; try { url = new URL(a.href, location.href); } catch { return; }
        if (url.pathname.split('/').pop() !== 'pdv.html') return;
        const t = url.searchParams.get('tab');
        if (!t || typeof window.switchTab !== 'function') return;
        e.preventDefault();
        window.switchTab(t);
        const r = url.searchParams.get('rel');
        if (r && typeof window.switchRelTab === 'function') window.switchRelTab(r);
        try { history.replaceState({}, '', a.getAttribute('href')); } catch (_) {}
        nav.querySelectorAll('a.nav-item.active').forEach(x => x.classList.remove('active'));
        a.classList.add('active');
      });
    }
  }

  window.toggleNavGroup = function (id) {
    const g = document.getElementById(id);
    if (!g) return;
    g.classList.toggle('collapsed');
    localStorage.setItem(id, g.classList.contains('collapsed') ? '1' : '0');
  };
})();
