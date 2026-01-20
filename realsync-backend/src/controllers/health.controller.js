/**
 * Health Controller
 * Health check and system status endpoints
 */

const zoomService = require('../services/zoom.service');
const websocketService = require('../services/websocket.service');

/**
 * Basic health check
 */
exports.health = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date(),
  });
};

/**
 * Detailed system status
 */
exports.systemStatus = async (req, res) => {
  try {
    const wsStats = websocketService.getStats();

    res.status(200).json({
      success: true,
      status: 'online',
      timestamp: new Date(),
      services: {
        websocket: {
          status: 'active',
          connections: wsStats.activeConnections,
          meetings: wsStats.activeMeetings,
        },
        zoom: {
          status: 'configured',
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'error',
      message: 'Failed to get system status',
      error: error.message,
    });
  }
};
