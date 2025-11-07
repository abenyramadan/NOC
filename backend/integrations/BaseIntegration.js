import axios from 'axios';
import Alarm from '../models/Alarm.js';
import { emailService } from '../services/emailService.js';

/**
 * Base class for third-party monitoring system integrations
 */
export class BaseIntegration {
  constructor(config) {
    this.config = config;
    this.name = config.name;
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.username = config.username;
    this.password = config.password;
    this.enabled = config.enabled !== false;
  }

  /**
   * Get authentication headers
   */
  getAuthHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'NOC-Alert-System/1.0'
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    } else if (this.username && this.password) {
      headers['Authorization'] = `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`;
    }

    return headers;
  }

  /**
   * Create axios instance with proper configuration
   */
  getAxiosInstance() {
    return axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: this.getAuthHeaders(),
      httpsAgent: this.config.rejectUnauthorized === false ? {
        rejectUnauthorized: false
      } : undefined
    });
  }

  /**
   * Test connection to the monitoring system
   */
  async testConnection() {
    throw new Error('testConnection method must be implemented by subclass');
  }

  /**
   * Fetch alarms from the monitoring system
   */
  async fetchAlarms() {
    throw new Error('fetchAlarms method must be implemented by subclass');
  }

  /**
   * Process and normalize alarm data
   */
  processAlarm(rawAlarm) {
    return {
      source: this.name,
      externalId: rawAlarm.id || rawAlarm.alarmId,
      title: rawAlarm.title || rawAlarm.name || 'Unknown Alarm',
      description: rawAlarm.description || rawAlarm.details || '',
      severity: this.mapSeverity(rawAlarm.severity),
      status: this.mapStatus(rawAlarm.status),
      deviceId: rawAlarm.deviceId || rawAlarm.neId,
      siteId: rawAlarm.siteId || rawAlarm.location,
      alarmType: rawAlarm.type || rawAlarm.category,
      occurredAt: rawAlarm.occurredAt || rawAlarm.timestamp,
      clearedAt: rawAlarm.clearedAt || null,
      rawData: rawAlarm
    };
  }

  /**
   * Map external severity to internal format
   */
  mapSeverity(externalSeverity) {
    const severityMap = {
      'critical': 'critical',
      'major': 'major',
      'minor': 'minor',
      'warning': 'minor',
      'info': 'minor',
      'cleared': 'cleared'
    };
    return severityMap[externalSeverity?.toLowerCase()] || 'minor';
  }

  /**
   * Map external status to internal format
   */
  mapStatus(externalStatus) {
    const statusMap = {
      'active': 'active',
      'acknowledged': 'acknowledged',
      'cleared': 'cleared',
      'resolved': 'cleared'
    };
    return statusMap[externalStatus?.toLowerCase()] || 'active';
  }

  /**
   * Sync alarms from monitoring system
   */
  async syncAlarms() {
    try {
      console.log(`🔄 Starting alarm sync for ${this.name}`);

      if (!this.enabled) {
        console.log(`⏭️ ${this.name} integration is disabled, skipping`);
        return { success: true, alarmsProcessed: 0 };
      }

      // Test connection first
      await this.testConnection();

      // Fetch alarms from external system
      const rawAlarms = await this.fetchAlarms();

      console.log(`📥 Retrieved ${rawAlarms.length} alarms from ${this.name}`);

      let processed = 0;
      let updated = 0;
      let errors = 0;

      for (const rawAlarm of rawAlarms) {
        try {
          const processedAlarm = this.processAlarm(rawAlarm);

          // Check if alarm already exists
          const existingAlarm = await Alarm.findOne({
            source: this.name,
            externalId: processedAlarm.externalId
          });

          if (existingAlarm) {
            // Update existing alarm
            Object.assign(existingAlarm, processedAlarm);
            await existingAlarm.save();
            updated++;
          } else {
            // Create new alarm
            const newAlarm = new Alarm(processedAlarm);
            await newAlarm.save();
            processed++;

            // Send email notification for new alarm
            try {
              const recipients = process.env.NOC_ALERTS_EMAIL ? process.env.NOC_ALERTS_EMAIL.split(',') : [];
              if (recipients.length > 0 && emailService && emailService.isConfigured) {
                await emailService.sendAlarmNotification({
                  alarmId: newAlarm._id,
                  siteName: newAlarm.siteName,
                  siteId: newAlarm.siteId,
                  severity: newAlarm.severity,
                  alarmType: newAlarm.alarmType,
                  description: newAlarm.description,
                  source: newAlarm.source,
                  timestamp: newAlarm.timestamp,
                  recipients: recipients
                });
                console.log(`📧 Email notification sent for new alarm: ${newAlarm._id}`);
              }
            } catch (emailError) {
              console.error(`⚠️ Failed to send email for alarm ${newAlarm._id}:`, emailError.message);
              // Don't fail the alarm creation if email fails
            }
          }
        } catch (error) {
          console.error(`❌ Error processing alarm ${rawAlarm.id}:`, error.message);
          errors++;
        }
      }

      console.log(`✅ ${this.name} sync completed: ${processed} new, ${updated} updated, ${errors} errors`);

      return {
        success: true,
        alarmsProcessed: processed,
        alarmsUpdated: updated,
        errors
      };

    } catch (error) {
      console.error(`❌ ${this.name} sync failed:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}
