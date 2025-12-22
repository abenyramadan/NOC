import nodemailer from "nodemailer";
import Ticket from "../models/Ticket.js";
import EmailConfig from "../models/EmailConfig.js";

class EmailService {
  constructor() {
    console.log("🔧 Creating Email Service instance...");
    this.transporter = null;
    this.isConfigured = false;
    this.smtpUser = null;
    this.smtpPass = null;
    this.smtpHost = null;
    this.smtpPort = null;
    this.smtpSecure = null;
    this.fromEmail = null;
    this.recipients = {
      dailyReports: [],
      hourlyReports: [],
      immediateAlerts: []
    };
  }

  async refreshConfig() {
    const configDoc = await EmailConfig.getConfig().catch(() => null);

    if (configDoc) {
      this.recipients = {
        dailyReports: configDoc?.dailyReports || [],
        hourlyReports: configDoc?.hourlyReports || [],
        immediateAlerts: configDoc?.immediateAlerts || []
      };

      const nextSmtpUser = configDoc?.smtpUser || process.env.SMTP_USER;
      const nextSmtpPass = configDoc?.smtpPass || process.env.SMTP_PASS;
      const nextFromEmail = configDoc?.fromEmail || process.env.FROM_EMAIL || 'noc@example.com';

      const nextSmtpHost = configDoc?.smtpHost || process.env.SMTP_HOST || 'smtp.gmail.com';
      const nextSmtpPort = configDoc?.smtpPort || parseInt(process.env.SMTP_PORT || '587', 10);
      const nextSmtpSecure =
        typeof configDoc?.smtpSecure === 'boolean'
          ? configDoc.smtpSecure
          : process.env.SMTP_SECURE === 'true';

      const connChanged =
        nextSmtpUser !== this.smtpUser ||
        nextSmtpPass !== this.smtpPass ||
        nextSmtpHost !== this.smtpHost ||
        nextSmtpPort !== this.smtpPort ||
        nextSmtpSecure !== this.smtpSecure;

      this.smtpUser = nextSmtpUser;
      this.smtpPass = nextSmtpPass;
      this.smtpHost = nextSmtpHost;
      this.smtpPort = nextSmtpPort;
      this.smtpSecure = nextSmtpSecure;
      this.fromEmail = nextFromEmail;

      this.isConfigured = !!(this.smtpUser && this.smtpPass && this.fromEmail);

      if (!this.isConfigured) {
        this.transporter = null;
        return;
      }

      if (!this.transporter || connChanged) {
        this.transporter = nodemailer.createTransport({
          host: this.smtpHost,
          port: this.smtpPort,
          secure: this.smtpSecure,
          auth: {
            user: this.smtpUser,
            pass: this.smtpPass
          },
          pool: true,
          maxConnections: 5,
          maxMessages: 100,
          rateDelta: 1000,
          rateLimit: 5
        });
      }
    }
  }

  async init() {
    try {
      // Always try to get config from database first
      const configDoc = await EmailConfig.getConfig().catch(() => null);
      
      // Initialize recipients from database regardless of SMTP config completeness
      this.recipients = {
        dailyReports: configDoc?.dailyReports || [],
        hourlyReports: configDoc?.hourlyReports || [],
        immediateAlerts: configDoc?.immediateAlerts || []
      };
      
      if (configDoc?.smtpUser && configDoc?.smtpPass && configDoc?.fromEmail) {
        // Use complete database configuration
        this.smtpUser = configDoc.smtpUser;
        this.smtpPass = configDoc.smtpPass;
        this.fromEmail = configDoc.fromEmail;
        this.smtpHost = configDoc.smtpHost || process.env.SMTP_HOST || 'smtp.gmail.com';
        this.smtpPort = configDoc.smtpPort || parseInt(process.env.SMTP_PORT || '587', 10);
        this.smtpSecure =
          typeof configDoc.smtpSecure === 'boolean'
            ? configDoc.smtpSecure
            : process.env.SMTP_SECURE === 'true';
        console.log("✅ Loaded complete email configuration from database");
      } else {
        // Fall back to environment variables for SMTP settings only
        this.smtpUser = process.env.SMTP_USER;
        this.smtpPass = process.env.SMTP_PASS;
        this.fromEmail = process.env.FROM_EMAIL || 'noc@example.com';
        this.smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
        this.smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
        this.smtpSecure = process.env.SMTP_SECURE === 'true';
        console.log("ℹ️ Using environment variables for SMTP settings, but keeping email recipients from database");
      }

      // Validate configuration
      this.isConfigured = !!(this.smtpUser && this.smtpPass && this.fromEmail);
      if (!this.isConfigured) {
        throw new Error("Missing required SMTP configuration");
      }

      // Create transporter
      this.transporter = nodemailer.createTransport({
        host: this.smtpHost,
        port: this.smtpPort,
        secure: this.smtpSecure,
        auth: {
          user: this.smtpUser,
          pass: this.smtpPass
        },
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        rateDelta: 1000,
        rateLimit: 5
      });

      console.log("✅ Email service initialized successfully");
      return this;
    } catch (error) {
      console.error("❌ Email service initialization failed:", error.message);
      this.isConfigured = false;
      throw error;
    }
  }

  async sendAlarmNotification(alarm, userId = null) {
    await this.refreshConfig();

    if (!this.isConfigured || !this.transporter) {
      const error = new Error("Email service not configured - missing or invalid SMTP credentials");
      console.error("❌", error.message);
      throw error;
    }

    try {
      // Get recipients in order of priority:
      // 1. Recipients attached to the alarm
      // 2. Immediate alerts from email service config
      // 3. Fallback to default
      let recipients = [];
      
      if (alarm.recipients && alarm.recipients.length > 0) {
        const alarmRecipients = Array.isArray(alarm.recipients) ? alarm.recipients : [alarm.recipients];
        const normalized = alarmRecipients.map((e) => String(e).trim().toLowerCase()).filter(Boolean);
        const filtered = normalized.filter((e) => e !== 'noc@example.com');

        if (filtered.length > 0) {
          recipients = filtered;
          console.log(`📨 Using recipients from alarm: ${recipients.join(', ')}`);
        }
      }

      if (recipients.length === 0 && this.recipients?.immediateAlerts?.length > 0) {
        recipients = this.recipients.immediateAlerts;
        console.log(`📨 Using recipients from immediateAlerts: ${recipients.join(', ')}`);
      }

      if (recipients.length === 0) {
        recipients = process.env.NOC_ALERTS_EMAIL?.split(',').map(e => e.trim()).filter(Boolean) || ['noc@example.com'];
        console.log(`📨 Using default recipients: ${recipients.join(', ')}`);
      }

      // Ensure we have valid email addresses
      recipients = recipients.filter(email => {
        const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        if (!isValid) {
          console.warn(`⚠️ Invalid email address in recipients: ${email}`);
        }
        return isValid;
      });

      if (recipients.length === 0) {
        console.warn('⚠️ No valid email recipients found, using default');
        recipients = ['noc@example.com'];
      }

      const severityLabels = {
        critical: "CRITICAL",
        major: "MAJOR",
        minor: "MINOR",
        warning: "WARNING"
      };

      const severity = alarm.severity?.toLowerCase() || "warning";
      const severityLabel = severityLabels[severity] || "UNKNOWN";

      const mailOptions = {
        from: this.fromEmail,
        to: recipients.join(', '),
        subject: `🚨 ${severityLabel} Alarm - ${alarm.siteName || 'Unknown Site'}`,
        text: this.generateAlarmEmailText(alarm, severityLabel),
        html: this.generateAlarmEmailHTML(alarm, severityLabel),
        headers: {
          "X-Priority": "1",
          "X-MSMail-Priority": "High",
          "Importance": "high"
        }
      };

      console.log(`📤 Sending alarm notification to: ${recipients.join(', ')}`);
      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Alarm notification sent successfully! Message ID: ${result.messageId}`);

      // Create ticket record if alarm has an ID
      if (alarm.id && userId) {
        try {
          await Ticket.create({
            alarmId: alarm.id,
            siteName: alarm.siteName,
            siteId: alarm.siteId,
            severity: alarm.severity,
            alarmType: alarm.alarmType,
            description: alarm.description,
            recipients: recipients,
            emailSentAt: new Date(),
            status: "sent",
            emailSubject: mailOptions.subject,
            emailBody: mailOptions.html,
            createdBy: userId
          });
        } catch (ticketError) {
          console.error("Failed to create ticket for email notification:", ticketError);
        }
      }

      return {
        success: true,
        message: "Alarm notification sent successfully",
        messageId: result.messageId,
        recipients: recipients
      };
    } catch (error) {
      console.error("❌ Failed to send alarm notification:", error);
      throw error;
    }
  }

  generateAlarmEmailText(alarm, severityLabel) {
    return `
      Alarm Type: ${alarm.alarmType || 'N/A'}
      Site: ${alarm.siteName || 'Unknown'} (${alarm.siteId || 'N/A'})
      Severity: ${severityLabel}
      Description: ${alarm.description || 'No description provided'}
      Time: ${new Date(alarm.timestamp || Date.now()).toLocaleString()}
      
      Please investigate this issue immediately.
    `;
  }

  generateAlarmEmailHTML(alarm, severityLabel) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d32f2f;">🚨 ${severityLabel} ALARM</h2>
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
          <p><strong>Site:</strong> ${alarm.siteName || 'Unknown'} (${alarm.siteId || 'N/A'})</p>
          <p><strong>Alarm Type:</strong> ${alarm.alarmType || 'N/A'}</p>
          <p><strong>Severity:</strong> <span style="color: ${this.getSeverityColor(alarm.severity)}; font-weight: bold;">${severityLabel}</span></p>
          <p><strong>Time:</strong> ${new Date(alarm.timestamp || Date.now()).toLocaleString()}</p>
        </div>
        <div style="background-color: #fff; padding: 15px; border: 1px solid #ddd; border-radius: 5px;">
          <h3>Description:</h3>
          <p>${alarm.description || 'No description provided'}</p>
        </div>
        <p style="margin-top: 20px; color: #666; font-size: 0.9em;">
          This is an automated message. Please do not reply to this email.
        </p>
      </div>
    `;
  }

  getSeverityColor(severity) {
    const colors = {
      critical: '#d32f2f',
      major: '#ff9800',
      minor: '#ffc107',
      warning: '#4caf50'
    };
    return colors[severity?.toLowerCase()] || '#9e9e9e';
  }

  getStatus() {
    return {
      isConfigured: this.isConfigured,
      hasTransporter: !!this.transporter,
      smtpUser: this.smtpUser ? 'Configured' : 'Not configured',
      fromEmail: this.fromEmail || 'Not configured',
      recipients: {
        dailyReports: this.recipients?.dailyReports?.length || 0,
        hourlyReports: this.recipients?.hourlyReports?.length || 0,
        immediateAlerts: this.recipients?.immediateAlerts?.length || 0
      }
    };
  }

  async testConnection(config) {
    const transporter = nodemailer.createTransport({
      host: config?.host,
      port: Number(config?.port),
      secure: Boolean(config?.secure),
      auth: {
        user: config?.auth?.user,
        pass: config?.auth?.pass,
      },
    });

    return new Promise((resolve, reject) => {
      transporter.verify((error, success) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(success);
      });
    });
  }

  async sendEmail(emailData) {
    try {
      await this.refreshConfig();

      if (!this.isConfigured || !this.transporter) {
        throw new Error("Email service not configured - missing or invalid SMTP credentials");
      }

      // Determine recipients based on email type
      const emailType = emailData.type || 'immediateAlerts';
      const recipients = this.recipients[emailType]?.length 
        ? this.recipients[emailType] 
        : this.recipients.immediateAlerts || ['noc@example.com'];

      const mailOptions = {
        from: this.fromEmail,
        to: recipients.join(', '),
        subject: emailData.subject || 'NOC Alert',
        text: emailData.text || '',
        html: emailData.html || ''
      };

      console.log(`📤 Sending ${emailType} email to: ${recipients.join(', ')}`);
      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Email sent successfully! Message ID: ${result.messageId}`);

      return {
        success: true,
        message: "Email sent successfully",
        messageId: result.messageId,
        recipients: recipients
      };
    } catch (error) {
      console.error("❌ Failed to send email:", error);
      throw error;
    }
  }
}

// Singleton instance
let _instance = null;

// Get or create singleton instance
export const getEmailService = async () => {
  if (!_instance) {
    _instance = new EmailService();
    await _instance.init();
  }
  return _instance;
};

export default EmailService;
