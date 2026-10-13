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
  defaultDateKey: string;
  searchTerm: string;
  activeTab: ActiveTab;
  lastUpdated: Date | null;
  lastFileName: string;
};

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('App root element not found');
}

const AUTH_STORAGE_KEY = 'roster-dashboard.auth.v1';
const DEMO_USERNAME = 'admin';
const DEMO_PASSWORD = 'Admin123!';

const getCurrentRoute = (): 'login' | 'dashboard' => {
  const hashValue = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
  return hashValue === 'dashboard' ? 'dashboard' : 'login';
};

const isAuthenticated = (): boolean => sessionStorage.getItem(AUTH_STORAGE_KEY) === 'true';

const syncRoute = (route: 'login' | 'dashboard'): void => {
  const targetHash = route === 'dashboard' ? '#dashboard' : '#login';
  if (window.location.hash !== targetHash) {
    window.location.hash = targetHash;
  }
};

app.innerHTML = `
  <div id="login-screen" class="login-screen">
    <div class="login-shell">
      <section class="login-panel">
        <div class="login-brand">
          <div class="brand-mark">R</div>
          <div>
            <p class="brand-title">Roster</p>
            <small>IT Technician</small>
          </div>
        </div>

        <div class="login-copy">
          <p class="eyebrow">Access portal</p>
          <h1>Masuk ke dashboard</h1>
          <p>Kelola roster harian dan bulanan dengan kontrol akses yang sederhana.</p>
        </div>

        <form id="login-form" class="login-form" novalidate>
          <label class="login-field" for="username-input">
            <span>Username</span>
            <input id="username-input" name="username" type="text" autocomplete="username" placeholder="admin" required />
          </label>

          <label class="login-field" for="password-input">
            <span>Password</span>
            <div class="password-wrap">
              <input id="password-input" name="password" type="password" autocomplete="current-password" placeholder="Masukkan password" required />
              <button id="toggle-password" class="password-toggle" type="button" aria-label="Tampilkan password">Show</button>
            </div>
          </label>

          <button id="login-submit" class="login-button" type="submit">
            <span class="login-button-label">Login</span>
          </button>

          <p id="login-error" class="login-error" role="alert" aria-live="polite"></p>
        </form>
      </section>

      <aside class="login-aside">
        <div class="login-aside-card">
          <p class="eyebrow">Demo access</p>
          <h2>Credential sementara</h2>
          <ul class="credential-list">
            <li><span>Username</span><strong>admin</strong></li>
            <li><span>Password</span><strong>Admin123!</strong></li>
          </ul>
          <small>Ini hanya prototipe lokal dan akan diganti saat autentikasi backend atau database sudah tersedia.</small>
        </div>
      </aside>
    </div>
  </div>

  <div id="dashboard-shell" class="dashboard-shell hidden">
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
        <button id="reset-roster-button" class="reset-button" type="button" disabled>Reset data</button>
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

     <p class="eyebrow">Monitoring Personel HPIO</p>
<h1>Roster Dashboard IT Officer</h1>

        </div>
        <div class="topbar-actions">
          <button id="print-button" class="secondary-button" type="button">Print</button>
          <button id="logout-button" class="logout-button" type="button">Logout</button>
        </div>
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
  loginScreen: document.querySelector<HTMLDivElement>('#login-screen') as HTMLDivElement | null,
  loginForm: document.querySelector<HTMLFormElement>('#login-form') as HTMLFormElement | null,
  usernameInput: document.querySelector<HTMLInputElement>('#username-input') as HTMLInputElement | null,
  passwordInput: document.querySelector<HTMLInputElement>('#password-input') as HTMLInputElement | null,
  loginSubmit: document.querySelector<HTMLButtonElement>('#login-submit') as HTMLButtonElement | null,
  togglePassword: document.querySelector<HTMLButtonElement>('#toggle-password') as HTMLButtonElement | null,
  loginError: document.querySelector<HTMLParagraphElement>('#login-error') as HTMLParagraphElement | null,
  dashboardShell: document.querySelector<HTMLDivElement>('#dashboard-shell') as HTMLDivElement | null,
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
  resetRosterButton: document.querySelector<HTMLButtonElement>('#reset-roster-button') as HTMLButtonElement | null,
  fileInput: document.querySelector<HTMLInputElement>('#file-input') as HTMLInputElement | null,
  printButton: document.querySelector<HTMLButtonElement>('#print-button') as HTMLButtonElement | null,
  logoutButton: document.querySelector<HTMLButtonElement>('#logout-button') as HTMLButtonElement | null,
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
  loginScreen: assertExists(refs.loginScreen, 'loginScreen'),
  loginForm: assertExists(refs.loginForm, 'loginForm'),
  usernameInput: assertExists(refs.usernameInput, 'usernameInput'),
  passwordInput: assertExists(refs.passwordInput, 'passwordInput'),
  loginSubmit: assertExists(refs.loginSubmit, 'loginSubmit'),
  togglePassword: assertExists(refs.togglePassword, 'togglePassword'),
  loginError: assertExists(refs.loginError, 'loginError'),
  dashboardShell: assertExists(refs.dashboardShell, 'dashboardShell'),
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
  resetRosterButton: assertExists(refs.resetRosterButton, 'resetRosterButton'),
  fileInput: assertExists(refs.fileInput, 'fileInput'),
  printButton: assertExists(refs.printButton, 'printButton'),
  logoutButton: assertExists(refs.logoutButton, 'logoutButton'),
  modal: assertExists(refs.modal, 'modal'),
  modalContent: assertExists(refs.modalContent, 'modalContent'),
  applyRosterButton: assertExists(refs.applyRosterButton, 'applyRosterButton'),
};

const state: AppState = {
  activeRoster: null,
  pendingRoster: null,
  selectedDate: '',
  defaultDateKey: '',
  searchTerm: '',
  activeTab: 'daily',
  lastUpdated: null,
  lastFileName: '',
};

const ROSTER_STORAGE_KEY = 'roster-dashboard.active-roster.v1';
const ASIA_JAKARTA_TIMEZONE = 'Asia/Jakarta';

type PersistedRoster = {
  roster: RosterData;
  lastUpdated: string;
};

const getDatePartsInTimeZone = (date: Date, timeZone: string): { day: number; month: number; year: number } => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const map = new Map<string, string>();
  for (const part of parts) {
    if (part.type !== 'literal') {
      map.set(part.type, part.value);
    }
  }

  return {
    year: Number(map.get('year') ?? 0),
    month: Number(map.get('month') ?? 0),
    day: Number(map.get('day') ?? 0),
  };
};

const formatDateKey = (date: Date, timeZone = ASIA_JAKARTA_TIMEZONE): string => {
  const { year, month, day } = getDatePartsInTimeZone(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const createDateFromValue = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const rawValue = String(value ?? '').trim();
  if (!rawValue) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    return new Date(`${rawValue}T00:00:00+07:00`);
  }

  const date = new Date(rawValue);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateLabel = (date: Date): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: ASIA_JAKARTA_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);

const formatDayName = (date: Date): string =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: ASIA_JAKARTA_TIMEZONE,
    weekday: 'long',
  }).format(date);

const getCurrentDateKeyInTimeZone = (timeZone = ASIA_JAKARTA_TIMEZONE): string => formatDateKey(new Date(), timeZone);

const getDefaultRosterDateKey = (roster: RosterData): string => {
  const todayKey = getCurrentDateKeyInTimeZone();
  if (roster.dates.some((date) => date.key === todayKey)) {
    return todayKey;
  }

  return roster.dates[0]?.key ?? '';
};

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

    const date = createDateFromValue(value);
    if (!date) continue;

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

  if (!state.activeRoster.dates.some((date) => date.key === state.selectedDate)) {
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

  if (!state.defaultDateKey || !state.activeRoster.dates.some((date) => date.key === state.defaultDateKey)) {
    state.defaultDateKey = getDefaultRosterDateKey(state.activeRoster);
  }

  if (!state.selectedDate || !state.activeRoster.dates.some((date) => date.key === state.selectedDate)) {
    state.selectedDate = state.defaultDateKey || state.activeRoster.dates[0]?.key || '';
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

  const selectedDate = state.activeRoster.dates.find((date) => date.key === state.selectedDate);
  if (!selectedDate) {
    ui.dailyPanel.innerHTML = '<div class="empty-state">Data roster untuk tanggal ini belum tersedia.</div>';
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

  const dateLabel = selectedDate.label;

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

const updateAuthView = (): void => {
  const authenticated = isAuthenticated();
  const route = getCurrentRoute();

  if (!authenticated && route === 'dashboard') {
    syncRoute('login');
  }

  if (authenticated && route === 'login') {
    syncRoute('dashboard');
  }

  ui.loginScreen.classList.toggle('hidden', authenticated);
  ui.dashboardShell.classList.toggle('hidden', !authenticated);
};

const handleLoginSubmit = (event: SubmitEvent): void => {
  event.preventDefault();

  const username = ui.usernameInput.value.trim();
  const password = ui.passwordInput.value;

  const submitButton = ui.loginSubmit;
  const submitLabel = submitButton.querySelector<HTMLSpanElement>('.login-button-label');
  const loginError = ui.loginError;

  if (!submitLabel) {
    return;
  }

  if (!username || !password) {
    loginError.textContent = 'Username dan password wajib diisi.';
    loginError.classList.add('visible');
    return;
  }

  if (username !== DEMO_USERNAME || password !== DEMO_PASSWORD) {
    loginError.textContent = 'Username atau password salah. Silakan coba lagi.';
    loginError.classList.add('visible');
    return;
  }

  submitButton.disabled = true;
  submitLabel.textContent = 'Memproses...';
  loginError.textContent = '';
  loginError.classList.remove('visible');

  window.setTimeout(() => {
    sessionStorage.setItem(AUTH_STORAGE_KEY, 'true');
    syncRoute('dashboard');
    updateAuthView();
    submitButton.disabled = false;
    submitLabel.textContent = 'Login';
    ui.usernameInput.value = '';
    ui.passwordInput.value = '';
    ui.passwordInput.type = 'password';
    ui.togglePassword.textContent = 'Show';
  }, 350);
};

const handleLogout = (): void => {
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
  setAlert('Anda telah keluar dari sesi.', 'success');
  syncRoute('login');
  updateAuthView();
};

const syncDateWithCurrentDay = (): void => {
  if (!state.activeRoster || !state.defaultDateKey) {
    return;
  }

  const todayKey = getCurrentDateKeyInTimeZone();
  const rosterDates = state.activeRoster.dates.map((date) => date.key);

  if (state.selectedDate === state.defaultDateKey && rosterDates.includes(todayKey) && state.defaultDateKey !== todayKey) {
    state.defaultDateKey = todayKey;
    state.selectedDate = todayKey;
  }
};

const renderApp = (): void => {
  ui.resetRosterButton.disabled = !state.activeRoster;

  if (!state.activeRoster) {
    ui.summaryGrid.innerHTML = '';
    ui.dailyPanel.innerHTML = '<div class="empty-state">Belum ada data roster. Silakan upload file Excel manual.</div>';
    ui.monthlyPanel.innerHTML = '<div class="empty-state">Belum ada data roster. Silakan upload file Excel manual.</div>';
    ui.lastUpdatedValue.textContent = '--';
    ui.activeFileValue.textContent = '--';
    ui.activePeriodValue.textContent = '--';
    return;
  }

  if (!state.defaultDateKey || !state.activeRoster.dates.some((date) => date.key === state.defaultDateKey)) {
    state.defaultDateKey = getDefaultRosterDateKey(state.activeRoster);
  }

  if (!state.selectedDate || !state.activeRoster.dates.some((date) => date.key === state.selectedDate)) {
    state.selectedDate = state.defaultDateKey;
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
  state.defaultDateKey = getDefaultRosterDateKey(roster);
  state.selectedDate = state.defaultDateKey;
  state.lastUpdated = new Date();
  state.lastFileName = roster.filename;
  state.pendingRoster = null;

  try {
    const persisted: PersistedRoster = {
      roster,
      lastUpdated: state.lastUpdated.toISOString(),
    };
    localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify(persisted));
    setAlert('Roster berhasil diperbarui dan akan tetap tersedia setelah halaman di-refresh.', 'success');
  } catch {
    setAlert('Roster berhasil ditampilkan, tetapi browser tidak dapat menyimpannya untuk sesi berikutnya.', 'warning');
  }

  renderApp();
};

const restoreSavedRoster = (): void => {
  const savedValue = localStorage.getItem(ROSTER_STORAGE_KEY);
  if (!savedValue) return;

  try {
    const saved = JSON.parse(savedValue) as PersistedRoster;
    const roster = saved.roster;
    const updatedAt = new Date(saved.lastUpdated);

    if (
      !roster ||
      typeof roster.filename !== 'string' ||
      !Array.isArray(roster.dates) ||
      !Array.isArray(roster.personnel) ||
      roster.dates.length === 0 ||
      roster.personnel.length === 0 ||
      Number.isNaN(updatedAt.getTime())
    ) {
      throw new Error('Data roster tersimpan tidak valid.');
    }

    state.activeRoster = roster;
    state.defaultDateKey = getDefaultRosterDateKey(roster);
    state.selectedDate = state.defaultDateKey;
    state.lastUpdated = updatedAt;
    state.lastFileName = roster.filename;
  } catch {
    localStorage.removeItem(ROSTER_STORAGE_KEY);
    setAlert('Data roster tersimpan tidak dapat dibaca. Silakan upload file Excel kembali.', 'warning');
  }
};

const resetRoster = (): void => {
  if (!state.activeRoster) return;
  if (!window.confirm('Hapus roster aktif dan data tersimpan dari browser ini?')) return;

  localStorage.removeItem(ROSTER_STORAGE_KEY);
  state.activeRoster = null;
  state.pendingRoster = null;
  state.selectedDate = '';
  state.defaultDateKey = '';
  state.lastUpdated = null;
  state.lastFileName = '';
  setAlert('Data roster sudah direset.', 'success');
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
ui.resetRosterButton.addEventListener('click', resetRoster);
ui.fileInput.addEventListener('change', async (event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  await handleFileUpload(file);
  input.value = '';
});
ui.printButton.addEventListener('click', () => window.print());
ui.logoutButton.addEventListener('click', handleLogout);
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
ui.togglePassword.addEventListener('click', () => {
  const shouldShow = ui.passwordInput.type === 'password';
  ui.passwordInput.type = shouldShow ? 'text' : 'password';
  ui.togglePassword.textContent = shouldShow ? 'Hide' : 'Show';
  ui.togglePassword.setAttribute('aria-label', shouldShow ? 'Sembunyikan password' : 'Tampilkan password');
});
ui.loginForm.addEventListener('submit', handleLoginSubmit);
ui.usernameInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    ui.loginForm.requestSubmit();
  }
});
ui.passwordInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    ui.loginForm.requestSubmit();
  }
});
document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  if (target.matches('[data-close-modal="true"]')) {
    closeUploadModal();
  }
});
window.addEventListener('hashchange', () => {
  updateAuthView();
});
let dailyDateWatcher: number | undefined;

const startDailyDateWatcher = (): void => {
  if (dailyDateWatcher) {
    window.clearInterval(dailyDateWatcher);
  }

  dailyDateWatcher = window.setInterval(() => {
    syncDateWithCurrentDay();
    renderApp();
  }, 60000);
};

window.addEventListener('load', () => {
  restoreSavedRoster();
  updateAuthView();
  renderApp();
  startDailyDateWatcher();
});

window.addEventListener('beforeunload', () => {
  if (dailyDateWatcher) {
    window.clearInterval(dailyDateWatcher);
  }
});
