import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create readline interface for user confirmation
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify the question function
const question = promisify(rl.question).bind(rl);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

async function cleanupAllData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Import models
    const { default: Alarm } = await import('../models/Alarm.js');
    const { default: OutageReport } = await import('../models/OutageReport.js');
    const { default: Ticket } = await import('../models/Ticket.js');
    
    // Get counts
    const alarmCount = await Alarm.countDocuments();
    const outageReportCount = await OutageReport.countDocuments();
    const ticketCount = await Ticket.countDocuments();
    
    console.log('\n📊 Current data counts:');
    console.log(`- Alarms: ${alarmCount}`);
    console.log(`- Outage Reports: ${outageReportCount}`);
    console.log(`- Tickets: ${ticketCount}`);
    
    if (alarmCount === 0 && outageReportCount === 0 && ticketCount === 0) {
      console.log('\nℹ️ No data to clean up.');
      process.exit(0);
    }

    // Ask for confirmation
    console.log('\n⚠️ WARNING: This will delete ALL data from the following collections:');
    console.log('- Alarms');
    console.log('- Outage Reports');
    console.log('- Tickets');
    
    const answer = await question('\nAre you sure you want to continue? This action cannot be undone. (yes/no) ');
    
    if (answer.toLowerCase() !== 'yes') {
      console.log('\n❌ Operation cancelled by user.');
      process.exit(0);
    }

    // Delete all data
    console.log('\n🗑️ Deleting all data...');
    
    const results = await Promise.all([
      Alarm.deleteMany({}),
      OutageReport.deleteMany({}),
      Ticket.deleteMany({})
    ]);
    
    console.log('\n✅ Cleanup completed successfully:');
    console.log(`- Deleted ${results[0].deletedCount} alarms`);
    console.log(`- Deleted ${results[1].deletedCount} outage reports`);
    console.log(`- Deleted ${results[2].deletedCount} tickets`);
    
  } catch (error) {
    console.error('\n❌ Error during cleanup:', error);
    process.exit(1);
  } finally {
    rl.close();
    await mongoose.disconnect();
    process.exit(0);
  }
}

cleanupAllData();
