import React, { useState } from 'react'

const ADMIN_TOKEN_KEY = 'kauvio_admin_token'

function readAdminToken() {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || sessionStorage.getItem(ADMIN_TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

function clearAdminToken() {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY)
    sessionStorage.removeItem(ADMIN_TOKEN_KEY)
  } catch {}
}

async function api(url, options = {}) {
  const token = readAdminToken()
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(url, { ...options, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || 'Fehler')
    err.status = res.status
    throw err
  }
  return data
}

export default function AdminPasswordPanel() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setMessage('')
    setError('')

    if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
      setError('Bitte alle Felder ausfüllen.')
      return
    }
    if (form.newPassword !== form.confirmPassword) {
      setError('Die neuen Passwörter stimmen nicht überein.')
      return
    }

    setSaving(true)
    try {
      const result = await api('/api/admin/change-password', {
        method: 'POST',
        body: JSON.stringify(form)
      })
      setMessage(result.message || 'Passwort geändert. Bitte neu einloggen.')
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setTimeout(() => {
        clearAdminToken()
        window.location.hash = '/admin/login'
      }, 900)
    } catch (err) {
      setError(err.message || 'Passwort konnte nicht geändert werden.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h2>Admin-Passwort ändern</h2>
          <p className="muted no-margin">Das Passwort wird in der Datenbank gespeichert. Nach dem Ändern wirst du neu eingeloggt.</p>
        </div>
      </div>
      <form className="stack" onSubmit={submit}>
        <div className="grid two-col">
          <label className="field"><span>Aktuelles Passwort</span><input type="password" value={form.currentPassword} onChange={e => setForm({ ...form, currentPassword: e.target.value })} /></label>
          <label className="field"><span>Neues Passwort</span><input type="password" value={form.newPassword} onChange={e => setForm({ ...form, newPassword: e.target.value })} /></label>
        </div>
        <label className="field"><span>Neues Passwort bestätigen</span><input type="password" value={form.confirmPassword} onChange={e => setForm({ ...form, confirmPassword: e.target.value })} /></label>
        {error ? <div className="error-box">{error}</div> : null}
        {message ? <div className="success-box">{message}</div> : null}
        <div className="row gap-sm wrap">
          <button className="btn btn-small" disabled={saving}>{saving ? 'Speichert…' : 'Passwort speichern'}</button>
        </div>
      </form>
    </section>
  )
}
