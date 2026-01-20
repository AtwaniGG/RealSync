/**
 * RealSync Backend Server
 * Main entry point for Node.js/Express server with WebSocket support
 */

require('dotenv').config();

const http = require('http');
const app = require('./src/app');
const zoomService = require('./src/services/zoom.service');
const websocketService = require('./src/services/websocket.service');

// Configuration
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || 'localhost';

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket
websocketService.initialize(server);

// Graceful shutdown handler
const gracefulShutdown = () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const startServer = async () => {
  try {
    // Initialize Zoom service
    const zoomInitialized = await zoomService.initialize();
    if (!zoomInitialized) {
      console.warn('Warning: Zoom service failed to initialize. Check credentials.');
    }

    // Start listening
    server.listen(PORT, HOST, () => {
      console.log('╔════════════════════════════════════════╗');
      console.log('║  RealSync Backend Server               ║');
      console.log('║  Deepfake Detection System             ║');
      console.log('╚════════════════════════════════════════╝');
      console.log();
      console.log(`✓ Server running on http://${HOST}:${PORT}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`✓ WebSocket enabled`);
      console.log(`✓ CORS Origin: ${process.env.CORS_ORIGIN || 'http://localhost:3000'}`);
      console.log();
      console.log('Available Endpoints:');
      console.log('  - GET  /ping                     - Health check');
      console.log('  - GET  /api/health               - API health');
      console.log('  - GET  /api/health/status        - System status');
      console.log('  - POST /api/meetings/join        - Bot join meeting');
      console.log('  - POST /api/meetings/leave       - Bot leave meeting');
      console.log('  - GET  /api/meetings/:id/status  - Get meeting status');
      console.log();
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
