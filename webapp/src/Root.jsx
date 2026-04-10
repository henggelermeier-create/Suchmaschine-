import React from 'react'
import SearchSuggestBox from './SearchSuggestBox.jsx'

const formatPrice = (value) => value != null ? `CHF ${Number(value).toFixed(2)}` : '—'

function dealLabel(score) {
  if (score >= 88) return 'Top Deal'
  if (score >= 78) return 'Starker Preis'
  return 'Live Preis'
}

function HomeResultCard({ item }) {
  return (
    <a className="swiss-result-card" href={`#/product/${item.slug}`}>
      <div className="swiss-result-card-head">
        <span className="result-pill">{item.decision?.label || dealLabel(item.deal_score ?? 0)}</span>
        <span className="muted small">{item.offer_count} Anbieter</span>
      </div>
      <div className="swiss-result-title">{item.title}</div>
      <div className="swiss-result-meta">{item.brand || 'Schweizer Shopvergleich'} · {item.category || 'Produktkategorie'}</div>
      <div className="swiss-result-footer">
        <div>
          <strong className="price-inline">{formatPrice(item.price)}</strong>
          <div className="muted small">Bester Preis bei {item.shop_name || 'einem Shop'}</div>
        </div>
        <span className="swiss-link-arrow">→</span>
      </div>
    </a>
  )
}

function HeroTopProduct({ item, index }) {
  return (
    <a className="swiss-top-product" href={`#/product/${item.slug}`}>
      <div className="swiss-top-product-rank">{index + 1}</div>
      <div className="swiss-top-product-copy">
        <strong>{item.title}</strong>
        <span>{item.shop_name || 'Shop'} · {formatPrice(item.price)}</span>
      </div>
      <span className="result-pill">{item.decision?.label || dealLabel(item.deal_score ?? 0)}</span>
    </a>
  )
}

export default function HomePageProfessional({ query, setQuery, loadingProducts, featured, products, liveSearch }) {
  const title = query ? `Resultate für „${query}“` : 'Aktuelle Preisübersicht'
  const topProducts = [...featured]
    .sort((a, b) => {
      const scoreA = Number(a.deal_score || 0) + Number(a.offer_count || 0) * 2
      const scoreB = Number(b.deal_score || 0) + Number(b.offer_count || 0) * 2
      return scoreB - scoreA
    })
    .slice(0, 3)

  return (
    <main className="content home-content swiss-home">
      <section className="panel swiss-hero">
        <div className="swiss-hero-copy">
          <div className="swiss-kicker">Schweizer Preisvergleich</div>
          <h1 className="swiss-title">Preise aus Schweizer Shops. Klar verglichen. Schnell gefunden.</h1>
          <p className="swiss-lead">
            Kauvio zeigt dir aktuelle Angebote aus Schweizer Onlineshops in einer ruhigen, professionellen Übersicht.
            Du vergleichst Preise direkt in CHF und gelangst ohne Umwege zum passenden Shop.
          </p>

          <SearchSuggestBox
            query={query}
            setQuery={setQuery}
            href="#/search"
            placeholder="Suche nach Produkt oder Marke – z. B. iPhone 15, Galaxy S24 oder MacBook Air"
          />

          <div className="swiss-badge-row">
            <span className="trust-item"><span className="trust-icon">CH</span>Fokus auf Schweizer Händler</span>
            <span className="trust-item"><span className="trust-icon">CHF</span>Preise direkt in Schweizer Franken</span>
            <span className="trust-item"><span className="trust-icon">✓</span>Klare Resultate ohne Umwege</span>
          </div>
        </div>

        <div className="swiss-hero-side">
          <div className="swiss-highlight-card">
            <div className="eyebrow">Top Produkte</div>
            <h2>Beliebte Vergleiche auf einen Blick.</h2>
            <p>Die rechte Spalte zeigt priorisierte Produkte mit starkem Deal-Score und mehreren aktiven Angeboten.</p>
            <div className="swiss-top-products-list">
              {topProducts.length ? topProducts.map((item, index) => (
                <HeroTopProduct key={item.slug} item={item} index={index} />
              )) : (
                <div className="swiss-proof-card">
                  <strong>Top-Produkte folgen</strong>
                  <span>Sobald wieder Produktdaten vorhanden sind, erscheinen hier automatisch die stärksten Vergleiche.</span>
                </div>
              )}
            </div>
            <div className="swiss-why-list-wrap">
              <div className="eyebrow">Warum Kauvio</div>
              <ul className="swiss-why-list">
                <li><strong>Schweizer Shops:</strong> Relevante Anbieter für den lokalen Markt.</li>
                <li><strong>Saubere Übersicht:</strong> Preis, Anbieter und Kategorie stehen im Zentrum.</li>
                <li><strong>Schnelle Entscheidung:</strong> Direkt vom Vergleich zum passenden Shop.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {liveSearch ? (
        <section className="panel swiss-section" style={{ border: '1px solid rgba(37, 99, 235, 0.18)', background: 'rgba(239, 246, 255, 0.85)' }}>
          <div className="section-head">
            <div>
              <h2>Live-Suche läuft</h2>
              <p className="muted no-margin">{liveSearch.userVisibleNote || 'Wir bereiten gerade Live-Ergebnisse aus Schweizer Quellen auf.'}</p>
            </div>
          </div>
          <div className="swiss-benefits-grid">
            <div className="info-card">
              <h3>Suchauftrag</h3>
              <p>ID {liveSearch.id} · Status {liveSearch.status || 'pending'} · Strategie {liveSearch.strategy || 'hybrid_ai_live'}</p>
            </div>
            <div className="info-card">
              <h3>Quellen</h3>
              <p>Toppreise, Schweizer Shop-Seiten und weitere öffentliche Quellen werden jetzt im Backend gesammelt.</p>
            </div>
            <div className="info-card">
              <h3>KI-Merge</h3>
              <p>Gefundene Artikel werden zusammengeführt, bereinigt und anschliessend in den Vergleich übernommen.</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="panel swiss-section">
        <div className="section-head">
          <div>
            <h2>{title}</h2>
            <p className="muted no-margin">Ausgewählte Ergebnisse aus dem aktuellen Datenbestand für einen schnellen ersten Überblick.</p>
          </div>
        </div>

        {loadingProducts ? (
          <div className="empty-state">
            <h3>Resultate werden geladen</h3>
            <p>Die aktuellen Preis- und Shopdaten werden vorbereitet.</p>
          </div>
        ) : featured.length ? (
          <div className="swiss-result-grid">
            {featured.map((item) => <HomeResultCard item={item} key={item.slug} />)}
          </div>
        ) : (
          <div className="empty-state">
            <h3>Keine passenden Resultate gefunden</h3>
            <p>Versuche Begriffe wie „iPhone“, „Samsung“, „MacBook“ oder „Staubsauger“.</p>
          </div>
        )}
      </section>

      <section className="panel swiss-section swiss-benefits-section">
        <div className="section-head">
          <div>
            <h2>Was die Startseite besser macht</h2>
            <p className="muted no-margin">Mehr Vertrauen, weniger Ablenkung und eine Sprache, die zu einem Schweizer Vergleichsdienst passt.</p>
          </div>
        </div>
        <div className="swiss-benefits-grid">
          <div className="info-card">
            <h3>Seriöser erster Eindruck</h3>
            <p>Die Oberfläche wirkt ruhiger, hochwertiger und näher an einer professionellen Schweizer Vergleichsplattform.</p>
          </div>
          <div className="info-card">
            <h3>Klarere Texte</h3>
            <p>Alle Startseitentexte wurden verständlicher formuliert und auf Nutzen, Vertrauen und Entscheidungssicherheit ausgerichtet.</p>
          </div>
          <div className="info-card">
            <h3>Stärkerer Fokus auf Suche</h3>
            <p>Die Suche steht im Zentrum und führt Besucher schneller von der ersten Frage zum konkreten Angebot.</p>
          </div>
        </div>
      </section>

      <section className="panel swiss-section">
        <div className="section-head">
          <div>
            <h2>Weitere Angebote im Überblick</h2>
            <p className="muted no-margin">Alle weiteren Treffer aus dem aktuellen Shopvergleich – kompakt, lesbar und direkt anklickbar.</p>
          </div>
        </div>
        <div className="results-list-pro swiss-results-list">
          {products.map((item) => (
            <a className="result-card-pro swiss-list-card" href={`#/product/${item.slug}`} key={item.slug}>
              <div className="result-card-copy">
                <div className="result-card-title">{item.title}</div>
                <div className="result-card-meta">{item.brand || '—'} · {item.category || 'Produkt'} · {item.offer_count} Anbieter</div>
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
        <div className="footer-inner swiss-footer-inner">
          <div>
            <strong>Kauvio</strong>
            <p className="muted no-margin">Professioneller Preisvergleich für die Schweiz mit Fokus auf Übersicht, Vertrauen und schnellen Entscheidungen.</p>
          </div>
          <div className="footer-links">
            <a href="#/impressum">Impressum</a>
            <a href="#/admin/login">Intern</a>
          </div>
        </div>
      </footer>
    </main>
  )
}
