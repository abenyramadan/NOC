import mongoose from 'mongoose';

const huaweiMaeAlarmSchema = new mongoose.Schema({
  // MAE-specific fields
  maeSn: {
    type: String,
    required: true,
    index: true,
    description: 'MAE alarm serial number'
  },
  neSn: {
    type: String,
    required: true,
    description: 'Network element serial number'
  },
  neFdn: {
    type: String,
    description: 'Network element fully distinguished name'
  },
  neName: {
    type: String,
    required: true,
    description: 'Network element name'
  },
  neType: {
    type: String,
    required: true,
    description: 'Network element type (e.g., RNC, BTS, etc.)'
  },
  alarmId: {
    type: String,
    required: true,
    index: true,
    description: 'MAE alarm identifier'
  },
  alarmName: {
    type: String,
    required: true,
    description: 'Alarm name/description'
  },
  category: {
    type: String,
    enum: ['Fault', 'Event', 'Performance', 'Security'],
    default: 'Fault',
    description: 'Alarm category'
  },
  severity: {
    type: String,
    enum: ['Critical', 'Major', 'Minor', 'Warning', 'Indeterminate'],
    required: true,
    index: true,
    description: 'MAE alarm severity'
  },
  state: {
    type: String,
    enum: [
      'Unacknowledged & Uncleared',
      'Acknowledged & Uncleared', 
      'Unacknowledged & Cleared',
      'Acknowledged & Cleared'
    ],
    required: true,
    index: true,
    description: 'Alarm acknowledgment and clearance state'
  },
  occurtime: {
    type: Date,
    required: true,
    index: true,
    description: 'Alarm occurrence time from MAE'
  },
  location: {
    type: String,
    description: 'Physical location information'
  },
  additionalInfo: {
    type: mongoose.Schema.Types.Mixed,
    description: 'Additional MAE-specific fields'
  },
  
  // Internal processing fields
  receivedAt: {
    type: Date,
    default: Date.now,
    index: true,
    description: 'When the alarm was received by NOC'
  },
  processedAt: {
    type: Date,
    description: 'When the alarm was processed'
  },
  
  // Integration with existing alarm system
  mappedSeverity: {
    type: String,
    enum: ['critical', 'major', 'minor'],
    description: 'Mapped to NOC alarm severity'
  },
  mappedStatus: {
    type: String,
    enum: ['active', 'acknowledged', 'resolved'],
    default: 'active',
    description: 'Mapped to NOC alarm status'
  },
  nocAlarmId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Alarm',
    description: 'Reference to the created NOC alarm'
  },
  
  // Processing status
  processingStatus: {
    type: String,
    enum: ['pending', 'processed', 'error', 'skipped'],
    default: 'pending',
    index: true
  },
  processingError: {
    type: String,
    description: 'Error message if processing failed'
  },
  
  // Synchronization tracking
  isSynchronized: {
    type: Boolean,
    default: false,
    description: 'Whether this alarm came from synchronization'
  },
  syncBatchId: {
    type: String,
    description: 'Batch ID for synchronization operations'
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
huaweiMaeAlarmSchema.index({ maeSn: 1, alarmId: 1 });
huaweiMaeAlarmSchema.index({ neName: 1, state: 1 });
huaweiMaeAlarmSchema.index({ processingStatus: 1, receivedAt: -1 });
huaweiMaeAlarmSchema.index({ occurtime: -1 });
huaweiMaeAlarmSchema.index({ state: 1, severity: 1 });

// Virtual for checking if alarm is active
huaweiMaeAlarmSchema.virtual('isActive').get(function() {
  return this.state.includes('Uncleared');
});

// Virtual for checking if alarm is acknowledged
huaweiMaeAlarmSchema.virtual('isAcknowledged').get(function() {
  return this.state.includes('Acknowledged');
});

// Pre-save middleware to map MAE severity to NOC severity
huaweiMaeAlarmSchema.pre('save', function(next) {
  if (this.isModified('severity') && !this.mappedSeverity) {
    this.mappedSeverity = this.mapMaeSeverityToNocSeverity();
  }
  if (this.isModified('state') && !this.mappedStatus) {
    this.mappedStatus = this.mapMaeStateToNocStatus();
  }
  next();
});

// Method to map MAE severity to NOC severity
huaweiMaeAlarmSchema.methods.mapMaeSeverityToNocSeverity = function() {
  const severityMapping = {
    'Critical': 'critical',
    'Major': 'major',
    'Minor': 'minor',
    'Warning': 'minor',
    'Indeterminate': 'minor'
  };
  return severityMapping[this.severity] || 'minor';
};

// Method to map MAE state to NOC status
huaweiMaeAlarmSchema.methods.mapMaeStateToNocStatus = function() {
  if (this.state.includes('Cleared')) {
    return 'resolved';
  }
  if (this.state.includes('Acknowledged')) {
    return 'acknowledged';
  }
  return 'active';
};

// Static method to find active alarms
huaweiMaeAlarmSchema.statics.findActiveAlarms = function() {
  return this.find({
    state: { $in: ['Unacknowledged & Uncleared', 'Acknowledged & Uncleared'] }
  });
};

// Static method to find alarms by network element
huaweiMaeAlarmSchema.statics.findByNeName = function(neName) {
  return this.find({ neName }).sort({ occurtime: -1 });
};

// Static method to get alarm statistics
huaweiMaeAlarmSchema.statics.getStatistics = function() {
  return this.aggregate([
    {
      $group: {
        _id: '$severity',
        count: { $sum: 1 },
        active: {
          $sum: {
            $cond: [{ $regexMatch: { input: '$state', regex: 'Uncleared' } }, 1, 0]
          }
        }
      }
    }
  ]);
};

export default mongoose.model('HuaweiMaeAlarm', huaweiMaeAlarmSchema);
