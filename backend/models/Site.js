import mongoose from 'mongoose';

const siteSchema = new mongoose.Schema({
  siteId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  siteName: {
    type: String,
    required: true,
    trim: true
  },
  state: {
    type: String,
    required: true,
    trim: true
  },
  city: {
    type: String,
    required: true,
    trim: true
  },
  transmission: {
    type: String,
    enum: ['Microwave', 'VSAT', 'Fiber'],
    required: true
  },
  status: {
    type: String,
    enum: ['On Air', 'Off Air', 'Maintenance', 'Planned'],
    default: 'On Air'
  },
  supervisor: {
    type: String,
    trim: true
  },
  region: {
    type: String,
    trim: true
  },
  coordinates: {
    latitude: Number,
    longitude: Number
  },
  alarms: [{
    type: {
      type: String,
      enum: ['Critical', 'Major', 'Minor', 'Warning']
    },
    message: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    resolved: {
      type: Boolean,
      default: false
    }
  }],
  lastSeen: {
    type: Date,
    default: Date.now
  },
  uptime: {
    type: Number,
    default: 100 // percentage
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
siteSchema.index({ state: 1, city: 1 });
siteSchema.index({ transmission: 1 });
siteSchema.index({ status: 1 });
siteSchema.index({ siteName: 'text', city: 'text' }); // Text search

// Virtual for site location
siteSchema.virtual('location').get(function() {
  return `${this.city}, ${this.state}`;
});

// Static method to find sites by state
siteSchema.statics.findByState = function(state) {
  return this.find({ state: new RegExp(state, 'i') });
};

// Static method to get sites with active alarms
siteSchema.statics.getSitesWithAlarms = function() {
  return this.find({ 'alarms.resolved': false });
};

// Instance method to add alarm
siteSchema.methods.addAlarm = function(type, message) {
  this.alarms.push({
    type,
    message,
    timestamp: new Date()
  });
  return this.save();
};

// Instance method to resolve alarm
siteSchema.methods.resolveAlarm = function(alarmId) {
  const alarm = this.alarms.id(alarmId);
  if (alarm) {
    alarm.resolved = true;
    return this.save();
  }
  return Promise.reject(new Error('Alarm not found'));
};

const Site = mongoose.model('Site', siteSchema);

export default Site;
