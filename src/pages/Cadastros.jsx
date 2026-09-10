import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { brl } from '../lib/format'
import { Page, PageHeader, Card, Button, Field, inputCls, Empty } from '../components/ui'
import Modal from '../components/Modal.jsx'

export default function Cadastros() {
  const [aba, setAba] = useState('produtos')
  return (
    <Page>
      <PageHeader title="Cadastros" subtitle="Produtos e fornecedores usados em todo o sistema." />
      <div className="flex gap-1 mb-5 bg-white border border-borda rounded-md p-1 w-fit">
        {[['produtos', 'Produtos'], ['fornecedores', 'Fornecedores']].map(([k, l]) => (
          <button key={k} onClick={() => setAba(k)}
            className={`text-sm px-3 py-1.5 rounded ${aba === k ? 'bg-ink text-white' : 'text-ink/60'}`}>{l}</button>
        ))}
      </div>
      {aba === 'produtos' ? <Produtos /> : <Fornecedores />}
    </Page>
  )
}

function Produtos() {
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ nome: '', sku: '', categoria: '', preco_venda: '', estoque_minimo: 5 })

  const load = () => supabase.from('produtos').select('*').order('nome').then(({ data }) => setRows(data || []))
  useEffect(() => { load() }, [])

  const salvar = async () => {
    if (!f.nome) return alert('Informe o nome do produto.')
    const { error } = await supabase.from('produtos').insert({
      nome: f.nome, sku: f.sku || null, categoria: f.categoria || null,
      preco_venda: Number(f.preco_venda) || 0, estoque_minimo: Number(f.estoque_minimo) || 0,
    })
    if (error) return alert(error.message)
    setOpen(false); setF({ nome: '', sku: '', categoria: '', preco_venda: '', estoque_minimo: 5 }); load()
  }

  return (
    <Card title="Produtos" right={<Button onClick={() => setOpen(true)}>Novo produto</Button>}>
      {rows.length === 0 ? <Empty>Cadastre seu primeiro produto.</Empty> : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-ink/45 text-xs border-b border-borda">
            <th className="py-2 pr-3">Nome</th><th className="py-2 px-3">Categoria</th>
            <th className="py-2 px-3 text-right">Custo médio</th><th className="py-2 px-3 text-right">Preço venda</th>
            <th className="py-2 px-3 text-right">Estoque</th>
          </tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-b border-borda/50">
              <td className="py-2 pr-3 font-medium">{r.nome}</td>
              <td className="py-2 px-3 text-ink/60">{r.categoria || '—'}</td>
              <td className="py-2 px-3 text-right tnum">{brl(r.custo_medio)}</td>
              <td className="py-2 px-3 text-right tnum">{brl(r.preco_venda)}</td>
              <td className="py-2 px-3 text-right tnum">{r.estoque_atual}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Novo produto">
        <div className="space-y-3">
          <Field label="Nome"><input className={inputCls} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="SKU (opcional)"><input className={inputCls} value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} /></Field>
            <Field label="Categoria"><input className={inputCls} value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Preço de venda"><input type="number" step="0.01" className={inputCls} value={f.preco_venda} onChange={(e) => setF({ ...f, preco_venda: e.target.value })} /></Field>
            <Field label="Estoque mínimo"><input type="number" className={inputCls} value={f.estoque_minimo} onChange={(e) => setF({ ...f, estoque_minimo: e.target.value })} /></Field>
          </div>
          <p className="text-xs text-ink/45">O custo médio é calculado automaticamente conforme os recebimentos de compra.</p>
          <div className="flex justify-end gap-2 pt-1"><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={salvar}>Salvar produto</Button></div>
        </div>
      </Modal>
    </Card>
  )
}

function Fornecedores() {
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ nome: '', contato: '', prazo_pagamento_dias: 45 })

  const load = () => supabase.from('fornecedores').select('*').order('nome').then(({ data }) => setRows(data || []))
  useEffect(() => { load() }, [])

  const salvar = async () => {
    if (!f.nome) return alert('Informe o nome do fornecedor.')
    const { error } = await supabase.from('fornecedores').insert({
      nome: f.nome, contato: f.contato || null, prazo_pagamento_dias: Number(f.prazo_pagamento_dias) || 45,
    })
    if (error) return alert(error.message)
    setOpen(false); setF({ nome: '', contato: '', prazo_pagamento_dias: 45 }); load()
  }

  return (
    <Card title="Fornecedores" right={<Button onClick={() => setOpen(true)}>Novo fornecedor</Button>}>
      {rows.length === 0 ? <Empty>Cadastre seu primeiro fornecedor.</Empty> : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-ink/45 text-xs border-b border-borda">
            <th className="py-2 pr-3">Nome</th><th className="py-2 px-3">Contato</th><th className="py-2 px-3 text-right">Prazo (dias)</th>
          </tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-b border-borda/50">
              <td className="py-2 pr-3 font-medium">{r.nome}</td>
              <td className="py-2 px-3 text-ink/60">{r.contato || '—'}</td>
              <td className="py-2 px-3 text-right tnum">{r.prazo_pagamento_dias}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Novo fornecedor">
        <div className="space-y-3">
          <Field label="Nome"><input className={inputCls} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Field>
          <Field label="Contato"><input className={inputCls} value={f.contato} onChange={(e) => setF({ ...f, contato: e.target.value })} /></Field>
          <Field label="Prazo de pagamento (dias)"><input type="number" className={inputCls} value={f.prazo_pagamento_dias} onChange={(e) => setF({ ...f, prazo_pagamento_dias: e.target.value })} /></Field>
          <p className="text-xs text-ink/45">Esse prazo define o vencimento do boleto: data do recebimento + prazo.</p>
          <div className="flex justify-end gap-2 pt-1"><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={salvar}>Salvar fornecedor</Button></div>
        </div>
      </Modal>
    </Card>
  )
}
