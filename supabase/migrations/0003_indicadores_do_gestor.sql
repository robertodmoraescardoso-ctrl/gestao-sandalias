-- ===========================================================================
-- 0003 — Indicadores de gestao para varejo de calcados
--
-- Metricas de referencia do setor (sell-through, giro, GMROI, estoque parado,
-- recompra), para o painel dizer nao so QUANTO vendeu, mas se o negocio esta
-- saudavel.
--
-- Honestidade sobre os dados, porque indicador errado e pior que nenhum:
--   * Nao existe historico de estoque (nao se sabe o estoque do dia 1 do
--     periodo), e a tabela de recebimentos cobre so parte das entradas.
--   * Por isso o sell-through NAO usa a formula classica (vendido/recebido),
--     que daria numero errado aqui. Usa vendido / (vendido + em estoque).
--   * Giro e GMROI usam o estoque de HOJE como se fosse o estoque medio:
--     boa aproximacao para comparar produtos, fraca para comparar periodos.
-- ===========================================================================

create or replace function public.fn_indicadores_gestor(p_inicio date, p_fim date)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_dias             int;
  v_vendidos         int := 0;
  v_estoque_pares    int := 0;
  v_estoque_custo    numeric := 0;
  v_cmv              numeric := 0;
  v_receita_liq      numeric := 0;
  v_taxas            numeric := 0;
  v_margem           numeric := 0;
  v_morto_valor      numeric := 0;
  v_rupturas         int := 0;
  v_cli_total        int := 0;
  v_cli_recorrentes  int := 0;
  v_ticket_1x        numeric := 0;
  v_ticket_recor     numeric := 0;
begin
  v_dias := greatest(1, (p_fim - p_inicio) + 1);

  with validas as (
    select * from pedidos
     where status in ('pago_declarado','confirmado','entregue')
       and criado_em::date between p_inicio and p_fim
  ), itens as (
    select (i->>'cod') as cod, (i->>'tamanho') as tam,
           (i->>'qtd')::int as qtd, (i->>'preco_unit')::numeric as preco
      from validas p, jsonb_array_elements(p.itens) i
  )
  select coalesce(sum(it.qtd),0),
         coalesce(sum(it.qtd * it.preco),0),
         coalesce(sum(it.qtd * (coalesce(pr.custo_produto,0)
                              + coalesce(pr.custo_frete,0)
                              + coalesce(pr.custo_embalagem,0))),0)
    into v_vendidos, v_receita_liq, v_cmv
    from itens it left join produtos pr on pr.cod = it.cod;

  -- A taxa do cartao sai da receita: ela nunca chega na conta.
  select coalesce(sum(taxa_valor),0) into v_taxas
    from pedidos
   where status in ('pago_declarado','confirmado','entregue')
     and criado_em::date between p_inicio and p_fim;

  v_receita_liq := v_receita_liq - v_taxas;
  v_margem := v_receita_liq - v_cmv;

  select coalesce(sum(e.qtd),0),
         coalesce(sum(e.qtd * (coalesce(p.custo_produto,0)
                             + coalesce(p.custo_frete,0)
                             + coalesce(p.custo_embalagem,0))),0)
    into v_estoque_pares, v_estoque_custo
    from produtos p, lateral (select (v)::int as qtd from jsonb_each_text(p.estoque) e(k,v)) e
   where p.ativo;

  -- Estoque parado: grade (produto + tamanho) sem nenhuma venda no periodo.
  with grade as (
    select p.id, p.cod, e.k as tam, (e.v)::int as qtd,
           (coalesce(p.custo_produto,0)+coalesce(p.custo_frete,0)+coalesce(p.custo_embalagem,0)) as custo
      from produtos p, jsonb_each_text(p.estoque) e(k,v)
     where p.ativo and (e.v)::int > 0
  ), vendidos as (
    select (i->>'cod') as cod, (i->>'tamanho') as tam
      from pedidos p, jsonb_array_elements(p.itens) i
     where p.status in ('pago_declarado','confirmado','entregue')
       and p.criado_em::date between p_inicio and p_fim
     group by 1,2
  )
  select coalesce(sum(g.qtd * g.custo),0) into v_morto_valor
    from grade g
    left join vendidos v on v.cod = g.cod and v.tam = g.tam
   where v.cod is null;

  -- Ruptura: numeracao zerada que vinha vendendo = venda perdida.
  with grade as (
    select p.cod, t.tam, coalesce((p.estoque->>t.tam)::int,0) as qtd
      from produtos p
      cross join lateral (select jsonb_array_elements_text(p.tamanhos) as tam) t
     where p.ativo
  ), vendidos as (
    select (i->>'cod') as cod, (i->>'tamanho') as tam, sum((i->>'qtd')::int) as q
      from pedidos p, jsonb_array_elements(p.itens) i
     where p.status in ('pago_declarado','confirmado','entregue')
       and p.criado_em::date between p_inicio and p_fim
     group by 1,2
  )
  select count(*) into v_rupturas
    from grade g join vendidos v on v.cod = g.cod and v.tam = g.tam
   where g.qtd = 0 and v.q > 0;

  -- Clientes: a chave e o celular so com digitos, porque o mesmo cliente
  -- aparece como "(81) 9..." numa compra e "819..." noutra.
  with por_cliente as (
    select regexp_replace(coalesce(cliente_celular,''),'\D','','g') as chave,
           count(*) as compras,
           sum(coalesce(valor_liquido, total)) as gasto
      from pedidos
     where status in ('pago_declarado','confirmado','entregue')
       and coalesce(cliente_celular,'') <> ''
     group by 1
    having regexp_replace(coalesce(cliente_celular,''),'\D','','g') <> ''
  )
  select count(*),
         count(*) filter (where compras >= 2),
         coalesce(avg(gasto) filter (where compras = 1),0),
         coalesce(avg(gasto) filter (where compras >= 2),0)
    into v_cli_total, v_cli_recorrentes, v_ticket_1x, v_ticket_recor
    from por_cliente;

  return json_build_object(
    'dias_periodo', v_dias,
    'pares_vendidos', v_vendidos,
    'pares_estoque', v_estoque_pares,
    'estoque_custo', round(v_estoque_custo,2),
    'receita_liquida', round(v_receita_liq,2),
    'cmv', round(v_cmv,2),
    'margem_bruta', round(v_margem,2),
    'margem_pct', case when v_receita_liq > 0
                       then round(v_margem / v_receita_liq * 100, 1) else 0 end,
    'sell_through_pct', case when (v_vendidos + v_estoque_pares) > 0
                             then round(v_vendidos::numeric / (v_vendidos + v_estoque_pares) * 100, 1)
                             else 0 end,
    'giro_anual', case when v_estoque_custo > 0 and v_cmv > 0
                       then round((v_cmv / v_dias * 365) / v_estoque_custo, 2) else 0 end,
    'cobertura_dias', case when v_cmv > 0
                           then round(v_estoque_custo / (v_cmv / v_dias), 0) else null end,
    'gmroi', case when v_estoque_custo > 0 and v_margem > 0
                  then round((v_margem / v_dias * 365) / v_estoque_custo, 2) else 0 end,
    'estoque_parado_valor', round(v_morto_valor,2),
    'estoque_parado_pct', case when v_estoque_custo > 0
                               then round(v_morto_valor / v_estoque_custo * 100, 1) else 0 end,
    'rupturas', v_rupturas,
    'clientes_total', v_cli_total,
    'clientes_recorrentes', v_cli_recorrentes,
    'recompra_pct', case when v_cli_total > 0
                         then round(v_cli_recorrentes::numeric / v_cli_total * 100, 1) else 0 end,
    'gasto_cliente_1x', round(v_ticket_1x,2),
    'gasto_cliente_recorrente', round(v_ticket_recor,2)
  );
end $function$;

grant execute on function public.fn_indicadores_gestor(date,date) to anon, authenticated;
