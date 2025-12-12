import express from 'express';
import Alarm from '../models/Alarm.js';
import Ticket from '../models/Ticket.js';
import Site from '../models/Site.js';
import OutageReport from '../models/OutageReport.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/reports/stats
// @desc    Get alarm statistics for reports
// @access  Private
router.get('/stats', authenticate, async (req, res) => {
  try {
    // Total alarms count
    const totalAlarms = await Alarm.countDocuments();

    // Alarms by severity
    const bySeverity = await Alarm.aggregate([
      {
        $group: {
          _id: '$severity',
          count: { $sum: 1 }
        }
      }
    ]);

    // Alarms by status
    const byStatus = await Alarm.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Top alarm types
    const topAlarmTypes = await Alarm.aggregate([
      {
        $group: {
          _id: '$alarmType',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]);

    // Recent alarms (last 10)
    const recentAlarms = await Alarm.find()
      .sort({ timestamp: -1 })
      .limit(10)
      .select('id severity siteName alarmType description timestamp');

    // Site statistics
    const bySite = await Alarm.aggregate([
      {
        $group: {
          _id: '$siteName',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]);

    // Format the response
    const stats = {
      totalAlarms,
      bySeverity: bySeverity.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      byStatus: byStatus.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      topAlarmTypes: topAlarmTypes.map(item => ({
        type: item._id,
        count: item.count
      })),
      recentAlarms: recentAlarms.map(alarm => ({
        id: alarm.id,
        severity: alarm.severity,
        siteName: alarm.siteName,
        alarmType: alarm.alarmType,
        description: alarm.description,
        timestamp: alarm.timestamp
      })),
      bySite: bySite.map(item => ({
        siteName: item._id,
        count: item.count
      }))
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching reports stats:', error);
    res.status(500).json({ message: 'Server error while fetching reports' });
  }
});

// @route   GET /api/reports/tickets
// @desc    Get ticket statistics for reports
// @access  Private
router.get('/tickets', authenticate, async (req, res) => {
  try {
    // Total tickets count
    const totalTickets = await Ticket.countDocuments();

    // Tickets by status
    const byStatus = await Ticket.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Tickets by priority
    const byPriority = await Ticket.aggregate([
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      }
    ]);

    // Recent tickets
    const recentTickets = await Ticket.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('id title priority status createdAt');

    const stats = {
      totalTickets,
      byStatus: byStatus.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      byPriority: byPriority.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      recentTickets: recentTickets.map(ticket => ({
        id: ticket.id,
        title: ticket.title,
        priority: ticket.priority,
        status: ticket.status,
        createdAt: ticket.createdAt
      }))
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching ticket reports:', error);
    res.status(500).json({ message: 'Server error while fetching ticket reports' });
  }
});

// @route   GET /api/reports/historical/export
// @desc    Export historical outage reports as PDF or Excel
// @access  Private
router.get('/historical/export', authenticate, async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      regions,
      rootCauses,
      alarmTypes,
      statuses,
      format = 'pdf'
    } = req.query;

    // Build date filter
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    // Build main query filters
    const filters = {};
    if (Object.keys(dateFilter).length > 0) {
      filters.occurrenceTime = dateFilter;
    }
    if (regions) filters.region = { $in: regions.split(',') };
    if (rootCauses) filters.rootCause = { $in: rootCauses.split(',') };
    if (alarmTypes) filters.alarmType = { $in: alarmTypes.split(',') };
    if (statuses) filters.status = { $in: statuses.split(',') };

    // Get all reports (no pagination for export)
    const reports = await OutageReport.find(filters)
      .sort({ occurrenceTime: -1 })
      .populate('createdBy', 'name username')
      .populate('updatedBy', 'name username');

    // Get carry-over incidents
    const carryOver = await OutageReport.find({
      status: { $in: ['Open', 'In Progress'] },
      occurrenceTime: { $lt: new Date(startDate || new Date()) }
    }).populate('createdBy', 'name username');

    // Calculate summary statistics
    let totalReports = 0;
    let resolvedCount = 0;
    let openCount = 0;
    let inProgressCount = 0;
    let totalResolutionTime = 0;

    for (const report of reports) {
      totalReports++;
      if (report.status === 'Open') openCount++;
      if (report.status === 'In Progress') inProgressCount++;
      if ((report.status === 'Resolved' || report.status === 'Closed') &&
          report.resolutionTime && report.occurrenceTime) {
        resolvedCount++;
        const resolutionTimeMs = new Date(report.resolutionTime).getTime() - new Date(report.occurrenceTime).getTime();
        totalResolutionTime += Math.round(resolutionTimeMs / 60000); // minutes
      }
    }

    const mttr = resolvedCount > 0 ? Math.round(totalResolutionTime / resolvedCount) : 0;

    // Calculate SLA compliance
    let withinSLA = 0;
    let totalResolvedForSLA = 0;

    for (const report of reports) {
      if ((report.status === 'Resolved' || report.status === 'Closed') &&
          report.expectedResolutionHours &&
          report.resolutionTime &&
          report.occurrenceTime) {
        const actualHours = (new Date(report.resolutionTime).getTime() - new Date(report.occurrenceTime).getTime()) / (1000 * 60 * 60);
        if (actualHours <= report.expectedResolutionHours) {
          withinSLA++;
        }
        totalResolvedForSLA++;
      }
    }

    const slaPercentage = totalResolvedForSLA > 0
      ? Math.round((withinSLA / totalResolvedForSLA) * 100)
      : 0;

    const exportData = {
      reports,
      carryOver,
      stats: {
        totalReports,
        resolvedCount,
        openCount,
        inProgressCount,
        mttr,
        slaCompliance: slaPercentage,
        withinSLA,
        totalResolved: totalResolvedForSLA
      },
      dateRange: {
        start: startDate,
        end: endDate
      }
    };

    if (format === 'excel') {
      // For Excel export, return JSON data that frontend can use
      // The frontend handles Excel generation with xlsx library
      res.json(exportData);
    } else {
      // For PDF export, return JSON data that frontend can use
      // The frontend handles PDF generation with jsPDF
      res.json(exportData);
    }

  } catch (error) {
    console.error('Error exporting historical reports:', error);
    res.status(500).json({ message: 'Server error while exporting historical reports' });
  }
});

// @route   GET /api/reports/historical
// @desc    Get historical outage reports with filters and carry-over tracking
// @access  Private
router.get('/historical', authenticate, async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      regions,
      rootCauses,
      alarmTypes,
      statuses,
      page = 1,
      limit = 50
    } = req.query;

    // Build date filter
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    // Build main query filters
    const filters = {};
    if (Object.keys(dateFilter).length > 0) {
      filters.occurrenceTime = dateFilter;
    }
    if (regions) filters.region = { $in: regions.split(',') };
    if (rootCauses) filters.rootCause = { $in: rootCauses.split(',') };
    if (alarmTypes) filters.alarmType = { $in: alarmTypes.split(',') };
    if (statuses) filters.status = { $in: statuses.split(',') };

    // Get paginated reports
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const reports = await OutageReport.find(filters)
      .sort({ occurrenceTime: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'name username')
      .populate('updatedBy', 'name username');

    const totalCount = await OutageReport.countDocuments(filters);

    // Calculate carry-over incidents (unresolved alarms that started before the date range)
    const carryOver = await OutageReport.find({
      status: { $in: ['Open', 'In Progress'] },
      occurrenceTime: { $lt: new Date(startDate || new Date()) }
    }).populate('createdBy', 'name username');

    // Calculate summary statistics (simplified)
    let reportCount = 0;
    let resolvedCount = 0;
    let openCount = 0;
    let inProgressCount = 0;
    let totalResolutionTime = 0;

    for (const report of reports) {
      reportCount++;
      if (report.status === 'Open') openCount++;
      if (report.status === 'In Progress') inProgressCount++;
      if ((report.status === 'Resolved' || report.status === 'Closed') &&
          report.resolutionTime && report.occurrenceTime) {
        resolvedCount++;
        const resolutionTimeMs = new Date(report.resolutionTime).getTime() - new Date(report.occurrenceTime).getTime();
        totalResolutionTime += Math.round(resolutionTimeMs / 60000); // minutes
      }
    }

    const summaryStats = {
      totalReports: reportCount,
      resolvedCount,
      openCount,
      inProgressCount,
      totalResolutionTime
    };

    // Calculate MTTR (Mean Time To Resolution)
    const mttr = summaryStats.resolvedCount > 0
      ? Math.round(summaryStats.totalResolutionTime / summaryStats.resolvedCount)
      : 0;

    // Calculate SLA compliance (simplified calculation)
    let withinSLA = 0;
    let totalResolvedForSLA = 0;

    for (const report of reports) {
      if ((report.status === 'Resolved' || report.status === 'Closed') &&
          report.expectedResolutionHours &&
          report.resolutionTime &&
          report.occurrenceTime) {
        const actualHours = (new Date(report.resolutionTime).getTime() - new Date(report.occurrenceTime).getTime()) / (1000 * 60 * 60);
        if (actualHours <= report.expectedResolutionHours) {
          withinSLA++;
        }
        totalResolvedForSLA++;
      }
    }

    const slaPercentage = totalResolvedForSLA > 0
      ? Math.round((withinSLA / totalResolvedForSLA) * 100)
      : 0;

    // Calculate region statistics
    const regionStats = await OutageReport.aggregate([
      {
        $match: {
          ...filters,
          occurrenceTime: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$region',
          totalTickets: { $sum: 1 },
          inProgressTickets: {
            $sum: {
              $cond: [
                { $in: ['$status', ['Open', 'In Progress']] },
                1,
                0
              ]
            }
          },
          resolvedTickets: {
            $sum: {
              $cond: [
                { $in: ['$status', ['Resolved', 'Closed']] },
                1,
                0
              ]
            }
          },
          criticalAlarms: {
            $sum: {
              $cond: [
                { $eq: ['$alarmType', 'CRITICAL'] },
                1,
                0
              ]
            }
          },
          majorAlarms: {
            $sum: {
              $cond: [
                { $eq: ['$alarmType', 'MAJOR'] },
                1,
                0
              ]
            }
          },
          minorAlarms: {
            $sum: {
              $cond: [
                { $eq: ['$alarmType', 'MINOR'] },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          region: { $ifNull: ['$_id', 'Unknown'] },
          totalTickets: 1,
          inProgressTickets: 1,
          resolvedTickets: 1,
          criticalAlarms: 1,
          majorAlarms: 1,
          minorAlarms: 1
        }
      },
      { $sort: { totalTickets: -1 } }
    ]);

    res.json({
      reports,
      carryOver,
      stats: {
        ...summaryStats,
        mttr,
        slaCompliance: slaPercentage,
        withinSLA: withinSLA,
        totalResolved: totalResolvedForSLA,
        ticketsPerRegion: regionStats
      },
      pagination: {
        current: parseInt(page),
        total: Math.ceil(totalCount / parseInt(limit)),
        count: reports.length,
        totalReports: totalCount
      }
    });

  } catch (error) {
    console.error('Error fetching historical reports:', error);
    res.status(500).json({ message: 'Server error while fetching historical reports' });
  }
});

export default router;
