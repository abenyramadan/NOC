import mongoose from 'mongoose';

const ticketSchema = new mongoose.Schema({
  alarmId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Alarm',
    required: true
  },
  siteName: {
    type: String,
    required: true
  },
  siteId: {
    type: String,
    required: true
  },
  severity: {
    type: String,
    enum: ['critical', 'major', 'minor'],
    required: true
  },
  alarmType: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  recipients: [{
    type: String,
    required: true
  }],
  emailSentAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['sent', 'failed', 'pending', 'resolved', 'Open', 'In Progress', 'Resolved', 'Closed'],
    default: 'sent'
  },
  emailSubject: {
    type: String,
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  closedAt: {
    type: Date,
    default: null
  },
  closedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    default: ''
  },
  // Flag to track if outage report has been generated from this ticket
  outageReportGenerated: {
    type: Boolean,
    default: false
  },
  outageReportGeneratedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
ticketSchema.index({ emailSentAt: -1 });
ticketSchema.index({ alarmId: 1 });
ticketSchema.index({ status: 1 });
ticketSchema.index({ createdBy: 1 });

export default mongoose.model('Ticket', ticketSchema);
