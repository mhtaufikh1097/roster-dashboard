<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { api } from '../api';
import { setNotice } from '../notice';
import { rosterStore } from '../rosterStore';
import type { Personnel } from '../types';

const list = ref<Personnel[]>([]);
const form = reactive({ name: '', department: '', position: '' });
const editingId = ref<number | null>(null);
const edit = reactive({ name: '', department: '', position: '' });

const load = async (): Promise<void> => {
  list.value = await api<Personnel[]>('GET', '/personnel?all=true');
};
onMounted(() => void load().catch((e) => setNotice(e.message, 'error')));

const refreshAll = async (): Promise<void> => {
  await load();
  await rosterStore.loadPersonnel();
  await rosterStore.load();
};

const add = async (): Promise<void> => {
  if (!form.name.trim()) return setNotice('Nama personel wajib diisi.', 'error');
  try {
    await api('POST', '/personnel', { ...form });
    form.name = form.department = form.position = '';
    setNotice('Personel ditambahkan.', 'success');
    await refreshAll();
  } catch (e) {
    setNotice(e instanceof Error ? e.message : 'Gagal menambah personel.', 'error');
  }
};

const startEdit = (p: Personnel): void => {
  editingId.value = p.id;
  Object.assign(edit, { name: p.name, department: p.department, position: p.position });
};

const saveEdit = async (): Promise<void> => {
  try {
    await api('PUT', `/personnel/${editingId.value}`, { ...edit });
    editingId.value = null;
    setNotice('Personel diperbarui.', 'success');
    await refreshAll();
  } catch (e) {
    setNotice(e instanceof Error ? e.message : 'Gagal menyimpan.', 'error');
  }
};

const toggleActive = async (p: Personnel): Promise<void> => {
  try {
    await api('PUT', `/personnel/${p.id}`, { isActive: !p.isActive });
    await refreshAll();
  } catch (e) {
    setNotice(e instanceof Error ? e.message : 'Gagal mengubah status.', 'error');
  }
};
</script>

<template>
  <div class="admin-block">
    <form class="admin-inline-form" @submit.prevent="add">
      <label class="field-wrap compact-field"><span>Nama</span><input v-model="form.name" type="text" required /></label>
      <label class="field-wrap compact-field"><span>Departemen</span><input v-model="form.department" type="text" /></label>
      <label class="field-wrap compact-field"><span>Jabatan</span><input v-model="form.position" type="text" /></label>
      <button type="submit" class="primary-button">Tambah Personel</button>
    </form>

    <div class="table-scroll">
      <table class="daily-activity-table">
        <thead><tr><th>Nama</th><th>Departemen</th><th>Jabatan</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>
          <tr v-for="p in list" :key="p.id">
            <template v-if="editingId === p.id">
              <td><input v-model="edit.name" type="text" /></td>
              <td><input v-model="edit.department" type="text" /></td>
              <td><input v-model="edit.position" type="text" /></td>
              <td>{{ p.isActive ? 'Aktif' : 'Nonaktif' }}</td>
              <td>
                <div class="activity-actions">
                  <button type="button" class="primary-button compact-button" @click="saveEdit">Simpan</button>
                  <button type="button" class="secondary-button compact-button" @click="editingId = null">Batal</button>
                </div>
              </td>
            </template>
            <template v-else>
              <td>{{ p.name }}</td>
              <td>{{ p.department }}</td>
              <td>{{ p.position }}</td>
              <td>{{ p.isActive ? 'Aktif' : 'Nonaktif' }}</td>
              <td>
                <div class="activity-actions">
                  <button type="button" class="secondary-button compact-button" @click="startEdit(p)">Edit</button>
                  <button type="button" class="secondary-button compact-button" @click="toggleActive(p)">
                    {{ p.isActive ? 'Nonaktifkan' : 'Aktifkan' }}
                  </button>
                </div>
              </td>
            </template>
          </tr>
          <tr v-if="!list.length"><td colspan="5">Belum ada personel.</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

