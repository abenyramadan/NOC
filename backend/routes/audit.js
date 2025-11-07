import express from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, hasPermission } from '../middleware/auth.js';
import AuditLog from '../models/AuditLog.js';

const router = express.Router();

/**
 * @route GET /api/audit
 * @desc Get all audit logs with optional filters
 * @access Private (Admin only)
 */
router.get('/', authenticate, async (req, res) => {
  // Check if user has admin or engineer role
  if (!['admin', 'engineer'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied. Requires admin or engineer role.' });
  }
  try {
    const {
      user,
      action,
      target,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 50,
      sortBy = 'timestamp',
      sortOrder = 'desc'
    } = req.query;

    let query = {};

    // Apply filters
    if (user) query.user = new RegExp(user, 'i');
    if (action) query.action = new RegExp(action, 'i');
    if (target) query.target = new RegExp(target, 'i');
    if (status && status !== 'all') query.status = status;

    // Date range filtering
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const auditLogs = await AuditLog.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await AuditLog.countDocuments(query);

    res.json({
      auditLogs,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / parseInt(limit)),
        count: auditLogs.length,
        totalLogs: total
      }
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route POST /api/audit
 * @desc Create new audit log entry
 * @access Private (System/Internal)
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const auditData = {
      user: req.body.user || req.user?.username || 'system',
      action: req.body.action,
      target: req.body.target,
      details: req.body.details,
      status: req.body.status || 'success',
      timestamp: new Date()
    };

    const auditLog = new AuditLog(auditData);
    await auditLog.save();

    res.status(201).json({
      message: 'Audit log created successfully',
      auditLog
    });
  } catch (error) {
    console.error('Error creating audit log:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route GET /api/audit/stats/summary
 * @desc Get audit log statistics
 * @access Private (Admin)
 */
router.get('/stats/summary', authenticate, hasPermission('view', 'audit'), async (req, res) => {
  try {
    const stats = await AuditLog.aggregate([
      {
        $group: {
          _id: null,
          totalLogs: { $sum: 1 },
          successLogs: {
            $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
          },
          failedLogs: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
          }
        }
      }
    ]);

    const byAction = await AuditLog.aggregate([
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    const byUser = await AuditLog.aggregate([
      {
        $group: {
          _id: '$user',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      summary: stats[0] || {
        totalLogs: 0,
        successLogs: 0,
        failedLogs: 0
      },
      byAction: byAction,
      byUser: byUser
    });
  } catch (error) {
    console.error('Error fetching audit stats:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
