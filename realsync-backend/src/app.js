/**
 * Express Application Configuration
 * Main app setup with middleware and routes
 */

const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');

// Create Express app
const app = express();

// Trust proxy (important for deployments behind reverse proxy)
app.set('trust proxy', 1);

// CORS Configuration
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint (before API routes)
app.get('/ping', (req, res) => {
  res.status(200).json({ message: 'pong' });
});

// API Routes
app.use('/api', apiRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handling middleware (must be last)
app.use(errorHandler);

module.exports = app;
