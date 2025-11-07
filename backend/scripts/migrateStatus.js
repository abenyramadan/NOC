import mongoose from 'mongoose';
import OutageReport from '../models/OutageReport.js';

async function migrateStatus() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/alerts-monitor-network');

    console.log('🔄 Starting status migration...');

    // Update all 'Open' status to 'In Progress'
    const result = await OutageReport.updateMany(
      { status: 'Open' },
      { $set: { status: 'In Progress' } }
    );

    console.log(`✅ Migration completed: ${result.modifiedCount} records updated`);

    // Verify the migration
    const openCount = await OutageReport.countDocuments({ status: 'Open' });
    const inProgressCount = await OutageReport.countDocuments({ status: 'In Progress' });
    const resolvedCount = await OutageReport.countDocuments({ status: 'Resolved' });

    console.log(`📊 Status counts after migration:`);
    console.log(`  Open: ${openCount}`);
    console.log(`  In Progress: ${inProgressCount}`);
    console.log(`  Resolved: ${resolvedCount}`);

    await mongoose.disconnect();
    console.log('✅ Migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrateStatus();
