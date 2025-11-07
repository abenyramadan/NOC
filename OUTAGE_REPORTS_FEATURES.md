# Outage Reports - Enhanced Features

## Overview

The Outage Reports system has been enhanced with **hour-based filtering** and **automatic ticket synchronization**. These features prevent user confusion and ensure data consistency across the entire system.

---

## 🆕 New Features

### 1. **Hour-Based Filtering** 🕐

Users can now filter outage reports by specific hours to avoid confusion when viewing or editing reports.

#### **How It Works**
- **Date Selector**: Choose any date to view reports
- **Hour Selector**: Dropdown with 24 hours (00:00 to 23:00)
- **"All Hours" Option**: View entire day's reports
- **Visual Indicator**: Shows currently selected date and hour

#### **User Interface**
```
📅 Date: [2025-10-22]  🕐 Hour: [14:00 - 14:59]
📊 Viewing reports for Oct 22, 2025 at 14:00 hour
```

#### **Benefits**
- ✅ **No Confusion**: Users see only the hour they're interested in
- ✅ **Easy Editing**: Edit reports from specific hourly batches
- ✅ **Better Organization**: Hourly reports are clearly separated
- ✅ **Precise Tracking**: Know exactly which hour's data you're viewing

---

### 2. **Automatic Ticket Closure** 🔒

When an outage report status is changed to "Closed", the associated ticket is automatically closed.

#### **How It Works**
1. User edits outage report
2. Changes status to "Closed"
3. System finds associated ticket
4. Automatically closes the ticket
5. Updates ticket with:
   - Status: "Closed"
   - Closed by: Current user
   - Closed timestamp
   - Updated by: Current user

#### **Visual Indicator**
When editing an outage and selecting "Closed" status:
```
Status: [Closed ▼]
🔒 Will auto-close ticket
```

#### **Benefits**
- ✅ **Data Consistency**: Outages and tickets always in sync
- ✅ **No Manual Work**: Automatic synchronization
- ✅ **Audit Trail**: Tracks who closed the ticket
- ✅ **Error Prevention**: Prevents orphaned tickets

---

### 3. **Real-Time Updates Everywhere** 🔄

Changes to outage reports propagate throughout the system.

#### **What Gets Updated**
- **Outage Reports Table**: Immediately reflects changes
- **Associated Tickets**: Auto-closed when outage closed
- **Daily Reports**: Includes updated data
- **Hourly Reports**: Shows current status
- **Metrics**: Updated in real-time

#### **Synchronized Fields**
- Status (Open → In Progress → Resolved → Closed)
- Root Cause
- Username
- Resolution Time
- Expected Resolution Hours
- Supervisor

---

## 📱 User Guide

### **Viewing Outage Reports**

#### **Step 1: Select Date and Hour**
1. Go to **Reports** → **Outage Reports**
2. Select a date from the date picker
3. Choose a specific hour or "All Hours"
4. Reports are automatically filtered

#### **Step 2: Apply Additional Filters**
- **Status**: Open, In Progress, Resolved, Closed
- **Region**: Bahr gha zal, Equatoria, Upper Nile
- **Alarm Type**: Critical, Major, Minor
- **Sort By**: Latest first, oldest first, site name, etc.

#### **Step 3: View Reports**
- Table shows all matching reports
- Each row displays complete outage information
- Status badges color-coded for quick identification

---

### **Editing Outage Reports**

#### **Step 1: Click Edit**
1. Find the report you want to edit
2. Click the "Edit" button in the last column
3. Row changes to edit mode

#### **Step 2: Update Fields**
Editable fields:
- ✏️ **Expected Resolution Hours**: How long it should take
- ✏️ **Root Cause**: Generator, Transmission, Radio, Environment, Others
- ✏️ **Username**: NOC engineer handling the issue
- ✏️ **Actual Resolution Time**: When it was actually resolved
- ✏️ **Status**: Open, In Progress, Resolved, Closed

#### **Step 3: Save Changes**
1. Review your changes
2. If setting status to "Closed", note the auto-close warning
3. Click "Save" button
4. Changes are immediately applied
5. Associated ticket auto-closes if status is "Closed"

#### **Step 4: Verify**
- ✅ Outage report updated in table
- ✅ Ticket status changed (if closed)
- ✅ Changes reflected in daily reports
- ✅ Metrics updated on dashboard

---

## 🔧 Technical Details

### **Backend Changes**

#### **Route Updates** (`backend/routes/outageReports.js`)
```javascript
// New query parameter: reportHour
GET /api/outage-reports?reportHour=2025-10-22T14:00:00.000Z

// Filters reports for specific hour (14:00 to 14:59)
if (reportHour) {
  const hourDate = new Date(reportHour);
  const nextHour = new Date(hourDate.getTime() + 60 * 60 * 1000);
  filter.reportHour = { $gte: hourDate, $lt: nextHour };
}
```

#### **Service Updates** (`backend/services/outageReportService.js`)
```javascript
async updateOutageReport(id, updateData, userId) {
  // ... existing update logic ...
  
  // Auto-close ticket when outage closed
  if (updateData.status === 'Closed' && existingReport.status !== 'Closed') {
    const ticket = await Ticket.findOne({ alarmId: existingReport.alarmId });
    if (ticket && ticket.status !== 'Closed') {
      ticket.status = 'Closed';
      ticket.closedBy = userId;
      ticket.closedAt = new Date();
      await ticket.save();
    }
  }
}
```

### **Frontend Changes** (`src/components/OutageReports.tsx`)

#### **State Management**
```typescript
const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
const [selectedHour, setSelectedHour] = useState<string>('all');
```

#### **Filter Logic**
```typescript
if (selectedHour !== 'all') {
  // Filter by specific hour
  const hourDate = new Date(selectedDate);
  hourDate.setHours(parseInt(selectedHour), 0, 0, 0);
  queryFilters.reportHour = hourDate.toISOString();
} else {
  // Filter by whole day
  queryFilters.startDate = startDate.toISOString();
  queryFilters.endDate = endDate.toISOString();
}
```

---

## 📊 Data Flow

### **When User Updates Outage Report**

```
1. User edits outage report
   ↓
2. Frontend sends PUT /api/outage-reports/:id
   ↓
3. Backend validates changes
   ↓
4. Update outage report in database
   ↓
5. Check if status changed to "Closed"
   ↓
6. If YES → Find associated ticket
   ↓
7. Auto-close ticket with user info
   ↓
8. Return updated outage report
   ↓
9. Frontend refreshes display
   ↓
10. User sees updated data everywhere
```

### **When Viewing Hourly Reports**

```
1. User selects date and hour
   ↓
2. Frontend builds query with reportHour
   ↓
3. Backend filters OutageReport collection
   ↓
4. Query: { reportHour: { $gte: hourStart, $lt: hourEnd } }
   ↓
5. Returns only reports from that specific hour
   ↓
6. Frontend displays filtered results
   ↓
7. User sees clear, unconfused view of data
```

---

## 🎯 Use Cases

### **Use Case 1: NOC Engineer Reviewing Hourly Batch**

**Scenario**: Engineer needs to review and update reports from 2 PM batch.

**Steps**:
1. Navigate to Outage Reports
2. Select today's date
3. Choose "14:00 - 14:59" from hour dropdown
4. See only the 2 PM batch reports
5. Edit each report with correct information
6. Save changes
7. Move to next hour's batch

**Result**: ✅ No confusion about which reports belong to which hour

---

### **Use Case 2: Closing Resolved Outages**

**Scenario**: Multiple outages have been resolved and need to be closed.

**Steps**:
1. Filter by status: "Resolved"
2. Select date and hour of interest
3. Click edit on resolved outage
4. Change status to "Closed"
5. See warning: "🔒 Will auto-close ticket"
6. Save changes
7. Verify ticket is also closed in Ticket Management

**Result**: ✅ Outage and ticket both closed automatically

---

### **Use Case 3: Historical Analysis by Hour**

**Scenario**: Analyze outage patterns during specific hours.

**Steps**:
1. Select historical date
2. Choose specific problematic hour (e.g., peak traffic hours)
3. Review all outages from that hour
4. Identify patterns and root causes
5. Export data for reporting

**Result**: ✅ Clear hourly breakdown for analysis

---

## 📈 Benefits Summary

### **For Users**
- ✅ **No Confusion**: Clear indication of which hour's data they're viewing
- ✅ **Easy Navigation**: Simple date and hour selectors
- ✅ **Visual Feedback**: Clear indicators and warnings
- ✅ **Confidence**: Know exactly what they're editing

### **For System**
- ✅ **Data Consistency**: Outages and tickets always synchronized
- ✅ **Audit Trail**: Track who closed what and when
- ✅ **Performance**: Efficient hour-based queries
- ✅ **Reliability**: Automatic synchronization prevents errors

### **For Organization**
- ✅ **Accurate Reporting**: Hourly reports reflect true status
- ✅ **Better Metrics**: Clear hourly breakdown of outages
- ✅ **Compliance**: Proper tracking and documentation
- ✅ **Efficiency**: Reduced manual work and errors

---

## 🔍 Troubleshooting

### **Issue: Hour filter not showing expected reports**

**Solution**:
1. Verify correct date is selected
2. Check if reports exist for that hour
3. Try "All Hours" to see full day
4. Refresh the page

### **Issue: Ticket not auto-closing**

**Solution**:
1. Check backend logs for errors
2. Verify alarm ID exists on outage report
3. Ensure ticket exists for that alarm
4. Check user permissions

### **Issue: Changes not reflecting immediately**

**Solution**:
1. Refresh the page
2. Check network connectivity
3. Verify backend is running
4. Clear browser cache

---

## 🚀 Future Enhancements

### **Potential Improvements**
- 📊 Hour-by-hour comparison charts
- 🔔 Notifications when editing specific hours
- 📥 Export hourly reports to Excel
- 🔄 Batch operations for entire hours
- 📈 Real-time live updates via WebSocket
- 🎨 Visual timeline of hourly outages
- 🔍 Advanced search across hours
- 📝 Notes/comments per hourly batch

---

## 📚 Related Documentation

- `/DAILY_ALARM_TRACKING.md` - Daily alarm tracking system
- `/README.md` - Main system documentation
- `/backend/services/outageReportService.js` - Service implementation
- `/src/components/OutageReports.tsx` - Frontend component

---

## ✅ Summary

The enhanced Outage Reports system provides:

1. **🕐 Hour-Based Filtering**
   - Select specific hours for viewing/editing
   - Prevents confusion about which batch is being modified
   - Clear visual indicators of selected time period

2. **🔒 Automatic Ticket Synchronization**
   - Closing outages auto-closes tickets
   - Maintains data consistency
   - Reduces manual work and errors

3. **📊 Better Organization**
   - Hourly batches clearly separated
   - Easy navigation between hours
   - Comprehensive filtering options

4. **✨ Improved User Experience**
   - No confusion about what's being edited
   - Visual warnings and confirmations
   - Real-time updates across the system

**Created**: October 22, 2025  
**Version**: 2.0  
**System**: NOCALERT Outage Management
