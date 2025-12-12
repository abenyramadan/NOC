import mongoose from 'mongoose';
import Alarm from '../models/Alarm.js';
import Site from '../models/Site.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables FIRST
const envPath = path.join(__dirname, '../.env');
console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });

console.log('Environment loaded:');
console.log('SMTP_USER:', process.env.SMTP_USER ? 'Set' : 'NOT SET');
console.log('NOC_EMAILS:', process.env.NOC_EMAILS);

// Now import emailService after environment is loaded
const { emailService } = await import('../services/emailService.js');

const MONGODB_URI = process.env.MONGODB_URI;

async function createTestAlarmWithEmail() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get 1 random site for our test alarm
    const sites = await Site.aggregate([{ $sample: { size: 1 } }]);

    if (sites.length === 0) {
      console.log('📭 Need at least 1 site in database. Creating a sample site...');

      const sampleSite = {
        siteId: 'SITE-999',
        siteName: 'Test Site',
        region: 'Test Region',
        state: 'Test State',
        city: 'Test City'
      };

      await Site.create(sampleSite);
      console.log('✅ Created sample site');
      sites.push(sampleSite);
    }

    const site = sites[0];
    console.log(`📍 Selected site: ${site.siteName} (${site.siteId})`);

    // Create test alarm data
    const alarmData = {
      siteId: site.siteId,
      siteName: site.siteName,
      severity: 'critical',
      alarmType: 'test-connectivity',
      description: 'Test alarm to verify email recipients - all 4 recipients should receive this',
      source: 'test-script-with-email',
      timestamp: new Date(),
      status: 'active'
    };

    console.log('\n🚨 Creating test alarm and sending email notification...');

    // Create the alarm in database
    const alarm = new Alarm(alarmData);
    await alarm.save();

    console.log(`✅ Created alarm: ${alarm._id}`);

    // Send email notification (this should create a ticket with all recipients)
    const recipients = process.env.NOC_ALERTS_EMAIL ? process.env.NOC_ALERTS_EMAIL.split(',') : [];
    console.log(`📧 Sending email to ${recipients.length} recipients:`, recipients);

    if (recipients.length > 0) {
      await emailService.sendAlarmNotification({
        alarmId: alarm._id,
        siteName: alarm.siteName,
        siteId: alarm.siteId,
        severity: alarm.severity,
        alarmType: alarm.alarmType,
        description: alarm.description,
        source: alarm.source,
        timestamp: alarm.timestamp,
        recipients: recipients
      }, '68f5efc94d31f53091850191'); // Valid user ID for ticket creation

      console.log('✅ Email sent and ticket should be created with all recipients');
    } else {
      console.log('❌ No recipients configured');
    }

    console.log('\n🎉 Test alarm with email created successfully!');
    console.log('📋 Check the Ticket Management page to see all 4 recipients');

  } catch (error) {
    console.error('❌ Error creating test alarm with email:', error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the script
createTestAlarmWithEmail();
