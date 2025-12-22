import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Generate JWT token for user
 */
export const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

/**
 * Verify JWT token
 */
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid token');
  }
};

/**
 * Extract token from Authorization header
 */
export const extractTokenFromHeader = (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Authorization header must start with Bearer');
  }
  return authHeader.substring(7);
};

/**
 * Authenticate user middleware
 */
export const authenticate = async (req, res, next) => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    const decoded = verifyToken(token);

    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    if (user.isLocked) {
      throw new Error('Account is temporarily locked due to multiple failed login attempts');
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: error.message || 'Authentication failed' });
  }
};

/**
 * Authorize based on roles
 */
export const authorize = (...roles) => {
  return (req, res, next) => {
    console.log('🔐 Authorization check:', {
      userExists: !!req.user,
      userRole: req.user?.role,
      allowedRoles: roles,
      hasPermission: req.user ? roles.includes(req.user.role) : false
    });

    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      console.log('❌ Access denied for role:', req.user.role, 'Allowed:', roles);
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    console.log('✅ Access granted for role:', req.user.role);
    next();
  };
};

/**
 * Check if user has any of the specified roles
 */
export const hasAnyRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    next();
  };
};

/**
 * Middleware to require password change
 * Blocks access if user must change password, except for change-password endpoint
 */
export const requirePasswordChange = async (req, res, next) => {
  try {
    // Skip password change check for the change-password endpoint itself
    if (req.path === '/change-password' && req.method === 'POST') {
      return next();
    }

    // Get fresh user data to check mustChangePassword status
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.mustChangePassword) {
      return res.status(423).json({ 
        message: 'Password change required',
        mustChangePassword: true,
        redirectTo: '/change-password'
      });
    }

    next();
  } catch (error) {
    console.error('Error in requirePasswordChange middleware:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Role hierarchy and permissions
 */
export const ROLE_PERMISSIONS = {
  viewer: {
    canView: ['dashboard', 'alarms'],
    canEdit: [],
    canDelete: [],
    canManageUsers: false,
    canManageSettings: false
  },
  operator: {
    canView: ['dashboard', 'alarms', 'devices', 'topology', 'tickets'],
    canEdit: ['alarms', 'tickets'],
    canDelete: ['alarms', 'tickets'],
    canManageUsers: false,
    canManageSettings: false
  },
  engineer: {
    canView: ['dashboard', 'alarms', 'devices', 'topology', 'users', 'audit', 'tickets', 'integrations'],
    canEdit: ['alarms', 'devices', 'tickets'],
    canDelete: ['alarms', 'tickets'],
    canManageUsers: false,
    canManageSettings: true
  },
  admin: {
    canView: ['dashboard', 'alarms', 'devices', 'topology', 'users', 'notifications', 'audit', 'settings', 'tickets', 'integrations'],
    canEdit: ['alarms', 'devices', 'users', 'settings', 'tickets', 'integrations'],
    canDelete: ['alarms', 'devices', 'users', 'tickets'],
    canManageUsers: true,
    canManageSettings: true
  }
};

/**
 * Check if user has permission for specific action
 */
export const hasPermission = (action, resource) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userPermissions = ROLE_PERMISSIONS[req.user.role];
    if (!userPermissions) {
      return res.status(403).json({ message: 'Invalid role' });
    }

    let hasAccess = false;

    switch (action) {
      case 'view':
        hasAccess = userPermissions.canView.includes(resource);
        break;
      case 'edit':
        hasAccess = userPermissions.canEdit.includes(resource);
        break;
      case 'delete':
        hasAccess = userPermissions.canDelete.includes(resource);
        break;
      case 'manageUsers':
        hasAccess = userPermissions.canManageUsers;
        break;
      case 'manageSettings':
        hasAccess = userPermissions.canManageSettings;
        break;
      default:
        hasAccess = false;
    }

    if (!hasAccess) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    next();
  };
};
