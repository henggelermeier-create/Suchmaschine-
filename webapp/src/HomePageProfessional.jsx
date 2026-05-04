import React, { useEffect, useMemo, useState } from 'react'
import { BrandWordmark } from './Brand.jsx'
import SearchSuggestBox from './SearchSuggestBox.jsx'
import { Bot, Trophy, Store, ArrowRight, Zap, ImageOff, Camera, X, ChevronLeft, ChevronDown, ChevronUp } from 'lucide-react'

const formatPrice = (value) => value != null ? `CHF ${Number(value).toFixed(2)}` : 'Preis folgt'
const cleanText = (value = '') => String(value || '').replace(/&shy;|­/g, '').replace(/\s+/g, ' ').trim()
const PRODUCT_NOISE = /\b(auf lager|produktdatenblatt|datenblatt|lieferbar|sofort lieferbar|inkl\.|kommunikation:)\b/gi
const QUICK_SEARCH_TERMS = [
  'Nintendo Switch OLED',
  'iPhone 16 Pro 256GB',
  'Samsung Galaxy S24 Ultra',
  'MacBook Air M4',
  'AirPods Pro 2',
  'Dyson V15 Detect',
  'PlayStation 5 Slim',
  'Sony WH-1000XM5',
  'Apple Watch Ultra 2',
  'Garmin Forerunner 965',
  'LG OLED TV 55 Zoll',
  'Gaming Laptop RTX 4070',
  'Ecovacs Deebot X5 Omni',
  'Bosch Akku Bohrmaschine',
  'Samsung OLED Monitor 27 Zoll',
  'iPad Air 11 Zoll',
  'JBL Bluetooth Lautsprecher',
  'Canon EOS R50',
]

function pickQuickTerms(count = 4) {
  const shuffled = [...QUICK_SEARCH_TERMS]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, count)
}

function imageFor(item = {}) { return item.image_url || item.imageUrl || item.thumbnail_url || item.thumbnailUrl || null }
function galleryFor(item = {}) { return [...new Set([imageFor(item), ...((item.image_gallery || item.images || []).filter(Boolean))].filter(Boolean))].slice(0, 10) }
function iconForItem(item) { const label = String(item.decision?.label || item.deal_label || '').toLowerCase(); if (label.includes('top') || label.includes('best')) return Trophy; if (Number(item.offer_count || 0) >= 3) return Store; return Bot }
function toneForItem(item) { const label = String(item.decision?.label || item.deal_label || '').toLowerCase(); if (label.includes('top') || label.includes('best')) return 'tone-hot'; if (Number(item.offer_count || 0) >= 3) return 'tone-mint'; return 'tone-violet' }
function productTitle(item = {}) {
  const title = cleanText(item.title || item.offer_title || 'Produkt')
  const withoutTail = title.replace(PRODUCT_NOISE, ' ').replace(/\s+/g, ' ').trim()
  return withoutTail.length > 92 ? `${withoutTail.slice(0, 92).trim()}…` : withoutTail
}
function detailText(item = {}) {
  const title = cleanText(item.title || '')
  const shortTitle = productTitle(item).replace(/…$/, '')
  return cleanText(title.replace(shortTitle, '').replace(PRODUCT_NOISE, ' ')).slice(0, 360)
}
function specsFor(item = {}) {
  const specs = item.specs_json || item.specs || {}
  if (Array.isArray(specs)) return specs.slice(0, 8).map((value, index) => [`Info ${index + 1}`, value])
  return Object.entries(specs).filter(([key, value]) => key !== 'category' && value != null && String(value).trim()).slice(0, 8)
}
function normalizedShopName(offer = {}) { return cleanText(offer.shop_name || offer.provider || offer.shop || 'Shop').replace(/_/g, ' ') }
function sortedOffers(product = {}) {
  const offers = Array.isArray(product.offers) ? product.offers : []
  return [...offers].filter(Boolean).sort((a, b) => {
    const ap = a.price == null ? Number.POSITIVE_INFINITY : Number(a.price)
    const bp = b.price == null ? Number.POSITIVE_INFINITY : Number(b.price)
    return ap - bp
  })
}

async function fetchProductDetail(slug) {
  if (!slug) return null
  const res = await fetch(`/api/products/${slug}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Produkt konnte nicht geladen werden.')
  return data
}

function MiniProductImage({ item }) {
  const src = imageFor(item)
  if (!src) return <div className="home-product-image placeholder"><ImageOff size={24} /></div>
  return <img className="home-product-image" src={src} alt={productTitle(item)} loading="lazy" />
}

function InlineProductGallery({ item }) {
  const images = galleryFor(item)
  const [selected, setSelected] = useState(images[0] || null)
  useEffect(() => { setSelected(images[0] || null) }, [item?.slug, images[0]])
  if (!images.length) return <div className="inline-detail-image placeholder"><ImageOff size={28} /></div>
  return (
    <div className="inline-detail-gallery">
      <div className="inline-detail-image"><img src={selected || images[0]} alt={productTitle(item)} /></div>
      {images.length > 1 ? <div className="inline-detail-thumbs">{images.map((src, index) => <button key={`${src}-${index}`} className={src === selected ? 'active' : ''} onClick={() => setSelected(src)}><img src={src} alt={`Bild ${index + 1}`} /></button>)}</div> : null}
    </div>
  )
}

function ProductOfferList({ product }) {
  const offers = sortedOffers(product).slice(0, 8)
  const best = offers[0]
  if (!offers.length) return <div className="detail-offers empty"><h4>Shop-Preise</h4><p>Noch kein Shop-Angebot gespeichert. Die KI sucht weiter.</p></div>
  return (
    <div className="detail-offers clean-offers">
      <div className="offer-header-clean"><div><h4>Shop-Preise</h4><p>Der beste Preis ist klar markiert.</p></div>{best ? <span className="best-price-pill">Bester Preis {formatPrice(best.price)}</span> : null}</div>
      {offers.map((offer, index) => {
        const isBest = index === 0
        return <a key={`${offer.id || offer.shop_name || offer.provider}-${index}`} className={isBest ? 'detail-offer-row best' : 'detail-offer-row'} href={offer.redirect_url || offer.product_url || offer.deeplink_url || '#'} target="_blank" rel="noreferrer"><span>{normalizedShopName(offer)}</span>{isBest ? <em>Bester Preis</em> : <small>Weitere Option</small>}<b>{formatPrice(offer.price)}</b><ArrowRight size={15} /></a>
      })}
    </div>
  )
}

function FocusedProductDetails({ item, onBack, loading }) {
  const [showTech, setShowTech] = useState(false)
  const specEntries = specsFor(item)
  const offers = sortedOffers(item)
  const best = offers[0]
  const title = productTitle(item)
  const extra = detailText(item)
  const shopCount = item.offer_count || offers.length || 0
  const bestPrice = best?.price ?? item.price
  const sourceLabel = best ? normalizedShopName(best) : (item.shop_name || item.provider || 'KI Vergleich')
  return (
    <section className="focused-product-view product-clean-view">
      <div className="focused-topbar"><button className="back-button" onClick={onBack}><ChevronLeft size={18} /> Zurück</button><button className="inline-close" onClick={onBack}><X size={16} /></button></div>
      {loading ? <div className="focused-loading">Produktdetails werden geladen…</div> : null}
      <InlineProductGallery item={item} />
      <div className="product-clean-info">
        <span className="chip tone-violet"><Camera size={14} /> Produktdetails</span>
        <h2>{title}</h2>
        <p className="ai-summary-clean">KI Einschätzung: {shopCount > 1 ? 'Vergleich vorhanden' : 'Ein Shop gefunden'} · bester sichtbarer Preis bei {sourceLabel}.</p>
        <div className="focused-price-row"><strong>{formatPrice(bestPrice)}</strong><span>{shopCount} {shopCount === 1 ? 'Shop' : 'Shops'}</span><span>{sourceLabel}</span></div>
        {extra ? <p className="compact-product-text">{extra}</p> : null}
        <button className="tech-toggle" onClick={() => setShowTech(!showTech)}>{showTech ? <ChevronUp size={16} /> : <ChevronDown size={16} />} Technische Details {showTech ? 'ausblenden' : 'anzeigen'}</button>
        {showTech ? <div className="spec-grid compact-specs">{specEntries.length ? specEntries.map(([key, value]) => <div key={key}><b>{key}</b><span>{String(value)}</span></div>) : <><div><b>Quelle</b><span>{sourceLabel}</span></div><div><b>Vergleich</b><span>{shopCount} Angebote</span></div></>}</div> : null}
        <ProductOfferList product={item} />
      </div>
    </section>
  )
}

function HomeResultCard({ item, active, onSelect }) {
  const Icon = iconForItem(item)
  const tone = toneForItem(item)
  return (
    <button type="button" className={active ? 'home-product-card active' : 'home-product-card'} onClick={() => onSelect?.(item)}>
      <MiniProductImage item={item} />
      <div className="home-product-content">
        <div className="result-card-top"><span className={`chip ${tone}`}><Icon size={14} /> {item.decision?.label || item.deal_label || 'KI Match'}</span><span className="muted small">{item.offer_count || 0} Shops</span></div>
        <div className="result-card-title">{productTitle(item)}</div>
        <div className="result-card-meta">{item.brand || 'KI'} · {item.shop_name || 'DB Cache'}</div>
        <div className="result-card-bottom"><strong className="price-inline">{formatPrice(item.price)}</strong><span className="arrow-circle"><ArrowRight size={16} /></span></div>
      </div>
    </button>
  )
}

export default function HomePageProfessional({ query, setQuery, activeQuery, loadingProducts, items, liveSearch, onSearch }) {
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const quickTerms = useMemo(() => pickQuickTerms(4), [])
  useEffect(() => { setSelected(null); setDetail(null) }, [activeQuery])
  const sectionTitle = activeQuery ? 'Deine Ergebnisse' : 'Trending Deals'
  const sectionHint = activeQuery ? `Resultate für „${activeQuery}“` : 'Kurz, klar, schnell.'

  async function openProduct(item) {
    setSelected(item)
    setDetail(item)
    setLoadingDetail(true)
    setTimeout(() => document.getElementById('home-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40)
    try { const full = await fetchProductDetail(item.slug); setDetail({ ...item, ...full }) } catch { setDetail(item) } finally { setLoadingDetail(false) }
  }
  function closeProduct() { setSelected(null); setDetail(null) }

  return (
    <main className="page-shell home-shell home-youth-shell">
      <section className="home-hero-clean">
        <div className="home-brand-row"><BrandWordmark /><span className="chip tone-mint"><Zap size={14} /> KI Preisfinder</span></div>
        <h1>Such. Find. Spar.</h1>
        <p>Schweizer Shops. Echte Angebote. Sofort sichtbar.</p>
        <SearchSuggestBox query={query} setQuery={setQuery} onSubmit={onSearch} placeholder="Was suchst du?" inlineResults />
        <div className="home-quick-row">{quickTerms.map((term) => <button key={term} type="button" onClick={() => onSearch?.(term)}>{term}</button>)}</div>
      </section>
      {liveSearch ? <section className="home-live-strip"><Bot size={16} /> KI sucht weiter und speichert neue Treffer.</section> : null}
      <section id="home-results" className="home-products-section">
        {selected && detail ? <FocusedProductDetails item={detail} onBack={closeProduct} loading={loadingDetail} /> : <><div className="section-head home-section-head"><div><h2>{sectionTitle}</h2><p className="muted no-margin">{sectionHint}</p></div></div>{loadingProducts ? <div className="skeleton-grid"><div /><div /><div /></div> : items.length ? <div className="home-product-grid">{items.slice(0, activeQuery ? 24 : 6).map((item) => <HomeResultCard key={item.slug} item={item} active={selected?.slug === item.slug} onSelect={openProduct} />)}</div> : <div className="empty-state"><h3>Noch leer</h3><p>Die KI liest gerade Schweizer Shopdaten ein.</p></div>}</>}
      </section>
    </main>
  )
}
