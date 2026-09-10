-- =============================================================
--  Gestão Sandálias — Schema completo
--  Implementa o fluxo integrado:
--  Pedido -> Recebimento -> Estoque -> Venda -> Baixa -> Resultado
--  e as automações: recebimento gera conta a pagar,
--  venda registra CMV, doação sai como marketing, custo médio.
-- =============================================================

-- ---------- Cadastros base ----------

create table if not exists fornecedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  contato text,
  prazo_pagamento_dias int not null default 45,
  observacoes text,
  created_at timestamptz default now()
);

create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  sku text,
  nome text not null,
  categoria text,
  custo_medio numeric(12,2) not null default 0,   -- atualizado automaticamente no recebimento
  preco_venda numeric(12,2) not null default 0,
  estoque_minimo int not null default 5,
  estoque_atual int not null default 0,           -- atualizado automaticamente por movimentações
  ativo boolean not null default true,
  created_at timestamptz default now()
);

-- ---------- Compras ----------

create type pedido_status as enum
  ('realizado','confirmado','em_transito','parcialmente_recebido','recebido','cancelado');

create table if not exists pedidos_compra (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid references fornecedores(id),
  data_pedido date not null default current_date,
  data_prevista date,
  prazo_pagamento_dias int not null default 45,
  status pedido_status not null default 'realizado',
  observacoes text,
  created_at timestamptz default now()
);

create table if not exists pedido_compra_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos_compra(id) on delete cascade,
  produto_id uuid not null references produtos(id),
  quantidade int not null,
  preco_unitario numeric(12,2) not null,
  quantidade_recebida int not null default 0
);

create table if not exists recebimentos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos_compra(id),
  data_recebimento date not null default current_date,
  observacoes text,
  created_at timestamptz default now()
);

create table if not exists recebimento_itens (
  id uuid primary key default gen_random_uuid(),
  recebimento_id uuid not null references recebimentos(id) on delete cascade,
  pedido_item_id uuid not null references pedido_compra_itens(id),
  produto_id uuid not null references produtos(id),
  quantidade int not null
);

-- ---------- Estoque (movimentações; quantidade é SINALIZADA: entrada +, saída -) ----------

create type mov_tipo as enum ('entrada_compra','saida_venda','saida_doacao','ajuste');

create table if not exists movimentacoes_estoque (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produtos(id),
  tipo mov_tipo not null,
  quantidade int not null,           -- sinalizada
  custo_unitario numeric(12,2),
  data date not null default current_date,
  referencia text,
  created_at timestamptz default now()
);

-- ---------- Financeiro ----------

create type conta_status as enum ('pendente','pago');

create table if not exists contas_pagar (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid references fornecedores(id),
  pedido_id uuid references pedidos_compra(id),
  recebimento_id uuid references recebimentos(id),
  valor numeric(12,2) not null,
  data_compra date,
  data_recebimento date,
  data_vencimento date not null,
  status conta_status not null default 'pendente',
  forma_pagamento text,
  numero_boleto text,
  data_pagamento date,
  observacoes text,
  created_at timestamptz default now()
);

create table if not exists despesas (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  categoria text,
  descricao text,
  valor numeric(12,2) not null,
  forma_pagamento text,
  created_at timestamptz default now()
);

create table if not exists retiradas_socios (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  socio text not null,
  valor numeric(12,2) not null,
  descricao text,
  forma_pagamento text,
  observacao text,
  created_at timestamptz default now()
);

-- ---------- Vendas ----------

create table if not exists vendas (
  id uuid primary key default gen_random_uuid(),
  data_venda date not null default current_date,
  cliente text,
  cupom text,
  observacoes text,
  created_at timestamptz default now()
);

create table if not exists venda_itens (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references vendas(id) on delete cascade,
  produto_id uuid not null references produtos(id),
  quantidade int not null,
  preco_unitario numeric(12,2) not null,
  custo_unitario numeric(12,2)      -- preenchido automaticamente com o custo médio do produto
);

-- ---------- Ativações / Marketing ----------

create type ativacao_tipo as enum ('doacao','pagamento','misto');
create type ativacao_status as enum ('planejada','em_andamento','concluida');

create table if not exists ativacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo ativacao_tipo not null,
  data date not null default current_date,
  beneficiario text,
  valor_pago numeric(12,2) not null default 0,
  forma_pagamento text,
  objetivo text,
  status ativacao_status not null default 'concluida',
  cupom text,
  created_at timestamptz default now()
);

create table if not exists ativacao_itens (
  id uuid primary key default gen_random_uuid(),
  ativacao_id uuid not null references ativacoes(id) on delete cascade,
  produto_id uuid not null references produtos(id),
  quantidade int not null
);

-- =============================================================
--  AUTOMAÇÕES (triggers)
-- =============================================================

-- 1) Toda movimentação de estoque atualiza produtos.estoque_atual
create or replace function trg_mov_atualiza_estoque() returns trigger
language plpgsql as $$
begin
  update produtos
     set estoque_atual = estoque_atual + new.quantidade
   where id = new.produto_id;
  return new;
end $$;

drop trigger if exists mov_atualiza_estoque on movimentacoes_estoque;
create trigger mov_atualiza_estoque
after insert on movimentacoes_estoque
for each row execute function trg_mov_atualiza_estoque();

-- 2) Recebimento de item: atualiza custo médio, gera entrada de estoque,
--    soma quantidade_recebida e ajusta o status do pedido.
create or replace function trg_recebimento_item() returns trigger
language plpgsql as $$
declare
  v_preco numeric(12,2);
  v_estoque_antes int;
  v_custo_antes numeric(12,2);
  v_pedido_id uuid;
  v_total_ped int;
  v_total_rec int;
begin
  select preco_unitario, pedido_id into v_preco, v_pedido_id
    from pedido_compra_itens where id = new.pedido_item_id;

  select estoque_atual, custo_medio into v_estoque_antes, v_custo_antes
    from produtos where id = new.produto_id;

  -- custo médio ponderado
  if (v_estoque_antes + new.quantidade) > 0 then
    update produtos
       set custo_medio = round(
             ((coalesce(v_custo_antes,0) * greatest(v_estoque_antes,0))
              + (v_preco * new.quantidade))
             / (greatest(v_estoque_antes,0) + new.quantidade), 2)
     where id = new.produto_id;
  end if;

  -- entrada de estoque (dispara trigger 1)
  insert into movimentacoes_estoque(produto_id, tipo, quantidade, custo_unitario, data, referencia)
  values (new.produto_id, 'entrada_compra', new.quantidade, v_preco, current_date,
          'Recebimento ' || new.recebimento_id);

  -- soma o recebido no item do pedido
  update pedido_compra_itens
     set quantidade_recebida = quantidade_recebida + new.quantidade
   where id = new.pedido_item_id;

  -- recalcula status do pedido
  select coalesce(sum(quantidade),0), coalesce(sum(quantidade_recebida),0)
    into v_total_ped, v_total_rec
    from pedido_compra_itens where pedido_id = v_pedido_id;

  update pedidos_compra
     set status = case
        when v_total_rec = 0 then status
        when v_total_rec >= v_total_ped then 'recebido'::pedido_status
        else 'parcialmente_recebido'::pedido_status end
   where id = v_pedido_id;

  return new;
end $$;

drop trigger if exists recebimento_item on recebimento_itens;
create trigger recebimento_item
after insert on recebimento_itens
for each row execute function trg_recebimento_item();

-- 3) Cada recebimento gera automaticamente uma conta a pagar
--    (vencimento = data do recebimento + prazo do fornecedor)
create or replace function trg_recebimento_conta() returns trigger
language plpgsql as $$
declare
  v_forn uuid;
  v_prazo int;
  v_valor numeric(12,2);
  v_data_ped date;
begin
  select p.fornecedor_id, p.prazo_pagamento_dias, p.data_pedido
    into v_forn, v_prazo, v_data_ped
    from pedidos_compra p where p.id = new.pedido_id;

  -- valor deste recebimento = soma (qtd recebida * preço do item do pedido)
  select coalesce(sum(ri.quantidade * pci.preco_unitario),0)
    into v_valor
    from recebimento_itens ri
    join pedido_compra_itens pci on pci.id = ri.pedido_item_id
   where ri.recebimento_id = new.id;

  -- a conta é criada/atualizada após os itens; aqui inserimos placeholder e
  -- o valor é ajustado por trigger nos itens (ver trg_recebimento_conta_valor)
  insert into contas_pagar(fornecedor_id, pedido_id, recebimento_id, valor,
                           data_compra, data_recebimento, data_vencimento, status)
  values (v_forn, new.pedido_id, new.id, 0,
          v_data_ped, new.data_recebimento,
          new.data_recebimento + coalesce(v_prazo,45),
          'pendente');
  return new;
end $$;

drop trigger if exists recebimento_conta on recebimentos;
create trigger recebimento_conta
after insert on recebimentos
for each row execute function trg_recebimento_conta();

-- 3b) Ao inserir cada item do recebimento, soma o valor na conta a pagar do recebimento
create or replace function trg_recebimento_conta_valor() returns trigger
language plpgsql as $$
declare v_preco numeric(12,2);
begin
  select preco_unitario into v_preco from pedido_compra_itens where id = new.pedido_item_id;
  update contas_pagar
     set valor = valor + (new.quantidade * v_preco)
   where recebimento_id = new.recebimento_id;
  return new;
end $$;

drop trigger if exists recebimento_conta_valor on recebimento_itens;
create trigger recebimento_conta_valor
after insert on recebimento_itens
for each row execute function trg_recebimento_conta_valor();

-- 4) Venda de item: preenche custo médio do momento e baixa o estoque
create or replace function trg_venda_item() returns trigger
language plpgsql as $$
declare v_custo numeric(12,2);
begin
  if new.custo_unitario is null then
    select custo_medio into v_custo from produtos where id = new.produto_id;
    new.custo_unitario := v_custo;
  end if;
  return new;
end $$;

drop trigger if exists venda_item_custo on venda_itens;
create trigger venda_item_custo
before insert on venda_itens
for each row execute function trg_venda_item();

create or replace function trg_venda_item_baixa() returns trigger
language plpgsql as $$
begin
  insert into movimentacoes_estoque(produto_id, tipo, quantidade, custo_unitario, data, referencia)
  values (new.produto_id, 'saida_venda', -new.quantidade, new.custo_unitario, current_date,
          'Venda ' || new.venda_id);
  return new;
end $$;

drop trigger if exists venda_item_baixa on venda_itens;
create trigger venda_item_baixa
after insert on venda_itens
for each row execute function trg_venda_item_baixa();

-- 5) Doação em ativação: sai do estoque como marketing (NÃO é venda)
create or replace function trg_ativacao_item_baixa() returns trigger
language plpgsql as $$
declare v_custo numeric(12,2);
begin
  select custo_medio into v_custo from produtos where id = new.produto_id;
  insert into movimentacoes_estoque(produto_id, tipo, quantidade, custo_unitario, data, referencia)
  values (new.produto_id, 'saida_doacao', -new.quantidade, v_custo, current_date,
          'Ativação ' || new.ativacao_id);
  return new;
end $$;

drop trigger if exists ativacao_item_baixa on ativacao_itens;
create trigger ativacao_item_baixa
after insert on ativacao_itens
for each row execute function trg_ativacao_item_baixa();

-- =============================================================
--  VIEWS
-- =============================================================

-- Estoque consolidado por produto
create or replace view v_estoque as
select
  p.id, p.sku, p.nome, p.categoria,
  p.custo_medio, p.preco_venda, p.estoque_minimo,
  p.estoque_atual as disponivel,
  coalesce((
    select sum(pci.quantidade - pci.quantidade_recebida)
    from pedido_compra_itens pci
    join pedidos_compra pc on pc.id = pci.pedido_id
    where pci.produto_id = p.id
      and pc.status in ('confirmado','em_transito','parcialmente_recebido')
  ),0) as em_transito,
  (p.estoque_atual * p.custo_medio) as valor_custo,
  (p.estoque_atual * p.preco_venda) as valor_potencial,
  coalesce((
    select -sum(m.quantidade) from movimentacoes_estoque m
    where m.produto_id = p.id and m.tipo = 'saida_venda'
  ),0) as total_vendido,
  (select max(m.data) from movimentacoes_estoque m
    where m.produto_id = p.id and m.tipo = 'saida_venda') as ultima_venda
from produtos p
where p.ativo;

-- Contas a pagar com status efetivo e dias restantes
create or replace view v_contas_pagar as
select c.*,
  f.nome as fornecedor_nome,
  (c.data_vencimento - current_date) as dias_restantes,
  case
    when c.status = 'pago' then 'pago'
    when c.data_vencimento < current_date then 'atrasado'
    else 'pendente'
  end as status_efetivo
from contas_pagar c
left join fornecedores f on f.id = c.fornecedor_id;

-- =============================================================
--  RPC: KPIs do dashboard para um período
-- =============================================================
create or replace function fn_dashboard(p_inicio date, p_fim date)
returns json language plpgsql as $$
declare
  v_faturamento numeric := 0;
  v_cmv numeric := 0;
  v_qtd_vendida int := 0;
  v_num_vendas int := 0;
  v_despesas numeric := 0;
  v_ativacoes numeric := 0;
  v_retiradas numeric := 0;
  v_estoque_custo numeric := 0;
  v_estoque_potencial numeric := 0;
  v_transito numeric := 0;
  v_a_pagar numeric := 0;
  v_vencido numeric := 0;
  v_vence_7 numeric := 0;
  v_vence_30 numeric := 0;
  v_pago numeric := 0;
begin
  select coalesce(sum(vi.quantidade * vi.preco_unitario),0),
         coalesce(sum(vi.quantidade * coalesce(vi.custo_unitario,0)),0),
         coalesce(sum(vi.quantidade),0)
    into v_faturamento, v_cmv, v_qtd_vendida
    from venda_itens vi
    join vendas v on v.id = vi.venda_id
   where v.data_venda between p_inicio and p_fim;

  select count(*) into v_num_vendas
    from vendas where data_venda between p_inicio and p_fim;

  select coalesce(sum(valor),0) into v_despesas
    from despesas where data between p_inicio and p_fim;

  select coalesce(sum(a.valor_pago),0)
       + coalesce((select sum(ai.quantidade * pr.custo_medio)
                   from ativacao_itens ai
                   join ativacoes a2 on a2.id = ai.ativacao_id
                   join produtos pr on pr.id = ai.produto_id
                   where a2.data between p_inicio and p_fim),0)
    into v_ativacoes
    from ativacoes a where a.data between p_inicio and p_fim;

  select coalesce(sum(valor),0) into v_retiradas
    from retiradas_socios where data between p_inicio and p_fim;

  select coalesce(sum(estoque_atual * custo_medio),0),
         coalesce(sum(estoque_atual * preco_venda),0)
    into v_estoque_custo, v_estoque_potencial
    from produtos where ativo;

  select coalesce(sum((pci.quantidade - pci.quantidade_recebida) * pci.preco_unitario),0)
    into v_transito
    from pedido_compra_itens pci
    join pedidos_compra pc on pc.id = pci.pedido_id
   where pc.status in ('confirmado','em_transito','parcialmente_recebido');

  select coalesce(sum(valor),0) into v_a_pagar
    from contas_pagar where status = 'pendente';
  select coalesce(sum(valor),0) into v_vencido
    from contas_pagar where status = 'pendente' and data_vencimento < current_date;
  select coalesce(sum(valor),0) into v_vence_7
    from contas_pagar where status = 'pendente'
      and data_vencimento between current_date and current_date + 7;
  select coalesce(sum(valor),0) into v_vence_30
    from contas_pagar where status = 'pendente'
      and data_vencimento between current_date and current_date + 30;
  select coalesce(sum(valor),0) into v_pago
    from contas_pagar where status = 'pago'
      and data_pagamento between p_inicio and p_fim;

  return json_build_object(
    'faturamento', v_faturamento,
    'cmv', v_cmv,
    'lucro_bruto', v_faturamento - v_cmv,
    'despesas', v_despesas,
    'ativacoes', v_ativacoes,
    'retiradas', v_retiradas,
    'lucro_geral', v_faturamento - v_cmv - v_despesas - v_ativacoes,
    'qtd_vendida', v_qtd_vendida,
    'num_vendas', v_num_vendas,
    'ticket_medio', case when v_num_vendas > 0 then round(v_faturamento / v_num_vendas,2) else 0 end,
    'estoque_custo', v_estoque_custo,
    'estoque_potencial', v_estoque_potencial,
    'mercadoria_transito', v_transito,
    'total_a_pagar', v_a_pagar,
    'total_vencido', v_vencido,
    'vence_7', v_vence_7,
    'vence_30', v_vence_30,
    'total_pago', v_pago
  );
end $$;

-- Top produtos vendidos no período
create or replace function fn_top_produtos(p_inicio date, p_fim date, p_limite int default 5)
returns table(produto text, quantidade bigint, faturamento numeric)
language sql as $$
  select pr.nome,
         sum(vi.quantidade)::bigint,
         sum(vi.quantidade * vi.preco_unitario)
  from venda_itens vi
  join vendas v on v.id = vi.venda_id
  join produtos pr on pr.id = vi.produto_id
  where v.data_venda between p_inicio and p_fim
  group by pr.nome
  order by 2 desc
  limit p_limite;
$$;

-- Evolução de vendas por dia no período
create or replace function fn_vendas_por_dia(p_inicio date, p_fim date)
returns table(dia date, faturamento numeric)
language sql as $$
  select v.data_venda, sum(vi.quantidade * vi.preco_unitario)
  from vendas v join venda_itens vi on vi.venda_id = v.id
  where v.data_venda between p_inicio and p_fim
  group by v.data_venda order by v.data_venda;
$$;

-- =============================================================
--  RLS — permissivo para uso com a chave anon (ferramenta interna
--  de usuário único). Aperte as políticas quando adicionar login.
-- =============================================================
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists p_all on public.%I;', t);
    execute format('create policy p_all on public.%I for all using (true) with check (true);', t);
  end loop;
end $$;
