import express from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, authorize } from '../middleware/auth.js';
import Alarm from '../models/Alarm.js';
import { emailService } from '../services/emailService.js';

const router = express.Router();

/**
 * @route GET /api/alarms
 * @desc Get all alarms with optional filters
 * @access Private
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const {
      severity,
      status,
      siteId,
      siteName,
      alarmType,
      search,
      page = 1,
      limit = 50,
      sortBy = 'timestamp',
      sortOrder = 'desc'
    } = req.query;

    let query = {};

    // Apply filters
    if (severity && severity !== 'all') query.severity = severity;
    if (status && status !== 'all') query.status = status;
    if (siteId) query.siteId = new RegExp(siteId, 'i');
    if (siteName) query.siteName = new RegExp(siteName, 'i');
    if (alarmType && alarmType !== 'all') query.alarmType = alarmType;

    // Text search across description and source
    if (search) {
      query.$or = [
        { description: new RegExp(search, 'i') },
        { source: new RegExp(search, 'i') },
        { siteName: new RegExp(search, 'i') }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const alarms = await Alarm.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Alarm.countDocuments(query);

    res.json({
      alarms,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / parseInt(limit)),
        count: alarms.length,
        totalAlarms: total
      }
    });
  } catch (error) {
    console.error('Error fetching alarms:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route GET /api/alarms/:id
 * @desc Get single alarm by ID
 * @access Private
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const alarm = await Alarm.findById(req.params.id);
    if (!alarm) {
      return res.status(404).json({ message: 'Alarm not found' });
    }
    res.json({ alarm });
  } catch (error) {
    console.error('Error fetching alarm:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route POST /api/alarms
 * @desc Create new alarm (admin only)
 * @access Private (Admin)
 */
router.post('/', authenticate, authorize('admin'), [
  body('siteId').trim().notEmpty().withMessage('Site ID is required'),
  body('siteName').trim().notEmpty().withMessage('Site name is required'),
  body('severity').isIn(['critical', 'major', 'minor']).withMessage('Valid severity is required'),
  body('alarmType').trim().notEmpty().withMessage('Alarm type is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('source').trim().notEmpty().withMessage('Source is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const alarmData = {
      ...req.body,
      status: 'active',
      timestamp: new Date()
    };

    const alarm = new Alarm(alarmData);
    await alarm.save();

    // Send email notification for new alarm
    try {
      const recipients = process.env.NOC_ALERTS_EMAIL ? process.env.NOC_ALERTS_EMAIL.split(',') : [];
      if (recipients.length > 0) {
        await emailService.sendAlarmNotification({
          alarmId: alarm._id,
          siteName: alarm.siteName,
          siteId: alarm.siteId,
          severity: alarm.severity,
          alarmType: alarm.alarmType,
          description: alarm.description,
          source: alarm.source,
          timestamp: alarm.timestamp,
          recipients: recipients
        }, req.user.id); // Pass user ID for ticket creation
      }
    } catch (emailError) {
      console.error('Failed to send alarm notification email:', emailError);
      // Don't fail the alarm creation if email fails
    }

    res.status(201).json({
      message: 'Alarm created successfully',
      alarm
    });
  } catch (error) {
    console.error('Error creating alarm:', error);
    if (error.code === 11000) {
      res.status(400).json({ message: 'Alarm already exists' });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});

/**
 * @route PUT /api/alarms/:id
 * @desc Update alarm (admin only)
 * @access Private (Admin)
 */
router.put('/:id', authenticate, authorize('admin'), [
  body('status').optional().isIn(['active', 'acknowledged', 'resolved']).withMessage('Valid status is required'),
  body('acknowledgedBy').optional().trim(),
  body('acknowledgedAt').optional().isISO8601().withMessage('Valid timestamp is required'),
  body('resolvedAt').optional().isISO8601().withMessage('Valid timestamp is required')
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

    // Handle status changes
    if (updates.status === 'acknowledged') {
      updates.acknowledgedAt = new Date();
      if (!updates.acknowledgedBy) {
        updates.acknowledgedBy = req.user?.username || 'system';
      }
    } else if (updates.status === 'resolved') {
      updates.resolvedAt = new Date();
    }

    const alarm = await Alarm.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!alarm) {
      return res.status(404).json({ message: 'Alarm not found' });
    }

    // Send email notification if alarm was resolved
    if (updates.status === 'resolved' && alarm.status === 'resolved') {
      try {
        const recipients = process.env.NOC_ALERTS_EMAIL ? process.env.NOC_ALERTS_EMAIL.split(',') : [];
        if (recipients.length > 0) {
          await emailService.sendAlarmResolvedNotification({
            siteName: alarm.siteName,
            siteId: alarm.siteId,
            severity: alarm.severity,
            alarmType: alarm.alarmType,
            description: alarm.description,
            source: alarm.source,
            timestamp: alarm.timestamp,
            recipients: recipients
          });
        }
      } catch (emailError) {
        console.error('Failed to send alarm resolution notification email:', emailError);
        // Don't fail the alarm update if email fails
      }
    }

    res.json({
      message: 'Alarm updated successfully',
      alarm
    });
  } catch (error) {
    console.error('Error updating alarm:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route DELETE /api/alarms/:id
 * @desc Delete alarm (admin only)
 * @access Private (Admin)
 */
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const alarm = await Alarm.findByIdAndDelete(id);

    if (!alarm) {
      return res.status(404).json({ message: 'Alarm not found' });
    }

    res.json({ message: 'Alarm deleted successfully' });
  } catch (error) {
    console.error('Error deleting alarm:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route GET /api/alarms/stats/summary
 * @desc Get alarms statistics
 * @access Private
 */
router.get('/stats/summary', authenticate, async (req, res) => {
  try {
    const stats = await Alarm.aggregate([
      {
        $group: {
          _id: null,
          totalAlarms: { $sum: 1 },
          activeAlarms: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
          },
          acknowledgedAlarms: {
            $sum: { $cond: [{ $eq: ['$status', 'acknowledged'] }, 1, 0] }
          },
          resolvedAlarms: {
            $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
          },
          criticalAlarms: {
            $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] }
          },
          majorAlarms: {
            $sum: { $cond: [{ $eq: ['$severity', 'major'] }, 1, 0] }
          },
          minorAlarms: {
            $sum: { $cond: [{ $eq: ['$severity', 'minor'] }, 1, 0] }
          }
        }
      }
    ]);

    const bySite = await Alarm.aggregate([
      {
        $group: {
          _id: '$siteId',
          count: { $sum: 1 },
          siteName: { $first: '$siteName' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      summary: stats[0] || {
        totalAlarms: 0,
        activeAlarms: 0,
        acknowledgedAlarms: 0,
        resolvedAlarms: 0,
        criticalAlarms: 0,
        majorAlarms: 0,
        minorAlarms: 0
      },
      bySite: bySite
    });
  } catch (error) {
    console.error('Error fetching alarm stats:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
