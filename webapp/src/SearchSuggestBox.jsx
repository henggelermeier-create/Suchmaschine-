import React, { useEffect, useRef, useState } from 'react'
import { Search, ArrowRight } from 'lucide-react'

const formatPrice = (value) => value != null ? `CHF ${Number(value).toFixed(2)}` : '—'

async function fetchSuggestions(query) {
  const q = String(query || '').trim()
  if (q.length < 2) return []
  const res = await fetch(`/api/products/suggest?q=${encodeURIComponent(q)}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Fehler')
  return data.items || []
}

export default function SearchSuggestBox({ query, setQuery, onSubmit, placeholder, inlineResults = false }) {
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
    if (inlineResults) onSubmit?.(item.title)
    else window.location.hash = `/product/${item.slug}`
  }

  function submit() {
    setOpen(false)
    onSubmit?.(query)
  }

  return (
    <div ref={rootRef} className="searchbox-root searchbox-root-front">
      <div className="searchbox-shell">
        <div className="searchbox-input-wrap">
          <Search className="searchbox-icon" />
          <input
            value={query}
            onFocus={() => { if (items.length) setOpen(true) }}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            placeholder={placeholder}
          />
        </div>
        <button className="btn btn-primary" onClick={submit}>Suche starten</button>
      </div>

      {open && (loading || items.length > 0 || String(query || '').trim().length >= 2) ? (
        <div className="suggest-dropdown home-suggest-dropdown">
          {loading ? <div className="suggest-empty">Vorschläge werden geladen…</div> : null}
          {!loading && items.length === 0 ? <div className="suggest-empty">Keine Vorschläge gefunden.</div> : null}
          {!loading && items.map((item, index) => (
            <button key={item.slug || index} type="button" className="suggest-item" onClick={() => selectItem(item)}>
              <div>
                <div className="suggest-title">{item.title}</div>
                <div className="suggest-meta">{item.brand || '—'} · {item.shop_name || 'KI Index'} · {item.offer_count || 0} Shops</div>
              </div>
              <div className="suggest-side">
                <div className="suggest-price">{formatPrice(item.price)}</div>
                <div className="suggest-open"><ArrowRight size={14} /></div>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
