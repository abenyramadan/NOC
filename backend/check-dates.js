import mongoose from 'mongoose';

// Connect to database
async function checkTicketDates() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    // Get all tickets
    const Ticket = mongoose.model('Ticket', {
      emailSentAt: Date,
      recipients: Array,
      status: String
    });

    const tickets = await Ticket.find({}).sort({ emailSentAt: -1 }).lean();

    console.log(`Total tickets: ${tickets.length}\n`);

    // Group by date
    const dateGroups = {};
    tickets.forEach(ticket => {
      const utcDate = new Date(ticket.emailSentAt).toISOString().split('T')[0];
      const localDate = new Date(ticket.emailSentAt).toLocaleDateString('en-US', {
        timeZone: 'Africa/Juba', // Sudan timezone (UTC+2)
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });

      if (!dateGroups[utcDate]) {
        dateGroups[utcDate] = { utc: utcDate, local: localDate, count: 0, tickets: [] };
      }
      dateGroups[utcDate].count++;
      dateGroups[utcDate].tickets.push({
        id: ticket._id.toString().slice(-6),
        time: ticket.emailSentAt,
        recipients: ticket.recipients?.length || 0
      });
    });

    // Show groups sorted by date
    Object.keys(dateGroups).sort().reverse().forEach(date => {
      const group = dateGroups[date];
      console.log(`${group.utc} (Local: ${group.local}) - ${group.count} tickets`);
      if (group.tickets.length <= 3) {
        group.tickets.forEach(t => {
          console.log(`  ${t.id}: ${new Date(t.time).toISOString()} (${t.recipients} recipients)`);
        });
      } else {
        console.log(`  First 3: ${group.tickets.slice(0, 3).map(t =>
          `${t.id}:${new Date(t.time).toISOString().slice(11, 19)}`
        ).join(', ')}`);
      }
      console.log('');
    });

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkTicketDates();
