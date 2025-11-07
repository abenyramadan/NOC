import express from 'express';
import OutageReport from '../models/OutageReport.js';
import { authenticate } from '../middleware/auth.js';
import { outageReportService } from '../services/outageReportService.js';
import { logAudit } from '../services/auditLogger.js';

const router = express.Router();

// @route   GET /api/outage-reports
// @desc    Get outage reports with optional filtering
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      region,
      alarmType,
      startDate,
      endDate,
      reportHour,
      sortBy = 'occurrenceTime',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = {};

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (region && region !== 'all') {
      filter.region = region;
    }

    if (alarmType && alarmType !== 'all') {
      filter.alarmType = alarmType;
    }

    // Filter by specific hour (for hourly reports)
    if (reportHour) {
      const hourDate = new Date(reportHour);
      if (!isNaN(hourDate.getTime())) {
        const nextHour = new Date(hourDate.getTime() + 60 * 60 * 1000);
        filter.reportHour = { $gte: hourDate, $lt: nextHour };
      }
    } else if (startDate || endDate) {
      filter.occurrenceTime = {};
      if (startDate) {
        filter.occurrenceTime.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.occurrenceTime.$lte = new Date(endDate);
      }
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      populate: [
        { path: 'createdBy', select: 'name username' },
        { path: 'updatedBy', select: 'name username' }
      ]
    };

    const result = await OutageReport.paginate(filter, options);

    res.json({
      reports: result.docs,
      pagination: {
        total: result.totalDocs,
        page: result.page,
        pages: result.totalPages,
        limit: result.limit,
        hasNext: result.hasNextPage,
        hasPrev: result.hasPrevPage
      }
    });

  } catch (error) {
    console.error('Error fetching outage reports:', error);
    res.status(500).json({ message: 'Server error while fetching outage reports' });
  }
});

// @route   GET /api/outage-reports/hourly
// @desc    Get hourly outage report with metrics for a specific hour (or current day cumulative if no hour specified)
// @access  Private
router.get('/hourly', authenticate, async (req, res) => {
  try {
    const { reportHour } = req.query;

    let startOfPeriod, endOfPeriod;

    if (reportHour) {
      // Specific hour report (legacy behavior)
      const hourDate = new Date(reportHour);

      if (isNaN(hourDate.getTime())) {
        return res.status(400).json({ message: 'Invalid hour date format' });
      }

      // Round down to the hour
      startOfPeriod = new Date(hourDate.getFullYear(), hourDate.getMonth(), hourDate.getDate(), hourDate.getHours());
      endOfPeriod = new Date(startOfPeriod.getTime() + 60 * 60 * 1000);

      // Get all reports for this specific hour
      var allReportsThisHour = await OutageReport.find({
        reportHour: { $gte: startOfPeriod, $lt: endOfPeriod }
      }).populate('alarmId').sort({ occurrenceTime: -1 });
    } else {
      // Current day cumulative report (new default behavior)
      const now = new Date();
      const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      startOfPeriod = currentDate; // Midnight of current day
      endOfPeriod = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000); // Midnight of next day

      // Get all reports that occurred on the current date (from midnight to now)
      var allReportsThisHour = await OutageReport.find({
        occurrenceTime: { $gte: startOfPeriod, $lt: endOfPeriod }
      }).populate('alarmId').sort({ occurrenceTime: -1 });
    }

    const ongoingOutages = allReportsThisHour.filter(r => r.status === 'Open' || r.status === 'In Progress');
    const resolvedOutages = allReportsThisHour.filter(r => r.status === 'Resolved' || r.status === 'Closed');

    // Calculate SLA metrics from resolved outage reports
    const slaThresholds = {
      critical: parseInt(process.env.SLA_CRITICAL_MINUTES || '30'),
      major: parseInt(process.env.SLA_MAJOR_MINUTES || '60'),
      minor: parseInt(process.env.SLA_MINOR_MINUTES || '120')
    };

    let withinSLA = 0;
    let outOfSLA = 0;
    let totalResolutionMinutes = 0;
    let resolvedCount = 0;

    for (const report of resolvedOutages) {
      const startTime = report.occurrenceTime;
      const endTime = report.resolutionTime;
      const mandatoryRestorationTime = report.mandatoryRestorationTime;
      
      if (startTime && endTime) {
        const durationMinutes = Math.round((endTime - startTime) / 60000);
        totalResolutionMinutes += durationMinutes;
        resolvedCount++;

        // Use mandatoryRestorationTime as the SLA deadline if available
        if (mandatoryRestorationTime) {
          const slaDeadline = new Date(mandatoryRestorationTime);
          
          if (endTime <= slaDeadline) {
            withinSLA++;
          } else {
            outOfSLA++;
          }
        } else {
          // If no SLA deadline set, count as out of SLA (or not counted)
          // For now, we'll not count these in SLA metrics
        }
      }
    }

    const mttr = resolvedCount > 0 ? Math.round(totalResolutionMinutes / resolvedCount) : 0;
    
    console.log('Calculating tickets per region...');
    console.log('Time range:', { startOfPeriod, endOfPeriod });

    // Aggregate tickets per region for the current period with SLA calculations
    const ticketsPerRegion = await OutageReport.aggregate([
      {
        $match: {
          occurrenceTime: { $gte: startOfPeriod, $lte: endOfPeriod }
        }
      },
      // Ensure region field exists and is not null/undefined
      {
        $addFields: {
          region: {
            $ifNull: ['$region', 'UNKNOWN_REGION']
          }
        }
      },
      {
        $project: {
          region: 1,
          status: 1,
          alarmType: 1,
          resolutionTime: 1,
          mandatoryRestorationTime: 1,
          occurrenceTime: 1,
          slaStatus: {
            $cond: [
              { $in: ['$status', ['Resolved', 'Closed']] },
              {
                $cond: [
                  { $and: [
                    '$resolutionTime',
                    '$mandatoryRestorationTime',
                    { $lte: ['$resolutionTime', '$mandatoryRestorationTime'] }
                  ]},
                  'within',
                  'out'
                ]
              },
              null
            ]
          },
          isResolved: { $in: ['$status', ['Resolved', 'Closed']] }
        }
      },
      {
        $group: {
          _id: '$region',
          region: { $first: '$region' }, // Keep the region name
          totalTickets: { $sum: 1 },
          openTickets: {
            $sum: { $cond: [{ $eq: ['$status', 'Open'] }, 1, 0] }
          },
          inProgressTickets: {
            $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] }
          },
          resolvedTickets: {
            $sum: { $cond: [{ $in: ['$status', ['Resolved', 'Closed']] }, 1, 0] }
          },
          withinSLATickets: {
            $sum: {
              $cond: [
                { $and: [
                  { $in: ['$status', ['Resolved', 'Closed']] },
                  { $ifNull: ['$resolutionTime', false] },
                  { $ifNull: ['$mandatoryRestorationTime', false] },
                  { $lte: ['$resolutionTime', '$mandatoryRestorationTime'] }
                ]},
                1,
                0
              ]
            }
          },
          outOfSLATickets: {
            $sum: {
              $cond: [
                { $and: [
                  { $in: ['$status', ['Resolved', 'Closed']] },
                  { $ifNull: ['$resolutionTime', false] },
                  { $ifNull: ['$mandatoryRestorationTime', false] },
                  { $gt: ['$resolutionTime', '$mandatoryRestorationTime'] }
                ]},
                1,
                0
              ]
            }
          },
          criticalAlarms: {
            $sum: { $cond: [{ $eq: ['$alarmType', 'CRITICAL'] }, 1, 0] }
          },
          majorAlarms: {
            $sum: { $cond: [{ $eq: ['$alarmType', 'MAJOR'] }, 1, 0] }
          },
          minorAlarms: {
            $sum: { $cond: [{ $eq: ['$alarmType', 'MINOR'] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          _id: 0,
          // Ensure we have a valid region value
          region: {
            $cond: {
              if: { $eq: ['$region', 'UNKNOWN_REGION'] },
              then: 'Unknown',
              else: '$region'
            }
          },
          totalTickets: 1,
          openTickets: 1,
          inProgressTickets: 1,
          resolvedTickets: 1,
          withinSLATickets: 1,
          outOfSLATickets: 1,
          criticalAlarms: 1,
          majorAlarms: 1,
          minorAlarms: 1
        }
      },
      {
        $sort: { totalTickets: -1 }
      }
    ]);

    // Debug log the ticketsPerRegion data
    console.log('Tickets per region with SLA metrics:');
    ticketsPerRegion.forEach(region => {
      console.log(`Region: ${region.region || 'Unknown'}`);
      console.log(`- Total Tickets: ${region.totalTickets}`);
      console.log(`- Open Tickets: ${region.openTickets}`);
      console.log(`- In Progress: ${region.inProgressTickets}`);
      console.log(`- Resolved Tickets: ${region.resolvedTickets}`);
      console.log(`- Within SLA: ${region.withinSLATickets || 0}`);
      console.log(`- Out of SLA: ${region.outOfSLATickets || 0}`);
      console.log(`- Critical Alarms: ${region.criticalAlarms}`);
      console.log(`- Major Alarms: ${region.majorAlarms}`);
      console.log(`- Minor Alarms: ${region.minorAlarms}`);
      console.log('---');
    });

    res.json({
      reportHour: startOfPeriod,
      ongoingOutages: ongoingOutages.map(r => ({
        id: r._id,
        siteNo: r.siteNo,
        siteCode: r.siteCode,
        region: r.region,
        alarmType: r.alarmType,
        occurrenceTime: r.occurrenceTime,
        expectedRestorationTime: r.expectedRestorationTime,
        mandatoryRestorationTime: r.mandatoryRestorationTime,
        supervisor: r.supervisor,
        rootCause: r.rootCause,
        subrootCause: r.subrootCause,
        username: r.username,
        status: r.status
      })),
      resolvedOutages: resolvedOutages.map(r => ({
        id: r._id,
        siteNo: r.siteNo,
        siteCode: r.siteCode,
        region: r.region,
        alarmType: r.alarmType,
        occurrenceTime: r.occurrenceTime,
        resolutionTime: r.resolutionTime,
        expectedRestorationTime: r.expectedRestorationTime,
        mandatoryRestorationTime: r.mandatoryRestorationTime,
        supervisor: r.supervisor,
        rootCause: r.rootCause,
        subrootCause: r.subrootCause,
        username: r.username,
        status: r.status
      }))  // Close the resolvedOutages.map()
    });    // Close the res.json()
  } catch (error) {
    console.error('Error in hourly reports:', error);
    res.status(500).json({ message: 'Server error while fetching hourly reports' });
  }
});

// @route   GET /api/outage-reports/daily
// @desc    Get daily outage report with alarms by root cause and tickets per region
// @access  Private
router.get('/daily', authenticate, async (req, res) => {
  try {
    const { reportDate } = req.query;

    let targetDate;
    if (reportDate) {
      targetDate = new Date(reportDate);
      if (isNaN(targetDate.getTime())) {
        return res.status(400).json({ message: 'Invalid date format' });
      }
    } else {
      targetDate = new Date();
    }

    // Set to start of day (00:00:00)
    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0);
    // Set to end of day (23:59:59)
    const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);

    // Get all reports for this day
    const dailyReports = await OutageReport.find({
      occurrenceTime: { $gte: startOfDay, $lte: endOfDay }
    }).populate('alarmId').sort({ occurrenceTime: -1 });

    // Aggregate alarms by root cause
    const alarmsByRootCause = await OutageReport.aggregate([
      {
        $match: {
          occurrenceTime: { $gte: startOfDay, $lte: endOfDay }
        }
      },
      {
        $group: {
          _id: '$rootCause',
          count: { $sum: 1 },
          alarms: {
            $push: {
              id: '$_id',
              siteNo: '$siteNo',
              siteCode: '$siteCode',
              region: '$region',
              alarmType: '$alarmType',
              occurrenceTime: '$occurrenceTime',
              status: '$status',
              supervisor: '$supervisor'
            }
          }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Debug: Log the region data before aggregation
    const regionSamples = await OutageReport.distinct('region', {
      occurrenceTime: { $gte: startOfDay, $lte: endOfDay }
    });
    console.log('Available regions in database:', regionSamples);
    console.log('Sample documents with region data:', await OutageReport.find({
      occurrenceTime: { $gte: startOfDay, $lte: endOfDay },
      region: { $exists: true, $ne: null }
    }).limit(5));

    // Aggregate tickets per region with SLA calculations
    const ticketsPerRegion = await OutageReport.aggregate([
      {
        $match: {
          occurrenceTime: { $gte: startOfDay, $lte: endOfDay }
        }
      },
      // First, ensure we have a valid region field
      {
        $addFields: {
          region: {
            $ifNull: ['$region', 'Unknown']
          }
        }
      },
      // Then group by region
      {
        $group: {
          _id: '$region',
          region: { $first: '$region' }, // Keep the region name
          totalTickets: { $sum: 1 },
          openTickets: {
            $sum: { $cond: [{ $eq: ['$status', 'Open'] }, 1, 0] }
          },
          inProgressTickets: {
            $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] }
          },
          resolvedTickets: {
            $sum: { $cond: [{ $in: ['$status', ['Resolved', 'Closed']] }, 1, 0] }
          },
          // Calculate SLA compliance - simplified to just check slaStatus field
          withinSLATickets: {
            $sum: {
              $cond: [
                { $eq: ['$slaStatus', 'within'] },
                1,
                0
              ]
            }
          },
          outOfSLATickets: {
            $sum: {
              $cond: [
                { $eq: ['$slaStatus', 'out'] },
                1,
                0
              ]
            }
          },
          criticalAlarms: {
            $sum: { $cond: [{ $eq: ['$alarmType', 'CRITICAL'] }, 1, 0] }
          },
          majorAlarms: {
            $sum: { $cond: [{ $eq: ['$alarmType', 'MAJOR'] }, 1, 0] }
          },
          minorAlarms: {
            $sum: { $cond: [{ $eq: ['$alarmType', 'MINOR'] }, 1, 0] }
          }
        }
      },
      // Sort by region name for consistent ordering
      {
        $sort: { region: 1 }
      }
    ]);

    // Calculate summary metrics
    const totalReports = dailyReports.length;
    const totalOpen = dailyReports.filter(r => r.status === 'Open').length;
    const totalInProgress = dailyReports.filter(r => r.status === 'In Progress').length;
    const totalResolved = dailyReports.filter(r => r.status === 'Resolved' || r.status === 'Closed').length;

    // Calculate MTTR for resolved tickets
    const resolvedReports = dailyReports.filter(r => 
      (r.status === 'Resolved' || r.status === 'Closed') && 
      r.resolutionTime && 
      r.occurrenceTime
    );

    let totalResolutionMinutes = 0;
    resolvedReports.forEach(report => {
      const durationMinutes = Math.round((report.resolutionTime - report.occurrenceTime) / 60000);
      totalResolutionMinutes += durationMinutes;
    });

    const mttr = resolvedReports.length > 0 ? Math.round(totalResolutionMinutes / resolvedReports.length) : 0;

    // Log the ticketsPerRegion data
    console.log('ticketsPerRegion raw aggregation result:', JSON.stringify(ticketsPerRegion, null, 2));
    
    const responseData = {
      reportDate: startOfDay,
      summary: {
        totalReports,
        totalOpen,
        totalInProgress,
        totalResolved,
        mttr
      },
      alarmsByRootCause: alarmsByRootCause.map(item => ({
        rootCause: item._id,
        count: item.count,
        alarms: item.alarms
      })),
      ticketsPerRegion: ticketsPerRegion.map(item => ({
        region: item.region || item._id || 'Unknown',
        _id: item.region || item._id || 'Unknown', // For backward compatibility
        totalTickets: item.totalTickets || 0,
        openTickets: item.openTickets || 0,
        inProgressTickets: item.inProgressTickets || 0,
        resolvedTickets: item.resolvedTickets || 0,
        withinSLATickets: item.withinSLATickets || 0,
        within_sla: item.withinSLATickets || 0, // For backward compatibility
        outOfSLATickets: item.outOfSLATickets || 0,
        out_of_sla: item.outOfSLATickets || 0, // For backward compatibility
        criticalAlarms: item.criticalAlarms || 0,
        majorAlarms: item.majorAlarms || 0,
        minorAlarms: item.minorAlarms || 0
      })),
      allReports: dailyReports.map(r => ({
        id: r._id,
        siteNo: r.siteNo,
        siteCode: r.siteCode,
        region: r.region,
        alarmType: r.alarmType,
        occurrenceTime: r.occurrenceTime,
        resolutionTime: r.resolutionTime,
        expectedRestorationTime: r.expectedRestorationTime,
        mandatoryRestorationTime: r.mandatoryRestorationTime,
        supervisor: r.supervisor,
        rootCause: r.rootCause,
        status: r.status
      }))
    };
    
    console.log('Sending response with ticketsPerRegion:', JSON.stringify(responseData.ticketsPerRegion, null, 2));
    res.json(responseData);
  } catch (error) {
    console.error('Error fetching daily outage reports:', error);
    res.status(500).json({ message: 'Server error while fetching daily reports' });
  }
});

// @route   GET /api/outage-reports/:id
// @desc    Get single outage report by ID
// @access  Private
router.get('/:id', authenticate, async (req, res) => {
  try {
    const report = await OutageReport.findById(req.params.id)
      .populate('createdBy', 'name username')
      .populate('updatedBy', 'name username');

    if (!report) {
      return res.status(404).json({ message: 'Outage report not found' });
    }

    res.json(report);
  } catch (error) {
    console.error('Error fetching outage report:', error);
    res.status(500).json({ message: 'Server error while fetching outage report' });
  }
});

// @route   PUT /api/outage-reports/:id
// @desc    Update outage report with context-aware field requirements
// @access  Private
router.put('/:id', authenticate, async (req, res) => {
  try {
    // Get the original report first to check current values
    const originalReport = await OutageReport.findById(req.params.id).lean();
    if (!originalReport) {
      return res.status(404).json({ message: 'Outage report not found' });
    }

    const {
      rootCause,
      subrootCause,
      username,
      resolutionTime,
      expectedResolutionTime,
      expectedResolutionHours,
      expectedRestorationTime,
      mandatoryRestorationTime,
      status,
      supervisor
    } = req.body;

    const updateData = {};
    
    // Only update fields that are provided in the request
    // and only if they're different from current values
    const setIfChanged = (field, newValue) => {
      if (newValue !== undefined && JSON.stringify(originalReport[field]) !== JSON.stringify(newValue)) {
        updateData[field] = newValue;
      }
    };

    // Update fields only if they're provided and different from current values
    setIfChanged('rootCause', rootCause);
    setIfChanged('subrootCause', subrootCause);
    setIfChanged('username', username);
    
    // Handle resolution time - only update if it's a new resolution
    if (resolutionTime !== undefined && !originalReport.resolutionTime) {
      updateData.resolutionTime = resolutionTime;
    }

    // Handle expected resolution hours
    const expectedHoursSource = expectedResolutionTime !== undefined ? expectedResolutionTime : expectedResolutionHours;
    if (expectedHoursSource !== undefined) {
      const parsedHours = typeof expectedHoursSource === 'string' ? parseFloat(expectedHoursSource) : expectedHoursSource;
      if (!Number.isNaN(parsedHours) && parsedHours !== originalReport.expectedResolutionHours) {
        updateData.expectedResolutionHours = parsedHours;
      }
    }

    // Only update restoration times if they're being explicitly set or changed
    setIfChanged('expectedRestorationTime', expectedRestorationTime);
    setIfChanged('mandatoryRestorationTime', mandatoryRestorationTime);
    
    // Only update status if it's being changed
    setIfChanged('status', status);
    setIfChanged('supervisor', supervisor);

    // If no fields are being updated, return the original report
    if (Object.keys(updateData).length === 0) {
      return res.json(originalReport);
    }
    
    // Update the report with the new data
    const updatedReport = await outageReportService.updateOutageReport(
      req.params.id,
      updateData,
      req.user.id
    );

    // Log the update action
    try {
      // Determine what changed
      const changes = [];
      for (const [key, newValue] of Object.entries(updateData)) {
        if (JSON.stringify(originalReport[key]) !== JSON.stringify(newValue)) {
          changes.push({
            field: key,
            oldValue: originalReport[key],
            newValue: newValue
          });
        }
      }

      if (changes.length > 0) {
        await logAudit(req, {
          action: 'outage:update',
          target: `outage:${req.params.id}`,
          details: {
            changes: changes,
            report: {
              siteNo: originalReport.siteNo,
              siteCode: originalReport.siteCode,
              region: originalReport.region,
              alarmType: originalReport.alarmType
            }
          },
          status: 'success'
        });
      }
    } catch (auditError) {
      console.error('Failed to log outage report update:', auditError);
      // Don't fail the request if audit logging fails
    }

    res.json(updatedReport);
  } catch (error) {
    console.error('Error updating outage report:', error);

    if (error.message === 'Outage report not found') {
      return res.status(404).json({ message: error.message });
    }

    res.status(500).json({ message: 'Server error while updating outage report' });
  }
});

// @route   POST /api/outage-reports
// @desc    Create new outage report manually
// @access  Private
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      siteNo,
      siteCode,
      region,
      alarmType,
      occurrenceTime,
      supervisor,
      rootCause,
      subrootCause,
      username,
      resolutionTime,
      status,
      expectedRestorationTime,
      mandatoryRestorationTime // This is now required
    } = req.body;

    const outageReport = new OutageReport({
      siteNo,
      siteCode,
      region,
      alarmType,
      occurrenceTime: occurrenceTime ? new Date(occurrenceTime) : new Date(),
      supervisor,
      rootCause,
      subrootCause,
      username,
      resolutionTime: resolutionTime ? new Date(resolutionTime) : null,
      expectedRestorationTime: expectedRestorationTime ? new Date(expectedRestorationTime) : null,
      mandatoryRestorationTime: mandatoryRestorationTime ? new Date(mandatoryRestorationTime) : null,
      status,
      createdBy: req.user.id,
      reportHour: new Date() // Current hour for reporting
    });

    const savedReport = await outageReport.save();

    res.status(201).json(savedReport);
  } catch (error) {
    console.error('Error creating outage report:', error);

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({ message: 'Server error while creating outage report' });
  }
});

// @route   DELETE /api/outage-reports/:id
// @desc    Delete outage report
// @access  Private (Admin only)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    // Check if user has admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const deletedReport = await OutageReport.findByIdAndDelete(req.params.id);

    if (!deletedReport) {
      return res.status(404).json({ message: 'Outage report not found' });
    }

    res.json({ message: 'Outage report deleted successfully' });
  } catch (error) {
    console.error('Error deleting outage report:', error);
    res.status(500).json({ message: 'Server error while deleting outage report' });
  }
});

// @route   GET /api/outage-reports/stats/summary
// @desc    Get outage report statistics
// @access  Private
router.get('/stats/summary', authenticate, async (req, res) => {
  try {
    const totalReports = await OutageReport.countDocuments();
    const inProgressReports = await OutageReport.countDocuments({ status: 'In Progress' });
    const resolvedReports = await OutageReport.countDocuments({ status: 'Resolved' });

    // Reports by region
    const byRegion = await OutageReport.aggregate([
      {
        $group: {
          _id: '$region',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Reports by alarm type
    const byAlarmType = await OutageReport.aggregate([
      {
        $group: {
          _id: '$alarmType',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    res.json({
      total: totalReports,
      open: openReports,
      inProgress: inProgressReports,
      resolved: resolvedReports,
      byRegion: byRegion.map(item => ({
        region: item._id,
        count: item.count
      })),
      byAlarmType: byAlarmType.map(item => ({
        alarmType: item._id,
        count: item.count
      }))
    });
  } catch (error) {
    console.error('Error fetching outage report statistics:', error);
    res.status(500).json({ message: 'Server error while fetching statistics' });
  }
});

// @route   POST /api/outage-reports/update-from-email
// @desc    Update outage report from email form submission
// @access  Public (for email form submissions)
router.post('/update-from-email', async (req, res) => {
  try {
    const { reportId, rootCause, subrootCause, username, resolutionTime, status, mandatoryRestorationTime } = req.body;

    if (!reportId) {
      return res.status(400).json({ message: 'Report ID is required' });
    }

    // Find the outage report
    const report = await OutageReport.findById(reportId);
    if (!report) {
      return res.status(404).json({ message: 'Outage report not found' });
    }

    // Update the editable fields
    const updateData = {};
    if (rootCause !== undefined) updateData.rootCause = rootCause;
    if (subrootCause !== undefined) updateData.subrootCause = subrootCause;
    if (username !== undefined) updateData.username = username;
    if (resolutionTime !== undefined && resolutionTime !== '') {
      updateData.resolutionTime = new Date(resolutionTime);
    }
    // Map expectedResolutionTime (hours) -> expectedResolutionHours (Number)
    if (expectedResolutionTime !== undefined && expectedResolutionTime !== '') {
      const parsedHours = typeof expectedResolutionTime === 'string' ? parseFloat(expectedResolutionTime) : expectedResolutionTime;
      if (!Number.isNaN(parsedHours)) {
        updateData.expectedResolutionHours = parsedHours;
      }
    }
    if (mandatoryRestorationTime !== undefined && mandatoryRestorationTime !== '') {
      updateData.mandatoryRestorationTime = new Date(mandatoryRestorationTime);
    }
    if (status !== undefined) updateData.status = status;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    // Update the report
    const updatedReport = await OutageReport.findByIdAndUpdate(
      reportId,
      {
        ...updateData,
        updatedAt: new Date(),
        updatedBy: 'email-submission' // Mark as updated from email
      },
      { new: true, runValidators: true }
    );

    console.log(`✅ Outage report ${reportId} updated from email submission`);

    res.json({
      success: true,
      message: 'Outage report updated successfully',
      report: updatedReport
    });

  } catch (error) {
    console.error('❌ Error updating outage report from email:', error);
    res.status(500).json({ message: 'Failed to update outage report' });
  }
});

export default router;
