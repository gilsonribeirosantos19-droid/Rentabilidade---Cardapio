// sidebar.js — menu lateral hierárquico compartilhado
(function () {
  const page = (location.pathname.split('/').pop() || 'dashboard.html').split('?')[0].split('#')[0];

  // Não sobrescreve páginas com sidebar próprio
  if (page === 'loja.html' || page === 'login.html') return;

  // Ícones SVG inline para os grupos (sem depender do Lucide)
  const GROUP_ICONS = {
    operacao: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>`,
    cadastros: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
    compras:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`,
    analises:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  };

  const GROUPS = [
    {
      id: 'operacao', label: 'Operação',
      items: [
        { href: 'estoque.html',  icon: 'archive',            label: 'Estoque' },
        { href: 'ajustes.html',  icon: 'sliders-horizontal', label: 'Ajustes' },
      ]
    },
    {
      id: 'producao', label: 'Produção / PCP',
      items: [
        { href: 'pcp.html', tab: 'producao-dia', icon: 'chef-hat',          label: 'Produção do Dia' },
        { href: 'pcp.html', tab: 'sugerida',     icon: 'lightbulb',         label: 'Prod. Sugerida' },
        { href: 'pcp.html', tab: 'sobras',       icon: 'activity',          label: 'Sobras e Perdas' },
        { href: 'pcp.html', tab: 'consumo',      icon: 'bar-chart-2',       label: 'Consumo Médio' },
        { href: 'pcp.html', tab: 'dashboard',    icon: 'layout-dashboard',  label: 'Dashboard PCP' },
      ]
    },
    {
      id: 'cadastros', label: 'Cadastros',
      items: [
        { href: 'insumos.html',         icon: 'package',        label: 'Insumos' },
        { href: 'fichas_tecnicas.html', icon: 'clipboard-list', label: 'Fichas técnicas' },
        { href: 'fornecedores.html',    icon: 'truck',          label: 'Fornecedores' },
      ]
    },
    {
      id: 'compras', label: 'Compras',
      items: [
        { href: 'compras.html', icon: 'shopping-cart', label: 'Pedidos de compra' },
      ]
    },
    {
      id: 'analises', label: 'Análises',
      items: [
        { href: 'relatorios.html', icon: 'file-bar-chart', label: 'Relatórios' },
        { href: 'cmv.html',        icon: 'bar-chart-2',    label: 'CMV teórico x real' },
        { href: 'rendimento.html', icon: 'trending-up',    label: 'Rendimento' },
        { href: 'pdv.html',        icon: 'receipt',        label: 'PDV / Vendas' },
      ]
    },
  ];

  function ico(name) {
    return `<i data-lucide="${name}" class="nav-icon"></i>`;
  }

  const _urlTab = new URLSearchParams(location.search).get('tab') || '';

  function navItem(item) {
    let active = false;
    if (item.tab) {
      active = item.href === page && item.tab === _urlTab;
    } else {
      active = item.href === page;
    }
    const href = item.tab ? `${item.href}?tab=${item.tab}` : item.href;
    return `<a class="nav-item${active ? ' active' : ''}" href="${href}">${ico(item.icon)}${item.label}</a>`;
  }

  function navGroup(g) {
    const hasActive = g.items.some(i => i.tab ? (i.href === page && i.tab === _urlTab) : i.href === page);
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
      <div class="nav-group-items">${g.items.map(navItem).join('')}</div>
    </div>`;
  }

  const isDash   = page === 'dashboard.html';
  const isConfig = page === 'configuracoes.html';

  const html = `
    <div class="logo">
      <div class="logo-mark">Aiko</div>
      <div class="logo-sub">sistema</div>
    </div>
    <div class="nav-group" style="border-bottom:1px solid #e2e8f0;padding-bottom:10px;margin-bottom:4px">
      <a class="nav-item${isDash ? ' active' : ''}" href="dashboard.html">${ico('layout-dashboard')}Dashboard</a>
    </div>
    ${GROUPS.map(navGroup).join('')}
    <div class="nav-group" style="border-top:1px solid #e2e8f0;padding-top:8px;margin-top:8px">
      <a class="nav-item${isConfig ? ' active' : ''}" href="configuracoes.html">${ico('settings')}Configurações</a>
    </div>
    <div style="flex:1"></div>
    <div class="nav-bottom">Precisa de ajuda?<br>
      <a href="https://wa.me/5592994948230?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20com%20o%20sistema%20Aiko" target="_blank" rel="noopener">Acesse o suporte</a>
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
