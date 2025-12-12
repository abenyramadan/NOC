import React from 'react';
import { Alarm } from '../types';

interface AlarmChartProps {
  alarms: Alarm[];
  showAllHistory?: boolean;
}

export const AlarmChart: React.FC<AlarmChartProps> = ({ alarms, showAllHistory = false }) => {
  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];
  
  // Filter alarms by today's date if not showing all history
  const filteredAlarms = showAllHistory 
    ? alarms 
    : alarms.filter(alarm => {
        const alarmDate = new Date(alarm.timestamp).toISOString().split('T')[0];
        return alarmDate === today;
      });

  const severityCounts = {
    critical: filteredAlarms.filter(a => a.severity === 'critical' && a.status === 'active').length,
    major: filteredAlarms.filter(a => a.severity === 'major' && a.status === 'active').length,
    minor: filteredAlarms.filter(a => a.severity === 'minor' && a.status === 'active').length,
    warning: filteredAlarms.filter(a => a.severity === 'warning' && a.status === 'active').length,
    info: filteredAlarms.filter(a => a.severity === 'info' && a.status === 'active').length,
  };

  const total = Object.values(severityCounts).reduce((a, b) => a + b, 0);
  const maxCount = Math.max(...Object.values(severityCounts));

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <h3 className="text-xl font-bold text-foreground mb-6">Active Alarms by Severity</h3>
      
      <div className="space-y-4">
        {Object.entries(severityCounts).map(([severity, count]) => {
          const percentage = total > 0 ? (count / total) * 100 : 0;
          const barWidth = maxCount > 0 ? (count / maxCount) * 100 : 0;
          
          const colors: Record<string, string> = {
            critical: 'bg-red-500',
            major: 'bg-orange-500',
            minor: 'bg-yellow-500',
            warning: 'bg-amber-500',
            info: 'bg-cyan-500',
          };
          
          return (
            <div key={severity}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground capitalize">{severity}</span>
                <span className="text-sm text-muted-foreground">{count} ({percentage.toFixed(1)}%)</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
                <div 
                  className={`h-full ${colors[severity]} transition-all duration-500 rounded-full`}
                  style={{ width: `${barWidth}%` }}
                ></div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 pt-6 border-t border-border text-center">
        <p className="text-3xl font-bold text-foreground">{total}</p>
        <p className="text-sm text-muted-foreground">
          {showAllHistory ? 'Total Active Alarms' : "Today's Active Alarms"}
        </p>
      </div>
    </div>
  );
};
