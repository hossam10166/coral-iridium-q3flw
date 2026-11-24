import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CheckSquare,
  Download,
  Edit3,
  FileSpreadsheet,
  Filter,
  Plus,
  Search,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  AccountingDB,
  Currency,
  DEFAULT_ROUTES,
  Lang,
  ROUTE_EN,
  TransportEntry,
  VEHICLE_EN,
  VEHICLE_TYPES,
} from '../../types/accounting';
import { bi, tKey } from '../../i18n/translations';
import {
  csvDownload,
  fmt,
  fmtUSD,
  getPartyNames,
  nextTrnRef,
  sumBy,
  tRoute,
  tVeh,
  toSAR,
  toWestDigits,
  today,
  trnVals,
} from '../../utils/calculations';
import {
  ConfirmConfig,
  EmptyRow,
  KpiCard,
  Panel,
  btnDangerCls,
  btnPrimaryCls,
  btnSecondaryCls,
  btnSoftBlueCls,
  btnSoftRedCls,
  btnTealCls,
  inputCls,
  labelCls,
} from '../AccountingUI';

interface TransportPageProps {
  db: AccountingDB;
  lang: Lang;
  prefillGroup?: string | null;
  onConsumePrefill?: () => void;
  onSave: (item: TransportEntry, isEdit: boolean) => Promise<void>;
  onImportBatch?: (items: TransportEntry[], mode: 'append' | 'replace') => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onDeleteBatch?: (ids: number[]) => Promise<void>;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
  onConfirm: (cfg: ConfirmConfig) => void;
}

type TrnFilterCol =
  | 'refNo'
  | 'date'
  | 'groupNo'
  | 'routeVehicle'
  | 'customer'
  | 'supplier'
  | 'cost'
  | 'sales'
  | 'profit';

interface TrnFilterOptionItem {
  key: string;
  label: string;
  count: number;
  sortVal: string | number;
}

const TRN_FILTER_COLS: TrnFilterCol[] = [
  'refNo',
  'date',
  'groupNo',
  'routeVehicle',
  'customer',
  'supplier',
  'cost',
  'sales',
  'profit',
];

const EMPTY_TRN_COL_FILTERS: Record<TrnFilterCol, string> = {
  refNo: '',
  date: '',
  groupNo: '',
  routeVehicle: '',
  customer: '',
  supplier: '',
  cost: '',
  sales: '',
  profit: '',
};

function getTrnFilterColLabel(col: TrnFilterCol, lang: Lang): string {
  switch (col) {
    case 'refNo':
      return tKey(lang, 'thRef');
    case 'date':
      return tKey(lang, 'thDate');
    case 'groupNo':
      return tKey(lang, 'thGroup');
    case 'routeVehicle':
      return tKey(lang, 'thRouteVehicle');
    case 'customer':
      return tKey(lang, 'thCustomer');
    case 'supplier':
      return tKey(lang, 'thTrnSupp');
    case 'cost':
      return tKey(lang, 'thCost');
    case 'sales':
      return tKey(lang, 'thSales');
    case 'profit':
      return tKey(lang, 'thProfit');
  }
}

function getTrnFilterMeta(
  x: TransportEntry,
  col: TrnFilterCol,
  defaultRate: number,
  lang: Lang
): { key: string; label: string; sortVal: string | number } {
  const v = trnVals(x, defaultRate);
  const emptyLbl = bi(lang, '(فارغ)', '(Empty)');
  switch (col) {
    case 'refNo': {
      const val = (x.refNo || '').trim();
      return { key: val, label: val || emptyLbl, sortVal: val };
    }
    case 'date': {
      const val = (x.date || '').trim();
      return { key: val, label: val || emptyLbl, sortVal: val };
    }
    case 'groupNo': {
      const val = (x.groupNo || '').trim();
      return { key: val, label: val || emptyLbl, sortVal: val };
    }
    case 'routeVehicle': {
      const lbl = `${tRoute(x.route, lang)} · ${tVeh(x.vehicleType, lang)}`;
      return { key: lbl, label: lbl, sortVal: lbl };
    }
    case 'customer': {
      const val = (x.customer || '').trim();
      return { key: val, label: val || emptyLbl, sortVal: val };
    }
    case 'supplier': {
      const val = (x.supplier || '').trim();
      return { key: val, label: val || emptyLbl, sortVal: val };
    }
    case 'cost': {
      const key = fmt(v.cost);
      return { key, label: `${key} ${bi(lang, 'ر.س', 'SAR')}`, sortVal: v.cost };
    }
    case 'sales': {
      const key = fmt(v.sales);
      return { key, label: `${key} ${bi(lang, 'ر.س', 'SAR')}`, sortVal: v.sales };
    }
    case 'profit': {
      const key = fmt(v.profit);
      return { key, label: `${key} ${bi(lang, 'ر.س', 'SAR')}`, sortVal: v.profit };
    }
  }
}

type TrnImportField =
  | 'refNo'
  | 'groupNo'
  | 'date'
  | 'route'
  | 'vehicleType'
  | 'vehicleCount'
  | 'pax'
  | 'customer'
  | 'supplier'
  | 'currency'
  | 'buy'
  | 'sell'
  | 'rate'
  | 'driverName'
  | 'plateNo'
  | 'notes';

function normalizeTrnHeaderKey(raw: string): string {
  return toWestDigits(String(raw || ''))
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\s_\-./#()*]+/g, '');
}

const TRN_HEADER_ALIAS_MAP: Record<string, TrnImportField> = {
  // Ref No
  refno: 'refNo',
  ref: 'refNo',
  reference: 'refNo',
  referenceno: 'refNo',
  trnref: 'refNo',
  المرجع: 'refNo',
  رقمالمرجع: 'refNo',
  مرجع: 'refNo',
  رقمالحركه: 'refNo',
  // Group No
  groupno: 'groupNo',
  group: 'groupNo',
  grpno: 'groupNo',
  grp: 'groupNo',
  groupnumber: 'groupNo',
  المجموعه: 'groupNo',
  رقممجموعه: 'groupNo',
  رقمالمجموعه: 'groupNo',
  مجموعه: 'groupNo',
  // Date
  date: 'date',
  trndate: 'date',
  movementdate: 'date',
  التاريخ: 'date',
  تاريخ: 'date',
  تاريخالنقل: 'date',
  تاريخالتنفيذ: 'date',
  // Route
  route: 'route',
  routetype: 'route',
  direction: 'route',
  stage: 'route',
  المسار: 'route',
  نوعالمسار: 'route',
  خطالسير: 'route',
  الاتجاه: 'route',
  // Vehicle Type
  vehicletype: 'vehicleType',
  vehicle: 'vehicleType',
  bustype: 'vehicleType',
  المركبه: 'vehicleType',
  نوعالمركبه: 'vehicleType',
  نوعالباص: 'vehicleType',
  // Vehicle Count
  vehiclecount: 'vehicleCount',
  vehicles: 'vehicleCount',
  buscount: 'vehicleCount',
  totalbus: 'vehicleCount',
  totalbuses: 'vehicleCount',
  buses: 'vehicleCount',
  bus: 'vehicleCount',
  qty: 'vehicleCount',
  count: 'vehicleCount',
  عددالمركبات: 'vehicleCount',
  عددالباصات: 'vehicleCount',
  الباصات: 'vehicleCount',
  العدد: 'vehicleCount',
  // Pax
  pax: 'pax',
  totalpax: 'pax',
  passengers: 'pax',
  pilgrims: 'pax',
  عددالمعتمرين: 'pax',
  المعتمرين: 'pax',
  عددالركاب: 'pax',
  // Customer
  customer: 'customer',
  customername: 'customer',
  client: 'customer',
  clientname: 'customer',
  agent: 'customer',
  agentname: 'customer',
  العميل: 'customer',
  اسمالعميل: 'customer',
  الوكيل: 'customer',
  اسمالوكيل: 'customer',
  // Supplier
  supplier: 'supplier',
  transportsupplier: 'supplier',
  suppliername: 'supplier',
  vendor: 'supplier',
  company: 'supplier',
  المورد: 'supplier',
  موردالنقل: 'supplier',
  اسمموردالنقل: 'supplier',
  اسممورد: 'supplier',
  اسمالمورد: 'supplier',
  شركهالنقل: 'supplier',
  // Currency
  currency: 'currency',
  curr: 'currency',
  العمله: 'currency',
  عمله: 'currency',
  // Buy
  buy: 'buy',
  buyprice: 'buy',
  unitbuy: 'buy',
  cost: 'buy',
  costprice: 'buy',
  الشراء: 'buy',
  سعرالشراء: 'buy',
  سعرشراء: 'buy',
  شراء: 'buy',
  التكلفه: 'buy',
  تكلفهالشراء: 'buy',
  تكلفهالمركبه: 'buy',
  // Sell
  sell: 'sell',
  sellprice: 'sell',
  unitsell: 'sell',
  sales: 'sell',
  price: 'sell',
  البيع: 'sell',
  سعرالبيع: 'sell',
  سعربيع: 'sell',
  بيع: 'sell',
  قيمهالبيع: 'sell',
  سعرالمبيع: 'sell',
  // FX Rate
  rate: 'rate',
  fxrate: 'rate',
  exchangerate: 'rate',
  سعرالصرف: 'rate',
  الصرف: 'rate',
  // Driver Name
  driver: 'driverName',
  drivername: 'driverName',
  drivernumber: 'driverName',
  driverphone: 'driverName',
  السائق: 'driverName',
  اسمالسائق: 'driverName',
  رقمالسائق: 'driverName',
  // Plate No
  plateno: 'plateNo',
  plate: 'plateNo',
  platenumber: 'plateNo',
  اللوحه: 'plateNo',
  رقماللوحه: 'plateNo',
  // Notes
  notes: 'notes',
  note: 'notes',
  remarks: 'notes',
  ملاحظات: 'notes',
  ملاحظه: 'notes',
};

function formatTrnExcelDate(val: unknown): string {
  if (val === null || val === undefined || val === '') return today();
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
  const s = toWestDigits(String(val)).trim();
  if (!s) return today();
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const mon = dmy[2].padStart(2, '0');
    const yr = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3].padStart(4, '0');
    return `${yr}-${mon}-${day}`;
  }
  const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  }
  return s.length >= 8 ? s.slice(0, 20) : today();
}

function parseTrnNumeric(val: unknown, fallback = 0): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : fallback;
  const cleaned = toWestDigits(String(val ?? ''))
    .replace(/,/g, '')
    .replace(/[^\d.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) && cleaned !== '' ? n : fallback;
}

function resolveTrnCurrency(val: unknown): Currency {
  const s = String(val ?? '').trim().toUpperCase();
  if (s.includes('USD') || s.includes('$') || s.includes('دولار')) return 'USD';
  return 'SAR';
}

function resolveTrnRoute(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_ROUTES[0];
  const lower = trimmed.toLowerCase();
  for (const [ar, en] of Object.entries(ROUTE_EN)) {
    if (ar === trimmed || en.toLowerCase() === lower) {
      return DEFAULT_ROUTES.includes(ar) ? ar : trimmed;
    }
  }
  return trimmed;
}

function resolveTrnVehicle(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return VEHICLE_TYPES[0];
  const lower = trimmed.toLowerCase();
  for (const [ar, en] of Object.entries(VEHICLE_EN)) {
    if (ar === trimmed || en.toLowerCase() === lower) {
      return ar;
    }
  }
  return trimmed;
}

export const TransportPage: React.FC<TransportPageProps> = ({
  db,
  lang,
  prefillGroup,
  onConsumePrefill,
  onSave,
  onImportBatch,
  onDelete,
  onDeleteBatch,
  onToast,
  onConfirm,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const [editId, setEditId] = useState<number | null>(null);
  const [refNo, setRefNo] = useState(() => nextTrnRef(db));
  const [groupNo, setGroupNo] = useState('');
  const [date, setDate] = useState(today());
  const [routeSelect, setRouteSelect] = useState(DEFAULT_ROUTES[0]);
  const [customRoute, setCustomRoute] = useState('');
  const [vehicleType, setVehicleType] = useState(VEHICLE_TYPES[0]);
  const [vehicleCount, setVehicleCount] = useState('1');
  const [pax, setPax] = useState('0');
  const [customer, setCustomer] = useState('');
  const [supplier, setSupplier] = useState('');
  const [currency, setCurrency] = useState<Currency>('SAR');
  const [buy, setBuy] = useState('0');
  const [sell, setSell] = useState('0');
  const [rate, setRate] = useState(String(db.rate || 3.75));
  const [driverName, setDriverName] = useState('');
  const [plateNo, setPlateNo] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [filterRoute, setFilterRoute] = useState('all');
  const [filterVehicle, setFilterVehicle] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [colFilters, setColFilters] = useState<Record<TrnFilterCol, string>>({
    ...EMPTY_TRN_COL_FILTERS,
  });
  const [selectedFilters, setSelectedFilters] = useState<Partial<Record<TrnFilterCol, string[]>>>({});
  const [sortState, setSortState] = useState<{ col: TrnFilterCol; dir: 'asc' | 'desc' } | null>(null);
  const [openFilterMenu, setOpenFilterMenu] = useState<{
    col: TrnFilterCol;
    top: number;
    left: number;
  } | null>(null);
  const [menuSearch, setMenuSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [deletingBulk, setDeletingBulk] = useState(false);
  const [pendingImport, setPendingImport] = useState<{
    fileName: string;
    rows: TransportEntry[];
  } | null>(null);
  const [importing, setImporting] = useState(false);

  const customerNames = useMemo(() => getPartyNames(db, 'customer', lang), [db, lang]);
  const trnSuppliers = useMemo(() => getPartyNames(db, 'supplier', lang, 'transport'), [db, lang]);

  useEffect(() => {
    if (!editId) {
      setRefNo(nextTrnRef(db));
    }
  }, [db.transports.length, editId, db]);

  const groupSuggestions = useMemo(() => {
    const s = new Set<string>();
    db.entries.forEach((e) => e.groupNo?.trim() && s.add(e.groupNo.trim()));
    db.transports.forEach((t) => t.groupNo?.trim() && s.add(t.groupNo.trim()));
    return Array.from(s);
  }, [db.entries, db.transports]);

  useEffect(() => {
    if (prefillGroup) {
      setEditId(null);
      setGroupNo(prefillGroup);
      const found = db.entries.find((e) => e.groupNo === prefillGroup);
      if (found) {
        setCustomer(found.customer);
        setPax(String(found.pax));
      } else {
        const trnFound = db.transports.find((t) => t.groupNo === prefillGroup);
        if (trnFound) {
          if (trnFound.customer) setCustomer(trnFound.customer);
          if (trnFound.pax) setPax(String(trnFound.pax));
        }
      }
      onConsumePrefill?.();
    }
  }, [prefillGroup, db.entries, db.transports, onConsumePrefill]);

  const handleGroupChange = (val: string) => {
    setGroupNo(val);
    const trimmed = val.trim();
    const found = db.entries.find((e) => e.groupNo === trimmed);
    if (found) {
      if (!customer.trim()) setCustomer(found.customer);
      if (!Number(pax)) setPax(String(found.pax));
    } else {
      const trnFound = db.transports.find((t) => t.groupNo === trimmed);
      if (trnFound) {
        if (!customer.trim() && trnFound.customer) setCustomer(trnFound.customer);
        if (!Number(pax) && trnFound.pax) setPax(String(trnFound.pax));
      }
    }
  };

  const resetForm = () => {
    setEditId(null);
    setRefNo(nextTrnRef(db));
    setGroupNo('');
    setDate(today());
    setRouteSelect(DEFAULT_ROUTES[0]);
    setCustomRoute('');
    setVehicleType(VEHICLE_TYPES[0]);
    setVehicleCount('1');
    setPax('0');
    setCustomer('');
    setSupplier('');
    setCurrency('SAR');
    setBuy('0');
    setSell('0');
    setRate(String(db.rate || 3.75));
    setDriverName('');
    setPlateNo('');
    setNotes('');
  };

  const fxRate = Number(rate || db.rate || 3.75) || 3.75;
  const cntNum = Math.max(1, Number(vehicleCount || 1));
  const previewCost = toSAR(buy, currency, fxRate, db.rate) * cntNum;
  const previewSales = toSAR(sell, currency, fxRate, db.rate) * cntNum;
  const previewProfit = previewSales - previewCost;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedRoute = routeSelect === '__custom__' ? customRoute.trim() : routeSelect;
    if (!refNo.trim() || !date || !resolvedRoute || !supplier.trim()) {
      onToast(
        bi(lang, 'يرجى إكمال المرجع والتاريخ والمسار ومورد النقل', 'Please enter Ref #, Date, Route, and Transport Supplier'),
        'error'
      );
      return;
    }

    const payload: TransportEntry = {
      id: editId || Date.now(),
      refNo: refNo.trim(),
      groupNo: groupNo.trim(),
      date,
      route: resolvedRoute,
      vehicleType,
      vehicleCount: Math.max(1, Math.round(Number(vehicleCount || 1))),
      pax: Math.max(0, Math.round(Number(pax || 0))),
      customer: customer.trim(),
      supplier: supplier.trim(),
      currency,
      buy: Math.max(0, Number(buy || 0)),
      sell: Math.max(0, Number(sell || 0)),
      rate: fxRate,
      driverName: driverName.trim(),
      plateNo: plateNo.trim(),
      notes: notes.trim(),
    };

    setSaving(true);
    try {
      await onSave(payload, Boolean(editId));
      onToast(
        editId
          ? bi(lang, 'تم تحديث عملية النقل', 'Transport entry updated')
          : bi(lang, 'تم حفظ بيانات النقل', 'Transport entry saved')
      );
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: TransportEntry) => {
    setEditId(item.id);
    setRefNo(item.refNo);
    setGroupNo(item.groupNo || '');
    setDate(item.date);
    if (DEFAULT_ROUTES.includes(item.route)) {
      setRouteSelect(item.route);
      setCustomRoute('');
    } else {
      setRouteSelect('__custom__');
      setCustomRoute(item.route);
    }
    setVehicleType(item.vehicleType || VEHICLE_TYPES[0]);
    setVehicleCount(String(item.vehicleCount || 1));
    setPax(String(item.pax || 0));
    setCustomer(item.customer || '');
    setSupplier(item.supplier || '');
    setCurrency(item.currency || 'SAR');
    setBuy(String(item.buy));
    setSell(String(item.sell));
    setRate(String(item.rate || db.rate || 3.75));
    setDriverName(item.driverName || '');
    setPlateNo(item.plateNo || '');
    setNotes(item.notes || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteRow = (item: TransportEntry) => {
    onConfirm({
      title: bi(lang, 'حذف عملية نقل', 'Delete Transport Entry'),
      message: bi(
        lang,
        `هل تريد حذف عملية النقل "${item.refNo}" نهائياً؟`,
        `Delete transport entry "${item.refNo}" permanently?`
      ),
      danger: true,
      onConfirm: async () => {
        await onDelete(item.id);
        if (editId === item.id) resetForm();
        onToast(bi(lang, 'تم حذف عملية النقل', 'Transport entry deleted'));
      },
    });
  };

  const activeFilterCols = useMemo(
    () => TRN_FILTER_COLS.filter((col) => selectedFilters[col] !== undefined),
    [selectedFilters]
  );

  const hasActiveFilters =
    Boolean(search.trim()) ||
    filterRoute !== 'all' ||
    filterVehicle !== 'all' ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    Object.values(colFilters).some((v) => Boolean(v.trim())) ||
    activeFilterCols.length > 0 ||
    sortState !== null;

  const clearAllFilters = () => {
    setSearch('');
    setFilterRoute('all');
    setFilterVehicle('all');
    setDateFrom('');
    setDateTo('');
    setColFilters({ ...EMPTY_TRN_COL_FILTERS });
    setSelectedFilters({});
    setSortState(null);
    setOpenFilterMenu(null);
    setMenuSearch('');
  };

  const updateColFilter = (col: TrnFilterCol, val: string) => {
    setColFilters((prev) => ({ ...prev, [col]: val }));
  };

  const toggleFilterMenu = (col: TrnFilterCol, btnEl: HTMLButtonElement) => {
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
      if (target.closest('.trn-filter-popover') || target.closest('.trn-filter-trigger')) {
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

  const columnOptions = useMemo(() => {
    const result = {} as Record<TrnFilterCol, TrnFilterOptionItem[]>;
    for (const col of TRN_FILTER_COLS) {
      const map = new Map<string, TrnFilterOptionItem>();
      for (const x of db.transports) {
        const meta = getTrnFilterMeta(x, col, db.rate, lang);
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
  }, [db.transports, db.rate, lang]);

  const toggleOptionValue = (col: TrnFilterCol, key: string) => {
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

  const selectAllColumnOptions = (col: TrnFilterCol) => {
    setSelectedFilters((prev) => {
      const updated = { ...prev };
      delete updated[col];
      return updated;
    });
  };

  const clearColumnOptionsSelection = (col: TrnFilterCol) => {
    setSelectedFilters((prev) => ({ ...prev, [col]: [] }));
  };

  const clearSingleColumnFilter = (col: TrnFilterCol) => {
    setSelectedFilters((prev) => {
      const updated = { ...prev };
      delete updated[col];
      return updated;
    });
    if (sortState?.col === col) {
      setSortState(null);
    }
  };

  const uniqueRoutes = useMemo(() => {
    const s = new Set<string>(DEFAULT_ROUTES);
    db.transports.forEach((t) => t.route && s.add(t.route));
    return [...s];
  }, [db.transports]);

  const filteredTransports = useMemo(() => {
    const norm = (val: unknown) =>
      toWestDigits(String(val ?? ''))
        .toLowerCase()
        .replace(/,/g, '')
        .trim();

    const q = norm(search);
    const cf: Record<TrnFilterCol, string> = {
      refNo: norm(colFilters.refNo),
      date: norm(colFilters.date),
      groupNo: norm(colFilters.groupNo),
      routeVehicle: norm(colFilters.routeVehicle),
      customer: norm(colFilters.customer),
      supplier: norm(colFilters.supplier),
      cost: norm(colFilters.cost),
      sales: norm(colFilters.sales),
      profit: norm(colFilters.profit),
    };

    const filtered = db.transports.filter((x) => {
      if (filterRoute !== 'all' && x.route !== filterRoute) return false;
      if (filterVehicle !== 'all' && x.vehicleType !== filterVehicle) return false;
      if (dateFrom && x.date < dateFrom) return false;
      if (dateTo && x.date > dateTo) return false;

      const v = trnVals(x, db.rate);
      const routeText = `${x.route} ${tRoute(x.route, lang)} ${x.vehicleType} ${tVeh(x.vehicleType, lang)} ${x.vehicleCount} ${x.pax} ${x.driverName} ${x.plateNo}`;
      const fields: Record<TrnFilterCol, string> = {
        refNo: norm(x.refNo),
        date: norm(x.date),
        groupNo: norm(x.groupNo),
        routeVehicle: norm(routeText),
        customer: norm(x.customer),
        supplier: norm(x.supplier),
        cost: norm(`${v.cost.toFixed(2)} ${fmt(v.cost)} ${Math.round(v.cost)}`),
        sales: norm(`${v.sales.toFixed(2)} ${fmt(v.sales)} ${Math.round(v.sales)}`),
        profit: norm(`${v.profit.toFixed(2)} ${fmt(v.profit)} ${Math.round(v.profit)}`),
      };

      if (q) {
        const combined = `${fields.refNo} ${fields.date} ${fields.groupNo} ${fields.routeVehicle} ${fields.customer} ${fields.supplier} ${fields.cost} ${fields.sales} ${fields.profit} ${norm(x.notes)}`;
        if (!combined.includes(q)) return false;
      }

      for (const col of TRN_FILTER_COLS) {
        if (cf[col] && !fields[col].includes(cf[col])) return false;
        const sel = selectedFilters[col];
        if (sel !== undefined) {
          const meta = getTrnFilterMeta(x, col, db.rate, lang);
          if (!sel.includes(meta.key)) return false;
        }
      }

      return true;
    });

    if (sortState) {
      const factor = sortState.dir === 'asc' ? 1 : -1;
      return filtered.slice().sort((a, b) => {
        const av = getTrnFilterMeta(a, sortState.col, db.rate, lang).sortVal;
        const bv = getTrnFilterMeta(b, sortState.col, db.rate, lang).sortVal;
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

    return filtered.slice().reverse();
  }, [
    db.transports,
    db.rate,
    filterRoute,
    filterVehicle,
    dateFrom,
    dateTo,
    search,
    colFilters,
    selectedFilters,
    sortState,
    lang,
  ]);

  const {
    filteredVehicleTotal,
    filteredPaxTotal,
    filteredCostSAR,
    filteredSalesSAR,
    filteredProfitSAR,
    filteredCostUSD,
    filteredSalesUSD,
  } = useMemo(() => {
    const vehicles = sumBy(filteredTransports, (x) => Number(x.vehicleCount || 0));
    const paxTotal = sumBy(filteredTransports, (x) => Number(x.pax || 0));
    const costSAR = sumBy(filteredTransports, (x) => trnVals(x, db.rate).cost);
    const salesSAR = sumBy(filteredTransports, (x) => trnVals(x, db.rate).sales);
    const profitSAR = sumBy(filteredTransports, (x) => trnVals(x, db.rate).profit);
    const costUSD = sumBy(filteredTransports, (x) => {
      const cnt = Math.max(1, Number(x.vehicleCount || 1));
      const amt = Number(x.buy || 0) * cnt;
      if (x.currency === 'USD') return amt;
      const fx = Number(x.rate || db.rate || 3.75) || 3.75;
      return amt / fx;
    });
    const salesUSD = sumBy(filteredTransports, (x) => {
      const cnt = Math.max(1, Number(x.vehicleCount || 1));
      const amt = Number(x.sell || 0) * cnt;
      if (x.currency === 'USD') return amt;
      const fx = Number(x.rate || db.rate || 3.75) || 3.75;
      return amt / fx;
    });
    return {
      filteredVehicleTotal: vehicles,
      filteredPaxTotal: paxTotal,
      filteredCostSAR: costSAR,
      filteredSalesSAR: salesSAR,
      filteredProfitSAR: profitSAR,
      filteredCostUSD: costUSD,
      filteredSalesUSD: salesUSD,
    };
  }, [filteredTransports, db.rate]);

  const avgSalesPerOpSAR =
    filteredTransports.length > 0 ? filteredSalesSAR / filteredTransports.length : 0;
  const avgSalesPerVehicleSAR =
    filteredVehicleTotal > 0 ? filteredSalesSAR / filteredVehicleTotal : 0;
  const profitMarginPct =
    filteredSalesSAR > 0 ? ((filteredProfitSAR / filteredSalesSAR) * 100).toFixed(1) : '0.0';

  const existingTransportIds = useMemo(
    () => new Set(db.transports.map((t) => t.id)),
    [db.transports]
  );

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => existingTransportIds.has(id)));
  }, [existingTransportIds]);

  const filteredIds = useMemo(() => filteredTransports.map((t) => t.id), [filteredTransports]);
  const selectedInView = useMemo(
    () => filteredIds.filter((id) => selectedIds.includes(id)),
    [filteredIds, selectedIds]
  );
  const allFilteredSelected =
    filteredIds.length > 0 && selectedInView.length === filteredIds.length;

  const toggleSelectAll = () => {
    if (filteredIds.length === 0) return;
    if (allFilteredSelected) {
      const viewSet = new Set(filteredIds);
      setSelectedIds((prev) => prev.filter((id) => !viewSet.has(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const toggleRowSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = () => {
    const targetIds = selectedInView.length > 0 ? selectedInView : filteredIds;
    if (!targetIds.length) return;
    const isSelectedMode = selectedInView.length > 0;
    onConfirm({
      title: isSelectedMode
        ? bi(lang, 'حذف المقاطع المحددة', 'Delete Selected Entries')
        : bi(lang, 'حذف المقاطع المعروضة', 'Delete All Displayed Entries'),
      message: isSelectedMode
        ? bi(
            lang,
            `هل تريد حذف ${targetIds.length} عملية نقل محددة نهائياً؟`,
            `Permanently delete ${targetIds.length} selected transport entry(ies)?`
          )
        : bi(
            lang,
            `سيتم حذف جميع عمليات النقل المعروضة (${targetIds.length}) نهائياً. هل تريد المتابعة؟`,
            `Permanently delete all ${targetIds.length} displayed transport entry(ies)?`
          ),
      danger: true,
      onConfirm: async () => {
        setDeletingBulk(true);
        try {
          if (onDeleteBatch) {
            await onDeleteBatch(targetIds);
          } else {
            for (const id of targetIds) {
              await onDelete(id);
            }
          }
          const deletedSet = new Set(targetIds);
          setSelectedIds((prev) => prev.filter((id) => !deletedSet.has(id)));
          if (editId && deletedSet.has(editId)) {
            resetForm();
          }
          onToast(
            bi(
              lang,
              `تم حذف ${targetIds.length} عملية نقل بنجاح`,
              `Deleted ${targetIds.length} transport entry(ies)`
            )
          );
        } finally {
          setDeletingBulk(false);
        }
      },
    });
  };

  const parseTransportExcelFile = async (file: File): Promise<TransportEntry[] | null> => {
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

      const maxExistingRef = db.transports.reduce(
        (m, x) => Math.max(m, Number(String(x.refNo || '').replace(/\D/g, '')) || 0),
        0
      );
      let refCounter = Math.max(maxExistingRef, db.transports.length);
      const maxExistingId = db.transports.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0);
      const baseId = Math.max(Date.now(), maxExistingId + 1);
      const parsed: TransportEntry[] = [];

      rawRows.forEach((rawRow, idx) => {
        const mapped: Partial<Record<TrnImportField, unknown>> = {};
        Object.entries(rawRow).forEach(([header, val]) => {
          const norm = normalizeTrnHeaderKey(header);
          const field = TRN_HEADER_ALIAS_MAP[norm];
          if (field && (mapped[field] === undefined || mapped[field] === '')) {
            mapped[field] = val;
          }
        });

        const rawRef = String(mapped.refNo ?? '').trim();
        const grp = String(mapped.groupNo ?? '').trim();
        const rawRoute = String(mapped.route ?? '').trim();
        const rawCustomer = String(mapped.customer ?? '').trim();
        const rawSupplier = String(mapped.supplier ?? '').trim();
        const rawDriver = String(mapped.driverName ?? '').trim();
        const rawPlate = String(mapped.plateNo ?? '').trim();
        const rawNotes = String(mapped.notes ?? '').trim();
        const buyVal = Math.max(0, parseTrnNumeric(mapped.buy, 0));
        const sellVal = Math.max(0, parseTrnNumeric(mapped.sell, 0));

        // Skip completely blank trailing rows
        if (
          !rawRef &&
          !grp &&
          !rawRoute &&
          !rawCustomer &&
          !rawSupplier &&
          !rawDriver &&
          !rawPlate &&
          buyVal === 0 &&
          sellVal === 0
        ) {
          return;
        }

        refCounter += 1;
        const resolvedRef = rawRef || `TRN-${String(refCounter).padStart(4, '0')}`;

        // Auto-fill missing customer / pax from linked visa group if available
        const matchedGroup = grp ? db.entries.find((e) => e.groupNo === grp) : undefined;
        const resolvedCustomer = rawCustomer || matchedGroup?.customer || '';
        const parsedPax = parseTrnNumeric(mapped.pax, -1);
        const resolvedPax =
          parsedPax >= 0 ? Math.round(parsedPax) : Math.max(0, Number(matchedGroup?.pax || 0));

        const resolvedCount = Math.max(1, Math.round(parseTrnNumeric(mapped.vehicleCount, 1)));
        const resolvedRate = Math.max(0.1, parseTrnNumeric(mapped.rate, db.rate || 3.75) || db.rate || 3.75);

        parsed.push({
          id: baseId + parsed.length + idx,
          refNo: resolvedRef,
          groupNo: grp,
          date: formatTrnExcelDate(mapped.date),
          route: resolveTrnRoute(rawRoute),
          vehicleType: resolveTrnVehicle(String(mapped.vehicleType ?? '')),
          vehicleCount: resolvedCount,
          pax: resolvedPax,
          customer: resolvedCustomer,
          supplier: rawSupplier || '-',
          currency: resolveTrnCurrency(mapped.currency),
          buy: buyVal,
          sell: sellVal,
          rate: resolvedRate,
          driverName: rawDriver,
          plateNo: rawPlate,
          notes: rawNotes,
        });
      });

      if (!parsed.length) {
        onToast(
          bi(
            lang,
            'لم يتم التعرف على صفوف صالحة. تأكد من أسماء الأعمدة في شيت الإكسيل',
            'No valid rows detected. Please check Excel column headers'
          ),
          'error'
        );
        return null;
      }

      return parsed;
    } catch {
      onToast(bi(lang, 'تعذر قراءة ملف الإكسيل', 'Failed to read Excel file'), 'error');
      return null;
    }
  };

  const handleExcelFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const rows = await parseTransportExcelFile(file);
    if (rows) {
      setPendingImport({ fileName: file.name, rows });
    }
  };

  const executeImport = async (mode: 'append' | 'replace') => {
    if (!pendingImport) return;
    const runImport = async () => {
      setImporting(true);
      try {
        if (onImportBatch) {
          await onImportBatch(pendingImport.rows, mode);
        } else {
          for (const row of pendingImport.rows) {
            await onSave(row, false);
          }
        }
        onToast(
          bi(
            lang,
            `تم استيراد ${pendingImport.rows.length} عملية نقل بنجاح`,
            `Imported ${pendingImport.rows.length} transport entry(ies) successfully`
          )
        );
        setPendingImport(null);
      } finally {
        setImporting(false);
      }
    };

    if (mode === 'replace') {
      onConfirm({
        title: bi(lang, 'استبدال سجل عمليات النقل', 'Replace Transport Log'),
        message: bi(
          lang,
          `سيتم حذف عمليات النقل الحالية (${db.transports.length}) واستبدالها بـ (${pendingImport.rows.length}) عملية من الملف "${pendingImport.fileName}". هل تريد المتابعة؟`,
          `Replace all ${db.transports.length} existing transport entry(ies) with ${pendingImport.rows.length} rows from "${pendingImport.fileName}"?`
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
      tKey(lang, 'thRef'),
      tKey(lang, 'thDate'),
      tKey(lang, 'thGroup'),
      tKey(lang, 'thRoute'),
      tKey(lang, 'lblVehicle'),
      tKey(lang, 'lblVehicleCount'),
      tKey(lang, 'lblTrnPax'),
      tKey(lang, 'thCustomer'),
      tKey(lang, 'thTrnSupp'),
      tKey(lang, 'lblCurrency'),
      tKey(lang, 'lblTrnBuy'),
      tKey(lang, 'lblTrnSell'),
      tKey(lang, 'lblFxRate'),
      tKey(lang, 'lblDriver'),
      tKey(lang, 'lblPlate'),
      tKey(lang, 'lblNotes'),
    ];
    const dataRows = templateOnly
      ? [
          [
            nextTrnRef(db),
            today(),
            'GRP-001',
            DEFAULT_ROUTES[0],
            VEHICLE_TYPES[0],
            1,
            45,
            bi(lang, 'شركة عمرة نموذجية', 'Example Umrah Co'),
            bi(lang, 'شركة نقل نموذجية', 'Example Transport Co'),
            'SAR',
            1200,
            1500,
            db.rate || 3.75,
            bi(lang, 'أحمد محمد', 'Ahmed Ali'),
            'ABC-1234',
            '',
          ],
        ]
      : filteredTransports.map((x) => [
          x.refNo,
          x.date,
          x.groupNo,
          x.route,
          x.vehicleType,
          x.vehicleCount,
          x.pax,
          x.customer,
          x.supplier,
          x.currency,
          x.buy,
          x.sell,
          x.rate,
          x.driverName,
          x.plateNo,
          x.notes,
        ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transport');
    XLSX.writeFile(wb, templateOnly ? 'transport_template.xlsx' : 'transport_log.xlsx');
  };

  const exportCsv = () => {
    csvDownload('transport_log.csv', [
      [
        tKey(lang, 'thRef'),
        tKey(lang, 'thDate'),
        tKey(lang, 'thGroup'),
        tKey(lang, 'thRoute'),
        tKey(lang, 'lblVehicle'),
        tKey(lang, 'lblVehicleCount'),
        tKey(lang, 'lblTrnPax'),
        tKey(lang, 'thCustomer'),
        tKey(lang, 'thTrnSupp'),
        tKey(lang, 'thCost'),
        tKey(lang, 'thSales'),
        tKey(lang, 'thProfit'),
        tKey(lang, 'lblDriver'),
        tKey(lang, 'lblPlate'),
      ],
      ...filteredTransports.map((x) => {
        const v = trnVals(x, db.rate);
        return [
          x.refNo,
          x.date,
          x.groupNo,
          x.route,
          x.vehicleType,
          x.vehicleCount,
          x.pax,
          x.customer,
          x.supplier,
          v.cost.toFixed(2),
          v.sales.toFixed(2),
          v.profit.toFixed(2),
          x.driverName,
          x.plateNo,
        ];
      }),
    ]);
  };

  return (
    <div className="space-y-5">
      <Panel
        className="no-print"
        title={editId ? tKey(lang, 'trnFormEdit') : tKey(lang, 'trnFormNew')}
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
              <span>{bi(lang, 'سحب شيت إكسيل', 'Upload Excel')}</span>
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
            <button type="button" onClick={resetForm} className={btnSecondaryCls}>
              {tKey(lang, 'btnClear')}
            </button>
          </div>
        }
      >
        {pendingImport && (
          <div className="mb-5 p-4 rounded-xl bg-teal-50/70 border border-teal-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-teal-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
                <span>
                  {bi(
                    lang,
                    `تم قراءة الملف "${pendingImport.fileName}" — عدد عمليات النقل الجاهزة للاستيراد: ${pendingImport.rows.length}`,
                    `Parsed "${pendingImport.fileName}" — ${pendingImport.rows.length} transport entries ready to import`
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
                    <th className="py-1.5 px-2 text-start">{tKey(lang, 'thRef')}</th>
                    <th className="py-1.5 px-2 text-start">{tKey(lang, 'thDate')}</th>
                    <th className="py-1.5 px-2 text-start">{tKey(lang, 'thGroup')}</th>
                    <th className="py-1.5 px-2 text-start">{tKey(lang, 'thRoute')}</th>
                    <th className="py-1.5 px-2 text-start">{tKey(lang, 'lblVehicle')}</th>
                    <th className="py-1.5 px-2 text-start">{tKey(lang, 'lblVehicleCount')}</th>
                    <th className="py-1.5 px-2 text-start">{tKey(lang, 'thCustomer')}</th>
                    <th className="py-1.5 px-2 text-start">{tKey(lang, 'thTrnSupp')}</th>
                    <th className="py-1.5 px-2 text-start">{tKey(lang, 'lblTrnBuy')}</th>
                    <th className="py-1.5 px-2 text-start">{tKey(lang, 'lblTrnSell')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingImport.rows.slice(0, 5).map((r) => (
                    <tr key={r.id}>
                      <td className="py-1.5 px-2 font-bold font-mono-num">{r.refNo}</td>
                      <td className="py-1.5 px-2 font-mono-num">{r.date}</td>
                      <td className="py-1.5 px-2">{r.groupNo || '-'}</td>
                      <td className="py-1.5 px-2">{tRoute(r.route, lang)}</td>
                      <td className="py-1.5 px-2">{tVeh(r.vehicleType, lang)}</td>
                      <td className="py-1.5 px-2 font-mono-num">{r.vehicleCount}</td>
                      <td className="py-1.5 px-2">{r.customer || '-'}</td>
                      <td className="py-1.5 px-2">{r.supplier}</td>
                      <td className="py-1.5 px-2 font-mono-num">{fmt(r.buy)}</td>
                      <td className="py-1.5 px-2 font-mono-num font-semibold">{fmt(r.sell)}</td>
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
                    : bi(lang, 'إضافة إلى سجل النقل الحالي', 'Append to Transport Log')}
                </span>
              </button>
              <button
                type="button"
                disabled={importing}
                onClick={() => executeImport('replace')}
                className={btnDangerCls}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{bi(lang, 'استبدال سجل النقل بالكامل', 'Replace All Transport Entries')}</span>
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
        <div className="mb-4 p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-slate-700">
          {tKey(lang, 'trnNotice')}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <div className="text-xs font-bold text-[#1d4ed8] pb-2 mb-3 border-b border-slate-200">
              {tKey(lang, 'trnSec1')}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div>
                <label className={labelCls}>{tKey(lang, 'lblTrnRef')}</label>
                <input
                  type="text"
                  required
                  value={refNo}
                  onChange={(e) => setRefNo(e.target.value)}
                  className={`${inputCls} font-mono-num`}
                />
              </div>
              <div>
                <label className={labelCls}>{tKey(lang, 'lblLinkGroup')}</label>
                <input
                  type="text"
                  list="trn-groups-dl"
                  value={groupNo}
                  onChange={(e) => handleGroupChange(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{tKey(lang, 'lblTrnDate')}</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{tKey(lang, 'lblRouteType')}</label>
                <select
                  value={routeSelect}
                  onChange={(e) => setRouteSelect(e.target.value)}
                  className={inputCls}
                >
                  {DEFAULT_ROUTES.map((r) => (
                    <option key={r} value={r}>
                      {tRoute(r, lang)}
                    </option>
                  ))}
                  <option value="__custom__">{bi(lang, 'مسار مخصص (أدخل يدوياً)', 'Custom Route (Enter manually)')}</option>
                </select>
              </div>
              {routeSelect === '__custom__' && (
                <div>
                  <label className={labelCls}>{bi(lang, 'اسم المسار المخصص *', 'Custom Route Name *')}</label>
                  <input
                    type="text"
                    required
                    value={customRoute}
                    onChange={(e) => setCustomRoute(e.target.value)}
                    className={inputCls}
                  />
                </div>
              )}
              <div>
                <label className={labelCls}>{tKey(lang, 'lblVehicle')}</label>
                <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className={inputCls}>
                  {VEHICLE_TYPES.map((v) => (
                    <option key={v} value={v}>
                      {tVeh(v, lang)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{tKey(lang, 'lblVehicleCount')}</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={vehicleCount}
                  onChange={(e) => setVehicleCount(e.target.value)}
                  className={`${inputCls} font-mono-num`}
                />
              </div>
              <div>
                <label className={labelCls}>{tKey(lang, 'lblTrnPax')}</label>
                <input
                  type="number"
                  min={0}
                  value={pax}
                  onChange={(e) => setPax(e.target.value)}
                  className={`${inputCls} font-mono-num`}
                />
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-[#1d4ed8] pb-2 mb-3 border-b border-slate-200">
              {tKey(lang, 'trnSec2')}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
              <div>
                <label className={labelCls}>{tKey(lang, 'lblCustomer')}</label>
                <input
                  type="text"
                  list="trn-customers-dl"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{tKey(lang, 'lblTrnSupp')}</label>
                <input
                  type="text"
                  required
                  list="trn-suppliers-dl"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{tKey(lang, 'lblCurrency')}</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className={inputCls}>
                  <option value="SAR">SAR (ر.س)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>{tKey(lang, 'lblTrnBuy')}</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  required
                  value={buy}
                  onChange={(e) => setBuy(e.target.value)}
                  className={`${inputCls} font-mono-num`}
                />
              </div>
              <div>
                <label className={labelCls}>{tKey(lang, 'lblTrnSell')}</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  required
                  value={sell}
                  onChange={(e) => setSell(e.target.value)}
                  className={`${inputCls} font-mono-num`}
                />
              </div>
              <div>
                <label className={labelCls}>{tKey(lang, 'lblFxRate')}</label>
                <input
                  type="number"
                  step="0.01"
                  min={0.1}
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  className={`${inputCls} font-mono-num`}
                />
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-[#1d4ed8] pb-2 mb-3 border-b border-slate-200">
              {tKey(lang, 'trnSec3')}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className={labelCls}>{tKey(lang, 'lblDriver')}</label>
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{tKey(lang, 'lblPlate')}</label>
                <input
                  type="text"
                  value={plateNo}
                  onChange={(e) => setPlateNo(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{tKey(lang, 'lblNotes')}</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs font-mono-num space-x-3 rtl:space-x-reverse">
                <span className="text-slate-600">
                  {bi(lang, 'التكلفة:', 'Cost:')} <strong className="text-slate-900">{fmt(previewCost)}</strong>
                </span>
                <span className="text-slate-600">
                  {bi(lang, 'البيع:', 'Sales:')} <strong className="text-[#1d4ed8]">{fmt(previewSales)}</strong>
                </span>
                <span className="text-slate-600">
                  {bi(lang, 'الربح:', 'Profit:')}{' '}
                  <strong className={previewProfit >= 0 ? 'text-[#0f766e]' : 'text-red-700'}>
                    {fmt(previewProfit)}
                  </strong>
                </span>
              </div>
              <button type="submit" disabled={saving} className={btnPrimaryCls}>
                <Plus className="w-3.5 h-3.5" />
                <span>{editId ? tKey(lang, 'btnUpdateTrn') : tKey(lang, 'btnSaveTrn')}</span>
              </button>
            </div>
          </div>
        </form>

        <datalist id="trn-groups-dl">
          {groupSuggestions.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
        <datalist id="trn-customers-dl">
          {customerNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <datalist id="trn-suppliers-dl">
          {trnSuppliers.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </Panel>

      {/* Transport Log */}
      <Panel
        title={
          <span className="flex items-center gap-2">
            <span>{tKey(lang, 'trnLogTitle')}</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-mono-num">
              {filteredTransports.length} / {db.transports.length}
            </span>
          </span>
        }
        actions={
          <>
            <select
              aria-label={bi(lang, 'فلتر المسار', 'Filter Route')}
              value={filterRoute}
              onChange={(e) => setFilterRoute(e.target.value)}
              className="h-9 px-3 rounded-xl border border-slate-200 text-xs bg-white"
            >
              <option value="all">{bi(lang, 'كل المسارات', 'All Routes')}</option>
              {uniqueRoutes.map((r) => (
                <option key={r} value={r}>
                  {tRoute(r, lang)}
                </option>
              ))}
            </select>
            <select
              aria-label={bi(lang, 'فلتر المركبة', 'Filter Vehicle')}
              value={filterVehicle}
              onChange={(e) => setFilterVehicle(e.target.value)}
              className="h-9 px-3 rounded-xl border border-slate-200 text-xs bg-white"
            >
              <option value="all">{bi(lang, 'كل المركبات', 'All Vehicles')}</option>
              {VEHICLE_TYPES.map((v) => (
                <option key={v} value={v}>
                  {tVeh(v, lang)}
                </option>
              ))}
            </select>
            <input
              type="date"
              aria-label={bi(lang, 'من تاريخ', 'From date')}
              title={bi(lang, 'من تاريخ', 'From date')}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 px-2.5 rounded-xl border border-slate-200 text-xs font-mono-num bg-white"
            />
            <input
              type="date"
              aria-label={bi(lang, 'إلى تاريخ', 'To date')}
              title={bi(lang, 'إلى تاريخ', 'To date')}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 px-2.5 rounded-xl border border-slate-200 text-xs font-mono-num bg-white"
            />
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-2.5 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tKey(lang, 'searchPlaceholder')}
                className="h-9 ps-8 pe-7 rounded-xl border border-slate-200 text-xs w-44 focus:outline-none focus:border-[#1d4ed8]"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  title={bi(lang, 'مسح', 'Clear')}
                  className="absolute top-1/2 -translate-y-1/2 end-2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {hasActiveFilters && (
              <button type="button" onClick={clearAllFilters} className={btnSecondaryCls}>
                <X className="w-3.5 h-3.5" />
                <span>{bi(lang, 'مسح الفلاتر', 'Clear Filters')}</span>
              </button>
            )}
            <button type="button" onClick={() => exportExcel(false)} className={btnSecondaryCls}>
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{bi(lang, 'تصدير إكسيل', 'Export Excel')}</span>
            </button>
            <button type="button" onClick={exportCsv} className={btnSecondaryCls}>
              <Download className="w-3.5 h-3.5" />
              <span>{tKey(lang, 'btnCsv')}</span>
            </button>
            {filteredTransports.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className={allFilteredSelected ? btnSoftBlueCls : btnSecondaryCls}
                >
                  {allFilteredSelected ? (
                    <CheckSquare className="w-3.5 h-3.5" />
                  ) : (
                    <Square className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {allFilteredSelected
                      ? bi(lang, 'إلغاء التحديد', 'Deselect All')
                      : bi(lang, `تحديد الكل (${filteredTransports.length})`, `Select All (${filteredTransports.length})`)}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={deletingBulk}
                  onClick={handleBulkDelete}
                  className={btnDangerCls}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>
                    {deletingBulk
                      ? bi(lang, 'جاري الحذف...', 'Deleting...')
                      : selectedInView.length > 0
                        ? bi(
                            lang,
                            `حذف المحدد (${selectedInView.length})`,
                            `Delete Selected (${selectedInView.length})`
                          )
                        : bi(
                            lang,
                            `حذف المقاطع (${filteredTransports.length})`,
                            `Delete Segments (${filteredTransports.length})`
                          )}
                  </span>
                </button>
              </>
            )}
          </>
        }
      >
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
                    {getTrnFilterColLabel(col, lang)} ({count})
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
                  {bi(lang, 'ترتيب:', 'Sort:')} {getTrnFilterColLabel(sortState.col, lang)}{' '}
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

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <th className="py-2.5 px-2.5 text-center w-10 no-print">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    disabled={filteredTransports.length === 0}
                    title={bi(lang, 'تحديد الكل', 'Select All')}
                    className="w-4 h-4 accent-[#1d4ed8] cursor-pointer"
                  />
                </th>
                {TRN_FILTER_COLS.map((col) => {
                  const isFiltered = selectedFilters[col] !== undefined;
                  const isSorted = sortState?.col === col;
                  const isActive = isFiltered || isSorted;
                  const isOpen = openFilterMenu?.col === col;
                  return (
                    <th key={col} className="py-2.5 px-2.5 text-start font-bold whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <span>{getTrnFilterColLabel(col, lang)}</span>
                        <button
                          type="button"
                          onClick={(ev) => toggleFilterMenu(col, ev.currentTarget)}
                          title={bi(
                            lang,
                            `فلترة حسب ${getTrnFilterColLabel(col, lang)}`,
                            `Filter by ${getTrnFilterColLabel(col, lang)}`
                          )}
                          className={`no-print trn-filter-trigger inline-flex items-center justify-center w-6 h-6 rounded-md border transition cursor-pointer ${
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
                <th className="py-2.5 px-2.5 text-start font-bold no-print">{tKey(lang, 'thAction')}</th>
              </tr>
              <tr className="no-print bg-slate-50/60 border-b border-slate-200">
                <th className="py-1.5 px-1.5" />
                {TRN_FILTER_COLS.map((col) => {
                  const isNum = col === 'cost' || col === 'sales' || col === 'profit';
                  return (
                    <th key={col} className="py-1.5 px-1.5">
                      <input
                        type="text"
                        value={colFilters[col]}
                        onChange={(e) => updateColFilter(col, e.target.value)}
                        placeholder={getTrnFilterColLabel(col, lang)}
                        className={`w-full ${isNum ? 'min-w-[66px] font-mono-num' : 'min-w-[78px]'} h-7 px-2 rounded-lg border border-slate-200 bg-white text-[11px] font-normal text-slate-800 focus:outline-none focus:border-[#1d4ed8]`}
                      />
                    </th>
                  );
                })}
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
              {filteredTransports.length === 0 ? (
                <EmptyRow colSpan={11} lang={lang} />
              ) : (
                filteredTransports.map((x) => {
                  const v = trnVals(x, db.rate);
                  const isSelected = selectedIds.includes(x.id);
                  return (
                    <tr
                      key={x.id}
                      className={isSelected ? 'bg-blue-50/50 hover:bg-blue-50/80' : 'hover:bg-slate-50'}
                    >
                      <td className="py-2 px-2.5 text-center no-print">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRowSelect(x.id)}
                          className="w-4 h-4 accent-[#1d4ed8] cursor-pointer"
                        />
                      </td>
                      <td className="py-2 px-2.5 font-bold text-slate-900">{x.refNo}</td>
                      <td className="py-2 px-2.5 font-mono-num">{x.date}</td>
                      <td className="py-2 px-2.5">{x.groupNo || '-'}</td>
                      <td className="py-2 px-2.5">
                        <div className="font-semibold text-slate-800">{tRoute(x.route, lang)}</div>
                        <div className="text-[11px] text-slate-500">
                          {tVeh(x.vehicleType, lang)} × {x.vehicleCount}
                          {x.pax > 0 ? ` · ${x.pax} ${bi(lang, 'معتمر', 'pax')}` : ''}
                          {x.driverName ? ` · ${x.driverName}` : ''}
                        </div>
                      </td>
                      <td className="py-2 px-2.5">{x.customer || '-'}</td>
                      <td className="py-2 px-2.5">{x.supplier}</td>
                      <td className="py-2 px-2.5 font-mono-num">{fmt(v.cost)}</td>
                      <td className="py-2 px-2.5 font-mono-num font-semibold">{fmt(v.sales)}</td>
                      <td className="py-2 px-2.5 font-mono-num font-bold text-[#0f766e]">{fmt(v.profit)}</td>
                      <td className="py-2 px-2.5 no-print">
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={() => handleEdit(x)} className={btnSoftBlueCls}>
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button type="button" onClick={() => handleDeleteRow(x)} className={btnSoftRedCls}>
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredTransports.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-900">
                  <td className="py-2.5 px-2.5 no-print" />
                  <td colSpan={3} className="py-2.5 px-2.5">
                    {bi(lang, 'الإجمالي', 'Total')} ({filteredTransports.length})
                  </td>
                  <td className="py-2.5 px-2.5 font-mono-num text-[#1d4ed8]">
                    {filteredVehicleTotal.toLocaleString('en-US')} {bi(lang, 'مركبة', 'veh')} ·{' '}
                    {filteredPaxTotal.toLocaleString('en-US')} {bi(lang, 'معتمر', 'pax')}
                  </td>
                  <td colSpan={2} className="py-2.5 px-2.5 text-slate-500 text-[11px]">
                    {bi(lang, 'الشراء والبيع والربح بالريال', 'Cost / Sales / Profit (SAR)')}
                  </td>
                  <td className="py-2.5 px-2.5 font-mono-num text-amber-700">
                    {fmt(filteredCostSAR)} {bi(lang, 'ر.س', 'SAR')}
                  </td>
                  <td className="py-2.5 px-2.5 font-mono-num text-slate-900">
                    {fmt(filteredSalesSAR)} {bi(lang, 'ر.س', 'SAR')}
                  </td>
                  <td className="py-2.5 px-2.5 font-mono-num text-[#0f766e]">
                    {fmt(filteredProfitSAR)} {bi(lang, 'ر.س', 'SAR')}
                  </td>
                  <td className="py-2.5 px-2.5 no-print" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Panel>

      {/* Bottom Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <KpiCard
          tone="blue"
          label={bi(lang, 'إجمالي العمليات والمركبات', 'Total Operations & Vehicles')}
          value={`${filteredVehicleTotal.toLocaleString('en-US')} ${bi(lang, 'مركبة', 'Vehicles')}`}
          sub={bi(
            lang,
            `${filteredTransports.length} عملية · ${filteredPaxTotal.toLocaleString('en-US')} معتمر`,
            `${filteredTransports.length} trips · ${filteredPaxTotal.toLocaleString('en-US')} pax`
          )}
        />
        <KpiCard
          tone="amber"
          label={bi(lang, 'إجمالي شراء النقل بالريال', 'Total Transport Cost in SAR')}
          value={`${fmt(filteredCostSAR)} ${bi(lang, 'ر.س', 'SAR')}`}
          sub={bi(lang, `بالدولار: ${fmtUSD(filteredCostUSD)}`, `In USD: ${fmtUSD(filteredCostUSD)}`)}
        />
        <KpiCard
          tone="teal"
          label={bi(lang, 'إجمالي بيع النقل بالريال', 'Total Transport Sales in SAR')}
          value={`${fmt(filteredSalesSAR)} ${bi(lang, 'ر.س', 'SAR')}`}
          sub={bi(
            lang,
            `متوسط/عملية: ${fmt(avgSalesPerOpSAR)} ر.س | متوسط/مركبة: ${fmt(avgSalesPerVehicleSAR)} ر.س`,
            `Avg/trip: ${fmt(avgSalesPerOpSAR)} SAR | Avg/veh: ${fmt(avgSalesPerVehicleSAR)} SAR`
          )}
        />
        <KpiCard
          tone="slate"
          label={bi(lang, 'إجمالي البيع بالدولار', 'Total Sales in USD')}
          value={fmtUSD(filteredSalesUSD)}
          sub={bi(
            lang,
            `إجمالي الشراء بالدولار: ${fmtUSD(filteredCostUSD)}`,
            `Total Cost USD: ${fmtUSD(filteredCostUSD)}`
          )}
        />
        <KpiCard
          tone={filteredProfitSAR >= 0 ? 'emerald' : 'red'}
          label={bi(lang, 'إجمالي الربح بالريال', 'Total Profit in SAR')}
          value={`${fmt(filteredProfitSAR)} ${bi(lang, 'ر.س', 'SAR')}`}
          sub={bi(lang, `هامش الربح: ${profitMarginPct}%`, `Profit Margin: ${profitMarginPct}%`)}
        />
      </div>

      {/* Excel-style Column Filter Popover */}
      {openFilterMenu && (() => {
        const col = openFilterMenu.col;
        const allOptions = columnOptions[col];
        const qMenu = toWestDigits(menuSearch).toLowerCase().replace(/,/g, '').trim();
        const visibleOptions = qMenu
          ? allOptions.filter((o) =>
              toWestDigits(o.label).toLowerCase().replace(/,/g, '').includes(qMenu)
            )
          : allOptions;
        const currentSelected = selectedFilters[col];
        const allSelectedCount =
          currentSelected === undefined ? allOptions.length : currentSelected.length;

        return (
          <div
            ref={popoverRef}
            className="no-print trn-filter-popover fixed z-50 w-66 bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden text-xs"
          >
            <div className="px-3 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 truncate">
                <Filter className="w-3.5 h-3.5 text-[#1d4ed8] shrink-0" />
                <span className="truncate">{getTrnFilterColLabel(col, lang)}</span>
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
    </div>
  );
};
