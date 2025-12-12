import express from 'express';
import EmailConfig from '../models/EmailConfig.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { logAudit } from '../services/auditLogger.js';

const router = express.Router();

// Get email configuration
router.get('/config', authenticate, async (req, res) => {
  try {
    const config = await EmailConfig.getConfig();
    res.json({
      dailyReports: config.dailyReports,
      hourlyReports: config.hourlyReports,
      immediateAlerts: config.immediateAlerts
    });
  } catch (error) {
    console.error('Error fetching email config:', error);
    res.status(500).json({ error: 'Failed to fetch email configuration' });
  }
});

// Update email configuration
router.put('/config', authenticate, async (req, res) => {
  try {
    const { dailyReports, hourlyReports, immediateAlerts } = req.body;
    const userId = req.user.id;

    // Validate input
    const updateData = {
      dailyReports: Array.isArray(dailyReports) ? dailyReports.filter(email => typeof email === 'string' && email.trim()) : [],
      hourlyReports: Array.isArray(hourlyReports) ? hourlyReports.filter(email => typeof email === 'string' && email.trim()) : [],
      immediateAlerts: Array.isArray(immediateAlerts) ? immediateAlerts.filter(email => typeof email === 'string' && email.trim()) : []
    };

    // Normalize emails (lowercase, trim)
    updateData.dailyReports = updateData.dailyReports.map(email => email.trim().toLowerCase());
    updateData.hourlyReports = updateData.hourlyReports.map(email => email.trim().toLowerCase());
    updateData.immediateAlerts = updateData.immediateAlerts.map(email => email.trim().toLowerCase());

    const config = await EmailConfig.updateConfig(updateData, userId);

    // Log the action
    await logAudit(req, {
      action: 'UPDATE_EMAIL_CONFIG',
      target: 'email_configuration',
      details: `Updated email configuration: ${JSON.stringify(updateData)}`
    });

    res.json({
      dailyReports: config.dailyReports,
      hourlyReports: config.hourlyReports,
      immediateAlerts: config.immediateAlerts
    });
  } catch (error) {
    console.error('Error updating email config:', error);
    res.status(500).json({ error: 'Failed to update email configuration' });
  }
});

// Test email configuration
router.post('/test', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { type, testEmail } = req.body;
    const userId = req.user.id;

    if (!type || !['dailyReports', 'hourlyReports', 'immediateAlerts'].includes(type)) {
      return res.status(400).json({ error: 'Invalid email type specified' });
    }

    // Get email configuration
    const config = await EmailConfig.getConfig();
    const recipients = config[type];

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No recipients configured for this email type' });
    }

    // Import email service
    const { emailService } = await import('../services/emailService.js');

    // Create test email content based on type
    let subject, htmlContent, textContent;

    switch (type) {
      case 'dailyReports':
        subject = 'Test: Daily Network Performance Report';
        htmlContent = `
          <h2>Test Daily Report Email</h2>
          <p>This is a test email to verify the daily report email configuration.</p>
          <p>If you receive this email, the configuration is working correctly.</p>
          <p>Recipients: ${recipients.join(', ')}</p>
        `;
        textContent = `Test Daily Report Email\n\nThis is a test email to verify the daily report email configuration.\nIf you receive this email, the configuration is working correctly.\n\nRecipients: ${recipients.join(', ')}`;
        break;
      case 'hourlyReports':
        subject = 'Test: Hourly Outage Report';
        htmlContent = `
          <h2>Test Hourly Report Email</h2>
          <p>This is a test email to verify the hourly report email configuration.</p>
          <p>If you receive this email, the configuration is working correctly.</p>
          <p>Recipients: ${recipients.join(', ')}</p>
        `;
        textContent = `Test Hourly Report Email\n\nThis is a test email to verify the hourly report email configuration.\nIf you receive this email, the configuration is working correctly.\n\nRecipients: ${recipients.join(', ')}`;
        break;
      case 'immediateAlerts':
        subject = 'Test: Immediate Alarm Alert';
        htmlContent = `
          <h2>Test Immediate Alert Email</h2>
          <p>This is a test email to verify the immediate alert email configuration.</p>
          <p>If you receive this email, the configuration is working correctly.</p>
          <p>Recipients: ${recipients.join(', ')}</p>
        `;
        textContent = `Test Immediate Alert Email\n\nThis is a test email to verify the immediate alert email configuration.\nIf you receive this email, the configuration is working correctly.\n\nRecipients: ${recipients.join(', ')}`;
        break;
    }

    // Send test email
    const result = await emailService.sendEmail({
      to: testEmail || recipients,
      subject,
      text: textContent,
      html: htmlContent
    });

    // Log the test action
    await logAudit(req, {
      action: 'TEST_EMAIL_CONFIG',
      target: 'email_configuration',
      details: `Tested ${type} email configuration. Recipients: ${recipients.join(', ')}`
    });

    res.json({ 
      success: true, 
      message: 'Test email sent successfully',
      messageId: result.messageId,
      recipientsSent: recipients.length
    });
  } catch (error) {
    console.error('Error testing email config:', error);
    res.status(500).json({ error: 'Failed to send test email: ' + error.message });
  }
});

// Get email statistics
router.get('/stats', authenticate, authorize('admin'), async (req, res) => {
  try {
    const config = await EmailConfig.getConfig();
    
    const stats = {
      totalRecipients: {
        dailyReports: config.dailyReports.length,
        hourlyReports: config.hourlyReports.length,
        immediateAlerts: config.immediateAlerts.length
      },
      uniqueEmails: {
        total: new Set([
          ...config.dailyReports,
          ...config.hourlyReports,
          ...config.immediateAlerts
        ]).size,
        list: Array.from(new Set([
          ...config.dailyReports,
          ...config.hourlyReports,
          ...config.immediateAlerts
        ]))
      },
      lastUpdated: config.updatedAt,
      updatedBy: config.updatedBy
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching email stats:', error);
    res.status(500).json({ error: 'Failed to fetch email statistics' });
  }
});

export default router;
