<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '../api';
import { auth } from '../auth';
import { setNotice } from '../notice';
import { printReports } from '../printStore';
import { getUserShiftInfo, rosterStore } from '../rosterStore';
import type {
  ActivityEvent,
  ActivityNotification,
  ActivityReport,
  DailyActivityShift,
  DailyActivityStatus,
  Status,
} from '../types';
import { formatActivityDate, getCurrentDateKey } from '../utils/date';
import PeriodPrintDialog from '../components/PeriodPrintDialog.vue';
import PersonnelMultiSelect from '../components/PersonnelMultiSelect.vue';

const SHIFTS: DailyActivityShift[] = ['Pagi', 'Siang', 'Office Hour', 'Libur'];
const STATUSES: DailyActivityStatus[] = ['Draft', 'Submitted', 'Reviewed', 'Closed'];

type Mode = 'list' | 'view';
type QuickScope = 'all' | 'mine' | 'Draft' | 'Submitted' | 'Reviewed';

const mode = ref<Mode>('list');
const showFormModal = ref(false);
const quickScope = ref<QuickScope>('all');
const reports = ref<ActivityReport[]>([]);
const loading = ref(false);
const saving = ref(false);
const selectedId = ref<string | null>(null);
const draft = ref<ActivityReport | null>(null);
const showPeriodDialog = ref(false);
const supervisorNameInput = ref('');
const filters = reactive({ date: '', person: '', shift: '', status: '' });

const uid = (): string => crypto.randomUUID();
const emptyEvent = (): ActivityEvent => ({ id: uid(), time: '', contact: '', location: '', overview: '', measures: '', result: '' });
const emptyNotification = (): ActivityNotification => ({ id: uid(), person: '', content: '' });

const defaultSupervisorName = computed((): string => {
  const user = auth.state.user;
  if (!user) return '';
  if (user.personnelId) {
    const linked = rosterStore.personnel.find((p) => p.id === user.personnelId);
    if (linked?.name) return linked.name;
  }
  return user.fullName?.trim() || user.username;
});

const shiftHoursLabel = (shift: DailyActivityShift): string => {
  if (shift === 'Pagi') return '06:00 – 15:00 WIB';
  if (shift === 'Siang') return '13:00 – 22:00 WIB';
  if (shift === 'Office Hour') return '08:00 – 17:00 WIB';
  return 'OFF Duty';
};

const defaultHandoverTimes = (shift: DailyActivityShift): { handoverTime: string; takeoverTime: string } => {
  if (shift === 'Pagi') return { handoverTime: '15:00', takeoverTime: '15:00' };
  if (shift === 'Siang') return { handoverTime: '22:00', takeoverTime: '06:00' };
  if (shift === 'Office Hour') return { handoverTime: '17:00', takeoverTime: '08:00' };
  return { handoverTime: '', takeoverTime: '' };
};

const myShift = computed(() => getUserShiftInfo(auth.state.user, rosterStore.selectedDate));

const emptyReport = (): ActivityReport => {
  const initialDuty = auth.state.user?.personnelId ? [auth.state.user.personnelId] : [];
  const initialShift: DailyActivityShift = myShift.value?.activityShift ?? 'Pagi';
  const times = defaultHandoverTimes(initialShift);
  return {
    id: '',
    date: myShift.value?.dateKey || getCurrentDateKey(),
    dutyPersonnelId: initialDuty[0] ?? null,
    dutyPersonnelIds: [...initialDuty],
    personOnDuty: '',
    shift: initialShift,
    status: 'Draft',
    createdBy: auth.state.user?.id ?? null,
    events: [emptyEvent()],
    notifications: [emptyNotification()],
    handover: {
      sparePartsStatus: 'Yes',
      handoverPersonnelId: initialDuty[0] ?? null,
      handoverPersonnelIds: [...initialDuty],
      handoverPerson: '',
      takeoverPersonnelId: null,
      takeoverPersonnelIds: [],
      takeoverPerson: '',
      handoverMatters: '',
      handoverTime: times.handoverTime,
      takeoverTime: times.takeoverTime,
      acknowledgedBy: '',
      acknowledgedAt: null,
    },
  };
};

const load = async (): Promise<void> => {
  loading.value = true;
  try {
    reports.value = await api<ActivityReport[]>('GET', '/activity');
    reports.value.reverse();
  } catch (e) {
    setNotice(e instanceof Error ? e.message : 'Gagal memuat laporan.', 'error');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  void load();
  if (!rosterStore.personnel.length) void rosterStore.loadPersonnel();
});

const isParticipant = (r: ActivityReport): boolean =>
  r.createdBy === auth.state.user?.id ||
  (!!auth.state.user?.personnelId && (r.dutyPersonnelIds ?? []).includes(auth.state.user.personnelId));

const kpi = computed(() => ({
  total: reports.value.length,
  mine: reports.value.filter(isParticipant).length,
  draft: reports.value.filter((r) => r.status === 'Draft').length,
  submitted: reports.value.filter((r) => r.status === 'Submitted').length,
  approved: reports.value.filter((r) => r.status === 'Reviewed' || r.status === 'Closed').length,
}));

const visible = computed(() =>
  reports.value.filter((r) => {
    if (quickScope.value === 'mine' && !isParticipant(r)) return false;
    if (quickScope.value === 'Draft' && r.status !== 'Draft') return false;
    if (quickScope.value === 'Submitted' && r.status !== 'Submitted') return false;
    if (quickScope.value === 'Reviewed' && r.status !== 'Reviewed' && r.status !== 'Closed') return false;

    const matchesDate = !filters.date || r.date === filters.date;
    const matchesPerson = !filters.person || r.personOnDuty.toLowerCase().includes(filters.person.toLowerCase());
    const matchesShift = !filters.shift || r.shift === filters.shift;
    const matchesStatus = !filters.status || r.status === filters.status;
    return matchesDate && matchesPerson && matchesShift && matchesStatus;
  }),
);

const selected = computed(() => reports.value.find((r) => r.id === selectedId.value) ?? null);

const statusClass = (status: DailyActivityStatus): string => status.toLowerCase();
const hasText = (values: string[]): boolean => values.some((v) => v.trim().length > 0);
const validEvents = (r: ActivityReport) =>
  r.events.filter((e) => hasText([e.time, e.contact, e.location, e.overview, e.measures, e.result]));
const validNotifications = (r: ActivityReport) => r.notifications.filter((n) => hasText([n.person, n.content]));

const canEdit = (r: ActivityReport): boolean => auth.isAdmin.value || (r.status === 'Draft' && isParticipant(r));
const canSubmit = (r: ActivityReport): boolean => r.status === 'Draft' && (auth.isAdmin.value || isParticipant(r));
const canAcknowledge = (r: ActivityReport): boolean => auth.canReview.value && r.status === 'Submitted';
const canReject = (r: ActivityReport): boolean => auth.canReview.value && (r.status === 'Submitted' || r.status === 'Reviewed');
const canClose = (r: ActivityReport): boolean => auth.canReview.value && r.status === 'Reviewed';
const lockedPersonnelId = computed(() => (auth.state.user?.role === 'user' ? auth.state.user.personnelId : null));

const onDutyIdsChange = (ids: number[]): void => {
  if (!draft.value) return;
  draft.value.dutyPersonnelIds = ids;
  draft.value.dutyPersonnelId = ids[0] ?? null;
  draft.value.handover.handoverPersonnelIds = [...ids];
  draft.value.handover.handoverPersonnelId = ids[0] ?? null;
};

const onShiftChange = (): void => {
  if (!draft.value) return;
  const times = defaultHandoverTimes(draft.value.shift);
  if (!draft.value.handover.handoverTime) draft.value.handover.handoverTime = times.handoverTime;
  if (!draft.value.handover.takeoverTime) draft.value.handover.takeoverTime = times.takeoverTime;
};

const autoFillFromRoster = (): void => {
  if (!draft.value || !rosterStore.active) {
    setNotice('Roster aktif tidak ditemukan pada tanggal tersebut.', 'warning');
    return;
  }
  const shiftMap: Record<DailyActivityShift, Status> = {
    Pagi: 'PAGI',
    Siang: 'SIANG',
    'Office Hour': 'Office Hour',
    Libur: '',
  };
  const targetStatus = shiftMap[draft.value.shift];
  const matchedNames = rosterStore.active.personnel
    .filter((p) => (p.schedule[draft.value!.date] ?? '') === targetStatus)
    .map((p) => p.name.toLowerCase());

  const matchedIds = rosterStore.personnel
    .filter((p) => matchedNames.includes(p.name.toLowerCase()))
    .map((p) => p.id);

  if (lockedPersonnelId.value && !matchedIds.includes(lockedPersonnelId.value)) {
    matchedIds.unshift(lockedPersonnelId.value);
  }

  if (!matchedIds.length) {
    setNotice(`Tidak ada jadwal ${draft.value.shift} pada tanggal ${formatActivityDate(draft.value.date)} di roster aktif.`, 'warning');
    return;
  }
  onDutyIdsChange(matchedIds);
  setNotice(`${matchedIds.length} personel shift ${draft.value.shift} dipilih otomatis dari roster.`, 'success');
};

const syncHandoverWithDuty = (): void => {
  if (!draft.value) return;
  draft.value.handover.handoverPersonnelIds = [...draft.value.dutyPersonnelIds];
  draft.value.handover.handoverPersonnelId = draft.value.dutyPersonnelIds[0] ?? null;
};

// ---- Navigasi & Modal ----
const openReport = (id: string): void => {
  selectedId.value = id;
  supervisorNameInput.value = defaultSupervisorName.value;
  mode.value = 'view';
};

const startCreate = (): void => {
  draft.value = emptyReport();
  showFormModal.value = true;
};

const startEdit = (id: string): void => {
  const report = reports.value.find((r) => r.id === id);
  if (!report) return;
  const copy = JSON.parse(JSON.stringify(report)) as ActivityReport;
  if (!Array.isArray(copy.dutyPersonnelIds) || !copy.dutyPersonnelIds.length) {
    copy.dutyPersonnelIds = copy.dutyPersonnelId ? [copy.dutyPersonnelId] : [];
  }
  if (!Array.isArray(copy.handover.handoverPersonnelIds)) {
    copy.handover.handoverPersonnelIds = copy.handover.handoverPersonnelId ? [copy.handover.handoverPersonnelId] : [];
  }
  if (!Array.isArray(copy.handover.takeoverPersonnelIds)) {
    copy.handover.takeoverPersonnelIds = copy.handover.takeoverPersonnelId ? [copy.handover.takeoverPersonnelId] : [];
  }
  if (!copy.events.length) copy.events.push(emptyEvent());
  if (!copy.notifications.length) copy.notifications.push(emptyNotification());
  draft.value = copy;
  showFormModal.value = true;
};

const closeFormModal = (): void => {
  showFormModal.value = false;
  draft.value = null;
};

const backToList = (): void => {
  mode.value = 'list';
};

// ---- Simpan & aksi ----
const save = async (submitNow = false): Promise<void> => {
  const d = draft.value;
  if (!d) return;
  if (!d.date || !d.dutyPersonnelIds.length) {
    setNotice('Tanggal laporan dan minimal 1 Person on Duty wajib dipilih sebelum menyimpan.', 'error');
    return;
  }
  const body = {
    date: d.date,
    dutyPersonnelId: d.dutyPersonnelIds[0] ?? null,
    dutyPersonnelIds: d.dutyPersonnelIds,
    shift: d.shift,
    submit: submitNow,
    events: d.events,
    notifications: d.notifications,
    handover: {
      sparePartsStatus: d.handover.sparePartsStatus,
      handoverPersonnelId: d.handover.handoverPersonnelIds[0] ?? null,
      handoverPersonnelIds: d.handover.handoverPersonnelIds,
      takeoverPersonnelId: d.handover.takeoverPersonnelIds[0] ?? null,
      takeoverPersonnelIds: d.handover.takeoverPersonnelIds,
      handoverMatters: d.handover.handoverMatters,
      handoverTime: d.handover.handoverTime,
      takeoverTime: d.handover.takeoverTime,
    },
  };
  saving.value = true;
  try {
    if (d.id) await api('PUT', `/activity/${d.id}`, body);
    else await api('POST', '/activity', body);
    setNotice(
      submitNow
        ? 'Aktifitas harian berhasil di-submit dan menunggu Approval dari Supervisor.'
        : 'Draft aktifitas harian berhasil disimpan.',
      'success',
    );
    await load();
    closeFormModal();
  } catch (e) {
    setNotice(e instanceof Error ? e.message : 'Gagal menyimpan laporan.', 'error');
  } finally {
    saving.value = false;
  }
};

const acknowledgeReport = async (report: ActivityReport, customName?: string): Promise<void> => {
  const chosenName = (customName ?? defaultSupervisorName.value).trim();
  if (!chosenName) {
    setNotice('Nama Supervisor wajib diisi untuk Acknowledge.', 'error');
    return;
  }
  try {
    await api('POST', `/activity/${report.id}/acknowledge`, { acknowledgedByName: chosenName });
    setNotice(`Laporan telah di-approve oleh ${chosenName} (Supervisor).`, 'success');
    await load();
  } catch (e) {
    setNotice(e instanceof Error ? e.message : 'Gagal meng-acknowledge laporan.', 'error');
  }
};

const act = async (id: string, action: 'submit' | 'reject' | 'close', message: string): Promise<void> => {
  if (!window.confirm(message)) return;
  try {
    await api('POST', `/activity/${id}/${action}`);
    setNotice('Status laporan diperbarui.', 'success');
    await load();
  } catch (e) {
    setNotice(e instanceof Error ? e.message : 'Aksi gagal.', 'error');
  }
};

const remove = async (id: string): Promise<void> => {
  if (!window.confirm('Hapus laporan ini secara permanen?')) return;
  try {
    await api('DELETE', `/activity/${id}`);
    setNotice('Laporan dihapus.', 'success');
    if (selectedId.value === id) mode.value = 'list';
    await load();
  } catch (e) {
    setNotice(e instanceof Error ? e.message : 'Gagal menghapus laporan.', 'error');
  }
};

const printOne = (report: ActivityReport): void => {
  void printReports([report]);
};
</script>

<template>
  <!-- ================= LIST MODE (MODERN TECHNICIAN WORKSPACE) ================= -->
  <template v-if="mode === 'list'">
    <!-- Banner Sambutan Modern -->
    <section class="tech-hero-banner">
      <div class="tech-hero-copy">
        <span class="tech-hero-pill">DAILY OPERATION &amp; SHIFT HANDOVER</span>
        <div class="tech-hero-title-row">
          <h2>Halo, {{ auth.state.user?.fullName || auth.state.user?.username }}</h2>
          <span v-if="myShift" class="topbar-shift-badge hero-shift-badge" :class="myShift.tone">
            Shift {{ myShift.label }} • {{ myShift.hours }} ({{ myShift.dateLabel }})
          </span>
        </div>
        <p>
          Catat aktifitas harian shift, fault/event, notifikasi, dan serah terima shift (Handover &amp; Takeover) dengan mudah.
        </p>
      </div>
      <div class="tech-hero-actions">
        <button type="button" class="secondary-button" @click="showPeriodDialog = true">
          Print Laporan Periode
        </button>
        <button type="button" class="primary-button tech-cta-button" @click="startCreate">
          + Buat Aktifitas Harian
        </button>
      </div>
    </section>

    <!-- Kartu Statistik Interaktif -->
    <section class="supervisor-kpi-grid">
      <button
        type="button"
        class="supervisor-kpi-card all"
        :class="{ 'is-selected': quickScope === 'all' }"
        @click="quickScope = 'all'"
      >
        <span class="kpi-label">Semua Laporan</span>
        <strong class="kpi-value">{{ kpi.total }}</strong>
        <small>Seluruh shift tercatat</small>
      </button>

      <button
        type="button"
        class="supervisor-kpi-card progress"
        :class="{ 'is-selected': quickScope === 'mine' }"
        @click="quickScope = 'mine'"
      >
        <span class="kpi-label">Aktifitas Shift Saya</span>
        <strong class="kpi-value">{{ kpi.mine }}</strong>
        <small>Melibatkan akun Anda</small>
      </button>

      <button
        type="button"
        class="supervisor-kpi-card pending"
        :class="{ 'is-selected': quickScope === 'Draft' }"
        @click="quickScope = 'Draft'"
      >
        <span class="kpi-label">Draft (Belum Submit)</span>
        <strong class="kpi-value">{{ kpi.draft }}</strong>
        <small>{{ kpi.submitted }} menunggu Supervisor</small>
      </button>

      <button
        type="button"
        class="supervisor-kpi-card approved"
        :class="{ 'is-selected': quickScope === 'Reviewed' }"
        @click="quickScope = 'Reviewed'"
      >
        <span class="kpi-label">Approved Supervisor</span>
        <strong class="kpi-value">{{ kpi.approved }}</strong>
        <small>Sudah di-acknowledge</small>
      </button>
    </section>

    <section class="view-panel" aria-live="polite">
      <div class="activity-filters modern-filter-bar">
        <label class="field-wrap compact-field">
          <span>Tanggal Laporan</span>
          <input v-model="filters.date" type="date" />
        </label>
        <label class="field-wrap compact-field">
          <span>Cari Person on Duty</span>
          <input v-model="filters.person" type="search" placeholder="Ketik nama technician..." />
        </label>
        <label class="field-wrap compact-field">
          <span>Shift</span>
          <select v-model="filters.shift">
            <option value="">Semua Shift</option>
            <option v-for="s in SHIFTS" :key="s" :value="s">{{ s }}</option>
          </select>
        </label>
        <label class="field-wrap compact-field">
          <span>Status</span>
          <select v-model="filters.status">
            <option value="">Semua Status</option>
            <option v-for="s in STATUSES" :key="s" :value="s">{{ s }}</option>
          </select>
        </label>
      </div>

      <div v-if="loading" class="empty-state">Memuat daftar laporan Daily Activity...</div>
      <div v-else-if="!visible.length" class="empty-state">
        Belum ada laporan Daily Activity pada filter ini. Klik <strong>"+ Buat Aktifitas Harian"</strong> untuk mulai mengisi.
      </div>
      <div v-else class="modern-report-list">
        <article v-for="report in visible" :key="report.id" class="modern-report-card">
          <div class="report-card-left">
            <div class="report-date-badge">
              <strong>{{ formatActivityDate(report.date) }}</strong>
              <span class="shift-badge" :class="report.shift.toLowerCase().replace(/\s+/g, '-')">
                Shift {{ report.shift }}
              </span>
            </div>

            <div class="report-people-info">
              <div class="people-line">
                <span class="people-label">Person on Duty:</span>
                <strong>{{ report.personOnDuty || '—' }}</strong>
              </div>
              <div class="people-line">
                <span class="people-label">Handover → Takeover:</span>
                <span>
                  {{ report.handover.handoverPerson || '—' }}
                  ({{ report.handover.handoverTime || '--:--' }})
                  →
                  <strong>{{ report.handover.takeoverPerson || '—' }}</strong>
                  ({{ report.handover.takeoverTime || '--:--' }})
                </span>
              </div>
            </div>
          </div>

          <div class="report-card-middle">
            <div class="report-metrics">
              <span class="work-pill">{{ validEvents(report).length }} Fault / Event</span>
              <span class="work-pill">{{ validNotifications(report).length }} Notifikasi</span>
              <span v-if="report.handover.sparePartsStatus" class="work-pill">
                Tools: {{ report.handover.sparePartsStatus }}
              </span>
            </div>

            <div class="report-stepper">
              <span class="step-dot is-done">1. Draft</span>
              <span class="step-line" :class="{ 'is-done': report.status !== 'Draft' }"></span>
              <span class="step-dot" :class="{ 'is-done': report.status !== 'Draft' }">2. Submitted</span>
              <span
                class="step-line"
                :class="{ 'is-done': report.status === 'Reviewed' || report.status === 'Closed' }"
              ></span>
              <span
                class="step-dot"
                :class="{ 'is-done': report.status === 'Reviewed' || report.status === 'Closed' }"
              >
                3. {{ report.handover.acknowledgedBy || 'Supervisor Approval' }}
              </span>
            </div>
          </div>

          <div class="report-card-right">
            <span class="activity-status-badge" :class="statusClass(report.status)">
              {{ report.status }}
            </span>
            <div class="activity-actions">
              <button type="button" class="secondary-button compact-button" @click="openReport(report.id)">
                Detail
              </button>
              <button
                v-if="canEdit(report)"
                type="button"
                class="secondary-button compact-button"
                @click="startEdit(report.id)"
              >
                Edit
              </button>
              <button
                v-if="canSubmit(report)"
                type="button"
                class="primary-button compact-button"
                @click="act(report.id, 'submit', 'Submit laporan ini ke Supervisor?')"
              >
                Submit →
              </button>
              <button type="button" class="secondary-button compact-button" @click="printOne(report)">
                Print PDF
              </button>
              <button
                v-if="auth.isAdmin.value"
                type="button"
                class="danger-button compact-button"
                @click="remove(report.id)"
              >
                Hapus
              </button>
            </div>
          </div>
        </article>
      </div>
    </section>
  </template>

  <!-- ================= VIEW DETAIL MODE ================= -->
  <section v-else-if="mode === 'view'" class="view-panel" aria-live="polite">
    <div v-if="!selected" class="empty-state">Report not found.</div>
    <template v-else>
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Daily Activity Shift Record</p>
          <h2>Detail Laporan — {{ formatActivityDate(selected.date) }} (Shift {{ selected.shift }})</h2>
        </div>
        <div class="inline-actions">
          <button type="button" class="secondary-button" @click="backToList">← Kembali ke Daftar</button>
          <button v-if="canEdit(selected)" type="button" class="secondary-button" @click="startEdit(selected.id)">
            Edit Aktifitas Harian
          </button>
          <button
            v-if="canSubmit(selected)"
            type="button"
            class="primary-button"
            @click="act(selected.id, 'submit', 'Submit laporan ini ke Supervisor? Setelah disubmit hanya admin yang dapat mengubahnya.')"
          >
            Submit ke Supervisor
          </button>
          <button
            v-if="canAcknowledge(selected)"
            type="button"
            class="primary-button"
            @click="acknowledgeReport(selected, supervisorNameInput)"
          >
            Approve / Acknowledge (Supervisor)
          </button>
          <button v-if="canClose(selected)" type="button" class="primary-button" @click="act(selected.id, 'close', 'Tutup laporan ini (Closed)?')">
            Close
          </button>
          <button v-if="canReject(selected)" type="button" class="secondary-button" @click="act(selected.id, 'reject', 'Kembalikan laporan ke Draft?')">
            Return to Draft
          </button>
          <button type="button" class="primary-button" @click="printOne(selected)">Print PDF</button>
        </div>
      </div>

      <div class="activity-summary-grid">
        <div class="activity-summary-box"><span>Date</span><strong>{{ formatActivityDate(selected.date) }}</strong></div>
        <div class="activity-summary-box"><span>Person on Duty</span><strong>{{ selected.personOnDuty || '—' }}</strong></div>
        <div class="activity-summary-box"><span>Shift</span><strong>{{ selected.shift }} ({{ shiftHoursLabel(selected.shift) }})</strong></div>
        <div class="activity-summary-box"><span>Status</span><strong>{{ selected.status }}</strong></div>
      </div>

      <div class="activity-card">
        <h3>Fault &amp; Event Registration</h3>
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
              <tr v-if="!validEvents(selected).length"><td colspan="7">No fault and event entry recorded.</td></tr>
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
              <tr v-if="!validNotifications(selected).length"><td colspan="3">No notification record entered.</td></tr>
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
              <template v-if="canAcknowledge(selected)">
                <div class="ack-action-row">
                  <input v-model="supervisorNameInput" type="text" placeholder="Nama Supervisor" />
                  <button type="button" class="primary-button compact-button" @click="acknowledgeReport(selected, supervisorNameInput)">
                    Acknowledge sebagai Supervisor
                  </button>
                </div>
              </template>
              <strong v-else class="ack-supervisor-badge">
                {{
                  selected.handover.acknowledgedBy ||
                  (selected.status === 'Draft'
                    ? 'Menunggu technician submit laporan'
                    : 'Menunggu Acknowledge Supervisor')
                }}
              </strong>
            </div>
          </div>
        </div>
      </div>
    </template>
  </section>

  <!-- ================= MODAL FORM: BUAT / EDIT AKTIFITAS HARIAN ================= -->
  <div v-if="showFormModal && draft" class="modal activity-form-modal" aria-hidden="false">
    <div class="modal-card activity-modal-card">
      <div class="modal-header activity-modal-header">
        <div>
          <p class="panel-kicker">Formulir Daily Operation &amp; Shift Handover</p>
          <h2>{{ draft.id ? 'Edit Aktifitas Harian' : 'Buat Aktifitas Harian' }}</h2>
        </div>
        <button type="button" class="close-button" aria-label="Tutup modal" @click="closeFormModal">×</button>
      </div>

      <form class="activity-modal-body modern-activity-form" novalidate @submit.prevent="save(true)">
        <!-- STEP 1: TANGGAL, SHIFT & PERSON ON DUTY -->
        <div class="modern-step-card">
          <div class="step-card-header">
            <div class="step-badge-wrap">
              <span class="step-number">1</span>
              <div>
                <h3>Informasi Shift &amp; Petugas Jaga (Person On Duty)</h3>
                <p class="field-hint">Pilih tanggal, shift kerja, dan 1 atau lebih technician yang bertugas pada shift ini.</p>
              </div>
            </div>
            <button type="button" class="secondary-button compact-button" @click="autoFillFromRoster">
              ⚡ Pilih Otomatis Sesuai Roster
            </button>
          </div>

          <div class="modern-shift-grid">
            <label class="field-wrap">
              <span>Tanggal Laporan (Report Date)</span>
              <input v-model="draft.date" type="date" required />
            </label>

            <div class="field-wrap">
              <span>Pilih Shift Kerja ({{ shiftHoursLabel(draft.shift) }})</span>
              <div class="shift-pill-selector">
                <button
                  v-for="s in SHIFTS"
                  :key="s"
                  type="button"
                  class="shift-select-btn"
                  :class="{ 'is-active': draft.shift === s }"
                  @click="
                    draft.shift = s;
                    onShiftChange();
                  "
                >
                  {{ s }}
                </button>
              </div>
            </div>
          </div>

          <div class="field-wrap full-width">
            <span>Person On Duty — Klik untuk memilih 1 atau lebih technician (Nama Anda terpilih otomatis)</span>
            <PersonnelMultiSelect
              :model-value="draft.dutyPersonnelIds"
              :options="rosterStore.personnel"
              :locked-id="lockedPersonnelId"
              placeholder="Pilih 1 atau lebih technician yang bertugas..."
              @update:model-value="onDutyIdsChange"
            />
          </div>
        </div>

        <!-- STEP 2: FAULT & EVENT REGISTRATION -->
        <div class="modern-step-card">
          <div class="step-card-header">
            <div class="step-badge-wrap">
              <span class="step-number">2</span>
              <div>
                <h3>Fault &amp; Event Registration</h3>
                <p class="field-hint">Catat setiap temuan gangguan, insiden, atau kegiatan pemeliharaan selama shift berlangsung.</p>
              </div>
            </div>
            <button type="button" class="primary-button compact-button" @click="draft.events.push(emptyEvent())">
              + Tambah Fault / Event
            </button>
          </div>

          <div class="modern-event-list">
            <div v-for="(event, index) in draft.events" :key="event.id" class="modern-event-item">
              <div class="event-item-top">
                <span class="event-index-badge">Event #{{ index + 1 }}</span>
                <button
                  v-if="draft.events.length > 1"
                  type="button"
                  class="danger-button compact-button"
                  @click="draft.events.splice(index, 1)"
                >
                  Hapus Baris
                </button>
              </div>

              <div class="event-item-grid">
                <label class="field-wrap compact-field">
                  <span>Waktu (Time)</span>
                  <input v-model="event.time" type="time" />
                </label>
                <label class="field-wrap compact-field">
                  <span>Pelapor / Kontak (Report Person / Team)</span>
                  <input v-model="event.contact" type="text" placeholder="Contoh: Monitoring Team / User Support" />
                </label>
                <label class="field-wrap compact-field">
                  <span>Lokasi (Event Location)</span>
                  <input v-model="event.location" type="text" placeholder="Contoh: Server Room / Network Hub" />
                </label>
                <label class="field-wrap compact-field">
                  <span>Ringkasan Masalah (Fault / Event Overview)</span>
                  <textarea v-model="event.overview" rows="2" placeholder="Uraian temuan atau kendala..."></textarea>
                </label>
                <label class="field-wrap compact-field">
                  <span>Tindakan Penanganan (Disposal Measures)</span>
                  <textarea v-model="event.measures" rows="2" placeholder="Langkah perbaikan yang dilakukan..."></textarea>
                </label>
                <label class="field-wrap compact-field">
                  <span>Hasil Akhir (Result)</span>
                  <textarea v-model="event.result" rows="2" placeholder="Contoh: Normal / Resolved / Monitored"></textarea>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- STEP 3: INFORMATION NOTIFICATION RECORD -->
        <div class="modern-step-card">
          <div class="step-card-header">
            <div class="step-badge-wrap">
              <span class="step-number">3</span>
              <div>
                <h3>Information Notification Record</h3>
                <p class="field-hint">Catat koordinasi, panggilan informasi, atau eskalasi yang diterima/dikirim pada shift ini.</p>
              </div>
            </div>
            <button type="button" class="primary-button compact-button" @click="draft.notifications.push(emptyNotification())">
              + Tambah Notifikasi
            </button>
          </div>

          <div class="modern-event-list">
            <div v-for="(n, index) in draft.notifications" :key="n.id" class="modern-notification-item">
              <span class="event-index-badge">#{{ index + 1 }}</span>
              <label class="field-wrap compact-field">
                <span>Pihak / Tim Terkait (Notifying Person / Team)</span>
                <input v-model="n.person" type="text" placeholder="Contoh: Helpdesk / Network Team" />
              </label>
              <label class="field-wrap compact-field notification-content-field">
                <span>Isi Informasi (Content)</span>
                <textarea v-model="n.content" rows="2" placeholder="Ringkasan informasi yang disampaikan..."></textarea>
              </label>
              <button
                v-if="draft.notifications.length > 1"
                type="button"
                class="danger-button compact-button"
                @click="draft.notifications.splice(index, 1)"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>

        <!-- STEP 4: HANDOVER & TAKEOVER RECORD -->
        <div class="modern-step-card">
          <div class="step-card-header">
            <div class="step-badge-wrap">
              <span class="step-number">4</span>
              <div>
                <h3>Handover &amp; Takeover Shift Record</h3>
                <p class="field-hint">Kelengkapan inventaris/tools, personel yang menyerahkan shift, dan personel penerima shift berikutnya (bisa > 1 orang).</p>
              </div>
            </div>
            <button type="button" class="secondary-button compact-button" @click="syncHandoverWithDuty">
              Samakan Handover dengan Person On Duty
            </button>
          </div>

          <div class="handover-form-layout">
            <div class="handover-panel">
              <div class="spareparts-toggle-box">
                <span>Apakah spare parts, tools, dan material bantu lengkap?</span>
                <div class="spareparts-buttons">
                  <button
                    type="button"
                    class="spareparts-btn"
                    :class="{ 'is-yes': draft.handover.sparePartsStatus === 'Yes' }"
                    @click="draft.handover.sparePartsStatus = 'Yes'"
                  >
                    ✓ Yes (Lengkap)
                  </button>
                  <button
                    type="button"
                    class="spareparts-btn"
                    :class="{ 'is-no': draft.handover.sparePartsStatus === 'No' }"
                    @click="draft.handover.sparePartsStatus = 'No'"
                  >
                    ✕ No (Tidak Lengkap)
                  </button>
                </div>
              </div>

              <label class="field-wrap full-width">
                <span>Catatan Serah Terima (Handover Matters)</span>
                <textarea
                  v-model="draft.handover.handoverMatters"
                  rows="4"
                  placeholder="Hal penting yang perlu ditindaklanjuti oleh shift berikutnya..."
                ></textarea>
              </label>

              <label class="field-wrap full-width">
                <span>Acknowledged by (Supervisor) :</span>
                <input
                  type="text"
                  :value="draft.handover.acknowledgedBy || 'Otomatis diisi oleh Supervisor (Zigmahara / Muhammad Syaeful) saat di-approve'"
                  disabled
                />
              </label>
            </div>

            <div class="handover-panel">
              <div class="handover-grid-form">
                <div class="field-wrap full-width">
                  <span>Handover Person (Yang Menyerahkan Shift — Bisa > 1 orang)</span>
                  <PersonnelMultiSelect
                    v-model="draft.handover.handoverPersonnelIds"
                    :options="rosterStore.personnel"
                    placeholder="Pilih 1 atau lebih personel yang menyerahkan..."
                  />
                </div>

                <label class="field-wrap">
                  <span>Jam Handover</span>
                  <input v-model="draft.handover.handoverTime" type="time" />
                </label>

                <label class="field-wrap">
                  <span>Jam Takeover</span>
                  <input v-model="draft.handover.takeoverTime" type="time" />
                </label>

                <div class="field-wrap full-width">
                  <span>Takeover Person (Penerima Shift Berikutnya — Bisa > 1 orang)</span>
                  <PersonnelMultiSelect
                    v-model="draft.handover.takeoverPersonnelIds"
                    :options="rosterStore.personnel"
                    placeholder="Pilih 1 atau lebih personel penerima shift..."
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>

      <div class="modal-actions activity-modal-footer">
        <button type="button" class="secondary-button" @click="closeFormModal">Batal</button>
        <div class="inline-actions">
          <button type="button" class="secondary-button" :disabled="saving" @click="save(false)">
            {{ saving ? 'Menyimpan...' : 'Simpan sebagai Draft' }}
          </button>
          <button type="button" class="primary-button" :disabled="saving" @click="save(true)">
            {{ saving ? 'Mengirim...' : 'Simpan & Submit ke Supervisor →' }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <PeriodPrintDialog v-if="showPeriodDialog" @close="showPeriodDialog = false" />
</template>
