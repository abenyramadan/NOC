import OutageReport from "../models/OutageReport.js";
import { getEmailService } from "./emailService.js";
import { outageReportService } from "./outageReportService.js";
import EmailRecipientService from "./emailRecipientService.js";
import cron from "node-cron";

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
      console.log("Daily report scheduler is already running");
      return;
    }

    // Schedule to run every day at 23:59
    this.cronJob = cron.schedule(
      "59 23 * * *",
      async () => {
        console.log("📅 Running scheduled daily report generation...");
        await this.generateDailyReport();
      },
      {
        scheduled: false,
      }
    );

    // Start scheduler
    this.cronJob.start();
    this.isRunning = true;

    console.log(
      "✅ Daily report scheduler started. Will run every day at 23:59."
    );
  }

  /**
   * Stop the daily report scheduler
   */
  stopScheduler() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.isRunning = false;
      console.log("🛑 Daily report scheduler stopped");
    }
  }

  /**
   * Generate daily email report using the same data as the daily reports page
   */
  async generateDailyReport() {
    try {
      const reportDate = new Date();
      const reportData = await this.getDailyReportsFromAPI(reportDate);
      const emailService = await getEmailService();
      const { html, text } = await this.generateDailyReportEmail(
        reportData,
        reportDate
      );

      // Send email to configured recipients
      const recipients = process.env.DAILY_REPORT_EMAILS || "";
      if (recipients) {
        await emailService.sendEmail({
          to: recipients.split(",").map((email) => email.trim()),
          subject: `Daily Network Performance Report - ${reportDate.toLocaleDateString()}`,
          html,
          text,
        });
        console.log("📧 Daily report email sent successfully");
      } else {
        console.log("⚠️ No email recipients configured for daily reports");
      }

      return { success: true };
    } catch (error) {
      console.error("❌ Error generating daily report:", error);
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
      // Get all reports for this day, including unresolved carry-overs and carry-overs resolved today
      const dailyReports = await OutageReport.find(
        {
          $or: [
            // Reports that occurred on the selected date
            { occurrenceTime: { $gte: startOfDay, $lte: endOfDay } },
            // Reports that were resolved on the selected date (carry-overs resolved today)
            {
              resolutionTime: { $gte: startOfDay, $lte: endOfDay },
              status: { $in: ["Resolved", "Closed"] },
            },
            // Unresolved carry-over outages from previous days
            {
              occurrenceTime: { $lt: startOfDay },
              status: { $in: ["Open", "In Progress"] },
            },
          ],
        },
        "siteCode siteNo region alarmType occurrenceTime resolutionTime status expectedRestorationTime mandatoryRestorationTime rootCause subrootCause supervisor username"
      )
        .sort({ occurrenceTime: -1 })
        .lean();

      // Categorize reports
      const newOutages = dailyReports.filter(
        (report) =>
          report.occurrenceTime >= startOfDay &&
          report.occurrenceTime <= endOfDay
      );

      const carryOverOutages = dailyReports.filter(
        (report) =>
          report.occurrenceTime < startOfDay &&
          (report.status === "Open" || report.status === "In Progress")
      );

      const resolvedToday = dailyReports.filter(
        (report) =>
          (report.status === "Resolved" || report.status === "Closed") &&
          report.resolutionTime &&
          report.resolutionTime >= startOfDay &&
          report.resolutionTime <= endOfDay
      );

      // Process reports by region
      const regionMap = new Map();

      dailyReports.forEach((report) => {
        const region = report.region || "Unknown";
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
            minorAlarms: 0,
          });
        }

        const regionData = regionMap.get(region);
        regionData.totalTickets++;

        // Update status counts
        if (report.status === "Open") regionData.openTickets++;
        if (report.status === "In Progress") regionData.inProgressTickets++;
        if (report.status === "Resolved" || report.status === "Closed")
          regionData.resolvedTickets++;

        // Update alarm type counts
        if (report.alarmType === "CRITICAL") regionData.criticalAlarms++;
        if (report.alarmType === "MAJOR") regionData.majorAlarms++;
        if (report.alarmType === "MINOR") regionData.minorAlarms++;

        // Update SLA status for resolved reports
        if (
          (report.status === "Resolved" || report.status === "Closed") &&
          report.resolutionTime &&
          report.resolutionTime >= startOfDay &&
          report.resolutionTime <= endOfDay
        ) {
          const slaStatus = outageReportService.calculateSlaStatus(
            report.occurrenceTime,
            report.resolutionTime,
            report.expectedResolutionHours
          );
          if (slaStatus === "within") {
            regionData.withinSLA++;
          } else if (slaStatus === "out") {
            regionData.outOfSLA++;
          }
        }
      });

      // Convert map to array
      const ticketsPerRegion = Array.from(regionMap.values());

      // Group by root cause
      const rootCauseMap = new Map();
      dailyReports.forEach((report) => {
        const rootCause = report.rootCause || "Not specified";
        if (!rootCauseMap.has(rootCause)) {
          rootCauseMap.set(rootCause, {
            rootCause,
            count: 0,
            alarms: [],
          });
        }
        rootCauseMap.get(rootCause).count++;
        rootCauseMap.get(rootCause).alarms.push(report);
      });

      // Convert map to array and sort by count (descending)
      const alarmsByRootCause = Array.from(rootCauseMap.values()).sort(
        (a, b) => b.count - a.count
      );

      // Calculate summary metrics
      const totalReports = dailyReports.length;
      const totalNewOutages = newOutages.length;
      const totalCarryOverOutages = carryOverOutages.length;
      const totalResolvedToday = resolvedToday.length;
      const totalOpen = ticketsPerRegion.reduce(
        (sum, item) => sum + (item.openTickets || 0),
        0
      );
      const totalInProgress = ticketsPerRegion.reduce(
        (sum, item) => sum + (item.inProgressTickets || 0),
        0
      );
      const totalResolved = ticketsPerRegion.reduce(
        (sum, item) => sum + (item.resolvedTickets || 0),
        0
      );
      const totalWithinSLA = ticketsPerRegion.reduce(
        (sum, item) => sum + (item.withinSLA || 0),
        0
      );
      const totalOutOfSLA = ticketsPerRegion.reduce(
        (sum, item) => sum + (item.outOfSLA || 0),
        0
      );

      // Calculate MTTR for resolved tickets
      const resolvedReports = dailyReports.filter(
        (r) =>
          (r.status === "Resolved" || r.status === "Closed") &&
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
        mttr = Math.round(
          totalResolutionTime / resolvedReports.length / (1000 * 60)
        ); // in minutes
      }

      // Calculate SLA percentage
      const slaPercentage =
        totalResolved > 0
          ? Math.round((totalWithinSLA / totalResolved) * 100)
          : 0;

      return {
        reportDate: startOfDay,
        summary: {
          totalReports,
          totalNewOutages,
          totalCarryOverOutages,
          totalResolvedToday,
          totalInProgress,
          totalResolved,
          totalWithinSLA,
          totalOutOfSLA,
          mttr,
          slaPercentage,
        },
        alarmsByRootCause,
        ticketsPerRegion,
        allReports: dailyReports,
        newOutages,
        carryOverOutages,
        resolvedToday,
      };
    } catch (error) {
      console.error("Error generating daily report data:", error);
      throw error;
    }
  }

  /**
   * Generate HTML and text content for daily report email
   */
  formatDate(date) {
    if (!date) return "N/A";
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, "0");
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const month = monthNames[d.getMonth()];
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  formatDateTime(date) {
    if (!date) return "N/A";
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, "0");
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const month = monthNames[d.getMonth()];
    const year = d.getFullYear();
    const hours = d.getHours().toString().padStart(2, "0");
    const minutes = d.getMinutes().toString().padStart(2, "0");
    const ampm = d.getHours() >= 12 ? "PM" : "AM";

    return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
  }

  async generateDailyReportEmail(dailyReportsData, reportDate) {
    const {
      ticketsPerRegion = [],
      alarmsByRootCause = [],
      allReports = [],
      newOutages = [],
      carryOverOutages = [],
      resolvedToday = [],
      summary = {},
    } = dailyReportsData;

    // Format the date
    const dateStr = this.formatDate(reportDate);

    // Compute ongoing outages and exclude carry-overs for the "Ongoing Outages" table
    const ongoingOutages = (allReports || []).filter(
      (r) => r && (r.status === "Open" || r.status === "In Progress")
    );
    const todayOngoingOutages = ongoingOutages.filter(
      (o) => !carryOverOutages.some((co) => String(co._id) === String(o._id))
    );

    // Calculate SLA percentage
    const slaPercentage =
      summary.totalResolved > 0
        ? Math.round((summary.totalWithinSLA / summary.totalResolved) * 100) ||
          0
        : 0;

    // Create HTML email
    const html = `
    <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
    <html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <meta name="x-apple-disable-message-reformatting">
      <title>Daily Network Performance Report - ${dateStr}</title>
      <!--[if mso]>
      <xml>
        <o:OfficeDocumentSettings>
          <o:AllowPNG/>
          <o:PixelsPerInch>96</o:PixelsPerInch>
        </o:OfficeDocumentSettings>
      </xml>
      <![endif]-->
      <style type="text/css">
        /* Basic reset for email clients */
        body, table, td, p, a, li, blockquote {
          -webkit-text-size-adjust: 100%;
          -ms-text-size-adjust: 100%;
          font-size: 18px !important;
          line-height: 1.6 !important;
          font-weight: 500 !important;
        }
        table, td {
          mso-table-lspace: 0pt;
          mso-table-rspace: 0pt;
        }
        img {
          -ms-interpolation-mode: bicubic;
        }
        /* Outlook conditional styles */
        @media screen and (max-width: 480px) {
          .mobile-full-width {
            width: 100% !important;
          }
          .mobile-text-center {
            text-align: center !important;
          }
          /* Mobile responsive improvements */
          body, table, td, p, a, li, blockquote {
            font-size: 18px !important;
            line-height: 1.6 !important;
            font-weight: 500 !important;
          }
          h1 {
            font-size: 30px !important;
          }
          h2 {
            font-size: 22px !important;
          }
          /* Increase table cell padding for mobile */
          td[style*="padding: 12px 16px"] {
            padding: 16px 12px !important;
          }
          td[style*="padding: 14px 16px"] {
            padding: 18px 12px !important;
          }
          /* Make status badges larger on mobile */
          span[style*="padding: 4px 8px"] {
            padding: 6px 12px !important;
            font-size: 15px !important;
            font-weight: 600 !important;
          }
          /* Increase header padding on mobile */
          td[style*="padding: 24px"] {
            padding: 20px 16px !important;
          }
          td[style*="padding: 0 24px 24px 24px"] {
            padding: 0 16px 20px 16px !important;
          }
          /* Adjust root cause table padding for mobile */
          td[style*="padding: 4px 8px"] {
            padding: 8px 6px !important;
          }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.4; color: #333333;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f9fafb;">
        <tr>
          <td align="center" valign="top">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff;">
              <!-- Header -->
              <tr>
                <td align="left" valign="top" style="padding: 24px;">
                  <h1 style="margin: 0 0 8px 0; padding: 0; color: #1a365d; font-size: 24px; font-weight: bold;">Daily Network Performance Report</h1>
                  <p style="margin: 0; color: #4a5568; font-size: 14px;">${dateStr} • 00:00 - 23:59 • ${
      summary.totalCarryOverOutages || 0
    } Carry-Over • ${summary.totalResolvedToday || 0} Resolved</p>
                </td>
              </tr>

              <!-- Summary Cards - OUTLOOK COMPATIBLE TABLE LAYOUT -->
              <tr>
                <td align="left" valign="top" style="padding: 0 24px 24px 24px;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
                    <tr>
                      <!-- Total Tickets Card -->
                      <td align="left" valign="top" width="150" style="width: 150px; background-color: #1d4ed8; padding: 14px 16px; color: white;">
                        <div style="font-size: 12px; margin-bottom: 6px; color: #dbeafe;">Total Tickets</div>
                        <div style="font-size: 22px; font-weight: bold; line-height: 1.2;">${
                          summary.totalReports
                        }</div>
                      </td>
                      <!-- In Progress Card -->
                      <td align="left" valign="top" width="150" style="width: 150px; background-color: #0284c7; padding: 14px 16px; color: white;">
                        <div style="font-size: 12px; margin-bottom: 6px; color: #bae6fd;">In Progress</div>
                        <div style="font-size: 22px; font-weight: bold; line-height: 1.2;">${
                          summary.totalInProgress || 0
                        }</div>
                      </td>
                      <!-- Carry-Overs Card -->
                      <td align="left" valign="top" width="150" style="width: 150px; background-color: #f97316; padding: 14px 16px; color: white;">
                        <div style="font-size: 12px; margin-bottom: 6px; color: #fed7aa;">Carry-Overs</div>
                        <div style="font-size: 22px; font-weight: bold; line-height: 1.2;">${
                          summary.totalCarryOverOutages || 0
                        }</div>
                      </td>
                      <!-- Resolved Today Card -->
                      <td align="left" valign="top" width="150" style="width: 150px; background-color: #16a34a; padding: 14px 16px; color: white;">
                        <div style="font-size: 12px; margin-bottom: 6px; color: #a7f3d0;">Resolved Today</div>
                        <div style="font-size: 22px; font-weight: bold; line-height: 1.2;">${
                          summary.totalResolvedToday || 0
                        }</div>
                      </td>
                      <!-- MTTR Card -->
                      <td align="left" valign="top" width="150" style="width: 150px; background-color: #2563eb; padding: 14px 16px; color: white;">
                        <div style="font-size: 12px; margin-bottom: 6px; color: #bfdbfe;">MTTR (min)</div>
                        <div style="font-size: 22px; font-weight: bold; line-height: 1.2;">${
                          summary.mttr || "N/A"
                        }</div>
                      </td>
                      <!-- SLA Compliance Card -->
                      <td align="left" valign="top" width="150" style="width: 150px; background-color: ${
                        slaPercentage >= 90
                          ? "#16a34a"
                          : slaPercentage >= 75
                          ? "#d97706"
                          : "#dc2626"
                      }; padding: 14px 16px; color: white;">
                        <div style="font-size: 12px; margin-bottom: 6px; color: #a7f3d0;">SLA Compliance</div>
                        <div style="font-size: 22px; font-weight: bold; line-height: 1.2;">${slaPercentage}%</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Carry-Over Outages -->
              ${
                carryOverOutages.length > 0
                  ? `
              <tr>
                <td align="left" valign="top" style="padding: 0 24px 24px 24px;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff; border: 1px solid #e5e7eb;">
                    <tr>
                      <td align="left" valign="top" style="padding: 16px; background-color: #f9fafb; border-bottom: 1px solid #e5e7eb;">
                        <h2 style="margin: 0; font-size: 16px; font-weight: bold; color: #f97316;">Carry-Over Outages (${
                          carryOverOutages.length
                        })</h2>
                      </td>
                    </tr>
                    <tr>
                      <td align="left" valign="top">
                        <table border="0" cellpadding="0" cellspacing="0" width="100%">
                          <thead>
                            <tr style="background-color: #0066ff;">
                              <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: white; border-bottom: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Site</th>
                              <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: white; border-bottom: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Alarm Type</th>
                              <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: white; border-bottom: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Occurrence Time</th>
                              <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: white; border-bottom: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Days Open</th>
                              <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: white; border-bottom: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Region</th>
                              <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: white; border-bottom: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${carryOverOutages
                              .slice(0, 15)
                              .map((report) => {
                                const startTime = new Date(
                                  report.occurrenceTime
                                );
                                const endTime = new Date();
                                const durationMs = endTime - startTime;
                                const daysOpen = Math.floor(
                                  durationMs / (1000 * 60 * 60 * 24)
                                );

                                const statusBadge =
                                  report.status === "In Progress"
                                    ? '<span style="background-color: #fef3c7; color: #92400e; padding: 4px 8px; font-size: 12px; font-weight: bold;">In Progress</span>'
                                    : '<span style="background-color: #dbeafe; color: #1e40af; padding: 4px 8px; font-size: 12px; font-weight: bold;">' +
                                      report.status +
                                      "</span>";

                                return `
                                <tr>
                                  <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #1f2937;">${
                                    report.siteCode || report.siteNo || "N/A"
                                  }</td>
                                  <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #1f2937;">${
                                    report.alarmType || "N/A"
                                  }</td>
                                  <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">${this.formatDateTime(
                                    report.occurrenceTime
                                  )}</td>
                                  <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">${daysOpen} day${
                                  daysOpen !== 1 ? "s" : ""
                                }</td>
                                  <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">${
                                    report.region || "N/A"
                                  }</td>
                                  <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px;">${statusBadge}</td>
                                </tr>`;
                              })
                              .join("")}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              `
                  : ""
              }

              <!-- Ongoing Outages -->
              <tr>
                <td align="left" valign="top" style="padding: 0 24px 24px 24px;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff; border: 1px solid #e5e7eb;">
                    <tr>
                      <td align="left" valign="top" style="padding: 16px; background-color: #f9fafb; border-bottom: 1px solid #e5e7eb;">
                        <h2 style="margin: 0; font-size: 16px; font-weight: bold; color: #111827;">Ongoing Outages (${
                          todayOngoingOutages.length
                        })</h2>
                      </td>
                    </tr>
                    <tr>
                      <td align="left" valign="top">
                        ${
                          todayOngoingOutages.length > 0
                            ? `
                        <table border="0" cellpadding="0" cellspacing="0" width="100%">
                          <thead>
                            <tr style="background-color: #0066ff;">
                              <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: white; border-bottom: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Site</th>
                              <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: white; border-bottom: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Alarm Type</th>
                              <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: white; border-bottom: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Occurrence Time</th>
                              <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: white; border-bottom: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Duration</th>
                              <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: white; border-bottom: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Region</th>
                              <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: white; border-bottom: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${todayOngoingOutages
                              .slice(0, 10)
                              .map((report) => {
                                const startTime = new Date(
                                  report.occurrenceTime
                                );
                                const endTime = new Date();
                                const durationMs = endTime - startTime;
                                const durationHours = Math.floor(
                                  durationMs / (1000 * 60 * 60)
                                );
                                const durationMinutes = Math.floor(
                                  (durationMs % (1000 * 60 * 60)) / (1000 * 60)
                                );
                                const durationStr =
                                  durationHours > 0
                                    ? `${durationHours}h ${durationMinutes}m`
                                    : `${durationMinutes}m`;

                                const statusBadge =
                                  report.status === "In Progress"
                                    ? '<span style="background-color: #fef3c7; color: #92400e; padding: 4px 8px; font-size: 12px; font-weight: bold;">In Progress</span>'
                                    : '<span style="background-color: #dbeafe; color: #1e40af; padding: 4px 8px; font-size: 12px; font-weight: bold;">' +
                                      report.status +
                                      "</span>";

                                return `
                                <tr>
                                  <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #1f2937;">${
                                    report.siteCode || report.siteNo || "N/A"
                                  }</td>
                                  <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #1f2937;">${
                                    report.alarmType || "N/A"
                                  }</td>
                                  <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">${this.formatDateTime(
                                    report.occurrenceTime
                                  )}</td>
                                  <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">${durationStr}</td>
                                  <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">${
                                    report.region || "N/A"
                                  }</td>
                                  <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px;">${statusBadge}</td>
                                </tr>`;
                              })
                              .join("")}
                            ${
                              todayOngoingOutages.length === 0
                                ? '<tr><td colspan="6" align="center" valign="top" style="padding: 40px 20px; color: #6b7280; font-size: 14px;">No ongoing outages</td></tr>'
                                : ""
                            }
                          </tbody>
                        </table>
                        `
                            : `
                        <table border="0" cellpadding="0" cellspacing="0" width="100%">
                          <tr>
                            <td align="center" valign="top" style="padding: 40px 20px; color: #6b7280; font-size: 14px;">
                              No ongoing outages at this time. All systems operational.
                            </td>
                          </tr>
                        </table>
                        `
                        }
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Resolved Today -->
              <tr>
                <td align="left" valign="top" style="padding: 0 24px 24px 24px;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff; border: 1px solid #e5e7eb;">
                    <tr>
                      <td align="left" valign="top" style="padding: 16px; background-color: #f9fafb; border-bottom: 1px solid #e5e7eb;">
                        <h2 style="margin: 0; font-size: 16px; font-weight: bold; color: #16a34a;">Resolved Today (${
                          resolvedToday.length
                        })</h2>
                      </td>
                    </tr>
                    <tr>
                      <td align="left" valign="top">
                        ${
                          resolvedToday.length > 0
                            ? `
                        <table border="0" cellpadding="0" cellspacing="0" width="100%">
                          <thead>
                            <tr style="background-color: #0066ff;">
                              <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: white; border-bottom: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Site</th>
                              <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: white; border-bottom: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Alarm Type</th>
                              <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: white; border-bottom: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Occurrence Time</th>
                              <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: white; border-bottom: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Resolution Time</th>
                              <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: white; border-bottom: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Duration</th>
                              <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: white; border-bottom: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Region</th>
                              <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: white; border-bottom: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">SLA Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${resolvedToday
                              .sort(
                                (a, b) =>
                                  new Date(b.resolutionTime) -
                                  new Date(a.resolutionTime)
                              )
                              .slice(0, 20)
                              .map((report) => {
                                const startTime = new Date(
                                  report.occurrenceTime
                                );
                                const endTime = new Date(report.resolutionTime);
                                const durationMs = endTime - startTime;
                                const durationHours = Math.floor(
                                  durationMs / (1000 * 60 * 60)
                                );
                                const durationMinutes = Math.floor(
                                  (durationMs % (1000 * 60 * 60)) / (1000 * 60)
                                );
                                const durationStr =
                                  durationHours > 0
                                    ? `${durationHours}h ${durationMinutes}m`
                                    : `${durationMinutes}m`;

                                // Calculate SLA status
                                const slaHours = 2; // 2-hour SLA
                                const isWithinSla = durationHours <= slaHours;
                                const slaStatus = isWithinSla
                                  ? '<span style="color: #16a34a; font-weight: bold;">Within SLA</span>'
                                  : '<span style="color: #dc2626; font-weight: bold;">SLA Breached</span>';

                                return `
                                <tr>
                                  <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #1f2937;">${
                                    report.siteCode || report.siteNo || "N/A"
                                  }</td>
                                  <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #1f2937;">${
                                    report.alarmType || "N/A"
                                  }</td>
                                  <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">${this.formatDateTime(
                                    report.occurrenceTime
                                  )}</td>
                                  <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">${this.formatDateTime(
                                    report.resolutionTime
                                  )}</td>
                                  <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">${durationStr}</td>
                                  <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">${
                                    report.region || "N/A"
                                  }</td>
                                  <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px;">${slaStatus}</td>
                                </tr>`;
                              })
                              .join("")}
                            ${
                              resolvedToday.length === 0
                                ? '<tr><td colspan="7" align="center" valign="top" style="padding: 40px 20px; color: #6b7280; font-size: 14px;">No resolved outages today</td></tr>'
                                : ""
                            }
                          </tbody>
                        </table>
                        `
                            : `
                        <table border="0" cellpadding="0" cellspacing="0" width="100%">
                          <tr>
                            <td align="center" valign="top" style="padding: 40px 20px; color: #6b7280; font-size: 14px;">
                              No outages have been resolved yet today.
                            </td>
                          </tr>
                        </table>
                        `
                        }
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Tickets by Region -->
              <tr>
                <td align="left" valign="top" style="padding: 0 24px 24px 24px;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff; border: 1px solid #e5e7eb;">
                    <tr>
                      <td align="left" valign="top" style="padding: 16px; background-color: #f9fafb; border-bottom: 1px solid #e5e7eb;">
                        <h2 style="margin: 0; font-size: 16px; font-weight: bold; color: #111827;">Tickets by Region</h2>
                      </td>
                    </tr>
                    <tr>
                      <td align="left" valign="top">
                        <table border="0" cellpadding="0" cellspacing="0" width="100%">
                          <thead>
                            <tr style="background-color: #0066ff;">
                              <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: white; border-bottom: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Region</th>
                              <th align="center" valign="top" style="padding: 12px 16px; font-weight: bold; color: white; border-bottom: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Total</th>
                              <th align="center" valign="top" style="padding: 12px 16px; font-weight: bold; color: white; border-bottom: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">In Progress</th>
                              <th align="center" valign="top" style="padding: 12px 16px; font-weight: bold; color: white; border-bottom: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Resolved</th>
                              <th align="center" valign="top" style="padding: 12px 16px; font-weight: bold; color: white; border-bottom: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Within SLA</th>
                              <th align="center" valign="top" style="padding: 12px 16px; font-weight: bold; color: white; border-bottom: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Out of SLA</th>
                              <th align="center" valign="top" style="padding: 12px 16px; font-weight: bold; color: white; border-bottom: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">SLA %</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${ticketsPerRegion
                              .map((region) => {
                                const regionSlaPercentage =
                                  region.resolvedTickets > 0
                                    ? Math.round(
                                        (region.withinSLA /
                                          region.resolvedTickets) *
                                          100
                                      )
                                    : 0;

                                return `
                            <tr>
                              <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #1f2937; font-weight: bold;">${
                                region.region
                              }</td>
                              <td align="center" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #1f2937; font-weight: bold;">${
                                region.totalTickets
                              }</td>
                              <td align="center" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #1f2937;">${
                                region.inProgressTickets
                              }</td>
                              <td align="center" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #1f2937;">${
                                region.resolvedTickets
                              }</td>
                              <td align="center" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #16a34a; font-weight: bold;">${
                                region.withinSLA || 0
                              }</td>
                              <td align="center" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #dc2626; font-weight: bold;">${
                                region.outOfSLA || 0
                              }</td>
                              <td align="center" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #1f2937;">${regionSlaPercentage}%</td>
                            </tr>`;
                              })
                              .join("")}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Alarms by Root Cause -->
              <tr>
                <td align="left" valign="top" style="padding: 0 24px 24px 24px;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff; border: 1px solid #e5e7eb;">
                    <tr>
                      <td align="left" valign="top" style="padding: 16px; background-color: #f9fafb; border-bottom: 1px solid #e5e7eb;">
                        <h2 style="margin: 0; font-size: 16px; font-weight: bold; color: #111827;">Alarms by Root Cause</h2>
                      </td>
                    </tr>
                    <tr>
                      <td align="left" valign="top">
                        <table border="0" cellpadding="0" cellspacing="0" width="100%">
                          <thead>
                            <tr style="background-color: #0066ff;">
                              <th align="left" valign="top" style="padding: 4px 8px; font-weight: bold; color: white; font-size: 12px; width: 50%;">Root Cause</th>
                              <th align="center" valign="top" style="padding: 4px 8px; font-weight: bold; color: white; font-size: 12px; width: 25%;">Count</th>
                              <th align="center" valign="top" style="padding: 4px 8px; font-weight: bold; color: white; font-size: 12px; width: 25%;">%</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${alarmsByRootCause
                              .slice(0, 8)
                              .map((cause) => {
                                const percentage =
                                  summary.totalReports > 0
                                    ? Math.round(
                                        (cause.count / summary.totalReports) *
                                          100
                                      )
                                    : 0;
                                return `
                              <tr>
                                <td align="left" valign="top" style="padding: 4px 8px; font-size: 11px; color: #374151; border-bottom: 1px solid #e5e7eb;">${
                                  cause.rootCause || "Not specified"
                                }</td>
                                <td align="center" valign="top" style="padding: 4px 8px; font-size: 11px; color: #374151; font-weight: 500; border-bottom: 1px solid #e5e7eb;">${
                                  cause.count
                                }</td>
                                <td align="center" valign="top" style="padding: 4px 8px; font-size: 11px; color: #374151; border-bottom: 1px solid #e5e7eb;">${percentage}%</td>
                              </tr>`;
                              })
                              .join("")}
                            ${
                              alarmsByRootCause.length === 0
                                ? `
                              <tr>
                                <td colspan="3" align="center" valign="top" style="padding: 16px; color: #6b7280; font-size: 11px;">No root cause data available</td>
                              </tr>`
                                : ""
                            }
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td align="center" valign="top" style="padding: 24px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
                  <p style="margin: 0; color: #6b7280; font-size: 12px; text-align: center;">
                    This is an automated report generated by NOC Alert System. Please do not reply to this email.<br>
                    For any questions or issues, please contact the NOC team.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`;

    // Create plain text version
    const text = `Daily Network Performance Report - ${dateStr}
${"=".repeat(50)}

Summary:
- Total Tickets: ${summary.totalReports}
- Carry-Overs: ${summary.totalCarryOverOutages || 0}
- Resolved Today: ${summary.totalResolvedToday || 0}
- In Progress: ${summary.totalInProgress}
- Resolution Rate: ${
      summary.totalReports > 0
        ? Math.round((summary.totalResolved / summary.totalReports) * 100)
        : 0
    }%
- MTTR: ${summary.mttr || "N/A"} minutes
- SLA Compliance: ${slaPercentage}%

Tickets by Region:
${ticketsPerRegion
  .map((region) => {
    const regionSlaPercentage =
      region.resolvedTickets > 0
        ? Math.round((region.withinSLA / region.resolvedTickets) * 100)
        : 0;
    return `${region.region}: ${region.totalTickets} total, ${region.inProgressTickets} in progress, ${region.resolvedTickets} resolved (${regionSlaPercentage}% SLA)`;
  })
  .join("\n")}

Carry-Over Outages:
${carryOverOutages
  .slice(0, 10)
  .map((report) => {
    const startTime = new Date(report.occurrenceTime);
    const daysOpen = Math.floor(
      (new Date() - startTime) / (1000 * 60 * 60 * 24)
    );
    return `${report.siteCode || report.siteNo || "N/A"} - ${
      report.alarmType || "N/A"
    } - ${this.formatDate(report.occurrenceTime)} (${daysOpen} days open) - ${
      report.status
    }`;
  })
  .join("\n")}

Resolved Today:
${resolvedToday
  .slice(0, 10)
  .map((report) => {
    const startTime = new Date(report.occurrenceTime);
    const endTime = new Date(report.resolutionTime);
    const durationMs = endTime - startTime;
    const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
    const durationMinutes = Math.floor(
      (durationMs % (1000 * 60 * 60)) / (1000 * 60)
    );
    const durationStr =
      durationHours > 0
        ? `${durationHours}h ${durationMinutes}m`
        : `${durationMinutes}m`;
    return `${report.siteCode || report.siteNo || "N/A"} - ${
      report.alarmType || "N/A"
    } - ${this.formatDateTime(report.resolutionTime)} (${durationStr})`;
  })
  .join("\n")}

Alarms by Root Cause (Top 5):
${alarmsByRootCause
  .slice(0, 5)
  .map((cause) => {
    const percentage = Math.round((cause.count / summary.totalReports) * 100);
    return `${cause.rootCause}: ${cause.count} (${percentage}%)`;
  })
  .join("\n")}

This is an automated report. Please do not reply to this email.
© ${new Date().getFullYear()} Network Operations Center. All rights reserved.`;

    return { html, text };
  }
}

// Create and export singleton instance
const dailyReportService = new DailyReportService();
export { dailyReportService };
export default DailyReportService;
