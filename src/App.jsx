import { useEffect, useState } from 'react'
import { NavLink, Routes, Route, Navigate } from 'react-router-dom'
import { supabase, supabaseConfigured } from './lib/supabaseClient'
import Login from './components/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Compras from './pages/Compras.jsx'
import Estoque from './pages/Estoque.jsx'
import Vendas from './pages/Vendas.jsx'
import Financeiro from './pages/Financeiro.jsx'
import Ativacoes from './pages/Ativacoes.jsx'
import Cadastros from './pages/Cadastros.jsx'

const nav = [
  { to: '/', label: 'Painel', end: true },
  { to: '/compras', label: 'Compras' },
  { to: '/estoque', label: 'Estoque' },
  { to: '/vendas', label: 'Vendas' },
  { to: '/financeiro', label: 'Financeiro' },
  { to: '/ativacoes', label: 'Ativações' },
  { to: '/cadastros', label: 'Cadastros' },
]

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = carregando

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-ink/40 text-sm">Carregando…</div>
  }
  if (!session) return <Login />

  const email = session.user?.email

  return (
    <div className="min-h-screen flex bg-canvas">
      <aside className="w-56 shrink-0 bg-ink text-white/90 flex flex-col">
        <div className="px-5 py-6 border-b border-white/10">
          <div className="font-display text-lg font-bold leading-tight text-white">
            Gestão<span className="text-sand">·</span>Sandálias
          </div>
          <div className="text-[11px] text-white/45 mt-1">central de decisão</div>
        </div>
        <nav className="flex-1 py-3">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) =>
                `block px-5 py-2.5 text-sm transition-colors ${
                  isActive ? 'bg-white/10 text-white border-l-2 border-sand'
                  : 'text-white/60 hover:text-white hover:bg-white/5 border-l-2 border-transparent'}`}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-white/10">
          <div className="text-[11px] text-white/40 mb-2 truncate">{email}</div>
          <button onClick={() => supabase.auth.signOut()}
            className="text-[12px] text-white/60 hover:text-white">Sair</button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/compras" element={<Compras />} />
          <Route path="/estoque" element={<Estoque />} />
          <Route path="/vendas" element={<Vendas />} />
          <Route path="/financeiro" element={<Financeiro />} />
          <Route path="/ativacoes" element={<Ativacoes />} />
          <Route path="/cadastros" element={<Cadastros />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  )
}
