import express from 'express';
import OutageReport from '../models/OutageReport.js';
import { authenticate } from '../middleware/auth.js';
import { outageReportService } from '../services/outageReportService.js';
import { logAudit } from '../services/auditLogger.js';
import Alarm from '../models/Alarm.js';
import Ticket from '../models/Ticket.js';

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
      // For date range queries, include both occurrence time and resolution time for resolved reports
      // AND include carry-over outages (ongoing from previous days)
      const dateFilter = {};
      if (startDate) {
        dateFilter.$gte = new Date(startDate);
      }
      if (endDate) {
        dateFilter.$lte = new Date(endDate);
      }

      // Include reports that either:
      // 1. Occurred in the date range, OR
      // 2. Were resolved in the date range (for carry-over reports), OR
      // 3. Are still ongoing and occurred before the date range (carry-over outages)
      filter.$or = [
        { occurrenceTime: dateFilter },
        {
          resolutionTime: dateFilter,
          status: { $in: ['Resolved', 'Closed'] }
        },
        // Carry-over outages: unresolved reports from before the selected date range
        {
          occurrenceTime: { $lt: startDate ? new Date(startDate) : new Date() },
          status: { $in: ['Open', 'In Progress'] }
        }
      ];
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
        $or: [
          // Reports that occurred today
          { occurrenceTime: { $gte: startOfPeriod, $lt: endOfPeriod } },
          // Resolved reports that were resolved today (carry-over outages)
          {
            resolutionTime: { $gte: startOfPeriod, $lt: endOfPeriod },
            status: { $in: ['Resolved', 'Closed'] }
          },
          // Unresolved carry-over outages from previous days
          {
            occurrenceTime: { $lt: startOfPeriod },
            status: { $in: ['Open', 'In Progress'] }
          }
        ]
      }).populate('alarmId').sort({ occurrenceTime: -1 });

      console.log('🔍 HOURLY: Fetched from DB:', {
        total: allReportsThisHour.length,
        dateRange: { startOfPeriod, endOfPeriod },
        resolvedTodayCount: allReportsThisHour.filter(r => 
          (r.status === 'Resolved' || r.status === 'Closed') && 
          r.resolutionTime >= startOfPeriod && 
          r.resolutionTime < endOfPeriod
        ).length
      });
    }

    const ongoingOutages = allReportsThisHour.filter(r => r.status === 'Open' || r.status === 'In Progress');
    const resolvedOutages = allReportsThisHour.filter(r => 
      (r.status === 'Resolved' || r.status === 'Closed') &&
      r.resolutionTime &&
      r.resolutionTime >= startOfPeriod &&
      r.resolutionTime < endOfPeriod
    );

    // Calculate SLA metrics from resolved outage reports
    const slaThresholds = {
      critical: parseInt(process.env.SLA_CRITICAL_MINUTES || '60'),    // 1 hour
      major: parseInt(process.env.SLA_MAJOR_MINUTES || '120'),        // 2 hours
      minor: parseInt(process.env.SLA_MINOR_MINUTES || '240'),        // 4 hours
      warning: parseInt(process.env.SLA_WARNING_MINUTES || '480'),    // 8 hours
      info: parseInt(process.env.SLA_INFO_MINUTES || '1440')          // 24 hours
    };

    let withinSLA = 0;
    let outOfSLA = 0;
    let totalResolutionMinutes = 0;
    let resolvedCount = 0;

    // First, update SLA status for all resolved reports
    for (const report of resolvedOutages) {
      const startTime = report.occurrenceTime;
      const endTime = report.resolutionTime;
      const mandatoryRestorationTime = report.mandatoryRestorationTime;
      
      if (startTime && endTime) {
        const durationMinutes = Math.round((endTime - startTime) / 60000);
        totalResolutionMinutes += durationMinutes;
        resolvedCount++;

        let isWithinSLA = false;
        
        // Use mandatoryRestorationTime as the SLA deadline if available
        if (mandatoryRestorationTime) {
          const slaDeadline = new Date(mandatoryRestorationTime);
          isWithinSLA = endTime <= slaDeadline;
        } else {
          // Fallback to default SLAs based on alarm type
          const thresholdMinutes = slaThresholds[report.alarmType?.toLowerCase()] || 240; // Default to 4 hours
          isWithinSLA = durationMinutes <= thresholdMinutes;
        }

        // Update the SLA status in the database
        if (report.status === 'Resolved' || report.status === 'Closed') {
          await OutageReport.findByIdAndUpdate(report._id, {
            slaStatus: isWithinSLA ? 'within' : 'out',
            expectedResolutionHours: slaThresholds[report.alarmType?.toLowerCase()] / 60 || 4
          });
        }

        // Update counters
        if (isWithinSLA) {
          withinSLA++;
        } else {
          outOfSLA++;
        }
      }
    }

    const mttr = resolvedCount > 0 ? Math.round(totalResolutionMinutes / resolvedCount) : 0;
    
    console.log('Calculating tickets per region...');
    console.log('Time range:', { startOfPeriod, endOfPeriod });

    // Aggregate tickets per region for the current period with SLA calculations (include carry-overs and resolved today)
    const ticketsPerRegion = await OutageReport.aggregate([
      {
        $match: {
          $or: [
            { occurrenceTime: { $gte: startOfPeriod, $lte: endOfPeriod } },
            { resolutionTime: { $gte: startOfPeriod, $lte: endOfPeriod }, status: { $in: ['Resolved', 'Closed'] } },
            { occurrenceTime: { $lt: startOfPeriod }, status: { $in: ['Open', 'In Progress'] } }
          ]
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

    // Format the response with all the data including ticketsPerRegion
    const response = {
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
        expectedRestorationTime: r.expectedRestorationTime,
        mandatoryRestorationTime: r.mandatoryRestorationTime,
        resolutionTime: r.resolutionTime,
        status: r.status,
        slaStatus: r.slaStatus,
        rootCause: r.rootCause,
        subrootCause: r.subrootCause,
        username: r.username,
        supervisor: r.supervisor
      })),
      ticketsPerRegion: ticketsPerRegion
    };

    console.log('Sending response with ticketsPerRegion count:', response.ticketsPerRegion.length);
    res.json(response);
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

    // Get all reports for this day, including unresolved carry-overs and carry-overs resolved today
    const dailyReports = await OutageReport.find({
      $or: [
        // Reports that occurred on the selected date
        { occurrenceTime: { $gte: startOfDay, $lte: endOfDay } },
        // Reports that were resolved on the selected date (carry-overs resolved today)
        {
          resolutionTime: { $gte: startOfDay, $lte: endOfDay },
          status: { $in: ['Resolved', 'Closed'] }
        },
        // Unresolved carry-over outages from previous days
        {
          occurrenceTime: { $lt: startOfDay },
          status: { $in: ['Open', 'In Progress'] }
        }
      ]
    }).populate('alarmId').sort({ occurrenceTime: -1 });

    console.log('🔍 DAILY: Fetched from DB:', {
      total: dailyReports.length,
      dateRange: { startOfDay, endOfDay },
      resolvedToday: dailyReports.filter(r => 
        (r.status === 'Resolved' || r.status === 'Closed') && 
        r.resolutionTime >= startOfDay && 
        r.resolutionTime <= endOfDay
      ).map(r => ({
        id: r._id,
        siteCode: r.siteCode,
        occurrenceTime: r.occurrenceTime,
        resolutionTime: r.resolutionTime,
        isCarryOver: r.occurrenceTime < startOfDay
      }))
    });

    // Aggregate alarms by root cause (aligned with ticketsPerRegion scope)
    const alarmsByRootCause = await OutageReport.aggregate([
      {
        $match: {
          $or: [
            { occurrenceTime: { $gte: startOfDay, $lte: endOfDay } },
            { resolutionTime: { $gte: startOfDay, $lte: endOfDay }, status: { $in: ['Resolved', 'Closed'] } },
            { occurrenceTime: { $lt: startOfDay }, status: { $in: ['Open', 'In Progress'] } }
          ]
        }
      },
      { $addFields: { rootCause: { $ifNull: ['$rootCause', 'Not specified'] } } },
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
      { $project: { _id: 0, rootCause: '$_id', count: 1, alarms: 1 } },
      { $sort: { count: -1 } }
    ]);

    // First, update SLA status for all tickets resolved in this period
    const resolvedTickets = await OutageReport.find({
      resolutionTime: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ['Resolved', 'Closed'] }
    });

    // Update SLA status for each resolved ticket
    for (const ticket of resolvedTickets) {
      let isWithinSLA = false;
      
      if (ticket.resolutionTime && ticket.mandatoryRestorationTime) {
        isWithinSLA = ticket.resolutionTime <= ticket.mandatoryRestorationTime;
      } else if (ticket.resolutionTime && ticket.occurrenceTime) {
        // Fallback to default SLA based on alarm type
        const slaThresholds = {
          'CRITICAL': 60,    // 1 hour
          'MAJOR': 120,      // 2 hours
          'MINOR': 240,      // 4 hours
          'WARNING': 480,    // 8 hours
          'INFO': 1440       // 24 hours
        };
        
        const durationMinutes = Math.round((ticket.resolutionTime - ticket.occurrenceTime) / (1000 * 60));
        const threshold = slaThresholds[ticket.alarmType] || 240; // Default to 4 hours
        isWithinSLA = durationMinutes <= threshold;
      }

      // Only update if slaStatus is not already set or needs to be updated
      if (ticket.slaStatus !== (isWithinSLA ? 'within' : 'out')) {
        await OutageReport.findByIdAndUpdate(ticket._id, {
          slaStatus: isWithinSLA ? 'within' : 'out'
        });
      }
    }

    // Debug: Log the region data before aggregation
    const regionSamples = await OutageReport.distinct('region', {
      occurrenceTime: { $gte: startOfDay, $lte: endOfDay }
    });
    console.log('Available regions in database:', regionSamples);
    console.log('Sample documents with region data:', await OutageReport.find({
      occurrenceTime: { $gte: startOfDay, $lte: endOfDay },
      region: { $exists: true, $ne: null }
    }).limit(5));

    // Aggregate tickets per region with SLA calculations (include carry-overs and resolved today)
    const ticketsPerRegion = await OutageReport.aggregate([
      {
        $match: {
          $or: [
            { occurrenceTime: { $gte: startOfDay, $lte: endOfDay } },
            { resolutionTime: { $gte: startOfDay, $lte: endOfDay }, status: { $in: ['Resolved', 'Closed'] } },
            { occurrenceTime: { $lt: startOfDay }, status: { $in: ['Open', 'In Progress'] } }
          ]
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
          // Calculate SLA compliance based on resolution time and mandatory restoration time
          withinSLATickets: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ['$status', ['Resolved', 'Closed']] },
                    { $ifNull: ['$resolutionTime', false] },
                    {
                      $or: [
                        { $and: [
                          { $ifNull: ['$mandatoryRestorationTime', false] },
                          { $lte: ['$resolutionTime', '$mandatoryRestorationTime'] }
                        ]},
                        { $and: [
                          { $not: { $ifNull: ['$mandatoryRestorationTime', true] } },
                          { $lte: [
                            { $divide: [
                              { $subtract: ['$resolutionTime', '$occurrenceTime'] },
                              60000 // Convert ms to minutes
                            ]},
                            {
                              $switch: {
                                branches: [
                                  { case: { $eq: ['$alarmType', 'CRITICAL'] }, then: 60 },
                                  { case: { $eq: ['$alarmType', 'MAJOR'] }, then: 120 },
                                  { case: { $eq: ['$alarmType', 'MINOR'] }, then: 240 },
                                  { case: { $eq: ['$alarmType', 'WARNING'] }, then: 480 },
                                  { case: { $eq: ['$alarmType', 'INFO'] }, then: 1440 }
                                ],
                                default: 240 // Default to 4 hours
                              }
                            }
                          ]}
                        ]}
                      ]
                    }
                  ]
                },
                1,
                0
              ]
            }
          },
          outOfSLATickets: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ['$status', ['Resolved', 'Closed']] },
                    { $ifNull: ['$resolutionTime', false] },
                    {
                      $or: [
                        { $and: [
                          { $ifNull: ['$mandatoryRestorationTime', false] },
                          { $gt: ['$resolutionTime', '$mandatoryRestorationTime'] }
                        ]},
                        { $and: [
                          { $not: { $ifNull: ['$mandatoryRestorationTime', true] } },
                          { $gt: [
                            { $divide: [
                              { $subtract: ['$resolutionTime', '$occurrenceTime'] },
                              60000 // Convert ms to minutes
                            ]},
                            {
                              $switch: {
                                branches: [
                                  { case: { $eq: ['$alarmType', 'CRITICAL'] }, then: 60 },
                                  { case: { $eq: ['$alarmType', 'MAJOR'] }, then: 120 },
                                  { case: { $eq: ['$alarmType', 'MINOR'] }, then: 240 },
                                  { case: { $eq: ['$alarmType', 'WARNING'] }, then: 480 },
                                  { case: { $eq: ['$alarmType', 'INFO'] }, then: 1440 }
                                ],
                                default: 240 // Default to 4 hours
                              }
                            }
                          ]}
                        ]}
                      ]
                    }
                  ]
                },
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
      alarmsByRootCause,
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

// @route   GET /api/outage-reports/metrics/trends
// @desc    Get SLA% and MTTR trends for the last N days ending at endDate (inclusive)
// @access  Private
router.get('/metrics/trends', authenticate, async (req, res) => {
  try {
    const days = Math.max(1, Math.min(parseInt(req.query.days || '7', 10), 60));
    const endDateParam = req.query.endDate;
    let endDate = endDateParam ? new Date(endDateParam) : new Date();
    if (isNaN(endDate.getTime())) {
      return res.status(400).json({ message: 'Invalid endDate format' });
    }

    // Normalize endDate to start of day to include that day fully
    endDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

    const results = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(endDate);
      day.setDate(endDate.getDate() - i);
      const startOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
      const endOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);

      // Get all reports for this day (include carry-overs resolved today)
      const dailyReports = await OutageReport.find({
        $or: [
          { occurrenceTime: { $gte: startOfDay, $lte: endOfDay } },
          { resolutionTime: { $gte: startOfDay, $lte: endOfDay }, status: { $in: ['Resolved', 'Closed'] } },
          { occurrenceTime: { $lt: startOfDay }, status: { $in: ['Open', 'In Progress'] } }
        ]
      }).select('status occurrenceTime resolutionTime mandatoryRestorationTime alarmType');

      // Compute MTTR from resolved reports
      const resolvedReports = dailyReports.filter(r => (r.status === 'Resolved' || r.status === 'Closed') && r.resolutionTime && r.occurrenceTime);
      let totalResolutionMinutes = 0;
      for (const r of resolvedReports) {
        totalResolutionMinutes += Math.round((r.resolutionTime - r.occurrenceTime) / 60000);
      }
      const mttr = resolvedReports.length > 0 ? Math.round(totalResolutionMinutes / resolvedReports.length) : 0;

      // Compute SLA compliance (within mandatory restoration time if set; otherwise default thresholds)
      const slaThresholds = {
        CRITICAL: 60,
        MAJOR: 120,
        MINOR: 240,
        WARNING: 480,
        INFO: 1440
      };
      let within = 0;
      for (const r of resolvedReports) {
        let isWithin = false;
        if (r.mandatoryRestorationTime) {
          isWithin = r.resolutionTime <= r.mandatoryRestorationTime;
        } else {
          const durationMinutes = Math.round((r.resolutionTime - r.occurrenceTime) / 60000);
          const threshold = slaThresholds[r.alarmType] || 240;
          isWithin = durationMinutes <= threshold;
        }
        if (isWithin) within++;
      }
      const sla = resolvedReports.length > 0 ? Math.round((within / resolvedReports.length) * 100) : 0;

      const label = `${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      results.push({ date: label, sla, mttr });
    }

    res.json({ range: days, endDate: endDate.toISOString(), points: results });
  } catch (error) {
    console.error('Error fetching trends:', error);
    res.status(500).json({ message: 'Server error while fetching trends' });
  }
});

// @route   GET /api/outage-reports/metrics/monthly
// @desc    Get monthly aggregates by region and root causes for a given YYYY-MM
// @access  Private
router.get('/metrics/monthly', authenticate, async (req, res) => {
  try {
    const { month } = req.query; // YYYY-MM
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ message: 'month is required as YYYY-MM' });
    }
    const [y, m] = month.split('-').map(n => parseInt(n, 10));
    const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const end = new Date(y, m, 0, 23, 59, 59, 999);

    // Aggregate tickets per region for the month
    const ticketsPerRegion = await OutageReport.aggregate([
      {
        $match: {
          $or: [
            { occurrenceTime: { $gte: start, $lte: end } },
            { resolutionTime: { $gte: start, $lte: end }, status: { $in: ['Resolved', 'Closed'] } },
            { occurrenceTime: { $lt: start }, status: { $in: ['Open', 'In Progress'] } }
          ]
        }
      },
      {
        $addFields: { region: { $ifNull: ['$region', 'Unknown'] } }
      },
      {
        $group: {
          _id: '$region',
          region: { $first: '$region' },
          totalTickets: { $sum: 1 },
          openTickets: { $sum: { $cond: [{ $eq: ['$status', 'Open'] }, 1, 0] } },
          inProgressTickets: { $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] } },
          resolvedTickets: { $sum: { $cond: [{ $in: ['$status', ['Resolved', 'Closed']] }, 1, 0] } },
          withinSLATickets: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ['$status', ['Resolved', 'Closed']] },
                    { $ifNull: ['$resolutionTime', false] },
                    {
                      $or: [
                        { $and: [ { $ifNull: ['$mandatoryRestorationTime', false] }, { $lte: ['$resolutionTime', '$mandatoryRestorationTime'] } ] },
                        { $and: [ { $not: { $ifNull: ['$mandatoryRestorationTime', true] } }, { $lte: [ { $divide: [{ $subtract: ['$resolutionTime', '$occurrenceTime'] }, 60000] }, 240 ] } ] }
                      ]
                    }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      { $project: { _id: 0, region: 1, totalTickets: 1, openTickets: 1, inProgressTickets: 1, resolvedTickets: 1, withinSLATickets: 1 } },
      { $sort: { totalTickets: -1 } }
    ]);

    // Aggregate root causes for the month (occurrence-based)
    const alarmsByRootCause = await OutageReport.aggregate([
      { $match: { occurrenceTime: { $gte: start, $lte: end } } },
      { $group: { _id: '$rootCause', count: { $sum: 1 } } },
      { $project: { _id: 0, rootCause: '$_id', count: 1 } },
      { $sort: { count: -1 } }
    ]);

    // Monthly summary
    const totalReports = await OutageReport.countDocuments({
      $or: [
        { occurrenceTime: { $gte: start, $lte: end } },
        { resolutionTime: { $gte: start, $lte: end }, status: { $in: ['Resolved', 'Closed'] } },
        { occurrenceTime: { $lt: start }, status: { $in: ['Open', 'In Progress'] } }
      ]
    });

    // Region-Day heatmap matrix (occurrence-based for performance)
    const dayCounts = await OutageReport.aggregate([
      { $match: { occurrenceTime: { $gte: start, $lte: end } } },
      { $addFields: { region: { $ifNull: ['$region', 'Unknown'] }, day: { $dayOfMonth: '$occurrenceTime' } } },
      { $group: { _id: { region: '$region', day: '$day' }, count: { $sum: 1 } } },
      { $project: { _id: 0, region: '$_id.region', day: '$_id.day', count: 1 } }
    ]);
    const daysInMonth = new Date(y, m, 0).getDate();
    const regionsSet = new Set(dayCounts.map(d => d.region));
    const matrixValues = {};
    Array.from(regionsSet).forEach(r => { matrixValues[r] = Array(daysInMonth).fill(0); });
    dayCounts.forEach(({ region, day, count }) => {
      if (!matrixValues[region]) matrixValues[region] = Array(daysInMonth).fill(0);
      matrixValues[region][Math.max(0, Math.min(daysInMonth - 1, (day || 1) - 1))] = count;
    });

    // Precomputed monthly MTTR (resolved within month)
    const mttrAgg = await OutageReport.aggregate([
      { $match: { status: { $in: ['Resolved', 'Closed'] }, resolutionTime: { $gte: start, $lte: end }, occurrenceTime: { $ne: null } } },
      { $project: { minutes: { $divide: [{ $subtract: ['$resolutionTime', '$occurrenceTime'] }, 60000] } } },
      { $group: { _id: null, avgMinutes: { $avg: '$minutes' } } }
    ]);
    const mttrMonthly = Math.round((mttrAgg?.[0]?.avgMinutes || 0));

    res.json({
      month,
      summary: { totalReports, mttr: mttrMonthly },
      ticketsPerRegion,
      alarmsByRootCause,
      regionDayMatrix: {
        days: daysInMonth,
        regions: Array.from(regionsSet),
        values: matrixValues
      }
    });
  } catch (error) {
    console.error('Error fetching monthly metrics:', error);
    res.status(500).json({ message: 'Server error while fetching monthly metrics' });
  }
});

// @route   GET /api/outage-reports/carry-over
// @desc    Get carry-over outage reports (unresolved from previous days)
// @access  Private
router.get('/carry-over', authenticate, async (req, res) => {
  try {
    const { selectedDate } = req.query;

    if (!selectedDate) {
      return res.status(400).json({ message: 'Selected date is required' });
    }

    const selectedDateObj = new Date(selectedDate);
    if (isNaN(selectedDateObj.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' });
    }

    // Set to start of the selected day
    selectedDateObj.setHours(0, 0, 0, 0);

    console.log(`📊 Fetching carry-over reports for date: ${selectedDateObj.toISOString()}`);

    // Find all reports that:
    // 1. Occurred before the selected date
    // 2. Are still unresolved (status is 'Open' or 'In Progress')
    const carryOverReports = await OutageReport.find({
      occurrenceTime: { $lt: selectedDateObj },
      status: { $in: ['Open', 'In Progress'] }
    })
    .populate([
      { path: 'createdBy', select: 'name username' },
      { path: 'updatedBy', select: 'name username' }
    ])
    .sort({ occurrenceTime: -1 })
    .lean();

    console.log(`✅ Found ${carryOverReports.length} carry-over reports`);

    // Transform the reports to include id field
    const transformedReports = carryOverReports.map(report => ({
      ...report,
      id: report._id.toString()
    }));

    res.json({
      reports: transformedReports,
      pagination: {
        total: transformedReports.length,
        page: 1,
        pages: 1,
        limit: transformedReports.length,
        hasNext: false,
        hasPrev: false
      }
    });

  } catch (error) {
    console.error('❌ Error fetching carry-over reports:', error);
    res.status(500).json({ message: 'Server error while fetching carry-over reports' });
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
      rootCause = originalReport.rootCause || 'Others',
      subrootCause = originalReport.subrootCause || 'Not specified',
      username = originalReport.username || 'noc-team',
      resolutionTime = originalReport.resolutionTime || new Date(),
      status = originalReport.status,
      expectedRestorationTime,
      mandatoryRestorationTime,
      expectedResolutionHours = originalReport.expectedResolutionHours,
      supervisor = originalReport.supervisor || 'Not assigned'
    } = req.body;

    // MERGE WITHOUT OVERWRITING MISSING FIELDS - This is the key fix!
    const updateData = {
      rootCause,
      subrootCause,
      username,
      // Convert resolutionTime if explicitly provided; otherwise keep original
      ...(resolutionTime !== undefined && resolutionTime !== null && resolutionTime !== ''
        ? { resolutionTime: new Date(resolutionTime) }
        : { resolutionTime: originalReport.resolutionTime }),
      status,
      // Only update ERT if explicitly provided and not empty-string; cast to Date
      ...(expectedRestorationTime !== undefined && expectedRestorationTime !== null && expectedRestorationTime !== ''
        ? { expectedRestorationTime: new Date(expectedRestorationTime) }
        : {}),
      // Only update MRT if explicitly provided and not empty-string; cast to Date
      ...(mandatoryRestorationTime !== undefined && mandatoryRestorationTime !== null && mandatoryRestorationTime !== ''
        ? { mandatoryRestorationTime: new Date(mandatoryRestorationTime) }
        : {}),
      expectedResolutionHours,
      supervisor
    };

    // Debug logs to trace MRT/ERT behavior during updates
    console.log('🧪 Outage PUT payload (raw):', {
      id: req.params.id,
      bodyMRT: req.body.mandatoryRestorationTime,
      bodyERT: req.body.expectedRestorationTime,
      bodyResolutionTime: req.body.resolutionTime,
      bodyStatus: req.body.status
    });
    console.log('🧪 Outage PUT updateData (merged):', {
      id: req.params.id,
      mergedMRT: updateData.mandatoryRestorationTime,
      mergedERT: updateData.expectedRestorationTime,
      mergedResolutionTime: updateData.resolutionTime,
      mergedStatus: updateData.status
    });

    // For resolved reports, COMPUTE AND SAVE SLA STATUS
    if (['Resolved', 'Closed'].includes(status)) {
      // Only compute if it's a new resolution OR if existing resolved outage has no SLA status
      const shouldComputeSLA = !['Resolved', 'Closed'].includes(originalReport.status) || 
                               !originalReport.slaStatus || 
                               originalReport.slaStatus === '';
      
      if (shouldComputeSLA) {
        // Set resolution time if not provided
        if (!updateData.resolutionTime && !originalReport.resolutionTime) {
          updateData.resolutionTime = new Date();
        }

        // Use resolution time from update or original
        const resolutionTimeToUse = updateData.resolutionTime || originalReport.resolutionTime;
        
        if (resolutionTimeToUse) {
          // Compute SLA status based on the logic
          const occurrenceTime = new Date(originalReport.occurrenceTime);
          const resTime = new Date(resolutionTimeToUse);
          const durationMs = resTime.getTime() - occurrenceTime.getTime();

          let slaStatus = 'unknown';

          // Priority 1: Mandatory Restoration Time
          const mrtToUse = updateData.mandatoryRestorationTime !== undefined ? updateData.mandatoryRestorationTime : originalReport.mandatoryRestorationTime;
          if (mrtToUse) {
            const mrt = new Date(mrtToUse).getTime();
            if (!isNaN(mrt)) {
              slaStatus = resTime.getTime() <= mrt ? 'within' : 'out';
            }
          }
          // Priority 2: Expected Resolution Hours
          else {
            const expectedHoursToUse = updateData.expectedResolutionHours !== undefined ? updateData.expectedResolutionHours : originalReport.expectedResolutionHours;
            if (expectedHoursToUse && expectedHoursToUse > 0) {
              const expectedMs = expectedHoursToUse * 60 * 60 * 1000;
              slaStatus = durationMs <= expectedMs ? 'within' : 'out';
            }
            // Priority 3: Expected Restoration Time
            else {
              const ertToUse = updateData.expectedRestorationTime !== undefined ? updateData.expectedRestorationTime : originalReport.expectedRestorationTime;
              if (ertToUse) {
                const ert = new Date(ertToUse).getTime();
                if (!isNaN(ert)) {
                  slaStatus = resTime.getTime() <= ert ? 'within' : 'out';
                }
              }
              // Priority 4: Default SLA by alarm type
              else {
                const defaultSLAs = {
                  CRITICAL: 1,
                  MAJOR: 2,
                  MINOR: 4,
                  WARNING: 8,
                  INFO: 24
                };
                const type = (originalReport.alarmType || 'INFO').toUpperCase();
                const defaultHours = defaultSLAs[type] || 24;
                const defaultMs = defaultHours * 60 * 60 * 1000;
                slaStatus = durationMs <= defaultMs ? 'within' : 'out';
              }
            }
          }

          updateData.slaStatus = slaStatus;
          console.log(`✅ Computed SLA for resolved report ${req.params.id}: ${slaStatus} (MRT: ${mrtToUse ? 'SET' : 'NOT SET'})`);
        }
      }
    }

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

    // If the outage report status changed to resolved, update the corresponding alarm and ticket status
    if (['Resolved', 'Closed'].includes(status) && !['Resolved', 'Closed'].includes(originalReport.status)) {
      console.log('🔄 Outage report resolved - checking for alarm/ticket updates');
      console.log('Original report:', {
        id: originalReport._id,
        alarmId: originalReport.alarmId,
        ticketId: originalReport.ticketId,
        status: originalReport.status,
        newStatus: status
      });

      try {
        // Update alarm status if alarmId exists
        if (originalReport.alarmId) {
          const alarmUpdate = await Alarm.findByIdAndUpdate(originalReport.alarmId, {
            status: 'resolved',
            resolvedAt: updateData.resolutionTime || new Date(),
            updatedAt: new Date()
          });
          console.log(`✅ Updated alarm ${originalReport.alarmId} status to resolved:`, !!alarmUpdate);
        } else {
          console.log('❌ No alarmId found in outage report');
        }

        // Update ticket status if ticketId exists
        if (originalReport.ticketId) {
          const ticketUpdate = await Ticket.findByIdAndUpdate(originalReport.ticketId, {
            status: 'resolved',
            resolvedAt: updateData.resolutionTime || new Date(),
            updatedAt: new Date()
          });
          console.log(`✅ Updated ticket ${originalReport.ticketId} status to resolved:`, !!ticketUpdate);
        } else {
          console.log('❌ No ticketId found in outage report');
        }
      } catch (updateError) {
        console.error('❌ Failed to update corresponding alarm/ticket status:', updateError);
        // Don't fail the outage report update if alarm/ticket update fails
      }
    }

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

// @route   GET /api/outage-reports/daily
// @desc    Get daily report data for frontend
// @access  Private
router.get('/daily', authenticate, async (req, res) => {
  try {
    const { reportDate } = req.query;
    const reportDateObj = reportDate ? new Date(reportDate) : new Date();

    // Import the daily report service
    const { dailyReportService } = await import('../services/dailyReportService.js');

    // Get daily report data
    const reportData = await dailyReportService.getDailyReportsFromAPI(reportDateObj);

    res.json({
      reportDate: reportData.reportDate,
      summary: reportData.summary,
      alarmsByRootCause: reportData.alarmsByRootCause,
      ticketsPerRegion: reportData.ticketsPerRegion,
      allReports: reportData.allReports,
      ongoingOutages: reportData.newOutages,
      resolvedOutages: reportData.resolvedToday
    });
  } catch (error) {
    console.error('Error fetching daily report data:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
