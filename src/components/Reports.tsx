import React, { useState } from 'react';
import { DailyReports } from './DailyReports';
import { HistoricalReports } from './HistoricalReports';

export const Reports: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'daily' | 'historical'>('daily');

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="bg-card rounded-lg p-4 border border-border">
        <div className="flex space-x-4">
          <button
            onClick={() => setActiveTab('daily')}
            className={`px-4 py-2 rounded transition-colors ${
              activeTab === 'daily'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            📊 Daily Reports
          </button>
          <button
            onClick={() => setActiveTab('historical')}
            className={`px-4 py-2 rounded transition-colors ${
              activeTab === 'historical'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent'
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
