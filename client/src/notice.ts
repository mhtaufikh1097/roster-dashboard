import { reactive } from 'vue';

type NoticeType = 'error' | 'warning' | 'success' | '';

export const notice = reactive({ message: '', type: '' as NoticeType });

let timer: number | undefined;

export const setNotice = (message: string, type: NoticeType = 'success'): void => {
  notice.message = message;
  notice.type = type;
  window.clearTimeout(timer);
  if (message) timer = window.setTimeout(() => (notice.message = ''), 6000);
};

