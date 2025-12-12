import mongoose from 'mongoose';
import OutageReport from './models/OutageReport.js';
import Ticket from './models/Ticket.js';
import dotenv from 'dotenv';

dotenv.config();

async function linkOutageReportsWithTickets() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all outage reports
    const reports = await OutageReport.find({}).lean();
    console.log(`Found ${reports.length} outage reports`);

    for (const report of reports) {
      if (!report.ticketId) {
        // Try to find a matching ticket based on site and alarm type
        const matchingTicket = await Ticket.findOne({
          siteId: report.siteNo,
          alarmType: report.alarmType,
          // Match by date (same day)
          emailSentAt: {
            $gte: new Date(report.occurrenceTime.getFullYear(), report.occurrenceTime.getMonth(), report.occurrenceTime.getDate()),
            $lt: new Date(report.occurrenceTime.getFullYear(), report.occurrenceTime.getMonth(), report.occurrenceTime.getDate() + 1)
          }
        }).lean();

        if (matchingTicket) {
          console.log(`🔗 Linking outage report ${report._id} with ticket ${matchingTicket._id}`);

          // Update the outage report with ticketId
          await OutageReport.findByIdAndUpdate(report._id, {
            ticketId: matchingTicket._id
          });

          // If the outage report is resolved, update the ticket status
          if ((report.status === 'Resolved' || report.status === 'Closed') && matchingTicket.status !== 'resolved') {
            await Ticket.findByIdAndUpdate(matchingTicket._id, {
              status: 'resolved',
              resolvedAt: report.resolutionTime || new Date(),
              updatedAt: new Date()
            });
            console.log(`✅ Updated ticket ${matchingTicket._id} status to resolved`);
          }
        } else {
          console.log(`❌ No matching ticket found for outage report ${report._id} (${report.siteNo}, ${report.alarmType})`);
        }
      } else {
        console.log(`✓ Outage report ${report._id} already has ticketId: ${report.ticketId}`);
      }
    }

    await mongoose.disconnect();
    console.log('✅ Linking process completed');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

linkOutageReportsWithTickets();
