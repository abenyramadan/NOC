import React from 'react';
import { Alarm } from '../types';

interface AlarmRowProps {
  alarm: Alarm;
  onClick: () => void;
}

const severityColors = {
  critical: 'bg-red-500/20 text-red-400 border-red-500',
  major: 'bg-orange-500/20 text-orange-400 border-orange-500',
  minor: 'bg-yellow-500/20 text-yellow-400 border-yellow-500',
  warning: 'bg-amber-500/20 text-amber-400 border-amber-500',
  info: 'bg-cyan-500/20 text-cyan-400 border-cyan-500',
};

const statusColors = {
  active: 'bg-red-500/20 text-red-400 border-red-500',
  acknowledged: 'bg-yellow-500/20 text-yellow-400 border-yellow-500',
  resolved: 'bg-green-500/20 text-green-400 border-green-500',
};

const isRecentlyResolved = (alarm: Alarm) => {
  if (alarm.status !== 'resolved' || !alarm.resolvedAt) return false;
  const resolvedTime = new Date(alarm.resolvedAt).getTime();
  const now = Date.now();
  const hoursSinceResolved = (now - resolvedTime) / (1000 * 60 * 60);
  return hoursSinceResolved <= 24; // Show "Recently Resolved" for 24 hours
};

export const AlarmRow: React.FC<AlarmRowProps> = ({ alarm, onClick }) => {
  const recentlyResolved = isRecentlyResolved(alarm);
  
  return (
    <tr 
      onClick={onClick}
      className={`border-b border-border hover:bg-accent cursor-pointer transition-colors ${
        recentlyResolved ? 'bg-green-500/5 border-l-4 border-l-green-500' : ''
      }`}
    >
      <td className="px-4 py-3">
        <span className={`px-2 py-1 rounded text-xs font-semibold border ${
          severityColors[alarm.severity as keyof typeof severityColors] || 'bg-gray-500/20 text-gray-400 border-gray-500'
        }`}>
          {alarm.severity.toUpperCase()}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-foreground">{alarm.siteName}</td>
      <td className="px-4 py-3 text-sm text-foreground">{alarm.alarmType}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{alarm.source}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded text-xs font-semibold border ${
            statusColors[alarm.status as keyof typeof statusColors] || 'bg-gray-500/20 text-gray-400 border-gray-500'
          }`}>
            {alarm.status}
          </span>
          {recentlyResolved && (
            <span className="px-2 py-1 rounded text-xs bg-green-600 text-white font-semibold animate-pulse">
              ✓ RECENTLY RESOLVED
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {new Date(alarm.timestamp).toLocaleString()}
        {alarm.resolvedAt && (
          <div className="text-green-600 text-xs mt-1">
            Resolved: {new Date(alarm.resolvedAt).toLocaleString()}
          </div>
        )}
      </td>
    </tr>
  );
};
