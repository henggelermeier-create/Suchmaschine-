import React, { useEffect, useMemo, useRef, useState } from 'react'
import { BrandWordmark } from './Brand.jsx'
import { Search, Trophy, Store, Bot, ScanSearch, ArrowRight, Layers3, Sparkles, Settings2, Activity, Database, BarChart3, Zap, ImageOff, Gauge, Radio, BrainCircuit } from 'lucide-react'

const ADMIN_TOKEN_KEY = 'kauvio_admin_token'

function routeNow() { return window.location.hash.replace(/^#/, '') || '/' }
function parseSearchRoute(route) { const match = route.match(/^\/search(?:\?q=(.*))?$/); return decodeURIComponent(match?.[1] || '') }
function readAdminToken() { try { return localStorage.getItem(ADMIN_TOKEN_KEY) || sessionStorage.getItem(ADMIN_TOKEN_KEY) || '' } catch { return '' } }
function persistAdminToken(token) { try { if (token) { localStorage.setItem(ADMIN_TOKEN_KEY, token); sessionStorage.setItem(ADMIN_TOKEN_KEY, token) } else { localStorage.removeItem(ADMIN_TOKEN_KEY); sessionStorage.removeItem(ADMIN_TOKEN_KEY) } } catch {} }
async function api(url, options = {}) { const token = readAdminToken(); const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }; if (token && url.startsWith('/api/admin')) headers.Authorization = `Bearer ${token}`; const res = await fetch(url, { ...options, headers }); const data = await res.json().catch(() => ({})); if (!res.ok) { const err = new Error(data.error || 'Fehler'); err.status = res.status; throw err } return data }
function formatPrice(value) { return value != null ? `CHF ${Number(value).toFixed(2)}` : 'Preis folgt' }
function formatDate(value) { if (!value) return '-'; try { return new Date(value).toLocaleString('de-CH') } catch { return String(value) } }
function imageFor(item = {}) { return item.image_url || item.imageUrl || item.thumbnail_url || item.thumbnailUrl || item.product_image_url || item.productImageUrl || null }
function toneFromLabel(label = '', offerCount = 0) { const lower = String(label || '').toLowerCase(); if (lower.includes('top') || lower.includes('best')) return 'tone-hot'; if (offerCount >= 3) return 'tone-mint'; return 'tone-violet' }
function iconFromLabel(label = '', offerCount = 0) { const lower = String(label || '').toLowerCase(); if (lower.includes('top') || lower.includes('best')) return Trophy; if (offerCount >= 3) return Store; return Bot }
function numberValue(value) { return Number(value || 0).toLocaleString('de-CH') }

function ProductImage({ item, compact = false }) {
  const src = imageFor(item)
  if (!src) return <div className={compact ? 'product-image-placeholder compact' : 'product-image-placeholder'}><ImageOff size={compact ? 18 : 28} /></div>
  return <img className={compact ? 'product-image compact' : 'product-image'} src={src} alt={item.title || item.offer_title || 'Produkt'} loading="lazy" />
}

function Header() {
  return <header className="topbar brand-topbar"><a className="brand-link" href="#/"><BrandWordmark small align="left" withTagline={false} /></a><nav className="nav-pills"><a href="#/">Start</a><a href="#/search?q=iPhone%2016%20Pro">KI Suche</a><a href="#/admin">Admin</a></nav></header>
}

function SearchCard({ item }) {
  const label = item.decision?.label || item.deal_label || 'KI Match'
  const tone = toneFromLabel(label, item.offer_count || 0)
  const Icon = iconFromLabel(label, item.offer_count || 0)
  return <a className="result-card modern-result-card" href={`#/product/${item.slug}`}><div className="result-image-wrap"><ProductImage item={item} /></div><div className="result-card-body"><div className="result-card-top"><span className={`chip ${tone}`}><Icon size={14} /> {label}</span><span className="muted small">{item.offer_count || 0} Shops</span></div><div className="result-card-title">{item.title}</div><div className="result-card-meta">{item.brand || 'KI'} · {item.category || 'Produkt'} · {item.shop_name || 'Datenbank Cache'}</div><div className="result-card-bottom"><div><strong className="price-inline">{formatPrice(item.price)}</strong><div className="muted small">Schnell aus DB geladen · KI prüft nach</div></div><span className="arrow-circle"><ArrowRight size={16} /></span></div></div></a>
}

function SuggestionPills({ items = [], title }) {
  if (!items.length) return null
  return <section className="card-panel glass-panel"><div className="section-head"><div><h2>{title}</h2><p className="muted no-margin">KI-Vorschläge aus dem gespeicherten Produktindex.</p></div></div><div className="pill-cloud">{items.map((item, index) => <a key={`${item.slug || item}-${index}`} className="suggest-pill" href={item.slug ? `#/product/${item.slug}` : `#/search?q=${encodeURIComponent(item)}`}>{item.title || item}</a>)}</div></section>
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
  useEffect(() => { setQuery(initialQuery) }, [initialQuery])
  useEffect(() => { const cleaned = String(initialQuery || '').trim(); if (!cleaned) return; setLoading(true); setError(''); api(`/api/products?q=${encodeURIComponent(cleaned)}`).then((data) => { setResults(data.items || []); setSimilarItems(data.similarItems || []); setSuggestions(data.suggestions || []); setLiveSearch(data.liveSearch || null) }).catch((err) => setError(err.message || 'Suche fehlgeschlagen')).finally(() => setLoading(false)) }, [initialQuery])
  useEffect(() => { if (!liveSearch?.query || results.length > 0) { if (pollRef.current) clearInterval(pollRef.current); pollRef.current = null; return } if (pollRef.current) clearInterval(pollRef.current); pollRef.current = setInterval(async () => { try { const data = await api(`/api/products?q=${encodeURIComponent(liveSearch.query)}`); setResults(data.items || []); setSimilarItems(data.similarItems || []); setSuggestions(data.suggestions || []); setLiveSearch(data.liveSearch || null); if ((data.items || []).length > 0) { clearInterval(pollRef.current); pollRef.current = null } } catch {} }, 6000); return () => { if (pollRef.current) clearInterval(pollRef.current) } }, [liveSearch?.query, results.length])
  function runSearch(nextQuery) { const cleaned = String(nextQuery || '').trim(); if (!cleaned) return; window.location.hash = `/search?q=${encodeURIComponent(cleaned)}` }
  return <main className="page-shell search-shell-page youth-page"><section className="hero-panel compact-hero youth-hero"><span className="chip tone-mint"><Zap size={14} /> KI steuert Suche · DB Cache zuerst</span><BrandWordmark small /><h1 className="search-title">Finde Preise schneller. Die KI sortiert für dich.</h1><p className="hero-text">Ergebnisse werden aus der Datenbank sofort angezeigt. Die KI erweitert danach automatisch Shops, Bilder und Angebote.</p><div className="search-inline-shell youth-search"><Search className="search-inline-icon" size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') runSearch(query) }} placeholder="iPhone, Sneaker, Laptop, Kopfhörer ..." /><button className="btn btn-primary" onClick={() => runSearch(query)}>Go</button></div><div className="status-row top-margin-sm"><span className="status-chip tone-hot"><Trophy size={14} /> Bestpreis</span><span className="status-chip tone-mint"><Database size={14} /> Schnell aus DB</span><span className="status-chip tone-violet"><ScanSearch size={14} /> KI crawlt weiter</span></div></section>{liveSearch ? <section className="info-panel tone-panel-violet"><p className="no-margin">{liveSearch.userVisibleNote || 'KI sucht weiter und speichert neue Treffer automatisch zwischen.'}</p></section> : null}{error ? <section className="info-panel tone-panel-red"><p className="no-margin">{error}</p></section> : null}<section className="results-section"><div className="section-head"><div><h2>KI Vergleich</h2><p className="muted no-margin">{results.length ? `${results.length} gespeicherte Treffer sofort geladen.` : 'Noch keine gespeicherten Treffer für diese Suche.'}</p></div></div>{loading ? <div className="skeleton-grid"><div /><div /><div /></div> : results.length ? <div className="results-grid search-results-grid">{results.map((item) => <SearchCard key={item.slug} item={item} />)}</div> : <div className="empty-state"><h3>KI baut den Vergleich auf</h3><p>Neue Shops und Bilder werden gecrawlt und für die nächsten Aufrufe gespeichert.</p></div>}</section><SuggestionPills items={similarItems} title="Ähnliche Produkte" /><SuggestionPills items={suggestions} title="Weitere KI Vorschläge" /></main>
}

function ProductPage({ slug }) {
  const [product, setProduct] = useState(null)
  useEffect(() => { api(`/api/products/${slug}`).then(setProduct).catch(() => setProduct(null)) }, [slug])
  if (!product) return <main className="page-shell"><section className="empty-state"><h3>Produkt wird geladen</h3></section></main>
  return <main className="page-shell product-page-shell youth-page"><section className="hero-panel product-hero-modern"><div className="product-hero-copy"><span className={`chip ${toneFromLabel(product.decision?.label || product.deal_label, product.offer_count || 0)}`}><Bot size={14} /> {product.decision?.label || product.deal_label || 'KI Vergleich'}</span><h1 className="product-title">{product.title}</h1><p className="hero-text">{product.ai_summary || 'KI aufbereiteter Produktvergleich für die Schweiz.'}</p><div className="status-row top-margin-sm"><span className="status-chip tone-hot"><Trophy size={14} /> {formatPrice(product.price)}</span><span className="status-chip tone-mint"><Store size={14} /> {product.shop_name || 'KI Index'}</span><span className="status-chip tone-violet"><Bot size={14} /> {product.offer_count || 0} Angebote</span></div></div><div className="product-hero-image"><ProductImage item={product} /></div></section><section className="card-panel glass-panel"><div className="section-head"><div><h2>Preisvergleich</h2><p className="muted no-margin">Angebote werden gespeichert, damit die Seite beim nächsten Aufruf schneller lädt.</p></div></div><div className="offer-list">{(product.offers || []).map((offer, index) => <div className="offer-row modern-offer-row" key={`${offer.shop_name}-${index}`}><ProductImage item={offer} compact /><div className="offer-main"><div className="offer-shop">{offer.shop_name}</div><div className="muted small">Zuletzt aktualisiert: {formatDate(offer.updated_at)}</div></div><div className="offer-row-right"><strong className="price-inline">{formatPrice(offer.price)}</strong><a className="btn btn-primary btn-small" href={`/r/${product.slug}/${encodeURIComponent(offer.shop_name)}`} target="_blank" rel="noreferrer">Zum Shop</a></div></div>)}</div></section><SuggestionPills items={product.similarItems || []} title="Ähnliche Produkte" /><SuggestionPills items={product.suggestions || []} title="Weitere Vorschläge" /></main>
}

function AdminPage() {
  const [login, setLogin] = useState({ email: 'admin@kauvio.ch', password: '' })
  const [token, setToken] = useState(readAdminToken())
  const [dashboard, setDashboard] = useState(null)
  const [systemHealth, setSystemHealth] = useState(null)
  const [searchTasks, setSearchTasks] = useState([])
  const [message, setMessage] = useState('')
  const [aiQuery, setAiQuery] = useState('')
  useEffect(() => { if (!token) return; Promise.all([api('/api/admin/dashboard').catch(() => ({ stats: {} })), api('/api/admin/system-health').catch(() => ({ checks: {} })), api('/api/admin/search-tasks').catch(() => ({ items: [] }))]).then(([dash, health, tasks]) => { setDashboard(dash); setSystemHealth(health); setSearchTasks(tasks.items || []) }) }, [token])
  async function loginAdmin(event) { event.preventDefault(); try { const data = await api('/api/admin/login', { method: 'POST', body: JSON.stringify(login) }); persistAdminToken(data.token); setToken(data.token); setMessage('Admin eingeloggt.') } catch (err) { setMessage(err.message || 'Login fehlgeschlagen') } }
  async function startAiSearch() { if (!aiQuery.trim()) return; try { const data = await api('/api/admin/ai/search/start', { method: 'POST', body: JSON.stringify({ query: aiQuery }) }); setMessage(`KI Suche gestartet: ${data.task?.query || aiQuery}`) } catch (err) { setMessage(err.message || 'KI Suche konnte nicht gestartet werden.') } }
  if (!token) return <main className="page-shell admin-shell youth-page"><section className="hero-panel compact-hero youth-hero admin-login-panel"><BrandWordmark /><h1 className="search-title">Admin Login</h1><form className="admin-login-form" onSubmit={loginAdmin}><input value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} placeholder="E-Mail" /><input type="password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} placeholder="Passwort" /><button className="btn btn-primary">Einloggen</button></form>{message ? <p className="muted top-margin-sm">{message}</p> : null}</section></main>
  const brainStats = [
    { label: 'KI Modus', value: 'Auto', icon: BrainCircuit, tone: 'tone-mint' },
    { label: 'DB Produkte', value: numberValue(systemHealth?.checks?.canonical_products?.count), icon: Database, tone: 'tone-mint' },
    { label: 'Angebote Cache', value: numberValue(systemHealth?.checks?.source_offers_v2?.count), icon: Zap, tone: 'tone-violet' },
    { label: 'Shop Quellen', value: numberValue(systemHealth?.checks?.swiss_sources?.count), icon: Store, tone: 'tone-violet' },
    { label: 'KI Seeds', value: numberValue(dashboard?.stats?.autonomousSeeds), icon: Sparkles, tone: 'tone-hot' },
    { label: 'Suchjobs', value: numberValue(dashboard?.stats?.searchTasks), icon: Activity, tone: 'tone-violet' },
  ]
  return <main className="page-shell admin-shell youth-page"><section className="hero-panel compact-hero youth-hero admin-top-panel"><div className="section-head admin-top-head"><div><span className="chip tone-hot"><Settings2 size={14} /> Backend · KI Control Room</span><div className="top-margin-sm"><BrandWordmark small align="left" /></div><h1 className="search-title">AI Brain steuert Shops, Bilder und Cache.</h1><p className="hero-text">Alles läuft DB-first: schnelle gespeicherte Treffer zuerst, KI erweitert automatisch Quellen, Bilder und Imports.</p></div><div className="admin-top-actions"><button className="btn btn-primary btn-small" onClick={startAiSearch}>KI Suche starten</button><button className="btn btn-ghost btn-small" onClick={() => { persistAdminToken(''); setToken('') }}>Abmelden</button></div></div><div className="search-inline-shell youth-search admin-inline-search"><Search className="search-inline-icon" size={18} /><input value={aiQuery} onChange={(e) => setAiQuery(e.target.value)} placeholder="z. B. iPhone 16 Pro 256 GB" /><button className="btn btn-primary" onClick={startAiSearch}>Starten</button></div></section>{message ? <section className="info-panel tone-panel-violet"><p className="no-margin">{message}</p></section> : null}<section className="ai-brain-grid">{brainStats.map((item) => { const Icon = item.icon; return <div className="ai-brain-card glass-panel" key={item.label}><span className={`chip ${item.tone}`}><Icon size={14} /> {item.label}</span><strong>{item.value}</strong><small>Live aus Backend/DB</small></div> })}</section><section className="card-panel glass-panel ai-control-panel"><div><span className="chip tone-mint"><Radio size={14} /> KI läuft autonom</span><h2>Control Room</h2><p className="muted no-margin">Die KI entscheidet: gespeicherte Daten nutzen, fehlende Shops importieren, Bilder nachziehen und Suchjobs priorisieren.</p></div><div className="ai-meter-row"><span>Cache First</span><div className="ai-meter"><i style={{ width: '92%' }} /></div><b>92%</b></div><div className="ai-meter-row"><span>Shop Discovery</span><div className="ai-meter"><i style={{ width: '78%' }} /></div><b>78%</b></div><div className="ai-meter-row"><span>Bild Backfill</span><div className="ai-meter"><i style={{ width: '70%' }} /></div><b>70%</b></div></section><section className="card-panel glass-panel"><div className="section-head"><div><h2>Letzte KI Jobs</h2><p className="muted no-margin">Discovery, Extraktion und DB-Speicherung in einer Linie.</p></div></div><div className="offer-list">{searchTasks.slice(0, 10).map((task) => <div className="offer-row ai-job-row" key={task.id}><div><div className="offer-shop">{task.query}</div><div className="muted small">{task.status} · {task.strategy}</div></div><div className="offer-row-right"><span className="chip tone-violet"><BarChart3 size={14} /> {task.imported_count || 0} Imports</span><span className="chip tone-mint"><Layers3 size={14} /> {task.discovered_count || 0} Discovery</span><span className="chip tone-hot"><Gauge size={14} /> {task.source_count || 0} Quellen</span></div></div>)}</div></section></main>
}

export default function App() {
  const [route, setRoute] = useState(routeNow())
  useEffect(() => { const onHash = () => setRoute(routeNow()); window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash) }, [])
  if (route.startsWith('/product/')) return <div className="shell"><Header /><ProductPage slug={route.replace('/product/', '')} /></div>
  if (route.startsWith('/search')) return <div className="shell"><Header /><SearchPage route={route} /></div>
  if (route.startsWith('/admin')) return <div className="shell"><Header /><AdminPage /></div>
  return <div className="shell"><Header /></div>
}
