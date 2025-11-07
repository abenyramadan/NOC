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
      className="bg-[#1e2230] rounded-lg p-5 border border-gray-800 hover:border-cyan-500/50 cursor-pointer transition-all hover:shadow-lg hover:shadow-cyan-500/10"
    >
      <div className="flex items-start justify-between mb-3">
        <img src={icon} alt={device.transmission} className="w-12 h-12 rounded" />
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${statusColors[device.status]} animate-pulse`}></span>
          <span className="text-xs text-gray-400">{device.status}</span>
        </div>
      </div>

      <h3 className="text-white font-semibold mb-1">{device.siteName}</h3>
      <p className="text-xs text-gray-500 mb-3">{device.siteId}</p>

      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-500">Type:</span>
          <span className="text-gray-300">{device.transmission}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Location:</span>
          <span className="text-gray-300">{device.city}, {device.state}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Uptime:</span>
          <span className="text-gray-300">{device.uptime}%</span>
        </div>
      </div>

      {device.supervisor && (
        <div className="mt-3 pt-3 border-t border-gray-700">
          <span className="text-xs text-cyan-400">👤 {device.supervisor}</span>
        </div>
      )}
    </div>
  );
};
