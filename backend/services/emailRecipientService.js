import EmailConfig from '../models/EmailConfig.js';

class EmailRecipientService {
  static async getEmailRecipients(type) {
    try {
      // Get email configuration from database
      const config = await EmailConfig.getConfig();
      
      switch (type) {
        case "dailyReports":
          return config.dailyReports;
        case "hourlyReports":
          return config.hourlyReports;
        case "immediateAlerts":
          return config.immediateAlerts;
        default:
          // Fallback to environment variables for backward compatibility
          switch (type) {
            case "daily":
              return process.env.DAILY_REPORT_EMAILS ? 
                process.env.DAILY_REPORT_EMAILS.split(',').map(email => email.trim()) : [];
            case "hourly":
              return process.env.HOURLY_REPORT_EMAILS ? 
                process.env.HOURLY_REPORT_EMAILS.split(',').map(email => email.trim()) : 
                (process.env.NOC_EMAILS ? process.env.NOC_EMAILS.split(',').map(email => email.trim()) : []);
            case "alarms":
              return process.env.NOC_ALERTS_EMAIL ? 
                process.env.NOC_ALERTS_EMAIL.split(',').map(email => email.trim()) : 
                (process.env.NOC_EMAILS ? process.env.NOC_EMAILS.split(',').map(email => email.trim()) : []);
            default:
              return [];
          }
      }
    } catch (error) {
      console.error('Error getting email recipients:', error);
      // Fallback to environment variables if database fails
      switch (type) {
        case "dailyReports":
        case "daily":
          return process.env.DAILY_REPORT_EMAILS ? 
            process.env.DAILY_REPORT_EMAILS.split(',').map(email => email.trim()) : [];
        case "hourlyReports":
        case "hourly":
          return process.env.HOURLY_REPORT_EMAILS ? 
            process.env.HOURLY_REPORT_EMAILS.split(',').map(email => email.trim()) : 
            (process.env.NOC_EMAILS ? process.env.NOC_EMAILS.split(',').map(email => email.trim()) : []);
        case "immediateAlerts":
        case "alarms":
          return process.env.NOC_ALERTS_EMAIL ? 
            process.env.NOC_ALERTS_EMAIL.split(',').map(email => email.trim()) : 
            (process.env.NOC_EMAILS ? process.env.NOC_EMAILS.split(',').map(email => email.trim()) : []);
        default:
          return [];
      }
    }
  }
}

export default EmailRecipientService;
