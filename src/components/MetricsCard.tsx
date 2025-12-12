import React from 'react';

interface MetricsCardProps {
  title: string;
  value: string | number;
  icon: string;
  trend?: string;
  color: string;
}

export const MetricsCard: React.FC<MetricsCardProps> = ({ title, value, icon, trend, color }) => {
  return (
    <div className="bg-card rounded-lg p-6 border border-border hover:border-accent transition-all">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-muted-foreground text-sm font-medium mb-2">{title}</p>
          <p className={`text-3xl font-bold ${color}`}>{value}</p>
          {trend && (
            <p className="text-xs text-muted-foreground mt-2">{trend}</p>
          )}
        </div>
        <div className={`text-4xl ${color} opacity-20`}>{icon}</div>
      </div>
    </div>
  );
};
