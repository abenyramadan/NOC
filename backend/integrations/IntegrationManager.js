import { NetEcoIntegration } from './NetEcoIntegration.js';
import { IMasterNCEIntegration } from './IMasterNCEIntegration.js';
import { IMasterMAEIntegration } from './IMasterMAEIntegration.js';
import { SNMPIntegration } from './SNMPIntegration.js';

/**
 * Integration Manager - handles all third-party monitoring system integrations
 */
export class IntegrationManager {
  constructor() {
    this.integrations = new Map();
    this.syncInterval = null;
    this.isRunning = false;
  }

  /**
   * Register a new integration
   */
  registerIntegration(name, integration) {
    this.integrations.set(name, integration);
    console.log(`📦 Registered integration: ${name}`);
  }

  /**
   * Configure integrations from environment or config file
   */
  configureIntegrations() {
    // NetEco Configuration
    if (process.env.NETECO_ENABLED !== 'false') {
      const netecoConfig = {
        name: 'NetEco',
        baseUrl: process.env.NETECO_BASE_URL,
        apiKey: process.env.NETECO_API_KEY,
        username: process.env.NETECO_USERNAME,
        password: process.env.NETECO_PASSWORD,
        enabled: process.env.NETECO_ENABLED !== 'false',
        alarmEndpoint: process.env.NETECO_ALARM_ENDPOINT,
        deviceEndpoint: process.env.NETECO_DEVICE_ENDPOINT
      };

      if (netecoConfig.baseUrl) {
        this.registerIntegration('NetEco', new NetEcoIntegration(netecoConfig));
      }
    }

    // iMaster NCE Configuration
    if (process.env.IMASTER_NCE_ENABLED !== 'false') {
      const nceConfig = {
        name: 'iMasterNCE',
        baseUrl: process.env.IMASTER_NCE_BASE_URL,
        apiKey: process.env.IMASTER_NCE_API_KEY,
        username: process.env.IMASTER_NCE_USERNAME,
        password: process.env.IMASTER_NCE_PASSWORD,
        enabled: process.env.IMASTER_NCE_ENABLED !== 'false',
        alarmEndpoint: process.env.IMASTER_NCE_ALARM_ENDPOINT,
        deviceEndpoint: process.env.IMASTER_NCE_DEVICE_ENDPOINT
      };

      if (nceConfig.baseUrl) {
        this.registerIntegration('iMasterNCE', new IMasterNCEIntegration(nceConfig));
      }
    }

    // iMaster MAE Configuration
    if (process.env.IMASTER_MAE_ENABLED !== 'false') {
      const maeConfig = {
        name: 'iMasterMAE',
        baseUrl: process.env.IMASTER_MAE_BASE_URL,
        apiKey: process.env.IMASTER_MAE_API_KEY,
        username: process.env.IMASTER_MAE_USERNAME,
        password: process.env.IMASTER_MAE_PASSWORD,
        enabled: process.env.IMASTER_MAE_ENABLED !== 'false',
        alarmEndpoint: process.env.IMASTER_MAE_ALARM_ENDPOINT,
        deviceEndpoint: process.env.IMASTER_MAE_DEVICE_ENDPOINT
      };

      if (maeConfig.baseUrl) {
        this.registerIntegration('iMasterMAE', new IMasterMAEIntegration(maeConfig));
      }
    }

    // SNMP Integration Configuration
    if (process.env.SNMP_ENABLED !== 'false') {
      const snmpConfig = {
        name: 'SNMP',
        enabled: process.env.SNMP_ENABLED !== 'false',
        listenAddress: process.env.SNMP_LISTEN_ADDRESS || '0.0.0.0',
        listenPort: parseInt(process.env.SNMP_LISTEN_PORT) || 4700,
        trapPort: parseInt(process.env.SNMP_TRAP_PORT) || 6666,
        mibType: process.env.SNMP_MIB_TYPE || 'mib2',
        trapInterval: parseInt(process.env.SNMP_TRAP_INTERVAL) || 0
      };

      this.registerIntegration('SNMP', new SNMPIntegration(snmpConfig));

      // Start SNMP listener
      const snmpIntegration = this.integrations.get('SNMP');
      if (snmpIntegration && snmpIntegration.enabled) {
        snmpIntegration.startListening();
      }
    }
  }

  /**
   * Test all integrations
   * @returns {Promise<Object>} Test results for all integrations
   */
  async testAllIntegrations() {
    const results = {};

    for (const [name, integration] of this.integrations) {
      try {
        console.log(`🔍 Testing ${name}...`);
        await integration.testConnection();
        results[name] = { success: true };
        console.log(`✅ ${name} test passed`);
      } catch (error) {
        results[name] = { success: false, error: error.message };
        console.error(`❌ ${name} test failed:`, error.message);
      }
    }

    return results;
  }

  /**
   * Sync all integrations
   * @returns {Promise<Object>} Sync results for all integrations
   */
  async syncAllIntegrations() {
    const results = {};

    for (const [name, integration] of this.integrations) {
      console.log(`🔄 Starting sync for ${name}...`);
      results[name] = await integration.syncAlarms();
    }

    const totalProcessed = Object.values(results).reduce((sum, result) =>
      sum + (result.alarmsProcessed || 0), 0);
    const totalUpdated = Object.values(results).reduce((sum, result) =>
      sum + (result.alarmsUpdated || 0), 0);

    console.log(`📊 Sync completed: ${totalProcessed} new alarms, ${totalUpdated} updated alarms`);

    return results;
  }

  /**
   * Start automatic sync at specified interval
   * @param {number} intervalMinutes - Sync interval in minutes
   */
  startAutoSync(intervalMinutes = 5) {
    if (this.isRunning) {
      console.log('🔄 Auto-sync already running');
      return;
    }

    const intervalMs = intervalMinutes * 60 * 1000;
    console.log(`🚀 Starting auto-sync every ${intervalMinutes} minutes`);

    this.syncInterval = setInterval(async () => {
      try {
        await this.syncAllIntegrations();
      } catch (error) {
        console.error('❌ Auto-sync failed:', error.message);
      }
    }, intervalMs);

    this.isRunning = true;
  }

  /**
   * Stop automatic sync
   */
  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      this.isRunning = false;
      console.log('⏹️ Auto-sync stopped');
    }
  }

  /**
   * Get integration status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      integrationsCount: this.integrations.size,
      integrations: Array.from(this.integrations.keys()),
      nextSync: this.syncInterval ? new Date(Date.now() + 5 * 60 * 1000) : null
    };
  }

  /**
   * Get specific integration
   */
  getIntegration(name) {
    return this.integrations.get(name);
  }

  /**
   * Remove integration
   */
  removeIntegration(name) {
    this.integrations.delete(name);
    console.log(`🗑️ Removed integration: ${name}`);
  }
}

// Create singleton instance
export const integrationManager = new IntegrationManager();
