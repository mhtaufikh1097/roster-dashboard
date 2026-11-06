<script setup lang="ts">
import { computed } from 'vue';
import type { Personnel } from '../types';

const props = defineProps<{
  modelValue: number[];
  options: Personnel[];
  lockedId?: number | null;
  placeholder?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: number[]];
}>();

const isSelected = (id: number): boolean => props.modelValue.includes(id);

const toggle = (id: number): void => {
  if (props.lockedId === id && isSelected(id)) return;
  if (isSelected(id)) {
    emit(
      'update:modelValue',
      props.modelValue.filter((item) => item !== id),
    );
  } else {
    emit('update:modelValue', [...props.modelValue, id]);
  }
};

const selectedNames = computed(() =>
  props.modelValue
    .map((id) => props.options.find((p) => p.id === id)?.name)
    .filter((name): name is string => !!name),
);
</script>

<template>
  <div class="multi-person-picker">
    <div class="multi-person-summary">
      <strong v-if="selectedNames.length">{{ selectedNames.join(', ') }}</strong>
      <span v-else class="field-hint">{{ placeholder || 'Pilih 1 atau lebih personel...' }}</span>
      <span v-if="selectedNames.length" class="multi-count-badge">{{ selectedNames.length }} orang</span>
    </div>
    <div class="multi-person-chips">
      <button
        v-for="person in options"
        :key="person.id"
        type="button"
        class="person-chip"
        :class="{ 'is-selected': isSelected(person.id), 'is-locked': lockedId === person.id }"
        @click="toggle(person.id)"
      >
        <span class="chip-check">{{ isSelected(person.id) ? '✓' : '+' }}</span>
        <span>{{ person.name }}</span>
      </button>
    </div>
  </div>
</template>

