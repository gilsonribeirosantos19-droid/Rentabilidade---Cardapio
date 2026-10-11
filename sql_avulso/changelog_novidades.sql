-- ============================================================================
-- NOVIDADES / CHANGELOG do produto (sininho no topo)
-- Tabela GLOBAL (igual pra todos os clientes). Leitura liberada a todos os
-- usuários logados; escrita só pelo SQL Editor / admin (sem policy de insert).
-- Idempotente.
-- ============================================================================
create table if not exists public.changelog (
  id          uuid primary key default gen_random_uuid(),
  data        date not null default current_date,   -- data da novidade (exibida)
  titulo      text not null,
  descricao   text,
  tipo        text default 'melhoria',              -- novo | melhoria | correcao
  modulo      text,                                 -- ex.: DRE, Estoque, Fiscal
  destaque    boolean default false,                -- fundo diferenciado no painel
  created_at  timestamptz not null default now()
);

alter table public.changelog enable row level security;
drop policy if exists changelog_read on public.changelog;
create policy changelog_read on public.changelog for select using (true);  -- todos logados leem
grant select on public.changelog to anon, authenticated;

create index if not exists ix_changelog_data on public.changelog (data desc, created_at desc);

-- ------- novidades iniciais (pode editar/incluir à vontade) -------
insert into public.changelog (data, tipo, modulo, titulo, descricao, destaque) values
  ('2026-10-11', 'novo',     'DRE',     'Apropriação na nota fiscal',
   'No Monitor de NF-e, agora cada item já vem classificado na conta do DRE pelo cadastro do insumo. Dá pra trocar a conta só numa nota (exceção) ou tornar padrão do insumo.', true),
  ('2026-10-11', 'melhoria', 'DRE',     'Orçamento consolidado por loja',
   'Escolhendo "Todas as lojas", o teto agora soma o orçamento de todas as unidades. E cada grupo (ex.: Custos/CMV) mostra o subtotal na própria linha.', false),
  ('2026-10-10', 'novo',     'DRE',     'Novo módulo: DRE de Compras',
   'Controladoria de compras com Demonstrativo mês a mês, Orçamento (teto x realizado por ritmo), Plano de contas e Lançamentos manuais.', false),
  ('2026-10-10', 'melhoria', 'Sistema', 'Monitor de erros',
   'O sistema passou a avisar a equipe Aiko automaticamente quando algo falha, pra corrigir mais rápido.', false),
  ('2026-10-09', 'novo',     'Acesso',  'Permissões por grupo',
   'Agora dá pra controlar o que cada perfil vê e edita no sistema, por grupo de acesso.', false),
  ('2026-10-01', 'melhoria', 'Vendas',  'Vendas por canal e turno',
   'As vendas passaram a vir separadas por canal (salão, delivery) e turno exatamente como no caixa.', false);
