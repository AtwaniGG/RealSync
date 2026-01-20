/**
 * API Routes
 * Main router configuration
 */

const express = require('express');
const router = express.Router();

const healthRoutes = require('./health.routes');
const meetingRoutes = require('./meeting.routes');

/**
 * Health check routes
 */
router.use('/health', healthRoutes);

/**
 * Meeting management routes
 */
router.use('/meetings', meetingRoutes);

/**
 * Root API endpoint
 */
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'RealSync API v1.0.0',
    endpoints: {
      health: '/api/health',
      meetings: '/api/meetings',
    },
  });
});

module.exports = router;
