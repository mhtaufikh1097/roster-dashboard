<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '../api';
import { auth } from '../auth';
import { setNotice } from '../notice';
import { printReports } from '../printStore';
import { rosterStore } from '../rosterStore';
import type { ActivityReport, DailyActivityShift, DailyActivityStatus } from '../types';
import { formatActivityDate } from '../utils/date';
import PeriodPrintDialog from '../components/PeriodPrintDialog.vue';

const SHIFTS: DailyActivityShift[] = ['Pagi', 'Siang', 'Office Hour', 'Libur'];

type FilterTab = 'all' | 'Submitted' | 'Draft' | 'Reviewed' | 'Closed';

const reports = ref<ActivityReport[]>([]);
const loading = ref(false);
const activeTab = ref<FilterTab>('all');
const selectedId = ref<string | null>(null);
const showPeriodDialog = ref(false);
const supervisorNameInput = ref('');
const filters = reactive({ date: '', person: '', shift: '' });

const userJobTitle = computed((): string => {
  const pos = auth.state.user?.position?.trim();
  if (pos && pos.toLowerCase() !== 'supervisor') return pos;
  return 'IT Engineer';
});

const defaultSupervisorName = computed((): string => {
  const user = auth.state.user;
  if (!user) return userJobTitle.value;
  if (user.personnelId) {
    const linked = rosterStore.personnel.find((p) => p.id === user.personnelId);
    if (linked?.name) return linked.name;
  }
  return user.fullName?.trim() || user.username;
});

const load = async (): Promise<void> => {
  loading.value = true;
  try {
    const list = await api<ActivityReport[]>('GET', '/activity');
    reports.value = list.reverse();
    if (!supervisorNameInput.value) {
      supervisorNameInput.value = defaultSupervisorName.value;
    }
  } catch (e) {
    setNotice(e instanceof Error ? e.message : 'Gagal memuat laporan technician.', 'error');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  void load();
  if (!rosterStore.personnel.length) void rosterStore.loadPersonnel();
});

const counts = computed(() => {
  const c = { total: reports.value.length, draft: 0, submitted: 0, reviewed: 0, closed: 0 };
  for (const r of reports.value) {
    if (r.status === 'Draft') c.draft += 1;
    else if (r.status === 'Submitted') c.submitted += 1;
    else if (r.status === 'Reviewed') c.reviewed += 1;
    else if (r.status === 'Closed') c.closed += 1;
  }
  return c;
});

const visible = computed(() =>
  reports.value.filter(
    (r) =>
      (activeTab.value === 'all' || r.status === activeTab.value) &&
      (!filters.date || r.date === filters.date) &&
      (!filters.person || r.personOnDuty.toLowerCase().includes(filters.person.toLowerCase())) &&
      (!filters.shift || r.shift === filters.shift),
  ),
);

const selected = computed(() => reports.value.find((r) => r.id === selectedId.value) ?? null);

const hasText = (values: string[]): boolean => values.some((v) => v.trim().length > 0);
const validEvents = (r: ActivityReport) =>
  r.events.filter((e) => hasText([e.time, e.contact, e.location, e.overview, e.measures, e.result]));
const validNotifications = (r: ActivityReport) => r.notifications.filter((n) => hasText([n.person, n.content]));

const statusClass = (status: DailyActivityStatus): string => status.toLowerCase();
const statusLabel = (status: DailyActivityStatus): string => {
  if (status === 'Draft') return 'Dikerjakan Technician (Draft)';
  if (status === 'Submitted') return 'Menunggu Approval (Submitted)';
  if (status === 'Reviewed') return 'Approved (Reviewed)';
  return 'Selesai (Closed)';
};

const openReview = (report: ActivityReport): void => {
  selectedId.value = report.id;
  if (!supervisorNameInput.value) {
    supervisorNameInput.value = defaultSupervisorName.value;
  }
};

const approveReport = async (report: ActivityReport, customName?: string): Promise<void> => {
  const chosenName = (customName ?? supervisorNameInput.value ?? defaultSupervisorName.value).trim();
  if (!chosenName) {
    setNotice(`Nama ${userJobTitle.value} wajib diisi untuk Approve.`, 'error');
    return;
  }
  try {
    await api('POST', `/activity/${report.id}/acknowledge`, { acknowledgedByName: chosenName });
    setNotice(`Laporan tanggal ${formatActivityDate(report.date)} berhasil di-approve oleh ${chosenName} (${userJobTitle.value}).`, 'success');
    await load();
  } catch (e) {
    setNotice(e instanceof Error ? e.message : 'Gagal meng-approve laporan.', 'error');
  }
};

const returnToTechnician = async (report: ActivityReport): Promise<void> => {
  if (!window.confirm('Kembalikan laporan ini ke status Draft agar diperbaiki oleh Technician?')) return;
  try {
    await api('POST', `/activity/${report.id}/reject`);
    setNotice('Laporan dikembalikan ke Technician (Draft).', 'warning');
    await load();
  } catch (e) {
    setNotice(e instanceof Error ? e.message : 'Gagal mengembalikan laporan.', 'error');
  }
};

const closeReport = async (report: ActivityReport): Promise<void> => {
  if (!window.confirm('Tandai laporan ini sebagai selesai (Closed)?')) return;
  try {
    await api('POST', `/activity/${report.id}/close`);
    setNotice('Laporan ditutup (Closed).', 'success');
    await load();
  } catch (e) {
    setNotice(e instanceof Error ? e.message : 'Gagal menutup laporan.', 'error');
  }
};

const printOne = (report: ActivityReport): void => {
  void printReports([report]);
};
</script>

<template>
  <!-- Kartu Ringkasan Eksekutif Khusus Approval -->
  <section class="supervisor-kpi-grid">
    <button
      type="button"
      class="supervisor-kpi-card pending"
      :class="{ 'is-selected': activeTab === 'Submitted' }"
      @click="activeTab = 'Submitted'"
    >
      <span class="kpi-label">Menunggu Approval {{ userJobTitle }}</span>
      <strong class="kpi-value">{{ counts.submitted }}</strong>
      <small>Sudah di-submit technician</small>
    </button>

    <button
      type="button"
      class="supervisor-kpi-card progress"
      :class="{ 'is-selected': activeTab === 'Draft' }"
      @click="activeTab = 'Draft'"
    >
      <span class="kpi-label">Sedang Dikerjakan Technician</span>
      <strong class="kpi-value">{{ counts.draft }}</strong>
      <small>Progres shift berjalan (Draft)</small>
    </button>

    <button
      type="button"
      class="supervisor-kpi-card approved"
      :class="{ 'is-selected': activeTab === 'Reviewed' }"
      @click="activeTab = 'Reviewed'"
    >
      <span class="kpi-label">Sudah Di-Approve</span>
      <strong class="kpi-value">{{ counts.reviewed }}</strong>
      <small>Acknowledged by {{ userJobTitle }}</small>
    </button>

    <button
      type="button"
      class="supervisor-kpi-card all"
      :class="{ 'is-selected': activeTab === 'all' }"
      @click="activeTab = 'all'"
    >
      <span class="kpi-label">Total Laporan Technician</span>
      <strong class="kpi-value">{{ counts.total }}</strong>
      <small>{{ counts.closed }} laporan Closed</small>
    </button>
  </section>

  <section class="view-panel supervisor-panel" aria-live="polite">
    <!-- ================= DETAIL & APPROVAL PANEL ================= -->
    <template v-if="selected">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Lembar Pemeriksaan {{ userJobTitle }}</p>
          <h2>Review Laporan Kerja Technician — {{ formatActivityDate(selected.date) }}</h2>
        </div>
        <div class="inline-actions">
          <button type="button" class="secondary-button" @click="selectedId = null">← Kembali ke Tabel Monitoring</button>
          <button type="button" class="secondary-button" @click="printOne(selected)">Print PDF</button>
        </div>
      </div>

      <!-- Kotak Keputusan Approval di bagian atas agar langsung terlihat -->
      <div class="supervisor-decision-banner" :class="statusClass(selected.status)">
        <div class="decision-info">
          <span class="decision-kicker">Status Saat Ini: {{ statusLabel(selected.status) }}</span>
          <p v-if="selected.status === 'Submitted'">
            Laporan ini sudah diselesaikan dan di-submit oleh <strong>{{ selected.personOnDuty }}</strong>. Silakan periksa rincian pekerjaan di bawah lalu klik <strong>Approve &amp; Acknowledge</strong>.
          </p>
          <p v-else-if="selected.status === 'Draft'">
            Laporan ini masih berstatus <strong>Draft</strong> (sedang dikerjakan oleh technician <strong>{{ selected.personOnDuty }}</strong> dan belum di-submit).
          </p>
          <p v-else>
            Laporan ini telah di-approve oleh <strong>{{ selected.handover.acknowledgedBy }}</strong>.
          </p>
        </div>

        <div class="decision-controls">
          <template v-if="selected.status === 'Submitted'">
            <label class="supervisor-name-field">
              <span>Nama {{ userJobTitle }} (Acknowledged by)</span>
              <input
                v-model="supervisorNameInput"
                type="text"
                :placeholder="`Nama ${userJobTitle}`"
              />
            </label>
            <button type="button" class="primary-button" @click="approveReport(selected, supervisorNameInput)">
              ✓ Approve &amp; Acknowledge
            </button>
            <button type="button" class="secondary-button" @click="returnToTechnician(selected)">
              Kembalikan ke Technician
            </button>
          </template>
          <template v-else-if="selected.status === 'Reviewed'">
            <button type="button" class="primary-button" @click="closeReport(selected)">
              Tandai Selesai (Close)
            </button>
            <button type="button" class="secondary-button" @click="returnToTechnician(selected)">
              Buka Kembali (Revisi)
            </button>
          </template>
        </div>
      </div>

      <div class="activity-summary-grid">
        <div class="activity-summary-box"><span>Report Date</span><strong>{{ formatActivityDate(selected.date) }}</strong></div>
        <div class="activity-summary-box"><span>Technician on Duty</span><strong>{{ selected.personOnDuty || '—' }}</strong></div>
        <div class="activity-summary-box"><span>Shift</span><strong>{{ selected.shift }}</strong></div>
        <div class="activity-summary-box">
          <span>Acknowledged by :</span>
          <strong>{{ selected.handover.acknowledgedBy || 'Belum Di-Approve' }}</strong>
        </div>
      </div>

      <div class="activity-card">
        <h3>Fault &amp; Event Registration (Dikerjakan Technician)</h3>
        <div class="table-scroll">
          <table class="daily-activity-table">
            <thead>
              <tr><th>No.</th><th>Time</th><th>Report Person / Team (Contact)</th><th>Event Location</th><th>Fault / Event Overview</th><th>Disposal Measures</th><th>Result</th></tr>
            </thead>
            <tbody>
              <tr v-for="(event, index) in validEvents(selected)" :key="event.id">
                <td>{{ index + 1 }}</td><td>{{ event.time || '—' }}</td><td>{{ event.contact || '—' }}</td>
                <td>{{ event.location || '—' }}</td><td>{{ event.overview || '—' }}</td>
                <td>{{ event.measures || '—' }}</td><td>{{ event.result || '—' }}</td>
              </tr>
              <tr v-if="!validEvents(selected).length"><td colspan="7">Tidak ada catatan fault / event pada shift ini.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="activity-card">
        <h3>Information Notification Record</h3>
        <div class="table-scroll">
          <table class="daily-activity-table">
            <thead><tr><th>No.</th><th>Notifying Person / Team</th><th>Content</th></tr></thead>
            <tbody>
              <tr v-for="(n, index) in validNotifications(selected)" :key="n.id">
                <td>{{ index + 1 }}</td><td>{{ n.person || '—' }}</td><td>{{ n.content || '—' }}</td>
              </tr>
              <tr v-if="!validNotifications(selected).length"><td colspan="3">Tidak ada catatan notifikasi pada shift ini.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="handover-overview">
        <div class="handover-box">
          <h3>Handover Record</h3>
          <div class="handover-row">
            <span>Are spare parts, tools and auxiliary materials complete?</span>
            <strong>{{ selected.handover.sparePartsStatus || '—' }}</strong>
          </div>
          <div class="handover-row"><span>Handover Matters</span><p>{{ selected.handover.handoverMatters || '—' }}</p></div>
        </div>
        <div class="handover-box">
          <div class="handover-grid">
            <div><label>Handover Person</label><strong>{{ selected.handover.handoverPerson || '—' }}</strong></div>
            <div><label>Time</label><strong>{{ selected.handover.handoverTime || '—' }}</strong></div>
            <div><label>Takeover Person</label><strong>{{ selected.handover.takeoverPerson || '—' }}</strong></div>
            <div><label>Time</label><strong>{{ selected.handover.takeoverTime || '—' }}</strong></div>
            <div class="acknowledged-field">
              <label>Acknowledged by :</label>
              <strong>{{ selected.handover.acknowledgedBy || `Menunggu Approval ${userJobTitle}` }}</strong>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ================= TABEL MONITORING & APPROVAL ================= -->
    <template v-else>
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Modul Khusus {{ userJobTitle }}</p>
          <h2>Monitoring &amp; Approval Laporan Kerja Technician</h2>
        </div>
        <div class="inline-actions">
          <button type="button" class="secondary-button" @click="load">Refresh Data</button>
          <button type="button" class="primary-button" @click="showPeriodDialog = true">
            Print Laporan Periode
          </button>
        </div>
      </div>

      <div class="supervisor-Toolbar">
        <div class="admin-tabs">
          <button type="button" class="admin-tab" :class="{ 'is-active': activeTab === 'all' }" @click="activeTab = 'all'">
            Semua Laporan ({{ counts.total }})
          </button>
          <button type="button" class="admin-tab" :class="{ 'is-active': activeTab === 'Submitted' }" @click="activeTab = 'Submitted'">
            Perlu Approval ({{ counts.submitted }})
          </button>
          <button type="button" class="admin-tab" :class="{ 'is-active': activeTab === 'Draft' }" @click="activeTab = 'Draft'">
            Sedang Dikerjakan Technician ({{ counts.draft }})
          </button>
          <button type="button" class="admin-tab" :class="{ 'is-active': activeTab === 'Reviewed' }" @click="activeTab = 'Reviewed'">
            Sudah Approved ({{ counts.reviewed }})
          </button>
        </div>

        <div class="activity-filters">
          <label class="field-wrap compact-field"><span>Tanggal</span><input v-model="filters.date" type="date" /></label>
          <label class="field-wrap compact-field">
            <span>Cari Technician</span>
            <input v-model="filters.person" type="search" placeholder="Nama technician..." />
          </label>
          <label class="field-wrap compact-field">
            <span>Shift</span>
            <select v-model="filters.shift">
              <option value="">Semua Shift</option>
              <option v-for="s in SHIFTS" :key="s" :value="s">{{ s }}</option>
            </select>
          </label>
          <label class="field-wrap compact-field">
            <span>Nama {{ userJobTitle }} (Approve Cepat)</span>
            <input v-model="supervisorNameInput" type="text" :placeholder="`Nama ${userJobTitle}`" />
          </label>
        </div>
      </div>

      <div v-if="loading" class="empty-state">Memuat daftar laporan technician...</div>
      <div v-else-if="!visible.length" class="empty-state">
        Tidak ada laporan technician pada kategori/filter ini.
      </div>
      <div v-else class="table-scroll">
        <table class="daily-activity-table supervisor-table">
          <thead>
            <tr>
              <th>Tanggal &amp; Shift</th>
              <th>Technician on Duty</th>
              <th>Handover → Takeover</th>
              <th>Ringkasan Pekerjaan Technician</th>
              <th>Status Progres</th>
              <th>Acknowledged by :</th>
              <th>Aksi Approval</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="report in visible" :key="report.id">
              <td>
                <strong>{{ formatActivityDate(report.date) }}</strong><br />
                <span class="shift-badge" :class="report.shift.toLowerCase().replace(/\s+/g, '-')">{{ report.shift }}</span>
              </td>
              <td>
                <strong>{{ report.personOnDuty || '—' }}</strong>
              </td>
              <td>
                <div class="handover-mini">
                  <span>Dari: <strong>{{ report.handover.handoverPerson || '—' }}</strong> ({{ report.handover.handoverTime || '--:--' }})</span>
                  <span>Ke: <strong>{{ report.handover.takeoverPerson || '—' }}</strong> ({{ report.handover.takeoverTime || '--:--' }})</span>
                </div>
              </td>
              <td>
                <div class="work-summary-cell">
                  <span class="work-pill">{{ validEvents(report).length }} Fault/Event</span>
                  <span class="work-pill">{{ validNotifications(report).length }} Notifikasi</span>
                  <p v-if="validEvents(report)[0]" class="work-preview">
                    "{{ validEvents(report)[0].overview || validEvents(report)[0].measures }}"
                  </p>
                  <p v-else-if="report.handover.handoverMatters" class="work-preview">
                    "Handover: {{ report.handover.handoverMatters }}"
                  </p>
                </div>
              </td>
              <td>
                <span class="activity-status-badge" :class="statusClass(report.status)">
                  {{ statusLabel(report.status) }}
                </span>
              </td>
              <td>
                <strong v-if="report.handover.acknowledgedBy" class="ack-supervisor-badge">
                  {{ report.handover.acknowledgedBy }}
                </strong>
                <span v-else-if="report.status === 'Submitted'" class="field-hint">Menunggu Approval Anda</span>
                <span v-else class="field-hint">Belum di-submit</span>
              </td>
              <td>
                <div class="activity-actions">
                  <button
                    v-if="report.status === 'Submitted'"
                    type="button"
                    class="primary-button compact-button"
                    @click="approveReport(report)"
                  >
                    ✓ Approve
                  </button>
                  <button
                    type="button"
                    class="secondary-button compact-button"
                    @click="openReview(report)"
                  >
                    {{ report.status === 'Submitted' ? 'Periksa & Approve' : 'Lihat Detail' }}
                  </button>
                  <button
                    v-if="report.status === 'Reviewed'"
                    type="button"
                    class="secondary-button compact-button"
                    @click="closeReport(report)"
                  >
                    Close
                  </button>
                  <button type="button" class="secondary-button compact-button" @click="printOne(report)">
                    Print
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>

  <PeriodPrintDialog v-if="showPeriodDialog" @close="showPeriodDialog = false" />
</template>

