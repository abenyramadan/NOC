// Script to migrate SMTP_USER and SMTP_PASS from .env to EmailConfig in DB
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import EmailConfig from "../models/EmailConfig.js";

async function migrateSmtpConfig() {
  const mongoUri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    "mongodb://localhost:27017/noc";
  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  const config = await EmailConfig.getConfig();
  let updated = false;
  if (!config.smtpUser && process.env.SMTP_USER) {
    config.smtpUser = process.env.SMTP_USER;
    updated = true;
  }
  if (!config.smtpPass && process.env.SMTP_PASS) {
    config.smtpPass = process.env.SMTP_PASS;
    updated = true;
  }
  if (updated) {
    await config.save();
    console.log("✅ SMTP credentials migrated to EmailConfig in DB.");
  } else {
    console.log(
      "ℹ️ SMTP credentials already present in DB or missing in .env."
    );
  }
  await mongoose.disconnect();
}

migrateSmtpConfig().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
