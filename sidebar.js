// sidebar.js — menu lateral hierárquico compartilhado
(function () {
  const page = (location.pathname.split('/').pop() || 'dashboard.html').split('?')[0].split('#')[0];

  if (page === 'loja.html' || page === 'login.html') return;

  const GROUP_ICONS = {
    operacao:       `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>`,
    cadastros:      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
    compras:        `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`,
    analises:       `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    pcp:            `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
    configuracoes:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  };

  const GROUPS = [
    {
      id: 'operacao', label: 'Operação',
      items: [
        { href: 'estoque.html', label: 'Estoque' },
        { href: 'ajustes.html', label: 'Ajustes' },
      ]
    },
    {
      id: 'cadastros', label: 'Cadastros',
      items: [
        { href: 'insumos.html',         label: 'Insumos' },
        { href: 'fichas_tecnicas.html', label: 'Fichas Técnicas' },
        { href: 'fornecedores.html',    label: 'Fornecedores' },
      ]
    },
    {
      id: 'compras', label: 'Compras',
      items: [
        { href: 'compras.html', label: 'Pedidos de Compra' },
      ]
    },
    {
      id: 'analises', label: 'Análises',
      items: [
        { href: 'relatorios.html', label: 'Relatórios' },
        { href: 'cmv.html',        label: 'CMV Teórico x Real' },
        { href: 'rendimento.html', label: 'Rendimentos' },
        { href: 'pdv.html',        label: 'PDV / Vendas' },
      ]
    },
    {
      id: 'pcp', label: 'PCP',
      items: [
        { href: 'pcp.html', tab: 'producao-dia', label: 'Produção do Dia' },
        { href: 'porcionamento.html',             label: 'Porcionamento' },
        { href: 'pcp.html', tab: 'sugerida',     label: 'Produção Sugerida' },
        { href: 'pcp.html', tab: 'sobras',        label: 'Sobras e Perdas' },
        { href: 'pcp.html', tab: 'consumo',       label: 'Consumo Médio' },
      ]
    },
    {
      id: 'configuracoes', label: 'Configurações',
      items: [
        { href: 'configuracoes.html', tab: 'geral',        label: 'Geral' },
        { href: 'configuracoes.html', tab: 'usuarios',     label: 'Usuários' },
        { href: 'configuracoes.html', tab: 'permissoes',   label: 'Permissões' },
        { href: 'configuracoes.html', tab: 'parametros',   label: 'Parâmetros' },
      ]
    },
  ];

  const _urlTab = new URLSearchParams(location.search).get('tab') || '';

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
    const dot = `<span style="width:15px;height:15px;flex-shrink:0;display:flex;align-items:center;justify-content:center"><span style="width:4px;height:4px;border-radius:50%;background:currentColor;opacity:.5;display:inline-block"></span></span>`;
    return `<a class="nav-item${active ? ' active' : ''}" href="${href}">${dot}${item.label}</a>`;
  }

  function navGroup(g) {
    const visibleItems = g.items.filter(i => _canView(i.href));
    if (!visibleItems.length) return '';
    const hasActive = visibleItems.some(i => {
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
      <div class="nav-group-items">${visibleItems.map(navItem).join('')}</div>
    </div>`;
  }

  const isDash = page === 'dashboard.html';

  // Usuário do localStorage
  let userNome = '—', userRole = '';
  try {
    const u = JSON.parse(localStorage.getItem('sb_user') || '{}');
    userNome = u.nome || u.email || '—';
    userRole = u.role || 'Operador';
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
    <div class="nav-group" style="border-bottom:1px solid #e2e8f0;padding-bottom:10px;margin-bottom:4px">
      <a class="nav-item${isDash ? ' active' : ''}" href="dashboard.html">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        Dashboard
      </a>
      ${_canView('portal_gerente.html') ? `<a class="nav-item${page === 'portal_gerente.html' ? ' active' : ''}" href="portal_gerente.html" style="color:#f97316;font-weight:600">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        Portal do Gerente
      </a>` : ''}
    </div>
    ${GROUPS.map(navGroup).join('')}
    <div style="flex:1"></div>
    <div class="nav-bottom">
      Precisa de ajuda?<br>
      <a href="https://wa.me/5592994948230?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20com%20o%20sistema%20Aiko" target="_blank" rel="noopener">Acesse o suporte</a>
    </div>
    <div style="padding:10px 14px;border-top:1px solid #e2e8f0;display:flex;align-items:center;gap:8px">
      <div style="width:30px;height:30px;background:#0f2d5c;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;font-weight:700;color:#fff">${(userNome[0]||'U').toUpperCase()}</div>
      <div style="min-width:0">
        <div style="font-size:12px;font-weight:600;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${userNome}</div>
        <div style="font-size:10px;color:#94a3b8">${userRole}</div>
      </div>
    </div>`;

  const nav = document.querySelector('nav.sidebar');
  if (nav) {
    nav.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  }

  window.toggleNavGroup = function (id) {
    const g = document.getElementById(id);
    if (!g) return;
    g.classList.toggle('collapsed');
    localStorage.setItem(id, g.classList.contains('collapsed') ? '1' : '0');
  };
})();
