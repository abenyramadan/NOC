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

const importSitesSync = async () => {
  try {
    await connectDB();

    const csvFilePath = path.join(process.cwd(), 'sites.csv');

    if (!fs.existsSync(csvFilePath)) {
      console.error('❌ CSV file not found at:', csvFilePath);
      process.exit(1);
    }

    console.log('📊 Starting synchronous CSV import...');

    // Read all CSV data first
    const csvData = [];
    let processed = 0;
    let skipped = 0;
    let errors = 0;

    // Read CSV file synchronously
    const fileContent = fs.readFileSync(csvFilePath, 'utf8');
    const lines = fileContent.split('\n');

    // Process each line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        // Parse CSV line (simple comma splitting)
        const columns = line.split(',').map(col => col.trim());

        if (columns.length < 6) continue; // Skip malformed lines

        const [
          sNo,
          siteId,
          siteName,
          state,
          city,
          transmission,
          status,
          ...rest
        ] = columns;

        // Skip header and empty rows
        if (sNo === 'S.no' || !siteId || !siteName) {
          continue;
        }

        // Check if site already exists
        const existingSite = await Site.findOne({ siteId });
        if (existingSite) {
          console.log(`⚠️  Skipping existing site: ${siteId} - ${siteName}`);
          skipped++;
          continue;
        }

        // Parse status
        let siteStatus = 'On Air';
        if (status) {
          const statusLower = status.toLowerCase();
          if (statusLower.includes('off')) {
            siteStatus = 'Off Air';
          } else if (statusLower.includes('maintenance')) {
            siteStatus = 'Maintenance';
          } else if (statusLower.includes('planned')) {
            siteStatus = 'Planned';
          }
        }

        // Parse transmission
        let siteTransmission = 'Microwave';
        if (transmission) {
          const transLower = transmission.toLowerCase();
          if (transLower.includes('vsat')) {
            siteTransmission = 'VSAT';
          } else if (transLower.includes('fiber')) {
            siteTransmission = 'Fiber';
          }
        }

        // Create site
        const site = new Site({
          siteId,
          siteName,
          state: state || 'Unknown',
          city: city || 'Unknown',
          transmission: siteTransmission,
          status: siteStatus,
          supervisor: rest[6] || undefined, // SUPERVISOR column
          region: state || 'Unknown',
          uptime: 100,
          lastSeen: new Date()
        });

        await site.save();
        processed++;
        console.log(`✅ Imported: ${siteId} - ${siteName} (${state})`);

      } catch (error) {
        console.error(`❌ Error processing line ${i + 1}:`, error.message);
        errors++;
      }
    }

    console.log('\n📊 Import Summary:');
    console.log(`✅ Processed: ${processed}`);
    console.log(`⚠️  Skipped: ${skipped}`);
    console.log(`❌ Errors: ${errors}`);
    console.log(`📈 Total sites in database: ${await Site.countDocuments()}`);

    if (processed > 0) {
      console.log(`\n🎉 Successfully imported ${processed} sites from your CSV file!`);
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
};

// Run the import
importSitesSync();
