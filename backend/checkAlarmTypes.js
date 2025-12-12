import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { OutageReport } from './models/OutageReport.js';

dotenv.config();

async function checkAlarmTypes() {
  try {
    // Connect to MongoDB
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    // Get the current date range (last 24 hours)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // Get all reports from today
    const reports = await OutageReport.find({
      occurrenceTime: { $gte: startOfDay, $lt: endOfDay }
    })
    .sort({ occurrenceTime: -1 })
    .limit(5)
    .lean();

    console.log(`Found ${reports.length} reports from today`);
    console.log('Sample reports:');
    
    reports.forEach((report, index) => {
      console.log(`\nReport ${index + 1}:`);
      console.log('ID:', report._id);
      console.log('Site Code:', report.siteCode || 'N/A');
      console.log('Alarm Type (salarmType):', report.salarmType || 'N/A');
      console.log('Alarm Type (alarmType):', report.alarmType || 'N/A');
      console.log('Status:', report.status || 'N/A');
      console.log('Occurrence Time:', report.occurrenceTime || 'N/A');
    });

    // Check what alarm types exist in the database
    const alarmTypes = await OutageReport.aggregate([
      {
        $match: {
          occurrenceTime: { $gte: startOfDay, $lt: endOfDay },
          $or: [
            { salarmType: { $exists: true } },
            { alarmType: { $exists: true } }
          ]
        }
      },
      {
        $group: {
          _id: {
            salarmType: '$salarmType',
            alarmType: '$alarmType'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    console.log('\nAlarm types in database:');
    console.log(JSON.stringify(alarmTypes, null, 2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Disconnected from MongoDB');
  }
}

checkAlarmTypes();
