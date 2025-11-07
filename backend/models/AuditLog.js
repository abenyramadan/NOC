import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  user: {
    type: String,
    required: true,
    index: true
  },
  action: {
    type: String,
    required: true,
    index: true
  },
  target: {
    type: String,
    required: true,
    index: true
  },
  details: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['success', 'failed'],
    default: 'success',
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ user: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

export default mongoose.model('AuditLog', auditLogSchema);
