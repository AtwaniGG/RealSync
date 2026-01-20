/**
 * Health Routes
 * System health check endpoints
 */

const express = require('express');
const router = express.Router();
const healthController = require('../controllers/health.controller');

/**
 * @route GET /api/health
 * @description Basic health check
 */
router.get('/', healthController.health);

/**
 * @route GET /api/health/status
 * @description Detailed system status
 */
router.get('/status', healthController.systemStatus);

module.exports = router;
