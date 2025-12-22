import HuaweiMaeClient from './huaweiMaeService.js';
import HuaweiMaeAlarm from '../models/HuaweiMaeAlarm.js';
import Alarm from '../models/Alarm.js';
import Site from '../models/Site.js';
import { EventEmitter } from 'events';

/**
 * Service to manage Huawei MAE alarm integration with NOC system
 */
class HuaweiMaeAlarmService extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      autoCreateNocAlarms: config.autoCreateNocAlarms !== false, // Default true
      enableSynchronization: config.enableSynchronization || false,
      maxProcessingRetries: config.maxProcessingRetries || 3,
      processingBatchSize: config.processingBatchSize || 100,
      ...config
    };
    
    this.client = null;
    this.isRunning = false;
    this.processingQueue = [];
    this.isProcessingQueue = false;
    
    this.logger = config.logger || console;
  }

  /**
   * Start the Huawei MAE alarm service
   */
  async start() {
    try {
      if (this.isRunning) {
        this.logger.warn('Huawei MAE alarm service is already running');
        return;
      }

      this.logger.info('Starting Huawei MAE alarm service');
      
      // Initialize the MAE client
      this.client = new HuaweiMaeClient(this.config);
      
      // Setup event handlers
      this.setupClientHandlers();
      
      // Connect to MAE
      await this.client.connect();
      
      this.isRunning = true;
      this.emit('started');
      this.logger.info('Huawei MAE alarm service started successfully');
      
    } catch (error) {
      this.logger.error('Failed to start Huawei MAE alarm service:', error.message);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Stop the Huawei MAE alarm service
   */
  async stop() {
    try {
      if (!this.isRunning) {
        this.logger.warn('Huawei MAE alarm service is not running');
        return;
      }

      this.logger.info('Stopping Huawei MAE alarm service');
      
      if (this.client) {
        this.client.disconnect();
        this.client = null;
      }
      
      this.isRunning = false;
      this.emit('stopped');
      this.logger.info('Huawei MAE alarm service stopped');
      
    } catch (error) {
      this.logger.error('Error stopping Huawei MAE alarm service:', error.message);
      this.emit('error', error);
    }
  }

  /**
   * Setup client event handlers
   */
  setupClientHandlers() {
    this.client.on('connected', () => {
      this.logger.info('Connected to Huawei MAE');
      this.emit('connected');
    });

    this.client.on('disconnected', () => {
      this.logger.warn('Disconnected from Huawei MAE');
      this.emit('disconnected');
    });

    this.client.on('error', (error) => {
      this.logger.error('Huawei MAE client error:', error.message);
      this.emit('error', error);
    });

    this.client.on('alarm', (alarm) => {
      this.handleIncomingAlarm(alarm);
    });

    this.client.on('handshake', (handshake) => {
      this.logger.debug('Received handshake from MAE:', handshake);
    });

    this.client.on('synchronizationStart', () => {
      this.logger.info('MAE alarm synchronization started');
      this.emit('synchronizationStart');
    });

    this.client.on('synchronizationEnd', () => {
      this.logger.info('MAE alarm synchronization completed');
      this.emit('synchronizationEnd');
    });

    this.client.on('maxReconnectAttemptsReached', () => {
      this.logger.error('Max reconnection attempts reached for MAE');
      this.emit('maxReconnectAttemptsReached');
    });
  }

  /**
   * Handle incoming alarm from MAE
   */
  async handleIncomingAlarm(maeAlarmData) {
    try {
      this.logger.debug('Processing incoming MAE alarm:', maeAlarmData.maeSn);
      
      // Check if alarm already exists
      const existingAlarm = await HuaweiMaeAlarm.findOne({
        maeSn: maeAlarmData.maeSn,
        alarmId: maeAlarmData.AlarmID
      });

      if (existingAlarm) {
        this.logger.debug(`Alarm ${maeAlarmData.maeSn} already exists, updating...`);
        await this.updateExistingAlarm(existingAlarm, maeAlarmData);
        return;
      }

      // Create new MAE alarm record
      const maeAlarm = await this.createMaeAlarmRecord(maeAlarmData);
      
      // Process the alarm (create NOC alarm if enabled)
      await this.processAlarm(maeAlarm);
      
      this.emit('alarmProcessed', maeAlarm);
      
    } catch (error) {
      this.logger.error('Error handling incoming alarm:', error.message);
      this.emit('alarmProcessingError', { error, alarmData: maeAlarmData });
    }
  }

  /**
   * Create MAE alarm record in database
   */
  async createMaeAlarmRecord(maeAlarmData) {
    const alarmData = {
      maeSn: maeAlarmData.Sn,
      neSn: maeAlarmData.NeSn,
      neFdn: maeAlarmData.NeFdn,
      neName: maeAlarmData.NeName,
      neType: maeAlarmData.NeType,
      alarmId: maeAlarmData.AlarmID,
      alarmName: maeAlarmData.AlarmName,
      category: maeAlarmData.Category || 'Fault',
      severity: maeAlarmData.Severity,
      state: maeAlarmData.State,
      occurtime: new Date(maeAlarmData.Occurtime),
      location: maeAlarmData.Location,
      receivedAt: new Date(maeAlarmData.receivedAt)
    };

    // Store additional fields
    const additionalFields = {};
    Object.keys(maeAlarmData).forEach(key => {
      if (!['Sn', 'NeSn', 'NeFdn', 'NeName', 'NeType', 'AlarmID', 'AlarmName', 'Category', 'Severity', 'State', 'Occurtime', 'Location', 'receivedAt'].includes(key)) {
        additionalFields[key] = maeAlarmData[key];
      }
    });
    
    if (Object.keys(additionalFields).length > 0) {
      alarmData.additionalInfo = additionalFields;
    }

    const maeAlarm = new HuaweiMaeAlarm(alarmData);
    return await maeAlarm.save();
  }

  /**
   * Update existing alarm with new data
   */
  async updateExistingAlarm(existingAlarm, maeAlarmData) {
    // Update state and other fields that might change
    if (maeAlarmData.State && existingAlarm.state !== maeAlarmData.State) {
      existingAlarm.state = maeAlarmData.State;
      existingAlarm.mappedStatus = existingAlarm.mapMaeStateToNocStatus();
    }

    // Update additional info if present
    if (maeAlarmData.Location && existingAlarm.location !== maeAlarmData.Location) {
      existingAlarm.location = maeAlarmData.Location;
    }

    existingAlarm.processedAt = new Date();
    await existingAlarm.save();

    // Update corresponding NOC alarm if it exists
    if (existingAlarm.nocAlarmId) {
      await this.updateNocAlarm(existingAlarm);
    }

    this.emit('alarmUpdated', existingAlarm);
  }

  /**
   * Process alarm and create corresponding NOC alarm if enabled
   */
  async processAlarm(maeAlarm) {
    try {
      if (!this.config.autoCreateNocAlarms) {
        maeAlarm.processingStatus = 'skipped';
        maeAlarm.processedAt = new Date();
        await maeAlarm.save();
        return;
      }

      // Check if NOC alarm already exists
      if (maeAlarm.nocAlarmId) {
        this.logger.debug(`NOC alarm already exists for MAE alarm ${maeAlarm.maeSn}`);
        maeAlarm.processingStatus = 'processed';
        maeAlarm.processedAt = new Date();
        await maeAlarm.save();
        return;
      }

      // Create NOC alarm
      const nocAlarm = await this.createNocAlarm(maeAlarm);
      
      // Link the alarms
      maeAlarm.nocAlarmId = nocAlarm._id;
      maeAlarm.processingStatus = 'processed';
      maeAlarm.processedAt = new Date();
      await maeAlarm.save();

      this.logger.info(`Created NOC alarm ${nocAlarm._id} for MAE alarm ${maeAlarm.maeSn}`);
      
    } catch (error) {
      this.logger.error(`Error processing MAE alarm ${maeAlarm.maeSn}:`, error.message);
      maeAlarm.processingStatus = 'error';
      maeAlarm.processingError = error.message;
      maeAlarm.processedAt = new Date();
      await maeAlarm.save();
      throw error;
    }
  }

  /**
   * Create corresponding NOC alarm
   */
  async createNocAlarm(maeAlarm) {
    // Find site by NE name (site code) to get the region
    let region = '';
    try {
      const site = await Site.findOne({ siteId: maeAlarm.neName });
      if (site && site.region) {
        region = site.region;
        this.logger.debug(`Found region '${region}' for site ${maeAlarm.neName}`);
      } else {
        this.logger.debug(`No region found for site ${maeAlarm.neName}`);
      }
    } catch (error) {
      this.logger.error(`Error looking up region for site ${maeAlarm.neName}:`, error.message);
    }

    const alarmData = {
      siteId: maeAlarm.neSn || maeAlarm.neName,
      siteName: maeAlarm.neName,
      region,
      severity: maeAlarm.mappedSeverity,
      alarmType: `MAE_${maeAlarm.category}`,
      description: `[MAE] ${maeAlarm.alarmName}`,
      source: `Huawei MAE (${maeAlarm.neType})`,
      status: maeAlarm.mappedStatus,
      timestamp: maeAlarm.occurtime
    };

    const alarm = new Alarm(alarmData);
    return await alarm.save();
  }

  /**
   * Update corresponding NOC alarm
   */
  async updateNocAlarm(maeAlarm) {
    try {
      const nocAlarm = await Alarm.findById(maeAlarm.nocAlarmId);
      if (!nocAlarm) {
        this.logger.warn(`NOC alarm not found for MAE alarm ${maeAlarm.maeSn}`);
        return;
      }

      // Update status if changed
      if (nocAlarm.status !== maeAlarm.mappedStatus) {
        nocAlarm.status = maeAlarm.mappedStatus;
        
        // Set resolved timestamp if alarm is cleared
        if (maeAlarm.mappedStatus === 'resolved' && !nocAlarm.resolvedAt) {
          nocAlarm.resolvedAt = new Date();
        }
        
        await nocAlarm.save();
        this.logger.info(`Updated NOC alarm ${nocAlarm._id} status to ${maeAlarm.mappedStatus}`);
      }
      
    } catch (error) {
      this.logger.error(`Error updating NOC alarm for MAE alarm ${maeAlarm.maeSn}:`, error.message);
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      clientStatus: this.client ? this.client.getStatus() : null,
      queueLength: this.processingQueue.length,
      isProcessingQueue: this.isProcessingQueue
    };
  }

  /**
   * Get alarm statistics
   */
  async getStatistics() {
    try {
      const totalAlarms = await HuaweiMaeAlarm.countDocuments();
      const activeAlarms = await HuaweiMaeAlarm.findActiveAlarms().countDocuments();
      const processingErrors = await HuaweiMaeAlarm.countDocuments({ processingStatus: 'error' });
      const mappedToNoc = await HuaweiMaeAlarm.countDocuments({ nocAlarmId: { $exists: true } });

      const severityStats = await HuaweiMaeAlarm.getStatistics();

      return {
        totalAlarms,
        activeAlarms,
        processingErrors,
        mappedToNoc,
        severityBreakdown: severityStats,
        serviceStatus: this.getStatus()
      };
      
    } catch (error) {
      this.logger.error('Error getting statistics:', error.message);
      throw error;
    }
  }

  /**
   * Find MAE alarms with filters
   */
  async findAlarms(filters = {}) {
    const query = {};
    
    if (filters.neName) {
      query.neName = filters.neName;
    }
    
    if (filters.severity) {
      query.severity = filters.severity;
    }
    
    if (filters.state) {
      query.state = filters.state;
    }
    
    if (filters.isActive !== undefined) {
      query.state = filters.isActive 
        ? { $in: ['Unacknowledged & Uncleared', 'Acknowledged & Uncleared'] }
        : { $in: ['Unacknowledged & Cleared', 'Acknowledged & Cleared'] };
    }

    const alarms = await HuaweiMaeAlarm.find(query)
      .sort({ occurtime: -1 })
      .limit(filters.limit || 100);

    return alarms;
  }

  /**
   * Request manual synchronization of active alarms
   */
  async requestSynchronization() {
    if (!this.client || !this.client.isConnected) {
      throw new Error('MAE client is not connected');
    }

    this.logger.info('Requesting manual alarm synchronization');
    await this.client.requestActiveAlarms();
  }
}

export default HuaweiMaeAlarmService;
