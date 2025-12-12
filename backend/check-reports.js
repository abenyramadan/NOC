import mongoose from 'mongoose';
import OutageReport from './models/OutageReport.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkOutageReports() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const reports = await OutageReport.find({})
      .select('siteCode status ticketId alarmId resolutionTime')
      .limit(10);

    console.log('Outage Reports check:');
    reports.forEach(report => {
      console.log(`- ${report.siteCode}: status=${report.status}, ticketId=${report.ticketId}, alarmId=${report.alarmId}, resolved=${!!report.resolutionTime}`);
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkOutageReports();
