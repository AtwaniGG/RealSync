/**
 * Zoom SDK Configuration
 * Configures the Zoom Meeting SDK for bot authentication and integration
 */

const ZOOM_CONFIG = {
  clientId: process.env.ZOOM_CLIENT_ID,
  clientSecret: process.env.ZOOM_CLIENT_SECRET,
  accountId: process.env.ZOOM_ACCOUNT_ID,
  botJid: process.env.ZOOM_BOT_JID,
};

// Validate required Zoom configuration
if (!ZOOM_CONFIG.clientId || !ZOOM_CONFIG.clientSecret || !ZOOM_CONFIG.accountId) {
  console.warn(
    'Warning: Zoom SDK configuration is incomplete. Please set ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, and ZOOM_ACCOUNT_ID in .env'
  );
}

module.exports = ZOOM_CONFIG;
