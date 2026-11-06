<script setup lang="ts">
import { computed, ref } from 'vue';
import { api } from '../api';
import { printReports } from '../printStore';
import { rosterStore } from '../rosterStore';
import { setNotice } from '../notice';
import type { ActivityReport } from '../types';
import { formatActivityDate, getCurrentDateKey, shiftDateKey } from '../utils/date';

const emit = defineEmits<{ close: [] }>();

type Preset = '3' | '7' | '30' | 'month' | 'custom';

const today = getCurrentDateKey();
const preset = ref<Preset>('7');
const customFrom = ref(shiftDateKey(today, -6));
const customTo = ref(today);
const personnelId = ref<number | ''>('');
const onlyAcknowledged = ref(false);
const busy = ref(false);

const range = computed((): { from: string; to: string } => {
  if (preset.value === 'custom') return { from: customFrom.value, to: customTo.value };
  if (preset.value === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  return { from: shiftDateKey(today, -(Number(preset.value) - 1)), to: today };
});

const rangeLabel = computed(() => `${formatActivityDate(range.value.from)} – ${formatActivityDate(range.value.to)}`);
const rangeValid = computed(() => !!range.value.from && !!range.value.to && range.value.from <= range.value.to);

const doPrint = async (): Promise<void> => {
  if (!rangeValid.value) {
    setNotice('Rentang tanggal tidak valid.', 'error');
    return;
  }
  busy.value = true;
  try {
    const query = new URLSearchParams({ from: range.value.from, to: range.value.to });
    if (personnelId.value !== '') query.set('personnelId', String(personnelId.value));
    let reports = await api<ActivityReport[]>('GET', `/activity?${query.toString()}`);
    if (onlyAcknowledged.value) reports = reports.filter((r) => r.status === 'Reviewed' || r.status === 'Closed');
    if (!reports.length) {
      setNotice('Tidak ada laporan pada periode tersebut.', 'warning');
      return;
    }
    emit('close');
    await printReports(reports);
  } catch (e) {
    setNotice(e instanceof Error ? e.message : 'Gagal menyiapkan cetakan.', 'error');
  } finally {
    busy.value = false;
  }
};
</script>

<template>
  <div class="modal" aria-hidden="false">
    <div class="modal-card">
      <div class="modal-header">
        <h2>Print Period</h2>
        <button type="button" class="close-button" aria-label="Tutup" @click="emit('close')">×</button>
      </div>

      <div class="modal-content">
        <div class="activity-form-grid">
          <label class="field-wrap">
            <span>Periode</span>
            <select v-model="preset">
              <option value="3">3 hari terakhir</option>
              <option value="7">7 hari terakhir</option>
              <option value="30">30 hari terakhir</option>
              <option value="month">Bulan ini</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label class="field-wrap">
            <span>Personel</span>
            <select v-model="personnelId">
              <option value="">Semua personel</option>
              <option v-for="p in rosterStore.personnel" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </label>
        </div>

        <div v-if="preset === 'custom'" class="activity-form-grid">
          <label class="field-wrap"><span>Dari</span><input v-model="customFrom" type="date" /></label>
          <label class="field-wrap"><span>Sampai</span><input v-model="customTo" type="date" /></label>
        </div>

        <label class="check-row">
          <input v-model="onlyAcknowledged" type="checkbox" />
          Hanya laporan yang sudah di-acknowledge supervisor (Reviewed / Closed)
        </label>

        <p class="field-hint">Rentang: <strong>{{ rangeLabel }}</strong>. Satu laporan dicetak per halaman A4.</p>
      </div>

      <div class="modal-actions">
        <button type="button" class="secondary-button" @click="emit('close')">Batal</button>
        <button type="button" class="primary-button" :disabled="busy || !rangeValid" @click="doPrint">
          {{ busy ? 'Menyiapkan...' : 'Print' }}
        </button>
      </div>
    </div>
  </div>
</template>

