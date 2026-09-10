import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { brl, dataBR, hoje } from '../lib/format'
import { Page, PageHeader, Card, Button, Badge, Kpi, Field, inputCls, Empty } from '../components/ui'
import Modal from '../components/Modal.jsx'

const tipoBadge = { doacao: ['amarelo', 'Doação'], pagamento: ['azul', 'Pagamento'], misto: ['verde', 'Misto'] }

export default function Ativacoes() {
  const [rows, setRows] = useState([])
  const [produtos, setProdutos] = useState([])
  const [open, setOpen] = useState(false)

  const load = async () => {
    const { data } = await supabase.from('ativacoes')
      .select('*, ativacao_itens(*, produtos(nome, custo_medio))')
      .order('data', { ascending: false })
    setRows(data || [])
  }
  useEffect(() => {
    load()
    supabase.from('produtos').select('*').eq('ativo', true).order('nome').then(({ data }) => setProdutos(data || []))
  }, [])

  const custoDoacao = (a) => (a.ativacao_itens || []).reduce((s, i) => s + i.quantidade * (i.produtos?.custo_medio || 0), 0)
  const custoTotal = (a) => Number(a.valor_pago || 0) + custoDoacao(a)
  const totalGeral = rows.reduce((s, a) => s + custoTotal(a), 0)

  return (
    <Page>
      <PageHeader title="Ativações / Marketing"
        subtitle="Doação de sandálias e pagamento a influenciadores. Doações saem do estoque como marketing, não como venda."
        right={<Button onClick={() => setOpen(true)}>Nova ativação</Button>} />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <Kpi label="Investido em ativações" value={brl(totalGeral)} big />
        <Kpi label="Nº de ativações" value={rows.length} />
        <Kpi label="Sandálias doadas" value={rows.reduce((s, a) => s + (a.ativacao_itens || []).reduce((x, i) => x + i.quantidade, 0), 0)} />
      </div>

      <Card title="Ativações">
        {rows.length === 0 ? <Empty>Nenhuma ativação registrada.</Empty> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-ink/45 text-xs border-b border-borda">
              <th className="py-2 pr-3">Data</th><th className="py-2 px-3">Ativação</th>
              <th className="py-2 px-3">Tipo</th><th className="py-2 px-3">Beneficiário</th>
              <th className="py-2 px-3">Cupom</th><th className="py-2 px-3 text-right">Custo total</th>
            </tr></thead>
            <tbody>{rows.map((a) => {
              const [tone, label] = tipoBadge[a.tipo] || ['neutro', a.tipo]
              return (
                <tr key={a.id} className="border-b border-borda/50">
                  <td className="py-2 pr-3 text-ink/60">{dataBR(a.data)}</td>
                  <td className="py-2 px-3 font-medium">{a.nome}</td>
                  <td className="py-2 px-3"><Badge tone={tone}>{label}</Badge></td>
                  <td className="py-2 px-3 text-ink/60">{a.beneficiario || '—'}</td>
                  <td className="py-2 px-3 text-ink/50">{a.cupom || '—'}</td>
                  <td className="py-2 px-3 text-right tnum">{brl(custoTotal(a))}</td>
                </tr>
              )
            })}</tbody>
          </table>
        )}
      </Card>

      {open && <NovaAtivacao produtos={produtos} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load() }} />}
    </Page>
  )
}

function NovaAtivacao({ produtos, onClose, onSaved }) {
  const [f, setF] = useState({
    nome: '', tipo: 'misto', data: hoje(), beneficiario: '',
    valor_pago: '', forma_pagamento: '', objetivo: '', cupom: '',
  })
  const [itens, setItens] = useState([])

  const addItem = () => setItens([...itens, { produto_id: '', quantidade: '' }])
  const setItem = (i, c, v) => setItens(itens.map((it, idx) => idx === i ? { ...it, [c]: v } : it))
  const rmItem = (i) => setItens(itens.filter((_, idx) => idx !== i))

  const salvar = async () => {
    if (!f.nome) return alert('Dê um nome à ativação.')
    const { data: at, error } = await supabase.from('ativacoes').insert({
      nome: f.nome, tipo: f.tipo, data: f.data, beneficiario: f.beneficiario || null,
      valor_pago: Number(f.valor_pago) || 0, forma_pagamento: f.forma_pagamento || null,
      objetivo: f.objetivo || null, cupom: f.cupom || null,
    }).select().single()
    if (error) return alert(error.message)
    const validos = itens.filter((it) => it.produto_id && Number(it.quantidade) > 0)
    if (validos.length) {
      const { error: e2 } = await supabase.from('ativacao_itens').insert(
        validos.map((it) => ({ ativacao_id: at.id, produto_id: it.produto_id, quantidade: Number(it.quantidade) }))
      )
      if (e2) return alert(e2.message)
    }
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title="Nova ativação" width="max-w-2xl">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome da ativação"><input className={inputCls} placeholder="Envio para @fulana" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Field>
          <Field label="Tipo">
            <select className={inputCls} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
              <option value="doacao">Doação de produto</option>
              <option value="pagamento">Pagamento a influenciador</option>
              <option value="misto">Misto (pagamento + doação)</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Data"><input type="date" className={inputCls} value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></Field>
          <Field label="Beneficiário / @"><input className={inputCls} value={f.beneficiario} onChange={(e) => setF({ ...f, beneficiario: e.target.value })} /></Field>
          <Field label="Cupom (p/ medir retorno)"><input className={inputCls} value={f.cupom} onChange={(e) => setF({ ...f, cupom: e.target.value })} /></Field>
        </div>
        {f.tipo !== 'doacao' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor pago"><input type="number" step="0.01" className={inputCls} value={f.valor_pago} onChange={(e) => setF({ ...f, valor_pago: e.target.value })} /></Field>
            <Field label="Forma de pagamento"><input className={inputCls} value={f.forma_pagamento} onChange={(e) => setF({ ...f, forma_pagamento: e.target.value })} /></Field>
          </div>
        )}

        {f.tipo !== 'pagamento' && (
          <div className="border border-borda rounded-md p-3 space-y-2">
            <div className="text-xs text-ink/50">Sandálias doadas (saem do estoque como marketing)</div>
            {itens.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr,80px,32px] gap-2 items-center">
                <select className={inputCls} value={it.produto_id} onChange={(e) => setItem(i, 'produto_id', e.target.value)}>
                  <option value="">Produto…</option>
                  {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome} (est. {p.estoque_atual})</option>)}
                </select>
                <input className={inputCls} type="number" placeholder="Qtd" value={it.quantidade} onChange={(e) => setItem(i, 'quantidade', e.target.value)} />
                <button className="text-ink/30 hover:text-alerta" onClick={() => rmItem(i)}>×</button>
              </div>
            ))}
            <button className="text-sm text-esmeralda" onClick={addItem}>+ adicionar sandália</button>
          </div>
        )}

        <Field label="Objetivo / observação"><input className={inputCls} value={f.objetivo} onChange={(e) => setF({ ...f, objetivo: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={salvar}>Salvar ativação</Button></div>
      </div>
    </Modal>
  )
}
