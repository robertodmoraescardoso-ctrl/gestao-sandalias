import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState(null)
  const [carregando, setCarregando] = useState(false)

  const entrar = async (e) => {
    e.preventDefault()
    setErro(null)
    setCarregando(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    setCarregando(false)
    if (error) setErro('E-mail ou senha incorretos.')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink p-4">
      <form onSubmit={entrar} className="bg-white rounded-xl border border-borda w-full max-w-sm p-7">
        <div className="font-display text-xl font-bold text-ink mb-1">
          Gestão<span className="text-sand">·</span>Sandálias
        </div>
        <p className="text-sm text-ink/50 mb-6">Entre para acessar o painel.</p>

        <label className="block mb-3">
          <span className="block text-xs text-ink/60 mb-1">E-mail</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-borda rounded-md px-3 py-2 text-sm focus:outline-none focus:border-ink/40" />
        </label>
        <label className="block mb-4">
          <span className="block text-xs text-ink/60 mb-1">Senha</span>
          <input type="password" required value={senha} onChange={(e) => setSenha(e.target.value)}
            className="w-full border border-borda rounded-md px-3 py-2 text-sm focus:outline-none focus:border-ink/40" />
        </label>

        {erro && <div className="text-alerta text-sm mb-3">{erro}</div>}

        <button type="submit" disabled={carregando}
          className="w-full bg-ink text-white text-sm font-medium py-2.5 rounded-md hover:bg-panel disabled:opacity-50">
          {carregando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
