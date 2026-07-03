-- ============================================================
-- Monitor de Vendas (PDV) — tabela de ARQUIVOS de importação
-- Rode no Supabase (SQL Editor). É estrutural: cria a tabela e a
-- isolação por tenant (RLS). Não mexe em nenhum dado existente.
-- ============================================================

create table if not exists pdv_importacoes (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  loja_id         uuid,
  pdv             text,                                  -- iComanda / Saipos / Aloha ...
  tipo            text not null default 'venda',         -- venda | financeiro | ...
  data_movimento  date not null,                         -- o DIA das vendas
  arquivo         text,                                  -- nome do arquivo .txt exportado
  situacao        text not null default 'nao_recebido',  -- nao_recebido|aguardando|em_processamento|processado|com_erros
  data_execucao   timestamptz,                           -- quando o sistema processou
  data_integracao timestamptz,                           -- quando integrou (gerou as vendas)
  conteudo        text,                                  -- conteúdo cru do arquivo (R01|R02|R03...)
  erros           jsonb not null default '[]'::jsonb,    -- [{ "erro": "...", "msg": "..." }]
  created_at      timestamptz not null default now()
);

-- 1 arquivo por (tenant, loja, dia, tipo) — evita duplicar o mesmo dia
create unique index if not exists uq_pdv_imp on pdv_importacoes (tenant_id, loja_id, data_movimento, tipo);
create index if not exists idx_pdv_imp_periodo on pdv_importacoes (tenant_id, data_movimento desc, loja_id);

-- RLS: isola por tenant — IDÊNTICA às demais tabelas (usa get_my_tenant_id())
alter table pdv_importacoes enable row level security;
drop policy if exists tenant_policy on pdv_importacoes;
create policy tenant_policy on pdv_importacoes
  for all
  using      (tenant_id = get_my_tenant_id())
  with check (tenant_id = get_my_tenant_id());

grant select, insert, update, delete on pdv_importacoes to anon, authenticated;
