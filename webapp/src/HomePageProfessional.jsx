import React from 'react'
import { BrandWordmark } from './Brand.jsx'
import SearchSuggestBox from './SearchSuggestBox.jsx'
import { Bot, Trophy, Store, BadgeSwissFranc, ScanSearch, ShieldCheck, ArrowRight } from 'lucide-react'

const formatPrice = (value) => value != null ? `CHF ${Number(value).toFixed(2)}` : '—'

function iconForItem(item) {
  const label = String(item.decision?.label || item.deal_label || '').toLowerCase()
  if (label.includes('top') || label.includes('best')) return Trophy
  if (Number(item.offer_count || 0) >= 3) return Store
  return Bot
}

function toneForItem(item) {
  const label = String(item.decision?.label || item.deal_label || '').toLowerCase()
  if (label.includes('top') || label.includes('best')) return 'tone-red'
  if (Number(item.offer_count || 0) >= 3) return 'tone-slate'
  return 'tone-blue'
}

function HomeResultCard({ item }) {
  const Icon = iconForItem(item)
  const tone = toneForItem(item)
  return (
    <a className="result-card" href={`#/product/${item.slug}`}>
      <div className="result-card-top">
        <span className={`chip ${tone}`}><Icon size={14} /> {item.decision?.label || item.deal_label || 'Live KI'}</span>
        <span className="muted small">{item.offer_count || 0} Shops</span>
      </div>
      <div className="result-card-title">{item.title}</div>
      <div className="result-card-meta">{item.brand || 'Schweizer Vergleich'} · {item.category || 'Produkt'}</div>
      <div className="result-card-bottom">
        <div>
          <strong className="price-inline">{formatPrice(item.price)}</strong>
          <div className="muted small">Bester Preis bei {item.shop_name || 'KI Index'}</div>
        </div>
        <span className="arrow-circle"><ArrowRight size={16} /></span>
      </div>
    </a>
  )
}

export default function HomePageProfessional({ query, setQuery, loadingProducts, items, liveSearch, onSearch }) {
  return (
    <main className="page-shell home-shell">
      <section className="hero-panel hero-panel-polished">
        <div className="hero-kicker">KI-gestützter Preisvergleich für Schweizer Shops</div>
        <BrandWordmark />
        <h1 className="hero-title hero-title-polished">Ruhige Suche. Echte KI-Pipeline. Klare Vergleiche für die Schweiz.</h1>
        <p className="hero-text hero-text-polished">
          Kauvio findet Produktseiten automatisch, liest Daten mit KI aus, merged gleiche Produkte und baut den Preisvergleich sauber auf.
        </p>

        <SearchSuggestBox
          query={query}
          setQuery={setQuery}
          onSubmit={onSearch}
          placeholder="z. B. iPhone 16 Pro, Dyson V15 oder Sony WH-1000XM6"
        />

        <div className="status-row">
          <span className="status-chip tone-red"><Trophy size={14} /> Bestpreis erkannt</span>
          <span className="status-chip tone-slate"><Store size={14} /> Schweizer Shops</span>
          <span className="status-chip tone-blue"><Bot size={14} /> Live KI Analyse</span>
          <span className="status-chip tone-slate"><BadgeSwissFranc size={14} /> CHF direkt sichtbar</span>
          <span className="status-chip tone-blue"><ScanSearch size={14} /> Produkt-Merge aktiv</span>
          <span className="status-chip tone-red"><ShieldCheck size={14} /> Klare Resultate</span>
        </div>
      </section>

      {liveSearch ? (
        <section className="info-panel tone-panel-blue">
          <div className="section-head">
            <div>
              <h2>Live-Suche läuft</h2>
              <p className="muted no-margin">{liveSearch.userVisibleNote || 'Die KI bereitet Live-Ergebnisse aus Schweizer Quellen auf.'}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="results-section">
        <div className="section-head">
          <div>
            <h2>Aktuelle KI-Vergleiche für die Schweiz</h2>
            <p className="muted no-margin">Nur 6 Vergleiche auf der Startseite. Ähnliche Produkte und weitere Vorschläge erst im Suchergebnis.</p>
          </div>
        </div>
        {loadingProducts ? (
          <div className="empty-state"><h3>Vergleiche werden geladen</h3><p>Die aktuellen Produkt- und Shopdaten werden vorbereitet.</p></div>
        ) : items.length ? (
          <div className="results-grid home-results-grid">
            {items.slice(0, 6).map((item) => <HomeResultCard key={item.slug} item={item} />)}
          </div>
        ) : (
          <div className="empty-state"><h3>Noch keine Vergleiche sichtbar</h3><p>Starte eine Suche, damit die KI neue Produkte findet und vergleicht.</p></div>
        )}
      </section>
    </main>
  )
}
