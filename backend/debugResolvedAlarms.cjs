const mongoose = require('mongoose');
require('dotenv').config();

// Define the Alarm schema inline to avoid registration issues
const alarmSchema = new mongoose.Schema({
  siteId: { type: String, required: true, index: true },
  siteName: { type: String, required: true },
  severity: { type: String, enum: ['critical', 'major', 'minor'], required: true, index: true },
  alarmType: { type: String, required: true, index: true },
  description: { type: String, required: true },
  source: { type: String, required: true },
  status: { type: String, enum: ['active', 'acknowledged', 'resolved'], default: 'active', index: true },
  acknowledgedBy: { type: String, default: null },
  acknowledgedAt: { type: Date, default: null },
  resolvedAt: { type: Date, default: null },
  outageReportGenerated: { type: Boolean, default: false, index: true },
  outageReportGeneratedAt: { type: Date, default: null },
  timestamp: { type: Date, default: Date.now, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  alarmName: { type: String, default: null },
  category: { type: String, default: null },
  neType: { type: String, default: null },
  neName: { type: String, default: null }
}, { timestamps: true });

const Alarm = mongoose.model('Alarm', alarmSchema);

async function debugResolvedAlarms() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/noc');

    const today = new Date();
    today.setHours(0,0,0,0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    console.log('Checking resolved alarms for:', today.toISOString(), 'to', tomorrow.toISOString());

    const resolved = await Alarm.find({
      status: 'resolved',
      resolvedAt: { $gte: today, $lt: tomorrow }
    });

    console.log(`Found ${resolved.length} resolved alarms today`);
    resolved.forEach(a => {
      console.log(`- ${a.description} | source: ${a.source} | resolvedAt: ${a.resolvedAt} | siteId: ${a.siteId}`);
    });

    // Also check any MAE alarms regardless of resolvedAt
    const maeAlarms = await Alarm.find({
      source: /MAE/i,
      status: 'resolved'
    });

    console.log(`\nFound ${maeAlarms.length} resolved MAE alarms (any date)`);
    maeAlarms.forEach(a => {
      console.log(`- ${a.description} | resolvedAt: ${a.resolvedAt}`);
    });

  } catch (err) {
    console.error('DB error:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

debugResolvedAlarms();
