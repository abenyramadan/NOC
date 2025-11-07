import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/noc-alerts';

async function migrateExpectedResolutionField() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const OutageReport = mongoose.connection.collection('outagereports');

    // Find all documents that have expectedResolutionTime but not expectedResolutionHours
    const documentsToUpdate = await OutageReport.find({
      expectedResolutionTime: { $exists: true, $ne: null }
    }).toArray();

    console.log(`🔍 Found ${documentsToUpdate.length} documents with expectedResolutionTime field\n`);

    if (documentsToUpdate.length === 0) {
      console.log('✅ No documents need migration!');
      process.exit(0);
    }

    let migrated = 0;
    let failed = 0;

    for (const doc of documentsToUpdate) {
      try {
        await OutageReport.updateOne(
          { _id: doc._id },
          {
            $set: { expectedResolutionHours: doc.expectedResolutionTime },
            $unset: { expectedResolutionTime: '' }
          }
        );
        
        console.log(`✅ Migrated document ${doc._id}: ${doc.expectedResolutionTime} hours`);
        migrated++;
      } catch (error) {
        console.error(`❌ Failed to migrate document ${doc._id}:`, error.message);
        failed++;
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Migrated: ${migrated} documents`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📋 Total: ${documentsToUpdate.length} documents processed`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    console.log('\n🔌 Disconnecting from MongoDB...');
    await mongoose.disconnect();
    console.log('✅ Disconnected');
    process.exit(0);
  }
}

// Run the migration
migrateExpectedResolutionField();
