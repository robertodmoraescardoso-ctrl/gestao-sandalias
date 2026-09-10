import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Page, PageHeader, Card, Button, Field, inputCls, Empty } from '../components/ui'
import Modal from '../components/Modal.jsx'

export default function Cadastros() {
  return (
    <Page>
      <PageHeader title="Cadastros" subtitle="Fornecedores usados nas compras. Produtos são cadastrados no admin da loja." />
      <div className="bg-white border border-borda rounded-md p-3 mb-5 text-sm text-ink/60">
        Os produtos do seu catálogo ficam no <b>painel de administração da loja</b> (com foto, tamanhos e estoque).
        Aqui você gerencia apenas os fornecedores das suas compras.
      </div>
      <Fornecedores />
    </Page>
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
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={salvar}>Salvar fornecedor</Button></div>
        </div>
      </Modal>
    </Card>
  )
}
