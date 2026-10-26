'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';

type Status = 'PAGI' | 'SIANG' | 'Office Hour' | '';
type ActiveTab = 'daily' | 'monthly' | 'activity';
type ActivityMode = 'list' | 'form' | 'view';
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

const AUTH_STORAGE_KEY = 'roster-dashboard.auth.v1';
const ROSTER_STORAGE_KEY = 'roster-dashboard.active-roster.v1';
const ACTIVE_TAB_STORAGE_KEY = 'roster-dashboard.active-tab.v1';
const ASIA_JAKARTA_TIMEZONE = 'Asia/Jakarta';
const DEMO_USERNAME = 'admin';
const DEMO_PASSWORD = 'Admin123!';
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

const getCurrentDateKeyInTimeZone = (timeZone = ASIA_JAKARTA_TIMEZONE): string => {
  const date = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const map = new Map<string, string>();
  for (const part of parts) {
    if (part.type !== 'literal') map.set(part.type, part.value);
  }
  const year = Number(map.get('year') ?? 0);
  const month = Number(map.get('month') ?? 0);
  const day = Number(map.get('day') ?? 0);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const parseStatus = (rawValue: unknown): { status: Status; unknown: boolean; raw: string } => {
  const rawString = String(rawValue ?? '').trim();
  if (!rawString) return { status: '', unknown: false, raw: '' };
  const normalized = rawString.replace(/\s+/g, ' ');
  const upperValue = normalized.toUpperCase();
  if (upperValue === 'PAGI') return { status: 'PAGI', unknown: false, raw: normalized };
  if (upperValue === 'SIANG') return { status: 'SIANG', unknown: false, raw: normalized };
  if (upperValue === 'OFFICE HOUR') return { status: 'Office Hour', unknown: false, raw: normalized };
  return { status: '', unknown: true, raw: normalized };
};

const getStatusClass = (status: Status): string => {
  if (status === 'PAGI') return 'pagi';
  if (status === 'SIANG') return 'siang';
  if (status === 'Office Hour') return 'office';
  return 'empty';
};

const formatDateKey = (date: Date, timeZone = ASIA_JAKARTA_TIMEZONE): string => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const map = new Map<string, string>();
  for (const part of parts) {
    if (part.type !== 'literal') map.set(part.type, part.value);
  }
  const year = Number(map.get('year') ?? 0);
  const month = Number(map.get('month') ?? 0);
  const day = Number(map.get('day') ?? 0);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const createDateFromValue = (value: unknown): Date | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const rawValue = String(value ?? '').trim();
  if (!rawValue) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) return new Date(`${rawValue}T00:00:00+07:00`);
  const date = new Date(rawValue);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getDateDisplayLabel = (date: Date): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone: ASIA_JAKARTA_TIMEZONE, day: '2-digit', month: 'short', year: 'numeric' }).format(date);

const getDayName = (date: Date): string =>
  new Intl.DateTimeFormat('en-US', { timeZone: ASIA_JAKARTA_TIMEZONE, weekday: 'long' }).format(date);

const getSummaryCounts = (roster: RosterData, dateKey: string) => {
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
  const total = roster.personnel.length;
  const summary = { pagi: 0, siang: 0, office: 0, empty: 0, total };
  roster.dates.forEach((date) => {
    const counts = getSummaryCounts(roster, date.key);
    summary.pagi += counts.pagi;
    summary.siang += counts.siang;
    summary.office += counts.office;
    summary.empty += counts.empty;
  });
  return summary;
};

const getDefaultRosterDateKey = (roster: RosterData): string => {
  const todayKey = getCurrentDateKeyInTimeZone();
  if (roster.dates.some((date) => date.key === todayKey)) return todayKey;
  return roster.dates[0]?.key ?? '';
};

const parseRosterWorkbook = (buffer: ArrayBuffer, filename: string): RosterData => {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('File Excel tidak memiliki sheet yang valid.');

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, blankrows: true }) as unknown[][];
  if (!rows.length) throw new Error('Sheet Excel kosong atau tidak dapat dibaca.');

  const findMonthLabel = (): string => {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
        const value = row[colIndex];
        if (typeof value === 'string' && value.trim()) {
          const text = value.trim();
          if (/^(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)$/i.test(text)) {
            return text;
          }
          if (/^(january|february|march|april|may|june|july|august|september|october|november|december)$/i.test(text)) {
            return text;
          }
        }
      }
    }
    return 'Roster';
  };

  const monthLabel = findMonthLabel();

  const dateRowIndex = rows.findIndex((row) => row.some((value) => value instanceof Date || (typeof value === 'string' && !Number.isNaN(new Date(value).getTime()))));
  const dateRow = dateRowIndex >= 0 ? rows[dateRowIndex] : [];
  const dateStartIndex = dateRow.findIndex((value) => {
    if (value == null || value === '') return false;
    const parsed = createDateFromValue(value);
    return parsed !== null;
  });

  if (dateStartIndex === -1) {
    throw new Error('Baris tanggal tidak ditemukan pada file Excel. Struktur file tidak sesuai.');
  }

  const dates: DateInfo[] = [];
  for (let colIndex = dateStartIndex; colIndex < dateRow.length; colIndex += 1) {
    const value = dateRow[colIndex];
    if (value == null || value === '') continue;
    const parsed = createDateFromValue(value);
    if (!parsed) continue;
    dates.push({ key: formatDateKey(parsed), label: getDateDisplayLabel(parsed), dayName: getDayName(parsed) });
  }

  if (!dates.length) {
    throw new Error('Tidak ada tanggal valid yang terdeteksi dari file roster.');
  }

  const personnel: PersonnelRow[] = [];
  const startRowIndex = Math.max(dateRowIndex + 2, 0);

  let nameIndex = 0;
  let departmentIndex = 1;
  let positionIndex = 2;
  const scheduleStartIndex = dateStartIndex;

  const actualNamePositionRow = rows.slice(startRowIndex, Math.min(startRowIndex + 12, rows.length)).find((row) => {
    if (!row || row.length < 3) return false;
    const firstValue = row[0];
    const secondValue = row[1];
    const thirdValue = row[2];
    return typeof firstValue === 'string' && firstValue.trim() && typeof secondValue === 'string' && typeof thirdValue === 'string';
  });

  if (actualNamePositionRow) {
    const detectedNameIndex = actualNamePositionRow.findIndex((value) => {
      if (typeof value !== 'string') return false;
      const text = value.trim();
      return Boolean(text) && !/^(HPIO|IT Technician|Oktober|Thursday|Friday|Saturday|Sunday|Monday|Tuesday|Wednesday)$/i.test(text);
    });

    if (detectedNameIndex >= 0) {
      nameIndex = detectedNameIndex;
      departmentIndex = Math.max(nameIndex + 1, 1);
      positionIndex = Math.max(nameIndex + 2, 2);
    }
  }

  for (let rowIndex = startRowIndex; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row || row.every((cell) => cell == null || String(cell).trim() === '')) continue;

    const nameCandidate = row[nameIndex];
    const deptCandidate = row[departmentIndex] ?? row[nameIndex + 1];
    const positionCandidate = row[positionIndex] ?? row[nameIndex + 2];
    if (nameCandidate == null || String(nameCandidate).trim() === '') continue;
    const name = String(nameCandidate).trim();
    if (/^(HPIO|IT Technician|Oktober|Thursday|Friday|Saturday|Sunday|Monday|Tuesday|Wednesday)$/i.test(name)) continue;

    const department = typeof deptCandidate === 'string' && deptCandidate.trim() ? deptCandidate.trim() : 'IT Support';
    const position = typeof positionCandidate === 'string' && positionCandidate.trim() ? positionCandidate.trim() : 'IT Technician';
    const schedule: Record<string, Status> = {};

    for (let dateIndex = 0; dateIndex < dates.length; dateIndex += 1) {
      const rawValue = row[scheduleStartIndex + dateIndex] ?? '';
      const parsed = parseStatus(rawValue);
      schedule[dates[dateIndex].key] = parsed.unknown ? '' : parsed.status;
    }

    personnel.push({ id: `person-${personnel.length + 1}`, name, department, position, schedule });
  }

  if (!personnel.length) {
    const fallbackPersonnel: PersonnelRow[] = [];
    for (let rowIndex = 2; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      if (!row || row.every((cell) => cell == null || String(cell).trim() === '')) continue;
      const nameCell = row[0];
      if (!nameCell || String(nameCell).trim() === '') continue;
      const name = String(nameCell).trim();
      if (/^(HPIO|IT Technician|Oktober|Thursday|Friday|Saturday|Sunday|Monday|Tuesday|Wednesday)$/i.test(name)) continue;
      const department = String(row[1] ?? 'IT Support').trim() || 'IT Support';
      const position = String(row[2] ?? 'IT Technician').trim() || 'IT Technician';
      const schedule: Record<string, Status> = {};
      for (let dateIndex = 0; dateIndex < dates.length; dateIndex += 1) {
        const rawValue = row[dateStartIndex + dateIndex] ?? '';
        const parsed = parseStatus(rawValue);
        schedule[dates[dateIndex].key] = parsed.unknown ? '' : parsed.status;
      }
      fallbackPersonnel.push({ id: `person-${fallbackPersonnel.length + 1}`, name, department, position, schedule });
    }

    if (!fallbackPersonnel.length) throw new Error('Data personel tidak ditemukan pada file Excel.');
    return { filename, monthLabel, dates, personnel: fallbackPersonnel, warnings: [], periodLabel: monthLabel };
  }

  return {
    filename,
    monthLabel,
    dates,
    personnel,
    warnings: [],
    periodLabel: monthLabel,
  };
};

const getActivityStatusClass = (status: DailyActivityStatus): string => {
  if (status === 'Submitted') return 'submitted';
  if (status === 'Reviewed') return 'reviewed';
  if (status === 'Closed') return 'closed';
  return 'draft';
};

const formatActivityDate = (value: string): string => {
  if (!value) return '--';
  const date = createDateFromValue(value);
  if (!date) return value;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

const getVisibleDailyActivityReports = (reports: DailyActivityReport[], filters: ActivityFilters): DailyActivityReport[] => {
  return reports.filter((report) => {
    const matchesDate = !filters.date || report.date === filters.date;
    const matchesPerson = !filters.person || report.personOnDuty.toLowerCase().includes(filters.person.toLowerCase());
    const matchesShift = !filters.shift || report.shift === filters.shift;
    const matchesStatus = !filters.status || report.status === filters.status;
    return matchesDate && matchesPerson && matchesShift && matchesStatus;
  });
};

export default function HomePage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('daily');
  const [activeRoster, setActiveRoster] = useState<RosterData | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [lastFileName, setLastFileName] = useState('');
  const [activityMode, setActivityMode] = useState<ActivityMode>('list');
  const [activityReports, setActivityReports] = useState<DailyActivityReport[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [activityDraft, setActivityDraft] = useState<DailyActivityReport | null>(null);
  const [activityFilters, setActivityFilters] = useState<ActivityFilters>({ date: '', person: '', shift: '', status: '' });
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const wasAuthenticated =
      window.localStorage.getItem(AUTH_STORAGE_KEY) === 'true' ||
      window.sessionStorage.getItem(AUTH_STORAGE_KEY) === 'true';
    setAuthenticated(wasAuthenticated);
    if (wasAuthenticated) window.localStorage.setItem(AUTH_STORAGE_KEY, 'true');

    const savedTab = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
    if (savedTab === 'daily' || savedTab === 'monthly' || savedTab === 'activity') {
      setActiveTab(savedTab);
    }

    const storedRoster = localStorage.getItem(ROSTER_STORAGE_KEY);
    if (storedRoster) {
      try {
        const parsed = JSON.parse(storedRoster) as { roster?: RosterData; lastUpdated?: string };
        if (parsed.roster?.filename === 'default-roster.xlsx') {
          localStorage.removeItem(ROSTER_STORAGE_KEY);
        } else if (parsed.roster && Array.isArray(parsed.roster.dates) && Array.isArray(parsed.roster.personnel)) {
          setActiveRoster(parsed.roster);
          setSelectedDate(getDefaultRosterDateKey(parsed.roster));
          setLastUpdated(parsed.lastUpdated ? new Date(parsed.lastUpdated) : new Date());
          setLastFileName(parsed.roster.filename || 'saved-roster.xlsx');
        }
      } catch {
        localStorage.removeItem(ROSTER_STORAGE_KEY);
      }
    }

    setAuthChecked(true);
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
  }, [activeTab, authChecked]);

  useEffect(() => {
    if (!activeRoster) return;
    if (!selectedDate || !activeRoster.dates.some((date) => date.key === selectedDate)) {
      setSelectedDate(getDefaultRosterDateKey(activeRoster));
    }
    localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify({ roster: activeRoster, lastUpdated: lastUpdated?.toISOString?.() ?? new Date().toISOString() }));
  }, [activeRoster, lastUpdated, selectedDate]);

  const dailySummary = useMemo(() => {
    if (!activeRoster) return { pagi: 0, siang: 0, office: 0, empty: 0 };
    return getSummaryCounts(activeRoster, selectedDate);
  }, [activeRoster, selectedDate]);

  const filteredPersonnel = useMemo(() => {
    if (!activeRoster) return [] as PersonnelRow[];
    const term = searchTerm.trim().toLowerCase();
    return activeRoster.personnel.filter((person) =>
      !term || person.name.toLowerCase().includes(term) || person.department.toLowerCase().includes(term) || person.position.toLowerCase().includes(term),
    );
  }, [activeRoster, searchTerm]);

  const dailyActivityVisibleReports = useMemo(
    () => getVisibleDailyActivityReports(activityReports, activityFilters),
    [activityReports, activityFilters],
  );

  const monthSummary = useMemo(() => (activeRoster ? getMonthlySummary(activeRoster) : { pagi: 0, siang: 0, office: 0, empty: 0, total: 0 }), [activeRoster]);

  const handleLoginSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loginForm.username.trim() === DEMO_USERNAME && loginForm.password === DEMO_PASSWORD) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, 'true');
      setAuthenticated(true);
      setLoginError('');
      return;
    }
    setLoginError('Username atau password tidak valid.');
  };

  const handleLogout = () => {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    setAuthenticated(false);
    setLoginForm({ username: '', password: '' });
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !['xlsx', 'xls'].includes(extension)) {
      setUploadError('Format file tidak didukung. Silakan upload file Excel (.xlsx atau .xls).');
      event.target.value = '';
      return;
    }

    try {
      setUploadError('');
      const buffer = await file.arrayBuffer();
      const roster = parseRosterWorkbook(buffer, file.name);
      setActiveRoster(roster);
      setSelectedDate(getDefaultRosterDateKey(roster));
      setLastUpdated(new Date());
      setLastFileName(roster.filename);
      setSearchTerm('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'File Excel gagal diproses.';
      setUploadError(message);
    } finally {
      event.target.value = '';
    }
  };

  const resetRoster = () => {
    if (!activeRoster) return;
    setActiveRoster(null);
    setSelectedDate('');
    setLastUpdated(null);
    setLastFileName('');
    setUploadError('');
    localStorage.removeItem(ROSTER_STORAGE_KEY);
  };

  const createActivityReportDraft = (report?: DailyActivityReport) => {
    const nextDraft = report ? cloneActivityReport(report) : createEmptyActivityReport();
    setActivityDraft(nextDraft);
    setActivityMode('form');
  };

  const saveActivityReport = () => {
    if (!activityDraft) return;
    const cleanedReport = {
      ...activityDraft,
      date: activityDraft.date || getCurrentDateKeyInTimeZone(),
      personOnDuty: activityDraft.personOnDuty.trim(),
      events: activityDraft.events.filter((event) => [event.time, event.contact, event.location, event.overview, event.measures, event.result].some((value) => value.trim().length > 0)),
      notifications: activityDraft.notifications.filter((notification) => notification.person.trim().length > 0 || notification.content.trim().length > 0),
    };

    if (!cleanedReport.events.length) cleanedReport.events = [createEmptyActivityEvent()];
    if (!cleanedReport.notifications.length) cleanedReport.notifications = [createEmptyActivityNotification()];

    setActivityReports((current) => {
      const index = current.findIndex((item) => item.id === cleanedReport.id);
      if (index >= 0) {
        const next = [...current];
        next[index] = cleanedReport;
        return next;
      }
      return [cleanedReport, ...current];
    });

    setSelectedActivityId(cleanedReport.id);
    setActivityDraft(null);
    setActivityMode('view');
  };

  const deleteActivityReport = (reportId: string) => {
    setActivityReports((current) => current.filter((report) => report.id !== reportId));
    if (selectedActivityId === reportId) {
      const next = activityReports.find((report) => report.id !== reportId);
      setSelectedActivityId(next?.id ?? null);
    }
    setActivityMode('list');
  };

  const printActivityReport = (reportId: string) => {
    const report = activityReports.find((item) => item.id === reportId);
    if (!report) return;
    setSelectedActivityId(reportId);
    setActivityMode('view');
    setTimeout(() => window.print(), 150);
  };

  const activeReport = useMemo(
    () => activityReports.find((item) => item.id === selectedActivityId) ?? null,
    [activityReports, selectedActivityId],
  );

  return (
    <main className="page-shell">
      {!authChecked ? null : !authenticated ? (
        <section className="login-screen">
          <div className="login-shell">
            <section className="login-panel">
              <div className="login-brand">
                <div className="brand-mark">R</div>
                <div>
                  <p className="brand-title">Roster</p>
                  <small>IT Technician</small>
                </div>
              </div>

              <div className="login-copy">
                <p className="eyebrow">Access portal</p>
                <h1>Masuk ke dashboard</h1>
                <p>Kelola roster harian dan bulanan dengan kontrol akses yang sederhana.</p>
              </div>

              <form className="login-form" onSubmit={handleLoginSubmit} noValidate>
                <label className="login-field" htmlFor="username-input">
                  <span>Username</span>
                  <input
                    id="username-input"
                    value={loginForm.username}
                    onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
                    placeholder="admin"
                    autoComplete="username"
                    required
                  />
                </label>

                <label className="login-field" htmlFor="password-input">
                  <span>Password</span>
                  <div className="password-wrap">
                    <input
                      id="password-input"
                      type={showPassword ? 'text' : 'password'}
                      value={loginForm.password}
                      onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                      placeholder="Masukkan password"
                      autoComplete="current-password"
                      required
                    />
                    <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)}>
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>

                <button className="login-button" type="submit">Login</button>
                {loginError ? <p className="login-error" role="alert">{loginError}</p> : null}
              </form>
            </section>

            <aside className="login-aside">
              <div className="login-aside-card">
                <p className="eyebrow">Demo access</p>
                <h2>Credential sementara</h2>
                <ul className="credential-list">
                  <li><span>Username</span><strong>admin</strong></li>
                  <li><span>Password</span><strong>Admin123!</strong></li>
                </ul>
                <small>Ini hanya prototipe lokal dan akan diganti saat autentikasi backend atau database sudah tersedia.</small>
              </div>
            </aside>
          </div>
        </section>
      ) : (
        <div className="dashboard-shell">
          <aside className="sidebar">
            <div className="brand-wrap">
              <div className="brand-mark">R</div>
              <div>
                <p className="brand-title">Roster</p>
                <small>IT Technician</small>
              </div>
            </div>

            <nav className="sidebar-nav" aria-label="Navigation utama">
              {(['daily', 'monthly', 'activity'] as ActiveTab[]).map((tab) => (
                <button key={tab} type="button" className={activeTab === tab ? 'nav-button is-active' : 'nav-button'} onClick={() => setActiveTab(tab)}>
                  {tab === 'daily' ? 'Dashboard Harian' : tab === 'monthly' ? 'Roster Bulanan' : 'Daily Activity'}
                </button>
              ))}
            </nav>

            <div className="sidebar-card">
              <p className="card-kicker">Upload</p>
              <p className="card-copy">Pilih file Excel untuk memperbarui roster aktif.</p>
              <button type="button" className="primary-button" onClick={() => fileInputRef.current?.click()}>
                Upload Excel
              </button>
              <button type="button" className="reset-button" onClick={resetRoster} disabled={!activeRoster}>
                Reset data
              </button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" hidden onChange={handleFileUpload} />
            </div>

            <div className="sidebar-card">
              <p className="card-kicker">Legenda</p>
              <div className="legend-list">
                <span className="legend-badge pagi">PAGI</span>
                <span className="legend-badge siang">SIANG</span>
                <span className="legend-badge office">Office Hour</span>
                <span className="legend-badge empty">Libur</span>
              </div>
            </div>
          </aside>

          <main className="main-panel">
            <header className="topbar">
              <div>
                <p className="eyebrow">Monitoring Personel HPIO</p>
                <h1>Dashboard Roster IT HPIO</h1>
              </div>
              <div className="topbar-actions">
                <button type="button" className="secondary-button" onClick={() => window.print()}>Print</button>
                <button type="button" className="logout-button" onClick={handleLogout}>Logout</button>
              </div>
            </header>

            {uploadError ? <div className="form-alert error">{uploadError}</div> : null}

            {activeRoster && (
              <>
                <section className="summary-grid">
                  <article className="summary-card blue"><span>Personel aktif</span><strong>{activeRoster.personnel.length}</strong></article>
                  <article className="summary-card green"><span>Shift pagi</span><strong>{dailySummary.pagi}</strong></article>
                  <article className="summary-card amber"><span>Siang</span><strong>{dailySummary.siang}</strong></article>
                  <article className="summary-card purple"><span>Office hour</span><strong>{dailySummary.office}</strong></article>
                </section>

                <section className="work-hours-panel" aria-label="Informasi jam kerja">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Informasi</p>
                      <h2>INFORMASI JAM KERJA</h2>
                    </div>
                  </div>
                  <div className="work-hours-grid">
                    <div className="work-hours-item pagi"><span className="work-hours-label">PAGI</span><strong>06:00–15:00</strong></div>
                    <div className="work-hours-item siang"><span className="work-hours-label">SIANG</span><strong>13:00–22:00</strong></div>
                    <div className="work-hours-item office"><span className="work-hours-label">OFFICE HOUR</span><strong>08:00–17:00</strong></div>
                    <div className="work-hours-item empty"><span className="work-hours-label">LIBUR</span><strong>OFF Duty</strong></div>
                  </div>
                </section>
              </>
            )}

            {activeTab === 'daily' && activeRoster && (
              <section className="panel-box roster-panel">
                <div className="panel-header">
                  <div>
                    <p className="panel-kicker">Roster</p>
                    <h2>Dashboard Harian</h2>
                  </div>
                </div>

                <div className="toolbar-row">
                  <label className="field-wrap compact-field">
                    <span>Tanggal</span>
                    <select value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)}>
                      {activeRoster.dates.map((date) => (
                        <option key={date.key} value={date.key}>{date.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="field-wrap compact-field search-field">
                    <span>Cari</span>
                    <input value={searchTerm} placeholder="Cari personel" onChange={(event) => setSearchTerm(event.target.value)} />
                  </label>
                </div>

                <div className="table-scroll">
                  <table className="roster-table">
                    <thead>
                      <tr>
                        <th>Nama</th>
                        <th>Departemen</th>
                        <th>Jabatan</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPersonnel.map((person) => {
                        const status = person.schedule[selectedDate] ?? '';
                        return (
                          <tr key={person.id}>
                            <td>{person.name}</td>
                            <td>{person.department}</td>
                            <td>{person.position}</td>
                            <td><span className={`table-status ${getStatusClass(status)}`}>{status || 'Libur'}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {activeTab === 'monthly' && activeRoster && (
              <section className="panel-box roster-panel">
                <div className="panel-header">
                  <div>
                    <p className="panel-kicker">Roster</p>
                    <h2>Roster Bulanan</h2>
                  </div>
                </div>

                <div className="monthly-summary-grid">
                  <div className="stat-box"><span>Total</span><strong>{monthSummary.total}</strong></div>
                  <div className="stat-box"><span>PAGI</span><strong>{monthSummary.pagi}</strong></div>
                  <div className="stat-box"><span>SIANG</span><strong>{monthSummary.siang}</strong></div>
                  <div className="stat-box"><span>Office</span><strong>{monthSummary.office}</strong></div>
                </div>

                <div className="table-scroll large-table">
                  <table className="roster-table monthly-table">
                    <thead>
                      <tr>
                        <th>Nama</th>
                        <th>Departemen</th>
                        <th>Jabatan</th>
                        {activeRoster.dates.map((date) => (
                          <th key={date.key}>{date.dayName.slice(0, 3)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeRoster.personnel.map((person) => (
                        <tr key={person.id}>
                          <td>{person.name}</td>
                          <td>{person.department}</td>
                          <td>{person.position}</td>
                          {activeRoster.dates.map((date) => {
                            const status = person.schedule[date.key] ?? '';
                            return <td key={`${person.id}-${date.key}`}><span className={`table-status ${getStatusClass(status)}`}>{status || 'Libur'}</span></td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {activeTab === 'activity' && (
              <section className="panel-box activity-panel">
                {activityMode === 'list' && (
                  <>
                    <div className="panel-header">
                      <div>
                        <p className="panel-kicker">Daily Activity</p>
                        <h2>Daily Activity</h2>
                      </div>
                      <button type="button" className="primary-button" onClick={() => createActivityReportDraft()}>Create New Report</button>
                    </div>

                    <div className="activity-filters">
                      <label className="field-wrap compact-field">
                        <span>Report Date</span>
                        <input type="date" value={activityFilters.date} onChange={(event) => setActivityFilters((current) => ({ ...current, date: event.target.value }))} />
                      </label>
                      <label className="field-wrap compact-field">
                        <span>Personnel</span>
                        <input type="search" value={activityFilters.person} placeholder="Search person on duty" onChange={(event) => setActivityFilters((current) => ({ ...current, person: event.target.value }))} />
                      </label>
                      <label className="field-wrap compact-field">
                        <span>Shift</span>
                        <select value={activityFilters.shift} onChange={(event) => setActivityFilters((current) => ({ ...current, shift: event.target.value }))}>
                          <option value="">All</option>
                          {DAILY_ACTIVITY_SHIFT_OPTIONS.map((shift) => (
                            <option key={shift} value={shift}>{shift}</option>
                          ))}
                        </select>
                      </label>
                      <label className="field-wrap compact-field">
                        <span>Status</span>
                        <select value={activityFilters.status} onChange={(event) => setActivityFilters((current) => ({ ...current, status: event.target.value }))}>
                          <option value="">All</option>
                          {DAILY_ACTIVITY_STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="table-scroll">
                      <table className="daily-activity-table">
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
                          {dailyActivityVisibleReports.map((report) => (
                            <tr key={report.id}>
                              <td>{formatActivityDate(report.date)}</td>
                              <td>{report.personOnDuty || '—'}</td>
                              <td><span className={`shift-badge ${report.shift.toLowerCase().replace(/\s+/g, '-')}`}>{report.shift}</span></td>
                              <td>{report.events.length}</td>
                              <td>{report.notifications.length}</td>
                              <td><span className={`activity-status-badge ${getActivityStatusClass(report.status)}`}>{report.status}</span></td>
                              <td>
                                <div className="activity-actions">
                                  <button type="button" className="secondary-button compact-button" onClick={() => { setSelectedActivityId(report.id); setActivityMode('view'); }}>Open</button>
                                  <button type="button" className="secondary-button compact-button" onClick={() => createActivityReportDraft(report)}>Edit</button>
                                  <button type="button" className="secondary-button compact-button" onClick={() => printActivityReport(report.id)}>Print</button>
                                  <button type="button" className="danger-button compact-button" onClick={() => deleteActivityReport(report.id)}>Remove</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {activityMode === 'view' && activeReport && (
                  <>
                    <div className="panel-header">
                      <div>
                        <p className="panel-kicker">Daily Activity</p>
                        <h2>Report Detail</h2>
                      </div>
                      <div className="inline-actions">
                        <button type="button" className="secondary-button" onClick={() => setActivityMode('list')}>Back to Reports</button>
                        <button type="button" className="secondary-button" onClick={() => createActivityReportDraft(activeReport)}>Edit</button>
                        <button type="button" className="primary-button" onClick={() => printActivityReport(activeReport.id)}>Print Report</button>
                      </div>
                    </div>

                    <div className="activity-summary-grid">
                      <div className="activity-summary-box"><span>Date</span><strong>{formatActivityDate(activeReport.date)}</strong></div>
                      <div className="activity-summary-box"><span>Person on Duty</span><strong>{activeReport.personOnDuty || '—'}</strong></div>
                      <div className="activity-summary-box"><span>Shift</span><strong>{activeReport.shift}</strong></div>
                      <div className="activity-summary-box"><span>Status</span><strong>{activeReport.status}</strong></div>
                    </div>

                    <div className="activity-card">
                      <h3>Fault & Event Registration</h3>
                      <div className="table-scroll">
                        <table className="daily-activity-table">
                          <thead>
                            <tr>
                              <th>No.</th>
                              <th>Time</th>
                              <th>Report Person / Team</th>
                              <th>Event Location</th>
                              <th>Fault / Event Overview</th>
                              <th>Disposal Measures</th>
                              <th>Result</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeReport.events.map((event, index) => (
                              <tr key={event.id}>
                                <td>{index + 1}</td>
                                <td>{event.time || '—'}</td>
                                <td>{event.contact || '—'}</td>
                                <td>{event.location || '—'}</td>
                                <td>{event.overview || '—'}</td>
                                <td>{event.measures || '—'}</td>
                                <td>{event.result || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="activity-card">
                      <h3>Information Notification Record</h3>
                      <div className="table-scroll">
                        <table className="daily-activity-table">
                          <thead>
                            <tr>
                              <th>No.</th>
                              <th>Notifying Person / Team</th>
                              <th>Content</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeReport.notifications.map((notice, index) => (
                              <tr key={notice.id}>
                                <td>{index + 1}</td>
                                <td>{notice.person || '—'}</td>
                                <td>{notice.content || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="handover-overview">
                      <div className="handover-box">
                        <h3>Handover Record</h3>
                        <div className="handover-row"><span>Spare parts / tools complete?</span><strong>{activeReport.handover.sparePartsStatus || '—'}</strong></div>
                        <div className="handover-row"><span>Handover Matters</span><p>{activeReport.handover.handoverMatters || '—'}</p></div>
                      </div>
                      <div className="handover-box">
                        <div className="handover-grid">
                          <div><label>Handover Person</label><strong>{activeReport.handover.handoverPerson || '—'}</strong></div>
                          <div><label>Time</label><strong>{activeReport.handover.handoverTime || '—'}</strong></div>
                          <div><label>Takeover Person</label><strong>{activeReport.handover.takeoverPerson || '—'}</strong></div>
                          <div><label>Time</label><strong>{activeReport.handover.takeoverTime || '—'}</strong></div>
                          <div className="acknowledged-field"><label>Acknowledged by</label><strong>{activeReport.handover.acknowledgedBy || '—'}</strong></div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {activityMode === 'form' && activityDraft && (
                  <>
                    <div className="panel-header">
                      <div>
                        <p className="panel-kicker">Daily Activity</p>
                        <h2>{activityDraft.id ? 'Edit Report' : 'New Report'}</h2>
                      </div>
                      <div className="inline-actions">
                        <button type="button" className="secondary-button" onClick={() => setActivityMode('list')}>Back to Reports</button>
                        <button type="button" className="primary-button" onClick={saveActivityReport}>Save Report</button>
                      </div>
                    </div>

                    <div className="activity-form-grid">
                      <label className="field-wrap">
                        <span>Date</span>
                        <input type="date" value={activityDraft.date} onChange={(event) => setActivityDraft((current) => current ? { ...current, date: event.target.value } : current)} required />
                      </label>
                      <label className="field-wrap">
                        <span>Person On Duty</span>
                        <input type="text" value={activityDraft.personOnDuty} onChange={(event) => setActivityDraft((current) => current ? { ...current, personOnDuty: event.target.value } : current)} placeholder="Nama pegawai" />
                      </label>
                      <label className="field-wrap">
                        <span>Shift</span>
                        <select value={activityDraft.shift} onChange={(event) => setActivityDraft((current) => current ? { ...current, shift: event.target.value as DailyActivityShift } : current)}>
                          {DAILY_ACTIVITY_SHIFT_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </label>
                      <label className="field-wrap">
                        <span>Status</span>
                        <select value={activityDraft.status} onChange={(event) => setActivityDraft((current) => current ? { ...current, status: event.target.value as DailyActivityStatus } : current)}>
                          {DAILY_ACTIVITY_STATUS_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="activity-card">
                      <h3>Fault & Event Registration</h3>
                      {activityDraft.events.map((event, index) => (
                        <div key={event.id} className="event-editor-row">
                          <div className="event-editor-grid">
                            <label className="field-wrap"><span>Time</span><input value={event.time} onChange={(e) => setActivityDraft((current) => current ? { ...current, events: current.events.map((item) => item.id === event.id ? { ...item, time: e.target.value } : item) } : current)} /></label>
                            <label className="field-wrap"><span>Contact</span><input value={event.contact} onChange={(e) => setActivityDraft((current) => current ? { ...current, events: current.events.map((item) => item.id === event.id ? { ...item, contact: e.target.value } : item) } : current)} /></label>
                            <label className="field-wrap"><span>Location</span><input value={event.location} onChange={(e) => setActivityDraft((current) => current ? { ...current, events: current.events.map((item) => item.id === event.id ? { ...item, location: e.target.value } : item) } : current)} /></label>
                            <label className="field-wrap"><span>Overview</span><input value={event.overview} onChange={(e) => setActivityDraft((current) => current ? { ...current, events: current.events.map((item) => item.id === event.id ? { ...item, overview: e.target.value } : item) } : current)} /></label>
                            <label className="field-wrap"><span>Measures</span><input value={event.measures} onChange={(e) => setActivityDraft((current) => current ? { ...current, events: current.events.map((item) => item.id === event.id ? { ...item, measures: e.target.value } : item) } : current)} /></label>
                            <label className="field-wrap"><span>Result</span><input value={event.result} onChange={(e) => setActivityDraft((current) => current ? { ...current, events: current.events.map((item) => item.id === event.id ? { ...item, result: e.target.value } : item) } : current)} /></label>
                          </div>
                          <button type="button" className="secondary-button compact-button" onClick={() => setActivityDraft((current) => current ? { ...current, events: current.events.length > 1 ? current.events.filter((item) => item.id !== event.id) : [createEmptyActivityEvent()] } : current)}>Remove</button>
                        </div>
                      ))}
                      <button type="button" className="secondary-button compact-button" onClick={() => setActivityDraft((current) => current ? { ...current, events: [...current.events, createEmptyActivityEvent()] } : current)}>Add Event</button>
                    </div>

                    <div className="activity-card">
                      <h3>Information Notification Record</h3>
                      {activityDraft.notifications.map((notice, index) => (
                        <div key={notice.id} className="event-editor-row">
                          <div className="event-editor-grid single-row">
                            <label className="field-wrap"><span>Person</span><input value={notice.person} onChange={(e) => setActivityDraft((current) => current ? { ...current, notifications: current.notifications.map((item) => item.id === notice.id ? { ...item, person: e.target.value } : item) } : current)} /></label>
                            <label className="field-wrap"><span>Content</span><input value={notice.content} onChange={(e) => setActivityDraft((current) => current ? { ...current, notifications: current.notifications.map((item) => item.id === notice.id ? { ...item, content: e.target.value } : item) } : current)} /></label>
                          </div>
                          <button type="button" className="secondary-button compact-button" onClick={() => setActivityDraft((current) => current ? { ...current, notifications: current.notifications.length > 1 ? current.notifications.filter((item) => item.id !== notice.id) : [createEmptyActivityNotification()] } : current)}>Remove</button>
                        </div>
                      ))}
                      <button type="button" className="secondary-button compact-button" onClick={() => setActivityDraft((current) => current ? { ...current, notifications: [...current.notifications, createEmptyActivityNotification()] } : current)}>Add Notification</button>
                    </div>

                    <div className="activity-card">
                      <h3>Handover Note</h3>
                      <div className="handover-grid form-grid">
                        <label className="field-wrap"><span>Spare parts complete?</span><select value={activityDraft.handover.sparePartsStatus} onChange={(event) => setActivityDraft((current) => current ? { ...current, handover: { ...current.handover, sparePartsStatus: event.target.value as 'Yes' | 'No' | '' } } : current)}><option value="">—</option><option value="Yes">Yes</option><option value="No">No</option></select></label>
                        <label className="field-wrap"><span>Handover Person</span><input value={activityDraft.handover.handoverPerson} onChange={(event) => setActivityDraft((current) => current ? { ...current, handover: { ...current.handover, handoverPerson: event.target.value } } : current)} /></label>
                        <label className="field-wrap"><span>Takeover Person</span><input value={activityDraft.handover.takeoverPerson} onChange={(event) => setActivityDraft((current) => current ? { ...current, handover: { ...current.handover, takeoverPerson: event.target.value } } : current)} /></label>
                        <label className="field-wrap"><span>Handover Matters</span><input value={activityDraft.handover.handoverMatters} onChange={(event) => setActivityDraft((current) => current ? { ...current, handover: { ...current.handover, handoverMatters: event.target.value } } : current)} /></label>
                        <label className="field-wrap"><span>Handover Time</span><input type="time" value={activityDraft.handover.handoverTime} onChange={(event) => setActivityDraft((current) => current ? { ...current, handover: { ...current.handover, handoverTime: event.target.value } } : current)} /></label>
                        <label className="field-wrap"><span>Takeover Time</span><input type="time" value={activityDraft.handover.takeoverTime} onChange={(event) => setActivityDraft((current) => current ? { ...current, handover: { ...current.handover, takeoverTime: event.target.value } } : current)} /></label>
                        <label className="field-wrap"><span>Acknowledged by</span><input value={activityDraft.handover.acknowledgedBy} onChange={(event) => setActivityDraft((current) => current ? { ...current, handover: { ...current.handover, acknowledgedBy: event.target.value } } : current)} /></label>
                      </div>
                    </div>
                  </>
                )}
              </section>
            )}

            {!activeRoster && (
              <div className="empty-state">Belum ada data roster. Silakan upload file Excel manual.</div>
            )}
          </main>
        </div>
      )}
    </main>
  );
}
