import React, { useEffect, useMemo, useRef, useState } from 'react'

function routeNow() {
  return window.location.hash.replace(/^#/, '') || '/'
}

const ADMIN_TOKEN_KEY = 'kauvio_admin_token'

function readAdminToken() {
  try { return localStorage.getItem(ADMIN_TOKEN_KEY) || sessionStorage.getItem(ADMIN_TOKEN_KEY) || '' } catch { return '' }
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
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
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

const formatPrice = (value) => value != null ? `CHF ${Number(value).toFixed(2)}` : '—'
const formatDate = (value) => {
  if (!value) return '—'
  try { return new Date(value).toLocaleString('de-CH') } catch { return value }
}

function Header() {
  return <header className="topbar topbar-pro"><a className="brandlink" href="#/"><div className="brand brand-modern"><div className="brand-wordmark"><span className="brand-dot" /><span className="brand-name">KAUVIO<span className="brand-point">.</span></span></div></div></a></header>
}

function Stat({ title, value }) {
  return <div className="stat-card"><div className="muted">{title}</div><strong>{value}</strong></div>
}

function DecisionBadge({ item }) {
  const label = item.deal_label || item.decision?.label || 'KI Vergleich'
  return <span className="result-pill">{label}</span>
}

function SearchCard({ item }) {
  return (
    <a className="result-card-pro" href={`#/product/${item.slug}`}>
      <div className="result-card-copy">
        <div className="result-card-title">{item.title}</div>
        <div className="result-card-meta">{item.brand || '—'} · {item.category || 'Produkt'} · {item.offer_count || 0} Shops</div>
        <div className="result-card-submeta">Bestpreis · {formatPrice(item.price)}{item.shop_name ? ` · ${item.shop_name}` : ''}</div>
      </div>
      <div className="result-card-side">
        <DecisionBadge item={item} />
        <strong className="price-inline">{formatPrice(item.price)}</strong>
      </div>
    </a>
  )
}

export default function App() {
  const [route, setRoute] = useState(routeNow())
  const [adminToken, setAdminToken] = useState(readAdminToken())
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState([])
  const [liveSearch, setLiveSearch] = useState(null)
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [selected, setSelected] = useState(null)
  const [searchError, setSearchError] = useState('')
  const [pollMessage, setPollMessage] = useState('')
  const pollRef = useRef(null)

  const [login, setLogin] = useState({ email: 'admin@kauvio.ch', password: '' })
  const [loginError, setLoginError] = useState('')
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminMessage, setAdminMessage] = useState('')
  const [aiSearchQuery, setAiSearchQuery] = useState('')
  const [dashboard, setDashboard] = useState(null)
  const [searchTasks, setSearchTasks] = useState([])
  const [searchRequests, setSearchRequests] = useState([])
  const [webDiscoveryResults, setWebDiscoveryResults] = useState([])
  const [aiControls, setAiControls] = useState([])
  const [aiControlEditor, setAiControlEditor] = useState({})
  const [swissSources, setSwissSources] = useState([])
  const [swissSourceEditor, setSwissSourceEditor] = useState({})

  useEffect(() => {
    const onHash = () => setRoute(routeNow())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    const sync = () => setAdminToken(readAdminToken())
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  useEffect(() => {
    const match = route.match(/^\/product\/(.+)$/)
    if (match) api(`/api/products/${match[1]}`).then(setSelected).catch(() => setSelected(null))
  }, [route])

  useEffect(() => {
    if (route !== '/admin') return
    if (!adminToken) {
      window.location.hash = '/admin/login'
      return
    }
    refreshAdminData()
  }, [route, adminToken])

  useEffect(() => {
    if (!liveSearch?.query || products.length > 0) {
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = null
      if (products.length > 0) setPollMessage('')
      return
    }
    if (pollRef.current) clearInterval(pollRef.current)
    setPollMessage('Die KI sucht live weiter und lädt Ergebnisse automatisch nach …')
    pollRef.current = setInterval(async () => {
      try {
        const data = await api(`/api/products?q=${encodeURIComponent(liveSearch.query)}`)
        setProducts(data.items || [])
        setLiveSearch(data.liveSearch || null)
        if ((data.items || []).length > 0) {
          setPollMessage('Neue Resultate wurden gefunden.')
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      } catch {
        setPollMessage('Live-Suche läuft weiter …')
      }
    }, 8000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [liveSearch?.query, products.length])

  const featured = useMemo(() => products.slice(0, 20), [products])
  const adminMessageIsError = /fehler|nicht|ungültig|failed|error/i.test(adminMessage || '')

  async function runPublicSearch(nextQuery) {
    const cleaned = String(nextQuery || '').trim()
    if (!cleaned) return
    setSearchError('')
    setPollMessage('')
    setLoadingProducts(true)
    try {
      const data = await api(`/api/products?q=${encodeURIComponent(cleaned)}`)
      setProducts(data.items || [])
      setLiveSearch(data.liveSearch || null)
      window.location.hash = '/search'
    } catch (err) {
      setProducts([])
      setLiveSearch(null)
      setSearchError(err.message || 'Suche fehlgeschlagen')
    } finally {
      setLoadingProducts(false)
    }
  }

  async function startManualAiSearchPublic() {
    const cleaned = String(query || '').trim()
    if (!cleaned) return
    setSearchError('')
    setPollMessage('')
    setLoadingProducts(true)
    try {
      const data = await api('/api/ai/search/start', { method: 'POST', body: JSON.stringify({ query: cleaned }) })
      setLiveSearch(data.task || null)
      const refreshed = await api(`/api/products?q=${encodeURIComponent(cleaned)}`)
      setProducts(refreshed.items || [])
      setLiveSearch(refreshed.liveSearch || data.task || null)
      window.location.hash = '/search'
    } catch (err) {
      setSearchError(err.message || 'KI-Suche konnte nicht gestartet werden.')
    } finally {
      setLoadingProducts(false)
    }
  }

  async function refreshAdminData() {
    setAdminLoading(true)
    try {
      const [dash, tasks, requests, discoveries, controls, swiss] = await Promise.all([
        api('/api/admin/dashboard'),
        api('/api/admin/search-tasks').catch(() => ({ items: [] })),
        api('/api/admin/search-requests').catch(() => ({ items: [] })),
        api('/api/admin/web-discovery-results').catch(() => ({ items: [] })),
        api('/api/admin/ai/controls').catch(() => ({ items: [] })),
        api('/api/admin/swiss-sources').catch(() => ({ items: [] })),
      ])
      setDashboard(dash)
      setSearchTasks(tasks.items || [])
      setSearchRequests(requests.items || [])
      setWebDiscoveryResults(discoveries.items || [])
      setAiControls(controls.items || [])
      const nextControlEditor = {}
      for (const item of controls.items || []) nextControlEditor[item.control_key] = { is_enabled: !!item.is_enabled, control_value_json: JSON.stringify(item.control_value_json || {}, null, 2) }
      setAiControlEditor(nextControlEditor)
      setSwissSources(swiss.items || [])
      const nextSwissEditor = {}
      for (const item of swiss.items || []) {
        nextSwissEditor[item.source_key] = {
          priority: item.priority ?? 0,
          manual_boost: item.manual_boost ?? 0,
          is_active: item.is_active !== false,
          is_small_shop: !!item.is_small_shop,
          last_runtime_status: item.last_runtime_status || '',
        }
      }
      setSwissSourceEditor(nextSwissEditor)
    } catch (err) {
      if (err?.status === 401) {
        persistAdminToken('')
        setAdminToken('')
        window.location.hash = '/admin/login'
      }
    } finally {
      setAdminLoading(false)
    }
  }

  async function loginAdmin(e) {
    e.preventDefault()
    setLoginError('')
    try {
      const data = await api('/api/admin/login', { method: 'POST', body: JSON.stringify(login) })
      persistAdminToken(data.token)
      setAdminToken(data.token)
      window.location.hash = '/admin'
    } catch (err) {
      setLoginError(err.message || 'Login fehlgeschlagen')
    }
  }

  function logoutAdmin() {
    persistAdminToken('')
    setAdminToken('')
    window.location.hash = '/admin/login'
  }

  async function startAdminAiSearch() {
    const cleaned = String(aiSearchQuery || '').trim()
    if (!cleaned) return
    try {
      const data = await api('/api/admin/ai/search/start', { method: 'POST', body: JSON.stringify({ query: cleaned }) })
      setAdminMessage(`KI-Suche gestartet: ${data.task?.query || cleaned}`)
      await refreshAdminData()
    } catch (err) {
      setAdminMessage(err.message || 'KI-Suche konnte nicht gestartet werden.')
    }
  }

  async function saveAiControl(controlKey) {
    const payload = aiControlEditor[controlKey]
    await api(`/api/admin/ai/controls/${encodeURIComponent(controlKey)}`, { method: 'PUT', body: JSON.stringify({ is_enabled: !!payload.is_enabled, control_value_json: payload.control_value_json }) })
    await refreshAdminData()
    setAdminMessage(`AI-Control gespeichert: ${controlKey}`)
  }

  async function saveSwissSource(sourceKey) {
    await api(`/api/admin/swiss-sources/${encodeURIComponent(sourceKey)}`, { method: 'PUT', body: JSON.stringify(swissSourceEditor[sourceKey]) })
    await refreshAdminData()
    setAdminMessage(`Schweizer Quelle gespeichert: ${sourceKey}`)
  }

  if (route === '/admin/login' && adminToken) {
    window.location.hash = '/admin'
    return null
  }

  if (route === '/admin/login') {
    return (
      <div className="shell center gradient-bg">
        <div className="login-card login-card-pro">
          <div className="brand-row"><div className="logo">K</div><div><div className="brand-name dark">KAUVIO</div><div className="muted">AI-first Admin</div></div></div>
          <h1 className="login-title">Admin Login</h1>
          <form className="stack" onSubmit={loginAdmin}>
            <label className="field"><span>E-Mail</span><input value={login.email} onChange={e => setLogin({ ...login, email: e.target.value })} /></label>
            <label className="field"><span>Passwort</span><input type="password" value={login.password} onChange={e => setLogin({ ...login, password: e.target.value })} /></label>
            {loginError ? <div className="error-box">{loginError}</div> : null}
            <button className="btn btn-xl">Einloggen</button>
          </form>
        </div>
      </div>
    )
  }

  if (route === '/admin') {
    return (
      <div className="shell">
        <Header />
        <main className="content admin-content admin-final-layout">
          <section className="hero admin-hero panel hero-banner admin-banner">
            <div>
              <div className="badge">AI-first Kern</div>
              <h1 className="section-title">Kauvio Admin</h1>
              <p className="section-text">Suchstart, Discovery, Warteliste und Schweizer Quellen an einem Ort.</p>
            </div>
            <div className="row gap-sm wrap"><button className="btn btn-small btn-ghost" onClick={refreshAdminData}>Neu laden</button><button className="btn btn-small btn-ghost" onClick={logoutAdmin}>Abmelden</button></div>
          </section>
          {adminMessage ? <section className={`panel ${adminMessageIsError ? 'status-error' : 'status-success'}`}><p className="no-margin">{adminMessage}</p></section> : null}
          {adminLoading ? <section className="panel"><p className="muted no-margin">Admin-Daten werden geladen…</p></section> : null}
          <section className="stats-grid stats-grid-6 admin-kpi-grid">
            <Stat title="Produkte" value={dashboard?.stats?.products ?? '-'} />
            <Stat title="Offers" value={dashboard?.stats?.offers ?? '-'} />
            <Stat title="Suchjobs" value={dashboard?.stats?.searchTasks ?? '-'} />
            <Stat title="Open Web" value={dashboard?.stats?.openWebPages ?? '-'} />
            <Stat title="Warteliste" value={dashboard?.stats?.searchRequests ?? '-'} />
            <Stat title="Readiness" value={dashboard?.readiness?.score != null ? `${dashboard.readiness.score}%` : '-'} />
          </section>
          <section className="panel">
            <div className="section-head"><div><h2>KI Suche starten</h2><p className="muted no-margin">Direkter Live-Start für neue Produktsuche.</p></div></div>
            <div className="row gap-sm wrap"><input value={aiSearchQuery} onChange={e => setAiSearchQuery(e.target.value)} placeholder="z. B. iPhone 16 Pro 256 GB" /><button className="btn btn-small" onClick={startAdminAiSearch}>KI Suche starten</button></div>
          </section>
          <div className="admin-grid admin-grid-main">
            <section className="panel">
              <div className="section-head"><div><h2>KI Controls</h2><p className="muted no-margin">Nur die zentralen Schalter für Engine und Discovery.</p></div></div>
              <div className="stack">{aiControls.filter((control) => ['engine_runtime','open_web_discovery','small_shop_balance','autonomous_builder'].includes(control.control_key)).map((control) => <div className="offer-edit-card" key={control.control_key}><div className="row line no-border"><div><strong>{control.control_key}</strong><div className="muted">{control.description || '—'}</div></div><div className="muted">{formatDate(control.updated_at)}</div></div><label className="field"><span>Aktiv</span><input type="checkbox" checked={!!aiControlEditor[control.control_key]?.is_enabled} onChange={e => setAiControlEditor({ ...aiControlEditor, [control.control_key]: { ...aiControlEditor[control.control_key], is_enabled: e.target.checked } })} /></label><label className="field"><span>JSON</span><textarea rows="4" value={aiControlEditor[control.control_key]?.control_value_json || ''} onChange={e => setAiControlEditor({ ...aiControlEditor, [control.control_key]: { ...aiControlEditor[control.control_key], control_value_json: e.target.value } })} /></label><button className="btn btn-small" onClick={() => saveAiControl(control.control_key)}>Speichern</button></div>)}</div>
            </section>
            <section className="panel">
              <div className="section-head"><div><h2>Warteliste & Discovery</h2><p className="muted no-margin">Was gerade gesucht wird und was die KI im offenen Web findet.</p></div></div>
              <div className="stack">
                <div className="subpanel light-panel"><strong>Suchanfragen</strong><div className="stack mt-16">{searchRequests.slice(0, 6).map((item) => <div className="row line" key={item.id}><div><strong>{item.query}</strong><div className="muted">{item.status}</div></div><div className="muted">{item.result_count || 0} Resultate</div></div>)}</div></div>
                <div className="subpanel light-panel"><strong>Open Web Treffer</strong><div className="stack mt-16">{webDiscoveryResults.slice(0, 6).map((item) => <div className="row line" key={item.id}><div><strong>{item.result_title || item.source_domain || 'Treffer'}</strong><div className="muted">{item.source_domain || '—'}</div></div><div className="muted">{item.discovered_product ? 'Produkt' : item.discovered_shop ? 'Shop' : 'Treffer'}</div></div>)}</div></div>
              </div>
            </section>
          </div>
          <section className="panel">
            <div className="section-head"><div><h2>Schweizer Quellen</h2><p className="muted no-margin">Nur die wichtigsten Quellen mit Schnellsteuerung.</p></div></div>
            <div className="stack">{swissSources.slice(0, 10).map((source) => <div className="offer-edit-card" key={source.source_key}><div className="row line no-border"><div><strong>{source.display_name}</strong><div className="muted">{source.source_key}{source.auto_discovered ? ' · auto' : ''}{source.shop_domain ? ` · ${source.shop_domain}` : ''}</div></div><div className="muted">{source.last_runtime_status || 'kein Status'}</div></div><div className="grid two-col"><label className="field"><span>Priorität</span><input value={swissSourceEditor[source.source_key]?.priority ?? ''} onChange={e => setSwissSourceEditor({ ...swissSourceEditor, [source.source_key]: { ...swissSourceEditor[source.source_key], priority: Number(e.target.value) } })} /></label><label className="field"><span>Boost</span><input value={swissSourceEditor[source.source_key]?.manual_boost ?? ''} onChange={e => setSwissSourceEditor({ ...swissSourceEditor, [source.source_key]: { ...swissSourceEditor[source.source_key], manual_boost: Number(e.target.value) } })} /></label><label className="field"><span>Kleiner Shop</span><input type="checkbox" checked={!!swissSourceEditor[source.source_key]?.is_small_shop} onChange={e => setSwissSourceEditor({ ...swissSourceEditor, [source.source_key]: { ...swissSourceEditor[source.source_key], is_small_shop: e.target.checked } })} /></label><label className="field"><span>Aktiv</span><input type="checkbox" checked={!!swissSourceEditor[source.source_key]?.is_active} onChange={e => setSwissSourceEditor({ ...swissSourceEditor, [source.source_key]: { ...swissSourceEditor[source.source_key], is_active: e.target.checked } })} /></label></div><button className="btn btn-small" onClick={() => saveSwissSource(source.source_key)}>Quelle speichern</button></div>)}</div>
          </section>
          <section className="panel">
            <div className="section-head"><div><h2>Letzte Suchjobs</h2><p className="muted no-margin">Direkt sehen, ob Imports laufen oder scheitern.</p></div></div>
            <div className="stack">{searchTasks.slice(0, 8).map((task) => <div className="row line" key={task.id}><div><strong>{task.query}</strong><div className="muted">{task.status} · {task.strategy}</div></div><div className="muted">{task.imported_count || 0} Imports · {task.discovered_count || 0} Discovery</div></div>)}</div>
          </section>
        </main>
      </div>
    )
  }

  if (selected && route.startsWith('/product/')) {
    return (
      <div className="shell">
        <Header />
        <main className="content product-page">
          <section className="panel product-hero-panel">
            <div className="badge">{selected.deal_label || selected.decision?.label || 'KI Vergleich'}</div>
            <h1 className="product-title">{selected.title}</h1>
            <p className="product-copy">{selected.ai_summary || 'KI-aufbereiteter Produktvergleich für die Schweiz.'}</p>
            <div className="detail-list"><div><span>Marke</span><strong>{selected.brand || '—'}</strong></div><div><span>Kategorie</span><strong>{selected.category || '—'}</strong></div><div><span>Bestpreis</span><strong>{formatPrice(selected.price)}</strong></div></div>
          </section>
          <section className="panel comparison-panel">
            <div className="section-head"><div><h2>Preisvergleich</h2><p className="muted no-margin">Bestpreis und alle Shops mit Direktlink.</p></div></div>
            <div className="offers-table">{(selected.offers || []).map((offer, idx) => <div className={`offer-row ${idx === 0 ? 'offer-row-best' : ''}`} key={`${offer.shop_name}-${idx}`}><div className="offer-shop"><strong>{offer.shop_name}</strong><div className="muted">Zuletzt aktualisiert: {formatDate(offer.updated_at)}</div></div><div className="offer-row-right"><strong className="offer-price">{formatPrice(offer.price)}</strong><a className="btn btn-small" href={`/r/${selected.slug}/${encodeURIComponent(offer.shop_name)}`} target="_blank" rel="noreferrer">Zum Shop</a></div></div>)}</div>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="shell">
      <Header />
      <main className="content home-content">
        <section className="panel home-simple">
          <div className="home-logo">KAUVIO<span className="brand-point">.</span></div>
          <p className="home-subtitle">AI-first Produktsuche Schweiz</p>
          <h1 className="home-title">Die KI findet, priorisiert und vergleicht Schweizer Produkte.</h1>
          <p className="home-lead">Suche direkt im Index oder starte bei Bedarf sofort eine Live-KI-Suche über Schweizer Quellen.</p>
          <div className="search-shell hero-search home-search-centered">
            <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') runPublicSearch(query) }} placeholder="z. B. iPhone 16 Pro, Dyson V15 oder Sony WH-1000XM6" />
            <button className="btn hero-search-btn" onClick={() => runPublicSearch(query)}>Suchen</button>
          </div>
          <div className="home-trust-row"><span className="trust-item"><span className="trust-icon">AI</span>KI-Orchestrierung</span><span className="trust-item"><span className="trust-icon">CH</span>Schweizer Quellen</span><span className="trust-item"><span className="trust-icon">✓</span>Canonical Vergleich</span></div>
        </section>
        {liveSearch ? <section className="panel"><div className="section-head"><div><h2>KI Suche läuft</h2><p className="muted no-margin">{liveSearch.userVisibleNote || 'Die KI sammelt gerade Schweizer Quellen.'}</p></div></div><div className="row gap-sm wrap"><div className="subpanel light-panel"><strong>Suchauftrag</strong><div className="muted">{liveSearch.query || query}</div></div><div className="subpanel light-panel"><strong>Status</strong><div className="muted">{liveSearch.status || 'pending'}</div></div><div className="subpanel light-panel"><strong>Strategie</strong><div className="muted">{liveSearch.strategy || 'swiss_ai_live'}</div></div></div>{pollMessage ? <p className="muted" style={{ marginTop: 12 }}>{pollMessage}</p> : null}</section> : null}
        {searchError ? <section className="panel status-error"><p className="no-margin">{searchError}</p></section> : null}
        {!loadingProducts && !featured.length && query.trim() ? <section className="panel"><div className="section-head"><div><h2>Keine lokalen Resultate</h2><p className="muted no-margin">Starte die Live-KI-Suche jetzt sofort. Die Seite lädt Resultate danach automatisch nach.</p></div></div><button className="btn btn-small" onClick={startManualAiSearchPublic}>KI Suche jetzt starten</button></section> : null}
        <section className="panel search-results-panel">
          <div className="section-head"><div><h2>Ergebnisse</h2><p className="muted no-margin">Bestpreis, Deal-Label und alle gefundenen Shops.</p></div></div>
          {loadingProducts ? <div className="empty-state"><h3>Suche läuft</h3><p>Die aktuellen Ergebnisse werden geladen.</p></div> : featured.length ? <div className="results-list-pro">{featured.map((item) => <SearchCard item={item} key={item.slug} />)}</div> : <div className="empty-state"><h3>Noch keine Resultate</h3><p>Starte eine Suche oder direkt die KI-Suche.</p></div>}
        </section>
      </main>
    </div>
  )
}
