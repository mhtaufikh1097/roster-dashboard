import { nextTick, reactive } from 'vue';
import type { ActivityReport } from './types';

export const printStore = reactive({ reports: [] as ActivityReport[] });

/** Cetak satu atau banyak laporan; tiap laporan satu halaman A4 dengan format yang sama. */
export const printReports = async (reports: ActivityReport[]): Promise<void> => {
  if (!reports.length) return;
  printStore.reports = reports;
  await nextTick();
  window.print();
};

window.addEventListener('afterprint', () => {
  printStore.reports = [];
});

