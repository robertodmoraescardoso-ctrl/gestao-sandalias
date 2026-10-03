-- ===========================================================================
-- 0004 — Correcoes encontradas na revisao geral das integracoes
-- ===========================================================================

-- 1) VAZAMENTO DE DADOS -----------------------------------------------------
-- fn_indicadores_gestor devolve faturamento, margem, custo, valor de estoque
-- e base de clientes. Ao criar uma funcao, o Postgres concede EXECUTE a
-- PUBLIC por padrao, e PUBLIC inclui anon — ou seja, qualquer visitante da
-- loja, usando a chave publicavel que esta no HTML, conseguia ler o resultado
-- do negocio. As demais funcoes de relatorio ja tinham esse revoke.
--
-- Atencao ao criar funcoes novas: so o GRANT nao basta, precisa do REVOKE.
revoke execute on function public.fn_indicadores_gestor(date,date) from public;
revoke execute on function public.fn_indicadores_gestor(date,date) from anon;
grant  execute on function public.fn_indicadores_gestor(date,date) to authenticated;

-- 2) PEDIDO "ENVIADO" SUMIA DO FATURAMENTO ---------------------------------
-- Um pedido marcado como "enviado" e uma venda: a peca saiu e o dinheiro
-- entrou. Mas as funcoes de relatorio so olhavam
-- pago_declarado/confirmado/entregue, entao pedido parado em "enviado"
-- desaparecia do painel sem aviso nenhum.
--
-- Reescreve cada funcao trocando apenas a lista de status, em vez de
-- reescrever a logica a mao em cinco funcoes.
do $$
declare
  r record;
  antigo text := '''pago_declarado'',''confirmado'',''entregue''';
  novo   text := '''pago_declarado'',''confirmado'',''enviado'',''entregue''';
begin
  for r in
    select p.oid, pg_get_functiondef(p.oid) as def, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and position(antigo in pg_get_functiondef(p.oid)) > 0
  loop
    execute replace(r.def, antigo, novo);
    raise notice 'atualizada: %', r.proname;
  end loop;
end $$;
