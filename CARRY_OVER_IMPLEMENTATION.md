# Carry-Over Outages Implementation

## Overview
Successfully implemented a clean separation between today's outages and carry-over outages (unresolved incidents from previous days) in the Outage Reports page.

## What Was Changed

### 1. Frontend Component (`src/components/OutageReports.tsx`)
- **Added State Management**: New `carryOverReports` state to track unresolved incidents from previous days
- **Dual Data Fetching**: Component now fetches both today's reports and carry-over reports simultaneously
- **Visual Separation**: Two distinct sections with clear visual indicators:
  - 🟢 **Today's Outage Reports** (green theme) - Shows incidents that occurred on the selected date
  - 🟡 **Carry-Over Outages** (yellow/amber theme) - Shows unresolved incidents from before the selected date

### 2. Carry-Over Section Features
- **Highlighted Display**: Yellow-themed section with border to draw attention
- **Days Open Badge**: Shows how many days each incident has been open with color coding:
  - Yellow: 0-1 days
  - Orange: 2-3 days  
  - Red: 4+ days
- **Full Editability**: All carry-over incidents can be edited just like today's incidents
- **Automatic Updates**: When you edit a carry-over incident, it updates in both sections

### 3. Backend API (`backend/routes/outageReports.js`)
- **New Endpoint**: `GET /api/outage-reports/carry-over`
- **Query Logic**: Finds all reports where:
  - `occurrenceTime` is before the selected date
  - `status` is either 'Open' or 'In Progress'
- **Sorted by Date**: Returns oldest incidents first for priority attention

### 4. Service Layer (`src/services/outageReportService.ts`)
- **New Method**: `getCarryOverReports(selectedDate: string)`
- **Data Transformation**: Properly handles date conversions and field mapping
- **Error Handling**: Robust error handling with meaningful messages

## How It Works

### Data Flow
1. User selects a date on the Outage Reports page
2. Component makes two API calls:
   - Regular reports for the selected date
   - Carry-over reports (unresolved from before that date)
3. Both sets of data are displayed in separate sections
4. User can edit any incident in either section
5. Updates are saved and reflected in both sections

### Key Benefits
✅ **No Data Loss**: Unresolved incidents are never "lost" between reporting periods
✅ **Clear Visibility**: Team can immediately see which incidents need urgent attention
✅ **Priority Management**: Days-open badges help prioritize long-running issues
✅ **Continuity**: Incidents are tracked across multiple days until resolution
✅ **Full Control**: All incidents remain editable regardless of age

## Visual Design

### Carry-Over Section
- Background: Dark amber (`#2a2416`)
- Border: Yellow with transparency (`border-yellow-600/50`)
- Header: Yellow theme with warning emoji 🟡
- Text: Yellow-tinted for consistency
- Hover: Subtle yellow highlight

### Today's Section  
- Background: Dark gray (`#1e2230`)
- Border: Standard gray
- Header: White text with green emoji 🟢
- Text: Standard gray/white
- Hover: Standard gray highlight

## Database Queries

### Carry-Over Query
```javascript
OutageReport.find({
  occurrenceTime: { $lt: selectedDate },
  status: { $in: ['Open', 'In Progress'] }
})
```

### Today's Reports Query
```javascript
OutageReport.find({
  occurrenceTime: { $gte: startOfDay, $lte: endOfDay }
})
```

## Usage Instructions

1. **Navigate** to the Outage Reports page
2. **Select** any date using the date picker
3. **View** two sections:
   - Carry-over incidents (if any exist)
   - Today's incidents
4. **Edit** any incident by clicking the "Edit" button
5. **Update** fields as needed and click "Save"
6. **Monitor** the "Days Open" badge to prioritize old incidents

## Technical Notes

- Carry-over reports are fetched on every date change
- The component handles empty carry-over lists gracefully (section hidden if no carry-overs)
- All date/time fields are properly converted between ISO strings and Date objects
- The implementation is non-destructive - no existing functionality was removed
- Both sections share the same edit modal and update logic

## Future Enhancements (Optional)

- Add filtering options specific to carry-over incidents
- Implement automatic escalation for incidents open > X days
- Add email notifications for long-running carry-over incidents
- Create a dedicated "Carry-Over Dashboard" for management overview
- Add export functionality that separates carry-over vs new incidents

## Testing Checklist

✅ Carry-over section appears when unresolved incidents exist from previous days
✅ Carry-over section is hidden when no carry-over incidents exist
✅ Days-open calculation is accurate
✅ Color coding (yellow/orange/red) works correctly based on days open
✅ Edit functionality works for carry-over incidents
✅ Updates to carry-over incidents persist correctly
✅ Today's section shows only incidents from the selected date
✅ Date picker changes update both sections appropriately
✅ No console errors or warnings
✅ Loading states work correctly
✅ Error handling displays appropriate messages

## Maintenance

- The carry-over logic is self-contained in the `/carry-over` endpoint
- No database schema changes were required
- The implementation uses existing status fields ('Open', 'In Progress')
- No migration scripts needed

---

**Implementation Date**: November 11, 2025
**Status**: ✅ Complete and Ready for Use
