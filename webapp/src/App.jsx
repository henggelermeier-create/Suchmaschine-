
import React, { useEffect, useMemo, useState } from 'react'

function routeNow() {
  return window.location.hash.replace(/^#/, '') || '/'
}

const ADMIN_TOKEN_KEY = 'kauvio_admin_token'

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
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
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
  try {
    return new Date(value).toLocaleString('de-CH')
  } catch {
    return value
  }
}

function dealLabel(score) {
  if (score >= 88) return 'Top Deal'
  if (score >= 78) return 'Guter Preis'
  return 'Live Preis'
}

function recommendationText(score) {
  if (score >= 88) return 'Der günstigste Preis im aktuellen Vergleich.'
  if (score >= 78) return 'Aktuell ein starkes Angebot im Shopvergleich.'
  return 'Live importierter Preis aus Schweizer Shops.'
}

function Header() {
  return (
    <header className="topbar topbar-pro">
      <a className="brandlink" href="#/"><Brand /></a>
    </header>
  )
}

function Brand() {
  return (
    <div className="brand brand-modern">
      <div className="brand-wordmark">
        <span className="brand-dot" />
        <span className="brand-name">KAUVIO<span className="brand-point">.</span></span>
      </div>
    </div>
  )
}

function Stat({ title, value }) {
  return (
    <div className="stat-card">
      <div className="muted">{title}</div>
      <strong>{value}</strong>
    </div>
  )
}

function TrustBullet({ icon, children }) {
  return (
    <div className="trust-item">
      <span className="trust-icon">{icon}</span>
      <span>{children}</span>
    </div>
  )
}

function ProductCard({ item }) {
  return (
    <a className="product-card" href={`#/product/${item.slug}`}>
      <div className="product-card-top">
        <span className="result-pill">{item.decision?.label || dealLabel(item.deal_score ?? 0)}</span>
        <span className="muted small">{item.offer_count} Shop{item.offer_count === 1 ? '' : 's'}</span>
      </div>
      <div className="product-card-body">
        <div className="product-card-title">{item.title}</div>
        <div className="product-card-meta">{item.brand || '—'} · {item.category || 'Produkt'}</div>
      </div>
      <div className="product-card-footer">
        <div>
          <div className="price-inline">{formatPrice(item.price)}</div>
          <div className="muted small">ab {item.shop_name || 'Shop'}</div>
        </div>
        <span className="card-cta">Ansehen</span>
      </div>
    </a>
  )
}

export default function App() {
  const [route, setRoute] = useState(routeNow())
  const [adminToken, setAdminToken] = useState(readAdminToken())
  const [adminLoading, setAdminLoading] = useState(false)
  const [crawlActionLoading, setCrawlActionLoading] = useState('')
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState([])
  const [selected, setSelected] = useState(null)
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [dashboard, setDashboard] = useState(null)
  const [login, setLogin] = useState({ email: 'admin@kauvio.ch', password: '' })
  const [loginError, setLoginError] = useState('')
  const [alertEmail, setAlertEmail] = useState('')
  const [alertPrice, setAlertPrice] = useState('')
  const [adminQuery, setAdminQuery] = useState('')
  const [adminProducts, setAdminProducts] = useState([])
  const [adminEditor, setAdminEditor] = useState(null)
  const [editorState, setEditorState] = useState({})
  const [shopSources, setShopSources] = useState([])
  const [shopSourceForm, setShopSourceForm] = useState({ source_name: '', display_name: '', source_group: '', base_url: '', start_urls: '', discovery_notes: '', is_active: true })
  const [newOffer, setNewOffer] = useState({ shop_name: '', source_name: 'digitec', source_group: 'dg_group', price: '', currency: 'CHF', product_url: '', affiliate_url: '', image_url: '' })
  const [assistantInput, setAssistantInput] = useState('')
  const [assistantPlan, setAssistantPlan] = useState(null)
  const [systemHealth, setSystemHealth] = useState(null)
  const [discoveryQueue, setDiscoveryQueue] = useState([])
  const [adminMessage, setAdminMessage] = useState('')

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
    if (route === '/' || route === '/search') {
      setLoadingProducts(true)
      api(`/api/products${query ? `?q=${encodeURIComponent(query)}` : ''}`)
        .then((d) => setProducts(d.items || []))
        .catch(() => setProducts([]))
        .finally(() => setLoadingProducts(false))
    }
  }, [route, query])

  useEffect(() => {
    const m = route.match(/^\/product\/(.+)$/)
    if (m) {
      api(`/api/products/${m[1]}`).then(setSelected).catch(() => setSelected(null))
    }
  }, [route])

  useEffect(() => {
    if (route !== '/admin') return
    if (!adminToken) {
      window.location.hash = '/admin/login'
      return
    }
    setAdminLoading(true)
    api('/api/admin/dashboard')
      .then(setDashboard)
      .then(async () => {
        await loadAdminProducts(adminQuery)
        const shops = await api('/api/admin/shop-sources').catch(() => ({ items: [] }))
        setShopSources(shops.items || [])
        const health = await api('/api/admin/system-health').catch(() => ({ checks: null }))
        setSystemHealth(health.checks || null)
      })
      .catch((err) => {
        if (err?.status === 401) {
          persistAdminToken('')
          setAdminToken('')
          window.location.hash = '/admin/login'
          return
        }
      })
      .finally(() => setAdminLoading(false))
  }, [route, adminToken])

  const featured = useMemo(() => products.slice(0, 6), [products])
  const adminMessageIsError = /fehler|nicht|ungültig|konnte.*nicht|failed|error/i.test(adminMessage || '')

  async function loadAdminProducts(q = '') {
    try {
      const data = await api(`/api/admin/products${q ? `?q=${encodeURIComponent(q)}` : ''}`)
      setAdminProducts(data.items || [])
    } catch {
      setAdminProducts([])
    }
  }

  async function openAdminEditor(slug) {
    setAdminMessage('')
    const data = await api(`/api/admin/products/${slug}/offers`)
    setAdminEditor(data)
    const next = {}
    for (const offer of data.offers) {
      next[offer.id] = {
        affiliate_url: offer.affiliate_url || '',
        product_url: offer.product_url || '',
        is_hidden: !!offer.is_hidden,
        shop_name: offer.shop_name || '',
        price: offer.price || '',
        currency: offer.currency || 'CHF',
        source_name: offer.source_name || '',
        source_group: offer.source_group || ''
      }
    }
    setEditorState(next)
  }


  async function createNewOffer() {
    if (!adminEditor) return
    await api(`/api/admin/products/${adminEditor.product.slug}/offers`, {
      method: 'POST',
      body: JSON.stringify({
        ...newOffer,
        price: Number(newOffer.price)
      })
    })
    await openAdminEditor(adminEditor.product.slug)
    await loadAdminProducts(adminQuery)
    setAdminMessage('Shop-Angebot gespeichert.')
    setNewOffer({ shop_name: '', source_name: 'digitec', source_group: 'dg_group', price: '', currency: 'CHF', product_url: '', affiliate_url: '', image_url: '' })
  }

  async function saveOffer(offerId) {
    if (!adminEditor) return
    const payload = editorState[offerId]
    await api(`/api/admin/products/${adminEditor.product.slug}/offers/${offerId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    })
    await openAdminEditor(adminEditor.product.slug)
    await loadAdminProducts(adminQuery)
    setAdminMessage('Override gespeichert.')
  }

  async function loginAdmin(e) {
    e.preventDefault()
    setLoginError('')
    try {
      const d = await api('/api/admin/login', { method: 'POST', body: JSON.stringify(login) })
      persistAdminToken(d.token)
      setAdminToken(d.token)
      setDashboard(null)
      window.location.hash = '/admin'
    } catch (err) {
      setLoginError(err.message || 'Login fehlgeschlagen')
    }
  }

  function logoutAdmin() {
    persistAdminToken('')
    setAdminToken('')
    setDashboard(null)
    setAdminEditor(null)
    window.location.hash = '/admin/login'
  }




  async function updateShopSource() {
    if (!shopSourceForm.source_name) {
      setAdminMessage('Bitte zuerst eine Shop-Quelle wählen oder ausfüllen.')
      return
    }
    const d = await api(`/api/admin/shop-sources/${encodeURIComponent(shopSourceForm.source_name)}`, {
      method: 'PUT',
      body: JSON.stringify(shopSourceForm)
    })
    const shops = await api('/api/admin/shop-sources').catch(() => ({ items: [] }))
    setShopSources(shops.items || [])
    setAdminMessage(`Shop geändert: ${d.item.display_name}`)
  }

  async function deleteShopSource(source_name) {
    await api(`/api/admin/shop-sources/${encodeURIComponent(source_name)}`, {
      method: 'DELETE'
    })
    const shops = await api('/api/admin/shop-sources').catch(() => ({ items: [] }))
    setShopSources(shops.items || [])
    if (shopSourceForm.source_name === source_name) {
      setShopSourceForm({ source_name: '', display_name: '', source_group: '', base_url: '', start_urls: '', discovery_notes: '', is_active: true })
    }
    setAdminMessage(`Shop gelöscht: ${source_name}`)
  }

  async function saveShopSource() {
    const d = await api('/api/admin/shop-sources/save', {
      method: 'POST',
      body: JSON.stringify(shopSourceForm)
    })
    const shops = await api('/api/admin/shop-sources').catch(() => ({ items: [] }))
    setShopSources(shops.items || [])
    setShopSourceForm({ source_name: '', display_name: '', source_group: '', base_url: '', start_urls: '', discovery_notes: '', is_active: true })
    setAdminMessage(`Shop gespeichert: ${d.item.display_name}`)
  }

  function editShopSource(item) {
    setShopSourceForm({
      source_name: item.source_name || '',
      display_name: item.display_name || '',
      source_group: item.source_group || '',
      base_url: item.base_url || '',
      start_urls: item.start_urls || '',
      discovery_notes: item.discovery_notes || '',
      is_active: item.is_active !== false
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function triggerCrawl(source_name, mode = 'fast') {
    setAdminMessage('')
    setCrawlActionLoading(`${source_name}:${mode}`)
    try {
      const d = await api('/api/admin/crawl/run', {
        method: 'POST',
        body: JSON.stringify({ source_name, mode })
      })
      setAdminMessage(`Crawl gestartet: ${d.job.source_name} · ${d.job.mode}`)
      const refreshed = await api('/api/admin/dashboard')
      setDashboard(refreshed)
    } catch (err) {
      setAdminMessage(err.message || 'Crawl-Job konnte nicht angelegt werden.')
    } finally {
      setCrawlActionLoading('')
    }
  }

  async function refreshAdminData() {
    const refreshed = await api('/api/admin/dashboard')
    setDashboard(refreshed)
    await loadAdminProducts(adminQuery)
    const health = await api('/api/admin/system-health').catch(() => ({ checks: null }))
    setSystemHealth(health.checks || null)
    setAdminMessage('Dashboard und Produkte aktualisiert.')
  }


  async function planAssistant() {
    const plan = await api('/api/admin/assistant/plan', {
      method: 'POST',
      body: JSON.stringify({ message: assistantInput })
    })
    setAssistantPlan(plan)
  }

  async function executeAssistantPlan() {
    if (!assistantPlan?.actions?.length) return
    const result = await api('/api/admin/assistant/execute', {
      method: 'POST',
      body: JSON.stringify({ actions: assistantPlan.actions })
    })
    const refreshed = await api('/api/admin/dashboard')
    setDashboard(refreshed)
    setAdminMessage(`Assistant hat ${result.results.length} Aktion(en) ausgeführt.`)
  }

  async function createAlert() {
    if (!selected) return
    await api('/api/alerts', {
      method: 'POST',
      body: JSON.stringify({ email: alertEmail, targetPrice: alertPrice, productSlug: selected.slug })
    })
    alert('Preisalarm gespeichert')
    setAlertPrice('')
  }


  if (route === '/impressum') {
    return (
      <div className="shell shell-pro">
        <Header />
        <main className="content-wrap content-wrap-pro">
          <section className="panel hero-panel">
            <div className="section-head">
              <div>
                <div className="eyebrow">Rechtliches</div>
                <h1 className="hero-title">Impressum</h1>
                <p className="section-text">Ergänze hier deine rechtlichen Angaben, Kontaktinformationen und Verantwortlichkeiten für den Live-Betrieb.</p>
              </div>
            </div>
            <div className="panel">
              <p><strong>Kauvio</strong></p>
              <p className="muted no-margin">Schweizer Preisvergleich</p>
              <p className="muted">Adresse, E-Mail, verantwortliche Person und weitere Pflichtangaben hier ergänzen.</p>
              <div className="row gap-sm wrap" style={{marginTop: '16px'}}>
                <a className="btn btn-small btn-ghost" href="#/">Zurück zur Startseite</a>
                <a className="btn btn-small" href="#/admin/login">Interner Bereich</a>
              </div>
            </div>
          </section>
        </main>
      </div>
    )
  }

  if (route === '/admin/login' && adminToken) {
    window.location.hash = '/admin'
    return null
  }

  if (route === '/admin/login') {
    return (
      <div className="shell center gradient-bg">
        <div className="login-card login-card-pro">
          <div className="brand-row">
            <div className="logo">K</div>
            <div>
              <div className="brand-name dark">KAUVIO</div>
              <div className="muted">Schweizer Preisvergleich Admin</div>
            </div>
          </div>
          <div className="eyebrow">Interner Zugang</div>
          <h1 className="login-title">Admin Login</h1>
          <p className="login-copy">Verwalte Shop-Links, Affiliate-URLs, Preisalarme und Crawler-Daten an einem Ort.</p>
          <form className="stack" onSubmit={loginAdmin}>
            <label className="field"><span>E-Mail</span><input value={login.email} onChange={e => setLogin({ ...login, email: e.target.value })} /></label>
            <label className="field"><span>Passwort</span><input type="password" value={login.password} onChange={e => setLogin({ ...login, password: e.target.value })} /></label>
            {loginError ? <div className="error-box">{loginError}</div> : null}
            <button className="btn btn-xl">Einloggen</button>
          </form>
          <div className="login-hint">Für Live müssen ADMIN_EMAIL, ADMIN_PASSWORD und JWT_SECRET gesetzt sein.</div>
        </div>
      </div>
    )
  }

  if (route === '/admin') {
    return (
      <div className="shell">
        <Header />
        <main className="content admin-content">
          <section className="hero admin-hero panel hero-banner admin-banner">
            <div>
              <div className="badge">Go Live Control Center</div>
              <h1 className="section-title">Kauvio Admin</h1>
              <p className="section-text">Pflege Shop-Angebote, trage neue Shops direkt ein und kontrolliere, welche Produkte auf der Live-Seite sichtbar sind.</p>
            </div>
            <div className="row gap-sm wrap">
              <button className="btn btn-small btn-ghost" onClick={logoutAdmin}>Abmelden</button>
            </div>
          </section>

          {adminLoading && !dashboard ? <section className="panel"><p className="muted no-margin">Admin-Daten werden geladen…</p></section> : null}

          <section className="panel go-live-panel">
            <div className="section-head">
              <div>
                <h2>Go-Live Steuerung</h2>
                <p className="muted no-margin">Schnellaktionen für Crawl, Datenaktualisierung und Live-Kontrolle.</p>
              </div>
            </div>
            <div className="stack">
              <div className="go-live-grid go-live-grid-primary">
                <button className="btn btn-small" disabled={!!crawlActionLoading} onClick={() => triggerCrawl('all', 'fast')}>Fast Crawl alle Shops</button>
                <button className="btn btn-small btn-ghost" disabled={!!crawlActionLoading} onClick={() => triggerCrawl('all', 'full')}>Full Crawl alle Shops</button>
                <button className="btn btn-small btn-ghost" onClick={refreshAdminData}>Produkte aktualisieren</button>
                <button className="btn btn-small btn-ghost" onClick={refreshAdminData}>Dashboard neu laden</button>
              </div>
              <div className="go-live-grid go-live-grid-secondary">
                <button className="btn btn-small btn-ghost" disabled={!!crawlActionLoading} onClick={() => triggerCrawl('digitec', 'fast')}>Digitec Fast</button>
                <button className="btn btn-small btn-ghost" disabled={!!crawlActionLoading} onClick={() => triggerCrawl('brack', 'fast')}>BRACK Fast</button>
                <button className="btn btn-small btn-ghost" disabled={!!crawlActionLoading} onClick={() => triggerCrawl('interdiscount', 'fast')}>Interdiscount Fast</button>
              </div>
              <div className="login-hint" style={{marginTop: '12px'}}>
                {crawlActionLoading ? 'Crawl-Job wird angelegt…' : 'Manuelle Crawl-Jobs werden in die Queue geschrieben und vom Crawler automatisch abgearbeitet.'}
              </div>
            </div>
          </section>



          {adminMessage ? (
            <section className={`panel ${adminMessageIsError ? 'status-error' : 'status-success'}`}>
              <p className="no-margin"><strong>{adminMessageIsError ? 'Fehler:' : 'Status:'}</strong> {adminMessage}</p>
            </section>
          ) : null}


          




          <section className="panel">
            <div className="section-head">
              <div>
                <h2>System-Health</h2>
                <p className="muted no-margin">Kleine Kontrolle.</p>
              </div>
            </div>
            <div className="stats-grid stats-grid-6 system-health-compact">
              <Stat title="Produkte" value={systemHealth?.products?.ok ? systemHealth.products.count : 'Fehler'} />
              <Stat title="Offers" value={systemHealth?.offers?.ok ? systemHealth.offers.count : 'Fehler'} />
              <Stat title="Crawl Jobs" value={systemHealth?.crawl_jobs?.ok ? systemHealth.crawl_jobs.count : 'Fehler'} />
              <Stat title="Discovery" value={systemHealth?.discovery_queue?.ok ? systemHealth.discovery_queue.count : 'Fehler'} />
              <Stat title="Monitoring" value={systemHealth?.monitoring_events?.ok ? systemHealth.monitoring_events.count : 'Fehler'} />
            </div>
          </section>

          <section className="panel">
            <div className="section-head">
              <div>
                <h2>Produkt suchen für Shop-Overrides</h2>
                <p className="muted no-margin">Neue Shops und Angebote direkt im Backend eintragen und bestehende Angebote pflegen.</p>
              </div>
            </div>
            <div className="stack">
              <div className="row gap-sm wrap">
                <input value={adminQuery} onChange={e => setAdminQuery(e.target.value)} placeholder="Produktname, Marke oder Slug" />
                <button className="btn btn-small" onClick={() => loadAdminProducts(adminQuery)}>Suchen</button>
              </div>
              {(adminProducts || []).map((item) => (
                <div className="row line" key={item.slug}>
                  <div>
                    <strong>{item.title}</strong>
                    <div className="muted">{item.brand || '—'} · {item.offer_count} Shops · ab {formatPrice(item.best_price)}</div>
                  </div>
                  <button className="btn btn-small" onClick={() => openAdminEditor(item.slug)}>Bearbeiten</button>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="section-head">
              <div>
                <h2>Shops selbst verwalten</h2>
                <p className="muted no-margin">Neue Shops per Link eintragen und bestehende Shops direkt ändern.</p>
              </div>
            </div>
            <div className="grid two-col">
              <label className="field"><span>Quelle</span><input value={shopSourceForm.source_name} onChange={e => setShopSourceForm({ ...shopSourceForm, source_name: e.target.value })} placeholder="z. B. galaxus" /></label>
              <label className="field"><span>Anzeigename</span><input value={shopSourceForm.display_name} onChange={e => setShopSourceForm({ ...shopSourceForm, display_name: e.target.value })} placeholder="z. B. Galaxus" /></label>
              <label className="field"><span>Gruppe</span><input value={shopSourceForm.source_group} onChange={e => setShopSourceForm({ ...shopSourceForm, source_group: e.target.value })} placeholder="z. B. dg_group" /></label>
              <label className="field"><span>Basis-Link</span><input value={shopSourceForm.base_url} onChange={e => setShopSourceForm({ ...shopSourceForm, base_url: e.target.value })} placeholder="https://www.shop.ch" /></label>
            </div>
            <label className="field"><span>Start-Links</span><textarea rows="3" value={shopSourceForm.start_urls} onChange={e => setShopSourceForm({ ...shopSourceForm, start_urls: e.target.value })} placeholder="Eine oder mehrere URLs, komma- oder zeilengetrennt" /></label>
            <label className="field"><span>Hinweise</span><textarea rows="3" value={shopSourceForm.discovery_notes} onChange={e => setShopSourceForm({ ...shopSourceForm, discovery_notes: e.target.value })} placeholder="Hinweise für Discovery / Matching / Crawl" /></label>
            <div className="row gap-sm wrap">
              <button className="btn btn-small" onClick={saveShopSource}>Shop speichern</button>
              <button className="btn btn-small btn-ghost" onClick={() => setShopSourceForm({ source_name: '', display_name: '', source_group: '', base_url: '', start_urls: '', discovery_notes: '', is_active: true })}>Formular leeren</button>
            </div>
            <div className="stack" style={{marginTop:'14px'}}>
              {(shopSources || []).map((shop) => (
                <div className="row line" key={shop.source_name}>
                  <div>
                    <strong>{shop.display_name}</strong>
                    <div className="muted">{shop.source_name}{shop.source_group ? ` · ${shop.source_group}` : ''}</div>
                    <div className="muted">{shop.base_url || 'kein Basis-Link hinterlegt'}</div>
                  </div>
                  <div className="row gap-sm wrap">
                    <button className="btn btn-small btn-ghost" onClick={() => editShopSource(shop)}>Bearbeiten</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="section-head">
              <div>
                <h2>KI-Assistant im Backend</h2>
                <p className="muted no-margin">Stelle Fragen oder gib Anweisungen. Die KI plant nur sichere Backend-Aktionen und kann sie kontrolliert ausführen.</p>
              </div>
            </div>
            <label className="field">
              <span>Nachricht an den Assistant</span>
              <textarea rows="4" value={assistantInput} onChange={e => setAssistantInput(e.target.value)} placeholder="z. B. Prüfe Backend-Status, starte Fast Crawl für alle Shops, finde Duplikate und starte Discovery." />
            </label>
            <div className="row gap-sm wrap">
              <button className="btn btn-small" onClick={planAssistant}>Aktionen planen</button>
              <button className="btn btn-small btn-ghost" onClick={executeAssistantPlan} disabled={!assistantPlan?.actions?.length}>Geplante Aktionen ausführen</button>
            </div>
            <div className="stack" style={{marginTop:'14px'}}>
              {assistantPlan ? (
                <div className="offer-edit-card">
                  <div><strong>Plan</strong></div>
                  <div className="muted">{assistantPlan.summary}</div>
                  <pre style={{whiteSpace:'pre-wrap', margin:'10px 0 0'}}>{JSON.stringify(assistantPlan.actions || [], null, 2)}</pre>
                </div>
              ) : <p className="muted no-margin">Noch kein Plan erstellt.</p>}
            </div>
          </section>

          <section className="panel">
            <div className="section-head">
              <div>
                <h2>Discovery Queue</h2>
                <p className="muted no-margin">Gefundene und zu verarbeitende Seiten aus den eingetragenen Start-Links.</p>
              </div>
            </div>
            <div className="stack">
              {discoveryQueue.length === 0 ? <p className="muted no-margin">Noch keine Discovery-Einträge vorhanden.</p> : null}
              {discoveryQueue.map((item) => (
                <div className="row line" key={item.id}>
                  <div>
                    <strong>{item.source_name}</strong>
                    <div className="muted">{item.page_type} · {item.status}</div>
                    <div className="muted">{item.page_url}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="login-hint" style={{marginTop:'12px'}}>Discovery durchsucht die eingetragenen Start-Links, sammelt weitere Produkt- und Kategorie-Links und legt sie in einer Queue ab. Der Crawler arbeitet die Queue im Hintergrund ab.</div>
          </section>

          <section className="stats-grid stats-grid-6">
            <Stat title="Produkte" value={dashboard?.stats?.products ?? '-'} />
            <Stat title="Angebote" value={dashboard?.stats?.offers ?? '-'} />
            <Stat title="Alerts" value={dashboard?.stats?.alerts ?? '-'} />
            <Stat title="Suchanfragen" value={dashboard?.stats?.searches ?? '-'} />
            <Stat title="Shop-Klicks" value={dashboard?.stats?.clicks ?? '-'} />
            <Stat title="Klicks 24h" value={dashboard?.stats?.clicks24h ?? '-'} />
          </section>

          {adminEditor ? (
            <section className="panel">
              <div className="section-head">
                <div>
                  <h2>{adminEditor.product.title}</h2>
                  <p className="muted no-margin">{adminEditor.product.slug}</p>
                </div>
              </div>
              <div className="stack">
                <div className="offer-edit-card">
                  <div className="row line no-border">
                    <div>
                      <strong>Neues Shop-Angebot hinzufügen</strong>
                      <div className="muted">Digitec und Galaxus können derselben Gruppe zugeordnet werden, bleiben aber als eigene Shops getrennt.</div>
                    </div>
                  </div>
                  <div className="grid two-col">
                    <label className="field"><span>Shop-Name</span><input value={newOffer.shop_name} onChange={e => setNewOffer({ ...newOffer, shop_name: e.target.value })} placeholder="z. B. Galaxus" /></label>
                    <label className="field"><span>Quelle</span>
                      <select value={newOffer.source_name} onChange={e => {
                        const selected = shopSources.find(x => x.source_name === e.target.value)
                        setNewOffer({ ...newOffer, source_name: e.target.value, source_group: selected?.source_group || '' })
                      }}>
                        <option value="">Manuell</option>
                        {shopSources.map((shop) => <option key={shop.source_name} value={shop.source_name}>{shop.display_name}</option>)}
                      </select>
                    </label>
                    <label className="field"><span>Quellen-Gruppe</span><input value={newOffer.source_group} onChange={e => setNewOffer({ ...newOffer, source_group: e.target.value })} placeholder="z. B. dg_group" /></label>
                    <label className="field"><span>Preis</span><input value={newOffer.price} onChange={e => setNewOffer({ ...newOffer, price: e.target.value })} placeholder="1099" /></label>
                    <label className="field"><span>Währung</span><input value={newOffer.currency} onChange={e => setNewOffer({ ...newOffer, currency: e.target.value })} placeholder="CHF" /></label>
                    <label className="field"><span>Shop-URL</span><input value={newOffer.product_url} onChange={e => setNewOffer({ ...newOffer, product_url: e.target.value })} placeholder="https://..." /></label>
                    <label className="field"><span>Affiliate-URL</span><input value={newOffer.affiliate_url} onChange={e => setNewOffer({ ...newOffer, affiliate_url: e.target.value })} placeholder="optional" /></label>
                    <label className="field"><span>Bild-URL</span><input value={newOffer.image_url} onChange={e => setNewOffer({ ...newOffer, image_url: e.target.value })} placeholder="optional" /></label>
                  </div>
                  <div className="row gap-sm wrap">
                    <button className="btn btn-small" onClick={createNewOffer}>Shop-Angebot hinzufügen</button>
                  </div>
                </div>

                {adminEditor.offers.map((offer) => (
                  <div className="offer-edit-card" key={offer.id}>
                    <div className="row line no-border">
                      <div>
                        <strong>{offer.shop_name}</strong>
                        <div className="muted">Preis {formatPrice(offer.price)} · Quelle {offer.source_name || '—'}</div>
                      </div>
                      <label className="toggle">
                        <input type="checkbox" checked={!!editorState[offer.id]?.is_hidden} onChange={e => setEditorState({ ...editorState, [offer.id]: { ...editorState[offer.id], is_hidden: e.target.checked } })} />
                        <span>Angebot ausblenden</span>
                      </label>
                    </div>
                    <div className="grid two-col">
                      <label className="field"><span>Shop-Name</span><input value={editorState[offer.id]?.shop_name || ''} onChange={e => setEditorState({ ...editorState, [offer.id]: { ...editorState[offer.id], shop_name: e.target.value } })} /></label>
                      <label className="field"><span>Preis</span><input value={editorState[offer.id]?.price || ''} onChange={e => setEditorState({ ...editorState, [offer.id]: { ...editorState[offer.id], price: e.target.value } })} /></label>
                      <label className="field"><span>Quelle</span><input value={editorState[offer.id]?.source_name || ''} onChange={e => setEditorState({ ...editorState, [offer.id]: { ...editorState[offer.id], source_name: e.target.value } })} /></label>
                      <label className="field"><span>Quellen-Gruppe</span><input value={editorState[offer.id]?.source_group || ''} onChange={e => setEditorState({ ...editorState, [offer.id]: { ...editorState[offer.id], source_group: e.target.value } })} /></label>
                      <label className="field"><span>Shop-URL</span><input value={editorState[offer.id]?.product_url || ''} onChange={e => setEditorState({ ...editorState, [offer.id]: { ...editorState[offer.id], product_url: e.target.value } })} /></label>
                      <label className="field"><span>Affiliate-URL (optional)</span><input value={editorState[offer.id]?.affiliate_url || ''} onChange={e => setEditorState({ ...editorState, [offer.id]: { ...editorState[offer.id], affiliate_url: e.target.value } })} placeholder="Falls leer, wird die Shop-URL genutzt" /></label>
                    </div>
                    <div className="row gap-sm wrap">
                      <button className="btn btn-small" onClick={() => saveOffer(offer.id)}>Speichern</button>
                      <a className="btn btn-small btn-ghost" href={offer.redirect_url || '#'} target="_blank" rel="noreferrer">Test-Link</a>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="panel">
            <div className="section-head">
              <div>
                <h2>Letzte Crawler-Läufe</h2>
                <p className="muted no-margin">Fast und Full Crawler für Digitec, BRACK und Interdiscount.</p>
              </div>
            </div>
            <div className="stack">
              {(dashboard?.crawlerRuns || []).map((run, i) => (
                <div className="row line" key={i}>
                  <div>
                    <strong>{run.source_name}</strong>
                    <div className="muted">{run.status}</div>
                  </div>
                  <div className="stat-chip">{run.items_written}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="section-head">
              <div>
                <h2>Klicktracking</h2>
                <p className="muted no-margin">Top Produkte, Shops und letzte Weiterleitungen.</p>
              </div>
            </div>
            <div className="admin-grid">
              <div className="subpanel light-panel">
                <h3>Top Produkte</h3>
                <div className="stack">
                  {(dashboard?.topClickedProducts || []).map((item, i) => (
                    <div className="row line" key={item.product_slug || i}>
                      <div>
                        <strong>{item.title}</strong>
                        <div className="muted">{item.product_slug}</div>
                      </div>
                      <div className="stat-chip">{item.clicks}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="subpanel light-panel">
                <h3>Top Shops</h3>
                <div className="stack">
                  {(dashboard?.topClickedShops || []).map((item, i) => (
                    <div className="row line" key={item.shop_name || i}>
                      <strong>{item.shop_name}</strong>
                      <div className="stat-chip">{item.clicks}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="subpanel light-panel mt-16">
              <h3>Letzte Klicks</h3>
              <div className="stack">
                {(dashboard?.recentClicks || []).map((item, i) => (
                  <div className="row line" key={`${item.product_slug}-${item.created_at}-${i}`}>
                    <div>
                      <strong>{item.title}</strong>
                      <div className="muted">{item.shop_name}</div>
                    </div>
                    <div className="muted">{formatDate(item.created_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
      </div>
    )
  }

  if (selected && route.startsWith('/product/')) {
    const cheapest = selected.offers?.[0]
    return (
      <div className="shell">
        <Header />
        <main className="content product-page">
          <section className="product-layout">
            <div className="product-main panel product-hero-panel">
              <div className="badge">{selected.offers?.length > 1 ? `${selected.offers.length} Shops im Vergleich` : '1 Shop verfügbar'}</div>
              <h1 className="product-title">{selected.title}</h1>
              <p className="product-copy">{selected.ai_summary || recommendationText(selected.deal_score ?? 0)}</p>

              <div className="trust-strip product-trust-strip">
                <TrustBullet icon="✓">Schweizer Shops</TrustBullet>
                <TrustBullet icon="↻">Laufend aktualisiert</TrustBullet>
                <TrustBullet icon="₿">Direkte Shop-Weiterleitung</TrustBullet>
              </div>

              <div className="detail-list">
                <div><span>Marke</span><strong>{selected.brand || '—'}</strong></div>
                <div><span>Kategorie</span><strong>{selected.category || '—'}</strong></div>
                <div><span>Bestpreis-Shop</span><strong>{selected.shop_name || cheapest?.shop_name || '—'}</strong></div>
              </div>
            </div>

            <aside className="offer-panel">
              <div className="offer-card offer-card-sticky">
                <div className="eyebrow">Bestes aktuelles Angebot</div>
                <div className="price dark">{formatPrice(selected.price)}</div>
                <div className="price-meta">{selected.shop_name || cheapest?.shop_name || 'Shop unbekannt'} · {dealLabel(selected.deal_score ?? 0)}</div>
                <div className="cta-stack">
                  <a className="btn btn-xl" href={`/r/${selected.slug}`} target="_blank" rel="noreferrer">Zum günstigsten Angebot</a>
                </div>
                <div className="alert-box">
                  <h3>Preisalarm setzen</h3>
                  <div className="stack">
                    <input value={alertEmail} onChange={e => setAlertEmail(e.target.value)} placeholder="E-Mail für Preisalarm" />
                    <input value={alertPrice} onChange={e => setAlertPrice(e.target.value)} placeholder="Zielpreis in CHF" />
                    <button className="btn" onClick={createAlert}>Preisalarm speichern</button>
                  </div>
                </div>
              </div>
            </aside>
          </section>

          <section className="panel comparison-panel">
            <div className="section-head">
              <div>
                <h2>Preisvergleich</h2>
                <p className="muted no-margin">Alle aktuell importierten Angebote für dieses Produkt.</p>
              </div>
            </div>
            <div className="offers-table">
              {(selected.offers || []).map((offer, idx) => (
                <div className={`offer-row ${idx === 0 ? 'offer-row-best' : ''}`} key={`${offer.shop_name}-${idx}`}>
                  <div className="offer-shop">
                    <strong>{offer.shop_name}</strong>
                    <div className="muted">Zuletzt aktualisiert: {formatDate(offer.updated_at)}</div>
                  </div>
                  <div className="offer-row-right">
                    <strong className="offer-price">{formatPrice(offer.price)}</strong>
                    {idx === 0 ? <span className="result-pill">Günstigster Shop</span> : null}
                    <a className="btn btn-small" href={`/r/${selected.slug}/${encodeURIComponent(offer.shop_name)}`} target="_blank" rel="noreferrer">Zum Shop</a>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    )
  }

  const resultsTitle = route === '/search' && query ? `Ergebnisse für „${query}“` : 'Aktuelle Angebote'
  const searchCtaHref = query ? '#/search' : '#/search'

  return (
    <div className="shell">
      <Header />
      <main className="content home-content">
        <section className="panel home-simple">
          <div className="home-logo">KAUVIO<span className="brand-point">.</span></div>
          <p className="home-subtitle">Preisvergleich Schweiz</p>
          <h1 className="home-title">Suche. Vergleiche. Kaufe smarter.</h1>
          <p className="home-lead">
            Finde in Sekunden aktuelle Preise aus Schweizer Shops – klar, schnell und ohne Umwege.
          </p>
          <div className="search-shell hero-search home-search-centered">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Produkt, Modell oder Marke suchen (z. B. iPhone 15 Pro 256GB)"
            />
            <a className="btn hero-search-btn" href={searchCtaHref}>Jetzt vergleichen</a>
          </div>
          <div className="home-trust-row">
            <TrustBullet icon="✓">Live Shop-Preise</TrustBullet>
            <TrustBullet icon="⚡">Schnelle Suche</TrustBullet>
            <TrustBullet icon="🔒">Direkter Shop-Link</TrustBullet>
          </div>
        </section>

        <section className="panel featured-panel">
          <div className="section-head">
            <div>
              <h2>{resultsTitle}</h2>
              <p className="muted no-margin">Direkt aus dem aktuellen Live-Import.</p>
            </div>
          </div>

          {loadingProducts ? (
            <div className="empty-state">
              <h3>Produkte werden geladen</h3>
              <p>Die aktuellen Shopdaten werden gerade abgefragt.</p>
            </div>
          ) : featured.length ? (
            <div className="product-grid">
              {featured.map((item) => <ProductCard item={item} key={item.slug} />)}
            </div>
          ) : (
            <div className="empty-state">
              <h3>Keine Produkte gefunden</h3>
              <p>Versuche z. B. „iPhone“, „Samsung“ oder „MacBook“.</p>
            </div>
          )}
        </section>

        <section className="panel search-results-panel">
          <div className="section-head">
            <div>
              <h2>Weitere Angebote</h2>
              <p className="muted no-margin">Die Suche nutzt importierte Shop-Datenbankeinträge für schnelle Ergebnisse.</p>
            </div>
          </div>
          <div className="results-list-pro">
            {products.map((item) => (
              <a className="result-card-pro" href={`#/product/${item.slug}`} key={item.slug}>
                <div className="result-card-copy">
                  <div className="result-card-title">{item.title}</div>
                  <div className="result-card-meta">{item.brand || '—'} · {item.category || 'Produkt'} · {item.offer_count} Shop{item.offer_count === 1 ? '' : 's'}</div>
                </div>
                <div className="result-card-side">
                  <span className="result-pill">{item.decision?.label || dealLabel(item.deal_score ?? 0)}</span>
                  <strong className="price-inline">{formatPrice(item.price)}</strong>
                </div>
              </a>
            ))}
          </div>
        </section>

        <footer className="site-footer">
          <div className="footer-inner">
            <div>
              <strong>Kauvio</strong>
              <p className="muted no-margin">Schweizer Preisvergleich mit Fokus auf klare Preise und direkte Wege zum passenden Shop.</p>
            </div>
            <div className="footer-links">
              <a href="#/impressum">Impressum</a>
              <a href="#/admin/login">Interner Bereich</a>
            </div>
          </div>
        </footer>

      </main>
    </div>
  )
}
