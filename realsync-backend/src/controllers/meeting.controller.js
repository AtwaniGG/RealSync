/**
 * Meeting Controller
 * Handles meeting-related API requests
 */

const zoomService = require('../services/zoom.service');
const websocketService = require('../services/websocket.service');

/**
 * Start bot participation in a meeting
 */
exports.joinMeeting = async (req, res) => {
  try {
    const { meetingId, password } = req.body;

    if (!meetingId) {
      return res.status(400).json({
        success: false,
        message: 'Meeting ID is required',
      });
    }

    const result = await zoomService.joinMeeting(meetingId, password);

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to join meeting',
      error: error.message,
    });
  }
};

/**
 * End bot participation in a meeting
 */
exports.leaveMeeting = async (req, res) => {
  try {
    const { meetingId } = req.body;

    if (!meetingId) {
      return res.status(400).json({
        success: false,
        message: 'Meeting ID is required',
      });
    }

    const result = await zoomService.leaveMeeting(meetingId);

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to leave meeting',
      error: error.message,
    });
  }
};

/**
 * Get meeting status and details
 */
exports.getMeetingStatus = async (req, res) => {
  try {
    const { meetingId } = req.params;

    if (!meetingId) {
      return res.status(400).json({
        success: false,
        message: 'Meeting ID is required',
      });
    }

    const result = await zoomService.getMeetingStatus(meetingId);

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get meeting status',
      error: error.message,
    });
  }
};

/**
 * Get all meetings for the authenticated user
 */
exports.getUserMeetings = async (req, res) => {
  try {
    const userId = req.user?.id || req.query.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
    }

    const result = await zoomService.getAccountMeetings(userId);

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch meetings',
      error: error.message,
    });
  }
};

/**
 * Get WebSocket connection stats
 */
exports.getConnectionStats = (req, res) => {
  try {
    const stats = websocketService.getStats();

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get connection stats',
      error: error.message,
    });
  }
};
