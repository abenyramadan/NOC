import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Load environment variables
dotenv.config();

import { emailService } from './services/emailService.js';
import EmailConfig from './models/EmailConfig.js';

async function testEmailConfig() {
  try {
    console.log('📧 Testing email service with Email Management config...');
    
    // Get email configuration from database
    const config = await EmailConfig.getConfig();
    console.log('📋 Email config from database:', {
      dailyReports: config.dailyReports,
      hourlyReports: config.hourlyReports,
      immediateAlerts: config.immediateAlerts
    });
    
    // Test sending email to each type of recipient
    const testRecipients = {
      dailyReports: config.dailyReports?.[0] || 'test-daily@example.com',
      hourlyReports: config.hourlyReports?.[0] || 'test-hourly@example.com',
      immediateAlerts: config.immediateAlerts?.[0] || 'test-immediate@example.com'
    };
    
    console.log('📨 Testing email to:', testRecipients);
    
    // Send test email to each recipient type
    for (const [type, recipient] of Object.entries(testRecipients)) {
      try {
        const result = await emailService.sendMail({
          to: recipient,
          subject: `Test Email - ${type} Alerts`,
          text: `This is a test email for ${type} alerts from Email Management configuration.`,
          html: `<h1>Test Email - ${type} Alerts</h1><p>This is a test email for ${type} alerts from Email Management configuration.</p>`
        });
        
        console.log(`✅ Email sent to ${recipient}:`, result.messageId);
      } catch (error) {
        console.error(`❌ Failed to send to ${recipient}:`, error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testEmailConfig();
