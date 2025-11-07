import { BaseIntegration } from './BaseIntegration.js';

/**
 * iMaster NCE (Network Management System) integration
 * Huawei's iMaster NCE is a network management and control platform
 */
export class IMasterNCEIntegration extends BaseIntegration {
  constructor(config) {
    super(config);
    this.alarmEndpoint = config.alarmEndpoint || '/restconf/data/huawei-nce-alarm:alarms';
    this.deviceEndpoint = config.deviceEndpoint || '/restconf/data/huawei-nce-inventory:devices';
  }

  /**
   * Test connection to iMaster NCE
   */
  async testConnection() {
    try {
      const axios = this.getAxiosInstance();

      // Test with a simple API call
      const response = await axios.get('/restconf/data/huawei-nce-alarm:alarms/alarm', {
        params: {
          limit: 1
        }
      });

      if (response.status === 200) {
        console.log(`✅ iMaster NCE connection successful`);
        return true;
      }
    } catch (error) {
      console.error(`❌ iMaster NCE connection failed:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch alarms from iMaster NCE
   */
  async fetchAlarms() {
    try {
      const axios = this.getAxiosInstance();

      // Get active alarms using RESTCONF
      const response = await axios.get(`${this.alarmEndpoint}/alarm`, {
        params: {
          limit: 1000
        }
      });

      const alarms = response.data?.['huawei-nce-alarm:alarms']?.alarm || [];
      return Array.isArray(alarms) ? alarms : [];
    } catch (error) {
      console.error(`❌ Failed to fetch iMaster NCE alarms:`, error.message);
      throw error;
    }
  }

  /**
   * Process iMaster NCE alarm data
   */
  processAlarm(rawAlarm) {
    const baseAlarm = super.processAlarm(rawAlarm);

    return {
      ...baseAlarm,
      externalId: rawAlarm['alarm-id'] || rawAlarm.alarmId,
      title: rawAlarm['alarm-name'] || rawAlarm.name || 'NCE Alarm',
      description: rawAlarm['alarm-description'] || rawAlarm.description || '',
      severity: this.mapNCESeverity(rawAlarm.severity),
      deviceId: rawAlarm['ne-id'] || rawAlarm.deviceId,
      siteId: rawAlarm['site-id'] || rawAlarm.location,
      alarmType: rawAlarm['alarm-type'] || rawAlarm.category,
      occurredAt: rawAlarm['occur-time'] || rawAlarm.timestamp,
      additionalData: {
        neType: rawAlarm['ne-type'],
        productId: rawAlarm['product-id'],
        networkId: rawAlarm['network-id']
      }
    };
  }

  /**
   * Map iMaster NCE severity levels
   */
  mapNCESeverity(severity) {
    const severityMap = {
      'critical': 'critical',
      'major': 'major',
      'minor': 'minor',
      'warning': 'minor',
      'cleared': 'cleared'
    };
    return severityMap[severity?.toLowerCase()] || 'minor';
  }
}
