#!/usr/bin/env node

/**
 * Test the HTML generation for the daily report email
 */

import { dailyReportService } from './services/dailyReportService.js';

// Test data
const testData = {
  summary: {
    totalReports: 42,
    totalResolved: 35,
    totalInProgress: 7,
    totalOpen: 0,
    mttr: 85.5,
    totalCarryOverOutages: 5,
    totalResolvedToday: 30,
    slaPercentage: 85
  },
  alarmsByRootCause: [
    { rootCause: 'Power Outage', count: 12 },
    { rootCause: 'Fiber Cut', count: 8 },
    { rootCause: 'Hardware Failure', count: 6 },
    { rootCause: 'Configuration Error', count: 5 },
    { rootCause: 'Unknown', count: 11 }
  ],
  ticketsPerRegion: [
    { region: 'North', totalTickets: 15, resolvedTickets: 12, inProgressTickets: 3, withinSLA: 10, outOfSLA: 2 },
    { region: 'South', totalTickets: 12, resolvedTickets: 10, inProgressTickets: 2, withinSLA: 8, outOfSLA: 2 },
    { region: 'East', totalTickets: 8, resolvedTickets: 7, inProgressTickets: 1, withinSLA: 6, outOfSLA: 1 },
    { region: 'West', totalTickets: 7, resolvedTickets: 6, inProgressTickets: 1, withinSLA: 5, outOfSLA: 1 }
  ],
  allReports: [],
  newOutages: [],
  carryOverOutages: [],
  resolvedToday: []
};

console.log('🧪 Testing Daily Report Email HTML Generation...\n');

// Generate the email content
const { html, text } = await dailyReportService.generateDailyReportEmail(testData, new Date());

// Check if the Alarms by Root Cause table is present and properly formed
console.log('✅ Checking for Alarms by Root Cause table...');
const hasRootCauseTable = html.includes('<h3>Alarms by Root Cause</h3>');
const hasTableStructure = html.includes('<table') && html.includes('<thead') && html.includes('<tbody');
const hasRootCauseData = html.includes('Power Outage') && html.includes('12');

console.log(`   Table header present: ${hasRootCauseTable ? '✅' : '❌'}`);
console.log(`   Table structure present: ${hasTableStructure ? '✅' : '❌'}`);
console.log(`   Root cause data present: ${hasRootCauseData ? '✅' : '❌'}`);

if (hasRootCauseTable && hasTableStructure && hasRootCauseData) {
  console.log('\n🎉 Alarms by Root Cause table is properly implemented!');
  console.log('\n📊 Table should show:');
  console.log('   Root Cause        Count    %');
  console.log('   Power Outage       12    29%');
  console.log('   Fiber Cut           8    19%');
  console.log('   Hardware Failure    6    14%');
  console.log('   Configuration Error 5    12%');
  console.log('   Unknown            11    26%');
} else {
  console.log('\n❌ Alarms by Root Cause table has issues');
}

// Check HTML structure
console.log('\n🔍 Checking HTML structure...');
const openDivs = (html.match(/<div/g) || []).length;
const closeDivs = (html.match(/<\/div>/g) || []).length;
const openTables = (html.match(/<table/g) || []).length;
const closeTables = (html.match(/<\/table>/g) || []).length;

console.log(`   Div tags balanced: ${openDivs === closeDivs ? '✅' : '❌'} (${openDivs} open, ${closeDivs} close)`);
console.log(`   Table tags balanced: ${openTables === closeTables ? '✅' : '❌'} (${openTables} open, ${closeTables} close)`);

console.log('\n✨ Test completed!');
