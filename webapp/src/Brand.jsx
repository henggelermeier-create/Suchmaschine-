import React from 'react'

export function BrandWordmark({ small = false, align = 'center', withTagline = true }) {
  const sizeClass = small ? 'brand-name-small' : 'brand-name-large'
  return (
    <div className={`brand-wordmark-wrap align-${align}`}>
      <div className="brand-wordmark-line">
        <div className={`brand-wordmark-name ${sizeClass}`}>KAUVIO</div>
        <span className={`brand-swiss-cross ${small ? 'brand-swiss-cross-small' : ''}`}>
          <span className="cross-v" />
          <span className="cross-h" />
        </span>
      </div>
      {withTagline ? <div className="brand-tagline">Schweiz · KI Suche</div> : null}
    </div>
  )
}
