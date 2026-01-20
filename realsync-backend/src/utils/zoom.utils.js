/**
 * Zoom Utilities
 * Helper functions for Zoom SDK operations
 */

const axios = require('axios');
const zoomConfig = require('../config/zoom.config');

/**
 * Generate Zoom OAuth token for bot authentication
 * Uses Server-to-Server OAuth for secure authentication
 */
const generateZoomToken = async () => {
  try {
    const authHeader = Buffer.from(
      `${zoomConfig.clientId}:${zoomConfig.clientSecret}`
    ).toString('base64');

    const response = await axios.post('https://zoom.us/oauth/token', null, {
      headers: {
        Authorization: `Basic ${authHeader}`,
      },
      params: {
        grant_type: 'client_credentials',
      },
    });

    return response.data.access_token;
  } catch (error) {
    console.error('Error generating Zoom token:', error.message);
    throw new Error('Failed to generate Zoom OAuth token');
  }
};

/**
 * Get Zoom meeting details
 */
const getMeetingDetails = async (meetingId, token) => {
  try {
    const response = await axios.get(
      `https://api.zoom.us/v2/meetings/${meetingId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error fetching meeting details:', error.message);
    throw new Error('Failed to fetch meeting details');
  }
};

/**
 * Create Zoom meeting invite for the bot
 */
const createMeetingInvite = async (meetingId, token) => {
  try {
    // This is a placeholder - actual implementation depends on Zoom bot setup
    console.log(`Creating bot invite for meeting ${meetingId}`);
    return {
      meetingId,
      status: 'invited',
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('Error creating meeting invite:', error.message);
    throw new Error('Failed to create meeting invite');
  }
};

/**
 * Validate Zoom webhook signature
 */
const validateZoomWebhookSignature = (req, zoomSecret) => {
  const signature = req.headers['x-zm-signature'];
  const timestamp = req.headers['x-zm-request-timestamp'];
  const body = req.body;

  if (!signature || !timestamp) {
    return false;
  }

  // Zoom signature validation logic
  const crypto = require('crypto');
  const message = `v0:${timestamp}:${JSON.stringify(body)}`;
  const hash = crypto
    .createHmac('sha256', zoomSecret)
    .update(message)
    .digest('hex');
  const computedSignature = `v0=${hash}`;

  return computedSignature === signature;
};

module.exports = {
  generateZoomToken,
  getMeetingDetails,
  createMeetingInvite,
  validateZoomWebhookSignature,
};
