import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.join(__dirname, 'backend', '.env');
console.log('🔍 Loading environment variables from:', envPath);
dotenv.config({ path: envPath });

async function createCarryOverOutages() {
  try {
    console.log('🔄 Connecting to MongoDB...');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB successfully');

    // Define the OutageReport schema (matching your backend model)
    const outageReportSchema = new mongoose.Schema({
      siteNo: String,
      siteCode: String,
      region: String,
      alarmType: String,
      occurrenceTime: Date,
      resolutionTime: Date,
      status: String,
      rootCause: String,
      supervisor: String,
      username: String,
      mandatoryRestorationTime: Date,
      createdBy: mongoose.Schema.Types.ObjectId,
      reportHour: Date,
      updatedAt: Date,
      updatedBy: String
    }, { timestamps: true });

    const OutageReport = mongoose.model('OutageReport', outageReportSchema);

    // Get yesterday and today dates
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const today = new Date();

    console.log('📅 Yesterday:', yesterday.toISOString());
    console.log('📅 Today:', today.toISOString());
    console.log('');

    // Define the 3 carry-over outages
    const carryOverOutages = [
      {
        siteNo: 'TEST001',
        siteCode: 'CARRY001',
        region: 'TEST_REGION_1',
        alarmType: 'Power Failure',
        occurrenceTime: yesterday,
        resolutionTime: today,
        status: 'Resolved',
        rootCause: 'Generator failure',
        supervisor: 'Test Supervisor 1',
        username: 'testuser1',
        mandatoryRestorationTime: today,
        reportHour: today,
        createdBy: null, // No logged-in user for test data
        updatedAt: today,
        updatedBy: 'test-script'
      },
      {
        siteNo: 'TEST002',
        siteCode: 'CARRY002',
        region: 'TEST_REGION_2',
        alarmType: 'Fiber Cut',
        occurrenceTime: yesterday,
        resolutionTime: today,
        status: 'Resolved',
        rootCause: 'Cable damage',
        supervisor: 'Test Supervisor 2',
        username: 'testuser2',
        mandatoryRestorationTime: today,
        reportHour: today,
        createdBy: null,
        updatedAt: today,
        updatedBy: 'test-script'
      },
      {
        siteNo: 'TEST003',
        siteCode: 'CARRY003',
        region: 'TEST_REGION_3',
        alarmType: 'Equipment Failure',
        occurrenceTime: yesterday,
        resolutionTime: today,
        status: 'Resolved',
        rootCause: 'Hardware malfunction',
        supervisor: 'Test Supervisor 3',
        username: 'testuser3',
        mandatoryRestorationTime: today,
        reportHour: today,
        createdBy: null,
        updatedAt: today,
        updatedBy: 'test-script'
      }
    ];

    console.log('🔄 Creating 3 carry-over outage reports...\n');

    // Create each outage
    const createdOutages = [];
    for (let i = 0; i < carryOverOutages.length; i++) {
      const outage = carryOverOutages[i];
      console.log(`📝 Creating carry-over outage ${i + 1}/3: ${outage.siteCode}`);

      try {
        const createdOutage = await OutageReport.create(outage);
        createdOutages.push(createdOutage);
        console.log(`✅ Created: ${outage.siteCode} (ID: ${createdOutage._id})`);
        console.log(`   📅 Occurred: ${yesterday.toLocaleDateString()}`);
        console.log(`   ✅ Resolved: ${today.toLocaleDateString()}`);
        console.log(`   🏷️  Status: ${outage.status}`);
        console.log('');
      } catch (error) {
        console.log(`❌ Failed to create ${outage.siteCode}:`, error.message);
        console.log('');
      }
    }

    if (createdOutages.length > 0) {
      console.log('🎯 SUCCESS SUMMARY:');
      console.log(`✅ Created ${createdOutages.length} carry-over outages`);
      console.log('💡 These outages started YESTERDAY and were resolved TODAY');
      console.log('💡 They should appear as "carry-overs" in "Resolved Today" metrics');
      console.log('💡 They should be counted in SLA calculations and regional breakdowns');
      console.log('');
      console.log('📊 TEST VERIFICATION:');
      console.log('- Check "Resolved Today" in Hourly Reports → should include these 3');
      console.log('- Check "Resolved Today" in Daily Reports → should include these 3');
      console.log('- Check SLA metrics → should reflect these resolutions');
      console.log('- Check Regional breakdown → should include TEST_REGION_1,2,3');
      console.log('- Check Audit Log → should show creation entries');
      console.log('');
      console.log('🧹 CLEANUP: Run this MongoDB command to remove test data:');
      console.log(`db.outagereports.deleteMany({siteCode: {$in: ["CARRY001", "CARRY002", "CARRY003"]}})`);
    } else {
      console.log('❌ No outages were created. Check the error messages above.');
    }

  } catch (error) {
    console.log('❌ Error:', error.message);
    console.log('💡 Make sure:');
    console.log('   - MongoDB is running');
    console.log('   - MONGODB_URI is set in backend/.env');
    console.log('   - You have network access to MongoDB');
  } finally {
    // Close the connection
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
  }
}

// Run the script
createCarryOverOutages();
