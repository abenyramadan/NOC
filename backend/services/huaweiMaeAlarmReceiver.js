const net = require('net');
const tls = require('tls');
const { EventEmitter } = require('events');
const logger = require('../utils/logger');

class HuaweiMaeAlarmReceiver extends EventEmitter {
  constructor(config = {}) {
    super();
    this.host = config.host || 'localhost';
    this.port = config.port || 8765;
    this.sslEnabled = config.sslEnabled !== false; // default true
    this.reconnect = config.reconnect !== false; // default true
    this.reconnectDelay = config.reconnectDelay || 5000; // 5 seconds
    this.maxReconnectAttempts = config.maxReconnectAttempts || 10;
    this.reconnectAttempts = 0;
    this.isConnected = false;
    this.socket = null;
    this.buffer = '';
    this.messageBoundary = { start: '<+++>', end: '<--->' };
    this.inMessage = false;
    this.currentMessage = [];
  }

  connect() {
    if (this.isConnected) {
      logger.warn('Connection already established');
      return;
    }

    const connectOptions = {
      host: this.host,
      port: this.port,
      rejectUnauthorized: this.sslEnabled, // Verify server certificate
      // Add client certificate if mutual TLS is enabled
      ...(config.clientCert && { cert: config.clientCert }),
      ...(config.clientKey && { key: config.clientKey }),
    };

    const onConnect = () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connected');
      logger.info(`Connected to Huawei MAE at ${this.host}:${this.port}`);
    };

    const onData = (data) => {
      try {
        this._processData(data.toString());
      } catch (error) {
        logger.error('Error processing data:', error);
      }
    };

    const onError = (error) => {
      logger.error('Socket error:', error.message);
      this.emit('error', error);
    };

    const onClose = () => {
      this.isConnected = false;
      this.socket = null;
      this.emit('disconnected');
      logger.warn('Connection closed');
      this._handleReconnect();
    };

    try {
      this.socket = this.sslEnabled
        ? tls.connect(connectOptions, onConnect)
        : net.createConnection(connectOptions, onConnect);

      this.socket.on('data', onData);
      this.socket.on('error', onError);
      this.socket.on('close', onClose);
      this.socket.setEncoding('utf8');
      this.socket.setKeepAlive(true, 60000); // Enable keep-alive
      
      // Handle connection timeout
      this.socket.setTimeout(30000, () => {
        logger.warn('Connection timeout');
        this.socket.destroy();
      });

    } catch (error) {
      logger.error('Connection error:', error.message);
      this._handleReconnect();
    }
  }

  _processData(data) {
    this.buffer += data;
    
    while (true) {
      if (!this.inMessage) {
        const startIndex = this.buffer.indexOf(this.messageBoundary.start);
        if (startIndex === -1) {
          // No start boundary found, discard the buffer
          this.buffer = '';
          return;
        }
        this.buffer = this.buffer.slice(startIndex + this.messageBoundary.start.length);
        this.inMessage = true;
        this.currentMessage = [];
      }

      const endIndex = this.buffer.indexOf(this.messageBoundary.end);
      if (endIndex === -1) {
        // Incomplete message, wait for more data
        return;
      }

      const messageContent = this.buffer.slice(0, endIndex).trim();
      this.buffer = this.buffer.slice(endIndex + this.messageBoundary.end.length);
      this.inMessage = false;

      this._processMessage(messageContent);
    }
  }

  _processMessage(messageContent) {
    if (!messageContent) return;

    // Check if it's a handshake message
    if (messageContent.startsWith('handshake')) {
      const handshakeMatch = messageContent.match(/handshake\s*=\s*(.+)/);
      if (handshakeMatch) {
        this.emit('handshake', { timestamp: handshakeMatch[1].trim() });
      }
      return;
    }

    // Process alarm message
    const alarm = {};
    const lines = messageContent.split('\n').filter(line => line.trim() !== '');
    
    for (const line of lines) {
      const [key, ...valueParts] = line.split('=').map(part => part.trim());
      if (key && valueParts.length > 0) {
        alarm[key] = valueParts.join('=').trim();
      }
    }

    if (Object.keys(alarm).length > 0) {
      this.emit('alarm', alarm);
    }
  }

  _handleReconnect() {
    if (!this.reconnect) {
      logger.info('Reconnect disabled');
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached');
      this.emit('maxReconnectAttemptsReached');
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    logger.info(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      logger.info('Reconnecting...');
      this.connect();
    }, Math.min(delay, 30000)); // Max 30 seconds delay
  }

  disconnect() {
    if (this.socket) {
      this.reconnect = false;
      this.socket.end();
      this.socket.destroy();
      this.socket = null;
      this.isConnected = false;
      logger.info('Disconnected from Huawei MAE');
    }
  }

  requestActiveAlarms() {
    if (!this.isConnected || !this.socket) {
      logger.warn('Not connected to MAE');
      return false;
    }

    try {
      this.socket.write('REQ_ACT_ALM');
      logger.debug('Requested active alarms');
      return true;
    } catch (error) {
      logger.error('Error requesting active alarms:', error);
      return false;
    }
  }
}

module.exports = HuaweiMaeAlarmReceiver;
