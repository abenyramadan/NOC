import express from 'express';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import { generateToken, authenticate, authorize, requirePasswordChange } from '../middleware/auth.js';
import mongoose from 'mongoose';
import { logAudit } from '../services/auditLogger.js';

const router = express.Router();

/**
 * @route POST /api/auth/login
 * @desc Login user
 * @access Public
 */
router.post('/login', [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3 })
    .withMessage('Username must be at least 3 characters long'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { username, password } = req.body;

    // Debug: Check database connection and collections
    console.log('🔗 Database connection state:', mongoose.connection.readyState);
    console.log('📊 Available collections:', Object.keys(mongoose.connection.collections));

    // Find user by username or email
    const user = await User.findByUsernameOrEmail(username).select('+password');

    console.log("user ", user);
    
    console.log('🔍 Login attempt:', { username, userFound: !!user, userId: user?._id });

    if (!user) {
      console.log('❌ User not found for username:', username);
      // Debug: Let's check what users actually exist
      const allUsers = await User.find({username:username}, 'username email role').limit(10);
      console.log('📋 Available users in database:', allUsers.map(u => ({ username: u.username, email: u.email, role: u.role })));
      await logAudit(req, {
        action: 'auth:login',
        target: `user:${username}`,
        details: 'User not found',
        status: 'failed',
        userOverride: username
      });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if account is active
    if (!user.isActive) {
      console.log('❌ Account is deactivated for user:', username);
      await logAudit(req, {
        action: 'auth:login',
        target: user._id.toString(),
        details: 'Account is deactivated',
        status: 'failed',
        userOverride: username
      });
      return res.status(401).json({ message: 'Account is deactivated' });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);

    console.log('🔐 Password check:', {
      username,
      isPasswordValid,
      providedPassword: password
    });

    if (!isPasswordValid) {
      console.log('❌ Password validation failed for user:', username);
      await logAudit(req, {
        action: 'auth:login',
        target: user._id.toString(),
        details: 'Invalid credentials',
        status: 'failed',
        userOverride: username
      });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    console.log('✅ Login successful for user:', username, 'with role:', user.role);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = generateToken(user._id);

    // Return user data (without password) and token
    await logAudit(req, {
      action: 'auth:login',
      target: user._id.toString(),
      details: 'Login successful',
      status: 'success',
      userOverride: username
    });
    res.json({
      message: 'Login successful',
      token,
      mustChangePassword: user.mustChangePassword,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route POST /api/auth/change-password
 * @desc Change user password
 * @access Private
 */
router.post('/change-password', authenticate, [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Password confirmation does not match');
      }
      return true;
    })
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.findById(req.user._id).select('+password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      await logAudit(req, {
        action: 'auth:password_change',
        target: user._id.toString(),
        details: 'Current password verification failed',
        status: 'failed'
      });
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Check if new password is same as current password
    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({ message: 'New password must be different from current password' });
    }

    // Update password and related fields
    user.password = newPassword;
    user.mustChangePassword = false;
    user.passwordChangedAt = new Date();
    await user.save();

    // Log the successful password change
    await logAudit(req, {
      action: 'auth:password_change',
      target: user._id.toString(),
      details: 'Password changed successfully',
      status: 'success'
    });

    res.json({
      message: 'Password changed successfully',
      mustChangePassword: false
    });

  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route GET /api/auth/me
 * @desc Get current user
 * @access Private
 */
router.get('/me', authenticate, requirePasswordChange, (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      username: req.user.username,
      email: req.user.email,
      role: req.user.role,
      isActive: req.user.isActive,
      lastLogin: req.user.lastLogin,
      createdAt: req.user.createdAt,
      updatedAt: req.user.updatedAt
    }
  });
});

/**
 * @route POST /api/auth/logout
 * @desc Logout user (mainly for cleanup if needed)
 * @access Private
 */
router.post('/logout', authenticate, async (req, res) => {
  // In a stateless JWT implementation, logout is handled client-side
  // by removing the token. This endpoint can be used for cleanup if needed
  try {
    await logAudit(req, {
      action: 'auth:logout',
      target: req.user?._id?.toString() || 'user',
      details: 'Logout successful',
      status: 'success'
    });
  } catch (_) {}
  res.json({ message: 'Logout successful' });
});

/**
 * @route GET /api/auth/users
 * @desc Get all users (admin only)
 * @access Private (Admin)
 */
router.get('/users', authenticate, authorize('admin'), async (req, res) => {
  try {
    const users = await User.find({}, '-password').sort({ createdAt: -1 });
    res.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route POST /api/auth/users
 * @desc Create new user (admin only)
 * @access Private (Admin)
 */
router.post('/users', authenticate, authorize('admin'), [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['admin', 'engineer', 'operator', 'viewer']).withMessage('Valid role is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, username, email, password, role } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ username }, { email }]
    });

    if (existingUser) {
      return res.status(400).json({
        message: existingUser.username === username ? 'Username already exists' : 'Email already exists'
      });
    }

    // Create new user
    const newUser = new User({
      name,
      username,
      email,
      password,
      role,
      isActive: true,
      mustChangePassword: true // Force password change on first login
    });

    await newUser.save();
    try {
      await logAudit(req, {
        action: 'user:create',
        target: newUser._id.toString(),
        details: { username: newUser.username, role: newUser.role },
        status: 'success'
      });
    } catch (_) {}

    // Return user without password
    const { password: _, ...userWithoutPassword } = newUser.toObject();
    res.status(201).json({
      message: 'User created successfully',
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route PUT /api/auth/users/:id
 * @desc Update user (admin only)
 * @access Private (Admin)
 */
router.put('/users/:id', authenticate, authorize('admin'), [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('username').optional().trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('email').optional().isEmail().withMessage('Valid email is required'),
  body('role').optional().isIn(['admin', 'engineer', 'operator', 'viewer']).withMessage('Valid role is required'),
  body('isActive').optional().isBoolean().withMessage('Status must be true or false')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const updates = req.body;

    // Remove password from updates if provided (shouldn't update via this endpoint)
    delete updates.password;

    const user = await User.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    try {
      await logAudit(req, {
        action: 'user:update',
        target: id,
        details: updates,
        status: 'success'
      });
    } catch (_) {}
    res.json({
      message: 'User updated successfully',
      user
    });
  } catch (error) {
    console.error('Error updating user:', error);
    if (error.code === 11000) {
      res.status(400).json({ message: 'Username or email already exists' });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});

/**
 * @route DELETE /api/auth/users/:id
 * @desc Delete user (admin only)
 * @access Private (Admin)
 */
router.delete('/users/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent deleting yourself
    if (id === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    const user = await User.findByIdAndDelete(id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    try {
      await logAudit(req, {
        action: 'user:delete',
        target: id,
        details: 'User deleted successfully',
        status: 'success'
      });
    } catch (_) {}
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
