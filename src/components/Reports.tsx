import React, { useState } from 'react';
import { DailyReports } from './DailyReports';
import { HistoricalReports } from './HistoricalReports';

export const Reports: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'daily' | 'historical'>('daily');

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="bg-[#1e2230] rounded-lg p-4 border border-gray-800">
        <div className="flex space-x-4">
          <button
            onClick={() => setActiveTab('daily')}
            className={`px-4 py-2 rounded transition-colors ${
              activeTab === 'daily'
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            📊 Daily Reports
          </button>
          <button
            onClick={() => setActiveTab('historical')}
            className={`px-4 py-2 rounded transition-colors ${
              activeTab === 'historical'
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            📈 Historical Reports
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'daily' && <DailyReports />}
      {activeTab === 'historical' && <HistoricalReports />}
    </div>
  );
};
