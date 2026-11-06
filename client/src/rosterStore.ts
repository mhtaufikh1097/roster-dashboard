import { reactive } from 'vue';
import { api, ApiError } from './api';
import type { AuthUser, DailyActivityShift, Personnel, RosterData, Status } from './types';
import { getCurrentDateKey, toDateInfo } from './utils/date';
import { getStatusClass, normalizeStatusText } from './utils/roster';

type RosterResponse = {
  id: number;
  filename: string;
  monthLabel: string;
  updatedAt: string;
  dates: string[];
  personnel: RosterData['personnel'];
};

export const toRosterData = (payload: RosterResponse): RosterData => {
  const dates = payload.dates.map(toDateInfo);
  return {
    id: payload.id,
    filename: payload.filename,
    monthLabel: payload.monthLabel,
    updatedAt: payload.updatedAt,
    dates,
    personnel: payload.personnel,
    warnings: [],
    periodLabel: dates.length ? `${dates[0].label} - ${dates[dates.length - 1].label}` : '--',
  };
};

export const rosterStore = reactive({
  active: null as RosterData | null,
  loading: false,
  error: '',
  selectedDate: '',
  searchTerm: '',
  personnel: [] as Personnel[],

  async load(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      this.active = toRosterData(await api<RosterResponse>('GET', '/roster/active'));
      const today = getCurrentDateKey();
      const keys = this.active.dates.map((d) => d.key);
      if (!keys.includes(this.selectedDate)) {
        this.selectedDate = keys.includes(today) ? today : (keys[0] ?? '');
      }
    } catch (error) {
      this.active = null;
      if (!(error instanceof ApiError && error.status === 404)) {
        this.error = error instanceof Error ? error.message : 'Gagal memuat roster.';
      }
    } finally {
      this.loading = false;
    }
  },

  async loadPersonnel(): Promise<void> {
    this.personnel = await api<Personnel[]>('GET', '/personnel');
  },
});

export type UserShiftInfo = {
  status: Status;
  label: string;
  hours: string;
  tone: string;
  dateKey: string;
  dateLabel: string;
  activityShift: DailyActivityShift;
};

const getHoursForStatus = (status: Status): string => {
  if (status === 'PAGI') return '06:00–15:00';
  if (status === 'SIANG') return '13:00–22:00';
  if (status === 'Office Hour') return '08:00–17:00';
  return 'OFF Duty';
};

const toActivityShift = (status: Status): DailyActivityShift => {
  if (status === 'PAGI') return 'Pagi';
  if (status === 'SIANG') return 'Siang';
  if (status === 'Office Hour') return 'Office Hour';
  return 'Libur';
};

export const getUserShiftInfo = (user: AuthUser | null, customDateKey?: string): UserShiftInfo | null => {
  if (!user || user.role !== 'user' || !rosterStore.active) return null;
  const roster = rosterStore.active;
  const today = getCurrentDateKey();
  const dateKey =
    customDateKey && roster.dates.some((d) => d.key === customDateKey)
      ? customDateKey
      : roster.dates.some((d) => d.key === today)
        ? today
        : rosterStore.selectedDate || roster.dates[0]?.key || '';

  if (!dateKey) return null;

  const personRow = roster.personnel.find(
    (p) =>
      (user.personnelId && p.id === user.personnelId) ||
      p.name.toLowerCase() === (user.fullName || user.username).trim().toLowerCase(),
  );
  if (!personRow) return null;

  const status: Status = personRow.schedule[dateKey] ?? '';
  const dateObj = roster.dates.find((d) => d.key === dateKey);

  return {
    status,
    label: normalizeStatusText(status),
    hours: getHoursForStatus(status),
    tone: getStatusClass(status),
    dateKey,
    dateLabel: dateObj?.label ?? dateKey,
    activityShift: toActivityShift(status),
  };
};
