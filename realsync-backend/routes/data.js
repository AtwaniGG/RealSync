const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { requireSessionOwner, validateSessionId } = require("../lib/auth");
const persistence = require("../lib/persistence");
const { getSession, rehydrateSession, makeIso } = require("../services/sessionManager");

const router = Router();

/* ------------------------------------------------------------------ */
/*  Per-route rate limiters                                             */
/* ------------------------------------------------------------------ */

const settingsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many settings requests." },
});

const notificationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many notification requests." },
});

/**
 * Ownership check for read-only report endpoints that must work for ended
 * sessions (which are evicted from in-memory store after backend restarts).
 *
 * 1. If the session is still in memory → delegate to the standard middleware.
 * 2. If not in memory, fetch the DB row to verify userId ownership, then
 *    proceed.  This covers the post-restart / completed-session case that
 *    previously returned 404 for all three report endpoints.
 */
async function requireReportAccess(req, res, next) {
  const sessionId = req.params.id;

  // Prototype mode (no auth configured) — skip ownership check
  if (req.userId === null) return next();

  // Fast path: session is live in memory — use standard ownership check
  const live = getSession(sessionId);
  if (live) {
    if (live.userId !== req.userId) {
      return res.status(403).json({ error: "Access denied" });
    }
    return next();
  }

  // Session not in memory (ended or evicted) — verify ownership via DB
  const dbSession = await persistence.getSessionById(sessionId, req.userId);
  if (!dbSession) {
    return res.status(404).json({ error: "Session not found" });
  }
  if (dbSession.user_id && dbSession.user_id !== req.userId) {
    return res.status(403).json({ error: "Access denied" });
  }

  // Attach the DB session to the request so handlers can use it
  req.dbSession = dbSession;
  return next();
}

/* ------------------------------------------------------------------ */
/*  GET /api/sessions/:id/alerts                                       */
/* ------------------------------------------------------------------ */

router.get("/api/sessions/:id/alerts", validateSessionId, requireReportAccess, async (req, res) => {
  const sessionId = req.params.id;
  const session = getSession(sessionId);

  // Try Supabase first — authoritative for ended/evicted sessions
  const persisted = await persistence.getSessionAlerts(sessionId);
  if (persisted && persisted.length > 0) {
    // Normalize DB rows: Supabase returns `id`, frontend expects `alertId`
    const normalized = persisted.map((a) => ({ ...a, alertId: a.alertId || a.id }));
    return res.json({ alerts: normalized });
  }

  // Fall back to in-memory data for live sessions
  return res.json({ alerts: session?.alerts || [] });
});

/* ------------------------------------------------------------------ */
/*  GET /api/sessions/:id/transcript                                   */
/* ------------------------------------------------------------------ */

router.get("/api/sessions/:id/transcript", validateSessionId, requireReportAccess, async (req, res) => {
  const sessionId = req.params.id;
  const session = getSession(sessionId);

  // Try Supabase first — authoritative for ended/evicted sessions
  const persisted = await persistence.getSessionTranscript(sessionId);
  if (persisted && persisted.length > 0) {
    return res.json({ lines: persisted });
  }

  // Fall back to in-memory data for live sessions
  return res.json({ lines: session?.transcriptState?.lines || [] });
});

/* ------------------------------------------------------------------ */
/*  GET /api/sessions/:id/report                                       */
/* ------------------------------------------------------------------ */

router.get("/api/sessions/:id/report", validateSessionId, requireReportAccess, async (req, res) => {
  const sessionId = req.params.id;
  const session = getSession(sessionId);

  // Check Supabase for a previously generated report
  let report = await persistence.getSessionReport(sessionId);

  // Validate the report has full data (severityBreakdown etc.)
  const hasFullReport = report?.summary?.severityBreakdown;

  if (!hasFullReport) {
    if (session) {
      // Session is live in memory — build report from authoritative in-memory data
      const sessionAlerts = session.alerts || [];
      report = {
        summary: {
          sessionId: session.id,
          title: session.title,
          meetingType: session.meetingTypeSelected,
          createdAt: session.createdAt,
          endedAt: session.endedAt,
          totalAlerts: sessionAlerts.length,
          totalTranscriptLines: (session.transcriptState?.lines || []).length,
          severityBreakdown: {
            low: sessionAlerts.filter((a) => a.severity === "low").length,
            medium: sessionAlerts.filter((a) => a.severity === "medium").length,
            high: sessionAlerts.filter((a) => a.severity === "high").length,
            critical: sessionAlerts.filter((a) => a.severity === "critical").length,
          },
          generatedAt: makeIso(),
        },
      };
    } else {
      // Session not in memory — build report on-the-fly from Supabase data
      const dbSession = req.dbSession || await persistence.getSessionById(sessionId);
      const [alertsRes, transcriptCount] = await Promise.all([
        persistence.getSessionAlerts(sessionId),
        persistence.getSessionTranscript(sessionId).then((rows) => rows.length),
      ]);

      const alertRows = alertsRes || [];
      const severityBreakdown = { low: 0, medium: 0, high: 0, critical: 0 };
      alertRows.forEach((a) => {
        if (severityBreakdown[a.severity] !== undefined) severityBreakdown[a.severity]++;
      });

      report = {
        summary: {
          sessionId,
          title: dbSession?.title || "Untitled session",
          meetingType: dbSession?.meeting_type || "business",
          createdAt: dbSession?.created_at || makeIso(),
          endedAt: dbSession?.ended_at || null,
          totalAlerts: alertRows.length,
          totalTranscriptLines: transcriptCount,
          severityBreakdown,
          generatedAt: makeIso(),
        },
      };
    }
  }

  return res.json(report);
});

/* ------------------------------------------------------------------ */
/*  Notification endpoints                                             */
/* ------------------------------------------------------------------ */

router.get("/api/notifications", notificationLimiter, async (req, res) => {
  if (!req.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const result = await persistence.getUserNotifications(req.userId, { limit, offset });
  return res.json(result);
});

router.get("/api/notifications/unread-count", notificationLimiter, async (req, res) => {
  if (!req.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const count = await persistence.getUnreadNotificationCount(req.userId);
  return res.json({ unreadCount: count });
});

router.post("/api/notifications/read", notificationLimiter, async (req, res) => {
  if (!req.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const { alertIds, all } = req.body ?? {};

  if (all === true) {
    const result = await persistence.markAllNotificationsRead(req.userId);
    return res.json({ ok: result.ok });
  }

  if (!Array.isArray(alertIds) || alertIds.length === 0) {
    return res.status(400).json({ error: "alertIds array or all:true is required" });
  }

  // H5: Bound alertIds array size
  if (alertIds.length > 100) {
    return res.status(400).json({ error: "alertIds max 100" });
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const valid = alertIds.every((id) => typeof id === "string" && uuidRegex.test(id));
  if (!valid) {
    return res.status(400).json({ error: "alertIds must be valid UUIDs" });
  }

  const result = await persistence.markNotificationsRead(req.userId, alertIds);
  return res.json({ ok: result.ok });
});

/* ------------------------------------------------------------------ */
/*  Detection settings                                                 */
/* ------------------------------------------------------------------ */

router.get("/api/settings", async (req, res) => {
  if (!req.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const settings = await persistence.getDetectionSettings(req.userId);
  return res.json(settings);
});

router.patch("/api/settings", settingsLimiter, async (req, res) => {
  if (!req.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const body = req.body;
  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "Request body must be a JSON object" });
  }
  // Schema validation: only allow known boolean detection settings
  const allowedKeys = ["facialAnalysis", "voicePattern", "emotionDetection"];
  const bodyKeys = Object.keys(body);
  if (bodyKeys.length > 10) {
    return res.status(400).json({ error: "Too many fields" });
  }
  for (const key of bodyKeys) {
    if (!allowedKeys.includes(key)) {
      return res.status(400).json({ error: `Unknown setting: ${key}` });
    }
    if (typeof body[key] !== "boolean") {
      return res.status(400).json({ error: `${key} must be a boolean` });
    }
  }
  const result = await persistence.updateDetectionSettings(req.userId, body);
  if (!result.ok) {
    return res.status(500).json({ error: result.error || "Failed to save settings" });
  }
  const updated = await persistence.getDetectionSettings(req.userId);
  return res.json(updated);
});

module.exports = router;
