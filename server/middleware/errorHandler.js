/**
 * Centralized Error Handler Middleware
 * Provides consistent error responses across all routes
 */

export const errorHandler = (err, req, res, next) => {
  console.error('[Error]', err.message);
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }

  // Default error
  let error = {
    message: err.message || 'Internal server error',
    status: err.status || err.statusCode || 500
  };

  // PostgreSQL errors
  if (err.code) {
    switch (err.code) {
      case '23505': // Unique violation
        error = {
          message: 'A record with this value already exists',
          status: 409
        };
        break;
      case '23503': // Foreign key violation
        error = {
          message: 'Referenced record not found',
          status: 400
        };
        break;
      case '23502': // Not null violation
        error = {
          message: 'Required field missing',
          status: 400
        };
        break;
      case '22P02': // Invalid text representation
        error = {
          message: 'Invalid data format',
          status: 400
        };
        break;
    }
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = {
      message: 'Invalid token',
      status: 401
    };
  }

  if (err.name === 'TokenExpiredError') {
    error = {
      message: 'Token expired',
      status: 401
    };
  }

  // Validation errors from express-validator
  if (err.name === 'ValidationError') {
    error = {
      message: err.message,
      status: 400
    };
  }

  // Handle errors with explicit status codes
  if (err.statusCode) {
    error.status = err.statusCode;
  }

  res.status(error.status).json({
    error: error.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

/**
 * Not Found Handler - Use as last route
 */
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path
  });
};

/**
 * Async handler wrapper to catch errors in async route handlers
 * Usage: router.get('/route', asyncHandler(async (req, res) => { ... }))
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default errorHandler;
