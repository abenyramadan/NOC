import express from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, authorize } from '../middleware/auth.js';
import Ticket from '../models/Ticket.js';

const router = express.Router();

/**
 * @route GET /api/tickets
 * @desc Get all tickets with optional filters
 * @access Private (Admin, Engineer)
 */
router.get('/', authenticate, async (req, res) => {
  // Check if user has permission to view tickets
  if (req.user.role !== 'admin' && req.user.role !== 'engineer' && req.user.role !== 'operator') {
    return res.status(403).json({ message: 'Insufficient permissions' });
  }

  try {
    const {
      status,
      severity,
      siteId,
      alarmType,
      startDate,
      endDate,
      page = 1,
      limit = 50,
      sortBy = 'emailSentAt',
      sortOrder = 'desc'
    } = req.query;

    let query = {};

    // Apply filters
    if (status && status !== 'all') query.status = status;
    if (severity && severity !== 'all') query.severity = severity;
    if (siteId) query.siteId = new RegExp(siteId, 'i');
    if (alarmType) query.alarmType = new RegExp(alarmType, 'i');

    // Date range filtering
    if (startDate || endDate) {
      query.emailSentAt = {};
      if (startDate) query.emailSentAt.$gte = new Date(startDate);
      if (endDate) query.emailSentAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const tickets = await Ticket.find(query)
      .populate('createdBy', 'username name')
      .populate('alarmId')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Ticket.countDocuments(query);

    res.json({
      tickets,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / parseInt(limit)),
        count: tickets.length,
        totalTickets: total
      }
    });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route GET /api/tickets/stats
 * @desc Get ticket statistics
 * @access Private (Admin, Engineer)
 */
router.get('/stats', authenticate, async (req, res) => {
  // Check if user has permission to view ticket stats
  if (req.user.role !== 'admin' && req.user.role !== 'engineer' && req.user.role !== 'operator') {
    return res.status(403).json({ message: 'Insufficient permissions' });
  }

  try {
    const stats = await Ticket.aggregate([
      {
        $group: {
          _id: null,
          totalTickets: { $sum: 1 },
          sentTickets: {
            $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] }
          },
          failedTickets: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
          },
          pendingTickets: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          resolvedTickets: {
            $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
          }
        }
      }
    ]);

    const bySeverity = await Ticket.aggregate([
      {
        $group: {
          _id: '$severity',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const recentTickets = await Ticket.find()
      .populate('createdBy', 'username')
      .sort({ emailSentAt: -1 })
      .limit(10);

    res.json({
      summary: stats[0] || {
        totalTickets: 0,
        sentTickets: 0,
        failedTickets: 0,
        pendingTickets: 0,
        resolvedTickets: 0
      },
      bySeverity: bySeverity,
      recentTickets: recentTickets
    });
  } catch (error) {
    console.error('Error fetching ticket stats:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route DELETE /api/tickets/:id
 * @desc Delete a ticket
 * @access Private (Admin, Engineer)
 */
router.delete('/:id', authenticate, async (req, res) => {
  // Check if user has permission to delete tickets
  if (req.user.role !== 'admin' && req.user.role !== 'engineer' && req.user.role !== 'operator') {
    return res.status(403).json({ message: 'Insufficient permissions' });
  }

  try {
    const { id } = req.params;

    const ticket = await Ticket.findByIdAndDelete(id);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    res.json({
      message: 'Ticket deleted successfully',
      ticket
    });
  } catch (error) {
    console.error('Error deleting ticket:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route PATCH /api/tickets/:id/resolve
 * @desc Mark a ticket as resolved
 * @access Private (Admin, Engineer)
 */
router.patch('/:id/resolve', authenticate, async (req, res) => {
  // Check if user has permission to resolve tickets
  if (req.user.role !== 'admin' && req.user.role !== 'engineer' && req.user.role !== 'operator') {
    return res.status(403).json({ message: 'Insufficient permissions' });
  }

  try {
    const { id } = req.params;
    const { notes } = req.body;

    const ticket = await Ticket.findByIdAndUpdate(
      id,
      {
        resolvedAt: new Date(),
        status: 'resolved',
        notes: notes || ''
      },
      { new: true }
    );

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    res.json({
      message: 'Ticket marked as resolved',
      ticket
    });
  } catch (error) {
    console.error('Error resolving ticket:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route GET /api/tickets/:id
 * @desc Get a single ticket by ID
 * @access Private (Admin, Engineer)
 */
router.get('/:id', authenticate, async (req, res) => {
  // Check if user has permission to view individual tickets
  if (req.user.role !== 'admin' && req.user.role !== 'engineer' && req.user.role !== 'operator') {
    return res.status(403).json({ message: 'Insufficient permissions' });
  }

  try {
    const { id } = req.params;

    const ticket = await Ticket.findById(id)
      .populate('createdBy', 'username name email')
      .populate('alarmId');

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    res.json(ticket);
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
