const HuaweiMaeAlarmReceiver = require('./huaweiMaeAlarmReceiver');
const HuaweiMaeAlarm = require('../models/HuaweiMaeAlarm');
const Alarm = require('../models/Alarm');
const config = require('../config/huaweiMaeConfig');
const logger = require('../utils/logger');
const { EventEmitter } = require('events');

class HuaweiMaeStreamingService extends EventEmitter {
  constructor(alarmService) {
    super();
    this.alarmService = alarmService;
    this.receiver = null;
    this.isRunning = false;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    logger.info('Initializing Huawei MAE Streaming Service');
    
    try {
      // Create and configure the alarm receiver
      this.receiver = new HuaweiMaeAlarmReceiver({
        host: config.host,
        port: config.port,
        sslEnabled: config.sslEnabled,
        reconnect: config.reconnect,
        reconnectDelay: config.reconnectDelay,
        maxReconnectAttempts: config.maxReconnectAttempts,
        clientCert: config.sslOptions.cert,
        clientKey: config.sslOptions.key,
      });

      // Set up event handlers
      this._setupEventHandlers();
      
      this.initialized = true;
      logger.info('Huawei MAE Streaming Service initialized');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Huawei MAE Streaming Service:', error);
      throw error;
    }
  }

  _setupEventHandlers() {
    this.receiver.on('connected', () => {
      logger.info('Connected to Huawei MAE Alarm Streaming Interface');
      this.isRunning = true;
      this.emit('connected');
    });

    this.receiver.on('disconnected', () => {
      logger.warn('Disconnected from Huawei MAE Alarm Streaming Interface');
      this.isRunning = false;
      this.emit('disconnected');
    });

    this.receiver.on('error', (error) => {
      logger.error('Huawei MAE Alarm Receiver error:', error);
      this.emit('error', error);
    });

    this.receiver.on('handshake', (handshake) => {
      logger.debug(`Received handshake: ${handshake.timestamp}`);
      this.emit('handshake', handshake);
    });

    this.receiver.on('alarm', async (alarmData) => {
      try {
        logger.debug('Processing incoming alarm:', alarmData);
        const processedAlarm = await this._processAlarm(alarmData);
        this.emit('alarm', processedAlarm);
      } catch (error) {
        logger.error('Error processing alarm:', error);
        this.emit('alarmError', { error, alarmData });
      }
    });
  }

  async _processAlarm(alarmData) {
    // Convert alarm data to match our HuaweiMaeAlarm model
    const alarm = {
      alarmId: alarmData.AlarmID,
      alarmName: alarmData.AlarmName,
      neName: alarmData.NeName,
      neType: alarmData.NeType,
      neFdn: alarmData.NeFdn,
      severity: this._mapSeverity(alarmData.Severity),
      category: alarmData.Category,
      state: alarmData.State,
      location: alarmData.Location,
      occurTime: new Date(alarmData.Occurtime),
      additionalInfo: { ...alarmData } // Store all original fields
    };

    try {
      // Save to HuaweiMaeAlarm collection
      const savedAlarm = await HuaweiMaeAlarm.findOneAndUpdate(
        { alarmId: alarm.alarmId, neName: alarm.neName },
        { $set: alarm },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // If configured, also create/update NOC alarm
      if (this.alarmService && this.alarmService.config.autoCreateNocAlarms) {
        await this._syncWithNocAlarms(savedAlarm);
      }

      return savedAlarm;
    } catch (error) {
      logger.error('Failed to save alarm:', error);
      throw error;
    }
  }

  async _syncWithNocAlarms(huaweiAlarm) {
    try {
      // Check if this alarm already exists in the NOC alarm system
      const existingAlarm = await Alarm.findOne({ 
        source: 'huawei-mae',
        sourceAlarmId: huaweiAlarm.alarmId,
        sourceNeName: huaweiAlarm.neName
      });

      const alarmData = {
        title: `${huaweiAlarm.alarmName} on ${huaweiAlarm.neName}`,
        description: huaweiAlarm.additionalInfo.Description || huaweiAlarm.alarmName,
        severity: huaweiAlarm.severity,
        status: this._mapAlarmStatus(huaweiAlarm.state),
        source: 'huawei-mae',
        sourceAlarmId: huaweiAlarm.alarmId,
        sourceNeName: huaweiAlarm.neName,
        occurredAt: huaweiAlarm.occurTime,
        acknowledged: huaweiAlarm.state.toLowerCase().includes('acknowledged'),
        cleared: huaweiAlarm.state.toLowerCase().includes('cleared'),
        additionalInfo: {
          neType: huaweiAlarm.neType,
          location: huaweiAlarm.location,
          ...huaweiAlarm.additionalInfo
        }
      };

      if (existingAlarm) {
        // Update existing alarm
        const updatedAlarm = await Alarm.findByIdAndUpdate(
          existingAlarm._id,
          { $set: alarmData },
          { new: true }
        );
        return updatedAlarm;
      } else {
        // Create new alarm
        const newAlarm = new Alarm(alarmData);
        return await newAlarm.save();
      }
    } catch (error) {
      logger.error('Error syncing with NOC alarms:', error);
      throw error;
    }
  }

  _mapSeverity(huaweiSeverity) {
    const severityMap = {
      'critical': 'CRITICAL',
      'major': 'MAJOR',
      'minor': 'MINOR',
      'warning': 'WARNING',
      'indeterminate': 'INDETERMINATE',
      'cleared': 'CLEARED'
    };
    
    const normalized = (huaweiSeverity || '').toLowerCase();
    return severityMap[normalized] || 'INDETERMINATE';
  }

  _mapAlarmStatus(state) {
    const stateStr = (state || '').toLowerCase();
    
    if (stateStr.includes('cleared')) return 'CLEARED';
    if (stateStr.includes('acknowledged')) return 'ACKNOWLEDGED';
    return 'ACTIVE';
  }

  async start() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (this.isRunning) {
      logger.warn('Huawei MAE Streaming Service is already running');
      return;
    }
    
    try {
      logger.info('Starting Huawei MAE Streaming Service');
      this.receiver.connect();
      this.isRunning = true;
      
      // Request active alarms if configured
      if (config.syncOnConnect) {
        setTimeout(() => {
          if (this.receiver && this.receiver.requestActiveAlarms) {
            logger.info('Requesting active alarms from MAE');
            this.receiver.requestActiveAlarms();
          }
        }, 5000); // Wait 5 seconds after connection
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to start Huawei MAE Streaming Service:', error);
      throw error;
    }
  }

  async stop() {
    if (!this.isRunning) {
      logger.warn('Huawei MAE Streaming Service is not running');
      return;
    }
    
    try {
      logger.info('Stopping Huawei MAE Streaming Service');
      this.receiver.disconnect();
      this.isRunning = false;
      this.emit('stopped');
      return true;
    } catch (error) {
      logger.error('Error stopping Huawei MAE Streaming Service:', error);
      throw error;
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isConnected: this.receiver ? this.receiver.isConnected : false,
      host: config.host,
      port: config.port,
      sslEnabled: config.sslEnabled,
      reconnectAttempts: this.receiver ? this.receiver.reconnectAttempts : 0
    };
  }
}

module.exports = HuaweiMaeStreamingService;
