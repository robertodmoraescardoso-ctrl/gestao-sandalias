import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { brl, dataBR, hoje, num } from '../lib/format'
import { Page, PageHeader, Card, Button, Badge, Field, inputCls, Empty } from '../components/ui'
import Modal from '../components/Modal.jsx'

const statusBadge = {
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
  const [editar, setEditar] = useState(null)
  const [cancelar, setCancelar] = useState(null)

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
    supabase.from('produtos').select('id, nome, cod, tamanhos').eq('ativo', true).order('nome').then(({ data }) => setProdutos(data || []))
  }, [])

  const totalPedido = (p) => (p.pedido_compra_itens || []).reduce((s, i) => s + i.quantidade * i.preco_unitario, 0)
  const pendentePedido = (p) => (p.pedido_compra_itens || []).reduce((s, i) => s + (i.quantidade - i.quantidade_recebida), 0)
  const recebidasPedido = (p) => (p.pedido_compra_itens || []).reduce((s, i) => s + (i.quantidade_recebida || 0), 0)
  const atrasado = (p) => p.data_prevista && !['recebido', 'cancelado'].includes(p.status) && new Date(p.data_prevista) < new Date()

  return (
    <Page>
      <PageHeader title="Compras" subtitle="Pedidos ao fornecedor. Ao receber, o estoque entra na loja e a conta a pagar é criada."
        right={<Button onClick={() => setNovo(true)} disabled={!fornecedores.length || !produtos.length}>Novo pedido</Button>} />
      {(!fornecedores.length || !produtos.length) && (
        <div className="bg-sand/15 text-[#8a6b1c] text-sm rounded-md p-3 mb-6">
          Cadastre um fornecedor (aba Cadastros) e tenha produtos no admin da loja para lançar pedidos.
        </div>
      )}

      <Card title="Pedidos de compra">
        {pedidos.length === 0 ? <Empty>Nenhum pedido ainda.</Empty> : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-ink/45 text-xs border-b border-borda">
                <th className="py-2 pr-3">Fornecedor</th><th className="py-2 px-3">Pedido</th>
                <th className="py-2 px-3">Previsão</th><th className="py-2 px-3 text-right">Total</th>
                <th className="py-2 px-3 text-right">Pendente</th><th className="py-2 px-3">Status</th><th className="py-2 pl-3"></th>
              </tr></thead>
              <tbody>{pedidos.map((p) => {
                const [tone, label] = statusBadge[p.status] || ['neutro', p.status]
                const recebidas = recebidasPedido(p)
                return (
                  <tr key={p.id} className="border-b border-borda/50">
                    <td className="py-2 pr-3 font-medium">{p.fornecedores?.nome || '—'}</td>
                    <td className="py-2 px-3 text-ink/60">{dataBR(p.data_pedido)}</td>
                    <td className="py-2 px-3 text-ink/60">{dataBR(p.data_prevista)} {atrasado(p) && <Badge tone="vermelho">atrasado</Badge>}</td>
                    <td className="py-2 px-3 text-right tnum">{brl(totalPedido(p))}</td>
                    <td className="py-2 px-3 text-right tnum">{num(pendentePedido(p))} pç</td>
                    <td className="py-2 px-3"><Badge tone={tone}>{label}</Badge></td>
                    <td className="py-2 pl-3 text-right whitespace-nowrap">
                      <button type="button" onClick={() => setEditar(p)} className="text-xs font-medium text-ink/70 hover:text-ink px-2 py-1 rounded hover:bg-ink/5 mr-1">Editar</button>
                      {recebidas === 0 && p.status !== 'cancelado' && (
                        <button type="button" onClick={() => setCancelar(p)} className="text-xs font-medium text-ink/70 hover:text-alerta px-2 py-1 rounded hover:bg-alerta/5 mr-1">Cancelar</button>
                      )}
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

      {novo && <NovoPedido fornecedores={fornecedores} produtos={produtos} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); load() }} />}
      {editar && <EditarPedido pedido={editar} fornecedores={fornecedores} produtos={produtos} onClose={() => setEditar(null)} onSaved={() => { setEditar(null); load() }} />}
      {cancelar && <CancelarPedido pedido={cancelar} onClose={() => setCancelar(null)} onSaved={() => { setCancelar(null); load() }} />}
      {receber && <Receber pedido={receber} onClose={() => setReceber(null)} onSaved={() => { setReceber(null); load() }} />}
    </Page>
  )
}

function tamanhosDe(produto) {
  const t = produto?.tamanhos
  if (Array.isArray(t)) return t
  return []
}

function NovoPedido({ fornecedores, produtos, onClose, onSaved }) {
  const [forn, setForn] = useState(fornecedores[0]?.id || '')
  const [dataPedido, setDataPedido] = useState(hoje())
  const [prevista, setPrevista] = useState('')
  const [prazo, setPrazo] = useState(fornecedores[0]?.prazo_pagamento_dias || 45)
  const [status, setStatus] = useState('confirmado')
  const [itens, setItens] = useState([{ produto_id: '', tamanho: '', quantidade: '', preco_unitario: '' }])

  const setItem = (i, campo, val) => setItens(itens.map((it, idx) => idx === i ? { ...it, [campo]: val } : it))
  const addItem = () => setItens([...itens, { produto_id: '', tamanho: '', quantidade: '', preco_unitario: '' }])
  const rmItem = (i) => setItens(itens.filter((_, idx) => idx !== i))
  const total = itens.reduce((s, it) => s + (Number(it.quantidade) || 0) * (Number(it.preco_unitario) || 0), 0)

  const salvar = async () => {
    const validos = itens.filter((it) => it.produto_id && it.tamanho && Number(it.quantidade) > 0)
    if (!forn || validos.length === 0) return alert('Escolha o fornecedor e ao menos um item com tamanho.')
    const { data: ped, error } = await supabase.from('pedidos_compra').insert({
      fornecedor_id: forn, data_pedido: dataPedido, data_prevista: prevista || null,
      prazo_pagamento_dias: Number(prazo) || 45, status,
    }).select().single()
    if (error) return alert(error.message)
    const { error: e2 } = await supabase.from('pedido_compra_itens').insert(
      validos.map((it) => ({
        pedido_id: ped.id, produto_id: Number(it.produto_id), tamanho: it.tamanho,
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
              const f = fornecedores.find((x) => String(x.id) === e.target.value)
              if (f) setPrazo(f.prazo_pagamento_dias)
            }}>
              {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </Field>
          <Field label="Status inicial">
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
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

        <div className="border border-borda rounded-md p-3 space-y-2">
          <div className="text-xs text-ink/50">Itens (por tamanho)</div>
          {itens.map((it, i) => {
            const prod = produtos.find((p) => String(p.id) === String(it.produto_id))
            return (
              <div key={i} className="grid grid-cols-[1fr,100px,70px,100px,28px] gap-2 items-center">
                <select className={inputCls} value={it.produto_id} onChange={(e) => setItem(i, 'produto_id', e.target.value)}>
                  <option value="">Produto…</option>
                  {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
                <select className={inputCls} value={it.tamanho} onChange={(e) => setItem(i, 'tamanho', e.target.value)}>
                  <option value="">Tam…</option>
                  {tamanhosDe(prod).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input className={inputCls} type="number" placeholder="Qtd" value={it.quantidade} onChange={(e) => setItem(i, 'quantidade', e.target.value)} />
                <input className={inputCls} type="number" step="0.01" placeholder="Custo un." value={it.preco_unitario} onChange={(e) => setItem(i, 'preco_unitario', e.target.value)} />
                <button className="text-ink/30 hover:text-alerta" onClick={() => rmItem(i)}>×</button>
              </div>
            )
          })}
          <button className="text-sm text-esmeralda" onClick={addItem}>+ adicionar item</button>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-sm text-ink/60">Total: <b className="tnum">{brl(total)}</b></span>
          <div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={salvar}>Salvar pedido</Button></div>
        </div>
      </div>
    </Modal>
  )
}

/* Status que o Roberto escolhe à mão. "Parcialmente recebido" e "Recebido"
   ficam de fora de propósito: quem define esses dois é o banco, no gatilho do
   recebimento. Digitar "Recebido" aqui só troca o rótulo e não traz peça
   nenhuma para o estoque — foi o que aconteceu com o pedido de 14/09. */
const STATUS_OPCOES = [
  ['realizado', 'Realizado'],
  ['confirmado', 'Confirmado'],
  ['em_transito', 'Em trânsito'],
  ['cancelado', 'Cancelado'],
]

const STATUS_AUTOMATICO = {
  parcialmente_recebido: 'Parcialmente recebido (definido pelo recebimento)',
  recebido: 'Recebido (definido pelo recebimento)',
}

function EditarPedido({ pedido, fornecedores, produtos, onClose, onSaved }) {
  const [forn, setForn] = useState(String(pedido.fornecedor_id || ''))
  const [dataPedido, setDataPedido] = useState(pedido.data_pedido || hoje())
  const [prevista, setPrevista] = useState(pedido.data_prevista || '')
  const [prazo, setPrazo] = useState(pedido.prazo_pagamento_dias ?? 45)
  const [status, setStatus] = useState(pedido.status)
  const [obs, setObs] = useState(pedido.observacoes || '')
  const [itens, setItens] = useState(
    (pedido.pedido_compra_itens || [])
      .slice().sort((a, b) => a.id - b.id)
      .map((i) => ({
        id: i.id, produto_id: String(i.produto_id), tamanho: i.tamanho || '',
        quantidade: String(i.quantidade), preco_unitario: String(i.preco_unitario), recebida: i.quantidade_recebida || 0,
      }))
  )
  const [removidos, setRemovidos] = useState([])
  const [salvando, setSalvando] = useState(false)

  const setItem = (i, campo, val) => setItens(itens.map((it, idx) => idx === i ? { ...it, [campo]: val } : it))
  const addItem = () => setItens([...itens, { id: null, produto_id: '', tamanho: '', quantidade: '', preco_unitario: '', recebida: 0 }])
  const rmItem = (i) => {
    const it = itens[i]
    if (it.recebida > 0) return alert('Este item já tem peças recebidas e não pode ser removido. Ajuste a quantidade, se precisar.')
    if (it.id) setRemovidos([...removidos, it.id])
    setItens(itens.filter((_, idx) => idx !== i))
  }
  const total = itens.reduce((s, it) => s + (Number(it.quantidade) || 0) * (Number(it.preco_unitario) || 0), 0)
  const temRecebida = itens.some((it) => it.recebida > 0)

  const salvar = async () => {
    const validos = itens.filter((it) => it.produto_id && it.tamanho && Number(it.quantidade) > 0)
    if (!forn || validos.length === 0) return alert('Escolha o fornecedor e ao menos um item com tamanho.')
    if (validos.length !== itens.length) return alert('Há itens incompletos (produto, tamanho e quantidade). Complete ou remova.')
    setSalvando(true)
    const { error } = await supabase.from('pedidos_compra').update({
      fornecedor_id: Number(forn), data_pedido: dataPedido, data_prevista: prevista || null,
      prazo_pagamento_dias: Number(prazo) || 45, status, observacoes: obs || null,
    }).eq('id', pedido.id)
    if (error) { setSalvando(false); return alert(error.message) }

    for (const id of removidos) {
      const { error: e } = await supabase.from('pedido_compra_itens').delete().eq('id', id)
      if (e) { setSalvando(false); return alert(e.message) }
    }
    for (const it of itens) {
      const dados = {
        produto_id: Number(it.produto_id), tamanho: it.tamanho,
        quantidade: Number(it.quantidade), preco_unitario: Number(it.preco_unitario) || 0,
      }
      const { error: e } = it.id
        ? await supabase.from('pedido_compra_itens').update(dados).eq('id', it.id)
        : await supabase.from('pedido_compra_itens').insert({ ...dados, pedido_id: pedido.id })
      if (e) { setSalvando(false); return alert(e.message) }
    }
    setSalvando(false)
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title="Editar pedido de compra" width="max-w-2xl">
      <div className="space-y-3">
        <div className="bg-sand/15 text-[#8a6b1c] text-sm rounded-md p-3">
          <b>Esta tela não mexe no estoque.</b> Ela corrige os dados do pedido: fornecedor, datas,
          prazo, quantidades pedidas e custo. Quem coloca peça no estoque é o botão <b>Receber</b> da
          lista, e só ele.
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fornecedor">
            <select className={inputCls} value={forn} onChange={(e) => setForn(e.target.value)}>
              {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPCOES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              {STATUS_AUTOMATICO[pedido.status] && (
                <option value={pedido.status}>{STATUS_AUTOMATICO[pedido.status]}</option>
              )}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Data do pedido"><input type="date" className={inputCls} value={dataPedido} onChange={(e) => setDataPedido(e.target.value)} /></Field>
          <Field label="Previsão de entrega"><input type="date" className={inputCls} value={prevista} onChange={(e) => setPrevista(e.target.value)} /></Field>
          <Field label="Prazo pagto (dias)"><input type="number" className={inputCls} value={prazo} onChange={(e) => setPrazo(e.target.value)} /></Field>
        </div>
        <Field label="Observações"><input className={inputCls} value={obs} onChange={(e) => setObs(e.target.value)} /></Field>

        <div className="border border-borda rounded-md p-3 space-y-2">
          <div className="text-xs text-ink/50">Itens (por tamanho)</div>
          {itens.map((it, i) => {
            const prod = produtos.find((p) => String(p.id) === String(it.produto_id))
            const tams = tamanhosDe(prod)
            const tamOpcoes = it.tamanho && !tams.includes(it.tamanho) ? [it.tamanho, ...tams] : tams
            return (
              <div key={it.id ?? 'n' + i} className="grid grid-cols-[1fr,100px,70px,100px,28px] gap-2 items-center">
                <select className={inputCls} value={it.produto_id} onChange={(e) => setItem(i, 'produto_id', e.target.value)}>
                  <option value="">Produto…</option>
                  {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  {it.produto_id && !prod && <option value={it.produto_id}>Produto #{it.produto_id}</option>}
                </select>
                <select className={inputCls} value={it.tamanho} onChange={(e) => setItem(i, 'tamanho', e.target.value)}>
                  <option value="">Tam…</option>
                  {tamOpcoes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input className={inputCls} type="number" min={it.recebida || 0} placeholder="Qtd" value={it.quantidade} onChange={(e) => setItem(i, 'quantidade', e.target.value)} />
                <input className={inputCls} type="number" step="0.01" placeholder="Custo un." value={it.preco_unitario} onChange={(e) => setItem(i, 'preco_unitario', e.target.value)} />
                <button type="button" className="text-ink/30 hover:text-alerta" onClick={() => rmItem(i)}>×</button>
              </div>
            )
          })}
          <button type="button" className="text-sm text-esmeralda" onClick={addItem}>+ adicionar item</button>
        </div>

        {temRecebida && (
          <p className="text-xs text-ink/45">
            Este pedido já tem peças recebidas. Mudar a quantidade ou o custo delas aqui não corrige
            o estoque nem as contas a pagar que já nasceram do recebimento — esse acerto ainda é manual.
          </p>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-sm text-ink/60">Total: <b className="tnum">{brl(total)}</b></span>
          <div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar alterações'}</Button></div>
        </div>
      </div>
    </Modal>
  )
}

/* Cancelamento do pedido de compra.
   NADA é apagado: o pedido e os itens continuam no banco, só mudam de status
   para 'cancelado'. O histórico da compra fica preservado e o pedido sai do
   "em trânsito" do estoque, porque a view v_estoque só conta pedido com status
   confirmado, em trânsito ou parcialmente recebido.
   Só aparece para pedido com ZERO peças recebidas: pedido que já recebeu alguma
   peça gerou entrada de estoque e conta a pagar, e cancelar sem reverter isso
   deixaria o saldo errado.
   Antes isto era uma exclusão em duas etapas (itens e depois pedido). Quando a
   segunda etapa falhava, os itens já tinham sido apagados e não havia como
   recuperá-los. Por isso virou uma única operação que não apaga nada. */
function CancelarPedido({ pedido, onClose, onSaved }) {
  const [salvando, setSalvando] = useState(false)
  const itens = pedido.pedido_compra_itens || []
  const total = itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0)
  const pecas = itens.reduce((s, i) => s + i.quantidade, 0)

  const confirmar = async () => {
    setSalvando(true)
    const { error } = await supabase
      .from('pedidos_compra')
      .update({ status: 'cancelado' })
      .eq('id', pedido.id)
    if (error) {
      setSalvando(false)
      return alert('Não foi possível cancelar o pedido:\n\n' + error.message)
    }
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title="Cancelar pedido de compra" width="max-w-md">
      <div className="space-y-3">
        <p className="text-sm text-ink/70">
          Este pedido vai ficar marcado como cancelado. Nada é apagado: o pedido e os
          itens continuam registrados e podem ser consultados depois.
        </p>
        <div className="border border-borda rounded-md p-3 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-ink/50">Fornecedor</span><b>{pedido.fornecedores?.nome || '—'}</b></div>
          <div className="flex justify-between"><span className="text-ink/50">Data do pedido</span><b>{dataBR(pedido.data_pedido)}</b></div>
          <div className="flex justify-between"><span className="text-ink/50">Previsão</span><b>{dataBR(pedido.data_prevista)}</b></div>
          <div className="flex justify-between"><span className="text-ink/50">Itens</span><b>{itens.length} linha(s), {num(pecas)} pç</b></div>
          <div className="flex justify-between"><span className="text-ink/50">Total</span><b className="tnum">{brl(total)}</b></div>
        </div>
        <p className="text-xs text-ink/45">
          Este pedido não tem nenhuma peça recebida, então nada sai do estoque e nenhuma conta a
          pagar é afetada. Ele deixa de contar como mercadoria em trânsito e some da fila de
          recebimento, mas continua no histórico.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Voltar</Button>
          <Button onClick={confirmar} disabled={salvando}>{salvando ? 'Cancelando…' : 'Cancelar pedido'}</Button>
        </div>
      </div>
    </Modal>
  )
}

function Receber({ pedido, onClose, onSaved }) {
  const itens = pedido.pedido_compra_itens || []
  const [dataRec, setDataRec] = useState(hoje())
  const [qtd, setQtd] = useState(Object.fromEntries(itens.map((i) => [i.id, i.quantidade - i.quantidade_recebida])))

  const salvar = async () => {
    const linhas = itens.map((i) => ({ item: i, q: Number(qtd[i.id]) || 0 })).filter((l) => l.q > 0)
    if (linhas.length === 0) return alert('Informe as quantidades recebidas.')
    const { data: rec, error } = await supabase.from('recebimentos')
      .insert({ pedido_id: pedido.id, data_recebimento: dataRec }).select().single()
    if (error) return alert(error.message)
    const { error: e2 } = await supabase.from('recebimento_itens').insert(
      linhas.map((l) => ({
        recebimento_id: rec.id, pedido_item_id: l.item.id, produto_id: l.item.produto_id,
        tamanho: l.item.tamanho, quantidade: l.q,
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
                  <div className="font-medium">{i.produtos?.nome} <span className="text-ink/50">· {i.tamanho}</span></div>
                  <div className="text-[11px] text-ink/45">pendente: {pend} de {i.quantidade}</div>
                </div>
                <input type="number" min="0" max={pend} className={inputCls + ' !w-24'}
                  value={qtd[i.id]} onChange={(e) => setQtd({ ...qtd, [i.id]: e.target.value })} />
              </div>
            )
          })}
        </div>
        <p className="text-xs text-ink/45">
          Ao salvar: os pares entram no estoque da loja (no tamanho certo), o custo é recalculado e
          nasce uma conta a pagar com vencimento em {pedido.prazo_pagamento_dias} dias.
        </p>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={salvar}>Confirmar recebimento</Button></div>
      </div>
    </Modal>
  )
}
