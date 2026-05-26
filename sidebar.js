// sidebar.js — menu lateral hierárquico compartilhado
(function () {
  const page = (location.pathname.split('/').pop() || 'dashboard.html').split('?')[0].split('#')[0];

  // Não sobrescreve páginas com sidebar próprio
  if (page === 'loja.html' || page === 'login.html') return;

  const GROUPS = [
    {
      id: 'operacao', label: 'Operação',
      items: [
        { href: 'estoque.html',  icon: 'archive',            label: 'Estoque' },
        { href: 'producao.html', icon: 'chef-hat',           label: 'Produção' },
        { href: 'ajustes.html',  icon: 'sliders-horizontal', label: 'Ajustes' },
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

  function navItem(item) {
    const active = item.href === page ? ' active' : '';
    return `<a class="nav-item${active}" href="${item.href}">${ico(item.icon)}${item.label}</a>`;
  }

  function navGroup(g) {
    const hasActive = g.items.some(i => i.href === page);
    const key = 'nav-grp-' + g.id;
    const saved = localStorage.getItem(key);
    const collapsed = saved === '1' ? true : saved === '0' ? false : !hasActive;
    return `<div class="nav-group${collapsed ? ' collapsed' : ''}" id="${key}">
      <div class="nav-group-header" onclick="toggleNavGroup('${key}')">
        <span class="nav-label">${g.label}</span>
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
    <div style="flex:1"></div>
    <div class="nav-group" style="border-top:1px solid #e2e8f0;padding-top:8px">
      <a class="nav-item${isConfig ? ' active' : ''}" href="configuracoes.html">${ico('settings')}Configurações</a>
    </div>
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
