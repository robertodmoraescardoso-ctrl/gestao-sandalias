import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { brl, num } from '../lib/format'
import { Page, PageHeader, Card, Badge, Empty, Button, Field, inputCls } from '../components/ui'
import Modal from '../components/Modal.jsx'

const statusInfo = {
  entregue: ['verde', 'Entregue'],
  confirmado: ['azul', 'Confirmado'],
  pago_declarado: ['azul', 'Pago declarado'],
  pendente: ['amarelo', 'Pendente'],
  cancelado: ['vermelho', 'Cancelado'],
}
const VALIDAS = ['entregue', 'confirmado', 'pago_declarado']

const CAMPOS = 'id, codigo, itens, total, cliente_nome, status, criado_em, forma_pagamento, parcelas, taxa_valor, valor_liquido, estoque_baixado'

function dataHora(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function Vendas() {
  const [rows, setRows] = useState([])
  const [produtos, setProdutos] = useState([])
  const [filtro, setFiltro] = useState('validas')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [trocar, setTrocar] = useState(null)

  const carregar = () => {
    supabase.from('pedidos').select(CAMPOS)
      .order('criado_em', { ascending: false }).limit(300)
      .then(({ data, error }) => {
        if (error) setErro(error.message)
        setRows(data || []); setLoading(false)
      })
    supabase.from('produtos').select('id, nome, tamanhos, estoque')
      .then(({ data }) => setProdutos(data || []))
  }
  useEffect(carregar, [])

  const visiveis = rows.filter((r) =>
    filtro === 'validas' ? VALIDAS.includes(r.status)
    : filtro === 'todas' ? true : r.status === filtro)

  const itensResumo = (itens) =>
    (itens || []).map((i) => `${i.nome}${i.tamanho ? ` (${i.tamanho})` : ''} ×${i.qtd}`).join(', ')

  // Como o cliente pagou. "Pix" puro é o Pix direto na chave da loja, sem taxa.
  const comoPagou = (r) => {
    if (r.forma_pagamento === 'cartao') return `Cartão ${r.parcelas > 1 ? `${r.parcelas}×` : 'à vista'}`
    if (r.forma_pagamento === 'pix_infinitepay') return 'Pix (InfinitePay)'
    return 'Pix'
  }

  // O que sobra depois da taxa da maquineta — é este número que vira receita.
  const liquido = (r) => Number(r.valor_liquido ?? r.total) || 0

  const totalLiquido = visiveis.reduce((s, r) => s + liquido(r), 0)
  const totalTaxas = visiveis.reduce((s, r) => s + (Number(r.taxa_valor) || 0), 0)

  return (
    <Page>
      <PageHeader title="Vendas" subtitle="Pedidos vindos direto do seu site, atualizados automaticamente." />
      <Card title="Pedidos do site" right={
        <select className={inputCls + ' !py-1.5 !w-44'} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="validas">Vendas válidas</option>
          <option value="todas">Todos</option>
          <option value="entregue">Entregues</option>
          <option value="confirmado">Confirmados</option>
          <option value="pendente">Pendentes</option>
          <option value="cancelado">Cancelados</option>
        </select>
      }>
        {erro && <div className="bg-alerta/10 text-alerta text-sm rounded-md p-3 mb-3">Não foi possível carregar: {erro}</div>}
        {loading ? <Empty>Carregando…</Empty> : visiveis.length === 0 ? (
          <Empty>Nenhum pedido nesse filtro.</Empty>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-ink/45 text-xs border-b border-borda">
                <th className="py-2 pr-3">Data</th><th className="py-2 px-3">Código</th>
                <th className="py-2 px-3">Cliente</th><th className="py-2 px-3">Itens</th>
                <th className="py-2 px-3">Pago com</th>
                <th className="py-2 px-3 text-right">Total</th>
                <th className="py-2 px-3 text-right">Líquido</th><th className="py-2 px-3">Status</th>
                <th className="py-2 pl-3"></th>
              </tr></thead>
              <tbody>{visiveis.map((r) => {
                const [tone, label] = statusInfo[r.status] || ['neutro', r.status]
                return (
                  <tr key={r.id} className="border-b border-borda/50">
                    <td className="py-2 pr-3 text-ink/60 whitespace-nowrap">{dataHora(r.criado_em)}</td>
                    <td className="py-2 px-3 font-medium">{r.codigo || '—'}</td>
                    <td className="py-2 px-3">{r.cliente_nome || '—'}</td>
                    <td className="py-2 px-3 text-ink/60 max-w-[300px]">{itensResumo(r.itens)}</td>
                    <td className="py-2 px-3 text-ink/60 whitespace-nowrap">{comoPagou(r)}</td>
                    <td className="py-2 px-3 text-right tnum text-ink/60">{brl(r.total)}</td>
                    <td className="py-2 px-3 text-right tnum font-medium">
                      {brl(liquido(r))}
                      {Number(r.taxa_valor) > 0 && (
                        <div className="text-[11px] text-alerta font-normal">−{brl(r.taxa_valor)} taxa</div>
                      )}
                    </td>
                    <td className="py-2 px-3"><Badge tone={tone}>{label}</Badge></td>
                    <td className="py-2 pl-3 text-right whitespace-nowrap">
                      {(r.itens || []).length > 0 && (
                        <button type="button" onClick={() => setTrocar(r)}
                          className="text-xs font-medium text-ink/70 hover:text-ink px-2 py-1 rounded hover:bg-ink/5">
                          Trocar tamanho
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}</tbody>
            </table>

            <div className="flex flex-wrap justify-end gap-6 border-t border-borda mt-3 pt-3 text-sm">
              <div className="text-right">
                <div className="text-ink/45 text-[11px] uppercase tracking-wide">Taxas de cartão</div>
                <div className="font-display font-semibold tnum text-alerta">−{brl(totalTaxas)}</div>
              </div>
              <div className="text-right">
                <div className="text-ink/45 text-[11px] uppercase tracking-wide">Recebido (líquido)</div>
                <div className="font-display font-bold tnum">{brl(totalLiquido)}</div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {trocar && (
        <TrocarTamanho pedido={trocar} produtos={produtos}
          onClose={() => setTrocar(null)}
          onSaved={() => { setTrocar(null); carregar() }} />
      )}
    </Page>
  )
}

/* Traduz a excecao crua do banco para uma frase util. A fn_trocar_tamanho
   levanta erros no formato CODIGO|dado|dado, igual ao resto do sistema. */
function mensagemDoErro(bruto) {
  const t = String(bruto || '')
  if (t.includes('Could not find the function') || t.includes('PGRST202')) {
    return 'A função de troca ainda não existe no banco. Rode a migração 0006_troca_tamanho.sql no SQL Editor do Supabase antes de usar esta tela.'
  }
  const m = t.match(/(SEM_ESTOQUE|SEM_PRODUTO|GRADE_INEXISTENTE|PEDIDO_NAO_ENCONTRADO|ITEM_NAO_ENCONTRADO|TAMANHO_INVALIDO)\|?([^"]*)/)
  if (!m) return t || 'Não foi possível concluir a troca.'
  const [, codigo, resto] = m
  const p = (resto || '').split('|')
  if (codigo === 'SEM_ESTOQUE')
    return `Não há estoque suficiente de "${p[0]}" no tamanho ${p[1]} — disponível: ${p[2]}. A troca não foi feita.`
  if (codigo === 'SEM_PRODUTO')
    return `O produto "${p[0]}" não foi encontrado no catálogo. Esse item do pedido não pode ser trocado por aqui.`
  if (codigo === 'GRADE_INEXISTENTE')
    return `O produto "${p[0]}" não tem a grade ${p[1]} cadastrada. Cadastre a grade antes de trocar.`
  if (codigo === 'PEDIDO_NAO_ENCONTRADO') return 'Pedido não encontrado. Atualize a página e tente de novo.'
  if (codigo === 'ITEM_NAO_ENCONTRADO') return 'Item não encontrado no pedido. Atualize a página e tente de novo.'
  return 'Informe um tamanho válido.'
}

function TrocarTamanho({ pedido, produtos, onClose, onSaved }) {
  const itens = pedido.itens || []
  const [idx, setIdx] = useState(0)
  const [novo, setNovo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  const item = itens[idx] || {}
  const prod = produtos.find((p) => String(p.id) === String(item.produto_id))
  const grades = Array.isArray(prod?.tamanhos) ? prod.tamanhos : []
  const estoqueDe = (t) => Number((prod?.estoque || {})[t] ?? 0)
  const qtd = Number(item.qtd) || 0

  // Com o estoque ja fora, a troca so passa se a grade nova tiver pecas.
  const mexeEstoque = Boolean(pedido.estoque_baixado)
  const faltaEstoque = mexeEstoque && novo && estoqueDe(novo) < qtd

  const confirmar = async () => {
    setErro(null); setSalvando(true)
    const { error } = await supabase.rpc('fn_trocar_tamanho', {
      p_pedido_id: pedido.id, p_item_index: idx, p_tamanho_novo: novo,
    })
    setSalvando(false)
    if (error) return setErro(mensagemDoErro(error.message || error.hint))
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title="Trocar tamanho" width="max-w-lg">
      <div className="space-y-3">
        <div className="text-sm text-ink/60">
          Pedido <b className="text-ink">{pedido.codigo || pedido.id}</b>
          {pedido.cliente_nome ? <> · {pedido.cliente_nome}</> : null}
        </div>

        <Field label="Item do pedido">
          <select className={inputCls} value={idx} onChange={(e) => { setIdx(Number(e.target.value)); setNovo(''); setErro(null) }}>
            {itens.map((i, n) => (
              <option key={n} value={n}>
                {i.nome} · {i.tamanho || 'sem tamanho'} · {i.qtd} pç
              </option>
            ))}
          </select>
        </Field>

        {!prod ? (
          <div className="bg-alerta/10 text-alerta text-sm rounded-md p-3">
            Este item não está ligado a um produto do catálogo, então não dá para trocar a grade por aqui.
          </div>
        ) : (
          <>
            <Field label="Trocar para">
              <select className={inputCls} value={novo} onChange={(e) => { setNovo(e.target.value); setErro(null) }}>
                <option value="">Escolha a grade…</option>
                {grades.filter((t) => t !== item.tamanho).map((t) => (
                  <option key={t} value={t}>{t} — {num(estoqueDe(t))} em estoque</option>
                ))}
              </select>
            </Field>

            <div className="border border-borda rounded-md p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-ink/50">Produto</span><b>{prod.nome}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-ink/50">De</span>
                <b>{item.tamanho || '—'} <span className="font-normal text-ink/45">({num(estoqueDe(item.tamanho))} em estoque)</span></b>
              </div>
              <div className="flex justify-between">
                <span className="text-ink/50">Para</span>
                <b>{novo || '—'} {novo && <span className="font-normal text-ink/45">({num(estoqueDe(novo))} em estoque)</span>}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-ink/50">Pares</span><b>{num(qtd)}</b>
              </div>
            </div>

            <p className="text-xs text-ink/45">
              {mexeEstoque
                ? `O estoque deste pedido já saiu. Ao confirmar, ${qtd} par(es) voltam para o tamanho ${item.tamanho || '—'} e saem do tamanho ${novo || 'escolhido'}.`
                : 'O estoque deste pedido ainda não saiu (pedido pendente ou cancelado). A troca só corrige o tamanho registrado, sem mexer no estoque.'}
            </p>

            {faltaEstoque && (
              <div className="bg-sand/15 text-[#8a6b1c] text-sm rounded-md p-3">
                O tamanho {novo} tem {num(estoqueDe(novo))} em estoque e o pedido precisa de {num(qtd)}. A troca vai ser recusada.
              </div>
            )}
          </>
        )}

        {erro && <div className="bg-alerta/10 text-alerta text-sm rounded-md p-3">{erro}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirmar} disabled={!prod || !novo || salvando}>
            {salvando ? 'Trocando…' : 'Confirmar troca'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
