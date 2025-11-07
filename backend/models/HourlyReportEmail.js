import mongoose from 'mongoose';

const hourlyReportEmailSchema = new mongoose.Schema({
  reportHour: {
    type: Date,
    required: true,
    unique: true // Ensure only one email record per hour
  },
  emailSentAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  ongoingCount: {
    type: Number,
    default: 0
  },
  resolvedCount: {
    type: Number,
    default: 0
  },
  emailRecipients: [{
    type: String
  }],
  emailMessageId: {
    type: String
  }
}, {
  timestamps: true
});

// Note: reportHour already has a unique index from the 'unique: true' field property
// No need to add another index here

export default mongoose.model('HourlyReportEmail', hourlyReportEmailSchema);
