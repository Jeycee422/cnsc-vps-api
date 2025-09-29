const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        error: 'Access denied. No token provided.' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid token. User not found.' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token.' 
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired.' 
      });
    }
    return res.status(500).json({ 
      error: 'Token verification failed.' 
    });
  }
};

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required.' 
    });
  }

  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ 
      error: 'Access denied. Admin privileges required.' 
    });
  }

  next();
};

// Middleware to check if user is super admin
const requireSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required.' 
    });
  }

  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ 
      error: 'Access denied. Super admin privileges required.' 
    });
  }

  next();
};

// Middleware to check if user can access their own data or is admin
const requireOwnershipOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required.' 
    });
  }

  const requestedUserId = req.params.userId || req.params.id;
  
  if (req.user.role === 'admin' || req.user.role === 'super_admin') {
    return next();
  }

  if (req.user._id.toString() !== requestedUserId) {
    return res.status(403).json({ 
      error: 'Access denied. You can only access your own data.' 
    });
  }

  next();
};

// Middleware to check if user has completed registration
const requireCompletedRegistration = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required.' 
    });
  }

  if (req.user.registrationStatus !== 'completed') {
    return res.status(403).json({ 
      error: 'Registration not completed. Please complete your registration first.' 
    });
  }

  next();
};

// Middleware to check if user has active vehicle pass
const requireActiveVehiclePass = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required.' 
    });
  }

  if (!req.user.vehiclePass.isActive || req.user.vehiclePass.status !== 'active') {
    return res.status(403).json({ 
      error: 'Active vehicle pass required.' 
    });
  }

  const now = new Date();
  if (req.user.vehiclePass.expiryDate < now) {
    return res.status(403).json({ 
      error: 'Vehicle pass has expired.' 
    });
  }

  next();
};

// Middleware to check if user has assigned RFID tag - DISABLED: RFID functionality removed
const requireAssignedRFID = (req, res, next) => {
  return res.status(501).json({
    error: 'RFID functionality has been removed from the system',
    message: 'This middleware is no longer supported'
  });
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireSuperAdmin,
  requireOwnershipOrAdmin,
  requireCompletedRegistration,
  requireActiveVehiclePass,
  requireAssignedRFID
};
