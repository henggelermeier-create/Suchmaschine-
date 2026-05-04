import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './product-gallery.css'
import Root from './Root.jsx'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
