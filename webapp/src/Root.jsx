import React, { useEffect, useState } from 'react'
import HomePageProfessional from './HomePageProfessional.jsx'
import App from './App.jsx'
import './swiss-home.css'

function routeNow() {
  return window.location.hash.replace(/^#/, '') || '/'
}

async function fetchProducts(query = '') {
  const q = String(query || '').trim()
  const url = q ? `/api/products?q=${encodeURIComponent(q)}&limit=24` : '/api/products?limit=6'
  const res = await fetch(url)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Produkte konnten nicht geladen werden.')
  return { items: data.items || [], liveSearch: data.liveSearch || null, query: q }
}

export default function Root() {
  const [route, setRoute] = useState(routeNow())
  const [query, setQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [items, setItems] = useState([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [liveSearch, setLiveSearch] = useState(null)

  useEffect(() => {
    const onHash = () => setRoute(routeNow())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (route !== '/') return
    setLoadingProducts(true)
    fetchProducts('')
      .then(({ items, liveSearch }) => {
        setItems(items)
        setLiveSearch(liveSearch)
        setActiveQuery('')
      })
      .catch(() => {
        setItems([])
        setLiveSearch(null)
      })
      .finally(() => setLoadingProducts(false))
  }, [route])

  async function runSearch(nextQuery) {
    const cleaned = String(nextQuery || '').trim()
    if (!cleaned) return
    setQuery(cleaned)
    setActiveQuery(cleaned)
    setLoadingProducts(true)
    try {
      const data = await fetchProducts(cleaned)
      setItems(data.items)
      setLiveSearch(data.liveSearch)
      setTimeout(() => document.getElementById('home-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
    } catch {
      setItems([])
      setLiveSearch(null)
    } finally {
      setLoadingProducts(false)
    }
  }

  if (route !== '/') return <App />

  return (
    <div className="shell swiss-shell">
      <HomePageProfessional
        query={query}
        setQuery={setQuery}
        activeQuery={activeQuery}
        loadingProducts={loadingProducts}
        items={items}
        liveSearch={liveSearch}
        onSearch={runSearch}
      />
    </div>
  )
}
