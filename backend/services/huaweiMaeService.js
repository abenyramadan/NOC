import tls from 'tls';
import net from 'net';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';

/**
 * Huawei iMaster MAE-Access Northbound Alarm Streaming Interface Client
 * Implements TCP/TLS client for FM Notify alarm streaming
 */
class HuaweiMaeClient extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      host: config.host || process.env.HUAWEI_MAE_HOST || 'localhost',
      port: config.port || process.env.HUAWEI_MAE_PORT || 8765,
      enableSSL: config.enableSSL !== false, // SSL enabled by default
      enableAuthPeer: config.enableAuthPeer || false,
      caCertPath: config.caCertPath || process.env.HUAWEI_MAE_CA_CERT_PATH,
      clientCertPath: config.clientCertPath || process.env.HUAWEI_MAE_CLIENT_CERT_PATH,
      clientKeyPath: config.clientKeyPath || process.env.HUAWEI_MAE_CLIENT_KEY_PATH,
      reconnectInterval: config.reconnectInterval || 5000,
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
      connectionTimeout: config.connectionTimeout || 30000,
      enableSynchronization: config.enableSynchronization || false,
      ...config
    };

    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.connectionTimeout = null;
    this.reconnectTimeout = null;
    this.buffer = '';
    this.messageBuffer = [];
    this.isParsingMessage = false;

    // Message delimiters
    this.MESSAGE_START = '<+++>';
    this.MESSAGE_END = '<--->';
    
    this.logger = config.logger || console;
  }

  /**
   * Connect to MAE server
   */
  async connect() {
    try {
      this.logger.info(`Connecting to Huawei MAE at ${this.config.host}:${this.config.port}`);
      
      if (this.config.enableSSL) {
        await this.connectTLS();
      } else {
        await this.connectTCP();
      }
    } catch (error) {
      this.logger.error('Connection failed:', error.message);
      this.handleConnectionError(error);
    }
  }

  /**
   * Establish TLS connection
   */
  async connectTLS() {
    const tlsOptions = {
      host: this.config.host,
      port: this.config.port,
      rejectUnauthorized: true, // Server authentication by default
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3'
    };

    // Add CA certificate if provided
    if (this.config.caCertPath && fs.existsSync(this.config.caCertPath)) {
      tlsOptions.ca = fs.readFileSync(this.config.caCertPath);
      this.logger.info('Using CA certificate:', this.config.caCertPath);
    }

    // Add client certificate if mutual TLS is enabled
    if (this.config.enableAuthPeer && this.config.clientCertPath && this.config.clientKeyPath) {
      if (fs.existsSync(this.config.clientCertPath) && fs.existsSync(this.config.clientKeyPath)) {
        tlsOptions.cert = fs.readFileSync(this.config.clientCertPath);
        tlsOptions.key = fs.readFileSync(this.config.clientKeyPath);
        this.logger.info('Using client certificate for mutual TLS');
      } else {
        throw new Error('Client certificate or key file not found for mutual TLS');
      }
    }

    return new Promise((resolve, reject) => {
      this.socket = tls.connect(tlsOptions, () => {
        this.logger.info('TLS connection established');
        this.onConnected();
        resolve();
      });

      this.setupSocketHandlers(reject);
    });
  }

  /**
   * Establish plain TCP connection
   */
  async connectTCP() {
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();
      
      this.socket.connect(this.config.port, this.config.host, () => {
        this.logger.info('TCP connection established');
        this.onConnected();
        resolve();
      });

      this.setupSocketHandlers(reject);
    });
  }

  /**
   * Setup socket event handlers
   */
  setupSocketHandlers(reject) {
    this.socket.on('data', (data) => {
      this.handleData(data);
    });

    this.socket.on('error', (error) => {
      this.logger.error('Socket error:', error.message);
      if (reject) reject(error);
      this.handleConnectionError(error);
    });

    this.socket.on('close', () => {
      this.logger.warn('Connection closed');
      this.onDisconnected();
    });

    this.socket.on('timeout', () => {
      this.logger.error('Connection timeout');
      this.socket.destroy();
      if (reject) reject(new Error('Connection timeout'));
    });

    this.socket.setTimeout(this.config.connectionTimeout);
  }

  /**
   * Handle successful connection
   */
  onConnected() {
    this.isConnected = true;
    this.reconnectAttempts = 0;
    this.buffer = '';
    
    this.logger.info('Connected to Huawei MAE alarm streaming interface');
    this.emit('connected');

    // Request active alarms if synchronization is enabled
    if (this.config.enableSynchronization) {
      this.requestActiveAlarms();
    }
  }

  /**
   * Handle connection disconnection
   */
  onDisconnected() {
    this.isConnected = false;
    this.emit('disconnected');
    
    // Attempt reconnection
    this.scheduleReconnect();
  }

  /**
   * Handle incoming data from socket
   */
  handleData(data) {
    try {
      // Convert Buffer to string and add to buffer
      const chunk = data.toString('utf8');
      this.buffer += chunk;

      // Process complete messages
      this.processMessages();
    } catch (error) {
      this.logger.error('Error handling data:', error.message);
    }
  }

  /**
   * Process complete messages from buffer
   */
  processMessages() {
    while (true) {
      const startIndex = this.buffer.indexOf(this.MESSAGE_START);
      const endIndex = this.buffer.indexOf(this.MESSAGE_END);

      if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
        // No complete message found
        if (startIndex === -1 && this.buffer.length > 10000) {
          // Clear buffer if it's getting too large and no start delimiter found
          this.logger.warn('Clearing oversized buffer without message start');
          this.buffer = '';
        }
        break;
      }

      // Extract complete message
      const messageStart = startIndex + this.MESSAGE_START.length;
      const messageEnd = endIndex;
      const messageContent = this.buffer.substring(messageStart, messageEnd).trim();
      
      // Remove processed message from buffer
      this.buffer = this.buffer.substring(endIndex + this.MESSAGE_END.length);

      // Process the message
      this.processMessage(messageContent);
    }
  }

  /**
   * Process individual message
   */
  processMessage(content) {
    try {
      // Check if it's a handshake message
      if (content.startsWith('handshake')) {
        this.handleHandshake(content);
        return;
      }

      // Check if it's synchronization response
      if (content.startsWith('BEGIN ACT ALM') || content.startsWith('END ACT ALM')) {
        this.handleSynchronizationResponse(content);
        return;
      }

      // Parse as alarm message
      const alarm = this.parseAlarmMessage(content);
      if (alarm) {
        this.emit('alarm', alarm);
      }
    } catch (error) {
      this.logger.error('Error processing message:', error.message, 'Content:', content);
    }
  }

  /**
   * Handle handshake message (keepalive)
   */
  handleHandshake(content) {
    this.logger.debug('Received handshake:', content);
    this.emit('handshake', { timestamp: content.split('=')[1]?.trim() });
  }

  /**
   * Handle synchronization response
   */
  handleSynchronizationResponse(content) {
    if (content.startsWith('BEGIN ACT ALM')) {
      this.logger.info('Starting active alarm synchronization');
      this.emit('synchronizationStart');
    } else if (content.startsWith('END ACT ALM')) {
      this.logger.info('Active alarm synchronization completed');
      this.emit('synchronizationEnd');
    }
  }

  /**
   * Parse alarm message from NAMEVALUE format
   */
  parseAlarmMessage(content) {
    const lines = content.split('\r\n').filter(line => line.trim());
    const alarm = {};

    for (const line of lines) {
      const match = line.match(/^(\w+)\s*=\s*(.+)$/);
      if (match) {
        const [, field, value] = match;
        alarm[field.trim()] = value.trim();
      }
    }

    // Validate required fields
    if (!alarm.Sn || !alarm.AlarmID) {
      this.logger.warn('Invalid alarm message - missing required fields:', content);
      return null;
    }

    // Add processing timestamp
    alarm.receivedAt = new Date().toISOString();

    return alarm;
  }

  /**
   * Request active alarms (synchronization)
   */
  async requestActiveAlarms() {
    if (!this.isConnected) {
      this.logger.warn('Cannot request active alarms - not connected');
      return;
    }

    try {
      this.logger.info('Requesting active alarms synchronization');
      this.socket.write('REQ_ACT_ALM');
    } catch (error) {
      this.logger.error('Error requesting active alarms:', error.message);
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.logger.error('Max reconnection attempts reached');
      this.emit('maxReconnectAttemptsReached');
      return;
    }

    const delay = Math.min(
      this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts),
      300000 // Max 5 minutes
    );

    this.logger.info(`Scheduling reconnection in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  /**
   * Handle connection errors
   */
  handleConnectionError(error) {
    this.emit('error', error);
    
    if (this.isConnected) {
      this.onDisconnected();
    }
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    this.logger.info('Disconnecting from Huawei MAE');
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    this.isConnected = false;
    this.emit('disconnected');
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      host: this.config.host,
      port: this.config.port,
      enableSSL: this.config.enableSSL,
      reconnectAttempts: this.reconnectAttempts,
      bufferLength: this.buffer.length
    };
  }
}

export default HuaweiMaeClient;
