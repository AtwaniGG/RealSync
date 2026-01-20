/**
 * Zoom Service
 * Handles all Zoom SDK integrations and meeting management
 */

const zoomUtils = require('../utils/zoom.utils');
const zoomConfig = require('../config/zoom.config');

class ZoomService {
  constructor() {
    this.token = null;
    this.tokenExpiry = null;
  }

  /**
   * Initialize Zoom authentication
   */
  async initialize() {
    try {
      this.token = await zoomUtils.generateZoomToken();
      // Token expires in 1 hour, refresh after 55 minutes
      this.tokenExpiry = Date.now() + 55 * 60 * 1000;
      console.log('Zoom Service initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize Zoom Service:', error.message);
      return false;
    }
  }

  /**
   * Get valid token (refresh if needed)
   */
  async getValidToken() {
    if (!this.token || Date.now() > this.tokenExpiry) {
      await this.initialize();
    }
    return this.token;
  }

  /**
   * Join a meeting with the bot
   */
  async joinMeeting(meetingId, password = '') {
    try {
      const token = await this.getValidToken();
      console.log(`Attempting to join meeting: ${meetingId}`);

      // Get meeting details first
      const meetingDetails = await zoomUtils.getMeetingDetails(meetingId, token);

      // Create bot invitation
      const invite = await zoomUtils.createMeetingInvite(meetingId, token);

      return {
        success: true,
        meetingId,
        botJid: zoomConfig.botJid,
        status: 'joining',
        meetingDetails,
        invite,
      };
    } catch (error) {
      console.error(`Failed to join meeting ${meetingId}:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Leave a meeting
   */
  async leaveMeeting(meetingId) {
    try {
      console.log(`Bot leaving meeting: ${meetingId}`);
      return {
        success: true,
        meetingId,
        status: 'left',
      };
    } catch (error) {
      console.error(`Failed to leave meeting ${meetingId}:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get meeting status
   */
  async getMeetingStatus(meetingId) {
    try {
      const token = await this.getValidToken();
      const details = await zoomUtils.getMeetingDetails(meetingId, token);

      return {
        success: true,
        meetingId,
        status: details.state || 'unknown',
        details,
      };
    } catch (error) {
      console.error(`Failed to get meeting status:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get all meetings for an account
   */
  async getAccountMeetings(userId) {
    try {
      const token = await this.getValidToken();
      console.log(`Fetching meetings for user: ${userId}`);

      // This would typically call Zoom API to list user's meetings
      // Placeholder implementation
      return {
        success: true,
        meetings: [],
      };
    } catch (error) {
      console.error('Failed to fetch account meetings:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// Export singleton instance
module.exports = new ZoomService();
