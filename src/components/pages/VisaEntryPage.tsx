import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Download,
  Edit3,
  FileSpreadsheet,
  Filter,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  AccountingDB,
  Currency,
  Lang,
  VisaEntry,
} from '../../types/accounting';
import { bi, tKey } from '../../i18n/translations';
import {
  csvDownload,
  entryVals,
  fmt,
  fmtUSD,
  getPartyNames,
  mapSheetField,
  normalizeSheetDate,
  splitSheetLine,
  sumBy,
  toSAR,
  toWestDigits,
  today,
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

interface ParsedSheetRow {
  rowNum: number;
  status: 'valid' | 'duplicate' | 'error';
  reason: string;
  entry: VisaEntry;
}

interface VisaEntryPageProps {
  db: AccountingDB;
  lang: Lang;
  onSave: (entry: VisaEntry, isEdit: boolean) => Promise<void>;
  onImportBatch: (entries: VisaEntry[]) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onDeleteAllGroups: () => Promise<void>;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
  onConfirm: (cfg: ConfirmConfig) => void;
}

type VisaFilterCol =
  | 'groupNo'
  | 'customer'
  | 'supplier'
  | 'pax'
  | 'buy'
  | 'sell'
  | 'totalSales'
  | 'profit';

interface FilterOptionItem {
  key: string;
  label: string;
  count: number;
  sortVal: string | number;
}

const VISA_FILTER_COLS: VisaFilterCol[] = [
  'groupNo',
  'customer',
  'supplier',
  'pax',
  'buy',
  'sell',
  'totalSales',
  'profit',
];

function getEntryFilterMeta(
  e: VisaEntry,
  col: VisaFilterCol,
  defaultRate: number,
  lang: Lang
): { key: string; label: string; sortVal: string | number } {
  const v = entryVals(e, defaultRate);
  const emptyLbl = bi(lang, '(فارغ)', '(Empty)');
  switch (col) {
    case 'groupNo': {
      const val = (e.groupNo || '').trim();
      return { key: val, label: val || emptyLbl, sortVal: val };
    }
    case 'customer': {
      const val = (e.customer || '').trim();
      return { key: val, label: val || emptyLbl, sortVal: val };
    }
    case 'supplier': {
      const val = (e.supplier || '').trim();
      return { key: val, label: val || emptyLbl, sortVal: val };
    }
    case 'pax': {
      const num = Number(e.pax || 0);
      return { key: String(num), label: String(num), sortVal: num };
    }
    case 'buy': {
      const label = `${fmt(e.buy)} ${e.currency}`;
      return { key: label, label, sortVal: v.buy };
    }
    case 'sell': {
      const label = `${fmt(e.sell)} ${e.currency}`;
      return { key: label, label, sortVal: v.sell };
    }
    case 'totalSales': {
      const key = fmt(v.sales);
      return {
        key,
        label: `${key} ${bi(lang, 'ر.س', 'SAR')}`,
        sortVal: v.sales,
      };
    }
    case 'profit': {
      const key = fmt(v.profit);
      return {
        key,
        label: `${key} ${bi(lang, 'ر.س', 'SAR')}`,
        sortVal: v.profit,
      };
    }
  }
}

function getFilterColLabel(col: VisaFilterCol, lang: Lang): string {
  switch (col) {
    case 'groupNo':
      return tKey(lang, 'thGroup');
    case 'customer':
      return tKey(lang, 'thCustomer');
    case 'supplier':
      return tKey(lang, 'thSupplier');
    case 'pax':
      return tKey(lang, 'thCount');
    case 'buy':
      return tKey(lang, 'thBuyUnit');
    case 'sell':
      return tKey(lang, 'thSellUnit');
    case 'totalSales':
      return tKey(lang, 'thTotalSales');
    case 'profit':
      return tKey(lang, 'thProfit');
  }
}

export const VisaEntryPage: React.FC<VisaEntryPageProps> = ({
  db,
  lang,
  onSave,
  onImportBatch,
  onDelete,
  onDeleteAllGroups,
  onToast,
  onConfirm,
}) => {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const [editId, setEditId] = useState<number | null>(null);
  const [groupNo, setGroupNo] = useState('');
  const [date, setDate] = useState(today());
  const [pax, setPax] = useState('1');
  const [customer, setCustomer] = useState('');
  const [supplier, setSupplier] = useState('');
  const [currency, setCurrency] = useState<Currency>('SAR');
  const [buy, setBuy] = useState('0');
  const [sell, setSell] = useState('0');
  const [rate, setRate] = useState(String(db.rate || 3.75));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [searchField, setSearchField] = useState<'all' | VisaFilterCol>('all');
  const [colFilters, setColFilters] = useState<Record<VisaFilterCol, string>>({
    groupNo: '',
    customer: '',
    supplier: '',
    pax: '',
    buy: '',
    sell: '',
    totalSales: '',
    profit: '',
  });
  const [selectedFilters, setSelectedFilters] = useState<Partial<Record<VisaFilterCol, string[]>>>({});
  const [sortState, setSortState] = useState<{ col: VisaFilterCol; dir: 'asc' | 'desc' } | null>(null);
  const [openFilterMenu, setOpenFilterMenu] = useState<{
    col: VisaFilterCol;
    top: number;
    left: number;
  } | null>(null);
  const [menuSearch, setMenuSearch] = useState('');
  const [pageSize, setPageSize] = useState<number | 'all'>(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [sheetRows, setSheetRows] = useState<ParsedSheetRow[] | null>(null);
  const [importing, setImporting] = useState(false);

  const activeFilterCols = useMemo(
    () => (Object.keys(selectedFilters) as VisaFilterCol[]).filter((c) => selectedFilters[c] !== undefined),
    [selectedFilters]
  );

  const hasActiveSearch =
    Boolean(search.trim()) ||
    Object.values(colFilters).some((v) => Boolean(v.trim())) ||
    activeFilterCols.length > 0 ||
    sortState !== null;

  const clearAllSearch = () => {
    setSearch('');
    setSearchField('all');
    setColFilters({
      groupNo: '',
      customer: '',
      supplier: '',
      pax: '',
      buy: '',
      sell: '',
      totalSales: '',
      profit: '',
    });
    setSelectedFilters({});
    setSortState(null);
    setOpenFilterMenu(null);
    setMenuSearch('');
    setCurrentPage(1);
  };

  const updateColFilter = (key: VisaFilterCol, val: string) => {
    setColFilters((prev) => ({ ...prev, [key]: val }));
    setCurrentPage(1);
  };

  const toggleFilterMenu = (col: VisaFilterCol, btnEl: HTMLButtonElement) => {
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
      if (target.closest('.visa-filter-popover') || target.closest('.visa-filter-trigger')) {
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

  const customerNames = useMemo(() => getPartyNames(db, 'customer', lang), [db, lang]);
  const visaSupplierNames = useMemo(() => getPartyNames(db, 'supplier', lang, 'visa'), [db, lang]);

  const fxRate = Number(rate || db.rate || 3.75) || 3.75;
  const buySARVal = toSAR(buy, currency, fxRate, db.rate);
  const sellSARVal = toSAR(sell, currency, fxRate, db.rate);
  const unitProfitSAR = sellSARVal - buySARVal;
  const paxNum = Math.max(0, Number(pax || 0));
  const totalCostSAR = buySARVal * paxNum;
  const totalSalesSAR = sellSARVal * paxNum;
  const totalProfitSAR = totalSalesSAR - totalCostSAR;

  const resetForm = () => {
    setEditId(null);
    setGroupNo('');
    setDate(today());
    setPax('1');
    setCustomer('');
    setSupplier('');
    setCurrency('SAR');
    setBuy('0');
    setSell('0');
    setRate(String(db.rate || 3.75));
    setNotes('');
  };

  const handleCurrencyChange = (nextCurr: Currency) => {
    setCurrency(nextCurr);
  };

  const handleSarOnlyToggle = (checked: boolean) => {
    if (checked) {
      const convertedBuy = toSAR(buy, currency, fxRate, db.rate);
      const convertedSell = toSAR(sell, currency, fxRate, db.rate);
      setCurrency('SAR');
      setBuy(String(Number(convertedBuy.toFixed(2))));
      setSell(String(Number(convertedSell.toFixed(2))));
    } else {
      setCurrency('USD');
    }
  };

  const handleBuySarInput = (val: string) => {
    setCurrency('SAR');
    setBuy(val);
  };

  const handleSellSarInput = (val: string) => {
    setCurrency('SAR');
    setSell(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const g = groupNo.trim();
    const c = customer.trim();
    const s = supplier.trim();
    const p = Math.round(Number(pax));
    if (!g || !date || !c || !s || !(p >= 1)) {
      onToast(
        bi(lang, 'يرجى إكمال الحقول المطلوبة بشكل صحيح', 'Please fill in all required fields accurately'),
        'error'
      );
      return;
    }

    const duplicate = db.entries.find(
      (item) => item.groupNo.toLowerCase() === g.toLowerCase() && item.id !== editId
    );
    if (duplicate) {
      onToast(
        bi(lang, `رقم المجموعة "${g}" مسجل مسبقاً`, `Group # "${g}" already exists`),
        'error'
      );
      return;
    }

    const payload: VisaEntry = {
      id: editId || Date.now(),
      groupNo: g,
      date,
      pax: p,
      customer: c,
      supplier: s,
      currency,
      buy: Math.max(0, Number(buy || 0)),
      sell: Math.max(0, Number(sell || 0)),
      rate: fxRate,
      notes: notes.trim(),
    };

    setSaving(true);
    try {
      await onSave(payload, Boolean(editId));
      onToast(
        editId
          ? bi(lang, 'تم تحديث المجموعة بنجاح', 'Visa group updated')
          : bi(lang, 'تم حفظ تسجيل التأشيرات بنجاح', 'Visa group saved')
      );
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: VisaEntry) => {
    setEditId(item.id);
    setGroupNo(item.groupNo);
    setDate(item.date);
    setPax(String(item.pax));
    setCustomer(item.customer);
    setSupplier(item.supplier);
    setCurrency(item.currency || 'SAR');
    setBuy(String(item.buy));
    setSell(String(item.sell));
    setRate(String(item.rate || db.rate || 3.75));
    setNotes(item.notes || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteRow = (item: VisaEntry) => {
    onConfirm({
      title: bi(lang, 'حذف مجموعة تأشيرات', 'Delete Visa Group'),
      message: bi(
        lang,
        `هل تريد حذف المجموعة "${item.groupNo}" نهائياً من السجل؟`,
        `Delete visa group "${item.groupNo}" permanently?`
      ),
      danger: true,
      onConfirm: async () => {
        await onDelete(item.id);
        if (editId === item.id) resetForm();
        onToast(bi(lang, 'تم حذف المجموعة', 'Group deleted'));
      },
    });
  };

  const handleDeleteAll = () => {
    if (!db.entries.length) return;
    onConfirm({
      title: bi(lang, 'حذف جميع المجموعات', 'Delete All Visa Groups'),
      message: bi(
        lang,
        `سيتم حذف جميع مجموعات التأشيرات (${db.entries.length}) وجدول عمليات النقل المرتبط بها نهائياً. هل تريد المتابعة؟`,
        `This will permanently delete all ${db.entries.length} visa groups and their cycle operations. Continue?`
      ),
      danger: true,
      onConfirm: async () => {
        await onDeleteAllGroups();
        resetForm();
        onToast(bi(lang, 'تم حذف جميع المجموعات', 'All visa groups deleted'));
      },
    });
  };

  // --- Sheet Parsing & Import ---
  const downloadTemplate = () => {
    const headers =
      lang === 'ar'
        ? [
            'رقم المجموعة',
            'التاريخ',
            'عدد المعتمرين',
            'اسم العميل',
            'مورد التأشيرات',
            'العملة',
            'سعر الشراء',
            'سعر البيع',
            'سعر الصرف',
            'ملاحظات',
          ]
        : ['Group No', 'Date', 'Pax', 'Customer', 'Visa Supplier', 'Currency', 'Buy Price', 'Sell Price', 'FX Rate', 'Notes'];

    const sample1 =
      lang === 'ar'
        ? ['GRP-1448-101', today(), 45, 'شركة الهدى', 'شركة الباقة الدولية', 'SAR', 520, 600, db.rate || 3.75, 'مجموعة رمضان']
        : ['GRP-1448-101', today(), 45, 'Al Huda Travel', 'International Visa Co', 'SAR', 520, 600, db.rate || 3.75, 'Ramadan batch'];

    const sample2 =
      lang === 'ar'
        ? ['GRP-1448-102', today(), 30, 'وكالة الرحمة', 'شركة الباقة الدولية', 'USD', 140, 165, db.rate || 3.75, 'تسعير بالدولار']
        : ['GRP-1448-102', today(), 30, 'Al Rahma Agency', 'International Visa Co', 'USD', 140, 165, db.rate || 3.75, 'USD pricing'];

    csvDownload('visa_import_template.csv', [headers, sample1, sample2]);
  };

  const parseSheetText = (rawText: string) => {
    const lines = rawText
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length < 2) {
      onToast(
        bi(lang, 'الملف أو النص يجب أن يحتوي على صف عناوين وصف بيانات واحد على الأقل', 'Sheet must contain headers and at least one data row'),
        'error'
      );
      return;
    }

    const headLine = lines[0];
    const sep = headLine.includes('\t')
      ? '\t'
      : headLine.split(';').length > headLine.split(',').length
        ? ';'
        : ',';

    const headers = splitSheetLine(headLine, sep);
    const colMap: Record<number, string> = {};
    headers.forEach((h, idx) => {
      const mapped = mapSheetField(h);
      if (mapped) colMap[idx] = mapped;
    });

    const mappedFields = Object.values(colMap);
    if (!mappedFields.includes('groupNo') || !mappedFields.includes('customer') || !mappedFields.includes('supplier')) {
      onToast(
        bi(
          lang,
          'تأكد من وجود الأعمدة الأساسية: رقم المجموعة، العميل، مورد التأشيرات',
          'Missing required columns: Group No, Customer, Visa Supplier'
        ),
        'error'
      );
      return;
    }

    const existingSet = new Set(db.entries.map((e) => e.groupNo.toLowerCase()));
    const seenInFile = new Set<string>();
    const parsed: ParsedSheetRow[] = [];
    const baseId = Date.now();

    for (let i = 1; i < lines.length; i++) {
      const cells = splitSheetLine(lines[i], sep);
      const rawObj: Record<string, string> = {};
      cells.forEach((val, idx) => {
        const key = colMap[idx];
        if (key) rawObj[key] = val;
      });

      const grp = String(rawObj.groupNo || '').trim();
      const cust = String(rawObj.customer || '').trim();
      const supp = String(rawObj.supplier || '').trim();
      const dt = normalizeSheetDate(rawObj.date);
      const px = Math.round(Number(toWestDigits(rawObj.pax || '0').replace(/[^\d.-]/g, '')));
      const currRaw = String(rawObj.currency || 'SAR').trim().toUpperCase();
      const curr: Currency = currRaw.includes('USD') || currRaw.includes('دولار') || currRaw === '$' ? 'USD' : 'SAR';
      const bPrice = Number(toWestDigits(rawObj.buy || '0').replace(/[^\d.-]/g, '')) || 0;
      const sPrice = Number(toWestDigits(rawObj.sell || '0').replace(/[^\d.-]/g, '')) || 0;
      const fx = Number(toWestDigits(rawObj.rate || String(db.rate || 3.75)).replace(/[^\d.-]/g, '')) || db.rate || 3.75;
      const nt = String(rawObj.notes || '').trim();

      let status: ParsedSheetRow['status'] = 'valid';
      let reason = bi(lang, 'جاهز للاستيراد', 'Ready');

      if (!grp || !cust || !supp || !(px >= 1)) {
        status = 'error';
        reason = bi(lang, 'بيانات ناقصة أو عدد المعتمرين غير صحيح', 'Missing required values or invalid Pax');
      } else if (existingSet.has(grp.toLowerCase()) || seenInFile.has(grp.toLowerCase())) {
        status = 'duplicate';
        reason = bi(lang, 'رقم مجموعة مكرر', 'Duplicate group #');
      } else {
        seenInFile.add(grp.toLowerCase());
      }

      parsed.push({
        rowNum: i,
        status,
        reason,
        entry: {
          id: baseId + i,
          groupNo: grp,
          date: dt,
          pax: Math.max(1, px || 1),
          customer: cust,
          supplier: supp,
          currency: curr,
          buy: Math.max(0, bPrice),
          sell: Math.max(0, sPrice),
          rate: fx > 0 ? fx : db.rate || 3.75,
          notes: nt,
        },
      });
    }

    setSheetRows(parsed);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      parseSheetText(String(reader.result || ''));
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const confirmImportSheet = async () => {
    if (!sheetRows) return;
    const validEntries = sheetRows.filter((r) => r.status === 'valid').map((r) => r.entry);
    if (!validEntries.length) {
      onToast(bi(lang, 'لا توجد صفوف صالحة للاستيراد', 'No valid rows to import'), 'error');
      return;
    }
    setImporting(true);
    try {
      await onImportBatch(validEntries);
      onToast(
        bi(
          lang,
          `تم استيراد ${validEntries.length} مجموعة تأشيرات بنجاح`,
          `Imported ${validEntries.length} visa groups successfully`
        )
      );
      setSheetRows(null);
      setPasteText('');
      setPasteOpen(false);
    } finally {
      setImporting(false);
    }
  };

  const columnOptions = useMemo(() => {
    const result = {} as Record<VisaFilterCol, FilterOptionItem[]>;
    for (const col of VISA_FILTER_COLS) {
      const map = new Map<string, FilterOptionItem>();
      for (const e of db.entries) {
        const meta = getEntryFilterMeta(e, col, db.rate, lang);
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
  }, [db.entries, db.rate, lang]);

  const toggleOptionValue = (col: VisaFilterCol, key: string) => {
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
    setCurrentPage(1);
  };

  const selectAllColumnOptions = (col: VisaFilterCol) => {
    setSelectedFilters((prev) => {
      const updated = { ...prev };
      delete updated[col];
      return updated;
    });
    setCurrentPage(1);
  };

  const clearColumnOptionsSelection = (col: VisaFilterCol) => {
    setSelectedFilters((prev) => ({ ...prev, [col]: [] }));
    setCurrentPage(1);
  };

  const clearSingleColumnFilter = (col: VisaFilterCol) => {
    setSelectedFilters((prev) => {
      const updated = { ...prev };
      delete updated[col];
      return updated;
    });
    if (sortState?.col === col) {
      setSortState(null);
    }
    setCurrentPage(1);
  };

  const filteredEntries = useMemo(() => {
    const norm = (val: unknown) =>
      toWestDigits(String(val ?? ''))
        .toLowerCase()
        .replace(/,/g, '')
        .trim();

    const q = norm(search);
    const cf = {
      groupNo: norm(colFilters.groupNo),
      customer: norm(colFilters.customer),
      supplier: norm(colFilters.supplier),
      pax: norm(colFilters.pax),
      buy: norm(colFilters.buy),
      sell: norm(colFilters.sell),
      totalSales: norm(colFilters.totalSales),
      profit: norm(colFilters.profit),
    };

    const filtered = db.entries.filter((e) => {
      const v = entryVals(e, db.rate);
      const fields = {
        groupNo: norm(e.groupNo),
        customer: norm(e.customer),
        supplier: norm(e.supplier),
        pax: norm(e.pax),
        buy: norm(`${e.buy} ${e.currency} ${fmt(e.buy)} ${v.buy.toFixed(2)} ${fmt(v.buy)}`),
        sell: norm(`${e.sell} ${e.currency} ${fmt(e.sell)} ${v.sell.toFixed(2)} ${fmt(v.sell)}`),
        totalSales: norm(`${v.sales.toFixed(2)} ${fmt(v.sales)} ${Math.round(v.sales)}`),
        profit: norm(`${v.profit.toFixed(2)} ${fmt(v.profit)} ${Math.round(v.profit)}`),
      };

      if (q) {
        if (searchField === 'all') {
          const combined = `${norm(e.date)} ${fields.groupNo} ${fields.customer} ${fields.supplier} ${fields.pax} ${fields.buy} ${fields.sell} ${fields.totalSales} ${fields.profit} ${norm(e.notes)}`;
          if (!combined.includes(q)) return false;
        } else if (!fields[searchField].includes(q)) {
          return false;
        }
      }

      if (cf.groupNo && !fields.groupNo.includes(cf.groupNo)) return false;
      if (cf.customer && !fields.customer.includes(cf.customer)) return false;
      if (cf.supplier && !fields.supplier.includes(cf.supplier)) return false;
      if (cf.pax && !fields.pax.includes(cf.pax)) return false;
      if (cf.buy && !fields.buy.includes(cf.buy)) return false;
      if (cf.sell && !fields.sell.includes(cf.sell)) return false;
      if (cf.totalSales && !fields.totalSales.includes(cf.totalSales)) return false;
      if (cf.profit && !fields.profit.includes(cf.profit)) return false;

      for (const col of VISA_FILTER_COLS) {
        const sel = selectedFilters[col];
        if (sel !== undefined) {
          const meta = getEntryFilterMeta(e, col, db.rate, lang);
          if (!sel.includes(meta.key)) return false;
        }
      }

      return true;
    });

    if (sortState) {
      const factor = sortState.dir === 'asc' ? 1 : -1;
      return filtered.slice().sort((a, b) => {
        const av = getEntryFilterMeta(a, sortState.col, db.rate, lang).sortVal;
        const bv = getEntryFilterMeta(b, sortState.col, db.rate, lang).sortVal;
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
  }, [db.entries, db.rate, search, searchField, colFilters, selectedFilters, sortState, lang]);

  const totalPages = useMemo(() => {
    if (pageSize === 'all') return 1;
    return Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  }, [filteredEntries.length, pageSize]);

  const safePage = Math.min(currentPage, totalPages);

  const paginatedEntries = useMemo(() => {
    if (pageSize === 'all') return filteredEntries;
    const start = (safePage - 1) * pageSize;
    return filteredEntries.slice(start, start + pageSize);
  }, [filteredEntries, pageSize, safePage]);

  const {
    filteredPaxTotal,
    filteredSalesUSD,
    filteredCostUSD,
    filteredSalesSAR,
    filteredCostSAR,
    filteredProfitSAR,
    filteredUnitBuySAR,
    filteredUnitSellSAR,
  } = useMemo(() => {
    const paxTotal = sumBy(filteredEntries, (e) => Number(e.pax || 0));
    const salesSAR = sumBy(filteredEntries, (e) => entryVals(e, db.rate).sales);
    const costSAR = sumBy(filteredEntries, (e) => entryVals(e, db.rate).cost);
    const profitSAR = sumBy(filteredEntries, (e) => entryVals(e, db.rate).profit);
    const unitBuySAR = sumBy(filteredEntries, (e) => entryVals(e, db.rate).buy);
    const unitSellSAR = sumBy(filteredEntries, (e) => entryVals(e, db.rate).sell);
    const salesUSD = sumBy(filteredEntries, (e) => {
      const paxCount = Number(e.pax || 0);
      const sellAmt = Number(e.sell || 0) * paxCount;
      if (e.currency === 'USD') return sellAmt;
      const fx = Number(e.rate || db.rate || 3.75) || 3.75;
      return sellAmt / fx;
    });
    const costUSD = sumBy(filteredEntries, (e) => {
      const paxCount = Number(e.pax || 0);
      const buyAmt = Number(e.buy || 0) * paxCount;
      if (e.currency === 'USD') return buyAmt;
      const fx = Number(e.rate || db.rate || 3.75) || 3.75;
      return buyAmt / fx;
    });
    return {
      filteredPaxTotal: paxTotal,
      filteredSalesUSD: salesUSD,
      filteredCostUSD: costUSD,
      filteredSalesSAR: salesSAR,
      filteredCostSAR: costSAR,
      filteredProfitSAR: profitSAR,
      filteredUnitBuySAR: unitBuySAR,
      filteredUnitSellSAR: unitSellSAR,
    };
  }, [filteredEntries, db.rate]);

  const avgBuyPerVisaSAR = filteredPaxTotal > 0 ? filteredCostSAR / filteredPaxTotal : 0;
  const avgSellPerVisaSAR = filteredPaxTotal > 0 ? filteredSalesSAR / filteredPaxTotal : 0;
  const profitMarginPct =
    filteredSalesSAR > 0 ? ((filteredProfitSAR / filteredSalesSAR) * 100).toFixed(1) : '0.0';

  const exportCsv = () => {
    csvDownload('visa_entries.csv', [
      [
        tKey(lang, 'thGroup'),
        tKey(lang, 'thDate'),
        tKey(lang, 'thCount'),
        tKey(lang, 'thCustomer'),
        tKey(lang, 'thSupplier'),
        tKey(lang, 'lblCurrency'),
        tKey(lang, 'thBuyUnit'),
        tKey(lang, 'thSellUnit'),
        tKey(lang, 'lblFxRate'),
        tKey(lang, 'thTotalSales'),
        tKey(lang, 'thProfit'),
        tKey(lang, 'lblNotes'),
      ],
      ...db.entries.map((e) => {
        const v = entryVals(e, db.rate);
        return [
          e.groupNo,
          e.date,
          e.pax,
          e.customer,
          e.supplier,
          e.currency,
          e.buy,
          e.sell,
          e.rate,
          v.sales.toFixed(2),
          v.profit.toFixed(2),
          e.notes || '',
        ];
      }),
    ]);
  };

  const validCount = sheetRows?.filter((r) => r.status === 'valid').length || 0;
  const dupCount = sheetRows?.filter((r) => r.status === 'duplicate').length || 0;
  const errCount = sheetRows?.filter((r) => r.status === 'error').length || 0;

  return (
    <div className="space-y-5">
      {/* Sheet Import Panel */}
      <Panel
        className="no-print"
        title={
          <span className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[#0f766e]" />
            <span>{tKey(lang, 'visaImportTitle')}</span>
          </span>
        }
        actions={
          <>
            <button type="button" onClick={downloadTemplate} className={btnSecondaryCls}>
              <Download className="w-3.5 h-3.5" />
              <span>{tKey(lang, 'btnVisaTpl')}</span>
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} className={btnPrimaryCls}>
              <Upload className="w-3.5 h-3.5" />
              <span>{tKey(lang, 'btnUploadSheet')}</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button type="button" onClick={() => setPasteOpen((v) => !v)} className={btnSecondaryCls}>
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span>{tKey(lang, 'btnPasteExcel')}</span>
            </button>
          </>
        }
      >
        <p className="text-xs text-slate-600 leading-relaxed">{tKey(lang, 'visaImportDesc')}</p>

        {pasteOpen && (
          <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
            <label className={labelCls}>{tKey(lang, 'lblPasteHint')}</label>
            <textarea
              rows={5}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Group No	Date	Pax	Customer	Visa Supplier	Currency	Buy Price	Sell Price"
              className="w-full p-3 rounded-xl border border-slate-200 text-xs font-mono focus:outline-none focus:border-[#1d4ed8]"
            />
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => parseSheetText(pasteText)} className={btnPrimaryCls}>
                <span>{tKey(lang, 'btnPreviewSheet')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPasteOpen(false);
                  setPasteText('');
                }}
                className={btnSecondaryCls}
              >
                <span>{tKey(lang, 'btnCancel')}</span>
              </button>
            </div>
          </div>
        )}

        {sheetRows && (
          <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span className="px-2.5 py-1 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                  {bi(lang, `صالح: ${validCount}`, `Valid: ${validCount}`)}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                  {bi(lang, `مكرر: ${dupCount}`, `Duplicate: ${dupCount}`)}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">
                  {bi(lang, `أخطاء: ${errCount}`, `Errors: ${errCount}`)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSheetRows(null)}
                  className={btnSecondaryCls}
                >
                  {tKey(lang, 'btnCancel')}
                </button>
                <button
                  type="button"
                  disabled={importing || validCount === 0}
                  onClick={confirmImportSheet}
                  className={btnTealCls}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {importing
                      ? bi(lang, 'جاري الاستيراد...', 'Importing...')
                      : bi(lang, `تأكيد استيراد (${validCount})`, `Confirm Import (${validCount})`)}
                  </span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-64 border border-slate-200 rounded-xl">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <th className="py-2 px-2.5 text-start font-bold">#</th>
                    <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thGroup')}</th>
                    <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thDate')}</th>
                    <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thCount')}</th>
                    <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thCustomer')}</th>
                    <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thSupplier')}</th>
                    <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thSales')}</th>
                    <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thStatus')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sheetRows.map((r) => {
                    const cls =
                      r.status === 'valid'
                        ? 'bg-teal-50 text-teal-800'
                        : r.status === 'duplicate'
                          ? 'bg-amber-50 text-amber-800'
                          : 'bg-red-50 text-red-700';
                    const vals = entryVals(r.entry, db.rate);
                    return (
                      <tr key={r.rowNum}>
                        <td className="py-1.5 px-2.5 font-mono-num">{r.rowNum}</td>
                        <td className="py-1.5 px-2.5 font-bold">{r.entry.groupNo || '-'}</td>
                        <td className="py-1.5 px-2.5 font-mono-num">{r.entry.date}</td>
                        <td className="py-1.5 px-2.5 font-mono-num">{r.entry.pax}</td>
                        <td className="py-1.5 px-2.5">{r.entry.customer || '-'}</td>
                        <td className="py-1.5 px-2.5">{r.entry.supplier || '-'}</td>
                        <td className="py-1.5 px-2.5 font-mono-num">{fmt(vals.sales)}</td>
                        <td className="py-1.5 px-2.5">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>
                            {r.reason}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Panel>

      {/* Visa Entry / Edit Form */}
      <Panel
        className="no-print"
        title={editId ? tKey(lang, 'visaFormEdit') : tKey(lang, 'visaFormNew')}
        actions={
          <button type="button" onClick={resetForm} className={btnSecondaryCls}>
            {tKey(lang, 'btnClear')}
          </button>
        }
      >
        <div className="mb-4 p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-slate-700">
          {tKey(lang, 'visaNotice')}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <div className="text-xs font-bold text-[#1d4ed8] pb-2 mb-3 border-b border-slate-200">
              {tKey(lang, 'visaSec1')}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              <div>
                <label className={labelCls}>{tKey(lang, 'lblGroupNo')}</label>
                <input
                  type="text"
                  required
                  value={groupNo}
                  onChange={(e) => setGroupNo(e.target.value)}
                  placeholder="GRP-1448-01"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{tKey(lang, 'lblRegDate')}</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{tKey(lang, 'lblPax')}</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={pax}
                  onChange={(e) => setPax(e.target.value)}
                  className={`${inputCls} font-mono-num`}
                />
              </div>
              <div>
                <label className={labelCls}>{tKey(lang, 'lblCustomer')}</label>
                <input
                  type="text"
                  required
                  list="visa-customers-dl"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{tKey(lang, 'lblVisaSupp')}</label>
                <input
                  type="text"
                  required
                  list="visa-suppliers-dl"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-[#1d4ed8] pb-2 mb-3 border-b border-slate-200">
              {tKey(lang, 'visaSec2')}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 items-end">
              <div>
                <label className={labelCls}>{tKey(lang, 'lblCurrency')}</label>
                <select
                  value={currency}
                  onChange={(e) => handleCurrencyChange(e.target.value as Currency)}
                  className={inputCls}
                >
                  <option value="SAR">SAR (ر.س)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>
              <div className="flex items-center h-9 px-3 rounded-lg bg-slate-50 border border-slate-200">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currency === 'SAR'}
                    onChange={(e) => handleSarOnlyToggle(e.target.checked)}
                    className="w-4 h-4 accent-[#0f766e]"
                  />
                  <span>{tKey(lang, 'lblSarOnly')}</span>
                </label>
              </div>
              <div>
                <label className={labelCls}>{tKey(lang, 'lblBuyPrice')}</label>
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
                <label className={labelCls}>{tKey(lang, 'lblSellPrice')}</label>
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

            {/* Direct SAR Box */}
            <div className="mt-4 p-4 rounded-xl bg-teal-50/60 border border-teal-200">
              <div className="text-xs font-bold text-[#0f766e] mb-3">{tKey(lang, 'sarBoxTitle')}</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className={labelCls}>{tKey(lang, 'lblBuySar')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={Number(buySARVal.toFixed(2))}
                    onChange={(e) => handleBuySarInput(e.target.value)}
                    className={`${inputCls} font-mono-num`}
                  />
                </div>
                <div>
                  <label className={labelCls}>{tKey(lang, 'lblSellSar')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={Number(sellSARVal.toFixed(2))}
                    onChange={(e) => handleSellSarInput(e.target.value)}
                    className={`${inputCls} font-mono-num`}
                  />
                </div>
                <div>
                  <label className={labelCls}>{tKey(lang, 'lblUnitProfitSar')}</label>
                  <div className="h-9 px-3 rounded-lg bg-white border border-teal-200 flex items-center font-mono-num text-xs font-bold text-[#0f766e]">
                    {fmt(unitProfitSAR)} SAR
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-end">
              <div className="lg:col-span-6">
                <label className={labelCls}>{tKey(lang, 'lblNotes')}</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="lg:col-span-6 flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-xs font-mono-num space-x-3 rtl:space-x-reverse">
                  <span className="text-slate-600">
                    {bi(lang, 'التكلفة:', 'Cost:')} <strong className="text-slate-900">{fmt(totalCostSAR)}</strong>
                  </span>
                  <span className="text-slate-600">
                    {bi(lang, 'البيع:', 'Sales:')} <strong className="text-[#1d4ed8]">{fmt(totalSalesSAR)}</strong>
                  </span>
                  <span className="text-slate-600">
                    {bi(lang, 'الربح:', 'Profit:')}{' '}
                    <strong className={totalProfitSAR >= 0 ? 'text-[#0f766e]' : 'text-red-700'}>
                      {fmt(totalProfitSAR)}
                    </strong>
                  </span>
                </div>
                <button type="submit" disabled={saving} className={btnPrimaryCls}>
                  <Plus className="w-3.5 h-3.5" />
                  <span>{editId ? tKey(lang, 'btnUpdate') : tKey(lang, 'btnSave')}</span>
                </button>
              </div>
            </div>
          </div>
        </form>

        <datalist id="visa-customers-dl">
          {customerNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <datalist id="visa-suppliers-dl">
          {visaSupplierNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </Panel>

      {/* Visa Log Table */}
      <Panel
        title={
          <span className="flex items-center gap-2">
            <span>{tKey(lang, 'visaLogTitle')}</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-mono-num">
              {filteredEntries.length} / {db.entries.length}
            </span>
          </span>
        }
        actions={
          <>
            <select
              aria-label={bi(lang, 'عدد الصفوف في الصفحة', 'Rows per page')}
              value={pageSize}
              onChange={(e) => {
                const val = e.target.value;
                setPageSize(val === 'all' ? 'all' : Number(val));
                setCurrentPage(1);
              }}
              className="h-9 px-3 rounded-xl border border-slate-200 text-xs bg-white font-semibold text-slate-700 focus:outline-none focus:border-[#1d4ed8]"
            >
              <option value={10}>{bi(lang, 'عرض: 10', 'Show: 10')}</option>
              <option value={20}>{bi(lang, 'عرض: 20', 'Show: 20')}</option>
              <option value={30}>{bi(lang, 'عرض: 30', 'Show: 30')}</option>
              <option value={50}>{bi(lang, 'عرض: 50', 'Show: 50')}</option>
              <option value="all">{bi(lang, 'عرض: الكل', 'Show: All')}</option>
            </select>
            <select
              aria-label={bi(lang, 'نطاق البحث', 'Search Field')}
              value={searchField}
              onChange={(e) => {
                setSearchField(e.target.value as typeof searchField);
                setCurrentPage(1);
              }}
              className="h-9 px-2.5 rounded-xl border border-slate-200 text-xs bg-white font-semibold text-slate-700 focus:outline-none focus:border-[#1d4ed8]"
            >
              <option value="all">{bi(lang, 'بحث في: الكل', 'Search: All')}</option>
              <option value="groupNo">{tKey(lang, 'thGroup')}</option>
              <option value="customer">{tKey(lang, 'thCustomer')}</option>
              <option value="supplier">{tKey(lang, 'thSupplier')}</option>
              <option value="pax">{tKey(lang, 'thCount')}</option>
              <option value="buy">{tKey(lang, 'thBuyUnit')}</option>
              <option value="sell">{tKey(lang, 'thSellUnit')}</option>
              <option value="totalSales">{tKey(lang, 'thTotalSales')}</option>
              <option value="profit">{tKey(lang, 'thProfit')}</option>
            </select>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-2.5 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder={bi(lang, 'ابحث هنا...', 'Search...')}
                className="h-9 ps-8 pe-7 rounded-xl border border-slate-200 text-xs w-48 focus:outline-none focus:border-[#1d4ed8]"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setCurrentPage(1);
                  }}
                  title={bi(lang, 'مسح', 'Clear')}
                  className="absolute top-1/2 -translate-y-1/2 end-2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {hasActiveSearch && (
              <button type="button" onClick={clearAllSearch} className={btnSecondaryCls}>
                <X className="w-3.5 h-3.5" />
                <span>{bi(lang, 'مسح الفلاتر', 'Clear Filters')}</span>
              </button>
            )}
            <button type="button" onClick={exportCsv} className={btnSecondaryCls}>
              <Download className="w-3.5 h-3.5" />
              <span>{tKey(lang, 'btnCsv')}</span>
            </button>
            {db.entries.length > 0 && (
              <button type="button" onClick={handleDeleteAll} className={btnDangerCls}>
                <Trash2 className="w-3.5 h-3.5" />
                <span>{tKey(lang, 'btnDelAllGroups')}</span>
              </button>
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
                    {getFilterColLabel(col, lang)} ({count})
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
                  {bi(lang, 'ترتيب:', 'Sort:')} {getFilterColLabel(sortState.col, lang)}{' '}
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
              onClick={clearAllSearch}
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
                <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thDate')}</th>
                {VISA_FILTER_COLS.map((col) => {
                  const isFiltered = selectedFilters[col] !== undefined;
                  const isSorted = sortState?.col === col;
                  const isActive = isFiltered || isSorted;
                  const isOpen = openFilterMenu?.col === col;
                  return (
                    <th key={col} className="py-2.5 px-2.5 text-start font-bold whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <span>{getFilterColLabel(col, lang)}</span>
                        <button
                          type="button"
                          onClick={(ev) => toggleFilterMenu(col, ev.currentTarget)}
                          title={bi(lang, `فلترة حسب ${getFilterColLabel(col, lang)}`, `Filter by ${getFilterColLabel(col, lang)}`)}
                          className={`no-print visa-filter-trigger inline-flex items-center justify-center w-6 h-6 rounded-md border transition cursor-pointer ${
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
                <th className="py-1.5 px-2 text-[11px] font-normal text-slate-400">—</th>
                <th className="py-1.5 px-1.5">
                  <input
                    type="text"
                    value={colFilters.groupNo}
                    onChange={(e) => updateColFilter('groupNo', e.target.value)}
                    placeholder={tKey(lang, 'thGroup')}
                    className="w-full min-w-[76px] h-7 px-2 rounded-lg border border-slate-200 bg-white text-[11px] font-normal text-slate-800 focus:outline-none focus:border-[#1d4ed8]"
                  />
                </th>
                <th className="py-1.5 px-1.5">
                  <input
                    type="text"
                    value={colFilters.customer}
                    onChange={(e) => updateColFilter('customer', e.target.value)}
                    placeholder={tKey(lang, 'thCustomer')}
                    className="w-full min-w-[85px] h-7 px-2 rounded-lg border border-slate-200 bg-white text-[11px] font-normal text-slate-800 focus:outline-none focus:border-[#1d4ed8]"
                  />
                </th>
                <th className="py-1.5 px-1.5">
                  <input
                    type="text"
                    value={colFilters.supplier}
                    onChange={(e) => updateColFilter('supplier', e.target.value)}
                    placeholder={tKey(lang, 'thSupplier')}
                    className="w-full min-w-[85px] h-7 px-2 rounded-lg border border-slate-200 bg-white text-[11px] font-normal text-slate-800 focus:outline-none focus:border-[#1d4ed8]"
                  />
                </th>
                <th className="py-1.5 px-1.5">
                  <input
                    type="text"
                    value={colFilters.pax}
                    onChange={(e) => updateColFilter('pax', e.target.value)}
                    placeholder={tKey(lang, 'thCount')}
                    className="w-full min-w-[54px] h-7 px-2 rounded-lg border border-slate-200 bg-white text-[11px] font-mono-num font-normal text-slate-800 focus:outline-none focus:border-[#1d4ed8]"
                  />
                </th>
                <th className="py-1.5 px-1.5">
                  <input
                    type="text"
                    value={colFilters.buy}
                    onChange={(e) => updateColFilter('buy', e.target.value)}
                    placeholder={bi(lang, 'شراء', 'Buy')}
                    className="w-full min-w-[66px] h-7 px-2 rounded-lg border border-slate-200 bg-white text-[11px] font-mono-num font-normal text-slate-800 focus:outline-none focus:border-[#1d4ed8]"
                  />
                </th>
                <th className="py-1.5 px-1.5">
                  <input
                    type="text"
                    value={colFilters.sell}
                    onChange={(e) => updateColFilter('sell', e.target.value)}
                    placeholder={bi(lang, 'بيع', 'Sell')}
                    className="w-full min-w-[66px] h-7 px-2 rounded-lg border border-slate-200 bg-white text-[11px] font-mono-num font-normal text-slate-800 focus:outline-none focus:border-[#1d4ed8]"
                  />
                </th>
                <th className="py-1.5 px-1.5">
                  <input
                    type="text"
                    value={colFilters.totalSales}
                    onChange={(e) => updateColFilter('totalSales', e.target.value)}
                    placeholder={bi(lang, 'إجمالي البيع', 'Sales')}
                    className="w-full min-w-[76px] h-7 px-2 rounded-lg border border-slate-200 bg-white text-[11px] font-mono-num font-normal text-slate-800 focus:outline-none focus:border-[#1d4ed8]"
                  />
                </th>
                <th className="py-1.5 px-1.5">
                  <input
                    type="text"
                    value={colFilters.profit}
                    onChange={(e) => updateColFilter('profit', e.target.value)}
                    placeholder={bi(lang, 'الربح', 'Profit')}
                    className="w-full min-w-[70px] h-7 px-2 rounded-lg border border-slate-200 bg-white text-[11px] font-mono-num font-normal text-slate-800 focus:outline-none focus:border-[#1d4ed8]"
                  />
                </th>
                <th className="py-1.5 px-1.5 text-center">
                  {hasActiveSearch && (
                    <button
                      type="button"
                      onClick={clearAllSearch}
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
              {paginatedEntries.length === 0 ? (
                <EmptyRow colSpan={10} lang={lang} />
              ) : (
                paginatedEntries.map((e) => {
                  const v = entryVals(e, db.rate);
                  return (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="py-2 px-2.5 font-mono-num">{e.date}</td>
                      <td className="py-2 px-2.5 font-bold text-slate-900">{e.groupNo}</td>
                      <td className="py-2 px-2.5">{e.customer}</td>
                      <td className="py-2 px-2.5">{e.supplier}</td>
                      <td className="py-2 px-2.5 font-mono-num">{e.pax}</td>
                      <td className="py-2 px-2.5 font-mono-num">
                        {fmt(e.buy)} {e.currency}
                      </td>
                      <td className="py-2 px-2.5 font-mono-num">
                        {fmt(e.sell)} {e.currency}
                      </td>
                      <td className="py-2 px-2.5 font-mono-num font-semibold">{fmt(v.sales)}</td>
                      <td className="py-2 px-2.5 font-mono-num font-bold text-[#0f766e]">{fmt(v.profit)}</td>
                      <td className="py-2 px-2.5 no-print">
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={() => handleEdit(e)} className={btnSoftBlueCls}>
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button type="button" onClick={() => handleDeleteRow(e)} className={btnSoftRedCls}>
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredEntries.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-900">
                  <td colSpan={4} className="py-2.5 px-2.5">
                    {bi(lang, 'الإجمالي', 'Total')} ({filteredEntries.length})
                  </td>
                  <td className="py-2.5 px-2.5 font-mono-num text-[#1d4ed8]">
                    {filteredPaxTotal.toLocaleString('en-US')}
                  </td>
                  <td
                    className="py-2.5 px-2.5 font-mono-num text-amber-700"
                    title={bi(
                      lang,
                      `متوسط شراء/تأشيرة: ${fmt(avgBuyPerVisaSAR)} ر.س | إجمالي الشراء: ${fmt(filteredCostSAR)} ر.س`,
                      `Avg buy/visa: ${fmt(avgBuyPerVisaSAR)} SAR | Total Cost: ${fmt(filteredCostSAR)} SAR`
                    )}
                  >
                    {fmt(filteredUnitBuySAR)} {bi(lang, 'ر.س', 'SAR')}
                  </td>
                  <td
                    className="py-2.5 px-2.5 font-mono-num text-[#1d4ed8]"
                    title={bi(
                      lang,
                      `متوسط بيع/تأشيرة: ${fmt(avgSellPerVisaSAR)} ر.س`,
                      `Avg sell/visa: ${fmt(avgSellPerVisaSAR)} SAR`
                    )}
                  >
                    {fmt(filteredUnitSellSAR)} {bi(lang, 'ر.س', 'SAR')}
                  </td>
                  <td className="py-2.5 px-2.5 font-mono-num text-slate-900">
                    {fmt(filteredSalesSAR)} {bi(lang, 'ر.س', 'SAR')}
                  </td>
                  <td className="py-2.5 px-2.5 font-mono-num text-[#0f766e]">
                    {fmt(filteredProfitSAR)}
                  </td>
                  <td className="py-2.5 px-2.5 no-print" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {filteredEntries.length > 0 && (
          <div className="no-print mt-4 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono-num">
                {pageSize === 'all'
                  ? bi(
                      lang,
                      `عرض جميع السجلات (${filteredEntries.length})`,
                      `Showing all ${filteredEntries.length} records`
                    )
                  : bi(
                      lang,
                      `عرض ${(safePage - 1) * pageSize + 1} - ${Math.min(safePage * pageSize, filteredEntries.length)} من ${filteredEntries.length}`,
                      `Showing ${(safePage - 1) * pageSize + 1} - ${Math.min(safePage * pageSize, filteredEntries.length)} of ${filteredEntries.length}`
                    )}
              </span>
              <div className="inline-flex items-center gap-1">
                {([10, 20, 30, 50] as const).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => {
                      setPageSize(sz);
                      setCurrentPage(1);
                    }}
                    className={`px-2.5 h-7 rounded-lg font-mono-num font-semibold transition cursor-pointer ${
                      pageSize === sz
                        ? 'bg-[#1d4ed8] text-white'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setPageSize('all');
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 h-7 rounded-lg font-semibold transition cursor-pointer ${
                    pageSize === 'all'
                      ? 'bg-[#1d4ed8] text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {bi(lang, 'الكل', 'All')}
                </button>
              </div>
            </div>

            {pageSize !== 'all' && totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 font-semibold transition cursor-pointer"
                >
                  {lang === 'ar' ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                  <span>{bi(lang, 'السابق', 'Prev')}</span>
                </button>
                <span className="px-2.5 font-mono-num font-bold text-slate-800">
                  {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 font-semibold transition cursor-pointer"
                >
                  <span>{bi(lang, 'التالي', 'Next')}</span>
                  {lang === 'ar' ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* Bottom Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <KpiCard
          tone="blue"
          label={bi(lang, 'إجمالي عدد المعتمرين', 'Total Pilgrims')}
          value={filteredPaxTotal.toLocaleString('en-US')}
          sub={bi(lang, `${filteredEntries.length} مجموعة`, `${filteredEntries.length} groups`)}
        />
        <KpiCard
          tone="amber"
          label={bi(lang, 'إجمالي شراء التأشيرة بالريال', 'Total Visa Purchase in SAR')}
          value={`${fmt(filteredCostSAR)} ${bi(lang, 'ر.س', 'SAR')}`}
          sub={bi(
            lang,
            `متوسط شراء/تأشيرة: ${fmt(avgBuyPerVisaSAR)} ر.س | مجموع عمود شراء/تأشيرة: ${fmt(filteredUnitBuySAR)} ر.س`,
            `Avg/visa: ${fmt(avgBuyPerVisaSAR)} SAR | Unit sum: ${fmt(filteredUnitBuySAR)} SAR`
          )}
        />
        <KpiCard
          tone="teal"
          label={bi(lang, 'إجمالي بيع التأشيرة بالريال', 'Total Visa Sales in SAR')}
          value={`${fmt(filteredSalesSAR)} ${bi(lang, 'ر.س', 'SAR')}`}
          sub={bi(
            lang,
            `متوسط بيع/تأشيرة: ${fmt(avgSellPerVisaSAR)} ر.س | مجموع عمود بيع/تأشيرة: ${fmt(filteredUnitSellSAR)} ر.س`,
            `Avg/visa: ${fmt(avgSellPerVisaSAR)} SAR | Unit sum: ${fmt(filteredUnitSellSAR)} SAR`
          )}
        />
        <KpiCard
          tone="slate"
          label={bi(lang, 'إجمالي البيع بالدولار', 'Total Sales in USD')}
          value={fmtUSD(filteredSalesUSD)}
          sub={bi(
            lang,
            `إجمالي الشراء بالدولار: ${fmtUSD(filteredCostUSD)}`,
            `Total Purchase USD: ${fmtUSD(filteredCostUSD)}`
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
        const allSelectedCount = currentSelected === undefined ? allOptions.length : currentSelected.length;

        return (
          <div
            ref={popoverRef}
            className="no-print visa-filter-popover fixed z-50 w-66 bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden text-xs"
          >
            <div className="px-3 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 truncate">
                <Filter className="w-3.5 h-3.5 text-[#1d4ed8] shrink-0" />
                <span className="truncate">{getFilterColLabel(col, lang)}</span>
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
                onClick={() => {
                  setSortState((prev) =>
                    prev?.col === col && prev.dir === 'asc' ? null : { col, dir: 'asc' }
                  );
                  setCurrentPage(1);
                }}
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
                onClick={() => {
                  setSortState((prev) =>
                    prev?.col === col && prev.dir === 'desc' ? null : { col, dir: 'desc' }
                  );
                  setCurrentPage(1);
                }}
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
