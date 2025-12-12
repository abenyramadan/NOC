import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import readline from 'readline';
import '../models/Alarm.js'; // Import the Alarm model

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

async function deleteAllAlarms() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Import the Alarm model
    const { default: Alarm } = await import('../models/Alarm.js');
    
    // Count the number of alarms before deletion
    const count = await Alarm.countDocuments();
    
    if (count === 0) {
      console.log('ℹ️ No alarms found in the database.');
      process.exit(0);
    }

    // Ask for confirmation
    console.log(`⚠️ WARNING: This will delete ALL (${count}) alarms from the database.`);
    const answer = await question('Are you sure you want to continue? (yes/no) ');
    
    if (answer.toLowerCase() !== 'yes') {
      console.log('❌ Operation cancelled by user.');
      process.exit(0);
    }

    // Delete all alarms
    console.log('🗑️ Deleting all alarms...');
    const result = await Alarm.deleteMany({});
    
    console.log(`✅ Successfully deleted ${result.deletedCount} alarms from the database.`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error deleting alarms:', error);
    process.exit(1);
  } finally {
    rl.close();
    await mongoose.disconnect();
  }
}

deleteAllAlarms();
