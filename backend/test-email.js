#!/usr/bin/env node

/**
 * Daily Report Email Test Script
 * Sends a test daily report email with sample data
 */

import { emailService } from './services/emailService.js';
import { dailyReportService } from './services/dailyReportService.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testDailyReportEmail() {
  console.log('📊 Testing Daily Report Email...\n');

  try {
    // Test configuration
    console.log('📧 Email Configuration:');
    console.log(`   Host: ${process.env.SMTP_HOST}`);
    console.log(`   Port: ${process.env.SMTP_PORT}`);
    console.log(`   User: ${process.env.SMTP_USER}`);
    console.log(`   From: ${process.env.FROM_EMAIL}`);
    console.log(`   Recipients: ${process.env.NOC_ALERTS_EMAIL || 'Not set, using default'}\n`);

    // Create test data that matches the daily report structure
    const testData = {
      summary: {
        totalReports: 42,
        totalResolved: 35,
        totalInProgress: 7,
        totalOpen: 0,
        mttr: 85.5
      },
      alarmsByRootCause: [
        { rootCause: 'Power Outage', count: 12 },
        { rootCause: 'Fiber Cut', count: 8 },
        { rootCause: 'Hardware Failure', count: 6 },
        { rootCause: 'Configuration Error', count: 5 },
        { rootCause: 'Unknown', count: 11 }
      ],
      ticketsPerRegion: [
        { region: 'North', totalTickets: 15, resolvedTickets: 12, inProgressTickets: 3 },
        { region: 'South', totalTickets: 12, resolvedTickets: 10, inProgressTickets: 2 },
        { region: 'East', totalTickets: 8, resolvedTickets: 7, inProgressTickets: 1 },
        { region: 'West', totalTickets: 7, resolvedTickets: 6, inProgressTickets: 1 }
      ],
      allReports: [
        // Sample reports for SLA calculations
        {
          region: 'North',
          status: 'Resolved',
          rootCause: 'Power Outage',
          occurrenceTime: new Date(Date.now() - 3600000 * 3), // 3 hours ago
          resolutionTime: new Date(Date.now() - 3600000 * 2),  // 2 hours ago
          expectedResolutionHours: 4
        },
        {
          region: 'South',
          status: 'Resolved',
          rootCause: 'Fiber Cut',
          occurrenceTime: new Date(Date.now() - 3600000 * 5), // 5 hours ago
          resolutionTime: new Date(Date.now() - 3600000 * 3),  // 3 hours ago
          expectedResolutionHours: 4
        }
      ]
    };

    console.log('📤 Sending test daily report email...');
    
    // Generate the email content
    const { html, text } = dailyReportService.generateDailyReportEmail(testData, new Date());
    
    // Determine recipient
    const recipient = process.env.NOC_ALERTS_EMAIL || 'abenyramada@gmail.com';
    
    // Send the email
    await emailService.sendEmail({
      to: recipient,
      subject: `[TEST] NOC Daily Report - ${new Date().toLocaleDateString()}`,
      html,
      text
    });

    console.log(`✅ Test daily report email sent successfully to: ${recipient}`);
    console.log('\n📋 Next Steps:');
    console.log('1. Check your email inbox for the daily report');
    console.log('2. Compare with the web interface to ensure consistency');
    console.log('3. Check spam folder if not received');
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Verify SMTP settings in .env file');
    console.log('2. Check SMTP server logs for errors');
    console.log('3. For Gmail: Use App Password, not regular password');
    console.log('4. Check firewall/network restrictions');

  } catch (error) {
    console.error('❌ Daily report email test failed:', error.message);
    console.error('Stack:', error.stack);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check SMTP settings in .env file');
    console.log('2. Verify SMTP server is accessible');
    console.log('3. Check error message above for specific issues');
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testDailyReportEmail();
}

export { testDailyReportEmail };
