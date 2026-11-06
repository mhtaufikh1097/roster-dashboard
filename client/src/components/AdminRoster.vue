<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';
import { setNotice } from '../notice';
import { rosterStore } from '../rosterStore';
import type { PersonnelRow, RosterData, RosterPeriod, Status } from '../types';
import { buildDateRange, formatActivityDate, getCurrentDateKey, toDateInfo } from '../utils/date';
import { parseRosterExcel } from '../utils/roster';

type Editor = { id: number | null; monthLabel: string; startDate: string; endDate: string; rows: PersonnelRow[]; activate: boolean };

const STATUS_OPTIONS: Status[] = ['', 'PAGI', 'SIANG', 'Office Hour'];

const periods = ref<RosterPeriod[]>([]);
const editor = ref<Editor | null>(null);
const dateKeys = ref<string[]>([]);
const newPersonName = ref('');
const saving = ref(false);
const pending = ref<RosterData | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const loadPeriods = async (): Promise<void> => {
  periods.value = await api<RosterPeriod[]>('GET', '/roster/periods');
};
onMounted(() => void loadPeriods().catch((e) => setNotice(e.message, 'error')));

const refreshAfterChange = async (): Promise<void> => {
  await loadPeriods();
  await rosterStore.load();
  await rosterStore.loadPersonnel();
};

const recomputeDates = (): void => {
  if (!editor.value) return;
  const { startDate, endDate } = editor.value;
  dateKeys.value = startDate && endDate && startDate <= endDate ? buildDateRange(startDate, endDate) : [];
};

// ---- Input manual ----
const startCreate = (): void => {
  const today = getCurrentDateKey();
  const monthStart = `${today.slice(0, 7)}-01`;
  const end = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10);
  editor.value = {
    id: null,
    monthLabel: new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date()),
    startDate: monthStart,
    endDate: end,
    activate: true,
    rows: rosterStore.personnel.map((p) => ({ id: p.id, name: p.name, department: p.department, position: p.position, schedule: {} })),
  };
  recomputeDates();
};

const startEdit = async (id: number): Promise<void> => {
  try {
    const data = await api<{ id: number; monthLabel: string; dates: string[]; personnel: PersonnelRow[] }>('GET', `/roster/periods/${id}`);
    editor.value = {
      id: data.id,
      monthLabel: data.monthLabel,
      startDate: data.dates[0],
      endDate: data.dates[data.dates.length - 1],
      activate: false,
      rows: data.personnel,
    };
    recomputeDates();
  } catch (e) {
    setNotice(e instanceof Error ? e.message : 'Gagal memuat periode.', 'error');
  }
};

const addPerson = (): void => {
  const name = newPersonName.value.trim();
  if (!editor.value || !name) return;
  if (editor.value.rows.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
    return setNotice('Personel sudah ada di tabel.', 'warning');
  }
  editor.value.rows.push({ name, department: '', position: '', schedule: {} });
  newPersonName.value = '';
};

const buildPayload = (e: Editor) => ({
  monthLabel: e.monthLabel,
  dates: dateKeys.value,
  activate: e.activate,
  personnel: e.rows.map((r) => ({
    name: r.name,
    department: r.department,
    position: r.position,
    schedule: Object.fromEntries(dateKeys.value.map((k) => [k, r.schedule[k] ?? ''])),
  })),
});

const saveEditor = async (): Promise<void> => {
  const e = editor.value;
  if (!e) return;
  if (!e.monthLabel.trim() || !dateKeys.value.length) {
    return setNotice('Label bulan dan rentang tanggal yang valid wajib diisi (maks. 62 hari).', 'error');
  }
  saving.value = true;
  try {
    if (e.id) await api('PUT', `/roster/periods/${e.id}`, buildPayload(e));
    else await api('POST', '/roster/periods', buildPayload(e));
    setNotice('Roster disimpan.', 'success');
    editor.value = null;
    await refreshAfterChange();
  } catch (err) {
    setNotice(err instanceof Error ? err.message : 'Gagal menyimpan roster.', 'error');
  } finally {
    saving.value = false;
  }
};

// ---- Upload Excel (opsional) ----
const onFile = async (event: Event): Promise<void> => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!['xlsx', 'xls'].includes(file.name.split('.').pop()?.toLowerCase() ?? '')) {
    return setNotice('Format file tidak didukung. Silakan upload file Excel (.xlsx atau .xls).', 'error');
  }
  try {
    pending.value = parseRosterExcel(await file.arrayBuffer(), file.name);
  } catch (e) {
    setNotice(e instanceof Error ? e.message : 'File Excel gagal diproses.', 'error');
  }
};

const confirmImport = async (): Promise<void> => {
  const roster = pending.value;
  if (!roster) return;
  try {
    await api('POST', '/roster/periods', {
      monthLabel: roster.monthLabel,
      filename: roster.filename,
      dates: roster.dates.map((d) => d.key),
      activate: true,
      personnel: roster.personnel,
    });
    pending.value = null;
    setNotice('Roster dari Excel berhasil disimpan dan diaktifkan.', 'success');
    await refreshAfterChange();
  } catch (e) {
    setNotice(e instanceof Error ? e.message : 'Gagal menyimpan roster.', 'error');
  }
};

// ---- Periode ----
const activate = async (id: number): Promise<void> => {
  try {
    await api('POST', `/roster/periods/${id}/activate`);
    setNotice('Periode diaktifkan.', 'success');
    await refreshAfterChange();
  } catch (e) {
    setNotice(e instanceof Error ? e.message : 'Gagal mengaktifkan.', 'error');
  }
};

const remove = async (p: RosterPeriod): Promise<void> => {
  if (!window.confirm(`Hapus roster "${p.monthLabel}"?`)) return;
  try {
    await api('DELETE', `/roster/periods/${p.id}`);
    setNotice('Periode dihapus.', 'success');
    await refreshAfterChange();
  } catch (e) {
    setNotice(e instanceof Error ? e.message : 'Gagal menghapus.', 'error');
  }
};
</script>

<template>
  <div class="admin-block">
    <!-- ===== Editor manual ===== -->
    <template v-if="editor">
      <div class="admin-inline-form">
        <label class="field-wrap compact-field"><span>Label bulan</span><input v-model="editor.monthLabel" type="text" /></label>
        <label class="field-wrap compact-field"><span>Tanggal mulai</span><input v-model="editor.startDate" type="date" @change="recomputeDates" /></label>
        <label class="field-wrap compact-field"><span>Tanggal akhir</span><input v-model="editor.endDate" type="date" @change="recomputeDates" /></label>
        <label v-if="!editor.id" class="check-row"><input v-model="editor.activate" type="checkbox" /> Jadikan roster aktif</label>
      </div>

      <div class="admin-inline-form">
        <label class="field-wrap compact-field">
          <span>Tambah personel baru ke tabel</span>
          <input v-model="newPersonName" type="text" placeholder="Nama personel" @keydown.enter.prevent="addPerson" />
        </label>
        <button type="button" class="secondary-button" @click="addPerson">Tambah</button>
      </div>

      <div class="table-scroll roster-editor">
        <table class="monthly-table">
          <thead>
            <tr>
              <th class="sticky-col person-column">Personel</th>
              <th v-for="key in dateKeys" :key="key"><span>{{ toDateInfo(key).dayName.slice(0, 3) }}</span><small>{{ key.slice(5) }}</small></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in editor.rows" :key="row.name">
              <td class="sticky-col person-cell"><strong>{{ row.name }}</strong></td>
              <td v-for="key in dateKeys" :key="key">
                <select v-model="row.schedule[key]" class="cell-select">
                  <option v-for="s in STATUS_OPTIONS" :key="s" :value="s">{{ s || 'Libur' }}</option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="inline-actions">
        <button type="button" class="secondary-button" @click="editor = null">Batal</button>
        <button type="button" class="primary-button" :disabled="saving" @click="saveEditor">{{ saving ? 'Menyimpan...' : 'Simpan Roster' }}</button>
      </div>
    </template>

    <!-- ===== Daftar periode ===== -->
    <template v-else>
      <div class="inline-actions">
        <button type="button" class="primary-button" @click="startCreate">Buat Roster Manual</button>
        <button type="button" class="secondary-button" @click="fileInput?.click()">Upload Excel (opsional)</button>
        <input ref="fileInput" type="file" accept=".xlsx,.xls" hidden @change="onFile" />
      </div>

      <div class="table-scroll">
        <table class="daily-activity-table">
          <thead><tr><th>Periode</th><th>Rentang</th><th>Sumber</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>
            <tr v-for="p in periods" :key="p.id">
              <td>{{ p.monthLabel }}</td>
              <td>{{ formatActivityDate(p.startDate) }} – {{ formatActivityDate(p.endDate) }}</td>
              <td>{{ p.filename || 'Input manual' }}</td>
              <td><span class="activity-status-badge" :class="p.isActive ? 'reviewed' : 'draft'">{{ p.isActive ? 'Aktif' : 'Arsip' }}</span></td>
              <td>
                <div class="activity-actions">
                  <button v-if="!p.isActive" type="button" class="secondary-button compact-button" @click="activate(p.id)">Aktifkan</button>
                  <button type="button" class="secondary-button compact-button" @click="startEdit(p.id)">Edit</button>
                  <button type="button" class="danger-button compact-button" @click="remove(p)">Hapus</button>
                </div>
              </td>
            </tr>
            <tr v-if="!periods.length"><td colspan="5">Belum ada roster. Buat manual atau upload Excel.</td></tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ===== Preview upload ===== -->
    <div v-if="pending" class="modal" aria-hidden="false">
      <div class="modal-card">
        <div class="modal-header">
          <h2>Upload Excel &amp; Preview</h2>
          <button type="button" class="close-button" aria-label="Tutup" @click="pending = null">×</button>
        </div>
        <div class="modal-content">
          <div class="preview-box">
            <div class="preview-row"><span>Nama file</span><strong>{{ pending.filename }}</strong></div>
            <div class="preview-row"><span>Periode</span><strong>{{ pending.periodLabel }}</strong></div>
            <div class="preview-row"><span>Personel</span><strong>{{ pending.personnel.length }}</strong></div>
            <div class="preview-row"><span>Jumlah hari</span><strong>{{ pending.dates.length }}</strong></div>
          </div>
          <div class="preview-section">
            <h3>Validasi</h3>
            <ul v-if="pending.warnings.length" class="warning-list"><li v-for="w in pending.warnings" :key="w">{{ w }}</li></ul>
            <p v-else class="success-note">Tidak ada peringatan status yang ditemukan.</p>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary-button" @click="pending = null">Batal</button>
          <button type="button" class="primary-button" @click="confirmImport">Simpan &amp; Aktifkan</button>
        </div>
      </div>
    </div>
  </div>
</template>

