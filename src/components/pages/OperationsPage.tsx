import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  CheckCircle2,
  Download,
  Edit3,
  FileSpreadsheet,
  FileText,
  Filter,
  Plus,
  Printer,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  AccountingDB,
  CycleOperation,
  CycleStageKey,
  CycleStatus,
  HOTEL_SUGGESTIONS,
  Lang,
  STAGES,
  STATUS_LABELS,
  VEHICLE_TYPES,
  safeDocId,
} from '../../types/accounting';
import { bi } from '../../i18n/translations';
import { useAuth } from '../../contexts/AuthContext';
import { formatTime24, getPartyNames, normalizeTime24, sumBy, toWestDigits, today } from '../../utils/calculations';
import {
  ConfirmConfig,
  EmptyRow,
  KpiCard,
  Panel,
  Time24Input,
  btnDangerCls,
  btnPrimaryCls,
  btnSecondaryCls,
  btnSoftBlueCls,
  btnSoftRedCls,
  btnTealCls,
  inputCls,
  labelCls,
} from '../AccountingUI';

interface OperationsPageProps {
  db: AccountingDB;
  lang: Lang;
  initialGroup?: string | null;
  onConsumeInitialGroup?: () => void;
  onSaveOperation: (item: CycleOperation, isEdit: boolean) => Promise<void>;
  onImportOperations: (items: CycleOperation[], mode: 'append' | 'replace') => Promise<void>;
  onDeleteOperation: (id: string) => Promise<void>;
  onDeleteOperationsBatch?: (ids: string[]) => Promise<void>;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
  onConfirm: (cfg: ConfirmConfig) => void;
}

type OpsFilterCol =
  | 'groupNo'
  | 'agentName'
  | 'totalPax'
  | 'totalBus'
  | 'date'
  | 'direction'
  | 'fromLocation'
  | 'toLocation'
  | 'hotelName'
  | 'time'
  | 'driverPhone';

interface OpsFilterOptionItem {
  key: string;
  label: string;
  count: number;
  sortVal: string | number;
}

const OPS_FILTER_COLS: { col: OpsFilterCol; label: string; numeric?: boolean }[] = [
  { col: 'groupNo', label: 'GROUP NO' },
  { col: 'agentName', label: 'AGENT NAME' },
  { col: 'totalPax', label: 'Total Pax', numeric: true },
  { col: 'totalBus', label: 'TOTAL BUS', numeric: true },
  { col: 'date', label: 'DATE' },
  { col: 'direction', label: 'Direction' },
  { col: 'fromLocation', label: 'From' },
  { col: 'toLocation', label: 'To' },
  { col: 'hotelName', label: 'Hotel' },
  { col: 'time', label: 'Time' },
  { col: 'driverPhone', label: 'Driver number' },
];

const OPS_FILTER_LABELS: Record<OpsFilterCol, string> = {
  groupNo: 'GROUP NO',
  agentName: 'AGENT NAME',
  totalPax: 'Total Pax',
  totalBus: 'TOTAL BUS',
  date: 'DATE',
  direction: 'Direction',
  fromLocation: 'From',
  toLocation: 'To',
  hotelName: 'Hotel',
  time: 'Time',
  driverPhone: 'Driver number',
};

const EMPTY_OPS_COL_FILTERS: Record<OpsFilterCol, string> = {
  groupNo: '',
  agentName: '',
  totalPax: '',
  totalBus: '',
  date: '',
  direction: '',
  fromLocation: '',
  toLocation: '',
  hotelName: '',
  time: '',
  driverPhone: '',
};

const DIRECTION_SUGGESTIONS = [
  'Arrival',
  'Makkah → Madinah',
  'Madinah → Makkah',
  'Jeddah → Makkah',
  'Makkah → Jeddah',
  'Madinah → Jeddah',
  'Ziyarat Makkah',
  'Ziyarat Madinah',
  'Departure',
  'القدوم',
  'مكة ← المدينة',
  'المدينة ← مكة',
  'مزارات مكة',
  'مزارات المدينة',
  'المغادرة',
];

interface SegmentDraft {
  draftKey: string;
  enabled: boolean;
  stageKey: CycleStageKey;
  stageOrder: number;
  date: string;
  direction: string;
  fromLocation: string;
  toLocation: string;
  hotelName: string;
  time: string;
  driverPhone: string;
  totalBus: string;
  status: CycleStatus;
}

function createInitialSegments(lang: Lang, defaultBus = '1'): SegmentDraft[] {
  return STAGES.map((st, idx) => ({
    draftKey: st.key,
    enabled: idx === 0,
    stageKey: st.key,
    stageOrder: st.order,
    date: idx === 0 ? today() : '',
    direction: st[lang],
    fromLocation: '',
    toLocation: '',
    hotelName: '',
    time: '',
    driverPhone: '',
    totalBus: defaultBus,
    status: 'pending',
  }));
}

function splitLegacyRoute(routeDetails: string): { from: string; to: string } {
  const raw = String(routeDetails || '').trim();
  if (!raw) return { from: '', to: '' };
  const parts = raw.split(/\s*(?:←|→|->|<-| - | إلى )\s*/);
  if (parts.length >= 2) {
    return { from: parts[0].trim(), to: parts.slice(1).join(' - ').trim() };
  }
  return { from: raw, to: '' };
}

function escapeHtml(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const DriverWheelIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="2.4" />
    <path d="M12 3v6.6" />
    <path d="M5.2 16.5l4.6-2.9" />
    <path d="M18.8 16.5l-4.6-2.9" />
  </svg>
);

const makeDriverSvgHtml = (strokeColor: string, size = 15) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; flex-shrink:0;"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.4"/><path d="M12 3v6.6"/><path d="M5.2 16.5l4.6-2.9"/><path d="M18.8 16.5l-4.6-2.9"/></svg>`;

function getTomorrowIsoDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isArrivalSegment(op: { direction: string; raw?: CycleOperation }): boolean {
  const dir = String(op.direction || '').trim().toLowerCase();
  const stageLbl = String(op.raw?.stageLabel || '').trim().toLowerCase();
  const text = `${dir} ${stageLbl}`.trim();
  if (
    text.includes('arrival') ||
    text.includes('القدوم') ||
    text.includes('الوصول') ||
    text.includes('قدوم') ||
    text.includes('وصول')
  ) {
    return true;
  }
  if (
    op.raw?.stageKey === 'arrival' &&
    !text.includes('departure') &&
    !text.includes('internal') &&
    !text.includes('ziyarat') &&
    !text.includes('مغادرة') &&
    !text.includes('داخلي') &&
    !text.includes('مزارات')
  ) {
    return true;
  }
  return false;
}

async function loadLogoDataUrl(): Promise<string> {
  try {
    const res = await fetch('/logo.png');
    if (!res.ok) return '';
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

function normalizeHeaderKey(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\s_\-./#()]+/g, '');
}

function formatExcelDate(val: unknown): string {
  if (val === null || val === undefined || val === '') return '';
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof val === 'number' && val > 1000 && val < 100000) {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  const s = String(val).trim();
  if (!s) return '';
  // Match DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const mon = dmy[2].padStart(2, '0');
    const yr = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3].padStart(4, '0');
    return `${yr}-${mon}-${day}`;
  }
  // Match YYYY/MM/DD or YYYY-MM-DD
  const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  }
  return s.slice(0, 20);
}

function formatExcelTime(val: unknown): string {
  if (val === null || val === undefined || val === '') return '';
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return `${String(val.getHours()).padStart(2, '0')}:${String(val.getMinutes()).padStart(2, '0')}`;
  }
  if (typeof val === 'number' && val >= 0 && val < 2) {
    const frac = val % 1;
    const totalMinutes = Math.round(frac * 24 * 60);
    const hh = Math.floor(totalMinutes / 60) % 24;
    const mm = totalMinutes % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  return normalizeTime24(String(val));
}

type OpFieldKey =
  | 'groupNo'
  | 'agentName'
  | 'totalPax'
  | 'totalBus'
  | 'date'
  | 'direction'
  | 'fromLocation'
  | 'toLocation'
  | 'hotelName'
  | 'time'
  | 'driverPhone'
  | 'buy'
  | 'sell'
  | 'status'
  | 'notes';

const HEADER_ALIAS_MAP: Record<string, OpFieldKey> = {
  // GROUP NO
  groupno: 'groupNo',
  group: 'groupNo',
  grpno: 'groupNo',
  grp: 'groupNo',
  groupnumber: 'groupNo',
  groupid: 'groupNo',
  رقممجموعه: 'groupNo',
  رقمالمجموعه: 'groupNo',
  المجموعه: 'groupNo',
  مجموعه: 'groupNo',
  // AGENT NAME
  agentname: 'agentName',
  agent: 'agentName',
  company: 'agentName',
  customer: 'agentName',
  customername: 'agentName',
  client: 'agentName',
  clientname: 'agentName',
  اسمالعميل: 'agentName',
  العميل: 'agentName',
  اسمالوكيل: 'agentName',
  الوكيل: 'agentName',
  الشركه: 'agentName',
  اسمالشركه: 'agentName',
  // Total Pax
  totalpax: 'totalPax',
  pax: 'totalPax',
  passengers: 'totalPax',
  pilgrims: 'totalPax',
  عددالمعتمرين: 'totalPax',
  المعتمرين: 'totalPax',
  // TOTAL BUS
  totalbus: 'totalBus',
  totalbuses: 'totalBus',
  bus: 'totalBus',
  buses: 'totalBus',
  buscount: 'totalBus',
  vehicles: 'totalBus',
  vehiclecount: 'totalBus',
  عددالباصات: 'totalBus',
  الباصات: 'totalBus',
  باصات: 'totalBus',
  باص: 'totalBus',
  العدد: 'totalBus',
  // DATE
  date: 'date',
  movementdate: 'date',
  opdate: 'date',
  التاريخ: 'date',
  تاريخ: 'date',
  // Direction
  direction: 'direction',
  dir: 'direction',
  route: 'direction',
  stage: 'direction',
  movement: 'direction',
  الاتجاه: 'direction',
  اتجاه: 'direction',
  المسار: 'direction',
  المرحله: 'direction',
  الحركه: 'direction',
  // From
  from: 'fromLocation',
  fromlocation: 'fromLocation',
  origin: 'fromLocation',
  pickup: 'fromLocation',
  من: 'fromLocation',
  // To
  to: 'toLocation',
  tolocation: 'toLocation',
  destination: 'toLocation',
  dropoff: 'toLocation',
  الي: 'toLocation',
  الى: 'toLocation',
  // Hotel
  hotel: 'hotelName',
  hotelname: 'hotelName',
  الفندق: 'hotelName',
  اسمالفندق: 'hotelName',
  فندق: 'hotelName',
  // Time
  time: 'time',
  pickuptime: 'time',
  movementtime: 'time',
  الوقت: 'time',
  وقت: 'time',
  الساعه: 'time',
  // Driver number
  drivernumber: 'driverPhone',
  driverphone: 'driverPhone',
  drivermobile: 'driverPhone',
  drivercontact: 'driverPhone',
  driverno: 'driverPhone',
  driver: 'driverPhone',
  phone: 'driverPhone',
  mobile: 'driverPhone',
  contact: 'driverPhone',
  رقمالسائق: 'driverPhone',
  جوالالسائق: 'driverPhone',
  رقمجوالالسائق: 'driverPhone',
  رقمالجوال: 'driverPhone',
  السائق: 'driverPhone',
  // Buy / Sell (SAR)
  buy: 'buy',
  buysar: 'buy',
  buyprice: 'buy',
  cost: 'buy',
  شراء: 'buy',
  شراءرس: 'buy',
  سعرالشراء: 'buy',
  سعرشراء: 'buy',
  سعرالشراءرس: 'buy',
  التكلفه: 'buy',
  sell: 'sell',
  sellsar: 'sell',
  sellprice: 'sell',
  price: 'sell',
  بيع: 'sell',
  بيعرس: 'sell',
  سعرالبيع: 'sell',
  سعربيع: 'sell',
  سعرالبيعرس: 'sell',
  // Optional Status / Notes
  status: 'status',
  الحاله: 'status',
  notes: 'notes',
  note: 'notes',
  ملاحظات: 'notes',
};

function mapExcelStatus(raw: unknown): CycleStatus {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return 'pending';
  if (s.includes('complete') || s.includes('done') || s.includes('مكتمل') || s.includes('تم')) return 'completed';
  if (s.includes('progress') || s.includes('active') || s.includes('تنفيذ') || s.includes('جاري')) return 'in_progress';
  if (s.includes('cancel') || s.includes('ملغي') || s.includes('الغاء')) return 'cancelled';
  return 'pending';
}

export const OperationsPage: React.FC<OperationsPageProps> = ({
  db,
  lang,
  initialGroup,
  onConsumeInitialGroup,
  onSaveOperation,
  onImportOperations,
  onDeleteOperation,
  onToast,
  onConfirm,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const { user, profile, staffAccount, sharedInvite } = useAuth();

  useEffect(() => {
    document.body.classList.add('printing-ops');
    return () => {
      document.body.classList.remove('printing-ops');
    };
  }, []);

  const printedByLabel = useMemo(() => {
    if (staffAccount) {
      return `${staffAccount.displayName} (@${staffAccount.username})`;
    }
    const name = profile?.displayName || user?.displayName || sharedInvite?.displayName || '';
    return name || bi(lang, 'الإدارة', 'Management');
  }, [staffAccount, profile, user, sharedInvite, lang]);

  // Form state (Edit mode uses single-row fields; Add mode uses stacked segments)
  const [editId, setEditId] = useState<string | null>(null);
  const [groupNo, setGroupNo] = useState('');
  const [agentName, setAgentName] = useState('');
  const [totalPax, setTotalPax] = useState('');
  const [totalBus, setTotalBus] = useState('1');
  const [date, setDate] = useState(today());
  const [direction, setDirection] = useState('');
  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [hotelName, setHotelName] = useState('');
  const [time, setTime] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [status, setStatus] = useState<CycleStatus>('pending');
  const [segments, setSegments] = useState<SegmentDraft[]>(() => createInitialSegments(lang, '1'));
  const [saving, setSaving] = useState(false);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | CycleStatus>('all');
  const [colFilters, setColFilters] = useState<Record<OpsFilterCol, string>>({
    ...EMPTY_OPS_COL_FILTERS,
  });
  const [selectedFilters, setSelectedFilters] = useState<Partial<Record<OpsFilterCol, string[]>>>({});
  const [sortState, setSortState] = useState<{ col: OpsFilterCol; dir: 'asc' | 'desc' } | null>(null);
  const [openFilterMenu, setOpenFilterMenu] = useState<{
    col: OpsFilterCol;
    top: number;
    left: number;
  } | null>(null);
  const [menuSearch, setMenuSearch] = useState('');
  const [pageSize, setPageSize] = useState<number>(30);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Excel import preview & PDF export state
  const [pendingImport, setPendingImport] = useState<{
    fileName: string;
    rows: CycleOperation[];
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const customerNames = useMemo(() => getPartyNames(db, 'customer', lang), [db, lang]);
  const hotelSuggestions = useMemo(
    () => [
      ...HOTEL_SUGGESTIONS.makkah[lang],
      ...HOTEL_SUGGESTIONS.madinah[lang],
      ...HOTEL_SUGGESTIONS.jeddah[lang],
    ],
    [lang]
  );

  // Quick lookup from Visa & Transport entries for auto-filling AGENT NAME & Total Pax
  const groupLookup = useMemo(() => {
    const map = new Map<string, { groupNo: string; agent: string; pax: number }>();
    db.entries.forEach((e) => {
      const g = String(e.groupNo || '').trim();
      if (!g) return;
      map.set(g.toLowerCase(), { groupNo: g, agent: e.customer || '', pax: Number(e.pax || 0) });
    });
    db.transports.forEach((t) => {
      const g = String(t.groupNo || '').trim();
      if (!g) return;
      const k = g.toLowerCase();
      if (!map.has(k)) {
        map.set(k, { groupNo: g, agent: t.customer || '', pax: Number(t.pax || 0) });
      }
    });
    return map;
  }, [db.entries, db.transports]);

  useEffect(() => {
    if (initialGroup) {
      const trimmed = initialGroup.trim();
      setEditId(null);
      setGroupNo(trimmed);
      setSearch(trimmed);
      const info = groupLookup.get(trimmed.toLowerCase());
      if (info) {
        if (info.agent) setAgentName(info.agent);
        if (info.pax > 0) setTotalPax(String(info.pax));
      }
      onConsumeInitialGroup?.();
    }
  }, [initialGroup, groupLookup, onConsumeInitialGroup]);

  const handleGroupNoChange = (val: string) => {
    setGroupNo(val);
    const info = groupLookup.get(val.trim().toLowerCase());
    if (info && !editId) {
      if (!agentName.trim() && info.agent) setAgentName(info.agent);
      if (!totalPax.trim() && info.pax > 0) setTotalPax(String(info.pax));
    }
  };

  const resetForm = () => {
    setEditId(null);
    setGroupNo('');
    setAgentName('');
    setTotalPax('');
    setTotalBus('1');
    setDate(today());
    setDirection('');
    setFromLocation('');
    setToLocation('');
    setHotelName('');
    setTime('');
    setDriverPhone('');
    setStatus('pending');
    setSegments(createInitialSegments(lang, '1'));
  };

  const updateSegment = (idx: number, patch: Partial<SegmentDraft>, autoEnable = true) => {
    setSegments((prev) =>
      prev.map((seg, i) =>
        i === idx
          ? {
              ...seg,
              ...patch,
              enabled: patch.enabled !== undefined ? patch.enabled : autoEnable ? true : seg.enabled,
            }
          : seg
      )
    );
  };

  const handleSharedBusChange = (val: string) => {
    setTotalBus(val);
    if (!editId) {
      setSegments((prev) => prev.map((seg) => ({ ...seg, totalBus: val })));
    }
  };

  // Normalize all stored cycleOperations rows into unified 11-column display objects
  const normalizedOps = useMemo(() => {
    return db.cycleOperations
      .map((op) => {
        const grpInfo = groupLookup.get(String(op.groupNo || '').trim().toLowerCase());
        const legacy =
          !op.fromLocation && !op.toLocation && op.routeDetails
            ? splitLegacyRoute(op.routeDetails)
            : { from: op.fromLocation || '', to: op.toLocation || '' };
        const resolvedPax =
          typeof op.totalPax === 'number' && op.totalPax > 0 ? op.totalPax : grpInfo?.pax || 0;
        const resolvedBus =
          typeof op.totalBus === 'number' ? op.totalBus : Number(op.vehicleCount || 0);
        const resolvedAgent = (op.customer || '').trim() || grpInfo?.agent || '';
        const resolvedDir = (op.direction || '').trim() || (op.stageLabel || '').trim();
        const resolvedDriverNo = (op.driverPhone || '').trim() || (op.driverName || '').trim();

        return {
          raw: op,
          id: op.id,
          groupNo: op.groupNo || '',
          agentName: resolvedAgent,
          totalPax: resolvedPax,
          totalBus: resolvedBus,
          date: op.date || '',
          direction: resolvedDir,
          fromLocation: legacy.from,
          toLocation: legacy.to,
          hotelName: op.hotelName || '',
          time: normalizeTime24(op.time || ''),
          driverPhone: resolvedDriverNo,
          status: op.status || ('pending' as CycleStatus),
        };
      })
      .sort((a, b) => {
        const da = a.date || '9999-99-99';
        const dbDate = b.date || '9999-99-99';
        if (da !== dbDate) return da.localeCompare(dbDate);
        const ta = a.time || '99:99';
        const tb = b.time || '99:99';
        if (ta !== tb) return ta.localeCompare(tb);
        return a.groupNo.localeCompare(b.groupNo);
      });
  }, [db.cycleOperations, groupLookup]);

  const scheduleOps = normalizedOps;

  const getOpFilterMeta = (
    op: (typeof normalizedOps)[number],
    col: OpsFilterCol
  ): { key: string; label: string; sortVal: string | number } => {
    const emptyLbl = bi(lang, '(فارغ)', '(Empty)');
    if (col === 'totalPax' || col === 'totalBus') {
      const num = Number(op[col] || 0);
      return { key: String(num), label: String(num), sortVal: num };
    }
    const val = String(op[col] || '').trim();
    return { key: val, label: val || emptyLbl, sortVal: val };
  };

  const activeFilterCols = useMemo(
    () =>
      OPS_FILTER_COLS.map((c) => c.col).filter((col) => selectedFilters[col] !== undefined),
    [selectedFilters]
  );

  const hasActiveFilters =
    Boolean(search.trim()) ||
    Boolean(dateFilter) ||
    statusFilter !== 'all' ||
    Object.values(colFilters).some((v) => Boolean(v.trim())) ||
    activeFilterCols.length > 0 ||
    sortState !== null;

  const clearAllFilters = () => {
    setSearch('');
    setDateFilter('');
    setStatusFilter('all');
    setColFilters({ ...EMPTY_OPS_COL_FILTERS });
    setSelectedFilters({});
    setSortState(null);
    setOpenFilterMenu(null);
    setMenuSearch('');
    setCurrentPage(1);
  };

  const updateColFilter = (col: OpsFilterCol, val: string) => {
    setColFilters((prev) => ({ ...prev, [col]: val }));
  };

  const toggleFilterMenu = (col: OpsFilterCol, btnEl: HTMLButtonElement) => {
    if (openFilterMenu?.col === col) {
      setOpenFilterMenu(null);
      setMenuSearch('');
      return;
    }
    const rect = btnEl.getBoundingClientRect();
    const menuWidth = 264;
    const menuHeight = 380;
    const rawLeft = lang === 'ar' ? rect.right - menuWidth : rect.left;
    const left = Math.max(12, Math.min(rawLeft, window.innerWidth - menuWidth - 12));
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const top =
      spaceBelow >= 260
        ? rect.bottom + 6
        : Math.max(12, Math.min(rect.top - menuHeight - 6, window.innerHeight - menuHeight - 12));
    setOpenFilterMenu({ col, top, left });
    setMenuSearch('');
  };

  useLayoutEffect(() => {
    if (openFilterMenu && popoverRef.current) {
      popoverRef.current.style.top = `${openFilterMenu.top}px`;
      popoverRef.current.style.left = `${openFilterMenu.left}px`;
    }
  }, [openFilterMenu]);

  useEffect(() => {
    if (!openFilterMenu) return;
    const onMouseDown = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('.ops-filter-popover') || target.closest('.ops-filter-trigger')) {
        return;
      }
      setOpenFilterMenu(null);
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setOpenFilterMenu(null);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openFilterMenu]);

  const todayDate = today();
  const tomorrowDate = getTomorrowIsoDate();
  const isTomorrowFilter = dateFilter === tomorrowDate;

  const tomorrowAgentOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const op of scheduleOps) {
      if (op.date !== tomorrowDate) continue;
      const name = String(op.agentName || '').trim();
      if (!name) continue;
      map.set(name, (map.get(name) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, lang === 'ar' ? 'ar' : 'en', { numeric: true })
      );
  }, [scheduleOps, tomorrowDate, lang]);

  const selectedTomorrowClient =
    isTomorrowFilter && selectedFilters.agentName?.length === 1
      ? selectedFilters.agentName[0]
      : '';

  const handleToggleTomorrowOnly = () => {
    const nextDate = isTomorrowFilter ? '' : tomorrowDate;
    setDateFilter(nextDate);
    setSelectedFilters((prev) => {
      if (!prev.agentName || !nextDate) return prev;
      const validAgents = new Set(
        scheduleOps
          .filter((op) => op.date === nextDate)
          .map((op) => getOpFilterMeta(op, 'agentName').key)
      );
      const kept = prev.agentName.filter((k) => validAgents.has(k));
      const updated = { ...prev };
      if (kept.length === 0) delete updated.agentName;
      else updated.agentName = kept;
      return updated;
    });
  };

  const handleTomorrowClientChange = (clientName: string) => {
    if (!clientName) {
      setSelectedFilters((prev) => {
        const updated = { ...prev };
        delete updated.agentName;
        return updated;
      });
      return;
    }
    setDateFilter(tomorrowDate);
    setSelectedFilters((prev) => ({ ...prev, agentName: [clientName] }));
  };

  const dateScopedOps = useMemo(
    () => (dateFilter ? scheduleOps.filter((op) => op.date === dateFilter) : scheduleOps),
    [scheduleOps, dateFilter]
  );

  const columnOptions = useMemo(() => {
    const result = {} as Record<OpsFilterCol, OpsFilterOptionItem[]>;
    for (const { col } of OPS_FILTER_COLS) {
      const sourceOps = col === 'date' ? scheduleOps : dateScopedOps;
      const map = new Map<string, OpsFilterOptionItem>();
      for (const op of sourceOps) {
        const meta = getOpFilterMeta(op, col);
        const existing = map.get(meta.key);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(meta.key, {
            key: meta.key,
            label: meta.label,
            count: 1,
            sortVal: meta.sortVal,
          });
        }
      }
      result[col] = Array.from(map.values()).sort((a, b) => {
        if (typeof a.sortVal === 'number' && typeof b.sortVal === 'number') {
          return a.sortVal - b.sortVal;
        }
        return String(a.sortVal).localeCompare(String(b.sortVal), lang === 'ar' ? 'ar' : 'en', {
          numeric: true,
        });
      });
    }
    return result;
  }, [scheduleOps, dateScopedOps, lang]);

  const toggleOptionValue = (col: OpsFilterCol, key: string) => {
    const allKeys = columnOptions[col].map((o) => o.key);
    setSelectedFilters((prev) => {
      const current = prev[col] ?? allKeys;
      const next = current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key];
      const updated = { ...prev };
      if (next.length >= allKeys.length) {
        delete updated[col];
      } else {
        updated[col] = next;
      }
      return updated;
    });
  };

  const selectAllColumnOptions = (col: OpsFilterCol) => {
    setSelectedFilters((prev) => {
      const updated = { ...prev };
      delete updated[col];
      return updated;
    });
  };

  const clearColumnOptionsSelection = (col: OpsFilterCol) => {
    setSelectedFilters((prev) => ({ ...prev, [col]: [] }));
  };

  const clearSingleColumnFilter = (col: OpsFilterCol) => {
    setSelectedFilters((prev) => {
      const updated = { ...prev };
      delete updated[col];
      return updated;
    });
    if (sortState?.col === col) {
      setSortState(null);
    }
  };

  const filteredOps = useMemo(() => {
    const norm = (val: unknown) =>
      toWestDigits(String(val ?? ''))
        .toLowerCase()
        .trim();
    const q = norm(search);
    const cf: Record<OpsFilterCol, string> = {
      groupNo: norm(colFilters.groupNo),
      agentName: norm(colFilters.agentName),
      totalPax: norm(colFilters.totalPax),
      totalBus: norm(colFilters.totalBus),
      date: norm(colFilters.date),
      direction: norm(colFilters.direction),
      fromLocation: norm(colFilters.fromLocation),
      toLocation: norm(colFilters.toLocation),
      hotelName: norm(colFilters.hotelName),
      time: norm(colFilters.time),
      driverPhone: norm(colFilters.driverPhone),
    };

    const filtered = scheduleOps.filter((op) => {
      if (dateFilter && op.date !== dateFilter) return false;
      if (statusFilter !== 'all' && op.status !== statusFilter) return false;

      if (q) {
        const hit =
          norm(op.groupNo).includes(q) ||
          norm(op.agentName).includes(q) ||
          norm(op.direction).includes(q) ||
          norm(op.fromLocation).includes(q) ||
          norm(op.toLocation).includes(q) ||
          norm(op.hotelName).includes(q) ||
          norm(op.date).includes(q) ||
          norm(op.time).includes(q) ||
          norm(op.driverPhone).includes(q) ||
          norm(op.totalPax).includes(q) ||
          norm(op.totalBus).includes(q);
        if (!hit) return false;
      }

      for (const { col } of OPS_FILTER_COLS) {
        const txtFilter = cf[col];
        if (txtFilter && !norm(op[col]).includes(txtFilter)) {
          return false;
        }
        const sel = selectedFilters[col];
        if (sel !== undefined) {
          const meta = getOpFilterMeta(op, col);
          if (!sel.includes(meta.key)) return false;
        }
      }

      return true;
    });

    if (sortState) {
      const factor = sortState.dir === 'asc' ? 1 : -1;
      return filtered.slice().sort((a, b) => {
        const av = getOpFilterMeta(a, sortState.col).sortVal;
        const bv = getOpFilterMeta(b, sortState.col).sortVal;
        if (typeof av === 'number' && typeof bv === 'number') {
          return (av - bv) * factor;
        }
        return (
          String(av).localeCompare(String(bv), lang === 'ar' ? 'ar' : 'en', {
            numeric: true,
          }) * factor
        );
      });
    }

    return filtered;
  }, [scheduleOps, search, dateFilter, statusFilter, colFilters, selectedFilters, sortState, lang]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, dateFilter, statusFilter, colFilters, selectedFilters, sortState, pageSize]);

  const totalPages =
    pageSize === 0 ? 1 : Math.max(1, Math.ceil(filteredOps.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const displayedOps = useMemo(() => {
    if (pageSize === 0) return filteredOps;
    const start = (safePage - 1) * pageSize;
    return filteredOps.slice(start, start + pageSize);
  }, [filteredOps, pageSize, safePage]);

  // KPI metrics (Transport Operations Schedule only)
  const kpiOpsCount = scheduleOps.length;
  const kpiUniqueGroups = useMemo(
    () => new Set(scheduleOps.map((o) => o.groupNo.trim().toLowerCase()).filter(Boolean)).size,
    [scheduleOps]
  );
  const kpiTotalPax = useMemo(
    () => sumBy(scheduleOps.filter(isArrivalSegment), (o) => o.totalPax),
    [scheduleOps]
  );
  const kpiTotalBus = useMemo(() => sumBy(scheduleOps, (o) => o.totalBus), [scheduleOps]);

  const filteredSumPax = useMemo(
    () => sumBy(filteredOps.filter(isArrivalSegment), (o) => o.totalPax),
    [filteredOps]
  );
  const filteredSumBus = useMemo(() => sumBy(filteredOps, (o) => o.totalBus), [filteredOps]);

  const enabledSegmentsCount = useMemo(
    () => segments.filter((s) => s.enabled).length,
    [segments]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const g = groupNo.trim();
    if (!g) {
      onToast(bi(lang, 'يرجى إدخال رقم المجموعة (GROUP NO)', 'Please enter GROUP NO'), 'error');
      return;
    }

    const paxVal = Math.max(0, Math.round(Number(totalPax || 0)));

    if (editId) {
      const existingRaw = db.cycleOperations.find((x) => x.id === editId);
      const busVal = Math.max(0, Math.round(Number(totalBus || 0)));
      const dirText = direction.trim() || existingRaw?.stageLabel || 'Operation';

      const payload: CycleOperation = {
        ...(existingRaw || {}),
        id: editId,
        groupNo: g,
        stageKey: existingRaw?.stageKey || 'internal',
        stageLabel: dirText,
        status,
        direction: dirText,
        totalPax: paxVal,
        totalBus: busVal,
        fromLocation: fromLocation.trim(),
        toLocation: toLocation.trim(),
        hotelName: hotelName.trim(),
        date: date.trim(),
        time: normalizeTime24(time.trim()),
        routeDetails: [fromLocation.trim(), toLocation.trim()].filter(Boolean).join(' ← '),
        vehicleType: existingRaw?.vehicleType || VEHICLE_TYPES[0],
        vehicleCount: Math.max(1, busVal || 1),
        supplier: existingRaw?.supplier || '',
        customer: agentName.trim(),
        driverName: existingRaw?.driverName || '',
        driverPhone: driverPhone.trim(),
        plateNo: existingRaw?.plateNo || '',
        buy: Math.max(0, Number(existingRaw?.buy || 0)),
        sell: Math.max(0, Number(existingRaw?.sell || 0)),
        notes: existingRaw?.notes || '',
      };

      setSaving(true);
      try {
        await onSaveOperation(payload, true);
        onToast(bi(lang, 'تم تحديث العملية بنجاح', 'Operation updated successfully'));
        resetForm();
      } finally {
        setSaving(false);
      }
      return;
    }

    const selectedSegments = segments.filter((s) => s.enabled);
    if (selectedSegments.length === 0) {
      onToast(
        bi(lang, 'يرجى تحديد أو تعبئة مقطع واحد على الأقل للحفظ', 'Please enable or fill at least one segment'),
        'error'
      );
      return;
    }

    const baseTs = Date.now();
    const newOps: CycleOperation[] = selectedSegments.map((seg, idx) => {
      const busVal = Math.max(0, Math.round(Number(seg.totalBus || totalBus || 0)));
      const dirText =
        seg.direction.trim() ||
        STAGES.find((s) => s.key === seg.stageKey)?.[lang] ||
        bi(lang, 'مقطع إضافي', 'Extra Segment');
      return {
        id: safeDocId(`op_${g}_${seg.stageKey}_${baseTs}_${idx}_${Math.random().toString(36).slice(2, 5)}`),
        groupNo: g,
        stageKey: seg.stageKey,
        stageLabel: dirText,
        status: seg.status,
        direction: dirText,
        totalPax: paxVal,
        totalBus: busVal,
        fromLocation: seg.fromLocation.trim(),
        toLocation: seg.toLocation.trim(),
        hotelName: seg.hotelName.trim(),
        date: seg.date.trim(),
        time: normalizeTime24(seg.time.trim()),
        routeDetails: [seg.fromLocation.trim(), seg.toLocation.trim()].filter(Boolean).join(' ← '),
        vehicleType: VEHICLE_TYPES[0],
        vehicleCount: Math.max(1, busVal || 1),
        supplier: '',
        customer: agentName.trim(),
        driverName: '',
        driverPhone: seg.driverPhone.trim(),
        plateNo: '',
        buy: 0,
        sell: 0,
        notes: '',
      };
    });

    setSaving(true);
    try {
      await onImportOperations(newOps, 'append');
      onToast(
        bi(
          lang,
          `تمت إضافة ${newOps.length} مقاطع عمليات للمجموعة (${g}) بنجاح`,
          `Added ${newOps.length} operation segment(s) for ${g}`
        )
      );
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (op: (typeof normalizedOps)[number]) => {
    setEditId(op.id);
    setGroupNo(op.groupNo);
    setAgentName(op.agentName);
    setTotalPax(String(op.totalPax || ''));
    setTotalBus(String(op.totalBus));
    setDate(op.date);
    setDirection(op.direction);
    setFromLocation(op.fromLocation);
    setToLocation(op.toLocation);
    setHotelName(op.hotelName);
    setTime(normalizeTime24(op.time));
    setDriverPhone(op.driverPhone);
    setStatus(op.status);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleQuickStatusChange = async (op: (typeof normalizedOps)[number], nextStatus: CycleStatus) => {
    const updated: CycleOperation = {
      ...op.raw,
      status: nextStatus,
      direction: op.direction,
      totalPax: op.totalPax,
      totalBus: op.totalBus,
      customer: op.agentName,
      fromLocation: op.fromLocation,
      toLocation: op.toLocation,
      hotelName: op.hotelName,
      driverPhone: op.driverPhone,
    };
    await onSaveOperation(updated, true);
    onToast(bi(lang, 'تم تحديث الحالة', 'Status updated'));
  };

  const parseOperationsExcelFile = async (file: File): Promise<CycleOperation[] | null> => {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        onToast(bi(lang, 'ملف الإكسيل فارغ', 'Excel file is empty'), 'error');
        return null;
      }
      const sheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (!rawRows.length) {
        onToast(bi(lang, 'لا توجد صفوف بيانات في الشيت', 'No data rows found in sheet'), 'error');
        return null;
      }

      const baseTs = Date.now();
      const parsedOps: CycleOperation[] = [];

      rawRows.forEach((rawRow, idx) => {
        const mapped: Partial<Record<OpFieldKey, unknown>> = {};
        Object.entries(rawRow).forEach(([header, val]) => {
          const norm = normalizeHeaderKey(header);
          const field = HEADER_ALIAS_MAP[norm];
          if (field && (mapped[field] === undefined || mapped[field] === '')) {
            mapped[field] = val;
          }
        });

        const grp = String(mapped.groupNo ?? '').trim();
        const agt = String(mapped.agentName ?? '').trim();
        const dir = String(mapped.direction ?? '').trim();
        const frm = String(mapped.fromLocation ?? '').trim();
        const toLoc = String(mapped.toLocation ?? '').trim();
        const htl = String(mapped.hotelName ?? '').trim();
        const dt = formatExcelDate(mapped.date);
        const tm = formatExcelTime(mapped.time);
        const drv = String(mapped.driverPhone ?? '').trim();

        // Skip completely blank trailing rows
        if (!grp && !agt && !dir && !frm && !toLoc && !htl && !dt && !drv) {
          return;
        }

        const paxNum = Math.max(0, Math.round(Number(String(mapped.totalPax ?? 0).replace(/[^\d.-]/g, '')) || 0));
        const busNum = Math.max(0, Math.round(Number(String(mapped.totalBus ?? 1).replace(/[^\d.-]/g, '')) || 0));
        const resolvedGrp = grp || `GRP-${idx + 1}`;
        const st = mapExcelStatus(mapped.status);
        const noteStr = String(mapped.notes ?? '').trim();

        parsedOps.push({
          id: safeDocId(
            `op_xls_${baseTs}_${idx}_${Math.random().toString(36).slice(2, 5)}`
          ),
          groupNo: resolvedGrp,
          stageKey: 'internal',
          stageLabel: dir || 'Operation',
          status: st,
          direction: dir,
          totalPax: paxNum,
          totalBus: busNum,
          fromLocation: frm,
          toLocation: toLoc,
          hotelName: htl,
          date: dt,
          time: tm,
          routeDetails: [frm, toLoc].filter(Boolean).join(' ← '),
          vehicleType: VEHICLE_TYPES[0],
          vehicleCount: Math.max(1, busNum || 1),
          supplier: '',
          customer: agt,
          driverName: '',
          driverPhone: drv,
          plateNo: '',
          buy: 0,
          sell: 0,
          notes: noteStr,
        });
      });

      if (!parsedOps.length) {
        onToast(
          bi(
            lang,
            'لم يتم التعرف على صفوف صالحة. تأكد من أسماء الأعمدة (GROUP NO, AGENT NAME, ...)',
            'No valid rows detected. Check column headers (GROUP NO, AGENT NAME, ...)'
          ),
          'error'
        );
        return null;
      }

      return parsedOps;
    } catch {
      onToast(bi(lang, 'تعذر قراءة ملف الإكسيل', 'Failed to read Excel file'), 'error');
      return null;
    }
  };

  const handleExcelFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const parsedOps = await parseOperationsExcelFile(file);
    if (parsedOps) {
      setPendingImport({ fileName: file.name, rows: parsedOps });
    }
  };

  const executeImport = async (mode: 'append' | 'replace') => {
    if (!pendingImport) return;
    const runImport = async () => {
      setImporting(true);
      try {
        await onImportOperations(pendingImport.rows, mode);
        onToast(
          bi(
            lang,
            `تم استيراد ${pendingImport.rows.length} عملية بنجاح`,
            `Imported ${pendingImport.rows.length} operations successfully`
          )
        );
        setPendingImport(null);
      } finally {
        setImporting(false);
      }
    };

    if (mode === 'replace') {
      onConfirm({
        title: bi(lang, 'استبدال جدول عمليات النقل', 'Replace Transport Operations Table'),
        message: bi(
          lang,
          `سيتم حذف عمليات النقل الحالية (${scheduleOps.length}) واستبدالها بـ (${pendingImport.rows.length}) عملية من الملف "${pendingImport.fileName}". هل تريد المتابعة؟`,
          `Replace all ${scheduleOps.length} existing transport operations with ${pendingImport.rows.length} rows from "${pendingImport.fileName}"?`
        ),
        danger: true,
        onConfirm: runImport,
      });
    } else {
      await runImport();
    }
  };

  const exportExcel = (templateOnly = false) => {
    const headers = [
      'GROUP NO',
      'AGENT NAME',
      'Total Pax',
      'TOTAL BUS',
      'DATE',
      'Direction',
      'From',
      'To',
      'Hotel',
      'Time',
      'Driver number',
    ];
    const dataRows = templateOnly
      ? [
          [
            'GRP-001',
            'Example Agent',
            45,
            1,
            today(),
            'Arrival',
            'Jeddah Airport',
            'Makkah Hotel',
            'Swissotel Makkah',
            '14:30',
            '0500000000',
          ],
        ]
      : filteredOps.map((op) => [
          op.groupNo,
          op.agentName,
          op.totalPax,
          op.totalBus,
          op.date,
          op.direction,
          op.fromLocation,
          op.toLocation,
          op.hotelName,
          op.time,
          op.driverPhone,
        ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Operations');
    XLSX.writeFile(wb, templateOnly ? 'operations_template.xlsx' : 'operations_schedule.xlsx');
  };

  const exportMeta = useMemo(() => {
    const uniqueAgents = Array.from(
      new Set(filteredOps.map((o) => String(o.agentName || '').trim()).filter(Boolean))
    );
    const uniqueDates = Array.from(
      new Set(filteredOps.map((o) => String(o.date || '').trim()).filter(Boolean))
    );
    const clientName =
      (selectedFilters.agentName?.length === 1 ? selectedFilters.agentName[0] : '') ||
      (uniqueAgents.length === 1 ? uniqueAgents[0] : '') ||
      colFilters.agentName.trim() ||
      '';
    const selectedDate =
      dateFilter ||
      (selectedFilters.date?.length === 1 ? selectedFilters.date[0] : '') ||
      colFilters.date.trim() ||
      (uniqueDates.length === 1 ? uniqueDates[0] : '') ||
      today();
    const safePart = (s: string) =>
      s.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 60);
    const fileBase = clientName
      ? `BEST_UNITED_TRAVEL_${safePart(clientName)}_${safePart(selectedDate)}`
      : `BEST_UNITED_TRAVEL_Operations_${safePart(selectedDate)}`;
    return { clientName, selectedDate, fileBase };
  }, [filteredOps, selectedFilters, colFilters, dateFilter]);

  const handlePrintSchedule = () => {
    const prevTitle = document.title;
    document.title = exportMeta.fileBase;
    const restoreTitle = () => {
      document.title = prevTitle;
      window.removeEventListener('afterprint', restoreTitle);
    };
    window.addEventListener('afterprint', restoreTitle);
    window.print();
    window.setTimeout(restoreTitle, 1500);
  };

  const exportPdf = async () => {
    if (!filteredOps.length) {
      onToast(bi(lang, 'لا توجد عمليات لتصديرها إلى PDF', 'No operations available to export'), 'error');
      return;
    }
    setExportingPdf(true);
    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.left = '-10000px';
    wrapper.style.top = '0';
    wrapper.style.zIndex = '-1';
    wrapper.style.background = '#ffffff';
    document.body.appendChild(wrapper);

    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      const ROWS_PER_PAGE = 18;
      const chunks: Array<typeof filteredOps> = [];
      for (let i = 0; i < filteredOps.length; i += ROWS_PER_PAGE) {
        chunks.push(filteredOps.slice(i, i + ROWS_PER_PAGE));
      }

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const dirAttr = 'ltr';
      const align = 'left';
      const nowDate = new Date();
      const generatedAt = today();
      const generatedTime = formatTime24(nowDate);
      const driverIconRowHtml = makeDriverSvgHtml('#dc2626', 13);
      const driverIconHdrHtml = makeDriverSvgHtml('#fca5a5', 13);
      const logoDataUrl = await loadLogoDataUrl();
      const logoHtml = logoDataUrl
        ? `<img src="${logoDataUrl}" alt="BEST UNITED TRAVEL" style="width:68px; height:68px; object-fit:contain; border-radius:12px; border:1px solid #cbd5e1; padding:4px; background:#ffffff; flex-shrink:0;" />`
        : '';
      const watermarkHtml = logoDataUrl
        ? `<img src="${logoDataUrl}" alt="" style="position:absolute; top:52%; left:50%; transform:translate(-50%, -50%); width:260px; height:260px; object-fit:contain; opacity:0.05; pointer-events:none; z-index:0;" />`
        : '';

      for (let pIdx = 0; pIdx < chunks.length; pIdx++) {
        const chunk = chunks[pIdx];
        const isLastPage = pIdx === chunks.length - 1;
        const pageDiv = document.createElement('div');
        pageDiv.setAttribute('dir', dirAttr);
        pageDiv.style.position = 'relative';
        pageDiv.style.width = '1122px';
        pageDiv.style.padding = '22px 26px';
        pageDiv.style.background = '#ffffff';
        pageDiv.style.color = '#0f172a';
        pageDiv.style.fontFamily = '"IBM Plex Sans Arabic", Tahoma, Arial, sans-serif';
        pageDiv.style.boxSizing = 'border-box';

        const rowsHtml = chunk
          .map((op, rIdx) => {
            const bg = rIdx % 2 === 1 ? '#f8fafc' : '#ffffff';
            const stLabel = STATUS_LABELS[op.status]?.en || op.status;
            return `
              <tr style="background:${bg}; border-bottom:1px solid #e2e8f0;">
                <td style="padding:7px 8px; font-weight:700; color:#0f172a; white-space:nowrap;">${escapeHtml(op.groupNo)}</td>
                <td style="padding:7px 8px; color:#1e293b;">${escapeHtml(op.agentName || '-')}</td>
                <td style="padding:7px 8px; font-weight:600; font-family:'IBM Plex Mono',monospace; text-align:center;">${escapeHtml(op.totalPax)}</td>
                <td style="padding:7px 8px; font-weight:600; font-family:'IBM Plex Mono',monospace; text-align:center;">${escapeHtml(op.totalBus)}</td>
                <td style="padding:7px 8px; font-family:'IBM Plex Mono',monospace; white-space:nowrap;">${escapeHtml(op.date || '-')}</td>
                <td style="padding:7px 8px;">${escapeHtml(op.direction || '-')}</td>
                <td style="padding:7px 8px;">${escapeHtml(op.fromLocation || '-')}</td>
                <td style="padding:7px 8px;">${escapeHtml(op.toLocation || '-')}</td>
                <td style="padding:7px 8px;">${escapeHtml(op.hotelName || '-')}</td>
                <td style="padding:7px 6px; font-family:'IBM Plex Mono',monospace; white-space:nowrap;">${escapeHtml(op.time || '-')}</td>
                <td style="padding:7px 6px; font-family:'IBM Plex Mono','IBM Plex Sans Arabic',Tahoma,sans-serif; white-space:nowrap; direction:ltr; text-align:${align}; color:#dc2626; font-weight:700;">
                  <span style="display:inline-flex; align-items:center; gap:4px; color:#dc2626; font-weight:700;">${driverIconRowHtml}<span>${escapeHtml(op.driverPhone || '-')}</span></span>
                </td>
                <td style="padding:7px 6px; white-space:nowrap;">${escapeHtml(stLabel)}</td>
              </tr>
            `;
          })
          .join('');

        const tfootHtml = isLastPage
          ? `
            <tfoot>
              <tr style="background:#e2e8f0; font-weight:700; color:#0f172a; border-top:2px solid #94a3b8;">
                <td colspan="2" style="padding:8px;">${escapeHtml(`Total (${filteredOps.length} ops)`)}</td>
                <td style="padding:8px; font-family:'IBM Plex Mono',monospace; text-align:center;">${escapeHtml(filteredSumPax)}</td>
                <td style="padding:8px; font-family:'IBM Plex Mono',monospace; text-align:center;">${escapeHtml(filteredSumBus)}</td>
                <td colspan="8" style="padding:8px;"></td>
              </tr>
            </tfoot>
          `
          : '';

        pageDiv.innerHTML = `
          ${watermarkHtml}
          <div style="position:relative; z-index:1;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #0f1e36; padding-bottom:12px; margin-bottom:12px; gap:12px;">
              <div style="display:flex; align-items:center; gap:14px;">
                ${logoHtml}
                <div>
                  <div style="font-size:18px; font-weight:700; color:#0f1e36;">BEST UNITED TRAVEL &amp; TOURISM</div>
                  <div style="font-size:12.5px; font-weight:600; color:#1e3a8a; margin-top:1px;">
                    ${escapeHtml(
                      exportMeta.clientName
                        ? `Transport Operations Schedule — ${exportMeta.clientName} (${exportMeta.selectedDate})`
                        : `Transport Operations Schedule (${exportMeta.selectedDate})`
                    )}
                  </div>
                  <div style="font-size:10.5px; color:#475569; margin-top:2px;">
                    ${escapeHtml(`Operations: ${filteredOps.length} | Total Pax: ${filteredSumPax} | TOTAL BUS: ${filteredSumBus}`)}
                  </div>
                </div>
              </div>
              <div style="text-align:right; font-size:11px; color:#334155; line-height:1.55;">
                <div style="font-weight:700; color:#0f1e36;">
                  Printed by: ${escapeHtml(printedByLabel)}
                </div>
                <div style="font-family:'IBM Plex Mono',monospace; direction:ltr;">${escapeHtml(generatedAt)} · ${escapeHtml(generatedTime)}</div>
                <div style="color:#64748b;">${escapeHtml(`Page ${pIdx + 1} of ${chunks.length}`)}</div>
              </div>
            </div>
            <table style="width:100%; border-collapse:collapse; font-size:11px; text-align:${align};">
              <thead>
                <tr style="background:#0f1e36; color:#ffffff;">
                  <th style="padding:7px 8px; text-align:${align}; white-space:nowrap;">GROUP NO</th>
                  <th style="padding:7px 8px; text-align:${align}; white-space:nowrap;">AGENT NAME</th>
                  <th style="padding:7px 8px; text-align:center; white-space:nowrap;">Total Pax</th>
                  <th style="padding:7px 8px; text-align:center; white-space:nowrap;">TOTAL BUS</th>
                  <th style="padding:7px 8px; text-align:${align}; white-space:nowrap;">DATE</th>
                  <th style="padding:7px 8px; text-align:${align}; white-space:nowrap;">Direction</th>
                  <th style="padding:7px 8px; text-align:${align}; white-space:nowrap;">From</th>
                  <th style="padding:7px 8px; text-align:${align}; white-space:nowrap;">To</th>
                  <th style="padding:7px 8px; text-align:${align}; white-space:nowrap;">Hotel</th>
                  <th style="padding:7px 6px; text-align:${align}; white-space:nowrap;">Time</th>
                  <th style="padding:7px 6px; text-align:${align}; white-space:nowrap; color:#fca5a5;">
                    <span style="display:inline-flex; align-items:center; gap:4px; color:#fca5a5;">${driverIconHdrHtml}<span>Driver number</span></span>
                  </th>
                  <th style="padding:7px 6px; text-align:${align}; white-space:nowrap;">Status</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
              ${tfootHtml}
            </table>
            <div style="margin-top:10px; padding-top:6px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; font-size:10px; color:#64748b;">
              <span>BEST UNITED TRAVEL &amp; TOURISM · Season 1448H</span>
              <span>Printed by: ${escapeHtml(printedByLabel)} · ${escapeHtml(generatedAt)} ${escapeHtml(generatedTime)}</span>
            </div>
          </div>
        `;

        wrapper.innerHTML = '';
        wrapper.appendChild(pageDiv);

        // Ensure the full table never clips horizontally even with wide columns
        const tableEl = pageDiv.querySelector('table');
        if (tableEl && tableEl.scrollWidth > pageDiv.clientWidth - 52) {
          pageDiv.style.width = `${tableEl.scrollWidth + 56}px`;
        }

        // Wait for company logo images to finish decoding before rendering canvas
        const imgs = Array.from(pageDiv.querySelectorAll('img'));
        await Promise.all(
          imgs.map((img) =>
            typeof img.decode === 'function'
              ? img.decode().catch(() => undefined)
              : new Promise<void>((res) => {
                  if (img.complete) res();
                  else {
                    img.onload = () => res();
                    img.onerror = () => res();
                  }
                })
          )
        );

        const canvas = await html2canvas(pageDiv, {
          scale: 2,
          backgroundColor: '#ffffff',
          useCORS: true,
        });
        const imgData = canvas.toDataURL('image/png');
        const imgHeightMm = (canvas.height * pdfWidth) / canvas.width;
        const drawHeight = Math.min(pdfHeight - 4, imgHeightMm);
        const drawWidth = imgHeightMm > pdfHeight - 4 ? (canvas.width * (pdfHeight - 4)) / canvas.height : pdfWidth;
        const xOffset = (pdfWidth - drawWidth) / 2;

        if (pIdx > 0) pdf.addPage('a4', 'landscape');
        pdf.addImage(imgData, 'PNG', xOffset, 2, drawWidth, drawHeight);
      }

      const pdfFileName = `${exportMeta.fileBase}.pdf`;

      pdf.save(pdfFileName);
      onToast(bi(lang, 'تم تحميل ملف PDF بنجاح', 'PDF exported successfully'));
    } catch {
      onToast(bi(lang, 'تعذر إنشاء ملف PDF', 'Failed to generate PDF'), 'error');
    } finally {
      wrapper.remove();
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 4 KPI Cards */}
      <div className="no-print grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <KpiCard label={bi(lang, 'إجمالي العمليات', 'Total Operations')} value={kpiOpsCount} tone="blue" />
            <KpiCard label={bi(lang, 'عدد المجموعات', 'Total Groups')} value={kpiUniqueGroups} tone="teal" />
            <KpiCard
              label="Total Pax"
              value={kpiTotalPax}
              sub={bi(lang, 'مقطع Arrival فقط', 'Arrival segment only')}
              tone="amber"
            />
            <KpiCard label="TOTAL BUS" value={kpiTotalBus} tone="slate" />
          </div>

          {/* Add / Edit Operation Form (Hidden on print so prices never leak) */}
          <Panel
            className="no-print"
            title={
              editId
                ? bi(lang, 'تعديل بيانات العملية', 'Edit Operation')
                : bi(lang, 'إضافة عملية جديدة / استيراد شيت إكسيل', 'Add Operation / Upload Excel Sheet')
            }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleExcelFileSelected}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={btnTealCls}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{bi(lang, 'رفع شيت إكسيل', 'Upload Excel')}</span>
            </button>
            <button
              type="button"
              onClick={() => exportExcel(true)}
              className={btnSecondaryCls}
              title={bi(lang, 'تحميل نموذج شيت إكسيل فارغ', 'Download sample Excel template')}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{bi(lang, 'نموذج إكسيل', 'Excel Template')}</span>
            </button>
          </div>
        }
      >
        {/* Excel Import Preview Banner */}
        {pendingImport && (
          <div className="mb-5 p-4 rounded-xl bg-teal-50/70 border border-teal-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-teal-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
                <span>
                  {bi(
                    lang,
                    `تم قراءة الملف "${pendingImport.fileName}" — عدد العمليات الجاهزة للاستيراد: ${pendingImport.rows.length}`,
                    `Parsed "${pendingImport.fileName}" — ${pendingImport.rows.length} operations ready to import`
                  )}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPendingImport(null)}
                className="p-1 rounded-lg hover:bg-teal-100 text-teal-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-x-auto bg-white rounded-lg border border-teal-100">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <th className="py-1.5 px-2 text-start">GROUP NO</th>
                    <th className="py-1.5 px-2 text-start">AGENT NAME</th>
                    <th className="py-1.5 px-2 text-start">Total Pax</th>
                    <th className="py-1.5 px-2 text-start">TOTAL BUS</th>
                    <th className="py-1.5 px-2 text-start">DATE</th>
                    <th className="py-1.5 px-2 text-start">Direction</th>
                    <th className="py-1.5 px-2 text-start">From</th>
                    <th className="py-1.5 px-2 text-start">To</th>
                    <th className="py-1.5 px-2 text-start">Hotel</th>
                    <th className="py-1.5 px-2 text-start">Time</th>
                    <th className="py-1.5 px-2 text-start">Driver number</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingImport.rows.slice(0, 5).map((r) => (
                    <tr key={r.id}>
                      <td className="py-1.5 px-2 font-bold">{r.groupNo}</td>
                      <td className="py-1.5 px-2">{r.customer || '-'}</td>
                      <td className="py-1.5 px-2 font-mono-num">{r.totalPax || 0}</td>
                      <td className="py-1.5 px-2 font-mono-num">{r.totalBus ?? 0}</td>
                      <td className="py-1.5 px-2 font-mono-num">{r.date || '-'}</td>
                      <td className="py-1.5 px-2">{r.direction || '-'}</td>
                      <td className="py-1.5 px-2">{r.fromLocation || '-'}</td>
                      <td className="py-1.5 px-2">{r.toLocation || '-'}</td>
                      <td className="py-1.5 px-2">{r.hotelName || '-'}</td>
                      <td className="py-1.5 px-2 font-mono-num">{normalizeTime24(r.time) || '-'}</td>
                      <td className="py-1.5 px-2 font-mono-num">{r.driverPhone || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pendingImport.rows.length > 5 && (
                <div className="px-2.5 py-1.5 text-[11px] text-slate-500 bg-slate-50 border-t border-slate-100">
                  {bi(
                    lang,
                    `... و ${pendingImport.rows.length - 5} صفوف أخرى`,
                    `... and ${pendingImport.rows.length - 5} more rows`
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={importing}
                onClick={() => executeImport('append')}
                className={btnPrimaryCls}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>
                  {importing
                    ? bi(lang, 'جاري الاستيراد...', 'Importing...')
                    : bi(lang, 'إضافة إلى العمليات الحالية', 'Append to Operations')}
                </span>
              </button>
              <button
                type="button"
                disabled={importing}
                onClick={() => executeImport('replace')}
                className={btnDangerCls}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{bi(lang, 'استبدال العمليات الحالية بالكامل', 'Replace All Operations')}</span>
              </button>
              <button
                type="button"
                disabled={importing}
                onClick={() => setPendingImport(null)}
                className={btnSecondaryCls}
              >
                {bi(lang, 'إلغاء', 'Cancel')}
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Shared Group Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div>
              <label className={labelCls}>GROUP NO *</label>
              <input
                type="text"
                list="ops-groups-dl"
                required
                value={groupNo}
                onChange={(e) => handleGroupNoChange(e.target.value)}
                placeholder="GRP-001"
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>AGENT NAME</label>
              <input
                type="text"
                list="ops-agents-dl"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder={bi(lang, 'اسم الوكيل / العميل', 'Agent Name')}
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>Total Pax</label>
              <input
                type="number"
                min={0}
                value={totalPax}
                onChange={(e) => setTotalPax(e.target.value)}
                placeholder="0"
                className={`${inputCls} font-mono-num`}
              />
            </div>

            <div>
              <label className={labelCls}>TOTAL BUS</label>
              <input
                type="number"
                min={0}
                value={totalBus}
                onChange={(e) => handleSharedBusChange(e.target.value)}
                placeholder="1"
                className={`${inputCls} font-mono-num`}
              />
            </div>
          </div>

          {editId ? (
            /* Single-Row Edit Form */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-2 border-t border-slate-100">
              <div>
                <label className={labelCls}>DATE</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={`${inputCls} font-mono-num`}
                />
              </div>

              <div>
                <label className={labelCls}>Direction</label>
                <input
                  type="text"
                  list="ops-directions-dl"
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                  placeholder="Arrival / Makkah → Madinah..."
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>From</label>
                <input
                  type="text"
                  value={fromLocation}
                  onChange={(e) => setFromLocation(e.target.value)}
                  placeholder={bi(lang, 'نقطة الانطلاق', 'From')}
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>To</label>
                <input
                  type="text"
                  value={toLocation}
                  onChange={(e) => setToLocation(e.target.value)}
                  placeholder={bi(lang, 'الوجهة', 'To')}
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Hotel</label>
                <input
                  type="text"
                  list="ops-hotels-dl"
                  value={hotelName}
                  onChange={(e) => setHotelName(e.target.value)}
                  placeholder={bi(lang, 'اسم الفندق', 'Hotel Name')}
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Time (24H)</label>
                <Time24Input value={time} onChange={setTime} />
              </div>

              <div>
                <label className={labelCls}>Driver number</label>
                <input
                  type="tel"
                  dir="ltr"
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  placeholder="05xxxxxxxx"
                  className={`${inputCls} font-mono-num text-start`}
                />
              </div>

              <div>
                <label className={labelCls}>{bi(lang, 'الحالة', 'Status')}</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as CycleStatus)}
                  className={inputCls}
                >
                  {(Object.keys(STATUS_LABELS) as CycleStatus[]).map((sk) => (
                    <option key={sk} value={sk}>
                      {STATUS_LABELS[sk][lang]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            /* Vertically Stacked 5 Core Operation Segments */
            <div className="space-y-2.5 pt-2 border-t border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-slate-800">
                  {bi(
                    lang,
                    'مقاطع العملية (5 مقاطع أساسية لكل مجموعة)',
                    'Operation Segments (5 Core Stages per Group)'
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSegments((prev) => prev.map((s) => ({ ...s, enabled: true })))
                    }
                    className={btnSoftBlueCls}
                  >
                    {bi(lang, `تفعيل الكل (${segments.length})`, `Enable All (${segments.length})`)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSegments(createInitialSegments(lang, totalBus || '1'))}
                    className={btnSecondaryCls}
                  >
                    {bi(lang, 'تفريغ المقاطع', 'Reset Segments')}
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                {segments.map((seg, idx) => {
                  const stageMeta = STAGES[idx];
                  return (
                    <div
                      key={seg.draftKey}
                      className={`rounded-xl border p-3 transition ${
                        seg.enabled
                          ? 'bg-blue-50/30 border-[#1d4ed8]/40'
                          : 'bg-slate-50/60 border-slate-200 opacity-85'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={seg.enabled}
                            onChange={(e) =>
                              updateSegment(idx, { enabled: e.target.checked }, false)
                            }
                            className="w-4 h-4 accent-[#1d4ed8]"
                          />
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-[#0f1e36] text-white text-[11px] font-bold font-mono-num">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-bold text-slate-900">
                            {bi(
                              lang,
                              `المقطع ${idx + 1}: ${stageMeta?.ar || seg.direction}`,
                              `Segment ${idx + 1}: ${stageMeta?.en || seg.direction}`
                            )}
                          </span>
                          {stageMeta && (
                            <span className="text-[11px] text-slate-500 hidden sm:inline">
                              ({lang === 'ar' ? stageMeta.hintAr : stageMeta.hintEn})
                            </span>
                          )}
                        </label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-9 gap-2.5">
                        <div>
                          <label className={labelCls}>DATE</label>
                          <input
                            type="date"
                            value={seg.date}
                            onChange={(e) => updateSegment(idx, { date: e.target.value })}
                            className={`${inputCls} font-mono-num`}
                          />
                        </div>

                        <div>
                          <label className={labelCls}>Direction</label>
                          <input
                            type="text"
                            list="ops-directions-dl"
                            value={seg.direction}
                            onChange={(e) => updateSegment(idx, { direction: e.target.value })}
                            placeholder={stageMeta?.[lang] || ''}
                            className={inputCls}
                          />
                        </div>

                        <div>
                          <label className={labelCls}>From</label>
                          <input
                            type="text"
                            value={seg.fromLocation}
                            onChange={(e) => updateSegment(idx, { fromLocation: e.target.value })}
                            placeholder={bi(lang, 'من', 'From')}
                            className={inputCls}
                          />
                        </div>

                        <div>
                          <label className={labelCls}>To</label>
                          <input
                            type="text"
                            value={seg.toLocation}
                            onChange={(e) => updateSegment(idx, { toLocation: e.target.value })}
                            placeholder={bi(lang, 'إلى', 'To')}
                            className={inputCls}
                          />
                        </div>

                        <div>
                          <label className={labelCls}>Hotel</label>
                          <input
                            type="text"
                            list="ops-hotels-dl"
                            value={seg.hotelName}
                            onChange={(e) => updateSegment(idx, { hotelName: e.target.value })}
                            placeholder={bi(lang, 'الفندق', 'Hotel')}
                            className={inputCls}
                          />
                        </div>

                        <div>
                          <label className={labelCls}>Time (24H)</label>
                          <Time24Input
                            value={seg.time}
                            onChange={(val) => updateSegment(idx, { time: val })}
                          />
                        </div>

                        <div>
                          <label className={labelCls}>Driver number</label>
                          <input
                            type="tel"
                            dir="ltr"
                            value={seg.driverPhone}
                            onChange={(e) => updateSegment(idx, { driverPhone: e.target.value })}
                            placeholder="05xxxxxxxx"
                            className={`${inputCls} font-mono-num text-start`}
                          />
                        </div>

                        <div>
                          <label className={labelCls}>TOTAL BUS</label>
                          <input
                            type="number"
                            min={0}
                            value={seg.totalBus}
                            onChange={(e) => updateSegment(idx, { totalBus: e.target.value })}
                            className={`${inputCls} font-mono-num`}
                          />
                        </div>

                        <div>
                          <label className={labelCls}>{bi(lang, 'الحالة', 'Status')}</label>
                          <select
                            value={seg.status}
                            onChange={(e) =>
                              updateSegment(idx, { status: e.target.value as CycleStatus })
                            }
                            className={inputCls}
                          >
                            {(Object.keys(STATUS_LABELS) as CycleStatus[]).map((sk) => (
                              <option key={sk} value={sk}>
                                {STATUS_LABELS[sk][lang]}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="submit" disabled={saving} className={btnPrimaryCls}>
              <Plus className="w-3.5 h-3.5" />
              <span>
                {saving
                  ? bi(lang, 'جاري الحفظ...', 'Saving...')
                  : editId
                    ? bi(lang, 'تحديث العملية', 'Update Operation')
                    : bi(
                        lang,
                        `حفظ العمليات (${enabledSegmentsCount})`,
                        `Save Operations (${enabledSegmentsCount})`
                      )}
              </span>
            </button>
            {editId && (
              <button type="button" onClick={resetForm} className={btnSecondaryCls}>
                {bi(lang, 'إلغاء التعديل', 'Cancel Edit')}
              </button>
            )}
          </div>
        </form>

        <datalist id="ops-groups-dl">
          {Array.from(groupLookup.values()).map((g) => (
            <option key={g.groupNo} value={g.groupNo} />
          ))}
        </datalist>
        <datalist id="ops-agents-dl">
          {customerNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <datalist id="ops-directions-dl">
          {DIRECTION_SUGGESTIONS.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
        <datalist id="ops-hotels-dl">
          {hotelSuggestions.map((h) => (
            <option key={h} value={h} />
          ))}
        </datalist>
      </Panel>

      {/* Operations Table + Search */}
      <Panel
        className="no-print"
        title={bi(lang, 'جدول عمليات النقل', 'Transport Operations Schedule')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={bi(
                  lang,
                  'بحث في العمليات (المجموعة / الوكيل / الفندق / المسار / السائق)...',
                  'Search operations (Group / Agent / Hotel / Direction / Driver)...'
                )}
                className="h-9 ps-8 pe-3 rounded-xl border border-slate-200 text-xs w-64 sm:w-80 bg-white focus:outline-none focus:border-[#1d4ed8]"
              />
            </div>

            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              title={bi(lang, 'تصفية حسب التاريخ', 'Filter by date')}
              className="h-9 px-2.5 rounded-xl border border-slate-200 text-xs font-mono-num bg-white"
            />
            <button
              type="button"
              onClick={handleToggleTomorrowOnly}
              className={`h-9 px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition ${
                isTomorrowFilter
                  ? 'bg-[#1d4ed8] border-[#1d4ed8] text-white shadow-xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-[#1d4ed8] hover:text-[#1d4ed8]'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{bi(lang, 'غداً فقط', 'Tomorrow Only')}</span>
            </button>
            <select
              value={selectedTomorrowClient}
              onChange={(e) => handleTomorrowClientChange(e.target.value)}
              title={bi(lang, 'فلتر العميل على تحديد غداً فقط', 'Client filter for tomorrow only')}
              className={`h-9 px-2.5 rounded-xl border text-xs bg-white max-w-[230px] ${
                selectedTomorrowClient
                  ? 'border-[#1d4ed8] text-[#1d4ed8] font-bold bg-blue-50/60'
                  : 'border-slate-200 text-slate-700'
              }`}
            >
              <option value="">
                {bi(
                  lang,
                  `فلتر العميل — غداً (${tomorrowAgentOptions.length})`,
                  `Client Filter — Tomorrow (${tomorrowAgentOptions.length})`
                )}
              </option>
              {tomorrowAgentOptions.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.count})
                </option>
              ))}
            </select>
            {dateFilter && (
              <button
                type="button"
                onClick={() => setDateFilter('')}
                className="h-9 px-2.5 rounded-xl border border-slate-200 text-xs bg-slate-50 hover:bg-slate-100 text-slate-600 cursor-pointer"
              >
                {bi(lang, 'كل التواريخ', 'All Dates')}
              </button>
            )}

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | CycleStatus)}
              className="h-9 px-2.5 rounded-xl border border-slate-200 text-xs bg-white"
            >
              <option value="all">{bi(lang, 'كل الحالات', 'All Statuses')}</option>
              {(Object.keys(STATUS_LABELS) as CycleStatus[]).map((sk) => (
                <option key={sk} value={sk}>
                  {STATUS_LABELS[sk][lang]}
                </option>
              ))}
            </select>

            {hasActiveFilters && (
              <button type="button" onClick={clearAllFilters} className={btnSecondaryCls}>
                <X className="w-3.5 h-3.5" />
                <span>{bi(lang, 'مسح الفلاتر', 'Clear Filters')}</span>
              </button>
            )}

            <button type="button" onClick={() => exportExcel(false)} className={btnSecondaryCls}>
              <Download className="w-3.5 h-3.5" />
              <span>{bi(lang, 'تصدير إكسيل', 'Export Excel')}</span>
            </button>

            <button type="button" onClick={handlePrintSchedule} className={btnSecondaryCls}>
              <Printer className="w-3.5 h-3.5" />
              <span>{bi(lang, 'طباعة', 'Print')}</span>
            </button>

            <button
              type="button"
              disabled={exportingPdf}
              onClick={exportPdf}
              className={btnPrimaryCls}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>
                {exportingPdf
                  ? bi(lang, 'جاري تحويل PDF...', 'Exporting PDF...')
                  : bi(lang, 'تصدير PDF', 'Export PDF')}
              </span>
            </button>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <div>
            {bi(
              lang,
              `النتائج المعروضة: ${filteredOps.length} من أصل ${scheduleOps.length} عملية`,
              `Showing ${filteredOps.length} of ${scheduleOps.length} operations`
            )}
          </div>
          <div className="flex items-center gap-2 no-print">
            <span>{bi(lang, 'عرض:', 'Rows:')}</span>
            {[10, 20, 30, 50, 0].map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => setPageSize(sz)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                  pageSize === sz
                    ? 'bg-[#1d4ed8] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {sz === 0 ? bi(lang, 'الكل', 'All') : sz}
              </button>
            ))}
          </div>
        </div>

        {(activeFilterCols.length > 0 || sortState !== null) && (
          <div className="no-print mb-3 px-3 py-2 rounded-xl bg-blue-50/70 border border-blue-200 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-[#1d4ed8] flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5" />
              <span>{bi(lang, 'الفلاتر النشطة:', 'Active Filters:')}</span>
            </span>
            {activeFilterCols.map((col) => {
              const count = selectedFilters[col]?.length ?? 0;
              return (
                <span
                  key={col}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-blue-200 text-slate-800 font-semibold"
                >
                  <span>
                    {OPS_FILTER_LABELS[col]} ({count})
                  </span>
                  <button
                    type="button"
                    onClick={() => clearSingleColumnFilter(col)}
                    title={bi(lang, 'إزالة الفلتر', 'Remove filter')}
                    className="text-slate-400 hover:text-red-600 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
            {sortState && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-blue-200 text-slate-800 font-semibold">
                <span>
                  {bi(lang, 'ترتيب:', 'Sort:')} {OPS_FILTER_LABELS[sortState.col]}{' '}
                  {sortState.dir === 'asc'
                    ? bi(lang, '(تصاعدي)', '(Asc)')
                    : bi(lang, '(تنازلي)', '(Desc)')}
                </span>
                <button
                  type="button"
                  onClick={() => setSortState(null)}
                  title={bi(lang, 'إزالة الترتيب', 'Remove sort')}
                  className="text-slate-400 hover:text-red-600 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={clearAllFilters}
              className="ms-auto text-[11px] font-bold text-[#1d4ed8] hover:underline cursor-pointer"
            >
              {bi(lang, 'مسح الكل', 'Clear All')}
            </button>
          </div>
        )}

        <div className="overflow-x-auto ops-print-scroll">
          <table className="ops-print-table w-full text-xs border-collapse min-w-[1250px]">
            <thead>
              <tr className="bg-slate-50 text-slate-700 border-b border-slate-200">
                {OPS_FILTER_COLS.map(({ col, label }) => {
                  const isFiltered = selectedFilters[col] !== undefined;
                  const isSorted = sortState?.col === col;
                  const isActive = isFiltered || isSorted;
                  const isOpen = openFilterMenu?.col === col;
                  const isDriverCol = col === 'driverPhone';
                  return (
                    <th
                      key={col}
                      className={`py-2.5 px-2.5 text-start font-bold whitespace-nowrap ${
                        isDriverCol ? 'ops-driver-header text-red-600' : ''
                      }`}
                    >
                      <div className="inline-flex items-center gap-1.5">
                        {isDriverCol && <DriverWheelIcon className="w-4 h-4 text-red-600 shrink-0" />}
                        <span className={isDriverCol ? 'text-red-600 font-extrabold' : ''}>{label}</span>
                        <button
                          type="button"
                          onClick={(ev) => toggleFilterMenu(col, ev.currentTarget)}
                          title={bi(lang, `فلترة حسب ${label}`, `Filter by ${label}`)}
                          className={`no-print ops-filter-trigger inline-flex items-center justify-center w-6 h-6 rounded-md border transition cursor-pointer ${
                            isActive || isOpen
                              ? 'bg-[#1d4ed8] border-[#1d4ed8] text-white shadow-xs'
                              : 'bg-white border-slate-200 text-slate-500 hover:border-[#1d4ed8] hover:text-[#1d4ed8]'
                          }`}
                        >
                          {isSorted && !isFiltered ? (
                            sortState?.dir === 'asc' ? (
                              <ArrowUp className="w-3 h-3" />
                            ) : (
                              <ArrowDown className="w-3 h-3" />
                            )
                          ) : (
                            <Filter className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </th>
                  );
                })}
                <th className="py-2.5 px-2.5 text-start font-bold whitespace-nowrap">{bi(lang, 'الحالة', 'Status')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold whitespace-nowrap no-print">
                  {bi(lang, 'إجراء', 'Actions')}
                </th>
              </tr>
              <tr className="no-print bg-slate-50/60 border-b border-slate-200">
                {OPS_FILTER_COLS.map(({ col, label, numeric }) => (
                  <th key={col} className="py-1.5 px-1.5">
                    <input
                      type="text"
                      value={colFilters[col]}
                      onChange={(e) => updateColFilter(col, e.target.value)}
                      placeholder={label}
                      className={`w-full ${numeric ? 'min-w-[58px] font-mono-num' : 'min-w-[78px]'} h-7 px-2 rounded-lg border border-slate-200 bg-white text-[11px] font-normal text-slate-800 focus:outline-none focus:border-[#1d4ed8]`}
                    />
                  </th>
                ))}
                <th className="py-1.5 px-2 text-[11px] font-normal text-slate-400">—</th>
                <th className="py-1.5 px-1.5 text-center">
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      title={bi(lang, 'مسح الفلاتر', 'Clear Filters')}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-200/70 hover:bg-slate-300 text-slate-700 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedOps.length === 0 ? (
                <EmptyRow colSpan={13} lang={lang} />
              ) : (
                displayedOps.map((op) => {
                  const stMeta = STATUS_LABELS[op.status] || STATUS_LABELS.pending;
                  return (
                    <tr key={op.id} className="hover:bg-slate-50/70">
                      <td className="py-2 px-2.5 font-bold text-slate-900 whitespace-nowrap">{op.groupNo}</td>
                      <td className="py-2 px-2.5 font-medium text-slate-800">{op.agentName || '-'}</td>
                      <td className="py-2 px-2.5 font-mono-num font-semibold">{op.totalPax}</td>
                      <td className="py-2 px-2.5 font-mono-num font-semibold">{op.totalBus}</td>
                      <td className="py-2 px-2.5 font-mono-num whitespace-nowrap">{op.date || '-'}</td>
                      <td className="py-2 px-2.5">{op.direction || '-'}</td>
                      <td className="py-2 px-2.5">{op.fromLocation || '-'}</td>
                      <td className="py-2 px-2.5">{op.toLocation || '-'}</td>
                      <td className="py-2 px-2.5">{op.hotelName || '-'}</td>
                      <td className="py-2 px-2.5 font-mono-num whitespace-nowrap">{op.time || '-'}</td>
                      <td className="py-2 px-2.5 font-mono-num whitespace-nowrap" dir="ltr">
                        <span className="ops-driver-cell inline-flex items-center gap-1.5 font-bold text-red-600">
                          <DriverWheelIcon className="w-4 h-4 text-red-600 shrink-0" />
                          <span>{op.driverPhone || '-'}</span>
                        </span>
                      </td>
                      <td className="py-2 px-2.5">
                        <select
                          value={op.status}
                          onChange={(e) => handleQuickStatusChange(op, e.target.value as CycleStatus)}
                          className={`px-2 py-1 rounded-full text-[11px] font-semibold border-0 cursor-pointer focus:outline-none ${stMeta.cls}`}
                        >
                          {(Object.keys(STATUS_LABELS) as CycleStatus[]).map((sk) => (
                            <option key={sk} value={sk}>
                              {STATUS_LABELS[sk][lang]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-2.5 no-print">
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={() => handleEdit(op)} className={btnSoftBlueCls}>
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onConfirm({
                                title: bi(lang, 'حذف العملية', 'Delete Operation'),
                                message: bi(
                                  lang,
                                  `هل تريد حذف هذه العملية للمجموعة ${op.groupNo}؟`,
                                  `Delete this operation for group ${op.groupNo}?`
                                ),
                                danger: true,
                                onConfirm: () => onDeleteOperation(op.id),
                              })
                            }
                            className={btnSoftRedCls}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredOps.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100/90 border-t-2 border-slate-300 font-bold text-slate-900">
                  <td colSpan={2} className="py-2.5 px-2.5">
                    {bi(lang, `الإجمالي (${filteredOps.length} عملية)`, `Total (${filteredOps.length} ops)`)}
                  </td>
                  <td className="py-2.5 px-2.5 font-mono-num">{filteredSumPax}</td>
                  <td className="py-2.5 px-2.5 font-mono-num">{filteredSumBus}</td>
                  <td colSpan={9} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Pagination Controls */}
        {pageSize > 0 && totalPages > 1 && (
          <div className="no-print mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>
              {bi(lang, `صفحة ${safePage} من ${totalPages}`, `Page ${safePage} of ${totalPages}`)}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className={btnSecondaryCls}
              >
                {bi(lang, 'السابق', 'Prev')}
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className={btnSecondaryCls}
              >
                {bi(lang, 'التالي', 'Next')}
              </button>
            </div>
          </div>
        )}
      </Panel>

      {/* Excel-style Column Filter Popover */}
      {openFilterMenu && (() => {
        const col = openFilterMenu.col;
        const allOptions = columnOptions[col];
        const qMenu = toWestDigits(menuSearch).toLowerCase().trim();
        const visibleOptions = qMenu
          ? allOptions.filter((o) => toWestDigits(o.label).toLowerCase().includes(qMenu))
          : allOptions;
        const currentSelected = selectedFilters[col];
        const allSelectedCount =
          currentSelected === undefined ? allOptions.length : currentSelected.length;

        return (
          <div
            ref={popoverRef}
            className="no-print ops-filter-popover fixed z-50 w-66 bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden text-xs"
          >
            <div className="px-3 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 truncate">
                <Filter className="w-3.5 h-3.5 text-[#1d4ed8] shrink-0" />
                <span className="truncate">{OPS_FILTER_LABELS[col]}</span>
              </div>
              <button
                type="button"
                onClick={() => setOpenFilterMenu(null)}
                title={bi(lang, 'إغلاق', 'Close')}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {col === 'agentName' && (
              <div className="p-2 border-b border-slate-100 bg-blue-50/40">
                <button
                  type="button"
                  onClick={handleToggleTomorrowOnly}
                  className={`w-full h-8 px-2.5 rounded-lg border flex items-center justify-center gap-1.5 font-bold transition cursor-pointer ${
                    isTomorrowFilter
                      ? 'bg-[#1d4ed8] border-[#1d4ed8] text-white'
                      : 'bg-white border-blue-200 text-[#1d4ed8] hover:bg-blue-50'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>
                    {isTomorrowFilter
                      ? bi(lang, `مفعّل: تحديد غداً فقط (${tomorrowDate})`, `Active: Tomorrow Only (${tomorrowDate})`)
                      : bi(lang, `تحديد غداً فقط (${tomorrowDate})`, `Tomorrow Only (${tomorrowDate})`)}
                  </span>
                </button>
              </div>
            )}

            <div className="p-2 border-b border-slate-100 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setSortState((prev) =>
                    prev?.col === col && prev.dir === 'asc' ? null : { col, dir: 'asc' }
                  )
                }
                className={`h-8 px-2 rounded-lg border flex items-center justify-center gap-1 font-semibold transition cursor-pointer ${
                  sortState?.col === col && sortState.dir === 'asc'
                    ? 'bg-[#1d4ed8] border-[#1d4ed8] text-white'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <ArrowUp className="w-3 h-3" />
                <span>{bi(lang, 'تصاعدي', 'Asc')}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setSortState((prev) =>
                    prev?.col === col && prev.dir === 'desc' ? null : { col, dir: 'desc' }
                  )
                }
                className={`h-8 px-2 rounded-lg border flex items-center justify-center gap-1 font-semibold transition cursor-pointer ${
                  sortState?.col === col && sortState.dir === 'desc'
                    ? 'bg-[#1d4ed8] border-[#1d4ed8] text-white'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <ArrowDown className="w-3 h-3" />
                <span>{bi(lang, 'تنازلي', 'Desc')}</span>
              </button>
            </div>

            <div className="p-2 border-b border-slate-100 space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={menuSearch}
                  onChange={(e) => setMenuSearch(e.target.value)}
                  placeholder={bi(lang, 'ابحث في القيم...', 'Search values...')}
                  className="w-full h-8 ps-8 pe-7 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-[#1d4ed8]"
                  autoFocus
                />
                {menuSearch && (
                  <button
                    type="button"
                    onClick={() => setMenuSearch('')}
                    className="absolute top-1/2 -translate-y-1/2 end-2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between text-[11px] px-0.5">
                <button
                  type="button"
                  onClick={() => selectAllColumnOptions(col)}
                  className="font-bold text-[#1d4ed8] hover:underline cursor-pointer"
                >
                  {bi(lang, 'تحديد الكل', 'Select All')}
                </button>
                <span className="text-slate-400 font-mono-num">
                  {allSelectedCount} / {allOptions.length}
                </span>
                <button
                  type="button"
                  onClick={() => clearColumnOptionsSelection(col)}
                  className="font-semibold text-slate-600 hover:text-red-600 hover:underline cursor-pointer"
                >
                  {bi(lang, 'إلغاء التحديد', 'Clear All')}
                </button>
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto p-1.5 divide-y divide-slate-50">
              {visibleOptions.length === 0 ? (
                <div className="py-5 text-center text-slate-400">
                  {bi(lang, 'لا توجد قيم مطابقة', 'No matching values')}
                </div>
              ) : (
                visibleOptions.map((opt) => {
                  const checked =
                    currentSelected === undefined || currentSelected.includes(opt.key);
                  return (
                    <label
                      key={opt.key}
                      className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer select-none"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOptionValue(col, opt.key)}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-[#1d4ed8] focus:ring-[#1d4ed8] cursor-pointer shrink-0"
                        />
                        <span className="truncate text-slate-800 font-medium">{opt.label}</span>
                      </span>
                      <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-mono-num shrink-0">
                        {opt.count}
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="p-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => clearSingleColumnFilter(col)}
                disabled={currentSelected === undefined && sortState?.col !== col}
                className="px-2.5 h-7 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              >
                {bi(lang, 'مسح فلتر العمود', 'Reset Column')}
              </button>
              <button
                type="button"
                onClick={() => setOpenFilterMenu(null)}
                className="px-3 h-7 rounded-lg bg-[#1d4ed8] text-white text-[11px] font-bold hover:bg-blue-800 cursor-pointer"
              >
                {bi(lang, 'إغلاق', 'Done')}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Dedicated Landscape Print Sheet matching Reference PDF */}
      <div
        dir="ltr"
        className="hidden print:block ops-print-sheet relative bg-white text-[#0f172a]"
      >
        <img
          src="/logo.png"
          alt=""
          className="pointer-events-none select-none fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[260px] h-[260px] object-contain opacity-[0.05] z-0"
        />
        <div className="relative z-10">
          <div className="flex items-center justify-between gap-4 border-b-2 border-[#0f1e36] pb-3 mb-3">
            <div className="flex items-center gap-3.5">
              <img
                src="/logo.png"
                alt="BEST UNITED TRAVEL"
                className="w-[68px] h-[68px] object-contain rounded-xl border border-slate-300 p-1 bg-white shrink-0"
              />
              <div>
                <div className="text-[18px] font-bold text-[#0f1e36] leading-tight">
                  BEST UNITED TRAVEL &amp; TOURISM
                </div>
                <div className="text-[12.5px] font-semibold text-[#1e3a8a] mt-0.5">
                  {exportMeta.clientName
                    ? `Transport Operations Schedule — ${exportMeta.clientName} (${exportMeta.selectedDate})`
                    : `Transport Operations Schedule (${exportMeta.selectedDate})`}
                </div>
                <div className="text-[10.5px] text-slate-600 mt-0.5">
                  {`Operations: ${filteredOps.length} | Total Pax: ${filteredSumPax} | TOTAL BUS: ${filteredSumBus}`}
                </div>
              </div>
            </div>
            <div className="text-right text-[11px] text-slate-700 leading-relaxed">
              <div className="font-bold text-[#0f1e36]">
                Printed by: {printedByLabel}
              </div>
              <div className="font-mono-num" dir="ltr">
                {todayDate} · {formatTime24(new Date())}
              </div>
            </div>
          </div>

          <table className="w-full border-collapse text-[11px] leading-snug text-left">
            <thead>
              <tr className="bg-[#0f1e36] text-white font-bold">
                <th className="py-2 px-2 text-left whitespace-nowrap">GROUP NO</th>
                <th className="py-2 px-2 text-left whitespace-nowrap">AGENT NAME</th>
                <th className="py-2 px-2 text-center whitespace-nowrap">Total Pax</th>
                <th className="py-2 px-2 text-center whitespace-nowrap">TOTAL BUS</th>
                <th className="py-2 px-2 text-left whitespace-nowrap">DATE</th>
                <th className="py-2 px-2 text-left whitespace-nowrap">Direction</th>
                <th className="py-2 px-2 text-left whitespace-nowrap">From</th>
                <th className="py-2 px-2 text-left whitespace-nowrap">To</th>
                <th className="py-2 px-2 text-left whitespace-nowrap">Hotel</th>
                <th className="py-2 px-1.5 text-left whitespace-nowrap">Time</th>
                <th className="py-2 px-1.5 text-left whitespace-nowrap text-red-300">
                  <span className="inline-flex items-center gap-1 text-red-300">
                    <DriverWheelIcon className="w-3.5 h-3.5 text-red-300 shrink-0" />
                    <span>Driver number</span>
                  </span>
                </th>
                <th className="py-2 px-1.5 text-left whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredOps.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-6 text-center text-slate-500 font-semibold">
                    No matching operations
                  </td>
                </tr>
              ) : (
                filteredOps.map((op, idx) => {
                  const stLabel = STATUS_LABELS[op.status]?.en || op.status;
                  return (
                    <tr
                      key={op.id}
                      className={`${
                        idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'
                      } border-b border-slate-200`}
                    >
                      <td className="py-2 px-2 font-bold text-[#0f172a] whitespace-nowrap">
                        {op.groupNo}
                      </td>
                      <td className="py-2 px-2 text-[#1e293b]">
                        {op.agentName || '-'}
                      </td>
                      <td className="py-2 px-2 font-mono-num font-semibold text-center">
                        {op.totalPax}
                      </td>
                      <td className="py-2 px-2 font-mono-num font-semibold text-center">
                        {op.totalBus}
                      </td>
                      <td className="py-2 px-2 font-mono-num whitespace-nowrap">
                        {op.date || '-'}
                      </td>
                      <td className="py-2 px-2">{op.direction || '-'}</td>
                      <td className="py-2 px-2">{op.fromLocation || '-'}</td>
                      <td className="py-2 px-2">{op.toLocation || '-'}</td>
                      <td className="py-2 px-2">{op.hotelName || '-'}</td>
                      <td className="py-2 px-1.5 font-mono-num whitespace-nowrap">
                        {op.time || '-'}
                      </td>
                      <td
                        className="py-2 px-1.5 font-mono-num font-bold text-[#dc2626] whitespace-nowrap"
                        dir="ltr"
                      >
                        <span className="inline-flex items-center gap-1 text-[#dc2626] font-bold">
                          <DriverWheelIcon className="w-3.5 h-3.5 text-[#dc2626] shrink-0" />
                          <span>{op.driverPhone || '-'}</span>
                        </span>
                      </td>
                      <td className="py-2 px-1.5 whitespace-nowrap">{stLabel}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredOps.length > 0 && (
              <tfoot>
                <tr className="bg-[#e2e8f0] font-bold text-[#0f172a] border-t-2 border-slate-400">
                  <td colSpan={2} className="py-2 px-2">
                    {`Total (${filteredOps.length} ops)`}
                  </td>
                  <td className="py-2 px-2 font-mono-num text-center">{filteredSumPax}</td>
                  <td className="py-2 px-2 font-mono-num text-center">{filteredSumBus}</td>
                  <td colSpan={8} className="py-2 px-2" />
                </tr>
              </tfoot>
            )}
          </table>

          <div className="mt-3 pt-1.5 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-500">
            <span>BEST UNITED TRAVEL &amp; TOURISM · Season 1448H</span>
            <span>
              Printed by: {printedByLabel} · {todayDate} {formatTime24(new Date())}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
