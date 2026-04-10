import React, { useEffect, useRef, useState } from 'react'

const formatPrice = (value) => value != null ? `CHF ${Number(value).toFixed(2)}` : '—'

async function fetchSuggestions(query) {
  const q = String(query || '').trim()
  if (q.length < 2) return []

  async function request(url) {
    const res = await fetch(url)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Fehler')
    return data.items || []
  }

  try {
    return (await request(`/api/products/suggest?q=${encodeURIComponent(q)}`)).slice(0, 8)
  } catch {
    return (await request(`/api/products?q=${encodeURIComponent(q)}`)).slice(0, 8)
  }
}

export default function SearchSuggestBox({ query, setQuery, href = '#/search', placeholder }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (String(query || '').trim().length < 2) {
        setItems([])
        return
      }
      setLoading(true)
      try {
        const next = await fetchSuggestions(query)
        setItems(next)
        setOpen(true)
      } catch {
        setItems([])
      } finally {
        setLoading(false)
      }
    }, 220)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    function handleOutside(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    window.addEventListener('mousedown', handleOutside)
    return () => window.removeEventListener('mousedown', handleOutside)
  }, [])

  function selectItem(item) {
    setQuery(item.title)
    setOpen(false)
    window.location.hash = `/product/${item.slug}`
  }

  const showDropdown = open && (loading || items.length > 0 || String(query || '').trim().length >= 2)

  return (
    <div ref={rootRef} style={{ position: 'relative', width: '100%' }}>
      <div className="search-shell swiss-search-shell">
        <input
          value={query}
          onFocus={() => { if (items.length) setOpen(true) }}
          onChange={e => setQuery(e.target.value)}
          placeholder={placeholder}
        />
        <a className="btn hero-search-btn" href={href}>Preise vergleichen</a>
      </div>

      {showDropdown ? (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 10px)',
          left: 0,
          right: 0,
          zIndex: 50,
          background: '#ffffff',
          border: '1px solid rgba(203, 213, 225, 0.95)',
          borderRadius: '20px',
          boxShadow: '0 24px 52px rgba(15, 23, 42, 0.14)',
          overflow: 'hidden'
        }}>
          {loading ? <div className="muted" style={{ padding: '14px 16px' }}>Vorschläge werden geladen…</div> : null}
          {!loading && items.length === 0 ? <div className="muted" style={{ padding: '14px 16px' }}>Keine Vorschläge gefunden.</div> : null}
          {!loading && items.map((item, index) => (
            <button
              key={item.slug}
              type="button"
              onClick={() => selectItem(item)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                border: 0,
                borderTop: index === 0 ? '0' : '1px solid rgba(226, 232, 240, 0.88)',
                background: '#ffffff',
                padding: '14px 16px',
                textAlign: 'left',
                cursor: 'pointer'
              }}
            >
              <div>
                <div style={{ fontWeight: 800 }}>{item.title}</div>
                <div className="muted small">{item.brand || '—'} · {item.shop_name || 'Shop'} · {item.offer_count} Anbieter</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 800 }}>{formatPrice(item.price)}</div>
                <div className="muted small">{item.decision?.label || 'Vorschlag'}</div>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
