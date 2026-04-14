import React, { useEffect, useMemo, useRef, useState } from 'react'
import { BrandWordmark } from './Brand.jsx'
import { Search, Trophy, Store, Bot, ScanSearch, ArrowRight, Layers3, Sparkles, Settings2, Activity, Database, BarChart3, ShieldCheck } from 'lucide-react'

const ADMIN_TOKEN_KEY = 'kauvio_admin_token'

function routeNow() {
  return window.location.hash.replace(/^#/, '') || '/'
}

function parseSearchRoute(route) {
  const match = route.match(/^\/search(?:\?q=(.*))?$/)
  return decodeURIComponent(match?.[1] || '')
}

function readAdminToken() {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || sessionStorage.getItem(ADMIN_TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

function persistAdminToken(token) {
  try {
    if (token) {
      localStorage.setItem(ADMIN_TOKEN_KEY, token)
      sessionStorage.setItem(ADMIN_TOKEN_KEY, token)
    } else {
      localStorage.removeItem(ADMIN_TOKEN_KEY)
      sessionStorage.removeItem(ADMIN_TOKEN_KEY)
    }
  } catch {}
}

async function api(url, options = {}) {
  const token = readAdminToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }
  if (token && url.startsWith('/api/admin')) headers.Authorization = `Bearer ${token}`
  const res = await fetch(url, { ...options, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || 'Fehler')
    err.status = res.status
    throw err
  }
  return data
}

function formatPrice(value) {
  return value != null ? `CHF ${Number(value).toFixed(2)}` : '—'
}

function formatDate(value) {
  if (!value) return '-'
  try { return new Date(value).toLocaleString('de-CH') } catch { return String(value) }
}

function toneFromLabel(label = '', offerCount = 0) {
  const lower = String(label || '').toLowerCase()
  if (lower.includes('top') || lower.includes('best')) return 'tone-red'
  if (offerCount >= 3) return 'tone-slate'
  return 'tone-blue'
}

function iconFromLabel(label = '', offerCount = 0) {
  const lower = String(label || '').toLowerCase()
  if (lower.includes('top') || lower.includes('best')) return Trophy
  if (offerCount >= 3) return Store
  return Bot
}

function Header() {
  return (
    <header className="topbar brand-topbar">
      <a className="brand-link" href="#/">
        <BrandWordmark small align="left" withTagline={false} />
      </a>
      <nav className="nav-pills">
        <a href="#/">Start</a>
        <a href="#/search?q=iPhone%2016%20Pro">Suche</a>
        <a href="#/admin">Admin</a>
      </nav>
    </header>
  )
}

function SearchCard({ item }) {
  const label = item.decision?.label || item.deal_label || 'Live KI'
  const tone = toneFromLabel(label, item.offer_count || 0)
  const Icon = iconFromLabel(label, item.offer_count || 0)
  return (
    <a className="result-card" href={`#/product/${item.slug}`}>
      <div className="result-card-top">
        <span className={`chip ${tone}`}><Icon size={14} /> {label}</span>
        <span className="muted small">{item.offer_count || 0} Shops</span>
      </div>
      <div className="result-card-title">{item.title}</div>
      <div className="result-card-meta">{item.brand || '—'} · {item.category || 'Produkt'} · {item.shop_name || 'KI Index'}</div>
      <div className="result-card-bottom">
        <div>
          <strong className="price-inline">{formatPrice(item.price)}</strong>
          <div className="muted small">Bester Preis aktuell</div>
        </div>
        <span className="arrow-circle"><ArrowRight size={16} /></span>
      </div>
    </a>
  )
}

function SuggestionPills({ items = [], title }) {
  if (!items.length) return null
  return (
    <section className="card-panel">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          <p className="muted no-margin">Weitere Vorschläge aus dem KI Index.</p>
        </div>
      </div>
      <div className="pill-cloud">
        {items.map((item, index) => (
          <a key={`${item.slug || item}-${index}`} className="suggest-pill" href={item.slug ? `#/product/${item.slug}` : `#/search?q=${encodeURIComponent(item)}`}>
            {item.title || item}
          </a>
        ))}
      </div>
    </section>
  )
}

function SearchPage({ route }) {
  const initialQuery = useMemo(() => parseSearchRoute(route), [route])
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState([])
  const [similarItems, setSimilarItems] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [liveSearch, setLiveSearch] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const pollRef = useRef(null)

  useEffect(() => {
    setQuery(initialQuery)
  }, [initialQuery])

  useEffect(() => {
    const cleaned = String(initialQuery || '').trim()
    if (!cleaned) return
    setLoading(true)
    setError('')
    api(`/api/products?q=${encodeURIComponent(cleaned)}`)
      .then((data) => {
        setResults(data.items || [])
        setSimilarItems(data.similarItems || [])
        setSuggestions(data.suggestions || [])
        setLiveSearch(data.liveSearch || null)
      })
      .catch((err) => setError(err.message || 'Suche fehlgeschlagen'))
      .finally(() => setLoading(false))
  }, [initialQuery])

  useEffect(() => {
    if (!liveSearch?.query || results.length > 0) {
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = null
      return
    }
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const data = await api(`/api/products?q=${encodeURIComponent(liveSearch.query)}`)
        setResults(data.items || [])
        setSimilarItems(data.similarItems || [])
        setSuggestions(data.suggestions || [])
        setLiveSearch(data.liveSearch || null)
        if ((data.items || []).length > 0) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      } catch {}
    }, 8000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [liveSearch?.query, results.length])

  function runSearch(nextQuery) {
    const cleaned = String(nextQuery || '').trim()
    if (!cleaned) return
    window.location.hash = `/search?q=${encodeURIComponent(cleaned)}`
  }

  return (
    <main className="page-shell search-shell-page">
      <section className="hero-panel compact-hero">
        <BrandWordmark small />
        <h1 className="search-title">Suchergebnis UX mit KI-Vergleich</h1>
        <p className="hero-text">Der Hauptvergleich vorne. Ähnliche Produkte und weitere Vorschläge darunter.</p>
        <div className="search-inline-shell">
          <Search className="search-inline-icon" size={18} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') runSearch(query) }} placeholder="Produkt suchen" />
          <button className="btn btn-primary" onClick={() => runSearch(query)}>Suchen</button>
        </div>
        <div className="status-row top-margin-sm">
          <span className="status-chip tone-red"><Trophy size={14} /> Bestpreis</span>
          <span className="status-chip tone-slate"><Store size={14} /> Schweizer Shops</span>
          <span className="status-chip tone-blue"><ScanSearch size={14} /> KI Match aktiv</span>
        </div>
      </section>

      {liveSearch ? <section className="info-panel tone-panel-blue"><p className="no-margin">{liveSearch.userVisibleNote || 'Live-Suche läuft im Hintergrund.'}</p></section> : null}
      {error ? <section className="info-panel tone-panel-red"><p className="no-margin">{error}</p></section> : null}

      <section className="results-section">
        <div className="section-head">
          <div>
            <h2>Vergleich</h2>
            <p className="muted no-margin">Aktuelle Haupttreffer für deine Suche.</p>
          </div>
        </div>
        {loading ? (
          <div className="empty-state"><h3>Suche läuft</h3><p>Die KI bereitet Resultate vor.</p></div>
        ) : results.length ? (
          <div className="results-grid search-results-grid">
            {results.map((item) => <SearchCard key={item.slug} item={item} />)}
          </div>
        ) : (
          <div className="empty-state"><h3>Noch keine Resultate</h3><p>Starte die Suche und die KI baut den Vergleich automatisch auf.</p></div>
        )}
      </section>

      <SuggestionPills items={similarItems} title="Ähnliche Produkte" />
      <SuggestionPills items={suggestions} title="Weitere Vorschläge" />
    </main>
  )
}

function ProductPage({ slug }) {
  const [product, setProduct] = useState(null)
  useEffect(() => {
    api(`/api/products/${slug}`).then(setProduct).catch(() => setProduct(null))
  }, [slug])

  if (!product) {
    return <main className="page-shell"><section className="empty-state"><h3>Produkt wird geladen</h3></section></main>
  }

  return (
    <main className="page-shell product-page-shell">
      <section className="hero-panel compact-hero">
        <span className={`chip ${toneFromLabel(product.decision?.label || product.deal_label, product.offer_count || 0)}`}>
          <Bot size={14} /> {product.decision?.label || product.deal_label || 'KI Vergleich'}
        </span>
        <h1 className="product-title">{product.title}</h1>
        <p className="hero-text">{product.ai_summary || 'KI aufbereiteter Produktvergleich für die Schweiz.'}</p>
        <div className="status-row top-margin-sm">
          <span className="status-chip tone-red"><Trophy size={14} /> {formatPrice(product.price)}</span>
          <span className="status-chip tone-slate"><Store size={14} /> {product.shop_name || 'KI Index'}</span>
          <span className="status-chip tone-blue"><Bot size={14} /> {product.offer_count || 0} Angebote</span>
        </div>
      </section>

      <section className="card-panel">
        <div className="section-head">
          <div>
            <h2>Preisvergleich</h2>
            <p className="muted no-margin">Alle aktiven Shops im gleichen Designsystem wie Startseite und Admin.</p>
          </div>
        </div>
        <div className="offer-list">
          {(product.offers || []).map((offer, index) => (
            <div className="offer-row" key={`${offer.shop_name}-${index}`}>
              <div>
                <div className="offer-shop">{offer.shop_name}</div>
                <div className="muted small">Zuletzt aktualisiert: {formatDate(offer.updated_at)}</div>
              </div>
              <div className="offer-row-right">
                <strong className="price-inline">{formatPrice(offer.price)}</strong>
                <a className="btn btn-primary btn-small" href={`/r/${product.slug}/${encodeURIComponent(offer.shop_name)}`} target="_blank" rel="noreferrer">Zum Shop</a>
              </div>
            </div>
          ))}
        </div>
      </section>

      <SuggestionPills items={product.similarItems || []} title="Ähnliche Produkte" />
      <SuggestionPills items={product.suggestions || []} title="Weitere Vorschläge" />
    </main>
  )
}

function AdminPage() {
  const [login, setLogin] = useState({ email: 'admin@kauvio.ch', password: '' })
  const [token, setToken] = useState(readAdminToken())
  const [dashboard, setDashboard] = useState(null)
  const [systemHealth, setSystemHealth] = useState(null)
  const [searchTasks, setSearchTasks] = useState([])
  const [message, setMessage] = useState('')
  const [aiQuery, setAiQuery] = useState('')

  useEffect(() => {
    if (!token) return
    Promise.all([
      api('/api/admin/dashboard').catch(() => ({ stats: {} })),
      api('/api/admin/system-health').catch(() => ({ checks: {} })),
      api('/api/admin/search-tasks').catch(() => ({ items: [] })),
    ]).then(([dash, health, tasks]) => {
      setDashboard(dash)
      setSystemHealth(health)
      setSearchTasks(tasks.items || [])
    })
  }, [token])

  async function loginAdmin(event) {
    event.preventDefault()
    try {
      const data = await api('/api/admin/login', { method: 'POST', body: JSON.stringify(login) })
      persistAdminToken(data.token)
      setToken(data.token)
      setMessage('Admin eingeloggt.')
    } catch (err) {
      setMessage(err.message || 'Login fehlgeschlagen')
    }
  }

  async function startAiSearch() {
    if (!aiQuery.trim()) return
    try {
      const data = await api('/api/admin/ai/search/start', { method: 'POST', body: JSON.stringify({ query: aiQuery }) })
      setMessage(`KI Suche gestartet: ${data.task?.query || aiQuery}`)
    } catch (err) {
      setMessage(err.message || 'KI Suche konnte nicht gestartet werden.')
    }
  }

  if (!token) {
    return (
      <main className="page-shell admin-shell">
        <section className="hero-panel compact-hero admin-login-panel">
          <BrandWordmark />
          <h1 className="search-title">Admin Login</h1>
          <form className="admin-login-form" onSubmit={loginAdmin}>
            <input value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} placeholder="E-Mail" />
            <input type="password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} placeholder="Passwort" />
            <button className="btn btn-primary">Einloggen</button>
          </form>
          {message ? <p className="muted top-margin-sm">{message}</p> : null}
        </section>
      </main>
    )
  }

  const stats = [
    { label: 'Live Jobs', value: systemHealth?.checks?.search_tasks?.count ?? 0, icon: Activity, tone: 'tone-blue' },
    { label: 'Canonical Produkte', value: systemHealth?.checks?.canonical_products?.count ?? 0, icon: Database, tone: 'tone-slate' },
    { label: 'Open Web', value: dashboard?.stats?.openWebPages ?? 0, icon: Search, tone: 'tone-blue' },
    { label: 'Seeds', value: dashboard?.stats?.autonomousSeeds ?? 0, icon: Sparkles, tone: 'tone-red' },
  ]

  return (
    <main className="page-shell admin-shell">
      <section className="hero-panel compact-hero admin-top-panel">
        <div className="section-head admin-top-head">
          <div>
            <span className="chip tone-red"><Settings2 size={14} /> Admin · Go Live</span>
            <div className="top-margin-sm"><BrandWordmark small align="left" /></div>
            <p className="hero-text">Gleiches Designsystem wie Frontend und Suche.</p>
          </div>
          <div className="admin-top-actions">
            <button className="btn btn-primary btn-small" onClick={startAiSearch}>KI Suche starten</button>
            <button className="btn btn-ghost btn-small" onClick={() => { persistAdminToken(''); setToken('') }}>Abmelden</button>
          </div>
        </div>
        <div className="search-inline-shell admin-inline-search">
          <Search className="search-inline-icon" size={18} />
          <input value={aiQuery} onChange={(e) => setAiQuery(e.target.value)} placeholder="z. B. iPhone 16 Pro 256 GB" />
          <button className="btn btn-primary" onClick={startAiSearch}>Starten</button>
        </div>
      </section>

      {message ? <section className="info-panel tone-panel-blue"><p className="no-margin">{message}</p></section> : null}

      <section className="stats-grid-brand">
        {stats.map((item) => {
          const Icon = item.icon
          return (
            <div className="stat-card-brand" key={item.label}>
              <div className="stat-top"><span className={`chip ${item.tone}`}><Icon size={14} /> {item.label}</span></div>
              <div className="stat-value">{item.value}</div>
            </div>
          )
        })}
      </section>

      <section className="card-panel">
        <div className="section-head">
          <div>
            <h2>Letzte Suchjobs</h2>
            <p className="muted no-margin">Discovery, Extraktion und Vergleich in einer Linie.</p>
          </div>
        </div>
        <div className="offer-list">
          {searchTasks.slice(0, 8).map((task) => (
            <div className="offer-row" key={task.id}>
              <div>
                <div className="offer-shop">{task.query}</div>
                <div className="muted small">{task.status} · {task.strategy}</div>
              </div>
              <div className="offer-row-right">
                <span className="chip tone-blue"><BarChart3 size={14} /> {task.imported_count || 0} Imports</span>
                <span className="chip tone-slate"><Layers3 size={14} /> {task.discovered_count || 0} Discovery</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

export default function App() {
  const [route, setRoute] = useState(routeNow())

  useEffect(() => {
    const onHash = () => setRoute(routeNow())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (route.startsWith('/product/')) {
    return <div className="shell"><Header /><ProductPage slug={route.replace('/product/', '')} /></div>
  }
  if (route.startsWith('/search')) {
    return <div className="shell"><Header /><SearchPage route={route} /></div>
  }
  if (route.startsWith('/admin')) {
    return <div className="shell"><Header /><AdminPage /></div>
  }
  return <div className="shell"><Header /></div>
}
