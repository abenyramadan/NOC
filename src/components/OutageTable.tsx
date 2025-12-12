import React from 'react';
import { format } from 'date-fns';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Button } from './ui/button';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { OutageReport } from '../services/outageReportService';

interface OutageTableProps {
  reports: OutageReport[];
  editingReport: OutageReport | null;
  setEditingReport: React.Dispatch<React.SetStateAction<OutageReport | null>>;
  onEdit: (r: OutageReport) => void;
  onSave: () => void;
  onCancel: () => void;
}

const formatDateTime = (date: Date | string | null | undefined) => {
  if (!date) return 'N/A';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return 'Invalid Date';
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
};

const getStatusBadgeColor = (status: string) => {
  switch (status) {
    case 'In Progress': return 'bg-yellow-100 text-yellow-800';
    case 'Resolved': return 'bg-green-100 text-green-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const getAlarmTypeColor = (alarmType: string) => {
  switch (alarmType) {
    case 'CRITICAL': return 'text-red-600 font-bold';
    case 'MAJOR': return 'text-orange-600 font-bold';
    case 'MINOR': return 'text-yellow-600 font-bold';
    default: return 'text-gray-600';
  }
};

export const OutageTable: React.FC<OutageTableProps> = ({
  reports,
  editingReport,
  setEditingReport,
  onEdit,
  onSave,
  onCancel
}) => {
  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted border-b border-border">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Site No</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Site Code</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Region</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Alarm Type</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Occurrence Time</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Expected Restoration Time</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Mandatory Restoration Time</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Supervisor</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Root Cause</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Subroot Cause</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Username</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Actual Resolution</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Edit</th>
            </tr>
          </thead>
          <tbody>
            {reports
              .filter(report => report && (report as any).id && typeof report === 'object')
              .map((report) => (
              <tr key={(report as any).id} className="border-b border-border hover:bg-accent">
                <td className="px-4 py-3 text-sm text-foreground">{report.siteNo || 'N/A'}</td>
                <td className="px-4 py-3 text-sm text-foreground">{report.siteCode || 'Unknown'}</td>
                <td className="px-4 py-3 text-sm text-foreground">{report.region || 'Unknown'}</td>
                <td className={`px-4 py-3 text-sm ${getAlarmTypeColor(report.alarmType)}`}>
                  {report.alarmType || 'Unknown'}
                </td>
                <td className="px-4 py-3 text-sm text-foreground">
                  {report.occurrenceTime ? formatDateTime(report.occurrenceTime) : 'Unknown'}
                </td>
                <td className="px-4 py-3 text-sm text-foreground">
                  {editingReport?.id === report.id ? (
                    <div className="space-y-1">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full justify-start text-left font-normal',
                              !editingReport.expectedRestorationTime && 'text-muted-foreground'
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {editingReport.expectedRestorationTime ? 
                              format(editingReport.expectedRestorationTime, 'PPPp') : 
                              <span>Pick a date and time</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={editingReport.expectedRestorationTime || undefined}
                            onSelect={(date) => {
                              if (date) {
                                const current = editingReport.expectedRestorationTime || new Date();
                                date.setHours(current.getHours(), current.getMinutes(), 0, 0);
                                setEditingReport(prev => prev ? {
                                  ...prev,
                                  expectedRestorationTime: date
                                } : null);
                              }
                            }}
                            className=""
                            classNames={{
                              day_selected: 'bg-primary hover:bg-primary/90',
                              day_today: 'bg-accent text-accent-foreground',
                              day_disabled: 'text-muted-foreground',
                              day_outside: 'text-muted-foreground',
                            }}
                            initialFocus
                          />
                          <div className="p-3 border-t border-border">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-foreground">Time:</span>
                              <input
                                type="time"
                                value={editingReport.expectedRestorationTime ? 
                                  `${editingReport.expectedRestorationTime.getHours().toString().padStart(2, '0')}:${editingReport.expectedRestorationTime.getMinutes().toString().padStart(2, '0')}` : 
                                  '00:00'}
                                onChange={(e) => {
                                  if (!editingReport.expectedRestorationTime) return;
                                  const [hours, minutes] = e.target.value.split(':').map(Number);
                                  const newDate = new Date(editingReport.expectedRestorationTime);
                                  newDate.setHours(hours, minutes);
                                  setEditingReport(prev => prev ? {
                                    ...prev,
                                    expectedRestorationTime: newDate
                                  } : null);
                                }}
                                className="bg-background border border-input rounded px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none"
                              />
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                      <div className="text-xs text-amber-400">
                        ⚠️ Required - Set estimated resolution time
                      </div>
                    </div>
                  ) : (
                    <span className="text-blue-400 font-semibold">
                      {report.expectedRestorationTime ? formatDateTime(report.expectedRestorationTime) : 'Not set'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-foreground">
                  {editingReport?.id === report.id ? (
                    <div className="space-y-1">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full justify-start text-left font-normal',
                              !editingReport.mandatoryRestorationTime && 'text-muted-foreground'
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {editingReport.mandatoryRestorationTime ? 
                              format(editingReport.mandatoryRestorationTime, 'PPPp') : 
                              <span>Pick a date and time</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={editingReport.mandatoryRestorationTime || undefined}
                            onSelect={(date) => {
                              if (date) {
                                const current = editingReport.mandatoryRestorationTime || new Date();
                                date.setHours(current.getHours(), current.getMinutes(), 0, 0);
                                setEditingReport(prev => prev ? {
                                  ...prev,
                                  mandatoryRestorationTime: date
                                } : null);
                              }
                            }}
                            className=""
                            classNames={{
                              day_selected: 'bg-primary hover:bg-primary/90',
                              day_today: 'bg-accent text-accent-foreground',
                              day_disabled: 'text-muted-foreground',
                              day_outside: 'text-muted-foreground',
                            }}
                            initialFocus
                          />
                          <div className="p-3 border-t border-border">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-foreground">Time:</span>
                              <input
                                type="time"
                                value={editingReport.mandatoryRestorationTime ? 
                                  `${editingReport.mandatoryRestorationTime.getHours().toString().padStart(2, '0')}:${editingReport.mandatoryRestorationTime.getMinutes().toString().padStart(2, '0')}` : 
                                  '00:00'}
                                onChange={(e) => {
                                  if (!editingReport.mandatoryRestorationTime) return;
                                  const [hours, minutes] = e.target.value.split(':').map(Number);
                                  const newDate = new Date(editingReport.mandatoryRestorationTime);
                                  newDate.setHours(hours, minutes);
                                  setEditingReport(prev => prev ? {
                                    ...prev,
                                    mandatoryRestorationTime: newDate
                                  } : null);
                                }}
                                className="bg-background border border-input rounded px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none"
                              />
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                      <div className="text-xs text-amber-400">
                        ⚠️ Required - Set SLA deadline
                      </div>
                    </div>
                  ) : (
                    <span className="text-red-400 font-semibold">
                      {report.mandatoryRestorationTime ? formatDateTime(report.mandatoryRestorationTime) : 'Not set'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-foreground">
                  {report.supervisor || 'N/A'}
                </td>
                <td className="px-4 py-3 text-sm text-foreground">
                  {editingReport?.id === report.id ? (
                    <select
                      value={editingReport.rootCause || ''}
                      onChange={(e) => setEditingReport(prev => prev ? { ...prev, rootCause: e.target.value as any } : null)}
                      className="w-full bg-background border border-input rounded px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none"
                    >
                      <option value="">Select Root Cause</option>
                      <option value="Generator">Generator</option>
                      <option value="Transmission">Transmission</option>
                      <option value="Radio">Radio</option>
                      <option value="Environment">Environment</option>
                      <option value="Others">Others</option>
                    </select>
                  ) : (
                    <span className="italic text-yellow-300">{report.rootCause || 'Not specified'}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-foreground">
                  {editingReport?.id === report.id ? (
                    <input
                      type="text"
                      value={editingReport.subrootCause || ''}
                      onChange={(e) => setEditingReport(prev => prev ? { ...prev, subrootCause: e.target.value } : null)}
                      placeholder="e.g., Fuel pump failure"
                      className="w-full bg-background border border-input rounded px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none"
                    />
                  ) : (
                    <span className="italic text-yellow-300">{report.subrootCause || 'Not specified'}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-foreground">
                  {editingReport?.id === report.id ? (
                    <input
                      type="text"
                      value={editingReport.username || ''}
                      onChange={(e) => setEditingReport(prev => prev ? { ...prev, username: e.target.value } : null)}
                      placeholder="Enter your username"
                      className="w-full bg-background border border-input rounded px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none"
                    />
                  ) : (
                    <span>{report.username || 'N/A'}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-foreground">
                  {editingReport?.id === report.id ? (
                    <div className="space-y-1">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full justify-start text-left font-normal',
                              !editingReport.resolutionTime && 'text-muted-foreground'
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {editingReport.resolutionTime ? 
                              format(editingReport.resolutionTime, 'PPPp') : 
                              <span>Pick resolution date and time</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={editingReport.resolutionTime || undefined}
                            onSelect={(date) => {
                              if (date) {
                                const current = editingReport.resolutionTime || new Date();
                                date.setHours(current.getHours(), current.getMinutes(), 0, 0);
                                setEditingReport(prev => prev ? {
                                  ...prev,
                                  resolutionTime: date
                                } : null);
                              }
                            }}
                            className=""
                            classNames={{
                              day_selected: 'bg-primary hover:bg-primary/90',
                              day_today: 'bg-accent text-accent-foreground',
                              day_disabled: 'text-muted-foreground',
                              day_outside: 'text-muted-foreground',
                            }}
                            initialFocus
                          />
                          <div className="p-3 border-t border-border">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-foreground">Time:</span>
                              <input
                                type="time"
                                value={editingReport.resolutionTime ? 
                                  `${editingReport.resolutionTime.getHours().toString().padStart(2, '0')}:${editingReport.resolutionTime.getMinutes().toString().padStart(2, '0')}` : 
                                  '00:00'}
                                onChange={(e) => {
                                  if (!editingReport.resolutionTime) return;
                                  const [hours, minutes] = e.target.value.split(':').map(Number);
                                  const newDate = new Date(editingReport.resolutionTime);
                                  newDate.setHours(hours, minutes);
                                  setEditingReport(prev => prev ? {
                                    ...prev,
                                    resolutionTime: newDate
                                  } : null);
                                }}
                                className="bg-background border border-input rounded px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none"
                              />
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                      {editingReport.status === 'Resolved' && !editingReport.resolutionTime && (
                        <div className="text-xs text-amber-400">
                          ⚠️ Required when status is Resolved
                        </div>
                      )}
                    </div>
                  ) : (
                    report.resolutionTime ? formatDateTime(report.resolutionTime) : 'Not Resolved'
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  {editingReport?.id === report.id ? (
                    <div className="space-y-1">
                      <select
                        value={editingReport.status || ''}
                        onChange={(e) => setEditingReport(prev => prev ? { ...prev, status: e.target.value as any } : null)}
                        className="w-full bg-background border border-input rounded px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none"
                      >
                        <option value="In Progress">In Progress</option>
                        <option value="Resolved">Resolved</option>
                      </select>
                    </div>
                  ) : (
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(report.status)}`}>
                      {report.status || 'Unknown'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  {editingReport?.id === report.id ? (
                    <div className="flex space-x-2">
                      <button
                        onClick={onSave}
                        className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={onCancel}
                        className="px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onEdit(report)}
                      className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
                    >
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default OutageTable;
