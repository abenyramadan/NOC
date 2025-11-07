import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import Site from '../models/Site.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const importSites = async () => {
  try {
    await connectDB();

    const csvFilePath = path.join(process.cwd(), 'sites.csv');

    if (!fs.existsSync(csvFilePath)) {
      console.error('❌ CSV file not found at:', csvFilePath);
      process.exit(1);
    }

    console.log('📊 Starting CSV import...');

    const results = [];
    let processed = 0;
    let skipped = 0;
    let errors = 0;

    // Read CSV file
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', async (data) => {
        try {
          // Skip header row and empty rows
          if (data['S.no'] === 'S.no' || !data['Site ID'] || !data['Site Name']) {
            return;
          }

          // Check if site already exists
          const existingSite = await Site.findOne({ siteId: data['Site ID'] });
          if (existingSite) {
            console.log(`⚠️  Skipping existing site: ${data['Site ID']} - ${data['Site Name']}`);
            skipped++;
            return;
          }

          // Parse status - handle variations like "On Air", "ON Air", "Off Air", etc.
          const statusValue = data['STATUS'];
          let status = 'On Air'; // default
          if (statusValue) {
            const statusLower = statusValue.toLowerCase();
            if (statusLower.includes('off')) {
              status = 'Off Air';
            } else if (statusLower.includes('maintenance')) {
              status = 'Maintenance';
            } else if (statusLower.includes('planned')) {
              status = 'Planned';
            }
            // Otherwise keep default 'On Air'
          }

          // Parse transmission type
          const transmissionValue = data['Transmission'];
          let transmission = 'Microwave'; // default
          if (transmissionValue) {
            const transLower = transmissionValue.toLowerCase();
            if (transLower.includes('vsat')) {
              transmission = 'VSAT';
            } else if (transLower.includes('fiber')) {
              transmission = 'Fiber';
            }
            // Otherwise keep default 'Microwave'
          }

          // Create new site with more lenient data handling
          const site = new Site({
            siteId: data['Site ID'].trim(),
            siteName: data['Site Name'].trim(),
            state: data['STATE'] ? data['STATE'].trim() : 'Unknown',
            city: data['City'] ? data['City'].trim() : 'Unknown',
            transmission: transmission,
            status: status,
            supervisor: data['SUPERVISOR'] ? data['SUPERVISOR'].trim() : undefined,
            region: data['STATE'] ? data['STATE'].trim() : 'Unknown',
            uptime: 100,
            lastSeen: new Date()
          });

          await site.save();
          results.push(site);
          processed++;
          console.log(`✅ Imported: ${data['Site ID']} - ${data['Site Name']} (${data['STATE']})`);
        } catch (error) {
          console.error('❌ Error processing row:', data['Site ID'], error.message);
          errors++;
        }
      })
      .on('end', async () => {
        console.log('\n📊 Import Summary:');
        console.log(`✅ Processed: ${processed}`);
        console.log(`⚠️  Skipped: ${skipped}`);
        console.log(`❌ Errors: ${errors}`);
        console.log(`📈 Total sites in database: ${await Site.countDocuments()}`);

        if (processed > 0) {
          console.log('\n🎉 CSV import completed successfully!');
          console.log(`📋 Successfully imported ${processed} sites from your CSV file!`);
        }

        process.exit(0);
      });

  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
};

// Run the import
importSites();
