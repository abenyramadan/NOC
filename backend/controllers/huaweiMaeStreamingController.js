const HuaweiMaeStreamingService = require('../services/huaweiMaeStreamingService');
const logger = require('../utils/logger');

class HuaweiMaeStreamingController {
  constructor(alarmService) {
    this.streamingService = new HuaweiMaeStreamingService(alarmService);
    this.initializeRoutes();
  }

  initializeRoutes() {
    // Routes will be registered by the main router
  }

  /**
   * Start the Huawei MAE streaming service
   */
  async startStreaming(req, res) {
    try {
      const result = await this.streamingService.start();
      res.json({
        success: true,
        message: 'Huawei MAE streaming service started',
        data: this.streamingService.getStatus()
      });
    } catch (error) {
      logger.error('Error starting Huawei MAE streaming service:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to start Huawei MAE streaming service',
        error: error.message
      });
    }
  }

  /**
   * Stop the Huawei MAE streaming service
   */
  async stopStreaming(req, res) {
    try {
      const result = await this.streamingService.stop();
      res.json({
        success: true,
        message: 'Huawei MAE streaming service stopped',
        data: this.streamingService.getStatus()
      });
    } catch (error) {
      logger.error('Error stopping Huawei MAE streaming service:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to stop Huawei MAE streaming service',
        error: error.message
      });
    }
  }

  /**
   * Get the current status of the Huawei MAE streaming service
   */
  getStatus(req, res) {
    try {
      const status = this.streamingService.getStatus();
      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      logger.error('Error getting Huawei MAE streaming service status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get Huawei MAE streaming service status',
        error: error.message
      });
    }
  }

  /**
   * Request synchronization of active alarms from Huawei MAE
   */
  async syncActiveAlarms(req, res) {
    try {
      if (!this.streamingService.receiver) {
        throw new Error('Huawei MAE streaming service is not initialized');
      }

      const result = this.streamingService.receiver.requestActiveAlarms();
      res.json({
        success: result,
        message: result 
          ? 'Request for active alarms sent to Huawei MAE' 
          : 'Failed to request active alarms'
      });
    } catch (error) {
      logger.error('Error requesting active alarms from Huawei MAE:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to request active alarms from Huawei MAE',
        error: error.message
      });
    }
  }

  /**
   * Register routes for the controller
   * @param {Object} router - Express router instance
   */
  registerRoutes(router) {
    router.get('/api/huawei-mae/stream/start', this.startStreaming.bind(this));
    router.get('/api/huawei-mae/stream/stop', this.stopStreaming.bind(this));
    router.get('/api/huawei-mae/stream/status', this.getStatus.bind(this));
    router.post('/api/huawei-mae/stream/sync', this.syncActiveAlarms.bind(this));
    
    return router;
  }
}

module.exports = HuaweiMaeStreamingController;
