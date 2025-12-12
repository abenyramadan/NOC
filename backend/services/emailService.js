import nodemailer from 'nodemailer';
import Ticket from '../models/Ticket.js';

class EmailService {
  constructor() {
    console.log('🔧 Creating Email Service instance...');
    this.transporter = null;
    this.isConfigured = false;
    // Don't initialize in constructor
  }

  init() {
    try {
      // Debug log all environment variables
      console.log('🔍 Environment variables in email service:');
      console.log('   - SMTP_HOST:', process.env.SMTP_HOST || 'Not set (using Gmail service)');
      console.log('   - SMTP_PORT:', process.env.SMTP_PORT || 'Not set (using Gmail service)');
      console.log('   - SMTP_USER:', process.env.SMTP_USER ? 'Set' : 'NOT SET');
      console.log('   - SMTP_PASS:', process.env.SMTP_PASS ? 'Set (' + process.env.SMTP_PASS.length + ' chars)' : 'NOT SET');
      console.log('   - FROM_EMAIL:', process.env.FROM_EMAIL || 'NOT SET');
      console.log('   - NOC_ALERTS_EMAIL:', process.env.NOC_ALERTS_EMAIL || 'NOT SET');

      // Check all required environment variables
      const requiredEnvVars = ['SMTP_USER', 'SMTP_PASS', 'FROM_EMAIL'];
      const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
      
      if (missingVars.length > 0) {
        console.warn('⚠️ Missing required environment variables:', missingVars);
        return;
      }

      console.log('✅ All required email environment variables are present');
      console.log('🔧 Creating Nodemailer transporter...');

      // Use Gmail service which handles configuration automatically
      const config = {
        service: 'gmail',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        },
        // Additional options for better reliability
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        rateDelta: 1000,
        rateLimit: 5
      };

      this.transporter = nodemailer.createTransport(config);
      this.isConfigured = true;

      // Verify connection
      this.verifyConnection();

    } catch (error) {
      console.error('❌ Email service initialization failed:', error.message);
      this.isConfigured = false;
    }
  }

  async verifyConnection() {
    if (!this.transporter) {
      console.error('❌ Cannot verify SMTP connection: Transporter not initialized');
      return false;
    }

    try {
      await this.transporter.verify();
      console.log('✅ SMTP Server is ready to take our messages');
      return true;
    } catch (error) {
      console.error('❌ SMTP Connection error:', error.message);
      
      // Provide helpful error messages
      if (error.code === 'EAUTH') {
        console.error('🔐 Authentication failed. Please check:');
        console.error('   1. Your Gmail username and password are correct');
        console.error('   2. You have enabled 2-Step Verification');
        console.error('   3. You are using an App Password (not your regular password)');
        console.error('   4. The App Password is 16 characters long');
      } else if (error.code === 'ECONNECTION') {
        console.error('🌐 Connection failed. Please check:');
        console.error('   1. Your internet connection');
        console.error('   2. Firewall settings blocking port 587');
        console.error('   3. Gmail SMTP server accessibility');
      }
      
      this.isConfigured = false;
      return false;
    }
  }

  async sendAlarmNotification(alarmData, userId = null) {
    // Check if email service is properly configured
    if (!this.isConfigured || !this.transporter) {
      console.error('❌ Email service not configured. Cannot send alarm notification.');
      throw new Error('Email service not configured - missing or invalid SMTP credentials');
    }

    try {
      console.log(`📧 Preparing to send email for alarm: ${alarmData.alarmId || 'unknown'}`);
      
      // Get recipients from alarm data or fallback to environment variable
      let recipients = alarmData.recipients;
      if (!recipients || recipients.length === 0) {
        recipients = process.env.NOC_EMAILS ? process.env.NOC_EMAILS.split(',') : [];
      }
      
      if (recipients.length === 0) {
        throw new Error('No email recipients configured');
      }

      console.log(`📨 Sending email to: ${recipients.join(', ')}`);

      const severityLabels = {
        critical: 'CRITICAL',
        major: 'MAJOR', 
        minor: 'MINOR',
        warning: 'WARNING'
      };

      const severity = alarmData.severity?.toLowerCase() || 'warning';
      const severityLabel = severityLabels[severity] || '⚪ UNKNOWN';

      const htmlContent = this.generateAlarmEmailHTML(alarmData, severityLabel);
      const textContent = this.generateAlarmEmailText(alarmData, severityLabel);

      const mailOptions = {
        from: process.env.FROM_EMAIL,
        to: recipients.join(', '),
        subject: `${severityLabel} Alarm - ${alarmData.siteName || 'Unknown Site'}`,
        text: textContent,
        html: htmlContent,
        // Add headers for better email deliverability
        headers: {
          'X-Priority': '1',
          'X-MSMail-Priority': 'High',
          'Importance': 'high'
        }
      };

      console.log('📤 Sending email...');
      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Email sent successfully! Message ID: ${result.messageId}`);
      console.log(`✅ Alarm notification sent to ${recipients.length} recipients`);

      // Create ticket record for the email notification
      if (alarmData.alarmId && userId) {
        try {
          await Ticket.create({
            alarmId: alarmData.alarmId,
            siteName: alarmData.siteName,
            siteId: alarmData.siteId,
            severity: alarmData.severity,
            alarmType: alarmData.alarmType,
            description: alarmData.description,
            recipients: recipients,
            emailSentAt: new Date(),
            status: 'sent',
            emailSubject: mailOptions.subject,
            createdBy: userId,
            messageId: result.messageId
          });
          console.log('✅ Ticket record created for email notification');
        } catch (ticketError) {
          console.error('❌ Failed to create ticket record:', ticketError.message);
          // Don't throw - ticket creation failure shouldn't break email sending
        }
      }

      return result;

    } catch (error) {
      console.error(`❌ Failed to send alarm notification:`, error.message);
      
      // Create failed ticket record
      if (alarmData.alarmId && userId) {
        try {
          await Ticket.create({
            alarmId: alarmData.alarmId,
            siteName: alarmData.siteName,
            siteId: alarmData.siteId,
            severity: alarmData.severity,
            alarmType: alarmData.alarmType,
            description: alarmData.description,
            recipients: alarmData.recipients || [],
            emailSentAt: new Date(),
            status: 'failed',
            emailSubject: `🚨 ${(alarmData.severity || 'UNKNOWN').toUpperCase()} Alarm - ${alarmData.siteName || 'Unknown Site'}`,
            createdBy: userId,
            error: error.message
          });
        } catch (ticketError) {
          console.error('❌ Failed to create failed ticket record:', ticketError.message);
        }
      }

      throw error;
    }
  }

  generateAlarmEmailHTML(alarmData, severityLabel) {
    const severityColors = {
      critical: '#dc2626',
      major: '#ea580c', 
      minor: '#ca8a04',
      warning: '#2563eb'
    };

    const severity = alarmData.severity?.toLowerCase() || 'warning';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NOC Alert - ${alarmData.siteName || 'Unknown Site'}</title>
  <style>
    /* Base */
    body { margin: 0; padding: 0; background: #f8fafc; color: #111827; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.5; }
    .container { width: 100%; max-width: 100%; margin: 0; padding: 14px; }
    .card { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 2px rgba(16,24,40,0.04); }
    /* Header */
    .bar { height: 3px; background: #e5e7eb; }
    .header { padding: 12px 14px 6px 14px; }
    .title { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: .2px; }
    .subtle { color: #6b7280; font-size: 12px; margin-top: 2px; }
    /* Badge */
    .badge { display: inline-block; background: #ffffff; color: #111827; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 700; border: 1px solid #d1d5db; }
    /* Content */
    .section { padding: 10px 14px; }
    .section + .section { border-top: 1px solid #f3f4f6; }
    .kvs { width: 100%; border-collapse: collapse; }
    .kvs td { padding: 3px 0; font-size: 14px; vertical-align: top; }
    .kvs td.key { color: #6b7280; width: 38%; }
    .kvs td.val { color: #111827; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; color: #374151; }
    /* Footer */
    .footer { padding: 10px 14px; background: #f9fafb; color: #6b7280; font-size: 11px; text-align: center; }
    /* Responsive */
    @media (max-width: 480px) {
      body { font-size: 16px !important; line-height: 1.5 !important; }
      .title { font-size: 18px !important; }
      .subtle { font-size: 13px !important; }
      .kvs td { font-size: 14px !important; }
      .badge { font-size: 12px !important; padding: 4px 10px !important; }
      .section, .header, .footer { padding-left: 10px; padding-right: 10px; }
      .kvs td.key { width: 42%; font-weight: 600 !important; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="bar"></div>
      <div class="header">
        <div class="badge">${severityLabel}</div>
        <h1 class="title" style="margin-top: 6px;">${alarmData.siteName || 'Unknown Site'}</h1>
        <div class="subtle">${new Date(alarmData.timestamp).toLocaleString()}</div>
      </div>
      <div class="section">
        <table class="kvs" role="presentation" cellspacing="0" cellpadding="0">
          <tr>
            <td class="key">Site ID</td>
            <td class="val mono">${alarmData.siteId || 'N/A'}</td>
          </tr>
          <tr>
            <td class="key">Severity</td>
            <td class="val">${(alarmData.severity || 'N/A').toString().toUpperCase()}</td>
          </tr>
          <tr>
            <td class="key">Alarm Type</td>
            <td class="val">${alarmData.alarmType || 'N/A'}</td>
          </tr>
          <tr>
            <td class="key">Description</td>
            <td class="val">${alarmData.description || 'N/A'}</td>
          </tr>
          <tr>
            <td class="key">Source</td>
            <td class="val">${alarmData.source || 'N/A'}</td>
          </tr>
        </table>
      </div>
      <div class="footer">
        NOC Alert • Automated notification
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  generateAlarmEmailText(alarmData, severityLabel) {
    return `
NOC ALERT - ${alarmData.siteName || 'Unknown Site'}

SEVERITY: ${severityLabel}
SITE: ${alarmData.siteName || 'Unknown'} ${alarmData.siteId ? `(${alarmData.siteId})` : ''}
TYPE: ${alarmData.alarmType || 'Unknown'}
DESCRIPTION: ${alarmData.description || 'No description provided'}
${alarmData.source ? `SOURCE: ${alarmData.source}` : ''}
TIMESTAMP: ${(alarmData.timestamp ? new Date(alarmData.timestamp) : new Date()).toLocaleString()}

This is an automated alert from the NOC Alert System.
Please investigate and resolve this alarm as soon as possible.
    `;
  }

  // Keep your existing sendAlarmResolvedNotification method
  async sendAlarmResolvedNotification(alarmData) {
    if (!this.isConfigured || !this.transporter) {
      console.error('❌ Email service not configured. Cannot send alarm resolution notification.');
      throw new Error('Email service not configured');
    }

    try {
      // ... your existing resolution email code
    } catch (error) {
      console.error('❌ Failed to send alarm resolution notification:', error);
      throw error;
    }
  }

  async sendEmail(emailData) {
    // Check if email service is properly configured
    if (!this.isConfigured || !this.transporter) {
      console.error('❌ Email service not configured. Cannot send email.');
      throw new Error('Email service not configured - missing or invalid SMTP credentials');
    }

    try {
      console.log(`📧 Preparing to send email: ${emailData.subject}`);

      // Get recipients from email data or fallback to environment variable
      let recipients = emailData.to || emailData.recipients;
      if (!recipients) {
        recipients = process.env.NOC_EMAILS ? process.env.NOC_EMAILS.split(',') : [];
      }

      if (!Array.isArray(recipients)) {
        recipients = [recipients];
      }

      if (recipients.length === 0) {
        throw new Error('No email recipients configured');
      }

      console.log(`📨 Sending email to: ${recipients.join(', ')}`);

      const mailOptions = {
        from: process.env.FROM_EMAIL,
        to: recipients.join(', '),
        subject: emailData.subject,
        text: emailData.text || emailData.subject,
        html: emailData.html,
        // Add headers for better email deliverability
        headers: {
          'X-Priority': '1',
          'X-MSMail-Priority': 'High',
          'Importance': 'high'
        }
      };

      console.log('📤 Sending email...');
      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Email sent successfully! Message ID: ${result.messageId}`);
      console.log(`✅ Email sent to ${recipients.length} recipients`);

      return result;

    } catch (error) {
      console.error(`❌ Failed to send email:`, error.message);

      throw error;
    }
  }

  // Test method to verify email configuration
  async testConfiguration() {
    if (!this.isConfigured) {
      return { success: false, message: 'Email service not configured' };
    }

    try {
      const testEmail = process.env.SMTP_USER;
      const mailOptions = {
        from: process.env.FROM_EMAIL,
        to: testEmail,
        subject: 'NOC Alert System - Test Email',
        text: 'This is a test email from NOC Alert System. If you receive this, email configuration is working correctly.',
        html: '<h1>NOC Alert System Test</h1><p>This is a test email. If you receive this, email configuration is working correctly.</p>'
      };

      const result = await this.transporter.sendMail(mailOptions);
      return { 
        success: true, 
        message: 'Test email sent successfully', 
        messageId: result.messageId 
      };
    } catch (error) {
      return { 
        success: false, 
        message: error.message,
        code: error.code 
      };
    }
  }

  getStatus() {
    return {
      isConfigured: this.isConfigured,
      hasTransporter: !!this.transporter,
      smtpUser: process.env.SMTP_USER ? 'Set' : 'Not set',
      smtpPass: process.env.SMTP_PASS ? `Set (${process.env.SMTP_PASS.length} chars)` : 'Not set',
      fromEmail: process.env.FROM_EMAIL || 'Not set',
      nocEmails: process.env.NOC_EMAILS || 'Not set'
    };
  }
}

// Singleton instance
let _instance = null;

// Get or create singleton instance
export const getEmailService = () => {
  if (!_instance) {
    _instance = new EmailService();
  }
  // Ensure we have a valid configuration
  if (!_instance.isConfigured) {
    _instance.init();
  }
  return _instance;
};

// For backward compatibility
export const emailService = getEmailService();
export default EmailService;