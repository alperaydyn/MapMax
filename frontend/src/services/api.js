const BASE = ''  // proxied by Vite to localhost:8000

async function request(path, opts = {}, token = null) {
  const headers = { 'Content-Type': 'application/json', ...opts.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { ...opts, headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

export const api = {
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  register: (email, name, password) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify({ email, name, password }) }),

  getMe: (token) => request('/auth/me', {}, token),

  googleAuth: (credential) =>
    request('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) }),

  updateLocation: (token, lat, lng, accuracy) =>
    request('/locations/update', { method: 'POST', body: JSON.stringify({ lat, lng, accuracy }) }, token),

  getBookmarks: (token) => request('/locations/bookmarks', {}, token),

  saveBookmark: (token, data) =>
    request('/locations/bookmarks', { method: 'POST', body: JSON.stringify(data) }, token),

  updateBookmark: (token, id, data) =>
    request(`/locations/bookmarks/${id}`, { method: 'PUT', body: JSON.stringify(data) }, token),

  deleteBookmark: (token, id) =>
    request(`/locations/bookmarks/${id}`, { method: 'DELETE' }, token),

  getInsights: (token) => request('/locations/insights', {}, token),

  getPreferences: (token) => request('/locations/preferences', {}, token),

  deletePreference: (token, id) =>
    request(`/locations/preferences/${id}`, { method: 'DELETE' }, token),

  getHistory: (token, limit = 50) => request(`/locations/history?limit=${limit}`, {}, token),
}

export function createAgentSocket(token, onMessage, onClose) {
  const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/agent?token=${token}`
  const ws = new WebSocket(wsUrl)

  ws.onopen = () => console.log('[WS] connected')
  ws.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data)) } catch {}
  }
  ws.onclose = () => onClose?.()
  ws.onerror = (e) => console.error('[WS] error', e)

  return {
    send: (content, location) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'message', content, location }))
      }
    },
    close: () => ws.close(),
    get ready() { return ws.readyState === WebSocket.OPEN },
  }
}
