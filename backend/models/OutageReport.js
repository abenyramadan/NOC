import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

const outageReportSchema = new mongoose.Schema({
  siteNo: {
    type: String,
    required: true,
    trim: true
  },
  siteCode: {
    type: String,
    required: true,
    trim: true
  },
  region: {
    type: String,
    required: true,
    enum: ['C.E.S', 'E.E.S', 'W.E.S', 'WARRAP', 'JONGLEI', 'UNITY', 'LAKES', 'N.B.G.S', 'W.B.G.S', 'UPPERNILE'],
    trim: true
  },
  alarmType: {
    type: String,
    required: true,
    enum: ['CRITICAL', 'MAJOR', 'MINOR', 'WARNING', 'INFO'],
    uppercase: true
  },
  occurrenceTime: {
    type: Date,
    required: true,
    default: Date.now
  },
  alarmId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Alarm',
    required: true // Reference to the alarm that triggered this report
  },
  ticketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ticket',
    required: false // Reference to the ticket (primary source for outage reports)
  },
  supervisor: {
    type: String,
    required: true,
    trim: true
  },
  rootCause: {
    type: String,
    required: true,
    enum: ['Generator', 'Transmission', 'Radio', 'Environment', 'Others'],
    trim: true
  },
  subrootCause: {
    type: String,
    required: false, // Will make required later, start with optional for migration
    trim: true,
    default: null
  },
  username: {
    type: String,
    required: true,
    trim: true,
    default: 'noc-team'
  },
  assignedTo: {
    type: String,
    trim: true,
    default: null // Email address of assigned technician/engineer
  },
  resolutionTime: {
    type: Date,
    default: null
  },
  expectedResolutionHours: {
    type: Number,
    default: null, // Keep for backwards compatibility, will be calculated from mandatoryRestorationTime
    min: 0.1
  },
  expectedRestorationTime: {
    type: Date,
    default: null, // New field for expected restoration datetime
  },
  mandatoryRestorationTime: {
    type: Date,
    required: false, // Temporarily not required to allow existing data
    default: null,
    validate: {
      validator: function(value) {
        // Only validate if value is provided
        if (!value) return true;
        
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago
        
        // Allow times that are either:
        // 1. In the future, or
        // 2. Within the last hour (for updates of recent records)
        return value > oneHourAgo;
      },
      message: 'Mandatory restoration time must be within the last hour or in the future'
    }
  },
  status: {
    type: String,
    enum: ['In Progress', 'Resolved'],
    default: 'In Progress'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Optional for system-generated reports
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  // Metadata for hourly report generation
  reportHour: {
    type: Date,
    required: true // The hour this outage belongs to for reporting
  },
  isEmailSent: {
    type: Boolean,
    default: false
  },
  emailSentAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index for efficient querying
outageReportSchema.index({ reportHour: 1, createdAt: -1 });
outageReportSchema.index({ siteNo: 1, siteCode: 1 });
outageReportSchema.index({ status: 1, occurrenceTime: -1 });

// Pre-save middleware to update updatedAt
outageReportSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Add pagination plugin
outageReportSchema.plugin(mongoosePaginate);

export default mongoose.model('OutageReport', outageReportSchema);
