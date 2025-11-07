import mongoose from 'mongoose';
import Alarm from '../models/Alarm.js';
import Site from '../models/Site.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function createTestAlarms() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get 3 random sites for our test alarms
    const sites = await Site.aggregate([{ $sample: { size: 3 } }]);

    if (sites.length < 3) {
      console.log('📭 Need at least 3 sites in database. Creating more sites...');

      // Create additional sample sites if needed
      const additionalSites = [
        { siteId: 'SITE-006', siteName: 'Metro Center', region: 'Central', state: 'Abuja', city: 'Abuja' },
        { siteId: 'SITE-007', siteName: 'Rivers Edge', region: 'South', state: 'Rivers', city: 'Port Harcourt' },
        { siteId: 'SITE-008', siteName: 'Plateau Peak', region: 'North', state: 'Plateau', city: 'Jos' }
      ];

      await Site.insertMany(additionalSites);
      console.log('✅ Created additional sample sites');

      // Get 3 sites again
      const updatedSites = await Site.aggregate([{ $sample: { size: 3 } }]);
      sites.push(...updatedSites.slice(0, 3 - sites.length));
    }

    console.log('📍 Selected sites for test alarms:');
    sites.forEach((site, index) => {
      console.log(`${index + 1}. Site ID: ${site.siteId}, Name: ${site.siteName}, Region: ${site.region}`);
    });

    // Create test alarms with different severities
    const testAlarms = [
      {
        siteId: sites[0].siteId,
        siteName: sites[0].siteName,
        severity: 'critical',
        alarmType: 'connectivity',
        description: 'Critical connectivity loss detected - complete network outage',
        source: 'test-script',
        timestamp: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago
        status: 'active'
      },
      {
        siteId: sites[1].siteId,
        siteName: sites[1].siteName,
        severity: 'major',
        alarmType: 'power',
        description: 'Major power fluctuation detected - backup systems engaged',
        source: 'test-script',
        timestamp: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
        status: 'active'
      },
      {
        siteId: sites[2].siteId,
        siteName: sites[2].siteName,
        severity: 'minor',
        alarmType: 'temperature',
        description: 'Minor temperature increase detected in equipment room',
        source: 'test-script',
        timestamp: new Date(Date.now() - 8 * 60 * 1000), // 8 minutes ago
        status: 'active'
      }
    ];

    console.log('\n🚨 Creating test alarms...');

    for (const alarmData of testAlarms) {
      const alarm = new Alarm(alarmData);
      await alarm.save();

      console.log(`✅ Created ${alarmData.severity.toUpperCase()} alarm for ${alarmData.siteName} (${alarmData.siteId})`);
      console.log(`   📝 Description: ${alarmData.description}`);
      console.log(`   🕐 Timestamp: ${alarmData.timestamp.toLocaleString()}`);
      console.log('');
    }

    console.log('🎉 Test alarms created successfully!');
    console.log('\n📋 Summary:');
    console.log('- Critical alarm for connectivity loss');
    console.log('- Major alarm for power fluctuation');
    console.log('- Minor alarm for temperature increase');
    console.log('\n⏰ These alarms will trigger the hourly outage report system in 1 minute');

  } catch (error) {
    console.error('❌ Error creating test alarms:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the script
createTestAlarms();
