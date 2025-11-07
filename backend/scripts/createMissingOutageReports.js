import mongoose from 'mongoose';
import Ticket from '../models/Ticket.js';
import OutageReport from '../models/OutageReport.js';
import Alarm from '../models/Alarm.js';
import Site from '../models/Site.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/noc-alerts';

/**
 * Determine region based on site name
 */
function determineRegion(siteName, actualRegion) {
  if (actualRegion && actualRegion !== 'Unknown') {
    return actualRegion;
  }

  const name = siteName.toLowerCase();
  if (name.includes('juba') || name.includes('yei') || name.includes('terekeka')) {
    return 'C.E.S';
  } else if (name.includes('bor') || name.includes('pibor') || name.includes('kapoeta')) {
    return 'E.E.S';
  } else if (name.includes('wau') || name.includes('raja') || name.includes('tonj')) {
    return 'W.E.S';
  } else if (name.includes('malakal') || name.includes('kodok') || name.includes('nasir')) {
    return 'Upper Nile';
  } else if (name.includes('aweil') || name.includes('wunrok') || name.includes('kuajok')) {
    return 'Bahr gha zal';
  } else if (name.includes('bentiu') || name.includes('rubkona') || name.includes('leer')) {
    return 'Equatoria';
  }

  return 'C.E.S'; // Default
}

async function createMissingOutageReports() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all tickets that don't have outage reports
    const ticketsWithoutReports = await Ticket.find({
      $or: [
        { outageReportGenerated: { $exists: false } },
        { outageReportGenerated: false }
      ]
    }).populate('alarmId');

    console.log(`🔍 Found ${ticketsWithoutReports.length} tickets without outage reports\n`);

    if (ticketsWithoutReports.length === 0) {
      console.log('✅ All tickets already have outage reports!');
      process.exit(0);
    }

    let created = 0;
    let failed = 0;

    for (const ticket of ticketsWithoutReports) {
      try {
        const alarm = ticket.alarmId;
        if (!alarm) {
          console.log(`⚠️  Skipping ticket ${ticket._id} - no associated alarm`);
          failed++;
          continue;
        }

        // Get site details
        const site = await Site.findOne({ siteId: alarm.siteId });
        const actualRegion = site?.region || 'Unknown';
        const actualSupervisor = site?.supervisor || 'N/A';
        const region = determineRegion(alarm.siteName, actualRegion);

        // Get hour for reportHour
        const ticketTime = new Date(ticket.createdAt);
        const reportHour = new Date(
          ticketTime.getFullYear(),
          ticketTime.getMonth(),
          ticketTime.getDate(),
          ticketTime.getHours()
        );

        // Create outage report
        const outageReport = new OutageReport({
          siteNo: alarm.siteId || 'N/A',
          siteCode: alarm.siteName || 'Unknown',
          region: region,
          alarmType: alarm.severity.toUpperCase(),
          occurrenceTime: alarm.timestamp,
          alarmId: alarm._id,
          ticketId: ticket._id,
          supervisor: actualSupervisor,
          rootCause: 'Others',
          username: 'noc-team',
          resolutionTime: null,
          status: 'Open',
          createdBy: ticket.createdBy,
          reportHour: reportHour,
          isEmailSent: false
        });

        await outageReport.save();

        // Mark ticket as processed
        await Ticket.updateOne(
          { _id: ticket._id },
          { 
            $set: { 
              outageReportGenerated: true,
              outageReportGeneratedAt: new Date()
            }
          }
        );

        console.log(`✅ Created outage report for ${alarm.siteName} (${alarm.siteId})`);
        created++;

      } catch (error) {
        console.error(`❌ Failed to create report for ticket ${ticket._id}:`, error.message);
        failed++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   ✅ Created: ${created} outage reports`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📋 Total: ${ticketsWithoutReports.length} tickets processed`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    console.log('\n🔌 Disconnecting from MongoDB...');
    await mongoose.disconnect();
    console.log('✅ Disconnected');
    process.exit(0);
  }
}

// Run the script
createMissingOutageReports();
