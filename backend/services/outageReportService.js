import express from 'express';
import OutageReport from '../models/OutageReport.js';
import Alarm from '../models/Alarm.js';
import Ticket from '../models/Ticket.js';
import Site from '../models/Site.js';
import HourlyReportEmail from '../models/HourlyReportEmail.js';
import { authenticate } from '../middleware/auth.js';

// Dynamic import for email service (to match server.js pattern)
let emailService;
(async () => {
  try {
    const emailModule = await import('./emailService.js');
    emailService = emailModule.emailService;
    console.log('✅ Email service imported successfully');
  } catch (error) {
    console.error('❌ Failed to import email service:', error.message);
  }
})();

class OutageReportService {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
  }

  /**
   * Start the outage report scheduler
   */
  startScheduler() {
    if (this.isRunning) {
      console.log('⏰ Outage report scheduler already running');
      return;
    }

    console.log('🚀 Starting outage report scheduler (hourly)');
    this.isRunning = true;

    // Calculate time until next hour
    const scheduleNextRun = () => {
      const now = new Date();
      const nextHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0, 0);
      const delay = nextHour.getTime() - now.getTime();
      
      console.log(`⏰ Next hourly report will run in ${Math.round(delay / 60000)} minutes`);
      
      setTimeout(async () => {
        await this.generateHourlyReport();
        // Set up hourly interval after first run
        this.intervalId = setInterval(() => {
          this.generateHourlyReport();
        }, 60 * 60 * 1000); // Every hour
      }, delay);
    };

    // Run immediately for testing, then schedule hourly
    this.generateHourlyReport().finally(scheduleNextRun);

    console.log('✅ Outage report scheduler started');
  }

  /**
   * Stop the hourly outage report scheduler
   */
  stopScheduler() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('🛑 Outage report scheduler stopped');
  }

  /**
   * Generate hourly email summary from ALL outage reports for the current day
   */
  async generateHourlyReport() {
    try {
      console.log('📊 Generating hourly email summary from ALL outage reports for current day...');

      // Get current date for daily reporting
      const now = new Date();
      const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const reportHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());

      console.log(`📅 Gathering outage reports for current day: ${currentDate.toDateString()} (showing all outages from this date)`);

      // Gather ALL outage reports that occurred on the current date (from midnight to now)
      const startOfDay = currentDate; // Midnight of current day
      const endOfDay = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000); // Midnight of next day

      // First, check what alarm types exist in the database for today
      const alarmTypes = await OutageReport.aggregate([
        {
          $match: {
            occurrenceTime: { $gte: startOfDay, $lt: endOfDay },
            alarmType: { $exists: true }
          }
        },
        {
          $group: {
            _id: '$alarmType',
            count: { $sum: 1 }
          }
        }
      ]);
      
      console.log('Alarm types in database:', JSON.stringify(alarmTypes, null, 2));

      // Now get the actual reports
      const allReportsToday = await OutageReport.find({
        occurrenceTime: { $gte: startOfDay, $lt: endOfDay }
      }, 'siteCode siteName region alarmType occurrenceTime resolutionTime status expectedRestorationTime mandatoryRestorationTime rootCause subrootCause supervisor username')
      .populate('alarmId')
      .sort({ occurrenceTime: -1 })
      .lean(); // Add .lean() for better performance and to get plain JS objects

      console.log(`🔍 Found ${allReportsToday.length} total outage reports for current day`);
      
      // Log alarm types for debugging
      console.log('Sample reports with alarm types:');
      allReportsToday.slice(0, 5).forEach((report, i) => {
        console.log(`Report ${i + 1}:`, {
          _id: report._id,
          siteCode: report.siteCode,
alarmType: report.alarmType,
          alarmType: report.alarmType,
          status: report.status,
          occurrenceTime: report.occurrenceTime
        });
      });

      if (allReportsToday.length === 0) {
        console.log('📭 No outage reports for current day, skipping email');
        return;
      }

      const ongoingOutages = allReportsToday.filter(r => r.status === 'Open' || r.status === 'In Progress');
      const resolvedOutages = allReportsToday.filter(r => r.status === 'Resolved' || r.status === 'Closed');

      console.log(`📊 Daily outage summary: ${ongoingOutages.length} ongoing, ${resolvedOutages.length} resolved`);

      // Calculate SLA metrics based on expectedResolutionTime from outage reports
      let withinSLA = 0;
      let outOfSLA = 0;
      let totalResolutionMinutes = 0;
      let resolvedCount = 0;

      for (const report of resolvedOutages) {
        const startTime = report.occurrenceTime;
        const endTime = report.resolutionTime;
        const expectedHours = report.expectedResolutionHours;
        
        if (startTime && endTime) {
          const durationMinutes = Math.round((endTime - startTime) / 60000);
          totalResolutionMinutes += durationMinutes;
          resolvedCount++;

          // If expectedResolutionHours is set, use it for SLA calculation
          if (expectedHours !== null && expectedHours !== undefined) {
            const isWithinSLA = expectedHours && durationMinutes <= expectedHours * 60;
            const slaStatus = expectedHours ? 
              (isWithinSLA ? '✅ Within SLA' : '❌ Out of SLA') : '⚠️ Not Set';
            const slaColor = expectedHours ? 
              (isWithinSLA ? '#10b981' : '#ef4444') : '#f59e0b';
            if (isWithinSLA) {
              withinSLA++;
            } else {
              outOfSLA++;
            }
          } else {
            // Fallback to default thresholds if expectedResolutionHours is not set
            const slaThresholds = {
              critical: parseInt(process.env.SLA_CRITICAL_MINUTES || '30'),
              major: parseInt(process.env.SLA_MAJOR_MINUTES || '60'),
              minor: parseInt(process.env.SLA_MINOR_MINUTES || '120')
            };
            const severity = (report.alarmType || '').toLowerCase();
            const slaThreshold = slaThresholds[severity] || slaThresholds.minor;

            if (durationMinutes <= slaThreshold) {
              withinSLA++;
            } else {
              outOfSLA++;
            }
          }
        }
      }

      const mttr = resolvedCount > 0 ? Math.round(totalResolutionMinutes / resolvedCount) : 0;

      // First, let's check what regions exist in the database
      console.log('🔍 Checking available regions in the database...');
      const allOutages = await OutageReport.find({
        occurrenceTime: { $gte: startOfDay, $lt: endOfDay }
      }, 'region');
      
      console.log('📊 Sample of regions found in the database:', 
        allOutages.slice(0, 5).map(o => o.region || 'null').join(', '));
      
      // Now run the aggregation with more permissive matching
      console.log('🔍 Running aggregation for tickets per region...');
      const ticketsPerRegion = await OutageReport.aggregate([
        {
          $match: {
            occurrenceTime: { $gte: startOfDay, $lt: endOfDay },
            $or: [
              { region: { $exists: true, $ne: null, $ne: '' } },  // Has a region
              { 'siteCode': { $exists: true } }  // Or has a site code (we'll derive region from site code if needed)
            ]
          }
        },
        {
          $addFields: {
            // Normalize region - use existing region or derive from site code if possible
            normalizedRegion: {
              $cond: [
                { $and: [
                  { $or: [{ $eq: ['$region', null] }, { $eq: ['$region', ''] }] },
                  { $regexMatch: { input: '$siteCode', regex: '^[A-Z]\.[A-Z]\.[A-Z]\..*' } }
                ]},
                { $substr: ['$siteCode', 0, 3] },  // Extract region code from site code if pattern matches
                { $ifNull: ['$region', 'Unknown'] }  // Otherwise use region or 'Unknown'
              ]
            }
          }
        },
        {
          $group: {
            _id: {
              $cond: [
                { $in: ['$normalizedRegion', [null, '']] },
                'Unknown',
                '$normalizedRegion'
              ]
            },
            totalTickets: { $sum: 1 },
            inProgressTickets: {
              $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] }
            },
            resolvedTickets: {
              $sum: { $cond: [{ $in: ['$status', ['Resolved', 'Closed']] }, 1, 0] }
            },
            withinSLATickets: {
              $sum: {
                $cond: [
                  { 
                    $and: [
                      { $in: ['$status', ['Resolved', 'Closed']] },
                      { $ne: ['$resolutionTime', null] },
                      { $lt: [
                          { $divide: [
                              { $subtract: ['$resolutionTime', '$occurrenceTime'] },
                              1000 * 60 * 60 // Convert ms to hours
                          ]},
                          2 // 2-hour SLA
                      ]}
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
                      { $ne: ['$resolutionTime', null] },
                      { $gte: [
                          { $divide: [
                              { $subtract: ['$resolutionTime', '$occurrenceTime'] },
                              1000 * 60 * 60 // Convert ms to hours
                          ]},
                          2 // 2-hour SLA
                      ]}
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
            },
            // Add sample sites for debugging
            sampleSites: { $addToSet: '$siteCode' }
          }
        },
        {
          $project: {
            _id: 1,
            totalTickets: 1,
            inProgressTickets: 1,
            resolvedTickets: 1,
            withinSLATickets: 1,
            outOfSLATickets: 1,
            criticalAlarms: 1,
            majorAlarms: 1,
            minorAlarms: 1,
            sampleSites: { $slice: ['$sampleSites', 3] }  // Show up to 3 sample sites per region
          }
        },
        {
          $sort: { totalTickets: -1 }
        }
      ]);
      
      console.log(`📊 Aggregation results (${ticketsPerRegion.length} regions):`);
      ticketsPerRegion.forEach(region => {
        console.log(`- ${region._id}: ${region.totalTickets} tickets ` +
          `(In Progress: ${region.inProgressTickets}, Resolved: ${region.resolvedTickets}) ` +
          `Samples: ${region.sampleSites?.join(', ') || 'none'}`);
      });

      // Send hourly report email - but only once per hour (database-tracked)
      const existingEmailRecord = await HourlyReportEmail.findOne({ reportHour: reportHour });
      
      if (existingEmailRecord) {
        console.log(`⏭️ Email already sent for hour ${reportHour.toISOString()} at ${existingEmailRecord.emailSentAt.toISOString()}, skipping duplicate`);
      } else {
        console.log(`📧 Sending hourly outage report email for hour: ${reportHour.toISOString()}`);
        
        const emailResult = await this.sendOutageReportEmail({
          ongoingOutages,
          resolvedOutages,
          metrics: {
            totalResolved: resolvedCount,
            withinSLA,
            outOfSLA,
            mttr
          },
          ticketsPerRegion: ticketsPerRegion.map(item => ({
            region: item._id,
            totalTickets: item.totalTickets,
            inProgressTickets: item.inProgressTickets,
            resolvedTickets: item.resolvedTickets,
            criticalAlarms: item.criticalAlarms,
            majorAlarms: item.majorAlarms,
            minorAlarms: item.minorAlarms
          })),
          reportHour: reportHour
        });

        // Mark all outage reports as emailed (to prevent duplicate emails)
        const reportIds = allReportsToday.map(r => r._id);
        await OutageReport.updateMany(
          { _id: { $in: reportIds } },
          { 
            $set: { 
              isEmailSent: true,
              emailSentAt: new Date()
            }
          }
        );
        console.log(`✅ Marked ${reportIds.length} outage reports as emailed`);

        // Record email in database to prevent duplicates
        await HourlyReportEmail.create({
          reportHour: reportHour,
          emailSentAt: new Date(),
          ongoingCount: ongoingOutages.length,
          resolvedCount: resolvedOutages.length,
          emailRecipients: emailResult?.recipients || [],
          emailMessageId: emailResult?.messageId || null
        });
        
        console.log(`✅ Email sent and recorded for hour ${reportHour.toISOString()}, will not send again`);
      }

    } catch (error) {
      console.error('❌ Error generating hourly outage report:', error);
    }
  }

  /**
   * Determine region based on site name and actual region data
   */
  determineRegion(siteName, actualRegion) {
    // Map actual region from Site model to OutageReport enum values
    if (actualRegion) {
      const region = actualRegion.toUpperCase().trim();

      // Map full names to abbreviations for consistency
      const regionMappings = {
        'CENTRAL EQUATORIA': 'C.E.S',
        'EASTERN EQUATORIA': 'E.E.S',
        'WESTERN EQUATORIA': 'W.E.S',
        'NORTHERN BAHR EL GHAZAL': 'N.B.G.S',
        'WESTERN BAHR EL GHAZAL': 'W.B.G.S',
        'WARRAP': 'WARRAP',
        'LAKES STATE' : 'LAKES',
        'UNITY': 'UNITY',
        'JONGLEI':'JONGLEI',
        'UPPER NILE': 'UPPERNILE'
      };

      // Return mapped abbreviation if it exists, otherwise return the region as-is if it's already an abbreviation
      return regionMappings[region] || region;
    }

    return 'C.E.S'; // Default to C.E.S if no region specified
  }

  /**
   * Send outage report email
   */
  async sendOutageReportEmail(data) {
    try {
      console.log('📧 Sending hourly outage report email...');

      // Wait for email service to be available (up to 5 seconds)
      let attempts = 0;
      while (!emailService && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (!emailService || !emailService.sendEmail) {
        console.error('❌ Email service not available after waiting');
        return;
      }

      const reportHour = data.reportHour;
      const emailData = {
        subject: `🚨 NOCALERT Hourly Outage Status Report - ${new Date().toLocaleDateString()} ${new Date().getHours()}:00`,
        html: this.generateEmailTemplate(data)
      };

      // Send to NOC team (configured in email service)
      const emailResult = await emailService.sendEmail(emailData);

      console.log(`✅ Daily outage status report email sent successfully (${data.ongoingOutages.length} ongoing, ${data.resolvedOutages.length} resolved)`);

      // Return email result for tracking
      return {
        recipients: emailResult?.recipients || [process.env.NOC_ALERTS_EMAIL],
        messageId: emailResult?.messageId || null
      };

    } catch (error) {
      console.error('❌ Failed to send outage report email:', error);
      return null;
    }
  }

  /**
   * Generate HTML email template for outage report
   */
  generateEmailTemplate(data) {
    const { ongoingOutages, resolvedOutages, metrics, ticketsPerRegion, reportHour } = data;
    
    // Calculate additional metrics
    const totalTickets = ongoingOutages.length + resolvedOutages.length;
    const inProgressTickets = ongoingOutages.filter(o => o.status === 'In Progress').length;
    const resolvedTickets = resolvedOutages.length;
    const resolutionRate = totalTickets > 0 ? Math.round((resolvedTickets / totalTickets) * 100) : 0;
    const slaCompliance = metrics.totalResolved > 0 ? Math.round((metrics.withinSLA / metrics.totalResolved) * 100) : 100;
    const mttrFormatted = `${Math.floor(metrics.mttr / 60)}h ${metrics.mttr % 60}m`;

    const formatDateTime = (date) => {
      if (!date) return 'N/A';
      const d = new Date(date);
      const day = d.getDate().toString().padStart(2, '0');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = monthNames[d.getMonth()];
      const year = d.getFullYear();
      const hours = d.getHours().toString().padStart(2, '0');
      const minutes = d.getMinutes().toString().padStart(2, '0');
      const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
      
      return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
    };

    const formatDuration = (start, end) => {
      if (!start || !end) return 'N/A';
      const diffMs = new Date(end) - new Date(start);
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      return `${hours}h ${minutes}m`;
    };

    const getSlaStatus = (report) => {
      if (!report.occurrenceTime || !report.resolutionTime) return { status: 'N/A', color: '#9ca3af' };
      
      const actualMinutes = Math.round((new Date(report.resolutionTime) - new Date(report.occurrenceTime)) / 60000);
      
      if (report.expectedResolutionHours !== undefined && report.expectedResolutionHours !== null) {
        const expectedMinutes = report.expectedResolutionHours * 60;
        const isWithinSLA = actualMinutes <= expectedMinutes;
        return {
          status: isWithinSLA ? 'Within SLA' : 'Out of SLA',
          color: isWithinSLA ? '#10b981' : '#ef4444'
        };
      }
      
      // Fallback to default thresholds if expectedResolutionHours not set
      const slaThresholds = {
        critical: 30,    // 30 minutes for critical
        major: 60,       // 60 minutes for major
        minor: 120       // 120 minutes for minor
      };
      
      const severity = (report.salarmType || '').toLowerCase();
      const threshold = slaThresholds[severity] || slaThresholds.minor;
      const isWithinSLA = actualMinutes <= threshold;
      
      return {
        status: isWithinSLA ? 'Within SLA' : 'Out of SLA',
        color: isWithinSLA ? '#10b981' : '#ef4444'
      };
    };

    // Generate summary cards HTML
    const summaryCards = `
      <div style="display: flex; flex-wrap: nowrap; overflow-x: auto; gap: 20px; margin: 16px 0 24px 0; padding: 8px 0 16px 0; -ms-overflow-style: none; scrollbar-width: none;">
        <div style="flex: 0 0 auto; width: 150px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); border-radius: 10px; padding: 14px 16px; color: white; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
          <div style="font-size: 12px; opacity: 0.9; margin-bottom: 6px;">Total Tickets</div>
          <div style="font-size: 22px; font-weight: 700; line-height: 1.2;">${totalTickets}</div>
        </div>
        <div style="flex: 0 0 auto; width: 150px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 10px; padding: 14px 16px; color: white; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
          <div style="font-size: 12px; opacity: 0.9; margin-bottom: 6px;">In Progress</div>
          <div style="font-size: 22px; font-weight: 700; line-height: 1.2;">${inProgressTickets}</div>
        </div>
        <div style="flex: 0 0 auto; width: 150px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 10px; padding: 14px 16px; color: white; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
          <div style="font-size: 12px; opacity: 0.9; margin-bottom: 6px;">Resolved</div>
          <div style="font-size: 22px; font-weight: 700; line-height: 1.2;">${resolvedTickets}</div>
        </div>
        <div style="flex: 0 0 auto; width: 150px; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); border-radius: 10px; padding: 14px 16px; color: white; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
          <div style="font-size: 12px; opacity: 0.9; margin-bottom: 6px;">Within SLA</div>
          <div style="font-size: 22px; font-weight: 700; line-height: 1.2;">${metrics.withinSLA || 0}</div>
        </div>
        <div style="flex: 0 0 auto; width: 150px; background: linear-gradient(135deg, #ec4899 0%, #db2777 100%); border-radius: 10px; padding: 14px 16px; color: white; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
          <div style="font-size: 12px; opacity: 0.9; margin-bottom: 6px;">Out of SLA</div>
          <div style="font-size: 22px; font-weight: 700; line-height: 1.2;">${metrics.outOfSLA || 0}</div>
        </div>
        <div style="flex: 0 0 auto; width: 150px; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); border-radius: 10px; padding: 14px 16px; color: white; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
          <div style="font-size: 12px; opacity: 0.9; margin-bottom: 6px;">SLA Compliance</div>
          <div style="font-size: 22px; font-weight: 700; line-height: 1.2;">${slaCompliance}%</div>
        </div>
      </div>
      <style>
        /* Hide scrollbar for Chrome, Safari and Opera */
        .summary-cards-container::-webkit-scrollbar {
          display: none;
        }
        /* Hide scrollbar for IE, Edge and Firefox */
        .summary-cards-container {
          -ms-overflow-style: none;  /* IE and Edge */
          scrollbar-width: none;  /* Firefox */
        }
      </style>
    `;

    // Debug: Log the first few reports to check alarm type
    console.log('Sample reports with alarm types:');
    ongoingOutages.slice(0, 3).forEach((report, i) => {
      console.log(`Report ${i + 1}:`, {
        _id: report._id,
        siteCode: report.siteCode,
        salarmType: report.salarmType,
        alarmType: report.alarmType,
        alarmId: report.alarmId
      });
    });

    // Generate ongoing outages table
    const ongoingRows = ongoingOutages.map(report => {
      const duration = formatDuration(report.occurrenceTime, new Date());
      
      return `
        <tr style="border-bottom: 1px solid #e5e7eb;" key="ongoing-${report._id}">
          <td style="padding: 12px 16px; color: #1f2937; font-size: 13px;">${report.siteCode || 'N/A'}</td>
          <td style="padding: 12px 16px; color: #1f2937; font-size: 13px;">${report.siteName || report.siteNo || report.alarmId?.siteName || 'N/A'}</td>
          <td style="padding: 12px 16px; color: #1f2937; font-size: 13px;">${report.region || 'N/A'}</td>
          <td style="padding: 12px 16px; color: #1f2937; font-weight: 600; color: ${report.alarmType === 'CRITICAL' ? '#dc2626' : report.alarmType === 'MAJOR' ? '#d97706' : '#b45309'}; font-size: 13px;">
            ${report.alarmType || 'N/A'}
          </td>
          <td style="padding: 12px 16px; color: #6b7280; font-size: 13px;">${formatDateTime(report.occurrenceTime)}</td>
          <td style="padding: 12px 16px; color: #6b7280; font-size: 13px;">${duration}</td>
          <td style="padding: 12px 16px; color: #6b7280; font-size: 13px;">${report.expectedRestorationTime ? formatDateTime(report.expectedRestorationTime) : 'N/A'}</td>
          <td style="padding: 12px 16px; color: #6b7280; font-size: 13px;">${report.mandatoryRestorationTime ? formatDateTime(report.mandatoryRestorationTime) : 'N/A'}</td>
          <td style="padding: 12px 16px; font-size: 13px;">
            <span style="display: inline-flex; align-items: center; padding: 4px 12px; border-radius: 9999px; background-color: ${report.status === 'In Progress' ? '#fef3c7' : '#e0f2fe'}; color: ${report.status === 'In Progress' ? '#92400e' : '#075985'}; font-size: 12px; font-weight: 600;">
              ${report.status || 'Open'}
            </span>
          </td>
          <td style="padding: 12px 16px; color: #1f2937; font-size: 13px;">${report.rootCause || 'N/A'}</td>
          <td style="padding: 12px 16px; color: #1f2937; font-size: 13px;">${report.subrootCause || 'N/A'}</td>
          <td style="padding: 12px 16px; color: #1f2937; font-size: 13px;">${report.supervisor || 'N/A'}</td>
          <td style="padding: 12px 16px; color: #1f2937; font-size: 13px;">${report.username || 'N/A'}</td>
      `;
    }).join('');

    // Generate resolved outages table
    const resolvedRows = resolvedOutages.map(report => {
      const slaStatus = getSlaStatus(report);
      const duration = formatDuration(report.occurrenceTime, report.resolutionTime);
      
      return `
        <tr style="border-bottom: 1px solid #e5e7eb;" key="resolved-${report._id}">
          <td style="padding: 12px 16px; color: #1f2937; font-size: 13px;">${report.siteCode || 'N/A'}</td>
          <td style="padding: 12px 16px; color: #1f2937; font-size: 13px;">${report.siteName || report.siteNo || report.alarmId?.siteName || 'N/A'}</td>
          <td style="padding: 12px 16px; color: #1f2937; font-size: 13px;">${report.region || 'N/A'}</td>
          <td style="padding: 12px 16px; color: #1f2937; font-weight: 600; color: ${report.alarmType === 'CRITICAL' ? '#dc2626' : report.alarmType === 'MAJOR' ? '#d97706' : '#b45309'}; font-size: 13px;">
            ${report.alarmType || 'N/A'}
          </td>
          <td style="padding: 12px 16px; color: #6b7280; font-size: 13px;">${formatDateTime(report.occurrenceTime)}</td>
          <td style="padding: 12px 16px; color: #6b7280; font-size: 13px;">${duration}</td>
          <td style="padding: 12px 16px; color: #6b7280; font-size: 13px;">${report.resolutionTime ? formatDateTime(report.resolutionTime) : 'N/A'}</td>
          <td style="padding: 12px 16px; font-size: 13px;">
            <span style="display: inline-flex; align-items: center; padding: 4px 12px; border-radius: 9999px; background-color: #dcfce7; color: #166534; font-size: 12px; font-weight: 600;">
              Resolved
            </span>
          </td>
          <td style="padding: 12px 16px; color: ${slaStatus.color}; font-weight: 500; font-size: 13px;">
            ${slaStatus.status}
          </td>
          <td style="padding: 12px 16px; color: #1f2937; font-size: 13px;">${report.rootCause || 'N/A'}</td>
          <td style="padding: 12px 16px; color: #1f2937; font-size: 13px;">${report.subrootCause || 'N/A'}</td>
          <td style="padding: 12px 16px; color: #1f2937; font-size: 13px;">${report.supervisor || 'N/A'}</td>
          <td style="padding: 12px 16px; color: #1f2937; font-size: 13px;">${report.username || 'N/A'}</td>
        </tr>
      `;
    }).join('');

    
        // Generate region breakdown HTML
    const regionBreakdown = ticketsPerRegion.length > 0 ? `
      <div style="margin: 32px 0; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
        <div style="background-color: #1e40af; color: white; padding: 12px 16px; font-weight: 600; font-size: 16px;">
          📊 Tickets Per Region (${ticketsPerRegion.length} regions)
        </div>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #f3f4f6; text-align: left;">
                <th style="padding: 12px 16px; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb;">Region</th>
                <th style="padding: 12px 16px; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; text-align: right;">Total</th>
                <th style="padding: 12px 16px; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; text-align: right;">In Progress</th>
                <th style="padding: 12px 16px; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; text-align: right;">Resolved</th>
                <th style="padding: 12px 16px; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; text-align: right;">Within SLA</th>
                <th style="padding: 12px 16px; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; text-align: right;">Out of SLA</th>
                <th style="padding: 12px 16px; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; text-align: right;">Critical</th>
                <th style="padding: 12px 16px; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; text-align: right;">Major</th>
                <th style="padding: 12px 16px; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; text-align: right;">Minor</th>
              </tr>
            </thead>
            <tbody>
              ${ticketsPerRegion.map(region => {
            const regionSlaPercentage = region.resolvedTickets > 0 
              ? Math.round((region.withinSLA / region.resolvedTickets) * 100) 
              : 0;
                
                return `
                  <tr style="border-bottom: 1px solid #e5e7eb;" key="${region.region}">
                    <td style="padding: 12px 16px; font-weight: 500; color: #1f2937;">${region.region || 'Unknown'}</td>
                    <td style="padding: 12px 16px; text-align: right; font-weight: 600; color: #1f2937;">${region.totalTickets || 0}</td>
                    <td style="padding: 12px 16px; text-align: right; color: #d97706;">${inProgress}</td>
                    <td style="padding: 12px 16px; text-align: right; color: #059669;">${totalResolved}</td>
                    <td style="text-align: center; color: #16a34a;">${region.withinSLA || 0}</td>
                    <td style="text-align: center; color: #dc2626;">${region.outOfSLA || 0}</td>
                    <td style="padding: 12px 16px; text-align: right; color: #dc2626; font-weight: 600;">${criticalAlarms}</td>
                    <td style="padding: 12px 16px; text-align: right; color: #d97706; font-weight: 600;">${majorAlarms}</td>
                    <td style="padding: 12px 16px; text-align: right; color: #b45309;">${minorAlarms}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : '';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <meta name="x-apple-disable-message-reformatting">
          <style>
            /* Reset styles for email clients */
            body, html {
              margin: 0 !important;
              padding: 0 !important;
              -webkit-text-size-adjust: 100% !important;
              -ms-text-size-adjust: 100% !important;
              -webkit-font-smoothing: antialiased !important;
            }
            body {
              -webkit-user-select: none;
              -moz-user-select: none;
              -ms-user-select: none;
              user-select: none;
              font-family: Arial, Helvetica, sans-serif;
              line-height: 1.6;
              color: #333333;
              margin: 0;
              padding: 0;
              background-color: #f9fafb;
              -webkit-font-smoothing: antialiased;
              font-size: 15px;
            }
            /* Force Outlook to provide a "view in browser" message */
            .ExternalClass {
              width: 100%;
            }
            .ExternalClass,
            .ExternalClass p,
            .ExternalClass span,
            .ExternalClass font,
            .ExternalClass td,
            .ExternalClass div {
              line-height: 100%;
            }
            /* Reset spacing for Outlook.com */
            table, td {
              mso-table-lspace: 0pt;
              mso-table-rspace: 0pt;
            }
            /* Reset spacing for Yahoo Mail */
            .yshortcuts a {
              border-bottom: none !important;
            }
            /* Responsive styles */
            @media screen and (max-width: 600px) {
              .email-container {
                width: 100% !important;
                min-width: 320px !important;
              }
              .header {
                padding: 15px !important;
                text-align: left !important;
              }
              .header h1 {
                font-size: 20px !important;
                margin-bottom: 5px !important;
                text-align: left !important;
                display: block !important;
              }
              .header p {
                text-align: left !important;
              }
              .card {
                margin-bottom: 15px !important;
              }
              table {
                width: 100% !important;
              }
              .card-body {
                padding: 0 10px !important;
              }
            }
            .header h1 {
              font-size: 24px;
              font-weight: 700;
              margin: 0 0 8px 0;
              padding: 0;
              text-align: left;
              color: #111827;
              line-height: 1.3;
            }
            .header p {
              opacity: 0.9;
              font-size: 14px;
              margin: 0;
              color: #4b5563;
            }
            .card {
              background: white;
              border-radius: 8px;
              box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
              margin-bottom: 24px;
              overflow: hidden;
            }
            .card-header {
              padding: 16px 24px;
              border-bottom: 1px solid #e5e7eb;
              display: flex;
              justify-content: space-between;
              align-items: center;
              background-color: #f9fafb;
            }
            .card-header h2 {
              font-size: 16px;
              font-weight: 600;
              color: #111827;
              margin: 0;
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .card-body {
              padding: 0;
              overflow-x: auto;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 14px;
              margin: 0;
            }
            th {
              text-align: left;
              padding: 12px 16px;
              font-weight: 600;
              color: #4b5563;
              background-color: #f9fafb;
              border-bottom: 1px solid #e5e7eb;
              white-space: nowrap;
            }
            td {
              padding: 12px 16px;
              border-bottom: 1px solid #e5e7eb;
              vertical-align: middle;
            }
            tr:last-child td {
              border-bottom: none;
            }
            .status-badge {
              display: inline-flex;
              align-items: center;
              padding: 4px 12px;
              border-radius: 9999px;
              font-size: 12px;
              font-weight: 600;
              text-transform: capitalize;
            }
            .status-open { background-color: #e0f2fe; color: #075985; }
            .status-in-progress { background-color: #fef3c7; color: #92400e; }
            .status-resolved { background-color: #dcfce7; color: #166534; }
            .status-closed { background-color: #e5e7eb; color: #374151; }
            .sla-within { color: #059669; font-weight: 600; }
            .sla-out { color: #dc2626; font-weight: 600; }
            .empty-state {
              padding: 40px 20px;
              text-align: center;
              color: #6b7280;
              font-size: 14px;
            }
            .footer {
              margin-top: 40px;
              padding: 20px 0;
              text-align: center;
              color: #6b7280;
              font-size: 12px;
              border-top: 1px solid #e5e7eb;
            }
            .severity-critical { color: #dc2626; font-weight: 600; }
            .severity-major { color: #d97706; font-weight: 600; }
            .severity-minor { color: #b45309; font-weight: 600; }
            .severity-warning { color: #92400e; font-weight: 600; }
          </style>
        </head>
        <body>
          <div class="email-container" style="max-width: 800px; margin: 0 auto; padding: 24px; background-color: #ffffff;" contenteditable="false">
            <div class="header">
              <h1 style="margin: 0 0 8px 0; padding: 0; color: #1a365d; font-size: 24px; font-weight: 600;">📊 Hourly Outage Report</h1>
              <p style="margin: 0; color: #4a5568; font-size: 14px;">Generated on ${formatDateTime(new Date())} • ${ongoingOutages.length} Active Outages • ${resolvedOutages.length} Resolved Today</p>
            </div>

            <!-- Summary Cards -->
            ${summaryCards}

        
            <!-- Ongoing Outages -->
            <div class="card">
              <div class="card-header">
                <h2>🔴 Ongoing Outages (${ongoingOutages.length})</h2>
              </div>
              <div class="card-body">
                ${ongoingOutages.length > 0 ? `
                  <table>
                    <thead>
                      <tr>
                        <th>Site Code</th>
                        <th>Site Name</th>
                        <th>Region</th>
                        <th>Alarm Type</th>
                        <th>Occurrence Time</th>
                        <th>Duration</th>
                        <th>Expected Restoration</th>
                        <th>Mandatory Restoration</th>
                        <th>Status</th>
                        <th>Root Cause</th>
                        <th>Subroot Cause</th>
                        <th>Supervisor</th>
                        <th>Username</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${ongoingRows}
                    </tbody>
                  </table>
                ` : `
                  <div class="empty-state">
                    <p>No ongoing outages at this time. All systems operational.</p>
                  </div>
                `}
              </div>
            </div>

            <!-- Resolved Outages -->
            <div class="card">
              <div class="card-header">
                <h2>✅ Resolved Outages (${resolvedOutages.length})</h2>
              </div>
              <div class="card-body">
                ${resolvedOutages.length > 0 ? `
                  <table>
                    <thead>
                      <tr>
                        <th>Site Code</th>
                        <th>Site Name</th>
                        <th>Region</th>
                        <th>Alarm Type</th>
                        <th>Occurrence Time</th>
                        <th>Duration</th>
                        <th>Resolution Time</th>
                        <th>Status</th>
                        <th>SLA Status</th>
                        <th>Root Cause</th>
                        <th>Subroot Cause</th>
                        <th>Supervisor</th>
                        <th>Username</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${resolvedRows}
                    </tbody>
                  </table>
                ` : `
                  <div class="empty-state">
                    <p>No outages have been resolved yet today.</p>
                  </div>
                `}
              </div>
            </div>

             <!-- Region Breakdown -->
            ${ticketsPerRegion && ticketsPerRegion.length > 0 ? regionBreakdown : ''}


            <div class="footer">
              <p>This is an automated report generated by NOC Alert System. Please do not reply to this email.</p>
              <p>For any questions or issues, please contact the NOC team.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Get outage reports for a specific hour
   */
  async getOutageReportsForHour(hourDate) {
    try {
      const startOfHour = new Date(hourDate.getFullYear(), hourDate.getMonth(), hourDate.getDate(), hourDate.getHours());
      const endOfHour = new Date(startOfHour.getTime() + 60 * 60 * 1000);

      return await OutageReport.find({
        reportHour: {
          $gte: startOfHour,
          $lt: endOfHour
        }
      }).sort({ occurrenceTime: -1 });
    } catch (error) {
      console.error('Error fetching outage reports for hour:', error);
      throw error;
    }
  }

  /**
   * Calculate SLA status based on expected and actual resolution times
   */
  calculateSlaStatus(occurrenceTime, resolutionTime, expectedResolutionHours) {
    if (!resolutionTime || !expectedResolutionHours) {
      console.log('⚠️  Missing data for SLA calculation:', {
        hasResolutionTime: !!resolutionTime,
        hasExpectedHours: !!expectedResolutionHours,
        resolutionTime,
        expectedResolutionHours
      });
      return null;
    }
    
    const expectedResolutionMs = expectedResolutionHours * 60 * 60 * 1000;
    const actualResolutionMs = new Date(resolutionTime) - new Date(occurrenceTime);
    
    console.log('📊 SLA Calculation:', {
      occurrenceTime: new Date(occurrenceTime).toISOString(),
      resolutionTime: new Date(resolutionTime).toISOString(),
      expectedResolutionHours,
      expectedResolutionMs,
      actualResolutionMs: actualResolutionMs / (60 * 60 * 1000) + ' hours',
      isWithinSLA: actualResolutionMs <= expectedResolutionMs ? 'within' : 'out'
    });
    
    return actualResolutionMs <= expectedResolutionMs ? 'within' : 'out';
  }

  /**
   * Update outage report
   */
  async updateOutageReport(id, updateData, userId) {
    try {
      // Get the outage report before update
      const existingReport = await OutageReport.findById(id);
      if (!existingReport) {
        throw new Error('Outage report not found');
      }

      // Check if this is a status update to Resolved or Closed
      const isNewlyResolved = ['Resolved', 'Closed'].includes(updateData.status) && 
                             !['Resolved', 'Closed'].includes(existingReport.status);
      
      if (isNewlyResolved) {
        console.log('🔍 Processing resolution for report:', {
          reportId: id,
          currentStatus: existingReport.status,
          newStatus: updateData.status,
          updateData: JSON.stringify(updateData, null, 2)
        });

        // Ensure resolution time is set (default to now if not provided)
        if (!updateData.resolutionTime) {
          updateData.resolutionTime = new Date();
          console.log(`⏰ Set default resolution time: ${updateData.resolutionTime}`);
        }

        // Ensure expected resolution hours are set based on alarm type if not provided
        if (!updateData.expectedResolutionHours && !existingReport.expectedResolutionHours) {
          const slaThresholds = {
            critical: 4,   // 4 hours for critical
            major: 8,      // 8 hours for major
            minor: 24      // 24 hours for minor
          };
          
          const alarmType = (existingReport.alarmType || '').toLowerCase();
          updateData.expectedResolutionHours = slaThresholds[alarmType] || 24;
          console.log(`⏱️  Set default expected resolution hours: ${updateData.expectedResolutionHours} (based on alarm type: ${alarmType})`);
        }

        // Calculate SLA status
        try {
          const resolutionTime = updateData.resolutionTime || existingReport.resolutionTime;
          const expectedHours = updateData.expectedResolutionHours || existingReport.expectedResolutionHours;
          
          if (existingReport.occurrenceTime && resolutionTime && expectedHours) {
            updateData.slaStatus = this.calculateSlaStatus(
              existingReport.occurrenceTime,
              resolutionTime,
              expectedHours
            );
            console.log(`📊 SLA Status calculated: ${updateData.slaStatus} for report ${id}`);
          } else {
            console.warn('⚠️  Missing data for SLA calculation:', {
              hasOccurrenceTime: !!existingReport.occurrenceTime,
              hasResolutionTime: !!resolutionTime,
              hasExpectedHours: !!expectedHours
            });
          }
        } catch (slaError) {
          console.error('❌ Error calculating SLA status:', slaError);
        }
      }

      const update = {
        ...updateData,
        updatedBy: userId,
        updatedAt: new Date()
      };

      const updatedReport = await OutageReport.findByIdAndUpdate(id, update, {
        new: true,
        runValidators: true
      });

      // If status is changed to "Closed", close associated ticket
      if (updateData.status === 'Closed' && existingReport.status !== 'Closed') {
        console.log(`🔒 Outage ${id} closed - closing associated ticket...`);
        
        try {
          // Close the ticket associated with this outage's alarm
          if (existingReport.alarmId) {
            const Ticket = (await import('../models/Ticket.js')).default;
            
            const ticket = await Ticket.findOne({ alarmId: existingReport.alarmId });
            if (ticket && ticket.status !== 'Closed') {
              ticket.status = 'Closed';
              ticket.closedBy = userId;
              ticket.closedAt = new Date();
              ticket.updatedBy = userId;
              ticket.updatedAt = new Date();
              await ticket.save();
              
              console.log(`✅ Ticket ${ticket._id} automatically closed with outage ${id}`);
            }
          }
        } catch (ticketError) {
          console.error('⚠️  Error closing associated ticket:', ticketError.message);
          // Don't fail the outage update if ticket closure fails
        }
      }

      return updatedReport;
    } catch (error) {
      console.error('Error updating outage report:', error);
      throw error;
    }
  }
}

export const outageReportService = new OutageReportService();
