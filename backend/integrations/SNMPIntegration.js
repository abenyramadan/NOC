import { BaseIntegration } from './BaseIntegration.js';
import snmp from 'snmp-native';
import dgram from 'dgram';

/**
 * SNMP Integration for receiving traps from monitoring systems
 * Receives SNMP traps from NetEco, iMaster NCE, iMaster MAE
 */
export class SNMPIntegration extends BaseIntegration {
  constructor(config) {
    super(config);
    this.name = 'SNMP';
    this.enabled = config.enabled !== false;

    // SNMP configuration from the provided settings
    this.listenAddress = config.listenAddress || '0.0.0.0';
    this.listenPort = config.listenPort || 4700; // Port for receiving requests
    this.trapPort = config.trapPort || 6666;     // Port for sending traps

    // SNMP Agent Settings
    this.mibType = config.mibType || 'mib2';
    this.trapInterval = config.trapInterval || 0;

    // Alarm field mappings based on the provided configuration
    this.fieldMappings = {
      'Csn': 'csn',                    // Network serial number of an alarm
      'Category': 'category',          // Alarm category
      'OccurTime': 'occurTime',        // Alarm occurrence time
      'MOName': 'deviceName',          // Device name
      'ProductID': 'productId',        // ID of a product
      'NEType': 'neType',             // NE type name
      'NEDEVID': 'neDevId',           // Unique NE ID
      'DevCsn': 'devCsn',             // NE serial number of an alarm
      'ID': 'alarmId',                // Alarm ID
      'Type': 'alarmType',            // Alarm type
      'Level': 'severity',            // Alarm severity
      'Restore': 'isCleared',         // Alarm clearance flag
      'Confirm': 'isAcknowledged',    // Alarm acknowledgement flag
      'AckTime': 'ackTime',           // Alarm acknowledgement time
      'Description': 'description'    // Alarm description
    };

    this.session = null;
    this.trapServer = null;
    this.isListening = false;
  }

  /**
   * Test connection (SNMP trap listener)
   */
  async testConnection() {
    try {
      // For SNMP, we just test if we can bind to the port
      return new Promise((resolve, reject) => {
        const testServer = dgram.createSocket('udp4');

        testServer.on('error', (error) => {
          testServer.close();
          reject(error);
        });

        testServer.on('listening', () => {
          testServer.close();
          console.log(`✅ SNMP listener test successful on port ${this.listenPort}`);
          resolve(true);
        });

        testServer.bind(this.listenPort);
      });
    } catch (error) {
      console.error(`❌ SNMP connection test failed:`, error.message);
      throw error;
    }
  }

  /**
   * Start listening for SNMP traps
   */
  startListening() {
    if (this.isListening) {
      console.log('🔄 SNMP listener already running');
      return;
    }

    console.log(`📡 Starting SNMP trap listener on ${this.listenAddress}:${this.listenPort}`);

    // Create UDP server for receiving traps
    this.trapServer = dgram.createSocket('udp4');

    this.trapServer.on('message', (msg, rinfo) => {
      this.handleTrap(msg, rinfo);
    });

    this.trapServer.on('error', (error) => {
      console.error('❌ SNMP trap server error:', error.message);
    });

    this.trapServer.on('listening', () => {
      console.log(`✅ SNMP trap listener started on port ${this.listenPort}`);
      this.isListening = true;
    });

    this.trapServer.bind(this.listenPort);

    // Also initialize SNMP session for sending traps if needed
    this.session = new snmp.Session();
  }

  /**
   * Stop listening for SNMP traps
   */
  stopListening() {
    if (this.trapServer) {
      this.trapServer.close();
      this.trapServer = null;
      this.isListening = false;
      console.log('⏹️ SNMP trap listener stopped');
    }

    if (this.session) {
      this.session.close();
      this.session = null;
    }
  }

  /**
   * Handle incoming SNMP trap
   */
  async handleTrap(rawMessage, remoteInfo) {
    try {
      console.log(`📥 Received SNMP trap from ${remoteInfo.address}:${remoteInfo.port}`);

      // Parse SNMP trap message
      const trapData = this.parseSNMPTrap(rawMessage);

      if (!trapData) {
        console.log('⚠️ Could not parse SNMP trap, skipping');
        return;
      }

      // Convert to NOC alarm format
      const alarm = await this.processSNMPTrap(trapData);

      if (alarm) {
        console.log(`✅ Processed SNMP alarm: ${alarm.title} (${alarm.severity})`);
      }

    } catch (error) {
      console.error('❌ Error handling SNMP trap:', error.message);
    }
  }

  /**
   * Parse SNMP trap message (simplified implementation)
   * In a real implementation, you'd use proper SNMP parsing
   */
  parseSNMPTrap(rawMessage) {
    try {
      // This is a simplified parser - in production you'd use proper SNMP libraries
      // For now, we'll assume the trap contains alarm data in a structured format

      // Check if this looks like an alarm trap
      const messageStr = rawMessage.toString();

      // Look for alarm-specific OIDs or patterns
      if (messageStr.includes('alarm') || messageStr.includes('trap')) {
        // Extract basic information from trap
        return {
          source: remoteInfo.address,
          timestamp: new Date(),
          rawData: messageStr,
          // In real implementation, parse actual SNMP varbinds
          varbinds: this.extractVarbinds(messageStr)
        };
      }

      return null;
    } catch (error) {
      console.error('❌ Error parsing SNMP trap:', error.message);
      return null;
    }
  }

  /**
   * Extract varbinds from SNMP trap message
   * This is a simplified implementation - real SNMP parsing is more complex
   */
  extractVarbinds(messageStr) {
    // In a real implementation, this would parse actual SNMP PDU structure
    // For now, return a mock structure based on the field mappings provided
    return {
      '1.3.6.1.4.1.2011.2.15.1.1.1.1': 'test-csn',      // Csn
      '1.3.6.1.4.1.2011.2.15.1.1.1.2': 'Communication', // Category
      '1.3.6.1.4.1.2011.2.15.1.1.1.3': new Date(),      // OccurTime
      '1.3.6.1.4.1.2011.2.15.1.1.1.4': 'TestDevice',   // MOName
      '1.3.6.1.4.1.2011.2.15.1.1.1.5': 'Product123',   // ProductID
      '1.3.6.1.4.1.2011.2.15.1.1.1.6': 'Router',       // NEType
      '1.3.6.1.4.1.2011.2.15.1.1.1.7': 'NE12345',      // NEDEVID
      '1.3.6.1.4.1.2011.2.15.1.1.1.8': 'DEV123',       // DevCsn
      '1.3.6.1.4.1.2011.2.15.1.1.1.9': 'ALARM001',     // ID
      '1.3.6.1.4.1.2011.2.15.1.1.1.10': 'LinkDown',    // Type
      '1.3.6.1.4.1.2011.2.15.1.1.1.11': '2',           // Level (Major)
      '1.3.6.1.4.1.2011.2.15.1.1.1.12': '0',           // Restore (Not cleared)
      '1.3.6.1.4.1.2011.2.15.1.1.1.13': '0',           // Confirm (Not acknowledged)
      '1.3.6.1.4.1.2011.2.15.1.1.1.14': null,          // AckTime
      '1.3.6.1.4.1.2011.2.15.1.1.1.15': 'Link down on interface' // Description
    };
  }

  /**
   * Process SNMP trap into NOC alarm
   */
  async processSNMPTrap(trapData) {
    try {
      // Map SNMP varbinds to alarm fields using the provided mapping
      const alarmData = {};

      for (const [oid, value] of Object.entries(trapData.varbinds)) {
        // Map OID to field name using the configuration
        const fieldName = this.mapOIDToField(oid);
        if (fieldName) {
          alarmData[fieldName] = value;
        }
      }

      // Create alarm object
      const alarm = {
        source: 'SNMP',
        externalId: alarmData.alarmId || `SNMP_${Date.now()}`,
        title: `SNMP Alarm: ${alarmData.alarmType || 'Unknown'}`,
        description: alarmData.description || 'Alarm received via SNMP trap',
        severity: this.mapSNMPSeverity(alarmData.severity),
        status: alarmData.isCleared === '1' ? 'cleared' : 'active',
        deviceId: alarmData.neDevId || alarmData.deviceName,
        siteId: alarmData.siteId || 'SNMP',
        alarmType: alarmData.alarmType || 'SNMP',
        occurredAt: alarmData.occurTime || new Date(),
        clearedAt: alarmData.isCleared === '1' ? new Date() : null,
        rawData: trapData
      };

      // Check if alarm already exists
      const Alarm = (await import('../models/Alarm.js')).default;
      const existingAlarm = await Alarm.findOne({
        source: 'SNMP',
        externalId: alarm.externalId
      });

      if (existingAlarm) {
        // Update existing alarm
        Object.assign(existingAlarm, alarm);
        await existingAlarm.save();
        console.log(`🔄 Updated existing SNMP alarm: ${alarm.externalId}`);
      } else {
        // Create new alarm
        const newAlarm = new Alarm(alarm);
        await newAlarm.save();
        console.log(`✅ Created new SNMP alarm: ${alarm.externalId}`);
      }

      return alarm;

    } catch (error) {
      console.error('❌ Error processing SNMP trap:', error.message);
      throw error;
    }
  }

  /**
   * Map SNMP OID to field name using the provided mapping
   */
  mapOIDToField(oid) {
    // This would map actual SNMP OIDs to field names
    // For now, return a simplified mapping
    const oidMap = {
      '1.3.6.1.4.1.2011.2.15.1.1.1.1': 'csn',
      '1.3.6.1.4.1.2011.2.15.1.1.1.2': 'category',
      '1.3.6.1.4.1.2011.2.15.1.1.1.3': 'occurTime',
      '1.3.6.1.4.1.2011.2.15.1.1.1.4': 'deviceName',
      '1.3.6.1.4.1.2011.2.15.1.1.1.5': 'productId',
      '1.3.6.1.4.1.2011.2.15.1.1.1.6': 'neType',
      '1.3.6.1.4.1.2011.2.15.1.1.1.7': 'neDevId',
      '1.3.6.1.4.1.2011.2.15.1.1.1.8': 'devCsn',
      '1.3.6.1.4.1.2011.2.15.1.1.1.9': 'alarmId',
      '1.3.6.1.4.1.2011.2.15.1.1.1.10': 'alarmType',
      '1.3.6.1.4.1.2011.2.15.1.1.1.11': 'severity',
      '1.3.6.1.4.1.2011.2.15.1.1.1.12': 'isCleared',
      '1.3.6.1.4.1.2011.2.15.1.1.1.13': 'isAcknowledged',
      '1.3.6.1.4.1.2011.2.15.1.1.1.14': 'ackTime',
      '1.3.6.1.4.1.2011.2.15.1.1.1.15': 'description'
    };

    return oidMap[oid];
  }

  /**
   * Map SNMP severity levels (1-4 scale)
   */
  mapSNMPSeverity(severity) {
    const severityMap = {
      '1': 'critical',    // Critical
      '2': 'major',       // Major
      '3': 'minor',       // Minor
      '4': 'warning'      // Warning
    };
    return severityMap[severity] || 'minor';
  }

  /**
   * Send SNMP trap (for testing or notifications)
   */
  sendTrap(trapData) {
    if (!this.session) {
      console.error('❌ SNMP session not initialized');
      return;
    }

    // This would send an SNMP trap to configured destinations
    // Implementation depends on specific SNMP library capabilities
    console.log(`📤 Would send SNMP trap:`, trapData);
  }

  /**
   * Get SNMP listener status
   */
  getStatus() {
    return {
      name: this.name,
      enabled: this.enabled,
      listening: this.isListening,
      listenAddress: this.listenAddress,
      listenPort: this.listenPort,
      trapPort: this.trapPort,
      mibType: this.mibType
    };
  }
}
