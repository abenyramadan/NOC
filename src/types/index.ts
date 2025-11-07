export type AlarmSeverity = 'critical' | 'major' | 'minor' | 'warning' | 'info';
export type AlarmStatus = 'active' | 'acknowledged' | 'resolved';
export type SiteTransmission = 'Microwave' | 'VSAT' | 'Fiber';
export type SiteStatus = 'On Air' | 'Off Air' | 'Maintenance' | 'Planned';

export interface Alarm {
  id: string;
  timestamp: Date;
  severity: AlarmSeverity;
  status: AlarmStatus;
  siteId: string;
  siteName: string;
  siteType: SiteTransmission;
  alarmType: string;
  description: string;
  source: string;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  correlationId?: string;
}

export interface Site {
  id: string;
  siteId: string;
  siteName: string;
  state: string;
  city: string;
  transmission: SiteTransmission;
  status: SiteStatus;
  supervisor?: string;
  region?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  alarms: Array<{
    type: string;
    message: string;
    timestamp: Date;
    resolved: boolean;
  }>;
  lastSeen: Date;
  uptime: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'engineer' | 'operator' | 'viewer';
  lastLogin: Date;
}

export interface AuditLog {
  id: string;
  timestamp: Date;
  user: string;
  action: string;
  target: string;
  details: string;
  status: 'success' | 'failed';
}
