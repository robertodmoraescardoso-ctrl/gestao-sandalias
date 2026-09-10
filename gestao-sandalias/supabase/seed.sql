-- Dados de exemplo (opcional). Rode DEPOIS da migração 0001_init.sql
-- apenas se quiser ver o sistema populado. Pode apagar tudo depois.

insert into fornecedores (nome, contato, prazo_pagamento_dias)
values ('Distribuidora Litoral', 'contato@litoral.com', 45),
       ('Sandálias SP', '(11) 90000-0000', 30);

insert into produtos (sku, nome, categoria, preco_venda, estoque_minimo)
values ('SND-001', 'Chinelo Praia Azul', 'Praia', 39.90, 10),
       ('SND-002', 'Rasteira Conforto Nude', 'Feminino', 59.90, 8),
       ('SND-003', 'Slide Emborrachado Preto', 'Unissex', 49.90, 6);
