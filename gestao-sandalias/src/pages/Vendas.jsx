import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { brl, dataBR, hoje, num } from '../lib/format'
import { Page, PageHeader, Card, Button, Field, inputCls, Empty } from '../components/ui'
import Modal from '../components/Modal.jsx'

export default function Vendas() {
  const [vendas, setVendas] = useState([])
  const [produtos, setProdutos] = useState([])
  const [novo, setNovo] = useState(false)

  const load = async () => {
    const { data } = await supabase.from('vendas')
      .select('*, venda_itens(*, produtos(nome))')
      .order('data_venda', { ascending: false }).limit(100)
    setVendas(data || [])
  }
  useEffect(() => {
    load()
    supabase.from('produtos').select('*').eq('ativo', true).order('nome').then(({ data }) => setProdutos(data || []))
  }, [])

  const totalVenda = (v) => (v.venda_itens || []).reduce((s, i) => s + i.quantidade * i.preco_unitario, 0)
  const lucroVenda = (v) => (v.venda_itens || []).reduce((s, i) => s + i.quantidade * (i.preco_unitario - (i.custo_unitario || 0)), 0)

  return (
    <Page>
      <PageHeader title="Vendas" subtitle="Cada venda baixa o estoque e registra o custo (CMV) automaticamente."
        right={<Button onClick={() => setNovo(true)} disabled={!produtos.length}>Nova venda</Button>} />
      {!produtos.length && (
        <div className="bg-sand/15 text-[#8a6b1c] text-sm rounded-md p-3 mb-6">Cadastre produtos antes de vender.</div>
      )}

      <Card title="Vendas recentes">
        {vendas.length === 0 ? <Empty>Nenhuma venda registrada.</Empty> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-ink/45 text-xs border-b border-borda">
              <th className="py-2 pr-3">Data</th><th className="py-2 px-3">Cliente</th>
              <th className="py-2 px-3">Itens</th><th className="py-2 px-3 text-right">Total</th>
              <th className="py-2 px-3 text-right">Lucro bruto</th><th className="py-2 px-3">Cupom</th>
            </tr></thead>
            <tbody>{vendas.map((v) => (
              <tr key={v.id} className="border-b border-borda/50">
                <td className="py-2 pr-3 text-ink/60">{dataBR(v.data_venda)}</td>
                <td className="py-2 px-3">{v.cliente || '—'}</td>
                <td className="py-2 px-3 text-ink/60">
                  {(v.venda_itens || []).map((i) => `${i.produtos?.nome} ×${i.quantidade}`).join(', ')}
                </td>
                <td className="py-2 px-3 text-right tnum">{brl(totalVenda(v))}</td>
                <td className="py-2 px-3 text-right tnum text-esmeralda">{brl(lucroVenda(v))}</td>
                <td className="py-2 px-3 text-ink/50">{v.cupom || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>

      {novo && <NovaVenda produtos={produtos} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); load() }} />}
    </Page>
  )
}

function NovaVenda({ produtos, onClose, onSaved }) {
  const [data, setData] = useState(hoje())
  const [cliente, setCliente] = useState('')
  const [cupom, setCupom] = useState('')
  const [itens, setItens] = useState([{ produto_id: '', quantidade: '', preco_unitario: '' }])

  const setItem = (i, campo, val) => setItens(itens.map((it, idx) => {
    if (idx !== i) return it
    const novo = { ...it, [campo]: val }
    if (campo === 'produto_id') {
      const p = produtos.find((x) => x.id === val)
      if (p && !novo.preco_unitario) novo.preco_unitario = p.preco_venda
    }
    return novo
  }))
  const addItem = () => setItens([...itens, { produto_id: '', quantidade: '', preco_unitario: '' }])
  const rmItem = (i) => setItens(itens.filter((_, idx) => idx !== i))
  const total = itens.reduce((s, it) => s + (Number(it.quantidade) || 0) * (Number(it.preco_unitario) || 0), 0)

  const salvar = async () => {
    const validos = itens.filter((it) => it.produto_id && Number(it.quantidade) > 0)
    if (validos.length === 0) return alert('Adicione ao menos um item.')
    const { data: venda, error } = await supabase.from('vendas')
      .insert({ data_venda: data, cliente: cliente || null, cupom: cupom || null }).select().single()
    if (error) return alert(error.message)
    const { error: e2 } = await supabase.from('venda_itens').insert(
      validos.map((it) => ({
        venda_id: venda.id, produto_id: it.produto_id,
        quantidade: Number(it.quantidade), preco_unitario: Number(it.preco_unitario) || 0,
      }))
    )
    if (e2) return alert(e2.message)
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title="Nova venda" width="max-w-2xl">
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Data"><input type="date" className={inputCls} value={data} onChange={(e) => setData(e.target.value)} /></Field>
          <Field label="Cliente (opcional)"><input className={inputCls} value={cliente} onChange={(e) => setCliente(e.target.value)} /></Field>
          <Field label="Cupom / ativação"><input className={inputCls} placeholder="ex.: FULANA10" value={cupom} onChange={(e) => setCupom(e.target.value)} /></Field>
        </div>
        <div className="border border-borda rounded-md p-3 space-y-2">
          {itens.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr,80px,110px,32px] gap-2 items-center">
              <select className={inputCls} value={it.produto_id} onChange={(e) => setItem(i, 'produto_id', e.target.value)}>
                <option value="">Produto…</option>
                {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome} (est. {p.estoque_atual})</option>)}
              </select>
              <input className={inputCls} type="number" placeholder="Qtd" value={it.quantidade} onChange={(e) => setItem(i, 'quantidade', e.target.value)} />
              <input className={inputCls} type="number" step="0.01" placeholder="Preço" value={it.preco_unitario} onChange={(e) => setItem(i, 'preco_unitario', e.target.value)} />
              <button className="text-ink/30 hover:text-alerta" onClick={() => rmItem(i)}>×</button>
            </div>
          ))}
          <button className="text-sm text-esmeralda" onClick={addItem}>+ adicionar item</button>
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="text-sm text-ink/60">Total: <b className="tnum">{brl(total)}</b></span>
          <div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={salvar}>Registrar venda</Button></div>
        </div>
      </div>
    </Modal>
  )
}
