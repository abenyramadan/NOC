import React from 'react';
import { Site } from '../types';

interface DeviceCardProps {
  device: Site;
  onClick: () => void;
  icon: string;
}

const statusColors = {
  'On Air': 'bg-green-500',
  'Off Air': 'bg-red-500',
  'Maintenance': 'bg-yellow-500',
  'Planned': 'bg-blue-500',
};

export const DeviceCard: React.FC<DeviceCardProps> = ({ device, onClick, icon }) => {
  return (
    <div
      onClick={onClick}
      className="bg-card rounded-lg p-5 border border-border hover:border-primary/50 cursor-pointer transition-all hover:shadow-lg hover:shadow-primary/10"
    >
      <div className="flex items-start justify-between mb-3">
        <img src={icon} alt={device.transmission} className="w-12 h-12 rounded" />
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${statusColors[device.status]} animate-pulse`}></span>
          <span className="text-xs text-muted-foreground">{device.status}</span>
        </div>
      </div>

      <h3 className="text-foreground font-semibold mb-1">{device.siteName}</h3>
      <p className="text-xs text-muted-foreground mb-3">{device.siteId}</p>

      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Type:</span>
          <span className="text-foreground">{device.transmission}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Location:</span>
          <span className="text-foreground">{device.city}, {device.state}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Uptime:</span>
          <span className="text-foreground">{device.uptime}%</span>
        </div>
      </div>

      {device.supervisor && (
        <div className="mt-3 pt-3 border-t border-border">
          <span className="text-xs text-primary">👤 {device.supervisor}</span>
        </div>
      )}
    </div>
  );
};
