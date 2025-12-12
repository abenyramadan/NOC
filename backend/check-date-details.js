import mongoose from 'mongoose';

// Connect to database
async function checkSpecificDate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    // Check tickets for a specific date (assuming the user is looking at today's date)
    const targetDate = new Date();
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    console.log(`Checking tickets for date: ${targetDate.toISOString().split('T')[0]}`);

    // Get tickets sent on that date
    const Ticket = mongoose.model('Ticket', {
      emailSentAt: Date,
      recipients: Array,
      status: String
    });

    const ticketsForDate = await Ticket.find({
      emailSentAt: { $gte: targetDate, $lt: nextDay }
    }).sort({ emailSentAt: -1 }).lean();

    console.log(`\nTickets sent on ${targetDate.toISOString().split('T')[0]}: ${ticketsForDate.length}`);

    ticketsForDate.forEach((ticket, i) => {
      console.log(`  ${i + 1}. ${ticket._id.toString().slice(-6)} - ${ticket.emailSentAt} - ${ticket.recipients?.length || 0} recipients`);
    });

    // Also check outage reports
    const OutageReport = mongoose.model('OutageReport', {
      occurrenceTime: Date,
      resolutionTime: Date,
      status: String
    });

    const outageReports = await OutageReport.find({
      $or: [
        { occurrenceTime: { $gte: targetDate, $lt: nextDay } },
        { resolutionTime: { $gte: targetDate, $lt: nextDay }, status: { $in: ['Resolved', 'Closed'] } }
      ]
    }).lean();

    console.log(`\nOutage reports for ${targetDate.toISOString().split('T')[0]}: ${outageReports.length}`);

    const newOutages = outageReports.filter(r => r.occurrenceTime >= targetDate && r.occurrenceTime < nextDay);
    const resolvedToday = outageReports.filter(r => {
      if (!['Resolved', 'Closed'].includes(r.status) || !r.resolutionTime) return false;
      const rt = new Date(r.resolutionTime);
      return rt >= targetDate && rt < nextDay;
    });

    console.log(`  New outages: ${newOutages.length}`);
    console.log(`  Resolved today: ${resolvedToday.length}`);
    console.log(`  Carry-over resolutions: ${resolvedToday.filter(r => new Date(r.occurrenceTime) < targetDate).length}`);

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkSpecificDate();
