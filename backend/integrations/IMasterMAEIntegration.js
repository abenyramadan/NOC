import { BaseIntegration } from './BaseIntegration.js';

/**
 * iMaster MAE (Maintenance Automation Environment) integration
 * Huawei's iMaster MAE is an intelligent O&M platform
 */
export class IMasterMAEIntegration extends BaseIntegration {
  constructor(config) {
    super(config);
    this.alarmEndpoint = config.alarmEndpoint || '/rest/openapi/mae/alarm/v1/alarms';
    this.deviceEndpoint = config.deviceEndpoint || '/rest/openapi/mae/device/v1/devices';
  }

  /**
   * Test connection to iMaster MAE
   */
  async testConnection() {
    try {
      const axios = this.getAxiosInstance();

      // Test with a simple API call
      const response = await axios.get('/rest/openapi/mae/alarm/v1/alarms', {
        params: {
          page: 1,
          size: 1
        }
      });

      if (response.status === 200) {
        console.log(`✅ iMaster MAE connection successful`);
        return true;
      }
    } catch (error) {
      console.error(`❌ iMaster MAE connection failed:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch alarms from iMaster MAE
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
      console.error(`❌ Failed to fetch iMaster MAE alarms:`, error.message);
      throw error;
    }
  }

  /**
   * Process iMaster MAE alarm data
   */
  processAlarm(rawAlarm) {
    const baseAlarm = super.processAlarm(rawAlarm);

    return {
      ...baseAlarm,
      externalId: rawAlarm.alarmId || rawAlarm.id,
      title: rawAlarm.alarmName || rawAlarm.name || 'MAE Alarm',
      description: rawAlarm.description || rawAlarm.details || '',
      severity: this.mapMAESeverity(rawAlarm.severity),
      deviceId: rawAlarm.deviceId || rawAlarm.neId,
      siteId: rawAlarm.siteId || rawAlarm.location,
      alarmType: rawAlarm.alarmType || rawAlarm.category,
      occurredAt: rawAlarm.occurTime || rawAlarm.timestamp,
      additionalData: {
        neType: rawAlarm.neType,
        productId: rawAlarm.productId,
        maintenanceId: rawAlarm.maintenanceId
      }
    };
  }

  /**
   * Map iMaster MAE severity levels
   */
  mapMAESeverity(severity) {
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
