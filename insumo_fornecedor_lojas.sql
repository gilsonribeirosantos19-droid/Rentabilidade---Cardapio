-- ============================================================
-- Regra de disponibilidade por loja para cada VÍNCULO insumo×fornecedor.
-- Cada linha = "este vínculo (insumo_fornecedores) vale nesta loja".
-- Sem linhas para um vínculo = vale para TODAS as lojas (compatível com o legado).
-- Rode UMA vez no Supabase (SQL Editor).
-- ============================================================

create table if not exists public.insumo_fornecedor_lojas (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  vinculacao_id  uuid not null references public.insumo_fornecedores(id) on delete cascade,
  loja_id        uuid not null,
  criado_em      timestamptz default now(),
  unique (vinculacao_id, loja_id)
);

create index if not exists ix_ifl_vinc   on public.insumo_fornecedor_lojas (vinculacao_id);
create index if not exists ix_ifl_tenant on public.insumo_fornecedor_lojas (tenant_id);

-- Liga o RLS (isolamento por tenant, igual às demais tabelas)
alter table public.insumo_fornecedor_lojas enable row level security;

-- Copia AUTOMATICAMENTE a(s) mesma(s) política(s) de RLS da tabela entradas_estoque
do $$
declare p record; v_using text; v_check text;
begin
  for p in
    select policyname, cmd, permissive, roles, qual, with_check
    from pg_policies
    where schemaname = 'public' and tablename = 'entradas_estoque'
  loop
    execute format('drop policy if exists %I on public.insumo_fornecedor_lojas', p.policyname);
    v_using := case when p.cmd in ('ALL','SELECT','UPDATE','DELETE') and p.qual is not null
                    then ' using ('||p.qual||')' else '' end;
    v_check := case when p.cmd in ('ALL','INSERT','UPDATE') and p.with_check is not null
                    then ' with check ('||p.with_check||')' else '' end;
    execute format(
      'create policy %I on public.insumo_fornecedor_lojas as %s for %s to %s%s%s',
      p.policyname, lower(p.permissive), p.cmd, array_to_string(p.roles, ','), v_using, v_check
    );
  end loop;
end $$;

select policyname, cmd from pg_policies
where schemaname='public' and tablename='insumo_fornecedor_lojas';
