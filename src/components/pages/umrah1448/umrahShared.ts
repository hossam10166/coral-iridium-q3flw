import {
  AccountingDB,
  Lang,
  TransportEntry,
  UmrahAgent,
  UmrahArrivalStatus,
  UmrahFieldCity,
  UmrahFieldStaff,
  UmrahFlight,
  UmrahFlightStatus,
  UmrahGroup,
  UmrahGroupStatus,
  UmrahPilgrim,
  UmrahProgramType,
  UmrahShiftStatus,
  UmrahStaffRole,
  UmrahVisaStatus,
} from '../../../types/accounting';
import { ConfirmConfig } from '../../AccountingUI';

export type UmrahModuleTab =
  | 'agents'
  | 'groups'
  | 'pilgrims'
  | 'visas'
  | 'flights'
  | 'hotels'
  | 'transport'
  | 'staff'
  | 'arrivals'
  | 'reports'
  | 'archive';

export interface UmrahSharedProps {
  db: AccountingDB;
  lang: Lang;
  onSaveAgent: (item: UmrahAgent, isEdit: boolean) => Promise<void>;
  onDeleteAgent: (id: number) => Promise<void>;
  onSaveGroup: (item: UmrahGroup, isEdit: boolean) => Promise<void>;
  onDeleteGroup: (id: number) => Promise<void>;
  onSavePilgrim: (item: UmrahPilgrim, isEdit: boolean) => Promise<void>;
  onImportPilgrims: (items: UmrahPilgrim[]) => Promise<void>;
  onDeletePilgrim: (id: number) => Promise<void>;
  onSaveFlight: (item: UmrahFlight, isEdit: boolean) => Promise<void>;
  onDeleteFlight: (id: number) => Promise<void>;
  onSaveFieldStaff: (item: UmrahFieldStaff, isEdit: boolean) => Promise<void>;
  onDeleteFieldStaff: (id: number) => Promise<void>;
  onSaveTransport: (item: TransportEntry, isEdit: boolean) => Promise<void>;
  onDeleteTransport: (id: number) => Promise<void>;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
  onConfirm: (cfg: ConfirmConfig) => void;
}

export const UMRAH_PROGRAM_LABELS: Record<UmrahProgramType, { ar: string; en: string }> = {
  umrah: { ar: 'عمرة 1448', en: 'Umrah 1448' },
  hajj: { ar: 'حج 1448', en: 'Hajj 1448' },
};

export const UMRAH_GROUP_STATUS: Record<UmrahGroupStatus, { ar: string; en: string; cls: string }> = {
  planning: { ar: 'تجهيز وتعاقد', en: 'Planning', cls: 'bg-slate-100 text-slate-700' },
  visas_processing: { ar: 'إصدار التأشيرات', en: 'Visas Processing', cls: 'bg-blue-50 text-[#1d4ed8]' },
  in_ksa: { ar: 'داخل المملكة', en: 'In KSA', cls: 'bg-amber-50 text-amber-800' },
  completed: { ar: 'مكتملة', en: 'Completed', cls: 'bg-teal-50 text-[#0f766e]' },
  archived: { ar: 'مؤرشفة', en: 'Archived', cls: 'bg-slate-200 text-slate-600' },
};

export const UMRAH_VISA_STATUS: Record<UmrahVisaStatus, { ar: string; en: string; cls: string }> = {
  draft: { ar: 'مسودة', en: 'Draft', cls: 'bg-slate-100 text-slate-700' },
  submitted: { ar: 'مرفوعة للمنصة', en: 'Submitted', cls: 'bg-blue-50 text-[#1d4ed8]' },
  issued: { ar: 'صادرة', en: 'Issued', cls: 'bg-teal-50 text-[#0f766e]' },
  rejected: { ar: 'مرفوضة', en: 'Rejected', cls: 'bg-red-50 text-red-700' },
  cancelled: { ar: 'ملغاة', en: 'Cancelled', cls: 'bg-amber-50 text-amber-800' },
};

export const UMRAH_ARRIVAL_STATUS: Record<UmrahArrivalStatus, { ar: string; en: string; cls: string }> = {
  pending: { ar: 'بانتظار الوصول', en: 'Pending Arrival', cls: 'bg-slate-100 text-slate-700' },
  arrived: { ar: 'وصل للمملكة', en: 'Arrived', cls: 'bg-teal-50 text-[#0f766e]' },
  departed: { ar: 'غادر بسلامة الله', en: 'Departed', cls: 'bg-blue-50 text-[#1d4ed8]' },
};

export const UMRAH_FLIGHT_STATUS: Record<UmrahFlightStatus, { ar: string; en: string; cls: string }> = {
  scheduled: { ar: 'مجدولة', en: 'Scheduled', cls: 'bg-slate-100 text-slate-700' },
  landed: { ar: 'هبطت / وصلت', en: 'Landed', cls: 'bg-teal-50 text-[#0f766e]' },
  delayed: { ar: 'متأخرة', en: 'Delayed', cls: 'bg-amber-50 text-amber-800' },
  departed: { ar: 'أقلعت / غادرت', en: 'Departed', cls: 'bg-blue-50 text-[#1d4ed8]' },
  cancelled: { ar: 'ملغاة', en: 'Cancelled', cls: 'bg-red-50 text-red-700' },
};

export const UMRAH_STAFF_ROLES: Record<UmrahStaffRole, { ar: string; en: string }> = {
  supervisor: { ar: 'مشرف مجموعة', en: 'Group Supervisor' },
  delegate: { ar: 'مندوب ميداني / مطار', en: 'Field / Airport Delegate' },
  driver_coord: { ar: 'منسق نقل وحافلات', en: 'Bus & Transport Coordinator' },
};

export const UMRAH_FIELD_CITIES: Record<UmrahFieldCity, { ar: string; en: string }> = {
  makkah: { ar: 'مكة المكرمة', en: 'Makkah' },
  madinah: { ar: 'المدينة المنورة', en: 'Madinah' },
  jeddah: { ar: 'جدة', en: 'Jeddah' },
  airport: { ar: 'المطار / المنافذ', en: 'Airport / Terminals' },
};

export const UMRAH_SHIFT_STATUS: Record<UmrahShiftStatus, { ar: string; en: string; cls: string }> = {
  on_duty: { ar: 'في الخدمة', en: 'On Duty', cls: 'bg-teal-50 text-[#0f766e]' },
  standby: { ar: 'احتياط / جاهز', en: 'Standby', cls: 'bg-amber-50 text-amber-800' },
  off_duty: { ar: 'إجازة / منتهي', en: 'Off Duty', cls: 'bg-slate-100 text-slate-600' },
};
