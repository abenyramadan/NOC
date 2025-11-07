import mongoose from 'mongoose';
import fs from 'fs';
import csv from 'csv-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Site from '../models/Site.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/noc-alerts';

async function importSupervisors() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const csvFilePath = path.join(__dirname, '../sites.csv');
    
    if (!fs.existsSync(csvFilePath)) {
      console.error('❌ sites.csv file not found at:', csvFilePath);
      process.exit(1);
    }

    const sites = [];
    
    // Read CSV file
    await new Promise((resolve, reject) => {
      fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (row) => {
          sites.push(row);
        })
        .on('end', () => {
          console.log(`📄 Read ${sites.length} sites from CSV`);
          resolve();
        })
        .on('error', reject);
    });

    let updated = 0;
    let notFound = 0;
    let skipped = 0;
    let errors = 0;

    console.log('\n🔄 Updating supervisors...\n');

    for (const row of sites) {
      const siteId = row['Site ID']?.trim();
      const supervisor = row['SUPERVISOR']?.trim();

      // Skip if no Site ID
      if (!siteId) {
        skipped++;
        continue;
      }

      try {
        // Find site by siteId
        const site = await Site.findOne({ siteId: siteId });

        if (!site) {
          console.log(`⚠️  Site not found: ${siteId} (${row['Site Name']})`);
          notFound++;
          continue;
        }

        // Update supervisor only if it exists in CSV
        if (supervisor && supervisor !== '') {
          site.supervisor = supervisor;
          await site.save();
          console.log(`✅ Updated ${siteId} - ${row['Site Name']}: ${supervisor}`);
          updated++;
        } else {
          // Clear supervisor if empty in CSV
          if (site.supervisor) {
            site.supervisor = undefined;
            await site.save();
            console.log(`🔄 Cleared supervisor for ${siteId} - ${row['Site Name']}`);
            updated++;
          } else {
            skipped++;
          }
        }
      } catch (error) {
        console.error(`❌ Error updating ${siteId}:`, error.message);
        errors++;
      }
    }

    console.log('\n📊 Import Summary:');
    console.log(`✅ Updated: ${updated}`);
    console.log(`⚠️  Not found in DB: ${notFound}`);
    console.log(`⏭️  Skipped: ${skipped}`);
    console.log(`❌ Errors: ${errors}`);

    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
}

importSupervisors();
