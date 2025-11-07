import { BaseIntegration } from './BaseIntegration.js';

/**
 * NetEco monitoring system integration
 * Huawei's NetEco is a data center infrastructure management system
 */
export class NetEcoIntegration extends BaseIntegration {
  constructor(config) {
    super(config);
    this.alarmEndpoint = config.alarmEndpoint || '/rest/openapi/smartsite/alarm/v1/alarms';
    this.deviceEndpoint = config.deviceEndpoint || '/rest/openapi/smartsite/device/v1/devices';
  }

  /**
   * Test connection to NetEco
   */
  async testConnection() {
    try {
      const axios = this.getAxiosInstance();

      // Test with a simple API call
      const response = await axios.get('/rest/openapi/smartsite/alarm/v1/alarms', {
        params: {
          page: 1,
          size: 1
        }
      });

      if (response.status === 200) {
        console.log(`✅ NetEco connection successful`);
        return true;
      }
    } catch (error) {
      console.error(`❌ NetEco connection failed:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch alarms from NetEco
   */
  async fetchAlarms() {
    try {
      const axios = this.getAxiosInstance();

      // Get active alarms
      const response = await axios.get(this.alarmEndpoint, {
        params: {
          status: 'active',
          page: 1,
          size: 1000
        }
      });

      return response.data?.data || response.data || [];
    } catch (error) {
      console.error(`❌ Failed to fetch NetEco alarms:`, error.message);
      throw error;
    }
  }

  /**
   * Process NetEco alarm data
   */
  processAlarm(rawAlarm) {
    const baseAlarm = super.processAlarm(rawAlarm);

    return {
      ...baseAlarm,
      externalId: rawAlarm.alarmId || rawAlarm.id,
      title: rawAlarm.alarmName || rawAlarm.name || 'NetEco Alarm',
      description: rawAlarm.description || rawAlarm.details || '',
      severity: this.mapNetEcoSeverity(rawAlarm.severity),
      deviceId: rawAlarm.deviceId || rawAlarm.neId,
      siteId: rawAlarm.siteId || rawAlarm.location,
      alarmType: rawAlarm.alarmType || rawAlarm.category,
      occurredAt: rawAlarm.occurTime || rawAlarm.timestamp,
      additionalData: {
        neType: rawAlarm.neType,
        productId: rawAlarm.productId,
        devCsn: rawAlarm.devCsn
      }
    };
  }

  /**
   * Map NetEco severity levels
   */
  mapNetEcoSeverity(severity) {
    const severityMap = {
      '1': 'critical',    // Critical
      '2': 'major',       // Major
      '3': 'minor',       // Minor
      '4': 'warning',     // Warning
      '0': 'cleared'      // Cleared
    };
    return severityMap[severity] || 'minor';
  }
}
