-- ============================================================
-- Fechamento de Custo Mensal — tabela que guarda o fechamento
-- (valores congelados por loja + competência quando "Fechado")
-- Rode UMA vez no Supabase (SQL Editor).
-- ============================================================

create table if not exists public.fechamento_custo (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null,
  loja_id                 uuid not null,
  competencia             text not null,                 -- 'YYYY-MM'
  situacao                text not null default 'fechado',
  estoque_inicial         numeric default 0,
  compras                 numeric default 0,
  entradas_transferencia  numeric default 0,
  saidas_transferencia    numeric default 0,
  consumo                 numeric default 0,
  perdas                  numeric default 0,
  estoque_final           numeric default 0,
  cmv                     numeric default 0,
  faturamento             numeric default 0,
  fechado_por             text,
  fechado_em              timestamptz default now(),
  criado_em               timestamptz default now(),
  unique (tenant_id, loja_id, competencia)
);

create index if not exists ix_fechamento_custo_tenant
  on public.fechamento_custo (tenant_id, competencia);

-- Liga o RLS (isolamento por tenant, igual às demais tabelas)
alter table public.fechamento_custo enable row level security;

-- Copia AUTOMATICAMENTE a(s) mesma(s) política(s) de RLS da tabela entradas_estoque
-- (assim a nova tabela usa exatamente a mesma regra de tenant que o resto do sistema).
do $$
declare p record; v_using text; v_check text;
begin
  for p in
    select policyname, cmd, permissive, roles, qual, with_check
    from pg_policies
    where schemaname = 'public' and tablename = 'entradas_estoque'
  loop
    -- evita erro se rodar 2x
    execute format('drop policy if exists %I on public.fechamento_custo', p.policyname);
    v_using := case when p.cmd in ('ALL','SELECT','UPDATE','DELETE') and p.qual is not null
                    then ' using ('||p.qual||')' else '' end;
    v_check := case when p.cmd in ('ALL','INSERT','UPDATE') and p.with_check is not null
                    then ' with check ('||p.with_check||')' else '' end;
    execute format(
      'create policy %I on public.fechamento_custo as %s for %s to %s%s%s',
      p.policyname, lower(p.permissive), p.cmd, array_to_string(p.roles, ','), v_using, v_check
    );
  end loop;
end $$;

-- Conferência: deve listar a(s) política(s) criada(s)
select policyname, cmd from pg_policies
where schemaname='public' and tablename='fechamento_custo';
