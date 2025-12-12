import React from 'react';
import { Alarm } from '../types';

interface AlarmModalProps {
  alarm: Alarm | null;
  onClose: () => void;
  onAcknowledge: (id: string) => void;
  onResolve: (id: string) => void;
}

const severityColors = {
  critical: 'text-red-400 border-red-500',
  major: 'text-orange-400 border-orange-500',
  minor: 'text-yellow-400 border-yellow-500',
  warning: 'text-amber-400 border-amber-500',
  info: 'text-cyan-400 border-cyan-500',
};

export const AlarmModal: React.FC<AlarmModalProps> = ({ alarm, onClose, onAcknowledge, onResolve }) => {
  if (!alarm) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card rounded-lg max-w-2xl w-full border border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-border p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Alarm Details</h2>
              <span className={`px-3 py-1 rounded text-sm font-semibold border ${severityColors[alarm.severity]}`}>
                {alarm.severity.toUpperCase()}
              </span>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-2xl">&times;</button>
          </div>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Alarm ID</p>
              <p className="text-foreground font-mono">{alarm.id}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Device</p>
              <p className="text-foreground">{alarm.deviceName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Alarm Type</p>
              <p className="text-foreground">{alarm.alarmType}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Source IP</p>
              <p className="text-foreground font-mono">{alarm.source}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Timestamp</p>
              <p className="text-foreground">{new Date(alarm.timestamp).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Status</p>
              <p className="text-foreground capitalize">{alarm.status}</p>
            </div>
          </div>
          
          <div>
            <p className="text-xs text-muted-foreground mb-1">Description</p>
            <p className="text-foreground">{alarm.description}</p>
          </div>
          
          {alarm.acknowledgedBy && (
            <div className="bg-green-500/10 border border-green-500/30 rounded p-3">
              <p className="text-xs text-green-400">
                Acknowledged by {alarm.acknowledgedBy} at {alarm.acknowledgedAt ? new Date(alarm.acknowledgedAt).toLocaleString() : 'N/A'}
              </p>
            </div>
          )}
        </div>
        
        <div className="border-t border-border p-6 flex gap-3">
          {alarm.status === 'active' && (
            <>
              <button
                onClick={() => { onAcknowledge(alarm.id); onClose(); }}
                className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded transition-colors"
              >
                Acknowledge
              </button>
              <button
                onClick={() => { onResolve(alarm.id); onClose(); }}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
              >
                Resolve
              </button>
            </>
          )}
          <button onClick={onClose} className="px-4 py-2 bg-accent hover:bg-accent/90 text-accent-foreground rounded transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
