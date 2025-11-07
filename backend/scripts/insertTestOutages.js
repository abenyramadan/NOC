import mongoose from 'mongoose';
import dotenv from 'dotenv';
import OutageReport from '../models/OutageReport.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/noc-alert-system';

// Sample data
const regions = ['LAKES', 'UNITY', 'WARRAP', 'JONGLEI', 'UPPER NILE'];
const alarmTypes = ['CRITICAL', 'MAJOR', 'MINOR'];
const statuses = ['Open', 'In Progress', 'Resolved', 'Closed'];
const supervisors = ['John Doe', 'Jane Smith', 'Mike Johnson', 'Sarah Williams', 'David Brown'];
const rootCauses = [
  'Power failure',
  'Network cable cut',
  'Equipment malfunction',
  'Software bug',
  'Configuration error',
  'Hardware failure',
  'Environmental issue',
  'Maintenance work',
  'Third-party service outage',
  'Connectivity loss'
];

// Generate random expected resolution hours based on alarm type
const getExpectedResolutionHours = (alarmType) => {
  switch (alarmType) {
    case 'CRITICAL':
      return Math.random() < 0.5 ? 0.5 : 1; // 30 min or 1 hour
    case 'MAJOR':
      return Math.floor(Math.random() * 3) + 1; // 1-3 hours
    case 'MINOR':
      return Math.floor(Math.random() * 20) + 4; // 4-24 hours
    default:
      return 2;
  }
};

// Generate test outage reports for the current hour
const generateTestOutagesForCurrentHour = (count = 10) => {
  const outages = [];
  const now = new Date();
  
  // Round down to current hour
  const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());

  for (let i = 0; i < count; i++) {
    const alarmType = alarmTypes[Math.floor(Math.random() * alarmTypes.length)];
    const expectedHours = getExpectedResolutionHours(alarmType);
    
    // Random occurrence time within the current hour
    const minutesOffset = Math.floor(Math.random() * 60);
    const occurrenceTime = new Date(currentHour.getTime() + minutesOffset * 60 * 1000);
    
    // 50% chance of being resolved
    const isResolved = Math.random() < 0.5;
    const status = isResolved 
      ? (Math.random() < 0.8 ? 'Resolved' : 'Closed')
      : (Math.random() < 0.5 ? 'Open' : 'In Progress');
    
    let resolutionTime = null;
    if (isResolved) {
      // Resolution time between 15 minutes and 3 hours after occurrence
      const resolutionMinutes = Math.floor(Math.random() * (180 - 15)) + 15;
      resolutionTime = new Date(occurrenceTime.getTime() + resolutionMinutes * 60 * 1000);
      
      // Make sure resolution time is not in the future
      if (resolutionTime > now) {
        resolutionTime = now;
      }
    }

    // Use existing site codes from your test alarms
    const siteNos = ['RDS0165', 'NAR0842', 'WRB0854'];
    const siteNames = ['Wulu', 'Elnar', 'Kwajok main'];
    const siteIndex = Math.floor(Math.random() * siteNos.length);

    outages.push({
      siteNo: siteNos[siteIndex],
      siteCode: siteNames[siteIndex],
      region: regions[Math.floor(Math.random() * regions.length)],
      alarmType,
      occurrenceTime,
      resolutionTime,
      expectedResolutionHours: expectedHours,
      status,
      supervisor: supervisors[Math.floor(Math.random() * supervisors.length)],
      rootCause: isResolved ? rootCauses[Math.floor(Math.random() * rootCauses.length)] : '',
      username: isResolved ? `user${Math.floor(Math.random() * 10) + 1}` : '',
      reportHour: currentHour,
      isEmailSent: false,
      emailSentAt: null
    });
  }

  return outages;
};

// Main function
const insertTestData = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Generate outages for current hour
    console.log('\n📋 Generating test outage reports for current hour...');
    const outages = generateTestOutagesForCurrentHour(10);
    await OutageReport.insertMany(outages);
    console.log(`✅ Inserted ${outages.length} test outage reports`);

    // Print summary
    const currentHour = new Date();
    currentHour.setMinutes(0, 0, 0);
    
    console.log('\n📊 Summary for current hour:', currentHour.toLocaleString());
    console.log('─────────────────────────────────────');
    
    const statusCounts = {};
    const alarmTypeCounts = {};
    
    outages.forEach(o => {
      statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
      alarmTypeCounts[o.alarmType] = (alarmTypeCounts[o.alarmType] || 0) + 1;
    });
    
    console.log('\n📋 Outage Reports by Status:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`   ${status}: ${count}`);
    });

    console.log('\n🚨 Outage Reports by Alarm Type:');
    Object.entries(alarmTypeCounts).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });

    console.log('\n✅ Test data inserted successfully!');
    console.log('\n💡 You can now view the data in:');
    console.log('   - Hourly Reports page (select current hour)');
    console.log('   - Outage Reports page');

  } catch (error) {
    console.error('❌ Error inserting test data:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

// Run the script
insertTestData();
