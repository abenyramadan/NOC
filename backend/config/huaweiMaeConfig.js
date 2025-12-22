module.exports = {
  // Connection settings
  host: process.env.HUAWEI_MAE_HOST || 'localhost',
  port: parseInt(process.env.HUAWEI_MAE_PORT) || 8765,
  sslEnabled: process.env.HUAWEI_MAE_SSL_ENABLED !== 'false', // default true
  
  // Reconnection settings
  reconnect: process.env.HUAWEI_MAE_RECONNECT !== 'false', // default true
  reconnectDelay: parseInt(process.env.HUAWEI_MAE_RECONNECT_DELAY) || 5000, // ms
  maxReconnectAttempts: parseInt(process.env.HUAWEI_MAE_MAX_RECONNECT_ATTEMPTS) || 10,
  
  // SSL/TLS settings
  sslOptions: {
    // Path to CA certificate to trust (PEM format)
    ca: process.env.HUAWEI_MAE_CA_CERT_PATH,
    
    // Client certificate settings (for mutual TLS)
    cert: process.env.HUAWEI_MAE_CLIENT_CERT_PATH,
    key: process.env.HUAWEI_MAE_CLIENT_KEY_PATH,
    
    // Enable/disable server certificate verification
    rejectUnauthorized: process.env.HUAWEI_MAE_REJECT_UNAUTHORIZED !== 'false',
    
    // Minimum/maximum TLS version
    minVersion: process.env.HUAWEI_MAE_TLS_MIN_VERSION || 'TLSv1.2',
    maxVersion: process.env.HUAWEI_MAE_TLS_MAX_VERSION || 'TLSv1.3',
  },
  
  // Alarm processing
  processHistoricalAlarms: process.env.HUAWEI_MAE_PROCESS_HISTORICAL === 'true',
  alarmBufferSize: parseInt(process.env.HUAWEI_MAE_ALARM_BUFFER_SIZE) || 1000,
  
  // Logging
  logLevel: process.env.HUAWEI_MAE_LOG_LEVEL || 'info',
  logFile: process.env.HUAWEI_MAE_LOG_FILE || 'huawei-mae-alarms.log',
  
  // Timeouts (in milliseconds)
  connectionTimeout: parseInt(process.env.HUAWEI_MAE_CONNECTION_TIMEOUT) || 30000,
  socketTimeout: parseInt(process.env.HUAWEI_MAE_SOCKET_TIMEOUT) || 60000,
  
  // Alarm synchronization
  syncOnConnect: process.env.HUAWEI_MAE_SYNC_ON_CONNECT === 'true',
  syncInterval: parseInt(process.env.HUAWEI_MAE_SYNC_INTERVAL) || 300000, // 5 minutes
};

// Validate required environment variables when SSL is enabled
if (module.exports.sslEnabled) {
  if (!process.env.HUAWEI_MAE_CA_CERT_PATH) {
    console.warn('WARNING: HUAWEI_MAE_CA_CERT_PATH is not set. SSL verification may fail.');
  }
  
  // Check for client certificate if mutual auth is required
  if (process.env.HUAWEI_MAE_AUTH_PEER === 'true') {
    if (!process.env.HUAWEI_MAE_CLIENT_CERT_PATH || !process.env.HUAWEI_MAE_CLIENT_KEY_PATH) {
      console.error('ERROR: Mutual authentication is enabled but client certificate or key path is missing');
      process.exit(1);
    }
  }
}
