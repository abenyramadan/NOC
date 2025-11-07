import React from 'react';
import { AlarmSeverity } from '../types';

interface FilterPanelProps {
  selectedSeverity: AlarmSeverity | 'all';
  selectedStatus: string;
  searchTerm: string;
  onSeverityChange: (severity: AlarmSeverity | 'all') => void;
  onStatusChange: (status: string) => void;
  onSearchChange: (term: string) => void;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  selectedSeverity,
  selectedStatus,
  searchTerm,
  onSeverityChange,
  onStatusChange,
  onSearchChange,
}) => {
  return (
    <div className="bg-[#1e2230] rounded-lg p-4 border border-gray-800 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-2">Severity</label>
          <select
            value={selectedSeverity}
            onChange={(e) => onSeverityChange(e.target.value as any)}
            className="w-full bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-gray-300 focus:border-cyan-500 focus:outline-none"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="major">Major</option>
            <option value="minor">Minor</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
        </div>
        
        <div>
          <label className="block text-xs text-gray-400 mb-2">Status</label>
          <select
            value={selectedStatus}
            onChange={(e) => onStatusChange(e.target.value)}
            className="w-full bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-gray-300 focus:border-cyan-500 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-2">Search</label>
          <input
            type="text"
            placeholder="Search alarms..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-gray-300 focus:border-cyan-500 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
};