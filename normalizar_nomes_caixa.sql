-- =====================================================================
--  NORMALIZAR NOMES PARA CAIXA NORMAL (Title Case PT-BR)
--  Converte nomes 100% MAIÚSCULOS -> "Caixa Normal"
--    SALMÃO            -> Salmão
--    CAMARÃO FRESCO    -> Camarão Fresco
--    FILÉ DE SALMÃO    -> Filé de Salmão   (conectores minúsculos)
--
--  Escopo: INSUMOS + PRODUTOS, em TODOS os tenants.
--  Fornecedores: NÃO mexe (mantém razão social oficial da NF-e).
--  Seguro: só altera nomes que estão 100% em maiúscula (não toca nos já normais).
--  Reversível: guarda o nome original em tabelas _bkp_* antes de trocar.
--
--  COMO USAR: cole no Supabase > SQL Editor e clique em RUN (uma vez).
-- =====================================================================

-- 1) BACKUP (para poder desfazer) ------------------------------------
create table if not exists _bkp_nome_insumos as select id, nome from insumos;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='produtos' and column_name='nome') then
    execute 'create table if not exists _bkp_nome_produtos as select id, nome from produtos';
  end if;
end $$;

-- 2) FUNÇÃO de Title Case com regras do português --------------------
create or replace function pt_title_case(p text)
returns text language sql immutable as $func$
  select case
    when p is null or btrim(p) = '' then p
    else (
      select string_agg(
        case
          -- conectores ficam minúsculos quando NÃO são a 1ª palavra
          when ord > 1 and w = any(array[
            'de','da','do','das','dos','e','com','sem','para','por',
            'a','o','as','os','à','às','ao','aos','em','no','na','nos','nas'
          ])
            then w
          else initcap(w)
        end, ' ' order by ord)
      from unnest(regexp_split_to_array(lower(btrim(p)), '\s+')) with ordinality as t(w, ord)
    )
  end
$func$;

-- 3) NORMALIZAR INSUMOS (todos os tenants; só nomes 100% maiúsculos) -
update insumos
set    nome = pt_title_case(nome)
where  nome ~ '[A-ZÀ-Ý]'        -- tem ao menos uma letra maiúscula
  and  nome = upper(nome);      -- e não tem nenhuma minúscula (= está todo em CAPS)

-- 4) NORMALIZAR PRODUTOS (se a tabela/coluna existir) ----------------
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='produtos' and column_name='nome') then
    execute $q$
      update produtos
      set    nome = pt_title_case(nome)
      where  nome ~ '[A-ZÀ-Ý]' and nome = upper(nome)
    $q$;
  end if;
end $$;

-- 5) CONFERÊNCIA (opcional) — veja como ficou:
-- select nome from insumos order by nome limit 50;


-- =====================================================================
--  >>> SE PRECISAR DESFAZER (reverter tudo ao original) <<<
--  Rode SÓ este bloco:
--
--  update insumos i set nome = b.nome from _bkp_nome_insumos b where b.id = i.id;
--  update produtos p set nome = b.nome from _bkp_nome_produtos b where b.id = p.id;
--
--  >>> LIMPEZA (depois de validar que ficou bom, pode apagar os backups): <<<
--  drop table if exists _bkp_nome_insumos;
--  drop table if exists _bkp_nome_produtos;
--  drop function if exists pt_title_case(text);
-- =====================================================================
