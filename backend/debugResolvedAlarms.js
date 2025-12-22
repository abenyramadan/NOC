const mongoose = require('mongoose');
require('dotenv').config();

async function debugResolvedAlarms() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/noc');
    const Alarm = mongoose.model('Alarm');

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
