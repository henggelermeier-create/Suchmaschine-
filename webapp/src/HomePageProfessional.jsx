import React, { useEffect, useState } from 'react'
import { BrandWordmark } from './Brand.jsx'
import SearchSuggestBox from './SearchSuggestBox.jsx'
import { Bot, Trophy, Store, ArrowRight, Zap, ImageOff, Database, Camera, X, ChevronLeft } from 'lucide-react'

const formatPrice = (value) => value != null ? `CHF ${Number(value).toFixed(2)}` : 'Preis folgt'

function imageFor(item = {}) { return item.image_url || item.imageUrl || item.thumbnail_url || item.thumbnailUrl || null }
function galleryFor(item = {}) { return [...new Set([imageFor(item), ...((item.image_gallery || item.images || []).filter(Boolean))].filter(Boolean))].slice(0, 10) }
function iconForItem(item) { const label = String(item.decision?.label || item.deal_label || '').toLowerCase(); if (label.includes('top') || label.includes('best')) return Trophy; if (Number(item.offer_count || 0) >= 3) return Store; return Bot }
function toneForItem(item) { const label = String(item.decision?.label || item.deal_label || '').toLowerCase(); if (label.includes('top') || label.includes('best')) return 'tone-hot'; if (Number(item.offer_count || 0) >= 3) return 'tone-mint'; return 'tone-violet' }
function specsFor(item = {}) {
  const specs = item.specs_json || item.specs || {}
  if (Array.isArray(specs)) return specs.slice(0, 8).map((value, index) => [`Info ${index + 1}`, value])
  return Object.entries(specs).filter(([, value]) => value != null && String(value).trim()).slice(0, 8)
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
  return <img className="home-product-image" src={src} alt={item.title || 'Produkt'} loading="lazy" />
}

function InlineProductGallery({ item }) {
  const images = galleryFor(item)
  const [selected, setSelected] = useState(images[0] || null)
  useEffect(() => { setSelected(images[0] || null) }, [item?.slug, images[0]])
  if (!images.length) return <div className="inline-detail-image placeholder"><ImageOff size={28} /></div>
  return (
    <div className="inline-detail-gallery">
      <div className="inline-detail-image"><img src={selected || images[0]} alt={item.title || 'Produkt'} /></div>
      {images.length > 1 ? <div className="inline-detail-thumbs">{images.map((src, index) => <button key={`${src}-${index}`} className={src === selected ? 'active' : ''} onClick={() => setSelected(src)}><img src={src} alt={`Bild ${index + 1}`} /></button>)}</div> : null}
    </div>
  )
}

function ProductOfferList({ product }) {
  const offers = Array.isArray(product.offers) ? product.offers.slice(0, 6) : []
  if (!offers.length) return null
  return (
    <div className="detail-offers">
      <h4>Beste Angebote</h4>
      {offers.map((offer, index) => (
        <a key={`${offer.id || offer.shop_name}-${index}`} className="detail-offer-row" href={offer.redirect_url || offer.product_url || '#'} target="_blank" rel="noreferrer">
          <span>{offer.shop_name || offer.provider || 'Shop'}</span>
          <b>{formatPrice(offer.price)}</b>
          <ArrowRight size={15} />
        </a>
      ))}
    </div>
  )
}

function FocusedProductDetails({ item, onBack, loading }) {
  const specEntries = specsFor(item)
  return (
    <section className="focused-product-view">
      <div className="focused-topbar">
        <button className="back-button" onClick={onBack}><ChevronLeft size={18} /> Zurück</button>
        <button className="inline-close" onClick={onBack}><X size={16} /></button>
      </div>
      {loading ? <div className="focused-loading">Produktdetails werden geladen…</div> : null}
      <div className="focused-product-grid">
        <InlineProductGallery item={item} />
        <div className="focused-detail-copy">
          <span className="chip tone-violet"><Camera size={14} /> Produktdetails</span>
          <h2>{item.title}</h2>
          <p>{item.ai_summary || 'KI sammelt Preise, Bilder und technische Daten aus Schweizer Shops.'}</p>
          <div className="focused-price-row">
            <strong>{formatPrice(item.price)}</strong>
            <span>{item.offer_count || item.offers?.length || 0} Shops</span>
            <span>{item.brand || 'Produkt'}</span>
          </div>
          <div className="spec-grid">
            {specEntries.length ? specEntries.map(([key, value]) => <div key={key}><b>{key}</b><span>{String(value)}</span></div>) : (
              <>
                <div><b>Quelle</b><span>{item.shop_name || 'KI Index'}</span></div>
                <div><b>Kategorie</b><span>{item.category || 'Produkt'}</span></div>
                <div><b>Vergleich</b><span>{item.offer_count || 0} Angebote</span></div>
              </>
            )}
          </div>
          <ProductOfferList product={item} />
        </div>
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
        <div className="result-card-title">{item.title}</div>
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
  useEffect(() => { setSelected(null); setDetail(null) }, [activeQuery])
  const sectionTitle = activeQuery ? 'Deine Ergebnisse' : 'Trending Deals'
  const sectionHint = activeQuery ? `Resultate für „${activeQuery}“` : 'Kurz, klar, schnell.'

  async function openProduct(item) {
    setSelected(item)
    setDetail(item)
    setLoadingDetail(true)
    setTimeout(() => document.getElementById('home-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40)
    try {
      const full = await fetchProductDetail(item.slug)
      setDetail({ ...item, ...full })
    } catch {
      setDetail(item)
    } finally {
      setLoadingDetail(false)
    }
  }

  function closeProduct() {
    setSelected(null)
    setDetail(null)
  }

  return (
    <main className="page-shell home-shell home-youth-shell">
      <section className="home-hero-clean">
        <div className="home-brand-row"><BrandWordmark /><span className="chip tone-mint"><Zap size={14} /> KI Preisfinder</span></div>
        <h1>Such. Find. Spar.</h1>
        <p>Schweizer Shops. Echte Angebote. Sofort sichtbar.</p>
        <SearchSuggestBox query={query} setQuery={setQuery} onSubmit={onSearch} placeholder="Was suchst du?" inlineResults />
        <div className="home-quick-row">{['iPhone 16 Pro', 'AirPods Pro', 'Dyson V15', 'Gaming Laptop'].map((term) => <button key={term} type="button" onClick={() => onSearch?.(term)}>{term}</button>)}</div>
        <div className="home-mini-stats"><span><Database size={14} /> DB-first</span><span><Bot size={14} /> KI sortiert</span><span><Store size={14} /> Shops live</span></div>
      </section>

      {liveSearch ? <section className="home-live-strip"><Bot size={16} /> KI sucht weiter und speichert neue Treffer.</section> : null}

      <section id="home-results" className="home-products-section">
        {selected && detail ? (
          <FocusedProductDetails item={detail} onBack={closeProduct} loading={loadingDetail} />
        ) : (
          <>
            <div className="section-head home-section-head"><div><h2>{sectionTitle}</h2><p className="muted no-margin">{sectionHint}</p></div></div>
            {loadingProducts ? <div className="skeleton-grid"><div /><div /><div /></div> : items.length ? (
              <div className="home-product-grid">{items.slice(0, activeQuery ? 24 : 6).map((item) => <HomeResultCard key={item.slug} item={item} active={selected?.slug === item.slug} onSelect={openProduct} />)}</div>
            ) : <div className="empty-state"><h3>Noch leer</h3><p>Die KI liest gerade Schweizer Shopdaten ein.</p></div>}
          </>
        )}
      </section>
    </main>
  )
}
