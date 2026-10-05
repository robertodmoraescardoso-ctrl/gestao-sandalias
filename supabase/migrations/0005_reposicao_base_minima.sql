-- ===========================================================================
-- 0005 — Sugestao de reposicao: base minima e item esgotado que nao some
--
-- Dois defeitos na fn_reposicao em producao (05/10/2026):
--
-- 1) BASE CURTA DEMAIS INFLA A SUGESTAO
--    Para tamanho esgotado, a media diaria era vendido / (ultima venda -
--    inicio da janela + 1). Quando o tamanho esgotava logo no inicio da
--    janela, a base virava 1 a 4 dias e pegava so o pico do lancamento.
--    Ex.: Wind Off White 43-44 vendeu 3 em 2 dias -> 1,5/dia -> pedir 45.
--    Total sugerido: 221 pares / R$ 4.887, mais que o dobro do que a loja
--    vendeu em seis semanas. Agora a base minima e de 14 dias.
--
-- 2) ITEM ESGOTADO SUMIA DA LISTA
--    A janela era sempre "os ultimos p_dias a partir de hoje". Quando a
--    ultima venda de um tamanho esgotado saia da janela, ele virava
--    vendido = 0, estoque = 0 -> SEM_GIRO, sugestao 0, e deixava de
--    aparecer. O campeao de vendas desaparecia do pedido justamente por
--    estar ha muito tempo em falta. Agora, para tamanho esgotado, a janela
--    sao os p_dias que TERMINAM na ultima venda (o periodo em que ele
--    existia), e ele segue CRITICO ate ser reposto ou inativado.
--
-- Mesma assinatura e mesmas colunas: o painel nao precisa mudar.
-- ===========================================================================

create or replace function public.fn_reposicao(p_dias integer default 30, p_cobertura integer default 45)
 returns table(produto_id bigint, cod text, produto text, tamanho text, vendido integer, estoque integer,
               dias_disponivel integer, media_dia numeric, cobertura_dias numeric, esgotou boolean,
               sugestao integer, custo_unit numeric, custo_sugestao numeric, prioridade text)
 language sql
 security definer
 set search_path to 'public'
as $function$
  with vendas_itens as (
    select (i->>'cod') as cod,
           (i->>'tamanho') as tam,
           (i->>'qtd')::int as qtd,
           pd.criado_em::date as dia
      from pedidos pd, jsonb_array_elements(pd.itens) i
     where pd.status in ('pago_declarado','confirmado','enviado','entregue')
  ),
  -- primeira venda do produto: antes disso ele nao estava na loja
  primeira as (
    select cod, min(dia) as dia from vendas_itens group by cod
  ),
  ultima as (
    select cod, tam, max(dia) as dia from vendas_itens group by cod, tam
  ),
  grades as (
    select p.id, p.cod, p.nome, p.custo_produto,
           t.tam,
           coalesce((p.estoque ->> t.tam)::int, 0) as est
      from produtos p
      cross join lateral (
        select jsonb_array_elements_text(p.tamanhos) as tam
        union
        select k from jsonb_each_text(p.estoque) e(k, v)
      ) t
     where p.ativo
  ),
  -- esgotado: a janela termina na ultima venda; com estoque: termina hoje
  janela as (
    select g.*,
           (g.est = 0 and u.dia is not null) as esgotou,
           case when g.est = 0 and u.dia is not null then u.dia else current_date end as fim,
           pr.dia as primeira
      from grades g
      left join ultima u   on u.cod = g.cod and u.tam = g.tam
      left join primeira pr on pr.cod = g.cod
  ),
  janela2 as (
    select j.*, greatest(j.fim - p_dias, coalesce(j.primeira, j.fim)) as ini
      from janela j
  ),
  base as (
    select j.*,
           coalesce((select sum(v.qtd) from vendas_itens v
                      where v.cod = j.cod and v.tam = j.tam
                        and v.dia between j.ini and j.fim), 0)::int as vend,
           -- 14 dias de base minima: menos que isso mede pico, nao ritmo
           greatest(j.fim - j.ini + 1, 14) as dias_disp
      from janela2 j
  ),
  calc as (
    select b.*, round(b.vend::numeric / b.dias_disp, 3) as md from base b
  )
  select
    c.id,
    c.cod,
    c.nome,
    c.tam,
    c.vend,
    c.est,
    c.dias_disp,
    c.md,
    case when c.md > 0 then round(c.est / c.md, 1) else null end,
    c.esgotou,
    greatest(ceil(c.md * p_cobertura) - c.est, 0)::int,
    coalesce(c.custo_produto, 0),
    round(greatest(ceil(c.md * p_cobertura) - c.est, 0) * coalesce(c.custo_produto, 0), 2),
    case
      when c.esgotou then 'CRITICO'
      when c.md > 0 and c.est / c.md < 15 then 'URGENTE'
      when c.md > 0 and c.est / c.md < 30 then 'ATENCAO'
      when c.vend = 0 and c.est = 0 then 'SEM_GIRO'
      else 'OK'
    end
  from calc c
  order by
    case
      when c.esgotou then 1
      when c.md > 0 and c.est / c.md < 15 then 2
      when c.md > 0 and c.est / c.md < 30 then 3
      else 5
    end,
    c.md desc;
$function$;

-- Funcao de relatorio: so quem entrou com senha (ver nota da 0004).
revoke execute on function public.fn_reposicao(integer, integer) from public;
revoke execute on function public.fn_reposicao(integer, integer) from anon;
grant  execute on function public.fn_reposicao(integer, integer) to authenticated;
