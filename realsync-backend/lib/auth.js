/**
 * Authentication middleware for the RealSync backend.
 *
 * Verifies Supabase JWTs from the Authorization header and attaches
 * `req.userId` to authenticated requests.
 *
 * When Supabase is not configured (prototype / local dev), all requests
 * are allowed through with `req.userId = null` so the app keeps working.
 */

const { getClient } = require("./supabaseClient");

/**
 * Express middleware: extracts Bearer token, verifies with Supabase,
 * and sets `req.userId`. Passes through unauthenticated requests when
 * Supabase is not configured (prototype mode).
 */
async function authenticate(req, res, next) {
  // Health endpoint is always public (needed by load balancers, start.sh, monitoring)
  if (req.path === "/api/health") {
    req.userId = null;
    return next();
  }

  const client = getClient();

  // Prototype mode — no Supabase configured, allow all
  if (!client) {
    req.userId = null;
    return next();
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    // 7.3: `client` is guaranteed truthy here (we returned early above if !client)
    return res.status(401).json({ error: "Authorization header required" });
  }

  try {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    req.userId = data.user.id;
  } catch {
    return res.status(401).json({ error: "Authentication failed" });
  }

  return next();
}

/**
 * Verify the user from a WebSocket query-string token.
 * Returns the userId or null (for prototype mode / missing config).
 */
async function authenticateWsToken(token) {
  const client = getClient();
  if (!client || !token) return null;

  try {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

/**
 * Middleware factory: ensures the authenticated user owns the session
 * identified by `req.params.id`. Must run after `authenticate`.
 *
 * In prototype mode (req.userId === null) ownership checks are skipped.
 *
 * @param {Function} getSessionFn - Synchronous in-memory session lookup.
 * @param {Function} [rehydrateFn] - Optional async fallback that rehydrates
 *   evicted sessions from the database. When provided, 404 is only returned
 *   after the rehydration attempt also fails.
 */
function requireSessionOwner(getSessionFn, rehydrateFn) {
  return async (req, res, next) => {
    // Prototype mode — skip ownership check
    if (req.userId === null) return next();

    let session = getSessionFn(req.params.id);

    // If not in memory, try rehydrating from database
    if (!session && rehydrateFn) {
      session = await rehydrateFn(req.params.id);
    }

    if (!session) return res.status(404).json({ error: "Session not found" });

    // In production, deny access to null-owner sessions for authenticated users
    // In prototype mode (req.userId === null), this block is skipped (early return above)
    if (session.userId === null && process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Access denied — unowned session" });
    }
    if (session.userId !== null && session.userId !== req.userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    return next();
  };
}

module.exports = { authenticate, authenticateWsToken, requireSessionOwner };
