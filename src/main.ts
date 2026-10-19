import './style.css';
import * as XLSX from 'xlsx';

type Status = 'PAGI' | 'SIANG' | 'Office Hour' | '';
type ActiveTab = 'daily' | 'monthly' | 'activity';
type ActivityViewMode = 'list' | 'form' | 'view';
type DailyActivityShift = 'Pagi' | 'Siang' | 'Office Hour' | 'Libur';
type DailyActivityStatus = 'Draft' | 'Submitted' | 'Reviewed' | 'Closed';

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

type DailyActivityEvent = {
  id: string;
  time: string;
  contact: string;
  location: string;
  overview: string;
  measures: string;
  result: string;
};

type DailyActivityNotification = {
  id: string;
  person: string;
  content: string;
};

type DailyActivityHandover = {
  sparePartsStatus: 'Yes' | 'No' | '';
  handoverPerson: string;
  takeoverPerson: string;
  handoverMatters: string;
  handoverTime: string;
  takeoverTime: string;
  acknowledgedBy: string;
};

type DailyActivityReport = {
  id: string;
  date: string;
  personOnDuty: string;
  shift: DailyActivityShift;
  status: DailyActivityStatus;
  events: DailyActivityEvent[];
  notifications: DailyActivityNotification[];
  handover: DailyActivityHandover;
};

type ActivityFilters = {
  date: string;
  person: string;
  shift: string;
  status: string;
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
  activityReports: DailyActivityReport[];
  activityMode: ActivityViewMode;
  activityDraft: DailyActivityReport | null;
  activitySelectedId: string | null;
  activityFilters: ActivityFilters;
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
        <button class="nav-button" data-tab="activity" type="button">Daily Activity</button>
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
<h1>Dashboard Roster IT HPIO</h1>

        </div>
        <div class="topbar-actions">
          <button id="print-button" class="secondary-button" type="button">Print</button>
          <button id="logout-button" class="logout-button" type="button">Logout</button>
        </div>
      </header>

      <div id="alert-box" class="alert-box hidden" aria-live="polite"></div>
      <section id="summary-grid" class="summary-grid"></section>

      <section id="work-hours-panel" class="work-hours-panel" aria-label="Informasi jam kerja">
        <div class="panel-header compact-header">
          <div>
            <p class="panel-kicker">Informasi</p>
            <h2>INFORMASI JAM KERJA</h2>
          </div>
        </div>
        <div class="work-hours-grid">
          <div class="work-hours-item pagi">
            <span class="work-hours-label">PAGI</span>
            <strong>06:00–15:00</strong>
          </div>
          <div class="work-hours-item siang">
            <span class="work-hours-label">SIANG</span>
            <strong>13:00–22:00</strong>
          </div>
          <div class="work-hours-item office">
            <span class="work-hours-label">OFFICE HOUR</span>
            <strong>08:00–17:00</strong>
          </div>
          <div class="work-hours-item empty">
            <span class="work-hours-label">LIBUR</span>
            <strong>OFF Duty</strong>
          </div>
        </div>
      </section>

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
      <section id="activity-panel" class="view-panel hidden" aria-live="polite"></section>

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

  <div id="activity-print-root" class="activity-print-root hidden"></div>
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
  activityPanel: document.querySelector<HTMLDivElement>('#activity-panel') as HTMLDivElement | null,
  activityPrintRoot: document.querySelector<HTMLDivElement>('#activity-print-root') as HTMLDivElement | null,
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
  activityPanel: assertExists(refs.activityPanel, 'activityPanel'),
  activityPrintRoot: assertExists(refs.activityPrintRoot, 'activityPrintRoot'),
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
  activityReports: [],
  activityMode: 'list',
  activityDraft: null,
  activitySelectedId: null,
  activityFilters: {
    date: '',
    person: '',
    shift: '',
    status: '',
  },
};

const ROSTER_STORAGE_KEY = 'roster-dashboard.active-roster.v1';
const ASIA_JAKARTA_TIMEZONE = 'Asia/Jakarta';
const DAILY_ACTIVITY_SHIFT_OPTIONS: readonly DailyActivityShift[] = ['Pagi', 'Siang', 'Office Hour', 'Libur'];
const DAILY_ACTIVITY_STATUS_OPTIONS: readonly DailyActivityStatus[] = ['Draft', 'Submitted', 'Reviewed', 'Closed'];

const createActivityId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `activity-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createEmptyActivityEvent = (): DailyActivityEvent => ({
  id: createActivityId(),
  time: '',
  contact: '',
  location: '',
  overview: '',
  measures: '',
  result: '',
});

const createEmptyActivityNotification = (): DailyActivityNotification => ({
  id: createActivityId(),
  person: '',
  content: '',
});

const createEmptyActivityReport = (): DailyActivityReport => ({
  id: createActivityId(),
  date: getCurrentDateKeyInTimeZone(),
  personOnDuty: '',
  shift: 'Pagi',
  status: 'Draft',
  events: [createEmptyActivityEvent()],
  notifications: [createEmptyActivityNotification()],
  handover: {
    sparePartsStatus: '',
    handoverPerson: '',
    takeoverPerson: '',
    handoverMatters: '',
    handoverTime: '',
    takeoverTime: '',
    acknowledgedBy: '',
  },
});

const cloneActivityReport = (report: DailyActivityReport): DailyActivityReport => ({
  ...report,
  events: report.events.map((event) => ({ ...event })),
  notifications: report.notifications.map((notification) => ({ ...notification })),
  handover: { ...report.handover },
});

const getActivityStatusClass = (status: DailyActivityStatus): string => {
  if (status === 'Submitted') return 'submitted';
  if (status === 'Reviewed') return 'reviewed';
  if (status === 'Closed') return 'closed';
  return 'draft';
};

const DAILY_ACTIVITY_REPORTS: DailyActivityReport[] = [
  {
    id: 'act-1001',
    date: '2026-10-18',
    personOnDuty: 'Andi Pratama',
    shift: 'Pagi',
    status: 'Submitted',
    events: [
      {
        id: 'evt-1',
        time: '06:40',
        contact: 'Monitoring Team',
        location: 'Server Room',
        overview: 'UPS battery alarm on main rack.',
        measures: 'Checked battery voltage and reset the alarm panel.',
        result: 'Normal after reset',
      },
      {
        id: 'evt-2',
        time: '09:25',
        contact: 'User Support',
        location: 'Network Hub',
        overview: 'Intermittent connection at branch office.',
        measures: 'Re-seated uplink cable and verified switch log.',
        result: 'Connection stable',
      },
    ],
    notifications: [
      { id: 'ntf-1', person: 'Helpdesk', content: 'Branch connectivity alert resolved after physical inspection.' },
      { id: 'ntf-2', person: 'Network Team', content: 'UPS maintenance will be scheduled at the next planned window.' },
    ],
    handover: {
      sparePartsStatus: 'Yes',
      handoverPerson: 'Andi Pratama',
      takeoverPerson: 'Rina Damayanti',
      handoverMatters: 'Follow up alarm log and battery health review.',
      handoverTime: '15:00',
      takeoverTime: '07:00',
      acknowledgedBy: 'Rina Damayanti',
    },
  },
  {
    id: 'act-1002',
    date: '2026-10-19',
    personOnDuty: 'Rina Damayanti',
    shift: 'Siang',
    status: 'Reviewed',
    events: [
      {
        id: 'evt-3',
        time: '13:05',
        contact: 'CCTV Team',
        location: 'Data Center Entrance',
        overview: 'Door sensor mismatch on access panel.',
        measures: 'Adjusted sensor threshold and confirmed door logs.',
        result: 'Operational',
      },
    ],
    notifications: [
      { id: 'ntf-3', person: 'Security Office', content: 'Access sensor was re-calibrated and noted for preventive check.' },
    ],
    handover: {
      sparePartsStatus: 'No',
      handoverPerson: 'Rina Damayanti',
      takeoverPerson: 'Budi Santoso',
      handoverMatters: 'CCTV sensor recalibration completed. Pending weekly preventive inspection.',
      handoverTime: '22:00',
      takeoverTime: '06:00',
      acknowledgedBy: 'Budi Santoso',
    },
  },
  {
    id: 'act-1003',
    date: '2026-10-20',
    personOnDuty: 'Budi Santoso',
    shift: 'Office Hour',
    status: 'Closed',
    events: [
      {
        id: 'evt-4',
        time: '08:45',
        contact: 'Facility Team',
        location: 'Main Office',
        overview: 'Air-conditioning unit intermittently tripped.',
        measures: 'Verified breaker and restarted unit after checking load.',
        result: 'Stable and monitored',
      },
      {
        id: 'evt-5',
        time: '15:30',
        contact: 'IT Support',
        location: 'Workstation Zone',
        overview: 'Two workstations reported slow login.',
        measures: 'Checked local cache and restarted service queue.',
        result: 'Login latency resolved',
      },
    ],
    notifications: [
      { id: 'ntf-4', person: 'Facilities', content: 'AC trip report shared with maintenance for preventive inspection.' },
    ],
    handover: {
      sparePartsStatus: 'Yes',
      handoverPerson: 'Budi Santoso',
      takeoverPerson: 'Andi Pratama',
      handoverMatters: 'Two workstations were stabilized and AC breaker was reviewed.',
      handoverTime: '17:00',
      takeoverTime: '07:00',
      acknowledgedBy: 'Andi Pratama',
    },
  },
];

state.activityReports = DAILY_ACTIVITY_REPORTS;
state.activitySelectedId = DAILY_ACTIVITY_REPORTS[0]?.id ?? null;

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

const formatActivityDate = (value: string): string => {
  if (!value) return '--';
  const date = createDateFromValue(value);
  if (!date) return value;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

const getVisibleDailyActivityReports = (): DailyActivityReport[] => {
  const { date, person, shift, status } = state.activityFilters;

  return state.activityReports.filter((report) => {
    const matchesDate = !date || report.date === date;
    const matchesPerson = !person || report.personOnDuty.toLowerCase().includes(person.toLowerCase());
    const matchesShift = !shift || report.shift === shift;
    const matchesStatus = !status || report.status === status;
    return matchesDate && matchesPerson && matchesShift && matchesStatus;
  });
};

const renderDailyActivityList = (): string => {
  const visibleReports = getVisibleDailyActivityReports();

  if (!visibleReports.length) {
    return `
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Daily Activity</p>
          <h2>Daily Activity</h2>
        </div>
        <button type="button" class="primary-button" data-activity-action="create">Create New Report</button>
      </div>
      <div class="empty-state">Tidak ada laporan yang sesuai dengan filter saat ini.</div>
    `;
  }

  return `
    <div class="panel-header">
      <div>
        <p class="panel-kicker">Daily Activity</p>
        <h2>Daily Activity</h2>
      </div>
      <button type="button" class="primary-button" data-activity-action="create">Create New Report</button>
    </div>

    <div class="activity-filters">
      <label class="field-wrap compact-field">
        <span>Report Date</span>
        <input type="date" data-activity-filter="date" value="${state.activityFilters.date}" />
      </label>
      <label class="field-wrap compact-field">
        <span>Personnel</span>
        <input type="search" data-activity-filter="person" value="${state.activityFilters.person}" placeholder="Search person on duty" />
      </label>
      <label class="field-wrap compact-field">
        <span>Shift</span>
        <select data-activity-filter="shift">
          <option value="">All</option>
          ${DAILY_ACTIVITY_SHIFT_OPTIONS.map((option) => `<option value="${option}" ${state.activityFilters.shift === option ? 'selected' : ''}>${option}</option>`).join('')}
        </select>
      </label>
      <label class="field-wrap compact-field">
        <span>Status</span>
        <select data-activity-filter="status">
          <option value="">All</option>
          ${DAILY_ACTIVITY_STATUS_OPTIONS.map((option) => `<option value="${option}" ${state.activityFilters.status === option ? 'selected' : ''}>${option}</option>`).join('')}
        </select>
      </label>
    </div>

    <div class="table-scroll">
      <table class="daily-activity-table">
        <thead>
          <tr>
            <th>Report Date</th>
            <th>Person on Duty</th>
            <th>Shift</th>
            <th>Fault/Event Count</th>
            <th>Information Notification Count</th>
            <th>Handover Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${visibleReports
            .map(
              (report) => `
                <tr>
                  <td>${formatActivityDate(report.date)}</td>
                  <td>${report.personOnDuty || '—'}</td>
                  <td><span class="shift-badge ${report.shift.toLowerCase().replace(/\s+/g, '-')}">${report.shift}</span></td>
                  <td>${report.events.filter((event) => Object.values(event).some((value) => typeof value === 'string' && value.trim().length > 0)).length}</td>
                  <td>${report.notifications.filter((notification) => notification.person.trim() || notification.content.trim()).length}</td>
                  <td><span class="activity-status-badge ${getActivityStatusClass(report.status)}">${report.status}</span></td>
                  <td>
                    <div class="activity-actions">
                      <button type="button" class="secondary-button compact-button" data-activity-action="open" data-report-id="${report.id}">Open</button>
                      <button type="button" class="secondary-button compact-button" data-activity-action="edit" data-report-id="${report.id}">Edit</button>
                      <button type="button" class="secondary-button compact-button" data-activity-action="print" data-report-id="${report.id}">Print</button>
                      <button type="button" class="danger-button compact-button" data-activity-action="delete" data-report-id="${report.id}">Remove</button>
                    </div>
                  </td>
                </tr>
              `,
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
};

const renderDailyActivityView = (): string => {
  const report = state.activityReports.find((item) => item.id === state.activitySelectedId) ?? null;
  if (!report) {
    return '<div class="empty-state">Report not found.</div>';
  }

  const validEvents = report.events.filter((event) => [event.time, event.contact, event.location, event.overview, event.measures, event.result].some((value) => value.trim().length > 0));
  const validNotifications = report.notifications.filter((notice) => notice.person.trim().length > 0 || notice.content.trim().length > 0);

  return `
    <div class="panel-header">
      <div>
        <p class="panel-kicker">Daily Activity</p>
        <h2>Report Detail</h2>
      </div>
      <div class="inline-actions">
        <button type="button" class="secondary-button" data-activity-action="list">Back to Reports</button>
        <button type="button" class="secondary-button" data-activity-action="edit" data-report-id="${report.id}">Edit</button>
        <button type="button" class="primary-button" data-activity-action="print" data-report-id="${report.id}">Print Report</button>
      </div>
    </div>

    <div class="activity-summary-grid">
      <div class="activity-summary-box"><span>Date</span><strong>${formatActivityDate(report.date)}</strong></div>
      <div class="activity-summary-box"><span>Person on Duty</span><strong>${report.personOnDuty || '—'}</strong></div>
      <div class="activity-summary-box"><span>Shift</span><strong>${report.shift}</strong></div>
      <div class="activity-summary-box"><span>Handover Status</span><strong>${report.status}</strong></div>
    </div>

    <div class="activity-card">
      <h3>Fault & Event Registration</h3>
      <div class="table-scroll">
        <table class="daily-activity-table">
          <thead>
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
            ${validEvents.length
              ? validEvents
                  .map(
                    (event, index) => `
                      <tr>
                        <td>${index + 1}</td>
                        <td>${event.time || '—'}</td>
                        <td>${event.contact || '—'}</td>
                        <td>${event.location || '—'}</td>
                        <td>${event.overview || '—'}</td>
                        <td>${event.measures || '—'}</td>
                        <td>${event.result || '—'}</td>
                      </tr>
                    `,
                  )
                  .join('')
              : '<tr><td colspan="7">No fault and event entry recorded.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="activity-card">
      <h3>Information Notification Record</h3>
      <div class="table-scroll">
        <table class="daily-activity-table">
          <thead>
            <tr>
              <th>No.</th>
              <th>Notifying Person / Team</th>
              <th>Content</th>
            </tr>
          </thead>
          <tbody>
            ${validNotifications.length
              ? validNotifications
                  .map(
                    (notification, index) => `
                      <tr>
                        <td>${index + 1}</td>
                        <td>${notification.person || '—'}</td>
                        <td>${notification.content || '—'}</td>
                      </tr>
                    `,
                  )
                  .join('')
              : '<tr><td colspan="3">No notification record entered.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="handover-overview">
      <div class="handover-box">
        <h3>Handover Record</h3>
        <div class="handover-row"><span>Are spare parts, tools and auxiliary materials complete?</span><strong>${report.handover.sparePartsStatus || '—'}</strong></div>
        <div class="handover-row"><span>Handover Matters</span><p>${report.handover.handoverMatters || '—'}</p></div>
      </div>
      <div class="handover-box">
        <div class="handover-grid">
          <div><label>Handover Person</label><strong>${report.handover.handoverPerson || '—'}</strong></div>
          <div><label>Time</label><strong>${report.handover.handoverTime || '—'}</strong></div>
          <div><label>Takeover Person</label><strong>${report.handover.takeoverPerson || '—'}</strong></div>
          <div><label>Time</label><strong>${report.handover.takeoverTime || '—'}</strong></div>
          <div class="acknowledged-field"><label>Acknowledged by</label><strong>${report.handover.acknowledgedBy || '—'}</strong></div>
        </div>
      </div>
    </div>
  `;
};

const renderDailyActivityForm = (): string => {
  const draft = state.activityDraft;
  if (!draft) {
    return '<div class="empty-state">No report draft available.</div>';
  }

  return `
    <div class="panel-header">
      <div>
        <p class="panel-kicker">Daily Activity</p>
        <h2>${draft.id ? 'Edit Report' : 'New Report'}</h2>
      </div>
      <div class="inline-actions">
        <button type="button" class="secondary-button" data-activity-action="list">Back to Reports</button>
        <button type="button" class="primary-button" data-activity-action="save">Save Report</button>
      </div>
    </div>

    <form id="daily-activity-form" class="daily-activity-form" novalidate>
      <div class="activity-form-grid">
        <label class="field-wrap">
          <span>Date</span>
          <input type="date" data-activity-scope="report" data-field="date" value="${draft.date}" required />
        </label>
        <label class="field-wrap">
          <span>Person On Duty</span>
          <input type="text" data-activity-scope="report" data-field="personOnDuty" value="${draft.personOnDuty}" placeholder="Name of person on duty" required />
        </label>
        <label class="field-wrap">
          <span>Shift</span>
          <select data-activity-scope="report" data-field="shift">
            ${DAILY_ACTIVITY_SHIFT_OPTIONS.map((option) => `<option value="${option}" ${draft.shift === option ? 'selected' : ''}>${option}</option>`).join('')}
          </select>
        </label>
      </div>

      <div class="activity-card">
        <div class="activity-card-header">
          <h3>Fault & Event Registration</h3>
          <button type="button" class="secondary-button compact-button" data-activity-action="add-event">Add Event</button>
        </div>
        <div class="table-scroll">
          <table class="daily-activity-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Time</th>
                <th>Report Person / Team (Contact)</th>
                <th>Event Location</th>
                <th>Fault / Event Overview</th>
                <th>Disposal Measures</th>
                <th>Result</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${draft.events
                .map(
                  (event, index) => `
                    <tr>
                      <td>${index + 1}</td>
                      <td><input type="time" data-activity-scope="event" data-event-id="${event.id}" data-field="time" value="${event.time}" /></td>
                      <td><input type="text" data-activity-scope="event" data-event-id="${event.id}" data-field="contact" value="${event.contact}" /></td>
                      <td><input type="text" data-activity-scope="event" data-event-id="${event.id}" data-field="location" value="${event.location}" /></td>
                      <td><textarea data-activity-scope="event" data-event-id="${event.id}" data-field="overview" rows="2">${event.overview}</textarea></td>
                      <td><textarea data-activity-scope="event" data-event-id="${event.id}" data-field="measures" rows="2">${event.measures}</textarea></td>
                      <td><textarea data-activity-scope="event" data-event-id="${event.id}" data-field="result" rows="2">${event.result}</textarea></td>
                      <td><button type="button" class="danger-button" data-activity-action="remove-event" data-event-id="${event.id}">Remove</button></td>
                    </tr>
                  `,
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="activity-card">
        <div class="activity-card-header">
          <h3>Information Notification Record</h3>
          <button type="button" class="secondary-button compact-button" data-activity-action="add-notification">Add Notification</button>
        </div>
        <div class="table-scroll">
          <table class="daily-activity-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Notifying Person / Team</th>
                <th>Content</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${draft.notifications
                .map(
                  (notification, index) => `
                    <tr>
                      <td>${index + 1}</td>
                      <td><input type="text" data-activity-scope="notification" data-notification-id="${notification.id}" data-field="person" value="${notification.person}" /></td>
                      <td><textarea data-activity-scope="notification" data-notification-id="${notification.id}" data-field="content" rows="3">${notification.content}</textarea></td>
                      <td><button type="button" class="danger-button" data-activity-action="remove-notification" data-notification-id="${notification.id}">Remove</button></td>
                    </tr>
                  `,
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="handover-form-layout">
        <div class="handover-panel">
          <h3>Handover Record</h3>
          <div class="handover-question">
            <span>Are spare parts, tools and auxiliary materials complete?</span>
            <label><input type="radio" data-activity-scope="handover" data-field="sparePartsStatus" name="spare-parts-status" value="Yes" ${draft.handover.sparePartsStatus === 'Yes' ? 'checked' : ''} /> Yes</label>
            <label><input type="radio" data-activity-scope="handover" data-field="sparePartsStatus" name="spare-parts-status" value="No" ${draft.handover.sparePartsStatus === 'No' ? 'checked' : ''} /> No</label>
          </div>
          <label class="field-wrap full-width">
            <span>Handover Matters</span>
            <textarea data-activity-scope="handover" data-field="handoverMatters" rows="4">${draft.handover.handoverMatters}</textarea>
          </label>
        </div>

        <div class="handover-panel">
          <div class="handover-grid-form">
            <label class="field-wrap">
              <span>Handover Person</span>
              <input type="text" data-activity-scope="handover" data-field="handoverPerson" value="${draft.handover.handoverPerson}" />
            </label>
            <label class="field-wrap">
              <span>Handover Person Time</span>
              <input type="time" data-activity-scope="handover" data-field="handoverTime" value="${draft.handover.handoverTime}" />
            </label>
            <label class="field-wrap">
              <span>Takeover Person</span>
              <input type="text" data-activity-scope="handover" data-field="takeoverPerson" value="${draft.handover.takeoverPerson}" />
            </label>
            <label class="field-wrap">
              <span>Takeover Person Time</span>
              <input type="time" data-activity-scope="handover" data-field="takeoverTime" value="${draft.handover.takeoverTime}" />
            </label>
            <label class="field-wrap full-width">
              <span>Acknowledged by</span>
              <input type="text" data-activity-scope="handover" data-field="acknowledgedBy" value="${draft.handover.acknowledgedBy}" />
            </label>
          </div>
        </div>
      </div>

      <div class="activity-notes">
        <p>1. "Fault and Event Registration" records the failure and event found in each shift.</p>
        <p>2. "Information Notification Record" records the information system-related call records received by each shift.</p>
      </div>
    </form>
  `;
};

const renderDailyActivityPanel = (): void => {
  if (state.activeTab !== 'activity') {
    ui.activityPanel.classList.add('hidden');
    return;
  }

  ui.activityPanel.classList.remove('hidden');

  if (state.activityMode === 'form') {
    ui.activityPanel.innerHTML = renderDailyActivityForm();
    return;
  }

  if (state.activityMode === 'view') {
    ui.activityPanel.innerHTML = renderDailyActivityView();
    return;
  }

  ui.activityPanel.innerHTML = renderDailyActivityList();
};

const renderDailyActivityPrint = (report: DailyActivityReport): void => {
  const validEvents = report.events.filter((event) => [event.time, event.contact, event.location, event.overview, event.measures, event.result].some((value) => value.trim().length > 0));
  const validNotifications = report.notifications.filter((record) => record.person.trim().length > 0 || record.content.trim().length > 0);

  const printEvents = validEvents.length
    ? validEvents
        .map(
          (event, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${event.time || ''}</td>
              <td>${event.contact || ''}</td>
              <td>${event.location || ''}</td>
              <td>${event.overview || ''}</td>
              <td>${event.measures || ''}</td>
              <td>${event.result || ''}</td>
            </tr>
          `,
        )
        .join('')
    : '<tr><td colspan="7"> </td></tr>';

  const printNotifications = validNotifications.length
    ? validNotifications
        .map(
          (notification, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${notification.person || ''}</td>
              <td>${notification.content || ''}</td>
            </tr>
          `,
        )
        .join('')
    : '<tr><td colspan="3"> </td></tr>';

  ui.activityPrintRoot.classList.remove('hidden');
  ui.activityPrintRoot.innerHTML = `
    <div class="daily-activity-print-sheet">
      <h1>Daily Operation and Maintenance<br />Shift Handover Records</h1>

      <div class="print-header-grid">
        <div class="print-field">
          <span>Date</span>
          <strong>${formatActivityDate(report.date)}</strong>
        </div>
        <div class="print-field">
          <span>Person On Duty</span>
          <strong>${report.personOnDuty || ''}</strong>
        </div>
        <div class="print-field">
          <span>Shift</span>
          <strong>${report.shift || ''}</strong>
        </div>
      </div>

      <section class="print-section">
        <h2>Fault & Event Registration</h2>
        <table>
          <thead>
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
          <tbody>${printEvents}</tbody>
        </table>
      </section>

      <section class="print-section">
        <h2>Information Notification Record</h2>
        <table>
          <thead>
            <tr>
              <th>No.</th>
              <th>Notifying Person / Team</th>
              <th>Content</th>
            </tr>
          </thead>
          <tbody>${printNotifications}</tbody>
        </table>
      </section>

      <section class="print-section handover-print-layout">
        <div class="handover-left-box">
          <div class="handover-yes-no">
            <span>Are spare parts, tools and auxiliary materials complete?</span>
            <div class="print-radio-row">
              <span class="print-radio ${report.handover.sparePartsStatus === 'Yes' ? 'selected' : ''}">Yes</span>
              <span class="print-radio ${report.handover.sparePartsStatus === 'No' ? 'selected' : ''}">No</span>
            </div>
          </div>
          <div class="handover-matters-box">
            <span>Handover Matters</span>
            <p>${report.handover.handoverMatters || ''}</p>
          </div>
        </div>

        <div class="handover-right-box">
          <div class="handover-inline-grid">
            <div class="print-field small-field">
              <span>Handover Person</span>
              <strong>${report.handover.handoverPerson || ''}</strong>
            </div>
            <div class="print-field small-field">
              <span>Time</span>
              <strong>${report.handover.handoverTime || ''}</strong>
            </div>
          </div>
          <div class="handover-inline-grid">
            <div class="print-field small-field">
              <span>Takeover Person</span>
              <strong>${report.handover.takeoverPerson || ''}</strong>
            </div>
            <div class="print-field small-field">
              <span>Time</span>
              <strong>${report.handover.takeoverTime || ''}</strong>
            </div>
          </div>
          <div class="print-field small-field acknowledged-box">
            <span>Acknowledged by</span>
            <strong>${report.handover.acknowledgedBy || ''}</strong>
          </div>
        </div>
      </section>

      <div class="print-notes">
        <p>1. "Fault and Event Registration" records the failure and event found in each shift.</p>
        <p>2. "Information Notification Record" records the information system-related call records received by each shift.</p>
      </div>
    </div>
  `;
};

const printDailyActivityReport = (reportId: string): void => {
  const report = state.activityReports.find((item) => item.id === reportId);
  if (!report) return;

  state.activitySelectedId = reportId;
  state.activityMode = 'view';
  renderDailyActivityPanel();
  renderDailyActivityPrint(report);
  window.print();
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

const saveDailyActivityReport = (): void => {
  if (!state.activityDraft) {
    return;
  }

  const draft = state.activityDraft;
  const normalizedDate = draft.date.trim();
  const normalizedPerson = draft.personOnDuty.trim();

  if (!normalizedDate || !normalizedPerson) {
    setAlert('Report date and person on duty are required before saving.', 'error');
    return;
  }

  const cleanedReport: DailyActivityReport = {
    ...draft,
    date: normalizedDate,
    personOnDuty: normalizedPerson,
    shift: draft.shift,
    status: draft.status,
    events: draft.events
      .map((event) => ({
        ...event,
        time: event.time.trim(),
        contact: event.contact.trim(),
        location: event.location.trim(),
        overview: event.overview.trim(),
        measures: event.measures.trim(),
        result: event.result.trim(),
      }))
      .filter((event) => Object.values(event).some((value) => value.trim().length > 0)),
    notifications: draft.notifications
      .map((notification) => ({
        ...notification,
        person: notification.person.trim(),
        content: notification.content.trim(),
      }))
      .filter((notification) => notification.person.trim().length > 0 || notification.content.trim().length > 0),
    handover: {
      ...draft.handover,
      handoverPerson: draft.handover.handoverPerson.trim(),
      takeoverPerson: draft.handover.takeoverPerson.trim(),
      handoverMatters: draft.handover.handoverMatters.trim(),
      handoverTime: draft.handover.handoverTime.trim(),
      takeoverTime: draft.handover.takeoverTime.trim(),
      acknowledgedBy: draft.handover.acknowledgedBy.trim(),
    },
  };

  const existingIndex = state.activityReports.findIndex((report) => report.id === cleanedReport.id);
  if (existingIndex >= 0) {
    state.activityReports.splice(existingIndex, 1, cleanedReport);
  } else {
    state.activityReports.unshift(cleanedReport);
  }

  state.activitySelectedId = cleanedReport.id;
  state.activityDraft = null;
  state.activityMode = 'list';
  setAlert('Daily Activity report saved successfully.', 'success');
  renderApp();
};

const handleActivityFieldInput = (target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): void => {
  if (!state.activityDraft) {
    return;
  }

  const field = target.dataset.field;
  const scope = target.dataset.activityScope;

  if (!field || !scope) {
    return;
  }

  if (scope === 'report') {
    if (field === 'date') {
      state.activityDraft.date = target.value;
    }
    if (field === 'personOnDuty') {
      state.activityDraft.personOnDuty = target.value;
    }
    if (field === 'shift') {
      state.activityDraft.shift = target.value as DailyActivityShift;
    }
    return;
  }

  if (scope === 'event') {
    const eventId = target.dataset.eventId;
    if (!eventId) return;
    const eventEntry = state.activityDraft.events.find((item) => item.id === eventId);
    if (!eventEntry) return;
    if (field === 'time') eventEntry.time = target.value;
    if (field === 'contact') eventEntry.contact = target.value;
    if (field === 'location') eventEntry.location = target.value;
    if (field === 'overview') eventEntry.overview = target.value;
    if (field === 'measures') eventEntry.measures = target.value;
    if (field === 'result') eventEntry.result = target.value;
    return;
  }

  if (scope === 'notification') {
    const notificationId = target.dataset.notificationId;
    if (!notificationId) return;
    const notificationEntry = state.activityDraft.notifications.find((item) => item.id === notificationId);
    if (!notificationEntry) return;
    if (field === 'person') notificationEntry.person = target.value;
    if (field === 'content') notificationEntry.content = target.value;
    return;
  }

  if (scope === 'handover') {
    if (field === 'sparePartsStatus') {
      state.activityDraft.handover.sparePartsStatus = target.value as 'Yes' | 'No';
    }
    if (field === 'handoverPerson') state.activityDraft.handover.handoverPerson = target.value;
    if (field === 'takeoverPerson') state.activityDraft.handover.takeoverPerson = target.value;
    if (field === 'handoverMatters') state.activityDraft.handover.handoverMatters = target.value;
    if (field === 'handoverTime') state.activityDraft.handover.handoverTime = target.value;
    if (field === 'takeoverTime') state.activityDraft.handover.takeoverTime = target.value;
    if (field === 'acknowledgedBy') state.activityDraft.handover.acknowledgedBy = target.value;
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
  renderDailyActivityPanel();
  renderMetadata();

  document.querySelectorAll<HTMLButtonElement>('.nav-button').forEach((button) => {
    const isActive = button.dataset.tab === state.activeTab;
    button.classList.toggle('is-active', isActive);
  });

  ui.dailyPanel.classList.toggle('hidden', state.activeTab !== 'daily');
  ui.monthlyPanel.classList.toggle('hidden', state.activeTab !== 'monthly');
  ui.activityPanel.classList.toggle('hidden', state.activeTab !== 'activity');
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
    const nextTab = button.dataset.tab === 'monthly' ? 'monthly' : button.dataset.tab === 'activity' ? 'activity' : 'daily';
    state.activeTab = nextTab;
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
  const modalCloseTrigger = target.closest('[data-close-modal="true"]');
  if (modalCloseTrigger) {
    closeUploadModal();
    return;
  }

  const activityButton = target.closest<HTMLButtonElement>('[data-activity-action]');
  if (!activityButton) {
    return;
  }

  const action = activityButton.dataset.activityAction;
  if (!action) {
    return;
  }

  if (action === 'create') {
    state.activitySelectedId = null;
    state.activityDraft = createEmptyActivityReport();
    state.activityMode = 'form';
    renderDailyActivityPanel();
    return;
  }

  if (action === 'list') {
    state.activityMode = 'list';
    renderDailyActivityPanel();
    return;
  }

  if (action === 'save') {
    saveDailyActivityReport();
    return;
  }

  if (action === 'open' || action === 'view') {
    const reportId = activityButton.dataset.reportId;
    if (!reportId) return;
    state.activitySelectedId = reportId;
    state.activityMode = 'view';
    renderDailyActivityPanel();
    return;
  }

  if (action === 'edit') {
    const reportId = activityButton.dataset.reportId;
    if (!reportId) return;
    const report = state.activityReports.find((item) => item.id === reportId);
    if (!report) return;
    state.activitySelectedId = reportId;
    state.activityDraft = cloneActivityReport(report);
    state.activityMode = 'form';
    renderDailyActivityPanel();
    return;
  }

  if (action === 'print') {
    const reportId = activityButton.dataset.reportId;
    if (!reportId) return;
    printDailyActivityReport(reportId);
    return;
  }

  if (action === 'delete') {
    const reportId = activityButton.dataset.reportId;
    if (!reportId) return;
    const report = state.activityReports.find((item) => item.id === reportId);
    if (!report) return;
    if (!window.confirm(`Delete the report for ${report.personOnDuty || 'this person'} on ${formatActivityDate(report.date)}?`)) {
      return;
    }
    state.activityReports = state.activityReports.filter((item) => item.id !== reportId);
    if (state.activitySelectedId === reportId) {
      state.activitySelectedId = state.activityReports[0]?.id ?? null;
    }
    state.activityMode = 'list';
    renderDailyActivityPanel();
    return;
  }

  if (action === 'add-event') {
    if (!state.activityDraft) return;
    state.activityDraft.events.push(createEmptyActivityEvent());
    renderDailyActivityPanel();
    return;
  }

  if (action === 'remove-event') {
    if (!state.activityDraft) return;
    const eventId = activityButton.dataset.eventId;
    if (!eventId) return;
    if (state.activityDraft.events.length > 1) {
      state.activityDraft.events = state.activityDraft.events.filter((item) => item.id !== eventId);
    }
    renderDailyActivityPanel();
    return;
  }

  if (action === 'add-notification') {
    if (!state.activityDraft) return;
    state.activityDraft.notifications.push(createEmptyActivityNotification());
    renderDailyActivityPanel();
    return;
  }

  if (action === 'remove-notification') {
    if (!state.activityDraft) return;
    const notificationId = activityButton.dataset.notificationId;
    if (!notificationId) return;
    if (state.activityDraft.notifications.length > 1) {
      state.activityDraft.notifications = state.activityDraft.notifications.filter((item) => item.id !== notificationId);
    }
    renderDailyActivityPanel();
  }
});

document.addEventListener('input', (event) => {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  const field = target.dataset.field;
  if (!field) {
    return;
  }

  if (target.dataset.activityFilter) {
    const filterName = target.dataset.activityFilter as keyof typeof state.activityFilters;
    state.activityFilters[filterName] = target.value;
    renderDailyActivityPanel();
    return;
  }

  if (target.dataset.activityScope) {
    handleActivityFieldInput(target);
  }
});

document.addEventListener('change', (event) => {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  const field = target.dataset.field;
  if (!field) {
    return;
  }

  if (target.dataset.activityFilter) {
    const filterName = target.dataset.activityFilter as keyof typeof state.activityFilters;
    state.activityFilters[filterName] = target.value;
    renderDailyActivityPanel();
    return;
  }

  if (target.dataset.activityScope) {
    handleActivityFieldInput(target);
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

window.addEventListener('afterprint', () => {
  ui.activityPrintRoot.classList.add('hidden');
  ui.activityPrintRoot.innerHTML = '';
});
