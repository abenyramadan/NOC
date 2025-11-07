import OutageReport from '../models/OutageReport.js';
import { emailService } from './emailService.js';
import cron from 'node-cron';

class DailyReportService {
  constructor() {
    this.isRunning = false;
    this.cronJob = null;
  }

  /**
   * Start the daily report scheduler
   */
  startScheduler() {
    if (this.isRunning) {
      console.log('Daily report scheduler is already running');
      return;
    }

    // Schedule to run at 00:00 every day
    this.cronJob = cron.schedule('0 0 * * *', async () => {
      console.log('📅 Running scheduled daily report generation...');
      await this.generateDailyReport();
    }, {
      scheduled: false // Don't start immediately
    });

    // Start the scheduler
    this.cronJob.start();
    this.isRunning = true;
    
    const nextRun = this.cronJob.nextDate().format('YYYY-MM-DD HH:mm:ss');
    console.log(`✅ Daily report scheduler started. Next run at: ${nextRun}`);
  }

  /**
   * Stop the daily report scheduler
   */
  stopScheduler() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.isRunning = false;
      console.log('🛑 Daily report scheduler stopped');
    }
  }

  /**
   * Generate daily email report using the same data as the daily reports page
   */
  async generateDailyReport() {
    try {
      const reportDate = new Date();
      const reportData = await this.getDailyReportsFromAPI(reportDate);
      const { html, text } = await this.generateDailyReportEmail(reportData, reportDate);
      
      // Send email to configured recipients
      const recipients = process.env.DAILY_REPORT_EMAILS || '';
      if (recipients) {
        await emailService.sendEmail({
          to: recipients.split(',').map(email => email.trim()),
          subject: `Daily Network Performance Report - ${reportDate.toLocaleDateString()}`,
          html,
          text
        });
        console.log('📧 Daily report email sent successfully');
      } else {
        console.log('⚠️ No email recipients configured for daily reports');
      }

      return { success: true };
    } catch (error) {
      console.error('❌ Error generating daily report:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get daily reports data directly from database (replicates /api/outage-reports/daily endpoint logic)
   */
  async getDailyReportsFromAPI(reportDate) {
    // Set to start of day (00:00:00)
    const startOfDay = new Date(reportDate);
    startOfDay.setHours(0, 0, 0, 0);

    // Set to end of day (23:59:59.999)
    const endOfDay = new Date(reportDate);
    endOfDay.setHours(23, 59, 59, 999);

    try {
      // Get all reports for this day
      const dailyReports = await OutageReport.find({
        occurrenceTime: { $gte: startOfDay, $lte: endOfDay }
      }).sort({ occurrenceTime: -1 });

      // Process reports by region
      const regionMap = new Map();
      
      dailyReports.forEach(report => {
        const region = report.region || 'Unknown';
        if (!regionMap.has(region)) {
          regionMap.set(region, {
            region,
            totalTickets: 0,
            openTickets: 0,
            inProgressTickets: 0,
            resolvedTickets: 0,
            withinSLA: 0,
            outOfSLA: 0,
            criticalAlarms: 0,
            majorAlarms: 0,
            minorAlarms: 0
          });
        }

        const regionData = regionMap.get(region);
        regionData.totalTickets++;

        // Update status counts
        if (report.status === 'Open') regionData.openTickets++;
        if (report.status === 'In Progress') regionData.inProgressTickets++;
        if (report.status === 'Resolved' || report.status === 'Closed') regionData.resolvedTickets++;

        // Update alarm type counts
        if (report.alarmType === 'CRITICAL') regionData.criticalAlarms++;
        if (report.alarmType === 'MAJOR') regionData.majorAlarms++;
        if (report.alarmType === 'MINOR') regionData.minorAlarms++;

        // Update SLA status
        if (report.status === 'Resolved' && report.resolutionTime) {
          const resolutionTime = new Date(report.resolutionTime).getTime();
          const occurrenceTime = new Date(report.occurrenceTime).getTime();
          const durationHours = (resolutionTime - occurrenceTime) / (1000 * 60 * 60);
          
          if (durationHours <= 2) {
            regionData.withinSLA++;
          } else {
            regionData.outOfSLA++;
          }
        }
      });

      // Convert map to array
      const ticketsPerRegion = Array.from(regionMap.values());

      // Group by root cause
      const rootCauseMap = new Map();
      dailyReports.forEach(report => {
        const rootCause = report.rootCause || 'Not specified';
        if (!rootCauseMap.has(rootCause)) {
          rootCauseMap.set(rootCause, {
            rootCause,
            count: 0,
            alarms: []
          });
        }
        rootCauseMap.get(rootCause).count++;
        rootCauseMap.get(rootCause).alarms.push(report);
      });

      // Convert map to array and sort by count (descending)
      const alarmsByRootCause = Array.from(rootCauseMap.values())
        .sort((a, b) => b.count - a.count);

      // Calculate summary metrics
      const totalReports = dailyReports.length;
      const totalOpen = ticketsPerRegion.reduce((sum, item) => sum + (item.openTickets || 0), 0);
      const totalInProgress = ticketsPerRegion.reduce((sum, item) => sum + (item.inProgressTickets || 0), 0);
      const totalResolved = ticketsPerRegion.reduce((sum, item) => sum + (item.resolvedTickets || 0), 0);
      const totalWithinSLA = ticketsPerRegion.reduce((sum, item) => sum + (item.withinSLA || 0), 0);
      const totalOutOfSLA = ticketsPerRegion.reduce((sum, item) => sum + (item.outOfSLA || 0), 0);

      // Calculate MTTR for resolved tickets
      const resolvedReports = dailyReports.filter(r => 
        (r.status === 'Resolved' || r.status === 'Closed') &&
        r.resolutionTime &&
        r.occurrenceTime
      );

      let mttr = 0;
      if (resolvedReports.length > 0) {
        const totalResolutionTime = resolvedReports.reduce((sum, report) => {
          const resolutionTime = new Date(report.resolutionTime).getTime();
          const occurrenceTime = new Date(report.occurrenceTime).getTime();
          return sum + (resolutionTime - occurrenceTime);
        }, 0);
        mttr = Math.round((totalResolutionTime / resolvedReports.length) / (1000 * 60)); // in minutes
      }

      // Calculate SLA percentage
      const slaPercentage = totalResolved > 0 
        ? Math.round((totalWithinSLA / totalResolved) * 100) 
        : 0;

      return {
        reportDate: startOfDay,
        summary: {
          totalReports,
          totalOpen,
          totalInProgress,
          totalResolved,
          totalWithinSLA,
          totalOutOfSLA,
          mttr,
          slaPercentage
        },
        alarmsByRootCause,
        ticketsPerRegion,
        allReports: dailyReports
      };
    } catch (error) {
      console.error('Error generating daily report data:', error);
      throw error;
    }
  }

  /**
   * Generate HTML and text content for daily report email
   */
  async generateDailyReportEmail(dailyReportsData, reportDate) {
    const { ticketsPerRegion = [], alarmsByRootCause = [], allReports = [], summary = {} } = dailyReportsData;
    
    // Format the date
    const dateStr = new Date(reportDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Calculate SLA percentage
    const slaPercentage = summary.totalResolved > 0 
      ? Math.round((summary.totalWithinSLA / summary.totalResolved) * 100) || 0 
      : 0;

    // Create HTML email
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Daily Network Performance Report - ${dateStr}</title>
      <style>
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; line-height: 1.5; margin: 0; padding: 0; }
        .container { max-width: 800px; margin: 0 auto; padding: 24px; }
        .header { margin-bottom: 24px; border-bottom: 1px solid #e5e7eb; padding-bottom: 16px; }
        .header h1 { margin: 0; color: #111827; font-size: 24px; font-weight: 600; }
        .header p { margin: 8px 0 0; color: #6b7280; }
        
        /* Summary Cards - Horizontal Scrollable */
        .summary-grid { 
          display: flex;
          gap: 16px;
          margin: 24px 0;
          padding-bottom: 10px;
          overflow-x: auto;
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 #f1f5f9;
        }
        
        /* Custom scrollbar for WebKit browsers */
        .summary-grid::-webkit-scrollbar {
          height: 8px;
        }
        
        .summary-grid::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 4px;
        }
        
        .summary-grid::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 4px;
        }
        
        .summary-card { 
          flex: 0 0 auto;
          width: 180px;
          background: white; 
          border-radius: 8px; 
          padding: 16px; 
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          text-align: center;
          border: 1px solid #e5e7eb;
        }
        .summary-card h3 { 
          margin: 0 0 8px; 
          font-size: 14px; 
          color: #6b7280; 
          font-weight: 500;
        }
        .summary-card .value { 
          font-size: 24px; 
          font-weight: 600; 
          margin: 0;
        }
        
        /* Tables */
        .table-container { margin: 24px 0; }
        table { 
          width: 100%; 
          border-collapse: collapse; 
          font-size: 14px;
          margin-bottom: 24px;
          border-radius: 8px;
          overflow: hidden;
        }
        th { 
          background-color: #0066ff; /* Bright blue */
          padding: 12px; 
          text-align: left; 
          font-weight: 600; 
          color: white; 
          border-bottom: none;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        td { 
          padding: 12px; 
          border-bottom: 1px solid #e5e7eb; 
          vertical-align: middle;
        }
        tr:last-child td { border-bottom: none; }
        
        /* Status badges */
        .badge {
          display: inline-flex;
          align-items: center;
          border-radius: 9999px;
          padding: 4px 12px;
          font-size: 12px;
          font-weight: 500;
        }
        .badge-in-progress { background-color: #fef9c3; color: #92400e; }
        .badge-resolved { background-color: #dcfce7; color: #166534; }
        .badge-open { background-color: #dbeafe; color: #1e40af; }
        
        /* Charts container */
        .charts-grid { 
          display: grid; 
          grid-template-columns: 1fr 1fr; 
          gap: 24px; 
          margin: 24px 0;
        }
        .chart-container { 
          background: white; 
          border-radius: 8px; 
          padding: 16px; 
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .chart-container h3 { 
          margin: 0 0 16px; 
          font-size: 16px; 
          font-weight: 600;
          color: #111827;
        }
        
        /* Responsive */
        @media (max-width: 768px) {
          .summary-card {
            width: 160px;
            padding: 14px;
          }
          .charts-grid { 
            grid-template-columns: 1fr; 
          }
        }
        
        @media (max-width: 480px) {
          .summary-card {
            width: 140px;
            padding: 12px;
          }
          
          .summary-card h3 {
            font-size: 13px;
            margin-bottom: 6px;
          }
          
          .summary-card .value {
            font-size: 20px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Daily Network Performance Report</h1>
          <p>${dateStr} • 00:00 - 23:59</p>
        </div>
        
        <!-- Summary Cards -->
        <div class="summary-grid">
          <div class="summary-card">
            <h3>Total Tickets</h3>
            <p class="value" style="color: #1d4ed8;">${summary.totalReports}</p>
          </div>
          <div class="summary-card">
            <h3>Resolved</h3>
            <p class="value" style="color: #16a34a;">${summary.totalResolved}</p>
          </div>
          <div class="summary-card">
            <h3>In Progress</h3>
            <p class="value" style="color: #d97706;">${summary.totalInProgress}</p>
          </div>
          <div class="summary-card">
            <h3>Resolution Rate</h3>
            <p class="value" style="color: #7c3aed;">
              ${summary.totalReports > 0 ? Math.round((summary.totalResolved / summary.totalReports) * 100) : 0}%
            </p>
          </div>
          <div class="summary-card">
            <h3>MTTR (min)</h3>
            <p class="value" style="color: #2563eb;">${summary.mttr || 'N/A'}</p>
          </div>
          <div class="summary-card">
            <h3>SLA Compliance</h3>
            <p class="value" style="color: ${slaPercentage >= 90 ? '#16a34a' : slaPercentage >= 75 ? '#d97706' : '#dc2626'};">
              ${slaPercentage}%
            </p>
          </div>
        </div>
        
        <!-- Region Breakdown -->
        <div class="table-container">
          <h3>Tickets by Region</h3>
          <table class="table">
            <thead>
              <tr>
                <th>Region</th>
                <th style="text-align: center;">Total</th>
                <th style="text-align: center;">In Progress</th>
                <th style="text-align: center;">Resolved</th>
                <th style="text-align: center;">Within SLA</th>
                <th style="text-align: center;">Out of SLA</th>
                <th style="text-align: center;">SLA %</th>
              </tr>
            </thead>
            <tbody>
              ${ticketsPerRegion.map(region => {
                const regionSlaPercentage = region.resolvedTickets > 0 
                  ? Math.round((region.withinSLA / region.resolvedTickets) * 100) 
                  : 0;
                  
                return `
                <tr>
                  <td>${region.region}</td>
                  <td style="text-align: center;">${region.totalTickets}</td>
                  <td style="text-align: center;">${region.inProgressTickets}</td>
                  <td style="text-align: center;">${region.resolvedTickets}</td>
                  <td style="text-align: center; color: #16a34a;">${region.withinSLA || 0}</td>
                  <td style="text-align: center; color: #dc2626;">${region.outOfSLA || 0}</td>
                  <td style="text-align: center;">${regionSlaPercentage}%</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        
        <!-- Alarms by Root Cause -->
        <div class="table-container">
          <h3>Alarms by Root Cause</h3>
          <table class="table">
            <thead>
              <tr>
                <th>Root Cause</th>
                <th style="text-align: right;">Count</th>
                <th style="text-align: right;">% of Total</th>
              </tr>
            </thead>
            <tbody>
              ${alarmsByRootCause.map(cause => {
                const percentage = Math.round((cause.count / summary.totalReports) * 100);
                return `
                <tr>
                  <td>${cause.rootCause}</td>
                  <td style="text-align: right;">${cause.count}</td>
                  <td style="text-align: right;">${percentage}%</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        
        <!-- Ongoing Outages -->
        <div class="table-container">
          <h3>Ongoing Outages</h3>
          <table class="table">
            <thead>
              <tr>
                <th>Site</th>
                <th>Alarm Type</th>
                <th>Occurrence Time</th>
                <th>Duration</th>
                <th>Expected Restoration</th>
                <th>Mandatory Restoration</th>
                <th>Region</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${allReports
                .filter(report => report.status === 'In Progress' || report.status === 'Open')
                .slice(0, 10)
                .map(report => {
                  const startTime = new Date(report.occurrenceTime);
                  const endTime = new Date();
                  const durationMs = endTime - startTime;
                  const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
                  const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
                  const durationStr = durationHours > 0 
                    ? `${durationHours}h ${durationMinutes}m` 
                    : `${durationMinutes}m`;
                    
                  const statusBadge = report.status === 'In Progress'
                    ? `<span class="badge badge-in-progress">In Progress</span>`
                    : `<span class="badge badge-open">${report.status}</span>`;
                    
                  return `
                  <tr>
                    <td>${report.siteCode || report.siteNo || 'N/A'}</td>
                    <td>${report.alarmType || 'N/A'}</td>
                    <td>${startTime.toLocaleTimeString()}</td>
                    <td>${durationStr}</td>
                    <td>${report.expectedRestorationTime ? new Date(report.expectedRestorationTime).toLocaleTimeString() : 'N/A'}</td>
                    <td>${report.mandatoryRestorationTime ? new Date(report.mandatoryRestorationTime).toLocaleTimeString() : 'N/A'}</td>
                    <td>${report.region || 'N/A'}</td>
                    <td>${statusBadge}</td>
                  </tr>`;
                }).join('')}
                ${allReports.filter(report => report.status === 'In Progress' || report.status === 'Open').length === 0 ? 
                  '<tr><td colspan="8" style="text-align: center; padding: 20px 0; color: #6b7280;">No ongoing outages</td></tr>' : ''}
            </tbody>
          </table>
        </div>
        
        <!-- Resolved Outages -->
        <div class="table-container">
          <h3>Resolved Outages (Last 24h)</h3>
          <table class="table">
            <thead>
              <tr>
                <th>Site</th>
                <th>Alarm Type</th>
                <th>Occurrence  Time</th>
                <th>Resolution Time</th>
                <th>Duration</th>
                <th>Region</th>
                <th>SLA Status</th>
              </tr>
            </thead>
            <tbody>
              ${allReports
                .filter(report => report.status === 'Resolved' || report.status === 'Closed')
                .sort((a, b) => new Date(b.resolutionTime) - new Date(a.resolutionTime))
                .slice(0, 20)
                .map(report => {
                  const startTime = new Date(report.occurrenceTime);
                  const endTime = new Date(report.resolutionTime);
                  const durationMs = endTime - startTime;
                  const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
                  const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
                  const durationStr = durationHours > 0 
                    ? `${durationHours}h ${durationMinutes}m` 
                    : `${durationMinutes}m`;
                    
                  // Calculate SLA status
                  const slaHours = 2; // 2-hour SLA
                  const isWithinSla = durationHours <= slaHours;
                  const slaStatus = isWithinSla 
                    ? '<span style="color: #16a34a;">Within SLA</span>' 
                    : '<span style="color: #dc2626;">SLA Breached</span>';
                    
                  return `
                  <tr>
                    <td>${report.siteCode || report.siteNo || 'N/A'}</td>
                    <td>${report.alarmType || 'N/A'}</td>
                    <td>${startTime.toLocaleTimeString()}</td>
                    <td>${endTime.toLocaleTimeString()}</td>
                    <td>${durationStr}</td>
                    <td>${report.region || 'N/A'}</td>
                    <td>${slaStatus}</td>
                  </tr>`;
                }).join('')}
                ${allReports.filter(report => report.status === 'Resolved' || report.status === 'Closed').length === 0 ? 
                  '<tr><td colspan="7" style="text-align: center; padding: 20px 0; color: #6b7280;">No resolved outages in the last 24 hours</td></tr>' : ''}
            </tbody>
          </table>
        </div>
        
        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">
          <p>This is an automated report. Please do not reply to this email.</p>
          <p>© ${new Date().getFullYear()} Network Operations Center. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
    `;

    // Create plain text version
    const text = `Daily Network Performance Report - ${dateStr}
${'='.repeat(50)}

Summary:
- Total Tickets: ${summary.totalReports}
- Resolved: ${summary.totalResolved}
- In Progress: ${summary.totalInProgress}
- Resolution Rate: ${summary.totalReports > 0 ? Math.round((summary.totalResolved / summary.totalReports) * 100) : 0}%
- MTTR: ${summary.mttr || 'N/A'} minutes
- SLA Compliance: ${slaPercentage}%

Tickets by Region:
${ticketsPerRegion.map(region => {
  const regionSlaPercentage = region.resolvedTickets > 0 
    ? Math.round((region.withinSLA / region.resolvedTickets) * 100) 
    : 0;
  return `${region.region}: ${region.totalTickets} total, ${region.inProgressTickets} in progress, ${region.resolvedTickets} resolved (${regionSlaPercentage}% SLA)`;
}).join('\n')}

Alarms by Root Cause:
${alarmsByRootCause.map(cause => {
  const percentage = Math.round((cause.count / summary.totalReports) * 100);
  return `${cause.rootCause}: ${cause.count} (${percentage}%)`;
}).join('\n')}

Recent Outages:
${allReports.slice(0, 10).map(report => {
  const startTime = new Date(report.occurrenceTime);
  return `${report.siteCode || report.siteNo || 'N/A'} - ${report.alarmType || 'N/A'} - ${startTime.toLocaleTimeString()} - ${report.status}`;
}).join('\n')}

This is an automated report. Please do not reply to this email.
© ${new Date().getFullYear()} Network Operations Center. All rights reserved.`;

    return { html, text };
  }
}

// Create and export singleton instance
export const dailyReportService = new DailyReportService();
export default DailyReportService;