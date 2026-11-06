<script setup lang="ts">
import { computed } from 'vue';
import type { ActivityReport, DailyActivityShift } from '../types';
import { formatActivityDate } from '../utils/date';

const props = defineProps<{ report: ActivityReport }>();

const shiftLabel = (shift: DailyActivityShift): string => {
  if (shift === 'Pagi') return 'Pagi (06:00 - 15:00)';
  if (shift === 'Siang') return 'Siang (13:00 - 22:00)';
  return shift;
};

const hasText = (values: string[]): boolean => values.some((value) => value.trim().length > 0);

const events = computed(() => {
  const valid = props.report.events.filter((e) => hasText([e.time, e.contact, e.location, e.overview, e.measures, e.result]));
  return Array.from({ length: Math.max(3, valid.length) }, (_, i) => ({ item: valid[i], no: valid[i] ? i + 1 : '' }));
});

const notifications = computed(() => {
  const valid = props.report.notifications.filter((n) => hasText([n.person, n.content]));
  return Array.from({ length: Math.max(5, valid.length) }, (_, i) => ({ item: valid[i], no: valid[i] ? i + 1 : '' }));
});
</script>

<template>
  <div class="daily-activity-print-sheet">
    <header class="print-header-brand">
      <h1>Daily Operation and Maintenance<br />Shift Handover Records</h1>
    </header>

    <div class="print-header-grid">
      <div class="print-field"><span>Date :</span><strong>{{ formatActivityDate(report.date) }}</strong></div>
      <div class="print-field"><span>Person On Duty :</span><strong>{{ report.personOnDuty }}</strong></div>
      <div class="print-field"><span>Shift :</span><strong>{{ shiftLabel(report.shift) }}</strong></div>
    </div>

    <section class="print-section">
      <table class="fault-print-table">
        <colgroup><col /><col /><col /><col /><col /><col /><col /></colgroup>
        <thead>
          <tr class="table-section-title"><th colspan="7">Fault &amp; Event Registration</th></tr>
          <tr>
            <th>No.</th>
            <th>Time</th>
            <th>Report Person / Team (Contact)</th>
            <th>Event Location</th>
            <th>Fault / Event Overview</th>
            <th>Disposal Measures</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in events" :key="index">
            <td>{{ row.no }}</td>
            <td>{{ row.item?.time ?? '' }}</td>
            <td>{{ row.item?.contact ?? '' }}</td>
            <td>{{ row.item?.location ?? '' }}</td>
            <td>{{ row.item?.overview ?? '' }}</td>
            <td>{{ row.item?.measures ?? '' }}</td>
            <td>{{ row.item?.result ?? '' }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="print-section">
      <table class="notification-print-table">
        <colgroup><col /><col /><col /></colgroup>
        <thead>
          <tr class="table-section-title"><th colspan="3">Information Notification Record</th></tr>
          <tr><th>No.</th><th>Notifying Person / Team</th><th>Content</th></tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in notifications" :key="index">
            <td>{{ row.no }}</td>
            <td>{{ row.item?.person ?? '' }}</td>
            <td>{{ row.item?.content ?? '' }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="print-section">
      <table class="handover-title-table">
        <thead><tr class="table-section-title"><th>Handover Record</th></tr></thead>
      </table>
      <div class="handover-print-layout">
        <div class="handover-left-box">
          <div class="handover-yes-no">
            <span>Are spare parts, tools and auxiliary materials complete?</span>
            <div class="print-radio-row">
              <span>Yes <span class="print-checkbox" :class="{ selected: report.handover.sparePartsStatus === 'Yes' }" aria-hidden="true"></span></span>
              <span>No <span class="print-checkbox" :class="{ selected: report.handover.sparePartsStatus === 'No' }" aria-hidden="true"></span></span>
            </div>
          </div>
          <div class="handover-matters-box">
            <span>Handover Matters :</span>
            <p>{{ report.handover.handoverMatters }}</p>
          </div>
        </div>

        <div class="handover-right-box">
          <div class="handover-signatures">
            <div class="handover-signature">
              <span>Handover Person :</span>
              <strong>{{ report.handover.handoverPerson }}</strong>
              <span class="signature-time">Time :</span>
              <strong>{{ report.handover.handoverTime }}</strong>
            </div>
            <div class="handover-signature">
              <span>Takeover Person :</span>
              <strong>{{ report.handover.takeoverPerson }}</strong>
              <span class="signature-time">Time :</span>
              <strong>{{ report.handover.takeoverTime }}</strong>
            </div>
          </div>
          <div class="acknowledged-signature">
            <span>Acknowledged by :</span>
            <strong>{{ report.handover.acknowledgedBy }}</strong>
          </div>
        </div>
      </div>
    </section>

    <div class="print-notes">
      <strong>Notes:</strong>
      <p>1. "Fault and Event Registration" records the failure and event found in each shift.</p>
      <p>2. "Information Notification Record" records the information system-related call records received by each shift.</p>
    </div>
  </div>
</template>

