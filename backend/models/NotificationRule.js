import mongoose from 'mongoose';

const notificationRuleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  severity: [{
    type: String,
    enum: ['critical', 'major', 'minor', 'warning'],
    required: true
  }],
  recipients: [{
    type: String,
    required: true,
    trim: true
  }],
  methods: [{
    type: String,
    enum: ['email', 'sms', 'both'],
    default: 'email'
  }],
  enabled: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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

// Index for faster querying
notificationRuleSchema.index({ enabled: 1 });
notificationRuleSchema.index({ 'severity': 1 });

const NotificationRule = mongoose.model('NotificationRule', notificationRuleSchema);

export default NotificationRule;
