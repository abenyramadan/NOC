import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Alarm from '../models/Alarm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/noc-alerts';

/**
 * Archive or delete alarms older than specified days
 * This helps keep the database performant by removing very old data
 * 
 * Usage:
 * - node scripts/archiveOldAlarms.js --days=90 --dry-run
 * - node scripts/archiveOldAlarms.js --days=180 --delete
 */
async function archiveOldAlarms() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const daysArg = args.find(arg => arg.startsWith('--days='));
    const dryRun = args.includes('--dry-run');
    const deleteAlarms = args.includes('--delete');
    
    const daysToKeep = daysArg ? parseInt(daysArg.split('=')[1]) : 90;
    
    console.log('📦 Alarm Archival Script');
    console.log('========================\n');
    console.log(`📅 Days to keep: ${daysToKeep}`);
    console.log(`🔍 Mode: ${dryRun ? 'DRY RUN (no changes)' : deleteAlarms ? 'DELETE' : 'ARCHIVE'}\n`);

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    console.log(`🗓️  Cutoff date: ${cutoffDate.toLocaleDateString()} (${cutoffDate.toISOString()})\n`);

    // Find old alarms
    const oldAlarms = await Alarm.find({
      timestamp: { $lt: cutoffDate }
    }).sort({ timestamp: 1 });

    console.log(`📊 Found ${oldAlarms.length} alarms older than ${daysToKeep} days\n`);

    if (oldAlarms.length === 0) {
      console.log('✅ No alarms to archive. Database is up to date!');
      await mongoose.disconnect();
      return;
    }

    // Show sample of alarms to be archived
    console.log('📋 Sample of alarms to be processed:');
    oldAlarms.slice(0, 5).forEach((alarm, index) => {
      console.log(`   ${index + 1}. ${alarm.siteName} - ${alarm.alarmType} (${new Date(alarm.timestamp).toLocaleDateString()})`);
    });
    
    if (oldAlarms.length > 5) {
      console.log(`   ... and ${oldAlarms.length - 5} more\n`);
    } else {
      console.log('');
    }

    // Breakdown by severity
    const severityBreakdown = {
      critical: oldAlarms.filter(a => a.severity === 'critical').length,
      major: oldAlarms.filter(a => a.severity === 'major').length,
      minor: oldAlarms.filter(a => a.severity === 'minor').length
    };

    console.log('📊 Severity Breakdown:');
    console.log(`   🔴 Critical: ${severityBreakdown.critical}`);
    console.log(`   🟠 Major: ${severityBreakdown.major}`);
    console.log(`   🟡 Minor: ${severityBreakdown.minor}\n`);

    if (dryRun) {
      console.log('🔍 DRY RUN - No changes made to the database');
      console.log(`   Would ${deleteAlarms ? 'delete' : 'archive'} ${oldAlarms.length} alarms`);
    } else {
      if (deleteAlarms) {
        // Delete old alarms
        const result = await Alarm.deleteMany({
          timestamp: { $lt: cutoffDate }
        });
        
        console.log(`✅ Deleted ${result.deletedCount} alarms from the database`);
      } else {
        // For archive, you could move to a separate collection
        // For now, we'll just add an archived flag
        const result = await Alarm.updateMany(
          { timestamp: { $lt: cutoffDate } },
          { $set: { archived: true, archivedAt: new Date() } }
        );
        
        console.log(`✅ Marked ${result.modifiedCount} alarms as archived`);
        console.log('   Note: Archived alarms are still in the database but flagged');
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Total alarms processed: ${oldAlarms.length}`);
    console.log(`   Cutoff date: ${cutoffDate.toLocaleDateString()}`);
    console.log(`   Mode: ${dryRun ? 'Dry Run' : deleteAlarms ? 'Delete' : 'Archive'}`);

    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    
  } catch (error) {
    console.error('❌ Archive failed:', error);
    process.exit(1);
  }
}

// Show usage if no args
if (process.argv.length === 2) {
  console.log('\n📦 Alarm Archival Script');
  console.log('========================\n');
  console.log('Usage:');
  console.log('  node scripts/archiveOldAlarms.js [options]\n');
  console.log('Options:');
  console.log('  --days=N      Keep alarms from last N days (default: 90)');
  console.log('  --dry-run     Show what would be done without making changes');
  console.log('  --delete      Permanently delete old alarms (default: archive/flag)\n');
  console.log('Examples:');
  console.log('  node scripts/archiveOldAlarms.js --days=90 --dry-run');
  console.log('  node scripts/archiveOldAlarms.js --days=180');
  console.log('  node scripts/archiveOldAlarms.js --days=365 --delete\n');
  process.exit(0);
}

archiveOldAlarms();
