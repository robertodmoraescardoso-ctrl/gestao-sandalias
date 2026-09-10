import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { brl, dataBR, hoje, num } from '../lib/format'
import { Page, PageHeader, Card, Button, Badge, Field, inputCls, Empty } from '../components/ui'
import Modal from '../components/Modal.jsx'

const statusBadge = {
  realizado: ['neutro', 'Realizado'],
  confirmado: ['azul', 'Confirmado'],
  em_transito: ['azul', 'Em trânsito'],
  parcialmente_recebido: ['amarelo', 'Parcial'],
  recebido: ['verde', 'Recebido'],
  cancelado: ['vermelho', 'Cancelado'],
}

export default function Compras() {
  const [pedidos, setPedidos] = useState([])
  const [fornecedores, setFornecedores] = useState([])
  const [produtos, setProdutos] = useState([])
  const [novo, setNovo] = useState(false)
  const [receber, setReceber] = useState(null)

  const load = async () => {
    const { data } = await supabase
      .from('pedidos_compra')
      .select('*, fornecedores(nome), pedido_compra_itens(*, produtos(nome))')
      .order('data_pedido', { ascending: false })
    setPedidos(data || [])
  }
  useEffect(() => {
    load()
    supabase.from('fornecedores').select('*').order('nome').then(({ data }) => setFornecedores(data || []))
    supabase.from('produtos').select('*').eq('ativo', true).order('nome').then(({ data }) => setProdutos(data || []))
  }, [])

  const totalPedido = (p) =>
    (p.pedido_compra_itens || []).reduce((s, i) => s + i.quantidade * i.preco_unitario, 0)
  const pendentePedido = (p) =>
    (p.pedido_compra_itens || []).reduce((s, i) => s + (i.quantidade - i.quantidade_recebida), 0)

  const atrasado = (p) =>
    p.data_prevista && p.status !== 'recebido' && p.status !== 'cancelado' &&
    new Date(p.data_prevista) < new Date()

  return (
    <Page>
      <PageHeader
        title="Compras"
        subtitle="Pedidos ao fornecedor, mercadoria em trânsito e recebimentos."
        right={<Button onClick={() => setNovo(true)} disabled={!fornecedores.length || !produtos.length}>Novo pedido</Button>}
      />
      {(!fornecedores.length || !produtos.length) && (
        <div className="bg-sand/15 text-[#8a6b1c] text-sm rounded-md p-3 mb-6">
          Cadastre ao menos um fornecedor e um produto (aba Cadastros) para lançar pedidos.
        </div>
      )}

      <Card title="Pedidos de compra">
        {pedidos.length === 0 ? <Empty>Nenhum pedido ainda.</Empty> : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-ink/45 text-xs border-b border-borda">
                <th className="py-2 pr-3">Fornecedor</th><th className="py-2 px-3">Pedido</th>
                <th className="py-2 px-3">Previsão</th><th className="py-2 px-3 text-right">Total</th>
                <th className="py-2 px-3 text-right">Pendente</th><th className="py-2 px-3">Status</th>
                <th className="py-2 pl-3"></th>
              </tr></thead>
              <tbody>{pedidos.map((p) => {
                const [tone, label] = statusBadge[p.status] || ['neutro', p.status]
                return (
                  <tr key={p.id} className="border-b border-borda/50">
                    <td className="py-2 pr-3 font-medium">{p.fornecedores?.nome || '—'}</td>
                    <td className="py-2 px-3 text-ink/60">{dataBR(p.data_pedido)}</td>
                    <td className="py-2 px-3 text-ink/60">
                      {dataBR(p.data_prevista)} {atrasado(p) && <Badge tone="vermelho">atrasado</Badge>}
                    </td>
                    <td className="py-2 px-3 text-right tnum">{brl(totalPedido(p))}</td>
                    <td className="py-2 px-3 text-right tnum">{num(pendentePedido(p))} pç</td>
                    <td className="py-2 px-3"><Badge tone={tone}>{label}</Badge></td>
                    <td className="py-2 pl-3 text-right">
                      {pendentePedido(p) > 0 && p.status !== 'cancelado' && (
                        <Button variant="ghost" onClick={() => setReceber(p)}>Receber</Button>
                      )}
                    </td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
        )}
      </Card>

      {novo && (
        <NovoPedido
          fornecedores={fornecedores} produtos={produtos}
          onClose={() => setNovo(false)}
          onSaved={() => { setNovo(false); load() }}
        />
      )}
      {receber && (
        <Receber
          pedido={receber}
          onClose={() => setReceber(null)}
          onSaved={() => { setReceber(null); load() }}
        />
      )}
    </Page>
  )
}

function NovoPedido({ fornecedores, produtos, onClose, onSaved }) {
  const [forn, setForn] = useState(fornecedores[0]?.id || '')
  const [dataPedido, setDataPedido] = useState(hoje())
  const [prevista, setPrevista] = useState('')
  const [prazo, setPrazo] = useState(fornecedores[0]?.prazo_pagamento_dias || 45)
  const [status, setStatus] = useState('confirmado')
  const [itens, setItens] = useState([{ produto_id: '', quantidade: '', preco_unitario: '' }])

  const setItem = (i, campo, val) => setItens(itens.map((it, idx) => idx === i ? { ...it, [campo]: val } : it))
  const addItem = () => setItens([...itens, { produto_id: '', quantidade: '', preco_unitario: '' }])
  const rmItem = (i) => setItens(itens.filter((_, idx) => idx !== i))
  const total = itens.reduce((s, it) => s + (Number(it.quantidade) || 0) * (Number(it.preco_unitario) || 0), 0)

  const salvar = async () => {
    const validos = itens.filter((it) => it.produto_id && Number(it.quantidade) > 0)
    if (!forn || validos.length === 0) return alert('Escolha o fornecedor e ao menos um item.')
    const { data: ped, error } = await supabase.from('pedidos_compra').insert({
      fornecedor_id: forn, data_pedido: dataPedido, data_prevista: prevista || null,
      prazo_pagamento_dias: Number(prazo) || 45, status,
    }).select().single()
    if (error) return alert(error.message)
    const { error: e2 } = await supabase.from('pedido_compra_itens').insert(
      validos.map((it) => ({
        pedido_id: ped.id, produto_id: it.produto_id,
        quantidade: Number(it.quantidade), preco_unitario: Number(it.preco_unitario) || 0,
      }))
    )
    if (e2) return alert(e2.message)
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title="Novo pedido de compra" width="max-w-2xl">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fornecedor">
            <select className={inputCls} value={forn} onChange={(e) => {
              setForn(e.target.value)
              const f = fornecedores.find((x) => x.id === e.target.value)
              if (f) setPrazo(f.prazo_pagamento_dias)
            }}>
              {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </Field>
          <Field label="Status inicial">
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="realizado">Pedido realizado</option>
              <option value="confirmado">Confirmado</option>
              <option value="em_transito">Em trânsito</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Data do pedido"><input type="date" className={inputCls} value={dataPedido} onChange={(e) => setDataPedido(e.target.value)} /></Field>
          <Field label="Previsão de entrega"><input type="date" className={inputCls} value={prevista} onChange={(e) => setPrevista(e.target.value)} /></Field>
          <Field label="Prazo pagto (dias)"><input type="number" className={inputCls} value={prazo} onChange={(e) => setPrazo(e.target.value)} /></Field>
        </div>

        <div className="border border-borda rounded-md">
          <div className="px-3 py-2 text-xs text-ink/50 border-b border-borda">Itens</div>
          <div className="p-3 space-y-2">
            {itens.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr,80px,110px,32px] gap-2 items-center">
                <select className={inputCls} value={it.produto_id} onChange={(e) => setItem(i, 'produto_id', e.target.value)}>
                  <option value="">Produto…</option>
                  {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
                <input className={inputCls} type="number" placeholder="Qtd" value={it.quantidade} onChange={(e) => setItem(i, 'quantidade', e.target.value)} />
                <input className={inputCls} type="number" step="0.01" placeholder="Preço un." value={it.preco_unitario} onChange={(e) => setItem(i, 'preco_unitario', e.target.value)} />
                <button className="text-ink/30 hover:text-alerta" onClick={() => rmItem(i)}>×</button>
              </div>
            ))}
            <button className="text-sm text-esmeralda" onClick={addItem}>+ adicionar item</button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-sm text-ink/60">Total do pedido: <b className="tnum">{brl(total)}</b></span>
          <div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={salvar}>Salvar pedido</Button></div>
        </div>
      </div>
    </Modal>
  )
}

function Receber({ pedido, onClose, onSaved }) {
  const itens = pedido.pedido_compra_itens || []
  const [dataRec, setDataRec] = useState(hoje())
  const [qtd, setQtd] = useState(
    Object.fromEntries(itens.map((i) => [i.id, i.quantidade - i.quantidade_recebida]))
  )

  const salvar = async () => {
    const linhas = itens
      .map((i) => ({ item: i, q: Number(qtd[i.id]) || 0 }))
      .filter((l) => l.q > 0)
    if (linhas.length === 0) return alert('Informe as quantidades recebidas.')
    const { data: rec, error } = await supabase.from('recebimentos')
      .insert({ pedido_id: pedido.id, data_recebimento: dataRec }).select().single()
    if (error) return alert(error.message)
    const { error: e2 } = await supabase.from('recebimento_itens').insert(
      linhas.map((l) => ({
        recebimento_id: rec.id, pedido_item_id: l.item.id,
        produto_id: l.item.produto_id, quantidade: l.q,
      }))
    )
    if (e2) return alert(e2.message)
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title="Registrar recebimento" width="max-w-xl">
      <div className="space-y-3">
        <Field label="Data do recebimento">
          <input type="date" className={inputCls + ' !w-48'} value={dataRec} onChange={(e) => setDataRec(e.target.value)} />
        </Field>
        <div className="border border-borda rounded-md divide-y divide-borda">
          {itens.map((i) => {
            const pend = i.quantidade - i.quantidade_recebida
            return (
              <div key={i.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{i.produtos?.nome}</div>
                  <div className="text-[11px] text-ink/45">pendente: {pend} de {i.quantidade}</div>
                </div>
                <input type="number" min="0" max={pend} className={inputCls + ' !w-24'}
                  value={qtd[i.id]} onChange={(e) => setQtd({ ...qtd, [i.id]: e.target.value })} />
              </div>
            )
          })}
        </div>
        <p className="text-xs text-ink/45">
          Ao salvar: os produtos entram no estoque, o custo médio é recalculado e uma conta a pagar é
          criada com vencimento em {pedido.prazo_pagamento_dias} dias.
        </p>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={salvar}>Confirmar recebimento</Button></div>
      </div>
    </Modal>
  )
}
