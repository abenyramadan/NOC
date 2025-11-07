import mongoose from 'mongoose';
import Ticket from '../models/Ticket.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/alerts-monitor';

async function viewTickets() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');
    console.log('Looking for tickets...\n');

    // Find all tickets
    const tickets = await Ticket.find({}).sort({ createdAt: -1 }).limit(10);

    if (tickets.length === 0) {
      console.log('No tickets found in the database.');
      console.log('To create a test ticket, run: node scripts/testAlarm.js (which will trigger ticket creation)');
      return;
    }

    console.log(`Found ${tickets.length} tickets:\n`);

    tickets.forEach((ticket, index) => {
      console.log(`${index + 1}. Ticket #${ticket.ticketId || ticket._id}`);
      console.log(`   Title: ${ticket.title}`);
      console.log(`   Status: ${ticket.status}`);
      console.log(`   Priority: ${ticket.priority}`);
      console.log(`   Source: ${ticket.source}`);
      console.log(`   Related Alarm: ${ticket.relatedAlarm || 'None'}`);
      console.log(`   Created: ${ticket.createdAt}`);
      console.log(`   Description: ${ticket.description}`);
      console.log('   ---');
    });

    // Also show tickets created by alarm processor
    const alarmTickets = await Ticket.find({ createdBy: 'system', source: 'alarm' }).sort({ createdAt: -1 });

    if (alarmTickets.length > 0) {
      console.log(`\n📋 Tickets created by alarm processor (${alarmTickets.length}):`);
      alarmTickets.forEach((ticket, index) => {
        console.log(`${index + 1}. ${ticket.title} [${ticket.status}]`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('Error viewing tickets:', error);
    process.exit(1);
  }
}

viewTickets();
