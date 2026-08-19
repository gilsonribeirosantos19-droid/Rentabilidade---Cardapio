-- Bug: importar XML de NF-e trava com "duplicate key ... nfe_recebidas_chave_acesso_unique"
-- quando a MESMA chave já existe no banco — INCLUSIVE se a nota foi EXCLUÍDA (soft-delete).
-- A chave da SEFAZ é única no mundo, mas uma nota excluída não deveria "segurar" a chave pra sempre.
--
-- Correção: troca a unique GLOBAL cega por uma unique PARCIAL que só conta notas NÃO excluídas.
-- Efeito: continua impedindo DUAS notas ATIVAS com a mesma chave (uma nota, um lugar ativo), mas
-- permite REIMPORTAR depois de excluir (ex.: subiu no tenant errado, excluiu, sobe no certo).
--
-- Seguro: com a constraint global atual não existe nenhuma chave duplicada, então o índice parcial
-- novo não falha em dado existente.

-- a unique antiga pode ser CONSTRAINT ou ÍNDICE único — os 2 drops cobrem os dois casos
-- (cada um é no-op se não existir; se for constraint, o 1º já leva o índice junto).
alter table public.nfe_recebidas drop constraint if exists nfe_recebidas_chave_acesso_unique;
drop index if exists public.nfe_recebidas_chave_acesso_unique;

create unique index if not exists nfe_recebidas_chave_acesso_ativa_uidx
  on public.nfe_recebidas (chave_acesso)
  where (excluida_em is null and chave_acesso is not null);

-- ROLLBACK (se precisar voltar ao comportamento antigo):
-- drop index if exists public.nfe_recebidas_chave_acesso_ativa_uidx;
-- alter table public.nfe_recebidas add constraint nfe_recebidas_chave_acesso_unique unique (chave_acesso);
