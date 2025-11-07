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

export const AlarmRow: React.FC<AlarmRowProps> = ({ alarm, onClick }) => {
  return (
    <tr 
      onClick={onClick}
      className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors"
    >
      <td className="px-4 py-3">
        <span className={`px-2 py-1 rounded text-xs font-semibold border ${
          severityColors[alarm.severity as keyof typeof severityColors] || 'bg-gray-500/20 text-gray-400 border-gray-500'
        }`}>
          {alarm.severity.toUpperCase()}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-300">{alarm.siteName}</td>
      <td className="px-4 py-3 text-sm text-gray-300">{alarm.alarmType}</td>
      <td className="px-4 py-3 text-sm text-gray-400">{alarm.source}</td>
      <td className="px-4 py-3 text-xs text-gray-500">
        {new Date(alarm.timestamp).toLocaleString()}
      </td>
    </tr>
  );
};
