-- ===========================================================================
-- 0007 — Cancelamento de retirada de sócio
--
-- Retirada lancada e registro de dinheiro que saiu do caixa. Apagar a linha
-- nao desfaz a transferencia: so some com o rastro, e sobra uma saida no
-- extrato sem contrapartida no painel. Regra 8 do CLAUDE.md.
--
-- Entao em vez de delete, marcacao: a linha fica, aparece riscada na tela e
-- para de contar no caixa.
--
-- Tres consultas somam retiradas_socios hoje, e TODAS precisam passar a
-- ignorar as canceladas. Criar a coluna sem mexer nas tres faria a sugestao
-- de retirada do Dashboard mentir em silencio, que e o pior tipo de erro:
--   1. fn_dashboard          — KPI "Retiradas dos socios" do periodo
--   2. fn_sugestao_retirada  — total retirado historico (v_ret)
--   3. fn_sugestao_retirada  — retirado nos ultimos 30 dias (v_ret30)
--
-- As duas funcoes abaixo sao copia exata do que estava no banco em
-- 06/11/2026, com a unica diferenca sendo o filtro de cancelada. O corpo nao
-- foi reescrito nem reorganizado de proposito: quanto menor o diff, menor a
-- chance de quebrar um calculo que ja funciona.
--
-- CREATE OR REPLACE e nao DROP + CREATE porque o tipo de retorno nao muda
-- (json nos dois casos) e porque fn_sugestao_retirada chama fn_dashboard —
-- derrubar uma deixaria a outra quebrada no meio da migracao. A regra 4 do
-- CLAUDE.md exige o DROP so quando as colunas de retorno mudam.
-- CREATE OR REPLACE tambem preserva os grants existentes; mesmo assim eles
-- sao reaplicados no fim, por causa da licao 3.
-- ===========================================================================

alter table public.retiradas_socios
  add column if not exists cancelada        boolean not null default false,
  add column if not exists cancelada_em     timestamptz,
  add column if not exists cancelada_motivo text;

comment on column public.retiradas_socios.cancelada is
  'Retirada estornada. A linha permanece para rastro; nao conta no caixa.';


-- ---------------------------------------------------------------------------
-- fn_dashboard — unica mudanca: filtro de cancelada no v_ret (ver marcacao)
-- ---------------------------------------------------------------------------
create or replace function public.fn_dashboard(p_inicio date, p_fim date)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_fat numeric:=0; v_cmv numeric:=0; v_pares int:=0; v_num int:=0;
  v_desp numeric:=0; v_ativ numeric:=0; v_ret numeric:=0; v_est_c numeric:=0; v_est_p numeric:=0;
  v_apagar numeric:=0; v_venc numeric:=0; v_v7 numeric:=0; v_v30 numeric:=0; v_pago numeric:=0;
  v_compra_vendidos numeric:=0; v_compra_estoque numeric:=0;
  v_taxas numeric:=0; v_liq numeric:=0;
begin
  with validas as (
    select * from pedidos where status in ('pago_declarado','confirmado','enviado','entregue')
       and criado_em::date between p_inicio and p_fim
  ), itens as (
    select (i->>'cod') as cod, (i->>'qtd')::int as qtd, (i->>'preco_unit')::numeric as preco
    from validas p, jsonb_array_elements(p.itens) i
  )
  select coalesce(sum(it.qtd*it.preco),0),
         coalesce(sum(it.qtd*(coalesce(pr.custo_produto,0)+coalesce(pr.custo_frete,0)+coalesce(pr.custo_embalagem,0))),0),
         coalesce(sum(it.qtd),0),
         coalesce(sum(it.qtd*coalesce(pr.custo_produto,0)),0)
    into v_fat, v_cmv, v_pares, v_compra_vendidos
    from itens it left join produtos pr on pr.cod = it.cod;

  -- Taxa retida pela InfinitePay nas vendas do periodo.
  select coalesce(sum(taxa_valor),0) into v_taxas
    from pedidos
   where status in ('pago_declarado','confirmado','enviado','entregue')
     and criado_em::date between p_inicio and p_fim;

  -- Faturamento que de fato entra: produtos menos a taxa do cartao.
  v_liq := v_fat - v_taxas;

  select count(*) into v_num from pedidos where status in ('pago_declarado','confirmado','enviado','entregue') and criado_em::date between p_inicio and p_fim;
  select coalesce(sum(valor),0) into v_desp from despesas where data between p_inicio and p_fim;
  select coalesce(sum(valor_pago),0) into v_ativ from ativacoes where data between p_inicio and p_fim;
  v_ativ := v_ativ + coalesce((select sum(ai.quantidade*(coalesce(pr.custo_produto,0)+coalesce(pr.custo_frete,0)+coalesce(pr.custo_embalagem,0)))
     from ativacao_itens ai join ativacoes a on a.id=ai.ativacao_id join produtos pr on pr.id=ai.produto_id
     where a.data between p_inicio and p_fim),0);
  -- 0007: retirada cancelada nao conta
  select coalesce(sum(valor),0) into v_ret from retiradas_socios
   where data between p_inicio and p_fim and not coalesce(cancelada,false);
  select coalesce(sum(tot.qtd*(coalesce(p.custo_produto,0)+coalesce(p.custo_frete,0)+coalesce(p.custo_embalagem,0))),0),
         coalesce(sum(tot.qtd*p.preco),0),
         coalesce(sum(tot.qtd*coalesce(p.custo_produto,0)),0)
    into v_est_c, v_est_p, v_compra_estoque
    from produtos p, lateral (select coalesce(sum(v::int),0) as qtd from jsonb_each_text(p.estoque) e(k,v)) tot where p.ativo;
  select coalesce(sum(valor),0) into v_apagar from contas_pagar where status='pendente';
  select coalesce(sum(valor),0) into v_venc from contas_pagar where status='pendente' and data_vencimento < current_date;
  select coalesce(sum(valor),0) into v_v7 from contas_pagar where status='pendente' and data_vencimento between current_date and current_date+7;
  select coalesce(sum(valor),0) into v_v30 from contas_pagar where status='pendente' and data_vencimento between current_date and current_date+30;
  select coalesce(sum(valor),0) into v_pago from contas_pagar where status='pago' and data_pagamento between p_inicio and p_fim;

  return json_build_object('faturamento',v_liq,'faturamento_bruto',v_fat,'taxas_cartao',v_taxas,
    'cmv',v_cmv,'lucro_bruto',v_liq-v_cmv,
    'despesas',v_desp,'ativacoes',v_ativ,'retiradas',v_ret,'lucro_geral',v_liq-v_cmv-v_desp-v_ativ,
    'qtd_vendida',v_pares,'num_vendas',v_num,'ticket_medio',case when v_num>0 then round(v_liq/v_num,2) else 0 end,
    'estoque_custo',v_est_c,'estoque_potencial',v_est_p,'mercadoria_transito',0,
    'compra_vendidos',v_compra_vendidos,'compra_estoque',v_compra_estoque,
    'lucro_total',v_liq-v_compra_vendidos-v_compra_estoque,
    'total_a_pagar',v_apagar,'total_vencido',v_venc,'vence_7',v_v7,'vence_30',v_v30,'total_pago',v_pago);
end $function$;


-- ---------------------------------------------------------------------------
-- fn_sugestao_retirada — duas mudancas: v_ret e v_ret30 (ver marcacoes)
-- ---------------------------------------------------------------------------
create or replace function public.fn_sugestao_retirada(p_pct_lucro numeric default 50, p_pct_reserva numeric default 15, p_saldo_real numeric default null::numeric)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_tudo json; v_30 json;
  v_entradas numeric; v_pago_forn numeric; v_desp numeric; v_ativ numeric; v_ret numeric;
  v_caixa_est numeric; v_caixa numeric;
  v_pend numeric; v_fat30 numeric; v_lucro30 numeric; v_ret30 numeric;
  v_reserva numeric; v_manter numeric; v_livre numeric; v_teto numeric; v_sug numeric;
  v_repo numeric;
begin
  v_tudo := fn_dashboard('2000-01-01'::date, current_date);
  v_30   := fn_dashboard(current_date - 29, current_date);

  v_entradas  := coalesce((v_tudo->>'faturamento')::numeric, 0);
  select coalesce(sum(valor),0) into v_pago_forn from contas_pagar where status = 'pago';
  select coalesce(sum(valor),0) into v_desp from despesas where data <= current_date;
  select coalesce(sum(valor_pago),0) into v_ativ from ativacoes where data <= current_date;
  -- 0007: retirada cancelada nao conta
  select coalesce(sum(valor),0) into v_ret from retiradas_socios
   where data <= current_date and not coalesce(cancelada,false);

  v_caixa_est := v_entradas - v_pago_forn - v_desp - v_ativ - v_ret;
  v_caixa     := coalesce(p_saldo_real, v_caixa_est);

  select coalesce(sum(valor),0) into v_pend from contas_pagar where status = 'pendente';
  v_fat30   := coalesce((v_30->>'faturamento')::numeric, 0);
  v_lucro30 := coalesce((v_30->>'lucro_geral')::numeric, 0);
  -- 0007: retirada cancelada nao conta
  select coalesce(sum(valor),0) into v_ret30 from retiradas_socios
   where data between current_date - 29 and current_date and not coalesce(cancelada,false);

  select coalesce(sum(custo_sugestao) filter (where sugestao > 0),0) into v_repo
    from fn_reposicao(30, 30);

  v_reserva := round(v_fat30 * p_pct_reserva / 100, 2);
  v_manter  := v_pend + v_reserva;
  v_livre   := v_caixa - v_manter;
  v_teto    := greatest(0, round(v_lucro30 * p_pct_lucro / 100, 2) - v_ret30);
  v_sug     := floor(greatest(0, least(v_livre, v_teto)) / 10) * 10;

  return json_build_object(
    'entradas', v_entradas, 'pago_fornecedores', v_pago_forn, 'despesas', v_desp,
    'ativacoes', v_ativ, 'retiradas', v_ret,
    'caixa_estimado', round(v_caixa_est,2), 'caixa', round(v_caixa,2),
    'usou_saldo_real', p_saldo_real is not null,
    'contas_pendentes', v_pend, 'reserva_seguranca', v_reserva,
    'manter_no_caixa', round(v_manter,2), 'livre', round(v_livre,2),
    'faturamento_30d', v_fat30, 'lucro_30d', v_lucro30, 'retirado_30d', v_ret30,
    'teto_lucro', v_teto, 'sugestao', v_sug,
    'caixa_apos_retirada', round(v_caixa - v_sug, 2),
    'reposicao_30d', v_repo,
    'pct_lucro', p_pct_lucro, 'pct_reserva', p_pct_reserva);
end $function$;


-- Licao 3: revogar de anon nao basta enquanto o grant a PUBLIC continuar.
revoke execute on function public.fn_dashboard(date, date) from public, anon;
grant  execute on function public.fn_dashboard(date, date) to authenticated, service_role;

revoke execute on function public.fn_sugestao_retirada(numeric, numeric, numeric) from public, anon;
grant  execute on function public.fn_sugestao_retirada(numeric, numeric, numeric) to authenticated, service_role;
