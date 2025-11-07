import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import OutageReport from '../models/OutageReport.js';
import Site from '../models/Site.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/noc-alerts';

async function updateOutageReportSupervisors() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all outage reports
    const outageReports = await OutageReport.find({});
    console.log(`📄 Found ${outageReports.length} outage reports to process\n`);

    let updated = 0;
    let notFound = 0;
    let alreadyCorrect = 0;
    let errors = 0;

    for (const report of outageReports) {
      try {
        // Find the corresponding site
        const site = await Site.findOne({ siteId: report.siteNo });

        if (!site) {
          console.log(`⚠️  Site not found: ${report.siteNo} (${report.siteCode})`);
          notFound++;
          continue;
        }

        const newSupervisor = site.supervisor || 'Not Assigned';

        // Check if supervisor needs updating
        if (report.supervisor === newSupervisor) {
          alreadyCorrect++;
          continue;
        }

        // Update the supervisor
        const oldSupervisor = report.supervisor;
        report.supervisor = newSupervisor;
        await report.save();

        console.log(`✅ Updated ${report.siteNo} - ${report.siteCode}: "${oldSupervisor}" → "${newSupervisor}"`);
        updated++;

      } catch (error) {
        console.error(`❌ Error updating report for ${report.siteNo}:`, error.message);
        errors++;
      }
    }

    console.log('\n📊 Update Summary:');
    console.log(`✅ Updated: ${updated}`);
    console.log(`✓  Already correct: ${alreadyCorrect}`);
    console.log(`⚠️  Site not found: ${notFound}`);
    console.log(`❌ Errors: ${errors}`);

    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    
  } catch (error) {
    console.error('❌ Update failed:', error);
    process.exit(1);
  }
}

updateOutageReportSupervisors();
