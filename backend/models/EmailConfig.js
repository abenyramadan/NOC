import mongoose from 'mongoose';

const emailConfigSchema = new mongoose.Schema({
  dailyReports: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  hourlyReports: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  immediateAlerts: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Ensure only one email configuration document exists
emailConfigSchema.statics.getConfig = async function() {
  let config = await this.findOne().sort({ createdAt: -1 });
  if (!config) {
    // Create default configuration from environment variables
    config = new this({
      dailyReports: process.env.DAILY_REPORT_EMAILS ? 
        process.env.DAILY_REPORT_EMAILS.split(',').map(email => email.trim().toLowerCase()) : [],
      hourlyReports: process.env.HOURLY_REPORT_EMAILS ? 
        process.env.HOURLY_REPORT_EMAILS.split(',').map(email => email.trim().toLowerCase()) : 
        (process.env.NOC_EMAILS ? process.env.NOC_EMAILS.split(',').map(email => email.trim().toLowerCase()) : []),
      immediateAlerts: process.env.NOC_ALERTS_EMAIL ? 
        process.env.NOC_ALERTS_EMAIL.split(',').map(email => email.trim().toLowerCase()) : 
        (process.env.NOC_EMAILS ? process.env.NOC_EMAILS.split(',').map(email => email.trim().toLowerCase()) : []),
      updatedBy: null // Will be set when first updated by a user
    });
    await config.save();
  }
  return config;
};

emailConfigSchema.statics.updateConfig = async function(updateData, userId) {
  // Find and update the existing configuration
  const config = await this.findOne().sort({ createdAt: -1 });
  if (!config) {
    // Create new configuration if none exists
    const newConfig = new this({
      ...updateData,
      updatedBy: userId
    });
    return await newConfig.save();
  }
  
  // Update existing configuration
  Object.assign(config, updateData);
  config.updatedBy = userId;
  return await config.save();
};

export default mongoose.model('EmailConfig', emailConfigSchema);
