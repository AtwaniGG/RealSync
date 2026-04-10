/**
 * Recall.ai WebSocket Receiver — handles incoming connections from Recall.ai bots.
 *
 * Recall.ai connects TO us (we provide our WSS URL when creating the bot).
 * Each connection is correlated to a RecallBotAdapter via a unique token
 * passed as a query parameter.
 *
 * Architecture:
 *   Recall.ai bot → wss://api.real-sync.app/ws/recall?token=<uuid>
 *     → lookup adapter in registry → route messages to adapter._handleRecallMessage()
 */

const log = require("../lib/logger");

/* ------------------------------------------------------------------ */
/*  Adapter registry: token → RecallBotAdapter                         */
/* ------------------------------------------------------------------ */

const adapterRegistry = new Map();

/**
 * Register an adapter so incoming Recall.ai WS connections can be routed to it.
 * @param {string} token - Unique correlation token
 * @param {object} adapter - RecallBotAdapter instance
 */
function registerAdapter(token, adapter) {
  adapterRegistry.set(token, adapter);
  log.info("recallWs", `Adapter registered (token: ${token.slice(0, 8)}...)`);
}

/**
 * Unregister an adapter (called on leave/cleanup).
 * @param {string} token
 */
function unregisterAdapter(token) {
  adapterRegistry.delete(token);
  log.info("recallWs", `Adapter unregistered (token: ${token.slice(0, 8)}...)`);
}

/* ------------------------------------------------------------------ */
/*  WebSocket connection handler                                       */
/* ------------------------------------------------------------------ */

/**
 * Attach the Recall.ai WebSocket handler to a ws.Server instance.
 * @param {import("ws").Server} wssRecall
 */
function attachRecallWsHandler(wssRecall) {
  wssRecall.on("connection", (socket, req) => {
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token");

    if (!token) {
      log.warn("recallWs", "Connection rejected: no token provided");
      socket.close(4000, "Missing token");
      return;
    }

    const adapter = adapterRegistry.get(token);
    if (!adapter) {
      log.warn("recallWs", `Connection rejected: unknown token ${token.slice(0, 8)}...`);
      socket.close(4001, "Unknown token");
      return;
    }

    adapter._wsConnection = socket;
    log.info("recallWs", `Recall.ai bot connected (token: ${token.slice(0, 8)}...)`);

    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw);
        adapter._handleRecallMessage(msg);
      } catch (err) {
        log.error("recallWs", `Failed to parse message: ${err.message}`);
      }
    });

    socket.on("close", (code, reason) => {
      adapter._wsConnection = null;
      log.info("recallWs", `Recall.ai bot disconnected (token: ${token.slice(0, 8)}..., code: ${code})`);
    });

    socket.on("error", (err) => {
      log.error("recallWs", `Socket error: ${err.message}`);
    });
  });
}

module.exports = { attachRecallWsHandler, registerAdapter, unregisterAdapter };
