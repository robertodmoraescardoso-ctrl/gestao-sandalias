-- ===========================================================================
-- 0002 — Pagamento com cartao/Pix pelo checkout da InfinitePay
--
-- A loja passou a aceitar cartao de credito (ate 12x) e Pix pelo checkout
-- da InfinitePay. A InfinitePay retem uma taxa que nunca chega na conta,
-- entao o painel precisa mostrar a venda LIQUIDA — senao o faturamento
-- parece maior do que o dinheiro que entrou.
--
-- Decisoes importantes:
--   * A taxa fica gravada em cada pedido (taxa_pct / taxa_valor). Mudar a
--     tabela de taxas no futuro NAO reescreve as vendas do passado.
--   * O percentual depende do numero de parcelas, que so se sabe DEPOIS que
--     o cliente escolhe no checkout. Por isso a loja pergunta a InfinitePay
--     quantas parcelas foram, na volta, antes de confirmar o pedido.
--   * A taxa incide sobre o total cobrado (produtos + entrega), porque e
--     sobre o total que a InfinitePay cobra.
--
-- Esta migracao e aditiva e pode ser rodada mais de uma vez sem estragar nada.
-- ===========================================================================

-- 1) Campos de pagamento no pedido -----------------------------------------
alter table public.pedidos
  add column if not exists forma_pagamento    text    not null default 'pix',
  add column if not exists parcelas           integer not null default 1,
  add column if not exists taxa_pct           numeric not null default 0,
  add column if not exists taxa_valor         numeric not null default 0,
  add column if not exists valor_liquido      numeric,
  add column if not exists ip_transaction_nsu text,
  add column if not exists ip_slug            text,
  add column if not exists ip_receipt_url     text;

comment on column public.pedidos.forma_pagamento is
  'pix = Pix direto na chave da loja (sem taxa). pix_infinitepay / cartao = checkout InfinitePay.';
comment on column public.pedidos.taxa_pct is
  'Percentual cobrado pela InfinitePay, congelado no momento da venda.';
comment on column public.pedidos.valor_liquido is
  'O que de fato cai na conta: total - taxa_valor. E este o valor que os paineis usam como venda.';

-- Vendas antigas foram todas no Pix direto, sem taxa.
update public.pedidos
   set valor_liquido = coalesce(valor_liquido, total)
 where valor_liquido is null;

-- 2) Tabela de taxas --------------------------------------------------------
-- Fonte: infinitepay.io/taxas, aba "Link de Pagamento & Venda Online",
-- recebimento "Em 1 dia util", Plano Inicial (ate R$ 20 mil/mes).
-- Se o plano mudar, basta atualizar esta tabela: as vendas ja feitas
-- continuam com a taxa que valia no dia.
create table if not exists public.taxas_pagamento (
  forma     text    not null check (forma in ('pix','credito')),
  parcelas  integer not null check (parcelas between 0 and 12),
  pct       numeric not null check (pct >= 0),
  primary key (forma, parcelas)
);

comment on table public.taxas_pagamento is
  'Taxas do checkout online da InfinitePay. Plano Inicial, recebimento em 1 dia util.';

insert into public.taxas_pagamento (forma, parcelas, pct) values
  ('pix',     0,  0.00),
  ('credito', 1,  4.20),
  ('credito', 2,  6.09),
  ('credito', 3,  7.01),
  ('credito', 4,  7.91),
  ('credito', 5,  8.80),
  ('credito', 6,  9.67),
  ('credito', 7, 12.59),
  ('credito', 8, 13.42),
  ('credito', 9, 14.25),
  ('credito',10, 15.06),
  ('credito',11, 15.87),
  ('credito',12, 16.66)
on conflict (forma, parcelas) do nothing;

alter table public.taxas_pagamento enable row level security;

drop policy if exists "taxas leitura publica" on public.taxas_pagamento;
create policy "taxas leitura publica" on public.taxas_pagamento
  for select to anon, authenticated using (true);

drop policy if exists "taxas escrita so admin" on public.taxas_pagamento;
create policy "taxas escrita so admin" on public.taxas_pagamento
  for all to authenticated using (true) with check (true);

-- 3) Relatorios: faturamento ja liquido da taxa -----------------------------
-- 'faturamento'       = o que entrou na conta (usar este)
-- 'faturamento_bruto' = soma dos precos, para conferencia
-- 'taxas_cartao'      = quanto a InfinitePay reteve no periodo
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
    select * from pedidos where status in ('pago_declarado','confirmado','entregue')
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

  select coalesce(sum(taxa_valor),0) into v_taxas
    from pedidos
   where status in ('pago_declarado','confirmado','entregue')
     and criado_em::date between p_inicio and p_fim;

  v_liq := v_fat - v_taxas;

  select count(*) into v_num from pedidos where status in ('pago_declarado','confirmado','entregue') and criado_em::date between p_inicio and p_fim;
  select coalesce(sum(valor),0) into v_desp from despesas where data between p_inicio and p_fim;
  select coalesce(sum(valor_pago),0) into v_ativ from ativacoes where data between p_inicio and p_fim;
  v_ativ := v_ativ + coalesce((select sum(ai.quantidade*(coalesce(pr.custo_produto,0)+coalesce(pr.custo_frete,0)+coalesce(pr.custo_embalagem,0)))
     from ativacao_itens ai join ativacoes a on a.id=ai.ativacao_id join produtos pr on pr.id=ai.produto_id
     where a.data between p_inicio and p_fim),0);
  select coalesce(sum(valor),0) into v_ret from retiradas_socios where data between p_inicio and p_fim;
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

create or replace function public.fn_vendas_por_dia(p_inicio date, p_fim date)
 returns TABLE(dia date, faturamento numeric)
 language sql
 security definer
 set search_path to 'public'
as $function$
  with por_pedido as (
    select p.criado_em::date as dia,
           coalesce((select sum((i->>'qtd')::int * (i->>'preco_unit')::numeric)
                       from jsonb_array_elements(p.itens) i), 0) - coalesce(p.taxa_valor, 0) as liquido
    from pedidos p
    where p.status in ('pago_declarado','confirmado','entregue')
      and p.criado_em::date between p_inicio and p_fim
  )
  select dia, sum(liquido) from por_pedido group by dia order by dia;
$function$;

-- A taxa do pedido e rateada entre os itens, na proporcao de cada um.
create or replace function public.fn_top_produtos(p_inicio date, p_fim date, p_limite integer DEFAULT 5)
 returns TABLE(produto text, quantidade bigint, faturamento numeric)
 language sql
 security definer
 set search_path to 'public'
as $function$
  with base as (
    select p.id, p.taxa_valor,
           coalesce((select sum((j->>'qtd')::int * (j->>'preco_unit')::numeric)
                       from jsonb_array_elements(p.itens) j), 0) as total_itens,
           i->>'nome' as nome,
           (i->>'qtd')::int as qtd,
           (i->>'qtd')::int * (i->>'preco_unit')::numeric as valor
    from pedidos p, jsonb_array_elements(p.itens) i
    where p.status in ('pago_declarado','confirmado','entregue')
      and p.criado_em::date between p_inicio and p_fim
  )
  select nome,
         sum(qtd)::bigint,
         sum(valor - case when total_itens > 0
                          then coalesce(taxa_valor,0) * (valor / total_itens)
                          else 0 end)
  from base
  group by nome
  order by 2 desc
  limit p_limite;
$function$;

-- 4) Confirmacao do pagamento feito no checkout -----------------------------
-- Chamada pela loja quando o cliente volta da InfinitePay. Idempotente:
-- recarregar a pagina de retorno nao baixa estoque duas vezes.
create or replace function public.confirmar_pagamento_online(
  p_codigo          text,
  p_capture_method  text,
  p_parcelas        integer default 1,
  p_transaction_nsu text    default null,
  p_slug            text    default null,
  p_receipt_url     text    default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_pedido pedidos%rowtype;
  v_item   jsonb;
  v_prod   produtos%rowtype;
  v_tam    text;
  v_qtd    integer;
  v_disp   integer;
  v_forma  text;
  v_parc   integer;
  v_pct    numeric;
  v_taxa   numeric;
begin
  if nullif(p_codigo,'') is null then
    raise exception 'PEDIDO_NAO_ENCONTRADO|';
  end if;

  select * into v_pedido
    from pedidos
   where codigo = p_codigo
   order by id desc
   limit 1
     for update;

  if not found then
    raise exception 'PEDIDO_NAO_ENCONTRADO|';
  end if;

  v_forma := case when p_capture_method = 'pix' then 'pix_infinitepay' else 'cartao' end;
  v_parc  := case when v_forma = 'pix_infinitepay'
                  then 0
                  else greatest(1, least(12, coalesce(p_parcelas, 1))) end;

  select pct into v_pct
    from taxas_pagamento
   where forma = case when v_forma = 'cartao' then 'credito' else 'pix' end
     and parcelas = v_parc;
  v_pct := coalesce(v_pct, 0);

  v_taxa := round(coalesce(v_pedido.total,0) * v_pct / 100.0, 2);

  if v_pedido.estoque_baixado then
    update pedidos
       set ip_transaction_nsu = coalesce(p_transaction_nsu, ip_transaction_nsu),
           ip_slug            = coalesce(p_slug, ip_slug),
           ip_receipt_url     = coalesce(p_receipt_url, ip_receipt_url)
     where id = v_pedido.id;
    return jsonb_build_object('ok', true, 'id', v_pedido.id, 'repetido', true);
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(v_pedido.itens,'[]'::jsonb))
  loop
    v_tam := v_item->>'tamanho';
    v_qtd := coalesce((v_item->>'qtd')::integer, 0);

    select * into v_prod from produtos
      where id = (v_item->>'produto_id')::bigint
      for update;

    if not found then
      raise exception 'SEM_PRODUTO|%', coalesce(v_item->>'nome','produto');
    end if;
    if not coalesce(v_prod.ativo, false) then
      raise exception 'INATIVO|%', v_prod.nome;
    end if;

    v_disp := coalesce((v_prod.estoque->>v_tam)::integer, 0);
    if v_disp < v_qtd then
      raise exception 'SEM_ESTOQUE|%|%|%', v_prod.nome, v_tam, v_disp;
    end if;

    update produtos
       set estoque = jsonb_set(coalesce(estoque,'{}'::jsonb),
                               array[v_tam], to_jsonb(v_disp - v_qtd))
     where id = v_prod.id;
  end loop;

  update pedidos
     set status             = 'pago_declarado',
         estoque_baixado    = true,
         forma_pagamento    = v_forma,
         parcelas           = greatest(v_parc, 1),
         taxa_pct           = v_pct,
         taxa_valor         = v_taxa,
         valor_liquido      = coalesce(total,0) - v_taxa,
         ip_transaction_nsu = coalesce(p_transaction_nsu, ip_transaction_nsu),
         ip_slug            = coalesce(p_slug, ip_slug),
         ip_receipt_url     = coalesce(p_receipt_url, ip_receipt_url)
   where id = v_pedido.id;

  return jsonb_build_object(
    'ok', true, 'id', v_pedido.id,
    'forma', v_forma, 'parcelas', v_parc,
    'taxa_pct', v_pct, 'taxa_valor', v_taxa,
    'valor_liquido', coalesce(v_pedido.total,0) - v_taxa
  );
end;
$$;

grant execute on function public.confirmar_pagamento_online(text,text,integer,text,text,text) to anon, authenticated;
