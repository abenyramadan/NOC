import mongoose from 'mongoose';
import Ticket from './models/Ticket.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function checkTickets() {
  try {
    console.log('Connecting to MongoDB...');
    console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'Set' : 'Not set');

    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/noc-alerts', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Connected to MongoDB');

    // Count total tickets first
    const totalCount = await Ticket.countDocuments();
    console.log(`Total tickets in database: ${totalCount}`);

    if (totalCount === 0) {
      console.log('No tickets found in database');
      await mongoose.connection.close();
      return;
    }

    // Get the most recent 5 tickets
    const tickets = await Ticket.find({}).sort({ emailSentAt: -1 }).limit(5).lean();
    console.log(`\nFound ${tickets.length} most recent tickets:`);

    tickets.forEach((ticket, i) => {
      console.log(`\nTicket ${i + 1} (Most Recent):`);
      console.log(`  ID: ${ticket._id}`);
      console.log(`  Recipients:`, ticket.recipients);
      console.log(`  Recipients length:`, ticket.recipients ? ticket.recipients.length : 'N/A');
      console.log(`  Status:`, ticket.status);
      console.log(`  Email sent at:`, ticket.emailSentAt);
      console.log(`  Created at:`, ticket.createdAt);
    });

    await mongoose.connection.close();
    console.log('\n✅ Database check completed');
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Error stack:', error.stack);
    process.exit(1);
  }
}

checkTickets();
