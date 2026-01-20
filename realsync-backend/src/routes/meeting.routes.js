/**
 * Meeting Routes
 * API endpoints for meeting management
 */

const express = require('express');
const router = express.Router();
const meetingController = require('../controllers/meeting.controller');
const { optionalVerifyToken } = require('../middleware/auth.middleware');

/**
 * @route POST /api/meetings/join
 * @description Bot joins a meeting
 */
router.post('/join', optionalVerifyToken, meetingController.joinMeeting);

/**
 * @route POST /api/meetings/leave
 * @description Bot leaves a meeting
 */
router.post('/leave', optionalVerifyToken, meetingController.leaveMeeting);

/**
 * @route GET /api/meetings/:meetingId/status
 * @description Get meeting status and details
 */
router.get('/:meetingId/status', optionalVerifyToken, meetingController.getMeetingStatus);

/**
 * @route GET /api/meetings/user/:userId
 * @description Get all meetings for a user
 */
router.get('/user/meetings', optionalVerifyToken, meetingController.getUserMeetings);

/**
 * @route GET /api/meetings/stats/connections
 * @description Get WebSocket connection statistics
 */
router.get('/stats/connections', meetingController.getConnectionStats);

module.exports = router;
