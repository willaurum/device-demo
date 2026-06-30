// ============================================================================
// auth.js  --  API-key authentication + tenant resolution (FEATURE 2)
// ----------------------------------------------------------------------------
// This is the gate. Every caller (the dashboard, or any script hitting the API)
// must present a secret API key. This module turns that key into a TENANT, and
// the rest of the backend then only ever works with that tenant's data.
//
// Where the key comes from in a request:
//   * REST  -> the "Authorization: Bearer <key>" header (or "x-api-key").
//   * WebSocket -> a "?token=<key>" query parameter, because browsers can't set
//     custom headers when opening a WebSocket. ws.js calls resolveApiKey()
//     directly for that case.
//
// This demo uses plain API keys looked up in the tenants table. A production
// system would likely use signed tokens (JWT) or hashed keys, but the SHAPE is
// the same: prove who you are -> get a tenant -> scope every query to it.
// ============================================================================

const db = require('./db');

// Small in-memory cache so we don't hit the database on every single request.
// API keys are static here, so caching successful lookups is safe. We only
// cache HITS -- a miss is re-checked each time, so adding a tenant later still
// works without a restart.
const cache = new Map(); // apiKey -> { id, name }

// Turn an API key into a tenant, or null if the key is unknown/empty.
async function resolveApiKey(apiKey) {
  if (!apiKey) return null;
  if (cache.has(apiKey)) return cache.get(apiKey);

  const tenant = await db.getTenantByApiKey(apiKey);
  if (tenant) cache.set(apiKey, tenant);
  return tenant;
}

// Pull the API key out of an Express request. We accept either the standard
// "Authorization: Bearer <key>" header or a simpler "x-api-key" header.
function apiKeyFromRequest(req) {
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice('Bearer '.length).trim();
  return (req.headers['x-api-key'] || '').trim();
}

// Express middleware: put this in front of any route that needs a logged-in
// tenant. On success it attaches `req.tenant = { id, name }` and calls next();
// on failure it answers 401 and the route never runs.
function requireAuth(req, res, next) {
  const key = apiKeyFromRequest(req);
  resolveApiKey(key)
    .then((tenant) => {
      if (!tenant) {
        return res.status(401).json({ error: 'missing or invalid API key' });
      }
      req.tenant = tenant;   // <-- everything downstream scopes to this
      next();
    })
    .catch((err) => res.status(500).json({ error: err.message }));
}

module.exports = { resolveApiKey, requireAuth };
