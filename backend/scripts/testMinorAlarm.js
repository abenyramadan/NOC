import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

async function testMinorAlarm() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get the Alarm model
    const Alarm = mongoose.model('Alarm');
    
    // Create a test minor alarm
    const testAlarm = new Alarm({
      siteId: 'TEST001',
      siteName: 'Test Site',
      severity: 'minor',
      alarmType: 'test',
      description: 'Test minor alarm for debugging',
      source: 'test-script',
      timestamp: new Date()
    });

    console.log('🚨 Creating test minor alarm...');
    const savedAlarm = await testAlarm.save();
    console.log('✅ Created test minor alarm:', {
      id: savedAlarm._id,
      severity: savedAlarm.severity,
      alarmType: savedAlarm.alarmType,
      siteId: savedAlarm.siteId,
      siteName: savedAlarm.siteName
    });

    console.log('\n👀 Check the server logs for outage report creation details.');
    console.log('The alarm processor should automatically process this new alarm.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating test minor alarm:', error);
    process.exit(1);
  }
}

testMinorAlarm();
