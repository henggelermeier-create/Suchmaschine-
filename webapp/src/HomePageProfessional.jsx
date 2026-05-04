import React from 'react'
import { BrandWordmark } from './Brand.jsx'
import SearchSuggestBox from './SearchSuggestBox.jsx'
import { Bot, Trophy, Store, ArrowRight, Zap, ImageOff, Database } from 'lucide-react'

const formatPrice = (value) => value != null ? `CHF ${Number(value).toFixed(2)}` : 'Preis folgt'

function imageFor(item = {}) {
  return item.image_url || item.imageUrl || item.thumbnail_url || item.thumbnailUrl || null
}

function iconForItem(item) {
  const label = String(item.decision?.label || item.deal_label || '').toLowerCase()
  if (label.includes('top') || label.includes('best')) return Trophy
  if (Number(item.offer_count || 0) >= 3) return Store
  return Bot
}

function toneForItem(item) {
  const label = String(item.decision?.label || item.deal_label || '').toLowerCase()
  if (label.includes('top') || label.includes('best')) return 'tone-hot'
  if (Number(item.offer_count || 0) >= 3) return 'tone-mint'
  return 'tone-violet'
}

function MiniProductImage({ item }) {
  const src = imageFor(item)
  if (!src) return <div className="home-product-image placeholder"><ImageOff size={24} /></div>
  return <img className="home-product-image" src={src} alt={item.title || 'Produkt'} loading="lazy" />
}

function HomeResultCard({ item }) {
  const Icon = iconForItem(item)
  const tone = toneForItem(item)
  return (
    <a className="home-product-card" href={`#/product/${item.slug}`}>
      <MiniProductImage item={item} />
      <div className="home-product-content">
        <div className="result-card-top">
          <span className={`chip ${tone}`}><Icon size={14} /> {item.decision?.label || item.deal_label || 'KI Match'}</span>
          <span className="muted small">{item.offer_count || 0} Shops</span>
        </div>
        <div className="result-card-title">{item.title}</div>
        <div className="result-card-meta">{item.brand || 'KI'} · {item.shop_name || 'DB Cache'}</div>
        <div className="result-card-bottom">
          <strong className="price-inline">{formatPrice(item.price)}</strong>
          <span className="arrow-circle"><ArrowRight size={16} /></span>
        </div>
      </div>
    </a>
  )
}

export default function HomePageProfessional({ query, setQuery, loadingProducts, items, liveSearch, onSearch }) {
  return (
    <main className="page-shell home-shell home-youth-shell">
      <section className="home-hero-clean">
        <div className="home-brand-row">
          <BrandWordmark />
          <span className="chip tone-mint"><Zap size={14} /> KI Preisfinder</span>
        </div>

        <h1>Such. Find. Spar.</h1>
        <p>Schweizer Shops, echte Angebote, sofort aus dem Cache.</p>

        <SearchSuggestBox
          query={query}
          setQuery={setQuery}
          onSubmit={onSearch}
          placeholder="Was suchst du?"
        />

        <div className="home-quick-row">
          {['iPhone 16 Pro', 'AirPods Pro', 'Dyson V15', 'Gaming Laptop'].map((term) => (
            <button key={term} type="button" onClick={() => onSearch?.(term)}>{term}</button>
          ))}
        </div>

        <div className="home-mini-stats">
          <span><Database size={14} /> DB-first</span>
          <span><Bot size={14} /> KI sortiert</span>
          <span><Store size={14} /> Shops live</span>
        </div>
      </section>

      {liveSearch ? (
        <section className="home-live-strip">
          <Bot size={16} /> KI sucht weiter und speichert neue Treffer.
        </section>
      ) : null}

      <section className="home-products-section">
        <div className="section-head home-section-head">
          <div>
            <h2>Trending Deals</h2>
            <p className="muted no-margin">Kurz, klar, schnell.</p>
          </div>
          <a className="suggest-pill" href="#/search?q=iPhone%2016%20Pro">Mehr entdecken</a>
        </div>

        {loadingProducts ? (
          <div className="skeleton-grid"><div /><div /><div /></div>
        ) : items.length ? (
          <div className="home-product-grid">
            {items.slice(0, 6).map((item) => <HomeResultCard key={item.slug} item={item} />)}
          </div>
        ) : (
          <div className="empty-state"><h3>Noch leer</h3><p>Starte eine Suche. Die KI baut den Vergleich auf.</p></div>
        )}
      </section>
    </main>
  )
}
