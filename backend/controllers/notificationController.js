import NotificationRule from '../models/NotificationRule.js';
import { emailService } from '../services/emailService.js';
import { logAudit } from '../services/auditLogger.js';

// Get all notification rules
export const getNotificationRules = async (req, res) => {
  try {
    const rules = await NotificationRule.find({}).sort({ createdAt: -1 });
    res.json(rules);
  } catch (error) {
    console.error('Error fetching notification rules:', error);
    res.status(500).json({ message: 'Error fetching notification rules', error: error.message });
  }
};

// Create a new notification rule
export const createNotificationRule = async (req, res) => {
  try {
    const { name, severity, recipients, methods, enabled = true } = req.body;
    
    const newRule = new NotificationRule({
      name,
      severity,
      recipients: Array.isArray(recipients) ? recipients : [recipients],
      methods: Array.isArray(methods) ? methods : [methods],
      enabled,
      createdBy: req.user.id
    });

    const savedRule = await newRule.save();
    await logAudit(req, {
      action: 'notification_rule:create',
      target: savedRule._id.toString(),
      details: { name, severity, recipients, methods, enabled },
      status: 'success'
    });
    res.status(201).json(savedRule);
  } catch (error) {
    console.error('Error creating notification rule:', error);
    try {
      await logAudit(req, {
        action: 'notification_rule:create',
        target: 'notification_rule',
        details: error.message,
        status: 'failed'
      });
    } catch (_) {}
    res.status(400).json({ message: 'Error creating notification rule', error: error.message });
  }
};

// Update a notification rule
export const updateNotificationRule = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, severity, recipients, methods, enabled } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (severity) updateData.severity = severity;
    if (recipients) updateData.recipients = Array.isArray(recipients) ? recipients : [recipients];
    if (methods) updateData.methods = Array.isArray(methods) ? methods : [methods];
    if (enabled !== undefined) updateData.enabled = enabled;

    const updatedRule = await NotificationRule.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedRule) {
      await logAudit(req, {
        action: 'notification_rule:update',
        target: id,
        details: 'Rule not found',
        status: 'failed'
      });
      return res.status(404).json({ message: 'Notification rule not found' });
    }

    await logAudit(req, {
      action: 'notification_rule:update',
      target: id,
      details: updateData,
      status: 'success'
    });
    res.json(updatedRule);
  } catch (error) {
    console.error('Error updating notification rule:', error);
    try {
      await logAudit(req, {
        action: 'notification_rule:update',
        target: req.params?.id || 'notification_rule',
        details: error.message,
        status: 'failed'
      });
    } catch (_) {}
    res.status(400).json({ message: 'Error updating notification rule', error: error.message });
  }
};

// Delete a notification rule
export const deleteNotificationRule = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedRule = await NotificationRule.findByIdAndDelete(id);
    
    if (!deletedRule) {
      await logAudit(req, {
        action: 'notification_rule:delete',
        target: id,
        details: 'Rule not found',
        status: 'failed'
      });
      return res.status(404).json({ message: 'Notification rule not found' });
    }
    
    await logAudit(req, {
      action: 'notification_rule:delete',
      target: id,
      details: { name: deletedRule.name },
      status: 'success'
    });
    res.json({ message: 'Notification rule deleted successfully' });
  } catch (error) {
    console.error('Error deleting notification rule:', error);
    try {
      await logAudit(req, {
        action: 'notification_rule:delete',
        target: req.params?.id || 'notification_rule',
        details: error.message,
        status: 'failed'
      });
    } catch (_) {}
    res.status(500).json({ message: 'Error deleting notification rule', error: error.message });
  }
};

// Toggle notification rule status
export const toggleNotificationRule = async (req, res) => {
  try {
    const { id } = req.params;
    const rule = await NotificationRule.findById(id);
    
    if (!rule) {
      await logAudit(req, {
        action: 'notification_rule:toggle',
        target: id,
        details: 'Rule not found',
        status: 'failed'
      });
      return res.status(404).json({ message: 'Notification rule not found' });
    }
    
    rule.enabled = !rule.enabled;
    await rule.save();
    
    await logAudit(req, {
      action: 'notification_rule:toggle',
      target: id,
      details: { enabled: rule.enabled },
      status: 'success'
    });
    res.json(rule);
  } catch (error) {
    console.error('Error toggling notification rule:', error);
    try {
      await logAudit(req, {
        action: 'notification_rule:toggle',
        target: req.params?.id || 'notification_rule',
        details: error.message,
        status: 'failed'
      });
    } catch (_) {}
    res.status(500).json({ message: 'Error toggling notification rule', error: error.message });
  }
};

// Get notification settings (SMTP, SMS, etc.)
export const getNotificationSettings = async (req, res) => {
  try {
    const settings = {
      email: {
        enabled: process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true',
        smtpHost: process.env.SMTP_HOST,
        smtpPort: process.env.SMTP_PORT,
        fromEmail: process.env.FROM_EMAIL,
        smtpUser: process.env.SMTP_USER,
        // Note: We don't return the password for security reasons
      },
      sms: {
        enabled: process.env.SMS_NOTIFICATIONS_ENABLED === 'true',
        // Add other SMS settings as needed
      }
    };
    
    res.json(settings);
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    res.status(500).json({ message: 'Error fetching notification settings', error: error.message });
  }
};

// Update notification settings
export const updateNotificationSettings = async (req, res) => {
  try {
    const { email, sms } = req.body;
    
    // In a real application, you would update these in your configuration system
    // For this example, we'll just return the updated settings
    
    const updatedSettings = {
      email: {
        enabled: email?.enabled || false,
        smtpHost: email?.smtpHost || process.env.SMTP_HOST,
        smtpPort: email?.smtpPort || process.env.SMTP_PORT,
        fromEmail: email?.fromEmail || process.env.FROM_EMAIL,
        smtpUser: email?.smtpUser || process.env.SMTP_USER,
        // Note: Password would be updated separately for security
      },
      sms: {
        enabled: sms?.enabled || false,
        // Update other SMS settings as needed
      }
    };
    
    // In a real application, you would save these settings to your configuration system
    // For now, we'll just return the updated settings
    await logAudit(req, {
      action: 'notification_settings:update',
      target: 'notification_settings',
      details: updatedSettings,
      status: 'success'
    });
    res.json(updatedSettings);
  } catch (error) {
    console.error('Error updating notification settings:', error);
    try {
      await logAudit(req, {
        action: 'notification_settings:update',
        target: 'notification_settings',
        details: error.message,
        status: 'failed'
      });
    } catch (_) {}
    res.status(500).json({ message: 'Error updating notification settings', error: error.message });
  }
};
