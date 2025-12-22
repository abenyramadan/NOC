import mongoose from "mongoose";

const emailConfigSchema = new mongoose.Schema(
  {
    dailyReports: [
      {
        type: String,
        lowercase: true,
        trim: true,
      },
    ],
    hourlyReports: [
      {
        type: String,
        lowercase: true,
        trim: true,
      },
    ],
    immediateAlerts: [
      {
        type: String,
        lowercase: true,
        trim: true,
      },
    ],
    fromEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: "",
    },
    smtpUser: {
      type: String,
      trim: true,
      default: "",
    },
    smtpPass: {
      type: String,
      trim: true,
      default: "",
    },
    smtpHost: {
      type: String,
      trim: true,
      default: "",
    },
    smtpPort: {
      type: Number,
      default: 0,
    },
    smtpSecure: {
      type: Boolean,
      default: false,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Ensure only one email configuration document exists
emailConfigSchema.statics.getConfig = async function () {
  let config = await this.findOne().sort({ createdAt: -1 });
  if (!config) {
    // Create default configuration from environment variables
    config = new this({
      dailyReports: process.env.DAILY_REPORT_EMAILS
        ? process.env.DAILY_REPORT_EMAILS.split(",").map((email) =>
            email.trim().toLowerCase()
          )
        : [],
      hourlyReports: process.env.HOURLY_REPORT_EMAILS
        ? process.env.HOURLY_REPORT_EMAILS.split(",").map((email) =>
            email.trim().toLowerCase()
          )
        : process.env.NOC_EMAILS
        ? process.env.NOC_EMAILS.split(",").map((email) =>
            email.trim().toLowerCase()
          )
        : [],
      immediateAlerts: process.env.NOC_ALERTS_EMAIL
        ? process.env.NOC_ALERTS_EMAIL.split(",").map((email) =>
            email.trim().toLowerCase()
          )
        : process.env.NOC_EMAILS
        ? process.env.NOC_EMAILS.split(",").map((email) =>
            email.trim().toLowerCase()
          )
        : [],
      fromEmail: process.env.FROM_EMAIL
        ? process.env.FROM_EMAIL.trim().toLowerCase()
        : "",
      smtpUser: process.env.SMTP_USER ? process.env.SMTP_USER.trim() : "",
      smtpPass: process.env.SMTP_PASS ? process.env.SMTP_PASS.trim() : "",
      smtpHost: process.env.SMTP_HOST ? process.env.SMTP_HOST.trim() : "",
      smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 0,
      smtpSecure: process.env.SMTP_SECURE === "true",
      updatedBy: null, // Will be set when first updated by a user
    });
    await config.save();
  }
  return config;
};

emailConfigSchema.statics.updateConfig = async function (updateData, userId) {
  // Find and update the existing configuration
  const config = await this.findOne().sort({ createdAt: -1 });
  if (!config) {
    // Create new configuration if none exists
    const newConfig = new this({
      ...updateData,
      updatedBy: userId,
    });
    return await newConfig.save();
  }
  // Update existing configuration
  if (updateData.fromEmail !== undefined) {
    config.fromEmail = updateData.fromEmail.trim().toLowerCase();
  }
  if (updateData.smtpUser !== undefined) {
    config.smtpUser = updateData.smtpUser.trim();
  }
  if (updateData.smtpPass !== undefined) {
    config.smtpPass = updateData.smtpPass.trim();
  }
  if (updateData.smtpHost !== undefined) {
    config.smtpHost = String(updateData.smtpHost).trim();
  }
  if (updateData.smtpPort !== undefined) {
    const port = Number(updateData.smtpPort);
    config.smtpPort = Number.isFinite(port) ? port : config.smtpPort;
  }
  if (updateData.smtpSecure !== undefined) {
    config.smtpSecure = !!updateData.smtpSecure;
  }
  Object.assign(config, updateData);
  config.updatedBy = userId;
  return await config.save();
};

export default mongoose.model("EmailConfig", emailConfigSchema);
