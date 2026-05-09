const BASE = '/api'
export const api = {
  get:  (path) => fetch(`${BASE}${path}`).then(r => r.json()),
  post: (path, body) => fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  }).then(r => r.json()),
}
export const wsUrl = (path) => `ws://${window.location.hostname}:8000${path}`
