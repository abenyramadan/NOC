import React, { useEffect, useMemo, useState } from 'react';
import { outageReportService } from '@/services/outageReportService';

interface RegionAgg {
  region: string;
  totalTickets: number;
}

interface RootCauseAgg {
  rootCause: string;
  count: number;
}

const BarRow: React.FC<{ label: string; value: number; max: number; color?: string }> = ({ label, value, max, color = 'bg-blue-500' }) => {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="truncate text-sm text-foreground w-1/2" title={label}>{label}</div>
      <div className="flex-1">
        <div className="w-full bg-muted rounded h-3 overflow-hidden">
          <div className={`${color} h-3`} style={{ width: `${width}%` }} />
        </div>
      </div>
      <div className="w-14 text-right text-sm text-muted-foreground tabular-nums">{value}</div>
    </div>
  );
};

const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-card rounded-lg border border-border p-4">
    <h3 className="text-base font-semibold text-foreground mb-3">{title}</h3>
    {children}
  </div>
);

const DashboardContent: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketsPerRegion, setTicketsPerRegion] = useState<RegionAgg[]>([]);
  const [rootCauses, setRootCauses] = useState<RootCauseAgg[]>([]);

  const fetchSnapshot = async (date: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await outageReportService.getDailyReports(date);
      setTicketsPerRegion((data?.ticketsPerRegion || []).map((r: any) => ({
        region: r.region ?? 'Unknown',
        totalTickets: Number(r.totalTickets ?? 0)
      })));
      setRootCauses((data?.alarmsByRootCause || []).map((c: any) => ({
        rootCause: c.rootCause ?? 'Not specified',
        count: Number(c.count ?? 0)
      })));
    } catch (e: any) {
      setError(e?.message || 'Failed to load snapshot');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSnapshot(selectedDate);
  }, [selectedDate]);

  const maxRegion = useMemo(() => ticketsPerRegion.reduce((m, r) => Math.max(m, r.totalTickets), 0), [ticketsPerRegion]);
  const maxRoot = useMemo(() => rootCauses.reduce((m, r) => Math.max(m, r.count), 0), [rootCauses]);

  const leastRegion = useMemo(() => {
    if (ticketsPerRegion.length === 0) return null;
    return [...ticketsPerRegion].sort((a, b) => a.totalTickets - b.totalTickets)[0];
  }, [ticketsPerRegion]);

  const topRootCauses = useMemo(() => {
    return [...rootCauses].sort((a, b) => b.count - a.count).slice(0, 8);
  }, [rootCauses]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-background border border-input rounded px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <div className="text-sm text-primary ml-auto font-medium">
          {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded p-3">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SectionCard title="Tickets by Region">
          {loading && <div className="text-sm text-muted-foreground">Loading...</div>}
          {!loading && ticketsPerRegion.length === 0 && (
            <div className="text-sm text-muted-foreground">No data</div>
          )}
          {!loading && ticketsPerRegion.length > 0 && (
            <div className="space-y-1">
              {[...ticketsPerRegion]
                .sort((a, b) => b.totalTickets - a.totalTickets)
                .map((r) => (
                  <BarRow key={r.region} label={r.region} value={r.totalTickets} max={maxRegion} />
                ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Common Root Causes (Top 8)">
          {loading && <div className="text-sm text-muted-foreground">Loading...</div>}
          {!loading && topRootCauses.length === 0 && (
            <div className="text-sm text-muted-foreground">No data</div>
          )}
          {!loading && topRootCauses.length > 0 && (
            <div className="space-y-1">
              {topRootCauses.map((c) => (
                <BarRow key={c.rootCause} label={c.rootCause} value={c.count} max={maxRoot} color="bg-emerald-500" />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Region with Least Tickets">
          {loading && <div className="text-sm text-muted-foreground">Loading...</div>}
          {!loading && (
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-semibold text-foreground">
                {leastRegion ? leastRegion.region : '—'}
              </div>
              <div className="text-lg text-muted-foreground tabular-nums">
                {leastRegion ? leastRegion.totalTickets : 0}
              </div>
            </div>
          )}
          <div className="mt-3 text-xs text-muted-foreground">Lowest ticket count among regions for the selected date.</div>
        </SectionCard>
      </div>
    </div>
  );
};

export default DashboardContent;
