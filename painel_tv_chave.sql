-- Chave por loja para o link do Painel de TV (acesso sem login, protegido pela chave).
-- Link fica: .../painel.html?loja=<id da loja>&chave=<painel_chave>
alter table public.lojas add column if not exists painel_chave text;

-- gera uma chave aleatória pra cada loja que ainda não tem
update public.lojas
   set painel_chave = substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 16)
 where painel_chave is null;

-- veja as chaves pra montar os links de cada TV:
-- select nome, id, painel_chave from public.lojas order by nome;
