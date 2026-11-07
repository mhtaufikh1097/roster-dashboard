export type Role = 'admin' | 'supervisor' | 'user';
export type Status = 'PAGI' | 'SIANG' | 'Office Hour' | '';
export type DailyActivityShift = 'Pagi' | 'Siang' | 'Office Hour' | 'Libur';
export type DailyActivityStatus = 'Draft' | 'Submitted' | 'Reviewed' | 'Closed';

export type AuthUser = {
  id: number;
  username: string;
  fullName: string;
  position?: string;
  role: Role;
  personnelId: number | null;
};

export type DateInfo = { key: string; label: string; dayName: string };

export type PersonnelRow = {
  id?: number;
  name: string;
  department: string;
  position: string;
  schedule: Record<string, Status>;
};

export type RosterData = {
  id?: number;
  filename: string;
  monthLabel: string;
  dates: DateInfo[];
  personnel: PersonnelRow[];
  warnings: string[];
  periodLabel: string;
  updatedAt?: string;
};

export type Personnel = { id: number; name: string; department: string; position: string; isActive: boolean };

export type ManagedUser = {
  id: number;
  username: string;
  fullName: string;
  position: string;
  role: Role;
  personnelId: number | null;
  personnelName: string | null;
  isActive: boolean;
};

export type RosterPeriod = {
  id: number;
  monthLabel: string;
  filename: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  updatedAt: string;
};

export type ActivityEvent = {
  id: string;
  time: string;
  contact: string;
  location: string;
  overview: string;
  measures: string;
  result: string;
};

export type ActivityNotification = { id: string; person: string; content: string };

export type ActivityHandover = {
  sparePartsStatus: 'Yes' | 'No' | '';
  handoverPersonnelId: number | null;
  handoverPersonnelIds: number[];
  handoverPerson: string;
  takeoverPersonnelId: number | null;
  takeoverPersonnelIds: number[];
  takeoverPerson: string;
  handoverMatters: string;
  handoverTime: string;
  takeoverTime: string;
  acknowledgedBy: string;
  acknowledgedAt: string | null;
};

export type ActivityReport = {
  id: string;
  date: string;
  dutyPersonnelId: number | null;
  dutyPersonnelIds: number[];
  personOnDuty: string;
  shift: DailyActivityShift;
  status: DailyActivityStatus;
  createdBy: number | null;
  updatedAt?: string;
  events: ActivityEvent[];
  notifications: ActivityNotification[];
  handover: ActivityHandover;
};

export type AuditAction = 'LOGIN' | 'LOGOUT' | 'EDIT' | 'DELETE';

export type AuditLogItem = {
  id: number;
  userId: number | null;
  username: string;
  fullName: string;
  role: Role;
  action: AuditAction;
  module: string;
  description: string;
  createdAt: string;
};

export type AuditLogResponse = {
  items: AuditLogItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};
