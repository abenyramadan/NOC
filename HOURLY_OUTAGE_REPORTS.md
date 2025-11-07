# Hourly Outage Reports - Implementation Summary

## Overview
A comprehensive hourly outage reporting system has been implemented that automatically sends email reports every hour and provides a web interface to view historical reports with SLA metrics.

## Features Implemented

### 1. **Automated Hourly Email Reports**
- **Scheduler**: Runs at the top of every hour
- **Email Content**:
  - 📊 **Performance Metrics Cards**:
    - Total Resolved Tickets
    - Tickets Within SLA
    - Tickets Out of SLA
    - MTTR (Mean Time To Resolution)
  - 🔴 **Ongoing Outages Table**: Shows all active and in-progress outages
  - ✅ **Resolved/Closed Outages Table**: Shows outages resolved during the hour
  - 📋 **SLA Thresholds**: Displays configured SLA times

### 2. **Web Interface - Hourly Reports Page**
- **Location**: Accessible via sidebar menu "⏰ Hourly Reports"
- **Features**:
  - Date and hour selector to view historical reports
  - Real-time SLA metrics with color-coded cards
  - Separate tables for ongoing and resolved outages
  - Visual indicators for alarm severity and status

### 3. **SLA Tracking**
- **Configurable Thresholds** (in `.env`):
  - Critical: 30 minutes
  - Major: 60 minutes
  - Minor: 120 minutes
- **Metrics Calculated**:
  - Tickets resolved within SLA
  - Tickets resolved out of SLA
  - MTTR (average resolution time)

## Files Modified/Created

### Backend
1. **`backend/services/outageReportService.js`**
   - Updated scheduler to run hourly (instead of every minute)
   - Enhanced email template with metrics cards
   - Added SLA calculation logic
   - Separated ongoing and resolved outages

2. **`backend/routes/outageReports.js`**
   - Added new endpoint: `GET /api/outage-reports/hourly`
   - Returns structured data with ongoing/resolved outages and metrics

3. **`backend/.env`**
   - Added SLA threshold configuration:
     ```
     SLA_CRITICAL_MINUTES=30
     SLA_MAJOR_MINUTES=60
     SLA_MINOR_MINUTES=120
     ```

### Frontend
1. **`src/components/HourlyOutageReports.tsx`** (NEW)
   - Complete new component for viewing hourly reports
   - Date/hour selector
   - Metrics cards with icons
   - Ongoing and resolved outages tables

2. **`src/components/AppLayout.tsx`**
   - Imported `HourlyOutageReports` component
   - Added route case for 'hourly-reports'

3. **`src/components/Sidebar.tsx`**
   - Added menu item: "⏰ Hourly Reports"

## API Endpoints

### GET `/api/outage-reports/hourly`
**Query Parameters:**
- `reportHour` (required): ISO date string for the hour to query

**Response:**
```json
{
  "reportHour": "2025-10-21T15:00:00.000Z",
  "ongoingOutages": [
    {
      "id": "...",
      "siteNo": "BNM0834",
      "siteCode": "Abeim Nhom",
      "region": "UNITY",
      "alarmType": "CRITICAL",
      "occurrenceTime": "2025-10-21T15:23:00.000Z",
      "supervisor": "System Generated",
      "rootCause": "Under Investigation",
      "status": "Open"
    }
  ],
  "resolvedOutages": [...],
  "metrics": {
    "totalResolved": 5,
    "withinSLA": 4,
    "outOfSLA": 1,
    "mttr": 45
  }
}
```

## Email Report Structure

The hourly email includes:

1. **Header**
   - Report title
   - Generation timestamp
   - Report period (e.g., "Oct 21, 2025 15:00 - 16:00")

2. **Performance Metrics** (4 cards)
   - Total Resolved (blue)
   - Within SLA (green) with compliance %
   - Out of SLA (red) with breach %
   - MTTR (orange) in minutes

3. **Ongoing Outages Section**
   - Table with: Site No, Site Code, Region, Alarm Type, Occurrence Time, Supervisor, Root Cause, Status
   - Shows "No ongoing outages" if empty

4. **Resolved/Closed Outages Section**
   - Table with: Site No, Site Code, Region, Alarm Type, Occurrence Time, Resolution Time, Root Cause, Status
   - Shows "No outages resolved" if empty

5. **SLA Information**
   - Lists threshold for each severity level
   - Explains MTTR calculation

## How It Works

### Scheduler Flow
1. **Startup**: Scheduler starts when server starts
2. **First Run**: Executes immediately for testing
3. **Subsequent Runs**: Calculates time until next hour and schedules accordingly
4. **Hourly Execution**:
   - Finds all alarms from current hour
   - Creates outage reports for unprocessed critical/major alarms
   - Gathers ongoing and resolved outages
   - Calculates SLA metrics from tickets
   - Sends email to configured recipients
   - Marks reports as email sent

### SLA Calculation
For each resolved ticket in the hour:
1. Calculate duration: `resolvedAt - emailSentAt` (or `createdAt`)
2. Compare to threshold based on severity
3. Increment `withinSLA` or `outOfSLA` counter
4. Sum durations for MTTR calculation

## Configuration

### Email Recipients
Set in `.env`:
```
NOC_EMAILS=email1@example.com,email2@example.com
```

### SLA Thresholds
Modify in `.env`:
```
SLA_CRITICAL_MINUTES=30
SLA_MAJOR_MINUTES=60
SLA_MINOR_MINUTES=120
```

## Testing

### Test Email Immediately
The scheduler runs immediately on startup, then schedules hourly. To test:
1. Restart the backend server
2. Check console for: "📊 Generating outage report..."
3. Email should be sent if there are outages

### View Historical Reports
1. Navigate to "⏰ Hourly Reports" in the sidebar
2. Select a date and hour
3. View metrics and outage tables

## Benefits

1. **Automated Reporting**: No manual intervention needed
2. **SLA Compliance Tracking**: Real-time visibility into performance
3. **Historical Analysis**: View any hour's report through web interface
4. **Team Awareness**: Everyone receives the same report every hour
5. **Actionable Metrics**: MTTR and SLA compliance help identify issues
6. **Professional Presentation**: Clean, organized email format

## Next Steps (Optional Enhancements)

1. **Email Customization**: Allow users to subscribe/unsubscribe
2. **Report Scheduling**: Configure different intervals (e.g., every 2 hours)
3. **Trend Analysis**: Add charts showing SLA compliance over time
4. **Alert Thresholds**: Send special alerts if SLA compliance drops below threshold
5. **Export Reports**: Add PDF/Excel export functionality
6. **Mobile Optimization**: Ensure email renders well on mobile devices
