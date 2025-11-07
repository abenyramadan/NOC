import mongoose from 'mongoose';

const alarmSchema = new mongoose.Schema({
  siteId: {
    type: String,
    required: true,
    index: true
  },
  siteName: {
    type: String,
    required: true
  },
  severity: {
    type: String,
    enum: ['critical', 'major', 'minor'],
    required: true,
    index: true
  },
  alarmType: {
    type: String,
    required: true,
    index: true
  },
  description: {
    type: String,
    required: true
  },
  source: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'acknowledged', 'resolved'],
    default: 'active',
    index: true
  },
  acknowledgedBy: {
    type: String,
    default: null
  },
  acknowledgedAt: {
    type: Date,
    default: null
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  outageReportGenerated: {
    type: Boolean,
    default: false,
    index: true
  },
  outageReportGeneratedAt: {
    type: Date,
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
alarmSchema.index({ status: 1, severity: 1, timestamp: -1 });
alarmSchema.index({ siteId: 1, status: 1 });

export default mongoose.model('Alarm', alarmSchema);
