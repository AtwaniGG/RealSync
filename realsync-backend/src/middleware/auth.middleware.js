/**
 * Authentication Middleware
 * JWT-based authentication for API endpoints
 */

const jwt = require('jsonwebtoken');

/**
 * Verify JWT token
 */
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'No token provided',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
      error: error.message,
    });
  }
};

/**
 * Optional token verification (doesn't fail if no token)
 */
const optionalVerifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
      req.user = decoded;
    } catch (error) {
      console.warn('Invalid token provided:', error.message);
    }
  }

  next();
};

module.exports = {
  verifyToken,
  optionalVerifyToken,
};
