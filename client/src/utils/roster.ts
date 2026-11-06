import * as XLSX from 'xlsx';
import type { DateInfo, PersonnelRow, RosterData, Status } from '../types';
import { createDateFromValue, formatDateKey, formatDateLabel, formatDayName } from './date';

export const getStatusClass = (status: Status): string => {
  if (status === 'PAGI') return 'pagi';
  if (status === 'SIANG') return 'siang';
  if (status === 'Office Hour') return 'office';
  return 'empty';
};

export const normalizeStatusText = (status: Status): string => (status === '' ? 'Libur' : status);

const parseStatus = (rawValue: unknown): { status: Status; unknown: boolean; raw: string } => {
  const rawString = String(rawValue ?? '').trim();
  if (!rawString) return { status: '', unknown: false, raw: '' };

  const normalized = rawString.replace(/\s+/g, ' ');
  const upper = normalized.toUpperCase();

  if (upper === 'PAGI') return { status: 'PAGI', unknown: false, raw: normalized };
  if (upper === 'SIANG') return { status: 'SIANG', unknown: false, raw: normalized };
  if (upper === 'OFFICE HOUR') return { status: 'Office Hour', unknown: false, raw: normalized };
  return { status: '', unknown: true, raw: normalized };
};

export const getSummaryCounts = (dateKey: string, roster: RosterData) => {
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

export const getMonthlySummary = (roster: RosterData) => {
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

/** Parser Excel yang sama dengan versi statis: baris 2 = tanggal, personel mulai baris 4. */
export const parseRosterExcel = (buffer: ArrayBuffer, filename: string): RosterData => {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('File Excel tidak memiliki sheet yang valid.');

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, blankrows: true }) as Array<Array<unknown>>;
  if (!rows.length) throw new Error('Sheet Excel kosong atau tidak dapat dibaca.');

  const monthLabel = String(rows[1]?.[0] ?? rows[3]?.[2] ?? '').trim() || 'Roster';
  const dateRow = rows[1] ?? [];
  const dateStartIndex = dateRow.findIndex((value) => {
    if (value == null || value === '') return false;
    if (value instanceof Date) return !Number.isNaN(value.getTime());
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
    dates.push({ key: formatDateKey(date), label: formatDateLabel(date), dayName: formatDayName(date) });
  }
  if (!dates.length) throw new Error('Tidak ada tanggal valid yang terdeteksi dari file roster.');

  const personnel: PersonnelRow[] = [];
  for (let rowIndex = 3; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row || row.length === 0) continue;
    const name = String(row[0] ?? '').trim();
    if (!name) continue;

    const schedule: Record<string, Status> = {};
    dates.forEach((dateInfo, dateIndex) => {
      const parsed = parseStatus(row[dateStartIndex + dateIndex] ?? '');
      if (parsed.unknown) warnings.push(`Status tidak dikenal "${parsed.raw}" untuk ${name} pada ${dateInfo.label}.`);
      schedule[dateInfo.key] = parsed.status;
    });

    personnel.push({
      name,
      department: String(row[1] ?? '').trim(),
      position: String(row[2] ?? '').trim(),
      schedule,
    });
  }
  if (!personnel.length) throw new Error('Tidak ada data personel yang tersedia. Struktur file tidak sesuai.');

  return {
    filename,
    monthLabel,
    dates,
    personnel,
    warnings,
    periodLabel: `${dates[0].label} - ${dates[dates.length - 1].label}`,
  };
};

