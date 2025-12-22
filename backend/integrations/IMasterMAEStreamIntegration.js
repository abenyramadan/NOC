import net from 'net';
import tls from 'tls';
import HuaweiMaeAlarm from '../models/HuaweiMaeAlarm.js';
import Alarm from '../models/Alarm.js';

export class IMasterMAEStreamIntegration {
  constructor(config) {
    this.name = config.name || 'iMasterMAEStream';
    this.host = config.host;
    this.port = config.port;
    this.protocol = (config.protocol || 'TCP').toUpperCase();
    this.tlsEnabled = !!config.tlsEnabled;
    this.enabled = config.enabled !== false;

    this.textBuffer = '';
    this.inBlock = false;
    this.blockStart = '<+++>';
    this.blockEnd = '<--->';

    this.socket = null;
    this.isConnected = false;
    this.reconnectDelayMs = config.reconnectDelayMs || 15000;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectDelayMs = 30000;

    this.heartbeatTimer = null;
    this.tryPlainTcp = false;
    this.noDataTimer = null;
    this.dataTimeoutMs = parseInt(process.env.IMASTER_MAE_HANDSHAKE_TIMEOUT_MS || '120000', 10);
    this.hasReceivedAnyData = false;
    this.authState = 'none';
    this.username = process.env.IMASTER_MAE_USERNAME || config.username || '';
    this.password = process.env.IMASTER_MAE_PASSWORD || config.password || '';
  }

  start() {
    if (!this.enabled) {
      console.log(`⏭️ ${this.name} integration is disabled, not starting TCP stream`);
      return;
    }

    if (this.socket && this.isConnected) {
      console.log(`🔄 ${this.name} TCP stream already connected`);
      return;
    }

    this.connect();
  }

  stop() {
    this.enabled = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.isConnected = false;
    console.log(`⏹️ ${this.name} TCP stream stopped`);
  }

  connect() {
    console.log(`📡 ${this.name} connecting to ${this.host}:${this.port} (${this.protocol})...`);
    
    // Disable TLS for this connection since we're using plain TCP
    this.tlsEnabled = false;
    console.log('ℹ️ Using plain TCP connection');

    const socket = new net.Socket();

    socket.setKeepAlive(true, 15000);
    socket.setNoDelay(true);

    socket.connect(this.port, this.host, () => {
      this.onConnected();
    });

    socket.on('data', (data) => {
      this.handleData(data);
    });

    socket.on('error', (error) => this.onError(error));
    socket.on('close', () => this.onClose());
    socket.on('end', () => this.onEnd());

    this.socket = socket;
  }

  async onConnected() {
    this.isConnected = true;
    this.reconnectAttempts = 0;
    this.textBuffer = '';
    this.inBlock = false;
    this.lastDataTs = Date.now();
    this.hasReceivedAnyData = false;
    this.authState = 'none';
    console.log(`✅ ${this.name} connected. Waiting for MAE handshake...`);

    if (this.noDataTimer) {
      clearTimeout(this.noDataTimer);
      this.noDataTimer = null;
    }
    // If no data (handshake or alarms) arrives within timeout, reconnect
    this.noDataTimer = setTimeout(() => {
      if (!this.hasReceivedAnyData) {
        console.warn(`⏳ ${this.name} no data received within ${this.dataTimeoutMs}ms after connect. Reconnecting...`);
        try { this.socket && this.socket.destroy(); } catch {}
        this.isConnected = false;
        this.scheduleReconnect();
      }
    }, this.dataTimeoutMs);
  }

  waitForData(timeout = 1000) {
    return new Promise((resolve) => {
      if (!this.socket) return resolve(null);

      const onData = (data) => {
        clearTimeout(timer);
        this.socket.off('data', onData);
        resolve(data);
      };

      const timer = setTimeout(() => {
        this.socket.off('data', onData);
        resolve(null);
      }, timeout);

      this.socket.once('data', onData);
    });
  }

  onError(error) {
    console.error(`❌ ${this.name} socket error: ${error.message}`);
    console.error('Error details:', {
      code: error.code,
      syscall: error.syscall,
      address: error.address,
      port: error.port,
      stack: error.stack
    });
    if (this.noDataTimer) {
      clearTimeout(this.noDataTimer);
      this.noDataTimer = null;
    }
    this.authState = 'none';
    this.isConnected = false;
    if (this.socket) {
      this.socket.destroy();
    }
    this.scheduleReconnect();
  }

  onClose() {
    if (this.isConnected) {
      console.log(`⚠️ ${this.name} connection closed`);
      if (this.noDataTimer) {
        clearTimeout(this.noDataTimer);
        this.noDataTimer = null;
      }
      this.authState = 'none';
      this.isConnected = false;
      this.scheduleReconnect();
    }
  }

  onEnd() {
    console.log(`🔌 ${this.name} connection ended by server`);
    if (this.noDataTimer) {
      clearTimeout(this.noDataTimer);
      this.noDataTimer = null;
    }
    this.authState = 'none';
    this.isConnected = false;
    this.scheduleReconnect();
  }

  async sendInitPayload() {
    return;
  }

  startHeartbeat() {
    return;
  }

  scheduleReconnect() {
    if (!this.enabled) {
      return;
    }

    if (this.reconnectTimer) {
      return;
    }

    const delay = Math.min(this.reconnectDelayMs * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelayMs);
    this.reconnectAttempts += 1;
    console.log(`⏳ ${this.name} scheduling reconnect in ${Math.round(delay / 1000)}s...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  handleData(dataChunk) {
    // Mark first data receipt and clear handshake timeout
    if (!this.hasReceivedAnyData) {
      this.hasReceivedAnyData = true;
      if (this.noDataTimer) {
        clearTimeout(this.noDataTimer);
        this.noDataTimer = null;
      }
      console.log(`📶 ${this.name} first data received`);
    }
    this.lastDataTs = Date.now();

    // Log raw data in debug mode
    if (process.env.DEBUG === 'true') {
      console.log('📥 Raw data received:', dataChunk.toString('utf8'));
    }
    
    const chunkText = dataChunk.toString('utf8');
    this.textBuffer += chunkText;
    this.checkAndRespondToLoginPrompts(chunkText);

    while (true) {
      if (!this.inBlock) {
        const startIdx = this.textBuffer.indexOf(this.blockStart);
        if (startIdx === -1) {
          if (this.textBuffer.length > 65536) {
            this.textBuffer = this.textBuffer.slice(-32768);
          }
          break;
        }
        this.textBuffer = this.textBuffer.slice(startIdx + this.blockStart.length);
        this.inBlock = true;
      }

      const endIdx = this.textBuffer.indexOf(this.blockEnd);
      if (endIdx === -1) {
        break;
      }

      const messageContent = this.textBuffer.slice(0, endIdx).trim();
      this.textBuffer = this.textBuffer.slice(endIdx + this.blockEnd.length);
      this.inBlock = false;

      if (messageContent) {
        this.handleMessage(messageContent);
      }
    }
  }

  checkAndRespondToLoginPrompts(text) {
    if (!this.socket) return;
    const lower = text.toLowerCase();

    if (this.authState === 'none' && (lower.includes('username') || lower.includes('user name') || lower.includes('login'))) {
      if (!this.username) {
        console.warn(`⚠️ ${this.name} username prompt detected, but no username configured`);
      } else {
        try {
          this.socket.write(this.username + '\r\n');
          console.log(`🔐 ${this.name} login prompt detected: sending username`);
          this.authState = 'awaiting_password';
        } catch (e) {
          console.warn(`⚠️ ${this.name} failed to send username: ${e.message}`);
        }
      }
    }

    if ((this.authState === 'awaiting_password' || this.authState === 'none') && lower.includes('password')) {
      if (!this.password) {
        console.warn(`⚠️ ${this.name} password prompt detected, but no password configured`);
      } else {
        try {
          this.socket.write(this.password + '\r\n');
          console.log(`🔐 ${this.name} password prompt detected: sending password`);
          this.authState = 'authenticated';
        } catch (e) {
          console.warn(`⚠️ ${this.name} failed to send password: ${e.message}`);
        }
      }
    }
  }

  handleMessage(blockText) {
    console.log(`<+++>\n${blockText}\n<--->`);
    
    const lines = blockText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    if (lines.length === 1) {
      const m = lines[0].match(/^handshake\s*=\s*(.+)$/i);
      if (m) {
        console.log(`🤝 ${this.name} handshake: ${m[1]}`);
        return;
      }
    }

    const alarm = {};
    for (const line of lines) {
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      if (key) alarm[key] = value;
    }

    if (Object.keys(alarm).length > 0) {
      console.log(`🔔 ${this.name} alarm received:`, alarm);
      try {
        this.persistMaeAlarm(alarm).catch(err => {
          console.error(`❌ ${this.name} failed to persist MAE alarm:`, err.message);
        });
      } catch (e) {
        console.error(`❌ ${this.name} persist invocation error:`, e.message);
      }
    } else {
      console.log(`ℹ️ ${this.name} non-alarm block received:`, blockText);
    }
  }

  async persistMaeAlarm(parsed) {
    const required = ['Sn','NeSn','NeName','NeType','AlarmID','AlarmName','Severity','State','Occurtime'];
    for (const k of required) {
      if (!parsed[k]) {
        console.warn(`⚠️ ${this.name} missing required field ${k}, skipping persist`);
        return;
      }
    }

    const parseMaeDate = (s) => {
      if (!s || typeof s !== 'string') return null;
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
      if (!m) return null;
      const [_, Y, Mo, D, H, Mi, S] = m;
      return new Date(Number(Y), Number(Mo) - 1, Number(D), Number(H), Number(Mi), Number(S));
    };

    const occur = parseMaeDate(parsed.Occurtime);
    if (!occur || Number.isNaN(occur.getTime())) {
      console.warn(`⚠️ ${this.name} invalid Occurtime '${parsed.Occurtime}', skipping persist`);
      return;
    }

    const usedKeys = new Set(['Sn','NeSn','NeFdn','NeName','NeType','AlarmID','AlarmName','Category','Severity','State','Occurtime','Location','ClearTime']);
    const additionalInfo = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (!usedKeys.has(k)) additionalInfo[k] = v;
    }
    if (parsed.ClearTime) additionalInfo.ClearTime = parsed.ClearTime;
    if (parsed.ObjFdn) additionalInfo.ObjFdn = parsed.ObjFdn;
    if (parsed.ObjName) additionalInfo.ObjName = parsed.ObjName;
    if (parsed.ObjType) additionalInfo.ObjType = parsed.ObjType;
    if (parsed.EventType) additionalInfo.EventType = parsed.EventType;

    const mapSeverity = (s) => {
      const m = { Critical: 'critical', Major: 'major', Minor: 'minor', Warning: 'minor', Indeterminate: 'minor' };
      return m[s] || 'minor';
    };
    const mapStatus = (st) => {
      if (!st) return 'active';
      if (st.includes('Cleared')) return 'resolved';
      if (st.includes('Acknowledged')) return 'acknowledged';
      return 'active';
    };

    const key = { maeSn: String(parsed.Sn) };
    const update = {
      $set: {
        neSn: String(parsed.NeSn),
        neFdn: parsed.NeFdn || undefined,
        neName: String(parsed.NeName),
        neType: String(parsed.NeType),
        alarmId: String(parsed.AlarmID),
        alarmName: String(parsed.AlarmName),
        category: parsed.Category || 'Fault',
        severity: String(parsed.Severity),
        state: String(parsed.State),
        occurtime: occur,
        location: parsed.Location || undefined,
        additionalInfo,
        mappedSeverity: mapSeverity(parsed.Severity),
        mappedStatus: mapStatus(parsed.State)
      },
      $setOnInsert: {
        maeSn: String(parsed.Sn),
        receivedAt: new Date()
      }
    };

    await HuaweiMaeAlarm.updateOne(key, update, { upsert: true });

    // Create/update central Alarm so downstream processors (emails, tickets, reports) run
    await this.upsertNocAlarmFromMae(parsed, occur);
  }

  async upsertNocAlarmFromMae(parsed, occurtime) {
    const mapSeverity = (s) => {
      const m = { Critical: 'critical', Major: 'major', Minor: 'minor', Warning: 'minor', Indeterminate: 'minor' };
      return m[s] || 'minor';
    };
    const mapStatus = (st) => {
      if (!st) return 'active';
      if (st.includes('Cleared')) return 'resolved';
      if (st.includes('Acknowledged')) return 'acknowledged';
      return 'active';
    };

    const status = mapStatus(parsed.State);
    const alarmDoc = {
      siteId: parsed.NeSn || parsed.NeName || 'MAE',
      siteName: parsed.NeName || String(parsed.NeSn || 'MAE'),
      severity: mapSeverity(parsed.Severity),
      alarmType: `MAE_${parsed.Category || 'Alarm'}`,
      description: `[MAE] ${parsed.AlarmName} - ${parsed.NeType || 'Unknown'} (${parsed.NeName || parsed.NeSn || 'N/A'})`,
      source: `Huawei MAE (${parsed.NeType || 'Unknown'})`,
      status: status,
      timestamp: occurtime,
      // Include MAE-specific fields for richer display in reports
      alarmName: parsed.AlarmName,
      category: parsed.Category,
      neType: parsed.NeType,
      neName: parsed.NeName
    };

    // Resolve existing alarm on clear, otherwise upsert/insert active
    if (status === 'resolved') {
      const clearTime = (() => {
        const m = String(parsed.ClearTime || '').match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
        if (!m) return new Date();
        const [_, Y, Mo, D, H, Mi, S] = m;
        return new Date(Number(Y), Number(Mo) - 1, Number(D), Number(H), Number(Mi), Number(S));
      })();

      const existing = await Alarm.findOne({
        siteId: alarmDoc.siteId,
        siteName: alarmDoc.siteName,
        description: alarmDoc.description,
        status: { $ne: 'resolved' }
      });

      if (existing) {
        existing.status = 'resolved';
        if (!existing.resolvedAt) existing.resolvedAt = clearTime;
        await existing.save();
      }
      return;
    }

    // Active or acknowledged case: upsert by site+description with non-resolved status
    const existing = await Alarm.findOne({
      siteId: alarmDoc.siteId,
      siteName: alarmDoc.siteName,
      description: alarmDoc.description,
      status: { $ne: 'resolved' }
    });

    if (existing) {
      // Refresh severity/status/timestamp
      existing.severity = alarmDoc.severity;
      existing.status = alarmDoc.status;
      if (occurtime && occurtime > existing.timestamp) existing.timestamp = occurtime;
      await existing.save();
    } else {
      const created = new Alarm(alarmDoc);
      await created.save();
    }
  }

  async testConnection() {
    return new Promise((resolve, reject) => {
      if (!this.host || !this.port) {
        return reject(new Error('MAE stream host/port not configured'));
      }

      if (!this.tlsEnabled) {
        const testSocket = new net.Socket();
        testSocket.connect(this.port, this.host, () => {
          testSocket.destroy();
          resolve(true);
        });
        return;
      }

      // Use the same TLS options as the main connection
      const tlsOptions = {
        host: this.host,
        port: this.port,
        rejectUnauthorized: process.env.HUAWEI_MAE_REJECT_UNAUTHORIZED === 'true',
        minVersion: process.env.HUAWEI_MAE_TLS_MIN_VERSION || 'TLSv1.2',
        maxVersion: process.env.HUAWEI_MAE_TLS_MAX_VERSION || 'TLSv1.2',
        servername: '',
        ciphers: [
          'TLS_AES_256_GCM_SHA384',
          'TLS_CHACHA20_POLY1305_SHA256',
          'TLS_AES_128_GCM_SHA256',
          'ECDHE-RSA-AES256-GCM-SHA384',
          'ECDHE-RSA-AES128-GCM-SHA256',
          'DHE-RSA-AES256-GCM-SHA384',
          'DHE-RSA-AES128-GCM-SHA256'
        ].join(':'),
        honorCipherOrder: true,
        secureProtocol: 'TLSv1_2_method',
        session: undefined,
        sessionIdContext: ''
      };

      const testSocket = tls.connect(tlsOptions);
      let resolved = false;

      testSocket.setTimeout(5000);

      testSocket.on(this.tlsEnabled ? 'secureConnect' : 'connect', () => {
        console.log(`✅ ${this.name} test connection successful to ${this.host}:${this.port}`);
        resolved = true;
        testSocket.destroy();
        resolve(true);
      });

      testSocket.on('error', (err) => {
        if (resolved) {
          return;
        }
        console.error(`❌ ${this.name} test connection error:`, err.message);
        resolved = true;
        testSocket.destroy();
        reject(err);
      });

      testSocket.on('timeout', () => {
        if (resolved) {
          return;
        }
        console.error(`❌ ${this.name} test connection timed out`);
        resolved = true;
        testSocket.destroy();
        reject(new Error('MAE stream test connection timed out'));
      });

      if (!this.tlsEnabled) {
        testSocket.connect(this.port, this.host);
      }
    });
  }

  async syncAlarms() {
    return { success: true };
  }

  getStatus() {
    return {
      name: this.name,
      enabled: this.enabled,
      connected: this.isConnected,
      host: this.host,
      port: this.port
    };
  }
}
