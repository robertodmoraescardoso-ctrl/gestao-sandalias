-- ===========================================================================
-- 0006 — Troca de tamanho em pedido do cliente
--
-- Cliente levou 39-40 e quer 41-42. Isso nao e uma edicao livre do pedido:
-- e um movimento de estoque entre duas grades do MESMO produto, com o pedido
-- passando a registrar a grade nova. Mesmo produto, mesmo preco, mesma
-- quantidade — so a grade muda.
--
-- Por que uma funcao no banco e nao um update direto da tela:
--   * precisa alterar produtos.estoque e pedidos.itens de uma vez so, ou
--     nenhum dos dois;
--   * precisa travar a linha do produto (for update) para nao perder par se
--     a loja vender a mesma grade no mesmo instante;
--   * precisa recusar a troca quando a grade nova esta zerada, em vez de
--     deixar estoque negativo.
--
-- Interacao com trg_pedido_estoque: aquele gatilho sai sem fazer nada quando
-- o update nao muda o status do pedido. Como a troca nunca mexe no status,
-- ele nao dispara, e toda a movimentacao de estoque fica explicita aqui.
--
-- pedidos.estoque_baixado diz se o estoque deste pedido esta fora AGORA. So
-- quando ele e verdadeiro a troca move estoque. Em pedido pendente que ainda
-- nao baixou, ou cancelado que ja devolveu, muda so o rotulo.
--
-- Numeracao: 0005 ficou reservada a uma migracao de editar/excluir compra que
-- nunca chegou a ser escrita — aquela funcionalidade acabou saindo por acesso
-- direto as tabelas, sem funcao nova.
-- ===========================================================================

drop function if exists public.fn_trocar_tamanho(bigint, integer, text);

create function public.fn_trocar_tamanho(
  p_pedido_id    bigint,
  p_item_index   integer,
  p_tamanho_novo text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ped        pedidos%rowtype;
  v_prod       produtos%rowtype;
  v_item       jsonb;
  v_estoque    jsonb;
  v_produto_id bigint;
  v_tam_antigo text;
  v_qtd        integer;
  v_disp_novo  integer;
begin
  p_tamanho_novo := nullif(btrim(coalesce(p_tamanho_novo, '')), '');
  if p_tamanho_novo is null then
    raise exception 'TAMANHO_INVALIDO';
  end if;

  select * into v_ped from pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'PEDIDO_NAO_ENCONTRADO';
  end if;

  if p_item_index < 0 or v_ped.itens is null
     or p_item_index >= jsonb_array_length(v_ped.itens) then
    raise exception 'ITEM_NAO_ENCONTRADO';
  end if;

  v_item       := v_ped.itens -> p_item_index;
  v_tam_antigo := nullif(btrim(coalesce(v_item->>'tamanho', '')), '');
  v_qtd        := coalesce((v_item->>'qtd')::integer, 0);
  v_produto_id := nullif(v_item->>'produto_id', '')::bigint;

  if p_tamanho_novo = v_tam_antigo then
    return jsonb_build_object('ok', true, 'mudou', false);
  end if;

  if v_produto_id is null then
    raise exception 'SEM_PRODUTO|%', coalesce(v_item->>'nome', 'produto');
  end if;

  select * into v_prod from produtos where id = v_produto_id for update;
  if not found then
    raise exception 'SEM_PRODUTO|%', coalesce(v_item->>'nome', 'produto');
  end if;

  -- a grade nova tem que existir no catalogo do produto
  if not (coalesce(v_prod.tamanhos, '[]'::jsonb) @> to_jsonb(p_tamanho_novo)) then
    raise exception 'GRADE_INEXISTENTE|%|%', v_prod.nome, p_tamanho_novo;
  end if;

  -- so mexe em estoque se o estoque deste pedido esta fora hoje
  if coalesce(v_ped.estoque_baixado, false) then
    v_estoque   := coalesce(v_prod.estoque, '{}'::jsonb);
    v_disp_novo := coalesce((v_estoque->>p_tamanho_novo)::integer, 0);

    if v_disp_novo < v_qtd then
      raise exception 'SEM_ESTOQUE|%|%|%', v_prod.nome, p_tamanho_novo, v_disp_novo;
    end if;

    -- devolve a grade antiga, quando o item tinha uma
    if v_tam_antigo is not null then
      v_estoque := jsonb_set(v_estoque, array[v_tam_antigo],
                     to_jsonb(coalesce((v_estoque->>v_tam_antigo)::integer, 0) + v_qtd));
    end if;

    -- tira a grade nova
    v_estoque := jsonb_set(v_estoque, array[p_tamanho_novo],
                   to_jsonb(coalesce((v_estoque->>p_tamanho_novo)::integer, 0) - v_qtd));

    update produtos set estoque = v_estoque where id = v_prod.id;
  end if;

  -- nao toca no status: trg_pedido_estoque sai sem fazer nada
  update pedidos
     set itens = jsonb_set(itens, array[p_item_index::text, 'tamanho'],
                           to_jsonb(p_tamanho_novo))
   where id = p_pedido_id;

  return jsonb_build_object(
    'ok', true, 'mudou', true,
    'produto', v_prod.nome,
    'de', v_tam_antigo, 'para', p_tamanho_novo,
    'qtd', v_qtd,
    'mexeu_estoque', coalesce(v_ped.estoque_baixado, false)
  );
end $function$;

-- Licao 3: revogar de anon nao basta enquanto o grant a PUBLIC continuar.
revoke execute on function public.fn_trocar_tamanho(bigint, integer, text) from public, anon;
grant  execute on function public.fn_trocar_tamanho(bigint, integer, text) to authenticated, service_role;
