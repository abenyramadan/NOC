# Expected Resolution Time - Implementation Summary

## Overview
The outage report system has been enhanced to include an **Expected Resolution Time** field that allows users to set custom SLA targets for each outage. The SLA calculations (Within SLA, Out of SLA, and MTTR) now use this user-defined expected resolution time instead of fixed thresholds.

## Key Changes

### 1. **Database Model Update**
- **File**: `backend/models/OutageReport.js`
- **Change**: Added `expectedResolutionTime` field (Date, optional)
- This field stores the user-defined target resolution time for each outage

### 2. **SLA Calculation Logic**
- **File**: `backend/services/outageReportService.js`
- **Change**: Updated SLA calculation to prioritize `expectedResolutionTime`
- **Logic**:
  1. If `expectedResolutionTime` is set: Compare actual resolution time against this target
  2. If `expectedResolutionTime` is NOT set: Fall back to default thresholds (Critical: 30min, Major: 60min, Minor: 120min)
  3. Calculate MTTR based on actual resolution times (occurrence to resolution)

### 3. **Email Report Updates**
- **File**: `backend/services/outageReportService.js`
- **Ongoing Outages Table**: Added editable "Expected Resolution" column
- **Resolved Outages Table**: 
  - Added "Expected Resolution" column
  - Added "SLA Status" column showing:
    - ✅ Within SLA (actual/expected minutes)
    - ❌ Out of SLA (actual/expected minutes)
    - Or just duration if no target was set

### 4. **Frontend Components**

#### OutageReports Component
- **File**: `src/components/OutageReports.tsx`
- **Changes**:
  - Added "Expected Resolution" column to table
  - Made field editable with datetime-local input
  - Shows "Not set" in yellow italic if no expected time
  - Included in save/update operations

#### HourlyOutageReports Component
- **File**: `src/components/HourlyOutageReports.tsx`
- **Changes**:
  - Added "Expected Resolution" column to ongoing outages table
  - Added "Expected Resolution" and "SLA Status" columns to resolved outages table
  - Real-time SLA status calculation with color coding:
    - Green for within SLA
    - Red for out of SLA
    - Gray for no target set

### 5. **TypeScript Interface**
- **File**: `src/services/outageReportService.ts`
- **Change**: Added `expectedResolutionTime?: Date` to `OutageReport` interface
- Updated all data transformation functions to include this field

### 6. **API Endpoints**
- **File**: `backend/routes/outageReports.js`
- **Changes**:
  - `PUT /api/outage-reports/:id`: Now accepts `expectedResolutionTime` in request body
  - `GET /api/outage-reports/hourly`: Returns `expectedResolutionTime` for all outages

## How It Works

### Setting Expected Resolution Time
1. **In Outage Reports Page**: Click "Edit" on any outage, set the expected resolution time, click "Save"
2. **In Email Reports**: Fill in the "Expected Resolution" field (highlighted in yellow) for ongoing outages

### SLA Calculation Example

**Scenario 1: Expected Resolution Time is Set**
- Outage occurred: 10:00 AM
- Expected resolution: 10:30 AM (30 minutes)
- Actual resolution: 10:25 AM (25 minutes)
- **Result**: ✅ Within SLA (25/30 min)

**Scenario 2: Expected Resolution Time is Set (Breached)**
- Outage occurred: 10:00 AM
- Expected resolution: 10:30 AM (30 minutes)
- Actual resolution: 10:45 AM (45 minutes)
- **Result**: ❌ Out of SLA (45/30 min)

**Scenario 3: Expected Resolution Time NOT Set**
- Outage occurred: 10:00 AM
- Alarm type: CRITICAL
- Actual resolution: 10:25 AM (25 minutes)
- Default threshold: 30 minutes
- **Result**: ✅ Within SLA (25/30 min) - using default threshold

### MTTR Calculation
- **Formula**: Average of all (Actual Resolution Time - Occurrence Time)
- **Unit**: Minutes
- **Scope**: Only resolved outages in the current hour

## Benefits

1. **Flexibility**: Each outage can have a custom SLA target based on its specific circumstances
2. **Realistic Expectations**: Teams can set achievable targets rather than rigid thresholds
3. **Better Tracking**: More accurate SLA compliance metrics
4. **Accountability**: Clear visibility into which outages met expectations
5. **Backward Compatible**: Falls back to default thresholds if expected time isn't set

## User Workflow

### For NOC Team Members
1. Receive hourly email report
2. Review ongoing outages
3. Set expected resolution time for each outage based on:
   - Severity
   - Complexity
   - Available resources
   - Time of day
4. Update root cause and other details
5. Submit updates

### For Managers/Supervisors
1. Review hourly reports
2. Check SLA Status column in resolved outages
3. Identify patterns:
   - Which types of outages consistently breach SLA
   - Which team members meet expectations
   - Which sites have recurring issues
4. Make data-driven decisions for resource allocation

## Database Migration

**Note**: Existing outage reports will have `expectedResolutionTime: null`. The system will automatically fall back to default SLA thresholds for these records.

No migration script is needed as the field is optional and the system handles null values gracefully.

## Testing Recommendations

1. **Create Test Outage**: Set expected resolution time to 30 minutes from now
2. **Resolve Before Target**: Verify shows "Within SLA"
3. **Resolve After Target**: Verify shows "Out of SLA"
4. **No Expected Time**: Verify falls back to default threshold
5. **Edit Expected Time**: Verify can update and SLA recalculates
6. **Email Report**: Verify expected resolution field appears and is editable

## Future Enhancements (Optional)

1. **Smart Defaults**: Auto-populate expected resolution time based on alarm type and historical data
2. **Notifications**: Alert when outage is approaching expected resolution time
3. **Trends**: Show SLA compliance trends over time
4. **Bulk Edit**: Set expected resolution time for multiple outages at once
5. **Templates**: Save common expected resolution times for different scenarios
