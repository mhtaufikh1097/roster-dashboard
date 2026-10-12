import './style.css';
import * as XLSX from 'xlsx';

type Status = 'PAGI' | 'SIANG' | 'Office Hour' | '';
type ActiveTab = 'daily' | 'monthly';

type DateInfo = {
  key: string;
  label: string;
  dayName: string;
};

type PersonnelRow = {
  id: string;
  name: string;
  department: string;
  position: string;
  schedule: Record<string, Status>;
};

type RosterData = {
  filename: string;
  monthLabel: string;
  dates: DateInfo[];
  personnel: PersonnelRow[];
  warnings: string[];
  periodLabel: string;
};

type AppState = {
  activeRoster: RosterData | null;
  pendingRoster: RosterData | null;
  selectedDate: string;
  searchTerm: string;
  activeTab: ActiveTab;
  lastUpdated: Date | null;
  lastFileName: string;
};

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('App root element not found');
}

app.innerHTML = `
  <div class="dashboard-shell">
    <aside class="sidebar">
      <div class="brand-wrap">
        <div class="brand-mark">R</div>
        <div>
          <p class="brand-title">Roster</p>
          <small>IT Technician</small>
        </div>
      </div>

      <nav class="sidebar-nav" aria-label="Navigation utama">
        <button class="nav-button is-active" data-tab="daily" type="button">Dashboard Harian</button>
        <button class="nav-button" data-tab="monthly" type="button">Roster Bulanan</button>
      </nav>

      <div class="sidebar-card">
        <p class="card-kicker">Upload</p>
        <p class="card-copy">Pilih file Excel untuk memperbarui roster aktif.</p>
        <button id="upload-trigger" class="primary-button" type="button">Upload Excel</button>
        <input id="file-input" type="file" accept=".xlsx,.xls" hidden />
      </div>

      <div class="sidebar-card">
        <p class="card-kicker">Legenda</p>
        <div class="legend-list">
          <span class="legend-badge pagi">PAGI</span>
          <span class="legend-badge siang">SIANG</span>
          <span class="legend-badge office">Office Hour</span>
          <span class="legend-badge empty">Libur</span>
        </div>
      </div>
    </aside>

    <main class="main-panel">
      <header class="topbar">
        <div>
          <p class="eyebrow">Monitoring Personel</p>
          <h1>Roster Dashboard</h1>
        </div>
        <button id="print-button" class="secondary-button" type="button">Print</button>
      </header>

      <div id="alert-box" class="alert-box hidden" aria-live="polite"></div>
      <section id="summary-grid" class="summary-grid"></section>

      <section class="toolbar">
        <label class="field-wrap">
          <span>Pilih tanggal</span>
          <select id="date-select"></select>
        </label>
        <label class="field-wrap">
          <span>Cari personel</span>
          <input id="search-input" type="search" placeholder="Nama personel..." />
        </label>
      </section>

      <section id="daily-panel" class="view-panel"></section>
      <section id="monthly-panel" class="view-panel hidden"></section>

      <footer class="meta-bar">
        <div>
          <span class="meta-label">Last Updated</span>
          <strong id="last-updated-value">--</strong>
        </div>
        <div>
          <span class="meta-label">File</span>
          <strong id="active-file-value">--</strong>
        </div>
        <div>
          <span class="meta-label">Periode</span>
          <strong id="active-period-value">--</strong>
        </div>
      </footer>
    </main>
  </div>

  <div id="upload-modal" class="modal hidden" aria-hidden="true">
    <div class="modal-card">
      <div class="modal-header">
        <h2>Upload Excel & Preview</h2>
        <button type="button" class="close-button" data-close-modal="true" aria-label="Tutup modal">×</button>
      </div>
      <div id="modal-content" class="modal-content"></div>
      <div class="modal-actions">
        <button type="button" class="secondary-button" data-close-modal="true">Batal</button>
        <button type="button" id="apply-roster-button" class="primary-button">Konfirmasi & Tampil</button>
      </div>
    </div>
  </div>
`;

const refs = {
  summaryGrid: document.querySelector<HTMLDivElement>('#summary-grid') as HTMLDivElement | null,
  dateSelect: document.querySelector<HTMLSelectElement>('#date-select') as HTMLSelectElement | null,
  searchInput: document.querySelector<HTMLInputElement>('#search-input') as HTMLInputElement | null,
  dailyPanel: document.querySelector<HTMLDivElement>('#daily-panel') as HTMLDivElement | null,
  monthlyPanel: document.querySelector<HTMLDivElement>('#monthly-panel') as HTMLDivElement | null,
  alertBox: document.querySelector<HTMLDivElement>('#alert-box') as HTMLDivElement | null,
  lastUpdatedValue: document.querySelector<HTMLElement>('#last-updated-value') as HTMLElement | null,
  activeFileValue: document.querySelector<HTMLElement>('#active-file-value') as HTMLElement | null,
  activePeriodValue: document.querySelector<HTMLElement>('#active-period-value') as HTMLElement | null,
  uploadTrigger: document.querySelector<HTMLButtonElement>('#upload-trigger') as HTMLButtonElement | null,
  fileInput: document.querySelector<HTMLInputElement>('#file-input') as HTMLInputElement | null,
  printButton: document.querySelector<HTMLButtonElement>('#print-button') as HTMLButtonElement | null,
  modal: document.querySelector<HTMLDivElement>('#upload-modal') as HTMLDivElement | null,
  modalContent: document.querySelector<HTMLDivElement>('#modal-content') as HTMLDivElement | null,
  applyRosterButton: document.querySelector<HTMLButtonElement>('#apply-roster-button') as HTMLButtonElement | null,
};

const assertExists = <T>(value: T | null | undefined, name: string): T => {
  if (value == null) {
    throw new Error(`${name} is missing`);
  }
  return value;
};

const ui = {
  summaryGrid: assertExists(refs.summaryGrid, 'summaryGrid'),
  dateSelect: assertExists(refs.dateSelect, 'dateSelect'),
  searchInput: assertExists(refs.searchInput, 'searchInput'),
  dailyPanel: assertExists(refs.dailyPanel, 'dailyPanel'),
  monthlyPanel: assertExists(refs.monthlyPanel, 'monthlyPanel'),
  alertBox: assertExists(refs.alertBox, 'alertBox'),
  lastUpdatedValue: assertExists(refs.lastUpdatedValue, 'lastUpdatedValue'),
  activeFileValue: assertExists(refs.activeFileValue, 'activeFileValue'),
  activePeriodValue: assertExists(refs.activePeriodValue, 'activePeriodValue'),
  uploadTrigger: assertExists(refs.uploadTrigger, 'uploadTrigger'),
  fileInput: assertExists(refs.fileInput, 'fileInput'),
  printButton: assertExists(refs.printButton, 'printButton'),
  modal: assertExists(refs.modal, 'modal'),
  modalContent: assertExists(refs.modalContent, 'modalContent'),
  applyRosterButton: assertExists(refs.applyRosterButton, 'applyRosterButton'),
};

const state: AppState = {
  activeRoster: null,
  pendingRoster: null,
  selectedDate: '',
  searchTerm: '',
  activeTab: 'daily',
  lastUpdated: null,
  lastFileName: '',
};

const formatDateKey = (date: Date): string => {
  const normalized = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return normalized.toISOString().slice(0, 10);
};

const formatDateLabel = (date: Date): string =>
  new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);

const formatDayName = (date: Date): string =>
  new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date);

const normalizeStatusText = (status: Status): string => (status === '' ? 'Libur' : status);

const getStatusClass = (status: Status): string => {
  if (status === 'PAGI') return 'pagi';
  if (status === 'SIANG') return 'siang';
  if (status === 'Office Hour') return 'office';
  return 'empty';
};

const parseStatus = (rawValue: unknown): { status: Status; unknown: boolean; raw: string } => {
  const rawString = String(rawValue ?? '').trim();
  if (!rawString) return { status: '', unknown: false, raw: '' };

  const normalized = rawString.replace(/\s+/g, ' ');
  const upper = normalized.toUpperCase();

  if (upper === 'PAGI') {
    return { status: 'PAGI', unknown: false, raw: normalized };
  }

  if (upper === 'SIANG') {
    return { status: 'SIANG', unknown: false, raw: normalized };
  }

  if (upper === 'OFFICE HOUR') {
    return { status: 'Office Hour', unknown: false, raw: normalized };
  }

  return { status: '', unknown: true, raw: normalized };
};

const getSummaryCounts = (dateKey: string, roster: RosterData) => {
  const summary = { pagi: 0, siang: 0, office: 0, empty: 0 };

  roster.personnel.forEach((person) => {
    const status = person.schedule[dateKey] ?? '';
    if (status === 'PAGI') summary.pagi += 1;
    else if (status === 'SIANG') summary.siang += 1;
    else if (status === 'Office Hour') summary.office += 1;
    else summary.empty += 1;
  });

  return summary;
};

const getMonthlySummary = (roster: RosterData) => {
  const summary = { pagi: 0, siang: 0, office: 0, empty: 0, total: roster.personnel.length };

  roster.dates.forEach((date) => {
    const counts = getSummaryCounts(date.key, roster);
    summary.pagi += counts.pagi;
    summary.siang += counts.siang;
    summary.office += counts.office;
    summary.empty += counts.empty;
  });

  return summary;
};

const setAlert = (message: string, type: 'error' | 'warning' | 'success' | ''): void => {
  if (!message) {
    ui.alertBox.classList.add('hidden');
    ui.alertBox.textContent = '';
    return;
  }

  ui.alertBox.classList.remove('hidden');
  ui.alertBox.className = `alert-box ${type}`;
  ui.alertBox.textContent = message;
};

const parseRoster = (buffer: ArrayBuffer, filename: string): RosterData => {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  if (!sheet) {
    throw new Error('File Excel tidak memiliki sheet yang valid.');
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, blankrows: true }) as Array<Array<unknown>>;
  if (!rows.length) {
    throw new Error('Sheet Excel kosong atau tidak dapat dibaca.');
  }

  const monthLabel = String(rows[1]?.[0] ?? rows[3]?.[2] ?? '').trim() || 'Roster';
  const dateRow = rows[1] ?? [];
  const dateStartIndex = dateRow.findIndex((value) => {
    if (value == null || value === '') return false;
    if (value instanceof Date) return !Number.isNaN(value.getTime());
    if (typeof value === 'string') {
      const parsed = new Date(value);
      return !Number.isNaN(parsed.getTime());
    }
    return !Number.isNaN(new Date(String(value)).getTime());
  });

  if (dateStartIndex === -1) {
    throw new Error('Baris tanggal tidak ditemukan pada sheet Excel. Struktur file tidak sesuai.');
  }

  const dates: DateInfo[] = [];
  const warnings: string[] = [];

  for (let index = dateStartIndex; index < dateRow.length; index += 1) {
    const value = dateRow[index];
    if (value == null || value === '') continue;

    const date = value instanceof Date ? new Date(value) : new Date(String(value));
    if (Number.isNaN(date.getTime())) continue;

    dates.push({
      key: formatDateKey(date),
      label: formatDateLabel(date),
      dayName: formatDayName(date),
    });
  }

  if (!dates.length) {
    throw new Error('Tidak ada tanggal valid yang terdeteksi dari file roster.');
  }

  const personnel: PersonnelRow[] = [];

  for (let rowIndex = 3; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] as Array<unknown>;
    if (!row || row.length === 0) continue;

    const name = String(row[0] ?? '').trim();
    if (!name) continue;

    const department = String(row[1] ?? '').trim();
    const position = String(row[2] ?? '').trim();
    const schedule: Record<string, Status> = {};

    dates.forEach((dateInfo, dateIndex) => {
      const rawValue = row[dateStartIndex + dateIndex] ?? '';
      const parsed = parseStatus(rawValue);
      if (parsed.unknown) {
        warnings.push(`Status tidak dikenal "${parsed.raw}" untuk ${name} pada ${dateInfo.label}.`);
      }
      schedule[dateInfo.key] = parsed.status;
    });

    personnel.push({ id: `${name}-${rowIndex}`, name, department, position, schedule });
  }

  if (!personnel.length) {
    throw new Error('Tidak ada data personel yang tersedia. Struktur file tidak sesuai.');
  }

  return {
    filename,
    monthLabel,
    dates,
    personnel,
    warnings,
    periodLabel: `${dates[0].label} - ${dates[dates.length - 1].label}`,
  };
};

const renderSummaryCards = (): void => {
  if (!state.activeRoster) {
    ui.summaryGrid.innerHTML = '';
    return;
  }

  const summary = getSummaryCounts(state.selectedDate, state.activeRoster);
  const cards = [
    { title: 'PAGI', value: summary.pagi, tone: 'pagi' },
    { title: 'SIANG', value: summary.siang, tone: 'siang' },
    { title: 'Office Hour', value: summary.office, tone: 'office' },
    { title: 'Libur', value: summary.empty, tone: 'empty' },
  ];

  ui.summaryGrid.innerHTML = cards
    .map(
      (card) => `
        <div class="summary-card ${card.tone}">
          <span class="summary-title">${card.title}</span>
          <strong class="summary-value">${card.value}</strong>
        </div>
      `,
    )
    .join('');
};

const renderDateOptions = (): void => {
  if (!state.activeRoster) {
    ui.dateSelect.innerHTML = '';
    return;
  }

  if (!state.selectedDate || !state.activeRoster.dates.some((date) => date.key === state.selectedDate)) {
    state.selectedDate = state.activeRoster.dates[0]?.key ?? '';
  }

  ui.dateSelect.innerHTML = state.activeRoster.dates
    .map((date) => `<option value="${date.key}">${date.label} • ${date.dayName}</option>`)
    .join('');
  ui.dateSelect.value = state.selectedDate;
};

const renderDailyPanel = (): void => {
  if (!state.activeRoster) {
    ui.dailyPanel.innerHTML = '<div class="empty-state">Belum ada roster aktif.</div>';
    return;
  }

  const visiblePersonnel = state.activeRoster.personnel.filter((person) => {
    const query = state.searchTerm.trim().toLowerCase();
    if (!query) return true;
    return person.name.toLowerCase().includes(query);
  });

  if (!visiblePersonnel.length) {
    ui.dailyPanel.innerHTML = '<div class="empty-state">Tidak ada personel yang cocok dengan pencarian.</div>';
    return;
  }

  const selectedDate = state.activeRoster.dates.find((date) => date.key === state.selectedDate);
  const dateLabel = selectedDate?.label ?? state.selectedDate;

  ui.dailyPanel.innerHTML = `
    <div class="panel-header">
      <div>
        <p class="panel-kicker">Roster Harian</p>
        <h2>${dateLabel}</h2>
      </div>
    </div>
    <div class="person-card-grid">
      ${visiblePersonnel
        .map((person) => {
          const status = person.schedule[state.selectedDate] ?? '';
          return `
            <article class="person-card">
              <div class="person-header">
                <div>
                  <h3>${person.name}</h3>
                  <p>${person.department} • ${person.position}</p>
                </div>
                <span class="status-badge ${getStatusClass(status)}">${normalizeStatusText(status)}</span>
              </div>
              <div class="person-meta-row">
                <span>Hari</span>
                <strong>${dateLabel}</strong>
              </div>
              <div class="person-meta-row">
                <span>Status</span>
                <strong>${normalizeStatusText(status)}</strong>
              </div>
            </article>
          `;
        })
        .join('')}
    </div>
  `;
};

const renderMonthlyPanel = (): void => {
  if (!state.activeRoster) {
    ui.monthlyPanel.innerHTML = '<div class="empty-state">Belum ada roster aktif.</div>';
    return;
  }

  const visiblePersonnel = state.activeRoster.personnel.filter((person) => {
    const query = state.searchTerm.trim().toLowerCase();
    if (!query) return true;
    return person.name.toLowerCase().includes(query);
  });

  if (!visiblePersonnel.length) {
    ui.monthlyPanel.innerHTML = '<div class="empty-state">Tidak ada personel yang cocok dengan pencarian.</div>';
    return;
  }

  const monthHeader = state.activeRoster.dates.map((date) => `<th><span>${date.dayName}</span><small>${date.label}</small></th>`).join('');
  const monthlySummary = getMonthlySummary(state.activeRoster);

  ui.monthlyPanel.innerHTML = `
    <div class="report-header">
      <div>
        <p class="panel-kicker">Roster Bulanan</p>
        <h2>${state.activeRoster.monthLabel}</h2>
      </div>
      <div class="legend-inline">
        <span class="legend-badge pagi">PAGI</span>
        <span class="legend-badge siang">SIANG</span>
        <span class="legend-badge office">Office Hour</span>
        <span class="legend-badge empty">Libur</span>
      </div>
    </div>

    <div class="report-summary-grid">
      <div class="report-stat-box">
        <span>Periode</span>
        <strong>${state.activeRoster.periodLabel}</strong>
      </div>
      <div class="report-stat-box">
        <span>Total Personel</span>
        <strong>${monthlySummary.total}</strong>
      </div>
      <div class="report-stat-box">
        <span>PAGI</span>
        <strong>${monthlySummary.pagi}</strong>
      </div>
      <div class="report-stat-box">
        <span>SIANG</span>
        <strong>${monthlySummary.siang}</strong>
      </div>
      <div class="report-stat-box">
        <span>Office Hour</span>
        <strong>${monthlySummary.office}</strong>
      </div>
      <div class="report-stat-box">
        <span>Libur</span>
        <strong>${monthlySummary.empty}</strong>
      </div>
    </div>

    <div class="table-scroll">
      <table class="monthly-table">
        <thead>
          <tr>
            <th class="sticky-col person-column">Personel</th>
            <th class="department-column">Departemen</th>
            <th class="role-column">Jabatan</th>
            ${monthHeader}
          </tr>
        </thead>
        <tbody>
          ${visiblePersonnel
            .map((person) => {
              const cells = state.activeRoster!.dates
                .map((date) => {
                  const status = person.schedule[date.key] ?? '';
                  const content = status ? `<span class="table-status ${getStatusClass(status)}">${status}</span>` : '<span class="empty-pill">Libur</span>';
                  return `<td>${content}</td>`;
                })
                .join('');

              return `
                <tr>
                  <td class="sticky-col person-cell"><strong>${person.name}</strong></td>
                  <td>${person.department}</td>
                  <td>${person.position}</td>
                  ${cells}
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `;
};

const renderMetadata = (): void => {
  ui.lastUpdatedValue.textContent = state.lastUpdated ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(state.lastUpdated) : '--';
  ui.activeFileValue.textContent = state.lastFileName || state.activeRoster?.filename || '--';
  ui.activePeriodValue.textContent = state.activeRoster?.periodLabel || '--';
};

const renderApp = (): void => {
  if (!state.activeRoster) {
    ui.summaryGrid.innerHTML = '';
    ui.dailyPanel.innerHTML = '<div class="empty-state">Belum ada data roster. Silakan upload file Excel manual.</div>';
    ui.monthlyPanel.innerHTML = '<div class="empty-state">Belum ada data roster. Silakan upload file Excel manual.</div>';
    ui.lastUpdatedValue.textContent = '--';
    ui.activeFileValue.textContent = '--';
    ui.activePeriodValue.textContent = '--';
    return;
  }

  renderDateOptions();
  renderSummaryCards();
  renderDailyPanel();
  renderMonthlyPanel();
  renderMetadata();

  document.querySelectorAll<HTMLButtonElement>('.nav-button').forEach((button) => {
    const isActive = button.dataset.tab === state.activeTab;
    button.classList.toggle('is-active', isActive);
  });

  ui.dailyPanel.classList.toggle('hidden', state.activeTab !== 'daily');
  ui.monthlyPanel.classList.toggle('hidden', state.activeTab !== 'monthly');
};

const openUploadModal = (roster: RosterData): void => {
  state.pendingRoster = roster;

  const warningsHtml = roster.warnings.length
    ? `<ul class="warning-list">${roster.warnings.map((warning) => `<li>${warning}</li>`).join('')}</ul>`
    : '<p class="success-note">Tidak ada peringatan status yang ditemukan.</p>';

  ui.modalContent.innerHTML = `
    <div class="preview-box">
      <div class="preview-row"><span>Nama file</span><strong>${roster.filename}</strong></div>
      <div class="preview-row"><span>Periode</span><strong>${roster.periodLabel}</strong></div>
      <div class="preview-row"><span>Personel</span><strong>${roster.personnel.length}</strong></div>
      <div class="preview-row"><span>Jumlah hari</span><strong>${roster.dates.length}</strong></div>
    </div>

    <div class="preview-section">
      <h3>Preview data</h3>
      <div class="preview-table">
        <div class="preview-header">
          <span>Nama</span>
          <span>Departemen</span>
          <span>Jabatan</span>
        </div>
        ${roster.personnel
          .slice(0, 5)
          .map(
            (person) => `
              <div class="preview-row-list">
                <span>${person.name}</span>
                <span>${person.department}</span>
                <span>${person.position}</span>
              </div>
            `,
          )
          .join('')}
      </div>
    </div>

    <div class="preview-section">
      <h3>Validasi</h3>
      ${warningsHtml}
    </div>
  `;

  ui.modal.classList.remove('hidden');
  ui.modal.setAttribute('aria-hidden', 'false');
};

const closeUploadModal = (): void => {
  ui.modal.classList.add('hidden');
  ui.modal.setAttribute('aria-hidden', 'true');
  state.pendingRoster = null;
};

const applyActiveRoster = (roster: RosterData): void => {
  state.activeRoster = roster;
  state.selectedDate = roster.dates[0]?.key ?? '';
  state.lastUpdated = new Date();
  state.lastFileName = roster.filename;
  state.pendingRoster = null;
  setAlert('Roster berhasil diperbarui.', 'success');
  renderApp();
};

const handleFileUpload = async (file: File): Promise<void> => {
  state.pendingRoster = null;
  closeUploadModal();
  setAlert('', '');

  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !['xlsx', 'xls'].includes(extension)) {
    setAlert('Format file tidak didukung. Silakan upload file Excel (.xlsx atau .xls).', 'error');
    return;
  }

  try {
    const buffer = await file.arrayBuffer();
    const parsed = parseRoster(buffer, file.name);
    openUploadModal(parsed);
    setAlert('', '');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'File Excel gagal diproses.';
    setAlert(message, 'error');
  }
};

ui.uploadTrigger.addEventListener('click', () => ui.fileInput.click());
ui.fileInput.addEventListener('change', async (event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  await handleFileUpload(file);
  input.value = '';
});
ui.printButton.addEventListener('click', () => window.print());
ui.dateSelect.addEventListener('change', (event) => {
  state.selectedDate = (event.target as HTMLSelectElement).value;
  renderSummaryCards();
  renderDailyPanel();
});
ui.searchInput.addEventListener('input', (event) => {
  state.searchTerm = (event.target as HTMLInputElement).value;
  renderApp();
});
document.querySelectorAll<HTMLButtonElement>('.nav-button').forEach((button) => {
  button.addEventListener('click', () => {
    state.activeTab = button.dataset.tab === 'monthly' ? 'monthly' : 'daily';
    renderApp();
  });
});
ui.applyRosterButton.addEventListener('click', () => {
  if (!state.pendingRoster) return;
  applyActiveRoster(state.pendingRoster);
  closeUploadModal();
});
document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  if (target.matches('[data-close-modal="true"]')) {
    closeUploadModal();
  }
});
window.addEventListener('load', () => {
  renderApp();
});
