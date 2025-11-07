import nodemailer from 'nodemailer';
import Ticket from '../models/Ticket.js';

class EmailService {
  constructor() {
    console.log('🔧 Initializing Email Service...');
    this.transporter = null;
    this.isConfigured = false;
    this.init();
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
        critical: '🔴 CRITICAL',
        major: '🟠 MAJOR', 
        minor: '🟡 MINOR',
        warning: '🔵 WARNING'
      };

      const severity = alarmData.severity?.toLowerCase() || 'warning';
      const severityLabel = severityLabels[severity] || '⚪ UNKNOWN';

      const htmlContent = this.generateAlarmEmailHTML(alarmData, severityLabel);
      const textContent = this.generateAlarmEmailText(alarmData, severityLabel);

      const mailOptions = {
        from: process.env.FROM_EMAIL,
        to: recipients.join(', '),
        subject: `🚨 ${severityLabel} Alarm - ${alarmData.siteName || 'Unknown Site'}`,
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
    const color = severityColors[severity] || severityColors.warning;

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>🚨 NOC Alert - ${alarmData.siteName || 'Unknown Site'}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #1e293b 0%, #334155 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { padding: 30px; }
        .alarm-card { background-color: #f8fafc; border-left: 4px solid ${color}; padding: 20px; margin: 20px 0; border-radius: 4px; }
        .severity-badge { display: inline-block; background-color: ${color}; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; font-size: 14px; }
        .details { margin: 15px 0; }
        .details dt { font-weight: bold; color: #374151; margin-top: 10px; }
        .details dd { margin: 5px 0 15px 0; color: #6b7280; font-family: monospace; }
        .footer { background-color: #f8fafc; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; color: #6b7280; font-size: 14px; }
        .timestamp { color: #9ca3af; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚨 NOC Alert System</h1>
            <p>New alarm detected requiring immediate attention</p>
        </div>

        <div class="content">
            <div class="alarm-card">
                <div style="margin-bottom: 15px;">
                    <span class="severity-badge">${severityLabel}</span>
                </div>

                <h2>Alarm Details</h2>

                <dl class="details">
                    <dt>Site Name:</dt>
                    <dd>${alarmData.siteName || 'Unknown'}</dd>

                    ${alarmData.siteId ? `<dt>Site ID:</dt><dd>${alarmData.siteId}</dd>` : ''}

                    <dt>Alarm Type:</dt>
                    <dd>${alarmData.alarmType || 'Unknown'}</dd>

                    <dt>Description:</dt>
                    <dd>${alarmData.description || 'No description provided'}</dd>

                    ${alarmData.source ? `<dt>Source:</dt><dd>${alarmData.source}</dd>` : ''}

                    <dt>Timestamp:</dt>
                    <dd>${(alarmData.timestamp ? new Date(alarmData.timestamp) : new Date()).toLocaleString()}</dd>
                </dl>
            </div>

            <div style="background-color: #eff6ff; padding: 15px; border-radius: 4px; margin-top: 20px;">
                <p style="margin: 0; color: #1e40af;">
                    ⚡ This is an automated alert from the NOC Alert System.
                    Please investigate and resolve this alarm as soon as possible.
                </p>
            </div>
        </div>

        <div class="footer">
            <p>NOC Alert System - Automated Monitoring</p>
            <p class="timestamp">Generated on ${new Date().toLocaleString()}</p>
        </div>
    </div>
</body>
</html>
    `;
  }

  generateAlarmEmailText(alarmData, severityLabel) {
    return `
🚨 NOC ALERT - ${alarmData.siteName || 'Unknown Site'}

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

// Create and export singleton instance
export const emailService = new EmailService();
export default EmailService;