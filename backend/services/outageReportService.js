import express from "express";
import OutageReport from "../models/OutageReport.js";
import Alarm from "../models/Alarm.js";
import Ticket from "../models/Ticket.js";
import Site from "../models/Site.js";
import HourlyReportEmail from "../models/HourlyReportEmail.js";
import { authenticate } from "../middleware/auth.js";

import { getEmailService } from "./emailService.js";

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
      console.log("⏰ Outage report scheduler already running");
      return;
    }

    console.log("🚀 Starting outage report scheduler (hourly)");
    this.isRunning = true;

    // Calculate time until next hour
    const scheduleNextRun = () => {
      const now = new Date();
      const nextHour = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours() + 1,
        0,
        0,
        0
      );
      const delay = nextHour.getTime() - now.getTime();

      console.log(
        `⏰ Next hourly report will run in ${Math.round(delay / 60000)} minutes`
      );

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

    console.log("✅ Outage report scheduler started");
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
    console.log("🛑 Outage report scheduler stopped");
  }

  /**
   * Generate hourly email summary from ALL outage reports for the current day
   */
  async generateHourlyReport() {
    try {
      console.log(
        "📊 Generating hourly email summary from ALL outage reports for current day..."
      );

      // Get current date for daily reporting
      const now = new Date();
      const currentDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );
      const reportHour = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours()
      );

      console.log(
        `📅 Gathering outage reports for current day: ${currentDate.toDateString()} (showing all outages from this date)`
      );

      // Set to start of day (00:00:00)
      const startOfDay = currentDate; // Midnight of current day
      const endOfDay = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000); // Midnight of next day

      // Get all reports for this day, including unresolved carry-overs and carry-overs resolved today
      const allReportsToday = await OutageReport.find(
        {
          $or: [
            // Reports that occurred on the selected date
            { occurrenceTime: { $gte: startOfDay, $lt: endOfDay } },
            // Reports that were resolved on the selected date (carry-overs resolved today)
            {
              resolutionTime: { $gte: startOfDay, $lt: endOfDay },
              status: { $in: ["Resolved", "Closed"] },
            },
            // Unresolved carry-over outages from previous days
            {
              occurrenceTime: { $lt: startOfDay },
              status: { $in: ["Open", "In Progress"] },
            },
          ],
        },
        "siteCode siteName region alarmType occurrenceTime resolutionTime status expectedRestorationTime mandatoryRestorationTime rootCause subrootCause supervisor username"
      )
        .populate("alarmId")
        .sort({ occurrenceTime: -1 })
        .lean(); // Add .lean() for better performance and to get plain JS objects

      // Categorize reports
      const newOutages = allReportsToday.filter(
        (report) =>
          report.occurrenceTime >= startOfDay &&
          report.occurrenceTime < endOfDay
      );

      const carryOverOutages = allReportsToday.filter(
        (report) =>
          report.occurrenceTime < startOfDay &&
          (report.status === "Open" || report.status === "In Progress")
      );

      const resolvedToday = allReportsToday.filter(
        (report) =>
          (report.status === "Resolved" || report.status === "Closed") &&
          report.resolutionTime &&
          report.resolutionTime >= startOfDay &&
          report.resolutionTime < endOfDay
      );

      console.log(
        `🔍 Found ${allReportsToday.length} total outage reports for current day`
      );

      // Log alarm types for debugging
      console.log("Sample reports with alarm types:");
      allReportsToday.slice(0, 5).forEach((report, i) => {
        console.log(`Report ${i + 1}:`, {
          _id: report._id,
          siteCode: report.siteCode,
          alarmType: report.alarmType,
          alarmType: report.alarmType,
          status: report.status,
          occurrenceTime: report.occurrenceTime,
        });
      });

      if (allReportsToday.length === 0) {
        console.log("📭 No outage reports for current day, skipping email");
        return;
      }

      const ongoingOutages = allReportsToday.filter(
        (r) => r.status === "Open" || r.status === "In Progress"
      );
      const resolvedOutages = allReportsToday.filter(
        (r) => r.status === "Resolved" || r.status === "Closed"
      );

      console.log(
        `📊 Daily outage summary: ${ongoingOutages.length} ongoing, ${resolvedOutages.length} resolved`
      );

      // Calculate SLA metrics based on expectedResolutionTime from outage reports
      let withinSLA = 0;
      let outOfSLA = 0;
      let totalResolutionMinutes = 0;
      let resolvedCount = 0;

      for (const report of resolvedToday) {
        const startTime = report.occurrenceTime;
        const endTime = report.resolutionTime;
        const expectedHours = report.expectedResolutionHours;

        if (startTime && endTime) {
          const durationMinutes = Math.round((endTime - startTime) / 60000);
          totalResolutionMinutes += durationMinutes;
          resolvedCount++;

          // If expectedResolutionHours is set, use it for SLA calculation
          if (expectedHours !== null && expectedHours !== undefined) {
            const isWithinSLA =
              expectedHours && durationMinutes <= expectedHours * 60;
            const slaStatus = expectedHours
              ? isWithinSLA
                ? "✅ Within SLA"
                : "❌ Out of SLA"
              : "⚠️ Not Set";
            const slaColor = expectedHours
              ? isWithinSLA
                ? "#10b981"
                : "#ef4444"
              : "#f59e0b";
            if (isWithinSLA) {
              withinSLA++;
            } else {
              outOfSLA++;
            }
          } else {
            // Fallback to default thresholds if expectedResolutionHours is not set
            const slaThresholds = {
              critical: parseInt(process.env.SLA_CRITICAL_MINUTES || "30"),
              major: parseInt(process.env.SLA_MAJOR_MINUTES || "60"),
              minor: parseInt(process.env.SLA_MINOR_MINUTES || "120"),
            };
            const severity = (report.alarmType || "").toLowerCase();
            const slaThreshold = slaThresholds[severity] || slaThresholds.minor;

            if (durationMinutes <= slaThreshold) {
              withinSLA++;
            } else {
              outOfSLA++;
            }
          }
        }
      }

      const mttr =
        resolvedCount > 0
          ? Math.round(totalResolutionMinutes / resolvedCount)
          : 0;

      const regionMap = new Map();
      for (const report of allReportsToday) {
        const region =
          (report.region && String(report.region).trim()) || "Unknown";
        if (!regionMap.has(region)) {
          regionMap.set(region, {
            region,
            totalTickets: 0,
            inProgressTickets: 0,
            resolvedTickets: 0,
            criticalAlarms: 0,
            majorAlarms: 0,
            minorAlarms: 0,
          });
        }
        const agg = regionMap.get(region);
        agg.totalTickets += 1;
        if (report.status === "In Progress" || report.status === "Open")
          agg.inProgressTickets += 1;
        if (report.status === "Resolved" || report.status === "Closed")
          agg.resolvedTickets += 1;
        const sev = (report.alarmType || "").toUpperCase();
        if (sev === "CRITICAL") agg.criticalAlarms += 1;
        if (sev === "MAJOR") agg.majorAlarms += 1;
        if (sev === "MINOR") agg.minorAlarms += 1;
      }
      const ticketsPerRegion = Array.from(regionMap.values()).sort(
        (a, b) => b.totalTickets - a.totalTickets
      );

      // Send hourly report email - but only once per hour (database-tracked)
      const existingEmailRecord = await HourlyReportEmail.findOne({
        reportHour: reportHour,
      });

      if (existingEmailRecord) {
        console.log(
          `⏭️ Email already sent for hour ${reportHour.toISOString()} at ${existingEmailRecord.emailSentAt.toISOString()}, skipping duplicate`
        );
      } else {
        console.log(
          `📧 Sending hourly outage report email for hour: ${reportHour.toISOString()}`
        );

        const emailResult = await this.sendOutageReportEmail({
          ongoingOutages,
          resolvedOutages,
          newOutages,
          carryOverOutages,
          resolvedToday,
          metrics: {
            totalResolved: resolvedCount,
            withinSLA,
            outOfSLA,
            mttr,
            totalNewOutages: newOutages.length,
            totalCarryOverOutages: carryOverOutages.length,
            totalResolvedToday: resolvedToday.length,
          },
          ticketsPerRegion: ticketsPerRegion.map((item) => ({
            region: item.region,
            totalTickets: item.totalTickets,
            inProgressTickets: item.inProgressTickets,
            resolvedTickets: item.resolvedTickets,
            criticalAlarms: item.criticalAlarms,
            majorAlarms: item.majorAlarms,
            minorAlarms: item.minorAlarms,
          })),
          reportHour: reportHour,
        });

        // Mark all outage reports as emailed (to prevent duplicate emails)
        const reportIds = allReportsToday.map((r) => r._id);
        await OutageReport.updateMany(
          { _id: { $in: reportIds } },
          {
            $set: {
              isEmailSent: true,
              emailSentAt: new Date(),
            },
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
          emailMessageId: emailResult?.messageId || null,
        });

        console.log(
          `✅ Email sent and recorded for hour ${reportHour.toISOString()}, will not send again`
        );
      }
    } catch (error) {
      console.error("❌ Error generating hourly outage report:", error);
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
        "CENTRAL EQUATORIA": "C.E.S",
        "EASTERN EQUATORIA": "E.E.S",
        "WESTERN EQUATORIA": "W.E.S",
        "NORTHERN BAHR EL GHAZAL": "N.B.G.S",
        "WESTERN BAHR EL GHAZAL": "W.B.G.S",
        WARRAP: "WARRAP",
        "LAKES STATE": "LAKES",
        UNITY: "UNITY",
        JONGLEI: "JONGLEI",
        "UPPER NILE": "UPPERNILE",
      };

      // Return mapped abbreviation if it exists, otherwise return the region as-is if it's already an abbreviation
      return regionMappings[region] || region;
    }

    return "C.E.S"; // Default to C.E.S if no region specified
  }

  /**
   * Send outage report email
   */
  async sendOutageReportEmail(data) {
    try {
      console.log("📧 Sending hourly outage report email...");

      // Get email service instance
      const emailService = await getEmailService();

      if (!emailService || !emailService.sendEmail) {
        console.error("❌ Email service not available");
        return;
      }

      const reportHour = data.reportHour;
      const emailData = {
        subject: `🚨 NOCALERT Hourly Outage Status Report - ${new Date().toLocaleDateString()} ${new Date().getHours()}:00`,
        html: this.generateEmailTemplate(data),
      };

      // Send to NOC team (configured in email service)
      const emailResult = await emailService.sendEmail(emailData);

      console.log(
        `✅ Daily outage status report email sent successfully (${data.ongoingOutages.length} ongoing, ${data.resolvedOutages.length} resolved)`
      );

      // Return email result for tracking
      return {
        recipients: emailResult?.recipients || [process.env.NOC_ALERTS_EMAIL],
        messageId: emailResult?.messageId || null,
      };
    } catch (error) {
      console.error("❌ Failed to send outage report email:", error);
      return null;
    }
  }

  /**
   * Generate HTML email template for outage report
   */
  generateEmailTemplate(data) {
    const {
      ongoingOutages,
      resolvedOutages,
      newOutages = [],
      carryOverOutages = [],
      resolvedToday = [],
      metrics,
      ticketsPerRegion,
      reportHour,
    } = data;

    // Use the categorized metrics from the data parameter
    const resolvedTickets = metrics.totalResolvedToday;
    const inProgressTickets = ongoingOutages.filter(
      (o) => o.status === "In Progress" || o.status === "Open"
    ).length;
    const totalTickets = inProgressTickets + resolvedTickets;

    const resolutionRate =
      totalTickets > 0 ? Math.round((resolvedTickets / totalTickets) * 100) : 0;
    const slaCompliance =
      metrics.totalResolved > 0
        ? Math.round((metrics.withinSLA / metrics.totalResolved) * 100)
        : 100;
    const mttrFormatted = `${Math.floor(metrics.mttr / 60)}h ${
      metrics.mttr % 60
    }m`;

    // Use the provided carryOverOutages instead of recalculating
    const todayOngoingOutages = ongoingOutages.filter(
      (o) =>
        !carryOverOutages.some((co) => co._id.toString() === o._id.toString())
    );

    const formatDateTime = (date) => {
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
    };

    const formatDuration = (start, end) => {
      if (!start || !end) return "N/A";
      const diffMs = new Date(end) - new Date(start);
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      return `${hours}h ${minutes}m`;
    };

    const getSlaStatus = (report) => {
      if (!report.occurrenceTime || !report.resolutionTime)
        return { status: "N/A", color: "#9ca3af" };

      const actualMinutes = Math.round(
        (new Date(report.resolutionTime) - new Date(report.occurrenceTime)) /
          60000
      );

      if (
        report.expectedResolutionHours !== undefined &&
        report.expectedResolutionHours !== null
      ) {
        const expectedMinutes = report.expectedResolutionHours * 60;
        const isWithinSLA = actualMinutes <= expectedMinutes;
        return {
          status: isWithinSLA ? "✅ Within SLA" : "❌ Out of SLA",
          color: isWithinSLA ? "#059669" : "#dc2626",
        };
      }

      // Default SLA thresholds
      const slaThresholds = {
        CRITICAL: 60, // 1 hour
        MAJOR: 120, // 2 hours
        MINOR: 240, // 4 hours
        WARNING: 480, // 8 hours
        INFO: 1440, // 24 hours
      };

      const alarmType = (report.alarmType || "INFO").toUpperCase();
      const expectedMinutes = slaThresholds[alarmType] || 240;
      const isWithinSLA = actualMinutes <= expectedMinutes;

      return {
        status: isWithinSLA ? "✅ Within SLA" : "❌ Out of SLA",
        color: isWithinSLA ? "#059669" : "#dc2626",
      };
    };

    // Generate Outlook-compatible summary cards HTML using table layout
    const summaryCards = `
                  <!-- Summary Cards Row -->
                  <tr>
                    <td align="left" valign="top" style="padding: 0 24px 24px 24px;">
                      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
                        <tr>
                          <!-- Total Tickets Card -->
                          <td align="left" valign="top" width="150" style="width: 150px; background-color: #3b82f6; padding: 14px 16px; color: white;">
                            <div style="font-size: 12px; margin-bottom: 6px; color: #e0e7ff;">Total Tickets</div>
                            <div style="font-size: 22px; font-weight: bold; line-height: 1.2;">${totalTickets}</div>
                          </td>
                          <!-- In Progress Card -->
                          <td align="left" valign="top" width="150" style="width: 150px; background-color: #0ea5e9; padding: 14px 16px; color: white;">
                            <div style="font-size: 12px; margin-bottom: 6px; color: #bae6fd;">In Progress</div>
                            <div style="font-size: 22px; font-weight: bold; line-height: 1.2;">${inProgressTickets}</div>
                          </td>
                          <!-- Carry-Overs Card -->
                          <td align="left" valign="top" width="150" style="width: 150px; background-color: #f97316; padding: 14px 16px; color: white;">
                            <div style="font-size: 12px; margin-bottom: 6px; color: #fed7aa;">Carry-Overs</div>
                            <div style="font-size: 22px; font-weight: bold; line-height: 1.2;">${
                              metrics.totalCarryOverOutages || 0
                            }</div>
                          </td>
                          <!-- Resolved Today Card -->
                          <td align="left" valign="top" width="150" style="width: 150px; background-color: #10b981; padding: 14px 16px; color: white;">
                            <div style="font-size: 12px; margin-bottom: 6px; color: #a7f3d0;">Resolved Today</div>
                            <div style="font-size: 22px; font-weight: bold; line-height: 1.2;">${
                              metrics.totalResolvedToday || 0
                            }</div>
                          </td>
                          <!-- MTTR Card -->
                          <td align="left" valign="top" width="150" style="width: 150px; background-color: #8b5cf6; padding: 14px 16px; color: white;">
                            <div style="font-size: 12px; margin-bottom: 6px; color: #c4b5fd;">MTTR</div>
                            <div style="font-size: 22px; font-weight: bold; line-height: 1.2;">${mttrFormatted}</div>
                          </td>
                          <!-- SLA Compliance Card -->
                          <td align="left" valign="top" width="150" style="width: 150px; background-color: #ec4899; padding: 14px 16px; color: white;">
                            <div style="font-size: 12px; margin-bottom: 6px; color: #f9a8d4;">SLA Compliance</div>
                            <div style="font-size: 22px; font-weight: bold; line-height: 1.2;">${slaCompliance}%</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
    `;

    // Debug: Log the first few reports to check alarm type
    console.log("Sample reports with alarm types:");
    ongoingOutages.slice(0, 3).forEach((report, i) => {
      console.log(`Report ${i + 1}:`, {
        _id: report._id,
        siteCode: report.siteCode,
        salarmType: report.salarmType,
        alarmType: report.alarmType,
        alarmId: report.alarmId,
      });
    });

    // Generate ongoing outages table
    const ongoingRows = ongoingOutages
      .map((report) => {
        const duration = formatDuration(report.occurrenceTime, new Date());

        return `
        <tr style="border-bottom: 1px solid #e5e7eb;" key="ongoing-${
          report._id
        }">
          <td style="padding: 12px 16px; color: #1f2937; font-size: 13px;">${
            report.siteCode || "N/A"
          }</td>
          <td style="padding: 12px 16px; color: #1f2937; font-size: 13px;">${
            report.siteName ||
            report.siteNo ||
            report.alarmId?.siteName ||
            "N/A"
          }</td>
          <td style="padding: 12px 16px; color: #1f2937; font-size: 13px;">${
            report.region || "N/A"
          }</td>
          <td style="padding: 12px 16px; color: #1f2937; font-weight: 600; color: ${
            report.alarmType === "CRITICAL"
              ? "#dc2626"
              : report.alarmType === "MAJOR"
              ? "#d97706"
              : "#b45309"
          }; font-size: 13px;">
            ${report.alarmType || "N/A"}
          </td>
          <td style="padding: 12px 16px; color: #6b7280; font-size: 13px;">${formatDateTime(
            report.occurrenceTime
          )}</td>
          <td style="padding: 12px 16px; color: #6b7280; font-size: 13px;">${duration}</td>
          <td style="padding: 12px 16px; color: #6b7280; font-size: 13px;">${
            report.expectedRestorationTime
              ? formatDateTime(report.expectedRestorationTime)
              : "N/A"
          }</td>
          <td style="padding: 12px 16px; color: #6b7280; font-size: 13px;">${
            report.mandatoryRestorationTime
              ? formatDateTime(report.mandatoryRestorationTime)
              : "N/A"
          }</td>
          <td style="padding: 12px 16px; font-size: 13px;">
            <span style="display: inline-flex; align-items: center; padding: 4px 12px; border-radius: 9999px; background-color: ${
              report.status === "In Progress" ? "#fef3c7" : "#e0f2fe"
            }; color: ${
          report.status === "In Progress" ? "#92400e" : "#075985"
        }; font-size: 12px; font-weight: 600;">
              ${report.status || "Open"}
            </span>
          </td>
          <td style="padding: 12px 16px; color: #1f2937; font-size: 13px;">${
            report.rootCause || "N/A"
          }</td>
          <td style="padding: 12px 16px; color: #1f2937; font-size: 13px;">${
            report.subrootCause || "N/A"
          }</td>
          <td style="padding: 12px 16px; color: #1f2937; font-size: 13px;">${
            report.supervisor || "N/A"
          }</td>
          <td style="padding: 12px 16px; color: #1f2937; font-size: 13px;">${
            report.username || "N/A"
          }</td>
      `;
      })
      .join("");

    // Generate Outlook-compatible region breakdown HTML using table layout
    const regionBreakdown =
      ticketsPerRegion.length > 0
        ? `
                  <!-- Region Breakdown -->
                  <tr>
                    <td align="left" valign="top" style="padding: 0 24px 24px 24px;">
                      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff; border: 1px solid #e5e7eb;">
                        <tr>
                          <td align="left" valign="top" style="padding: 12px 16px; background-color: #1e40af; color: white; font-weight: bold; font-size: 16px;">
                            Tickets Per Region (${
                              ticketsPerRegion.length
                            } regions)
                          </td>
                        </tr>
                        <tr>
                          <td align="left" valign="top">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                              <thead>
                                <tr style="background-color: #f3f4f6;">
                                  <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: #374151; border-bottom: 1px solid #e5e7eb; font-size: 14px;">Region</th>
                                  <th align="right" valign="top" style="padding: 12px 16px; font-weight: bold; color: #374151; border-bottom: 1px solid #e5e7eb; font-size: 14px;">Total</th>
                                  <th align="right" valign="top" style="padding: 12px 16px; font-weight: bold; color: #374151; border-bottom: 1px solid #e5e7eb; font-size: 14px;">In Progress</th>
                                  <th align="right" valign="top" style="padding: 12px 16px; font-weight: bold; color: #374151; border-bottom: 1px solid #e5e7eb; font-size: 14px;">Resolved</th>
                                  <th align="right" valign="top" style="padding: 12px 16px; font-weight: bold; color: #374151; border-bottom: 1px solid #e5e7eb; font-size: 14px;">Critical</th>
                                  <th align="right" valign="top" style="padding: 12px 16px; font-weight: bold; color: #374151; border-bottom: 1px solid #e5e7eb; font-size: 14px;">Major</th>
                                  <th align="right" valign="top" style="padding: 12px 16px; font-weight: bold; color: #374151; border-bottom: 1px solid #e5e7eb; font-size: 14px;">Minor</th>
                                </tr>
                              </thead>
                              <tbody>
                                ${ticketsPerRegion
                                  .map((region) => {
                                    const totalResolved =
                                      region.resolvedTickets || 0;
                                    const inProgress =
                                      region.inProgressTickets || 0;
                                    const criticalAlarms =
                                      region.criticalAlarms || 0;
                                    const majorAlarms = region.majorAlarms || 0;
                                    const minorAlarms = region.minorAlarms || 0;
                                    return `
                                  <tr>
                                    <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #1f2937; font-size: 14px;">${
                                      region.region || "Unknown"
                                    }</td>
                                    <td align="right" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #1f2937; font-size: 14px;">${
                                      region.totalTickets || 0
                                    }</td>
                                    <td align="right" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #d97706; font-size: 14px;">${inProgress}</td>
                                    <td align="right" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #059669; font-size: 14px;">${totalResolved}</td>
                                    <td align="right" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #dc2626; font-weight: bold; font-size: 14px;">${criticalAlarms}</td>
                                    <td align="right" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #d97706; font-weight: bold; font-size: 14px;">${majorAlarms}</td>
                                    <td align="right" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #b45309; font-size: 14px;">${minorAlarms}</td>
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
        : "";

    return `
      <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
      <html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
        <head>
          <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <meta name="x-apple-disable-message-reformatting">
          <title>NOC Alert System - Hourly Outage Report</title>
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
                      <h1 style="margin: 0 0 8px 0; padding: 0; color: #1a365d; font-size: 24px; font-weight: bold;">NOC Hourly Outage Report</h1>
                      <p style="margin: 0; color: #4a5568; font-size: 14px;">Generated on ${formatDateTime(
                        new Date()
                      )} • ${metrics.totalCarryOverOutages || 0} Carry-Over • ${
      metrics.totalResolvedToday || 0
    } Resolved</p>
                    </td>
                  </tr>

                  <!-- Summary Cards -->
                  ${summaryCards}

                  <!-- Carry-Over Outages -->
                  ${
                    carryOverOutages.length > 0
                      ? `
                  <tr>
                    <td align="left" valign="top" style="padding: 0 24px 24px 24px;">
                      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border: 2px solid #f97316; background-color: #fff7ed;">
                        <tr>
                          <td align="left" valign="top" style="padding: 16px; background-color: #ffedd5; border-bottom: 1px solid #fed7aa;">
                            <h2 style="margin: 0; font-size: 16px; font-weight: bold; color: #111827;">Carry-Over Outages (${
                              carryOverOutages.length
                            })</h2>
                          </td>
                        </tr>
                        <tr>
                          <td align="left" valign="top">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                              <thead>
                                <tr style="background-color: #f9fafb;">
                                  <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: #4b5563; border-bottom: 1px solid #e5e7eb; font-size: 12px;">Site Code</th>
                                  <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: #4b5563; border-bottom: 1px solid #e5e7eb; font-size: 12px;">Site Name</th>
                                  <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: #4b5563; border-bottom: 1px solid #e5e7eb; font-size: 12px;">Region</th>
                                  <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: #4b5563; border-bottom: 1px solid #e5e7eb; font-size: 12px;">Alarm Type</th>
                                  <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: #4b5563; border-bottom: 1px solid #e5e7eb; font-size: 12px;">Occurrence Time</th>
                                  <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: #4b5563; border-bottom: 1px solid #e5e7eb; font-size: 12px;">Days Open</th>
                                  <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: #4b5563; border-bottom: 1px solid #e5e7eb; font-size: 12px;">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                ${carryOverOutages
                                  .map((report) => {
                                    const daysOpen = Math.floor(
                                      (new Date() -
                                        new Date(report.occurrenceTime)) /
                                        (1000 * 60 * 60 * 24)
                                    );
                                    return `
                                    <tr>
                                      <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #1f2937;">${
                                        report.siteCode || "N/A"
                                      }</td>
                                      <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #1f2937;">${
                                        report.siteName ||
                                        report.siteNo ||
                                        report.alarmId?.siteName ||
                                        "N/A"
                                      }</td>
                                      <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #1f2937;">${
                                        report.region || "N/A"
                                      }</td>
                                      <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #1f2937; font-weight: bold; color: ${
                                        report.alarmType === "CRITICAL"
                                          ? "#dc2626"
                                          : report.alarmType === "MAJOR"
                                          ? "#d97706"
                                          : "#b45309"
                                      };">${report.alarmType || "N/A"}</td>
                                      <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">${formatDateTime(
                                        report.occurrenceTime
                                      )}</td>
                                      <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">${daysOpen} day${
                                      daysOpen !== 1 ? "s" : ""
                                    }</td>
                                      <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px;">
                                        <span style="background-color: #fef3c7; color: #92400e; padding: 4px 8px; font-size: 12px; font-weight: bold;">Carry-Over</span>
                                      </td>
                                    </tr>
                                  `;
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
                                <tr style="background-color: #f9fafb;">
                                  <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: #4b5563; border-bottom: 1px solid #e5e7eb; font-size: 12px;">Site Code</th>
                                  <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: #4b5563; border-bottom: 1px solid #e5e7eb; font-size: 12px;">Site Name</th>
                                  <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: #4b5563; border-bottom: 1px solid #e5e7eb; font-size: 12px;">Region</th>
                                  <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: #4b5563; border-bottom: 1px solid #e5e7eb; font-size: 12px;">Alarm Type</th>
                                  <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: #4b5563; border-bottom: 1px solid #e5e7eb; font-size: 12px;">Occurrence Time</th>
                                  <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: #4b5563; border-bottom: 1px solid #e5e7eb; font-size: 12px;">Duration</th>
                                  <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: #4b5563; border-bottom: 1px solid #e5e7eb; font-size: 12px;">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                ${todayOngoingOutages
                                  .map((report) => {
                                    const duration = formatDuration(
                                      report.occurrenceTime,
                                      new Date()
                                    );
                                    return `
                                    <tr>
                                      <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #1f2937;">${
                                        report.siteCode || "N/A"
                                      }</td>
                                      <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #1f2937;">${
                                        report.siteName ||
                                        report.siteNo ||
                                        report.alarmId?.siteName ||
                                        "N/A"
                                      }</td>
                                      <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #1f2937;">${
                                        report.region || "N/A"
                                      }</td>
                                      <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #1f2937; font-weight: bold; color: ${
                                        report.alarmType === "CRITICAL"
                                          ? "#dc2626"
                                          : report.alarmType === "MAJOR"
                                          ? "#d97706"
                                          : "#b45309"
                                      };">${report.alarmType || "N/A"}</td>
                                      <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">${formatDateTime(
                                        report.occurrenceTime
                                      )}</td>
                                      <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">${duration}</td>
                                      <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px;">
                                        <span style="background-color: ${
                                          report.status === "In Progress"
                                            ? "#fef3c7"
                                            : "#e0f2fe"
                                        }; color: ${
                                      report.status === "In Progress"
                                        ? "#92400e"
                                        : "#075985"
                                    }; padding: 4px 8px; font-size: 12px; font-weight: bold;">${
                                      report.status
                                    }</span>
                                      </td>
                                    </tr>
                                  `;
                                  })
                                  .join("")}
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
                            <h2 style="margin: 0; font-size: 16px; font-weight: bold; color: #111827;">Resolved Today (${
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
                                <tr style="background-color: #f9fafb;">
                                  <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: #4b5563; border-bottom: 1px solid #e5e7eb; font-size: 12px;">Site Code</th>
                                  <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: #4b5563; border-bottom: 1px solid #e5e7eb; font-size: 12px;">Site Name</th>
                                  <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: #4b5563; border-bottom: 1px solid #e5e7eb; font-size: 12px;">Region</th>
                                  <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: #4b5563; border-bottom: 1px solid #e5e7eb; font-size: 12px;">Alarm Type</th>
                                  <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: #4b5563; border-bottom: 1px solid #e5e7eb; font-size: 12px;">Duration</th>
                                  <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: #4b5563; border-bottom: 1px solid #e5e7eb; font-size: 12px;">Status</th>
                                  <th align="left" valign="top" style="padding: 12px 16px; font-weight: bold; color: #4b5563; border-bottom: 1px solid #e5e7eb; font-size: 12px;">SLA Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                ${resolvedToday
                                  .map((report) => {
                                    const duration = formatDuration(
                                      report.occurrenceTime,
                                      report.resolutionTime
                                    );
                                    const slaStatus = getSlaStatus(report);
                                    return `
                                    <tr>
                                      <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #1f2937;">${
                                        report.siteCode || "N/A"
                                      }</td>
                                      <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #1f2937;">${
                                        report.siteName ||
                                        report.siteNo ||
                                        report.alarmId?.siteName ||
                                        "N/A"
                                      }</td>
                                      <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #1f2937;">${
                                        report.region || "N/A"
                                      }</td>
                                      <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #1f2937; font-weight: bold; color: ${
                                        report.alarmType === "CRITICAL"
                                          ? "#dc2626"
                                          : report.alarmType === "MAJOR"
                                          ? "#d97706"
                                          : "#b45309"
                                      };">${report.alarmType || "N/A"}</td>
                                      <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">${duration}</td>
                                      <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px;">
                                        <span style="background-color: #dcfce7; color: #166534; padding: 4px 8px; font-size: 12px; font-weight: bold;">Resolved</span>
                                      </td>
                                      <td align="left" valign="top" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: ${
                                        slaStatus.color
                                      }; font-weight: bold;">
                                        ${slaStatus.status}
                                      </td>
                                    </tr>
                                  `;
                                  })
                                  .join("")}
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

                  <!-- Region Breakdown -->
                  ${
                    ticketsPerRegion && ticketsPerRegion.length > 0
                      ? regionBreakdown
                      : ""
                  }

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
      </html>
    `;
  }

  /**
   * Get outage reports for a specific hour
   */
  async getOutageReportsForHour(hourDate) {
    try {
      const startOfHour = new Date(
        hourDate.getFullYear(),
        hourDate.getMonth(),
        hourDate.getDate(),
        hourDate.getHours()
      );
      const endOfHour = new Date(startOfHour.getTime() + 60 * 60 * 1000);

      return await OutageReport.find({
        reportHour: {
          $gte: startOfHour,
          $lt: endOfHour,
        },
      }).sort({ occurrenceTime: -1 });
    } catch (error) {
      console.error("Error fetching outage reports for hour:", error);
      throw error;
    }
  }

  /**
   * Calculate SLA status based on expected and actual resolution times
   */
  calculateSlaStatus(occurrenceTime, resolutionTime, expectedResolutionHours) {
    if (!resolutionTime || !expectedResolutionHours) {
      console.log("⚠️  Missing data for SLA calculation:", {
        hasResolutionTime: !!resolutionTime,
        hasExpectedHours: !!expectedResolutionHours,
        resolutionTime,
        expectedResolutionHours,
      });
      return null;
    }

    const expectedResolutionMs = expectedResolutionHours * 60 * 60 * 1000;
    const actualResolutionMs =
      new Date(resolutionTime) - new Date(occurrenceTime);

    console.log("📊 SLA Calculation:", {
      occurrenceTime: new Date(occurrenceTime).toISOString(),
      resolutionTime: new Date(resolutionTime).toISOString(),
      expectedResolutionHours,
      expectedResolutionMs,
      actualResolutionMs: actualResolutionMs / (60 * 60 * 1000) + " hours",
      isWithinSLA:
        actualResolutionMs <= expectedResolutionMs ? "within" : "out",
    });

    return actualResolutionMs <= expectedResolutionMs ? "within" : "out";
  }

  /**
   * Update outage report
   */
  async updateOutageReport(id, updateData, userId) {
    try {
      // Get the outage report before update
      const existingReport = await OutageReport.findById(id);
      if (!existingReport) {
        throw new Error("Outage report not found");
      }

      // Check if this is a status update to Resolved or Closed
      const isNewlyResolved =
        ["Resolved", "Closed"].includes(updateData.status) &&
        !["Resolved", "Closed"].includes(existingReport.status);

      if (isNewlyResolved) {
        console.log("🔍 Processing resolution for report:", {
          reportId: id,
          currentStatus: existingReport.status,
          newStatus: updateData.status,
          updateData: JSON.stringify(updateData, null, 2),
        });

        // Ensure resolution time is set (default to now if not provided)
        if (!updateData.resolutionTime) {
          updateData.resolutionTime = new Date();
          console.log(
            `⏰ Set default resolution time: ${updateData.resolutionTime}`
          );
        }

        // Ensure expected resolution hours are set based on alarm type if not provided
        if (
          !updateData.expectedResolutionHours &&
          !existingReport.expectedResolutionHours
        ) {
          const slaThresholds = {
            critical: 4, // 4 hours for critical
            major: 8, // 8 hours for major
            minor: 24, // 24 hours for minor
          };

          const alarmType = (existingReport.alarmType || "").toLowerCase();
          updateData.expectedResolutionHours = slaThresholds[alarmType] || 24;
          console.log(
            `⏱️  Set default expected resolution hours: ${updateData.expectedResolutionHours} (based on alarm type: ${alarmType})`
          );
        }

        // Preserve mandatoryRestorationTime on resolution. Do not auto-clear.
        // MRT is a user-entered SLA deadline and should remain stored for reporting.

        // Calculate SLA status
        try {
          const resolutionTime =
            updateData.resolutionTime || existingReport.resolutionTime;
          const expectedHours =
            updateData.expectedResolutionHours ||
            existingReport.expectedResolutionHours;

          if (
            existingReport.occurrenceTime &&
            resolutionTime &&
            expectedHours
          ) {
            updateData.slaStatus = this.calculateSlaStatus(
              existingReport.occurrenceTime,
              resolutionTime,
              expectedHours
            );
            console.log(
              `📊 SLA Status calculated: ${updateData.slaStatus} for report ${id}`
            );
          } else {
            console.warn("⚠️  Missing data for SLA calculation:", {
              hasOccurrenceTime: !!existingReport.occurrenceTime,
              hasResolutionTime: !!resolutionTime,
              hasExpectedHours: !!expectedHours,
            });
          }
        } catch (slaError) {
          console.error("❌ Error calculating SLA status:", slaError);
        }
      }

      const update = {
        ...updateData,
        updatedBy: userId,
        updatedAt: new Date(),
      };

      const updatedReport = await OutageReport.findByIdAndUpdate(id, update, {
        new: true,
        runValidators: true,
      });

      // If status is changed to "Closed", close associated ticket
      if (
        updateData.status === "Closed" &&
        existingReport.status !== "Closed"
      ) {
        console.log(`🔒 Outage ${id} closed - closing associated ticket...`);

        try {
          // Close the ticket associated with this outage's alarm
          if (existingReport.alarmId) {
            const Ticket = (await import("../models/Ticket.js")).default;

            const ticket = await Ticket.findOne({
              alarmId: existingReport.alarmId,
            });
            if (ticket && ticket.status !== "Closed") {
              ticket.status = "Closed";
              ticket.closedBy = userId;
              ticket.closedAt = new Date();
              ticket.updatedBy = userId;
              ticket.updatedAt = new Date();
              await ticket.save();

              console.log(
                `✅ Ticket ${ticket._id} automatically closed with outage ${id}`
              );
            }
          }
        } catch (ticketError) {
          console.error(
            "⚠️  Error closing associated ticket:",
            ticketError.message
          );
          // Don't fail the outage update if ticket closure fails
        }
      }

      return updatedReport;
    } catch (error) {
      console.error("Error updating outage report:", error);
      throw error;
    }
  }
}

export const outageReportService = new OutageReportService();
