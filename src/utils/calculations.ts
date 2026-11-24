import {
  AccountingDB,
  Currency,
  EmployeeRecord,
  HOTEL_CITIES,
  HOTEL_MEAL_PLANS,
  HOTEL_ROOM_TYPES,
  HotelBooking,
  HotelCity,
  HotelMealPlan,
  HotelRoomType,
  Lang,
  ROUTE_EN,
  SupplierCategory,
  TREASURY_ACCOUNTS,
  TREASURY_CATEGORIES,
  TreasuryCurrency,
  TransportEntry,
  VEHICLE_EN,
  VisaEntry,
} from '../types/accounting';
import { bi } from '../i18n/translations';

export function fmt(n: number | string | undefined | null): string {
  return Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtUSD(n: number | string | undefined | null): string {
  return '$' + fmt(n);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatTime24(d: Date = new Date(), withSeconds = true): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (!withSeconds) return `${hh}:${mm}`;
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/**
 * Normalizes any time string (including 12h AM/PM / ص/م or HH:mm:ss) into strict 24-hour "HH:MM".
 */
export function normalizeTime24(raw?: string | null): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const ampm = s.match(/^(\d{1,2})[:.](\d{1,2})(?:[:.]\d{1,2})?\s*(am|pm|a\.m\.|p\.m\.|ص|صباحا|صباحاً|م|مساء|مساءً)$/i);
  if (ampm) {
    let hh = Math.min(23, Math.max(0, Number(ampm[1])));
    const mm = Math.min(59, Math.max(0, Number(ampm[2])));
    const suf = ampm[3].toLowerCase();
    const isPm = suf.startsWith('p') || suf.startsWith('م');
    const isAm = suf.startsWith('a') || suf.startsWith('ص');
    if (isPm && hh < 12) hh += 12;
    if (isAm && hh === 12) hh = 0;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  const hm = s.match(/^(\d{1,2})[:.](\d{1,2})(?:[:.]\d{1,2})?$/);
  if (hm) {
    const hh = Math.min(23, Math.max(0, Number(hm[1])));
    const mm = Math.min(59, Math.max(0, Number(hm[2])));
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  const compact = s.match(/^(\d{2})(\d{2})$/);
  if (compact) {
    const hh = Math.min(23, Math.max(0, Number(compact[1])));
    const mm = Math.min(59, Math.max(0, Number(compact[2])));
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  return s.slice(0, 20);
}

export function getEgpAmount(
  rec: {
    amount?: number;
    currency?: string;
    amountEGP?: number;
    amountSAR?: number;
  },
  defaultEgpPerSar = 13
): number {
  if (typeof rec.amountEGP === 'number' && rec.amountEGP > 0) {
    return Number(rec.amountEGP);
  }
  if (rec.currency === 'EGP') {
    return Number(rec.amount || 0);
  }
  const sar = Number(rec.amountSAR || 0);
  if (sar > 0) {
    return Number((sar * defaultEgpPerSar).toFixed(2));
  }
  return Number(rec.amount || 0);
}

export function addDaysISO(iso: string, days: number): string {
  const base = iso ? new Date(iso + 'T00:00:00Z') : new Date();
  if (Number.isNaN(base.getTime())) return today();
  base.setUTCDate(base.getUTCDate() + Math.round(Number(days || 0)));
  return base.toISOString().slice(0, 10);
}

export function calcNights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 1;
  const d1 = new Date(checkIn + 'T00:00:00Z');
  const d2 = new Date(checkOut + 'T00:00:00Z');
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return 1;
  return Math.max(1, Math.min(365, Math.round((d2.getTime() - d1.getTime()) / 86400000)));
}

export function toSAR(
  amount: number | string,
  curr: Currency | TreasuryCurrency | string,
  rate: number,
  defaultRate = 3.75
): number {
  const amt = Number(amount || 0);
  if (curr === 'USD') {
    const r = Number(rate || defaultRate || 3.75);
    return amt * r;
  }
  if (curr === 'EGP') {
    const r = Number(rate || 13);
    return r > 0 ? amt / r : amt;
  }
  return amt;
}

export function sumBy<T>(arr: T[], fn: (item: T) => number): number {
  return arr.reduce((a, x) => a + fn(x), 0);
}

export function tRoute(r: string, lang: Lang): string {
  return lang === 'ar' ? r : ROUTE_EN[r] || r;
}

export function tVeh(v: string, lang: Lang): string {
  return lang === 'ar' ? v : VEHICLE_EN[v] || v;
}

export function tCity(c: HotelCity | string, lang: Lang): string {
  return (HOTEL_CITIES[c as HotelCity] && HOTEL_CITIES[c as HotelCity][lang]) || c || '';
}

export function tRoom(r: HotelRoomType | string, lang: Lang): string {
  return (HOTEL_ROOM_TYPES[r as HotelRoomType] && HOTEL_ROOM_TYPES[r as HotelRoomType][lang]) || r || '';
}

export function tMeal(m: HotelMealPlan | string, lang: Lang): string {
  return (HOTEL_MEAL_PLANS[m as HotelMealPlan] && HOTEL_MEAL_PLANS[m as HotelMealPlan][lang]) || m || '';
}

export function entryVals(e: VisaEntry, defaultRate = 3.75) {
  const r = Number(e.rate || defaultRate);
  const buy = toSAR(e.buy, e.currency, r, defaultRate);
  const sell = toSAR(e.sell, e.currency, r, defaultRate);
  return {
    buy,
    sell,
    cost: buy * e.pax,
    sales: sell * e.pax,
    profit: (sell - buy) * e.pax,
  };
}

export function trnVals(x: TransportEntry, defaultRate = 3.75) {
  const r = Number(x.rate || defaultRate);
  const buy = toSAR(x.buy, x.currency, r, defaultRate);
  const sell = toSAR(x.sell, x.currency, r, defaultRate);
  const cnt = Math.max(1, Number(x.vehicleCount || 1));
  return {
    buy,
    sell,
    cost: buy * cnt,
    sales: sell * cnt,
    profit: (sell - buy) * cnt,
  };
}

export function htlVals(x: HotelBooking, defaultRate = 3.75) {
  const r = Number(x.rate || defaultRate);
  const buy = toSAR(x.buy, x.currency, r, defaultRate);
  const sell = toSAR(x.sell, x.currency, r, defaultRate);
  const nights = Math.max(1, Number(x.nights || calcNights(x.checkIn, x.checkOut)));
  const rooms = Math.max(1, Number(x.rooms || 1));
  const roomNights = nights * rooms;
  if (x.status === 'cancelled') {
    return { buy, sell, nights, rooms, roomNights, cost: 0, sales: 0, profit: 0 };
  }
  const cost = buy * roomNights;
  const sales = sell * roomNights;
  return { buy, sell, nights, rooms, roomNights, cost, sales, profit: sales - cost };
}

export function calcEmpTotal(e: EmployeeRecord): number {
  return (
    Number(e.baseSalary || 0) +
    Number(e.housingAllowance || 0) +
    Number(e.transportAllowance || 0) +
    Number(e.otherAllowance || 0)
  );
}

export function calcTreasurySummary(db: AccountingDB) {
  const voucherReceipts = sumBy(
    db.vouchers.filter((v) => v.type === 'receipt'),
    (v) => Number(v.amountSAR || 0)
  );
  const voucherPayments = sumBy(
    db.vouchers.filter((v) => v.type === 'payment'),
    (v) => Number(v.amountSAR || 0)
  );
  const directIn = sumBy(
    db.treasury.filter((t) => t.type === 'in'),
    (t) => Number(t.amountSAR || 0)
  );
  const directOut = sumBy(
    db.treasury.filter((t) => t.type === 'out'),
    (t) => Number(t.amountSAR || 0)
  );
  const directCashboxNet = sumBy(
    db.treasury.filter((t) => t.account === 'cashbox'),
    (t) => (t.type === 'in' ? Number(t.amountSAR || 0) : -Number(t.amountSAR || 0))
  );
  const bankNet = sumBy(
    db.treasury.filter((t) => t.account === 'bank'),
    (t) => (t.type === 'in' ? Number(t.amountSAR || 0) : -Number(t.amountSAR || 0))
  );
  const custodyNet = sumBy(
    db.treasury.filter((t) => t.account === 'custody'),
    (t) => (t.type === 'in' ? Number(t.amountSAR || 0) : -Number(t.amountSAR || 0))
  );
  const payrollVaultTxs = db.treasury.filter((t) => t.account === 'payroll_vault');
  const payrollVaultNet = sumBy(payrollVaultTxs, (t) =>
    t.type === 'in' ? Number(t.amountSAR || 0) : -Number(t.amountSAR || 0)
  );
  const payrollVaultEGP = sumBy(payrollVaultTxs, (t) => {
    const val = getEgpAmount(t);
    return t.type === 'in' ? val : -val;
  });
  const payrollVaultUSD = sumBy(payrollVaultTxs, (t) => {
    const val = t.amountUSD !== undefined ? Number(t.amountUSD) : t.currency === 'USD' ? Number(t.amount || 0) : 0;
    return t.type === 'in' ? val : -val;
  });
  const payrollVaultOutEGP = sumBy(
    payrollVaultTxs.filter((t) => t.type === 'out'),
    (t) => getEgpAmount(t)
  );
  const payrollVaultOutUSD = sumBy(
    payrollVaultTxs.filter((t) => t.type === 'out'),
    (t) => (t.amountUSD !== undefined ? Number(t.amountUSD) : t.currency === 'USD' ? Number(t.amount || 0) : 0)
  );
  const payrollVaultOutSAR = sumBy(
    payrollVaultTxs.filter((t) => t.type === 'out'),
    (t) => Number(t.amountSAR || 0)
  );
  const operatingExpenses = sumBy(
    db.treasury.filter((t) => t.type === 'out' && t.category === 'expense'),
    (t) => Number(t.amountSAR || 0)
  );
  const payrollOutflows = sumBy(
    db.treasury.filter((t) => t.type === 'out' && (t.category === 'salary' || t.category === 'advance')),
    (t) => Number(t.amountSAR || 0)
  );
  return {
    voucherReceipts,
    voucherPayments,
    directIn,
    directOut,
    directNet: directIn - directOut,
    cashboxBalance: voucherReceipts - voucherPayments + directCashboxNet,
    bankNet,
    custodyNet,
    payrollVaultNet,
    payrollVaultEGP,
    payrollVaultUSD,
    payrollVaultOutEGP,
    payrollVaultOutUSD,
    payrollVaultOutSAR,
    totalLiquidity: voucherReceipts + directIn - (voucherPayments + directOut),
    operatingExpenses,
    payrollOutflows,
  };
}

export interface TreasuryLedgerRow {
  source: 'treasury' | 'voucher';
  id: number | null;
  refNo: string;
  date: string;
  type: 'in' | 'out';
  category: string;
  catLabel: string;
  account: string;
  accLabel: string;
  description: string;
  partyOrEmp: string;
  notes: string;
  currency?: TreasuryCurrency;
  rate?: number;
  amount?: number;
  amountEGP?: number;
  amountUSD?: number;
  inSAR: number;
  outSAR: number;
  balance: number;
}

export function buildTreasuryLedgerRows(
  db: AccountingDB,
  mode: 'unified' | 'direct',
  lang: Lang
): TreasuryLedgerRow[] {
  const rows: Omit<TreasuryLedgerRow, 'balance'>[] = db.treasury.map((x) => ({
    source: 'treasury',
    id: x.id,
    refNo: x.refNo,
    date: x.date,
    type: x.type,
    category: x.category,
    catLabel: (TREASURY_CATEGORIES[x.category] && TREASURY_CATEGORIES[x.category][lang]) || x.category,
    account: x.account,
    accLabel: (TREASURY_ACCOUNTS[x.account] && TREASURY_ACCOUNTS[x.account][lang]) || x.account,
    description: x.description,
    partyOrEmp: x.employeeName || '',
    notes: x.notes || '',
    currency: x.currency,
    rate: x.rate,
    amount: x.amount,
    amountEGP: x.amountEGP,
    amountUSD: x.amountUSD,
    inSAR: x.type === 'in' ? Number(x.amountSAR || 0) : 0,
    outSAR: x.type === 'out' ? Number(x.amountSAR || 0) : 0,
  }));

  if (mode === 'unified') {
    db.vouchers.forEach((v) => {
      rows.push({
        source: 'voucher',
        id: null,
        refNo: v.no,
        date: v.date,
        type: v.type === 'receipt' ? 'in' : 'out',
        category: 'voucher',
        catLabel: v.type === 'receipt' ? bi(lang, 'سند قبض', 'Receipt Voucher') : bi(lang, 'سند صرف', 'Payment Voucher'),
        account: 'cashbox',
        accLabel: TREASURY_ACCOUNTS.cashbox[lang],
        description:
          v.note ||
          (v.type === 'receipt' ? bi(lang, 'تحصيل من عميل', 'Customer Collection') : bi(lang, 'سداد لمورد', 'Supplier Payment')),
        partyOrEmp: v.party || '',
        notes: '',
        inSAR: v.type === 'receipt' ? Number(v.amountSAR || 0) : 0,
        outSAR: v.type === 'payment' ? Number(v.amountSAR || 0) : 0,
      });
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || String(a.refNo).localeCompare(String(b.refNo)));
  let bal = 0;
  return rows.map((r) => {
    bal += r.inSAR - r.outSAR;
    return { ...r, balance: bal };
  });
}

export function getPartyNames(
  db: AccountingDB,
  field: 'customer' | 'supplier',
  lang: Lang,
  catFilter?: SupplierCategory | 'all'
): string[] {
  const byKey = new Map<string, string>();
  const addName = (raw?: string | null) => {
    const trimmed = String(raw || '').trim();
    if (!trimmed || trimmed === '-') return;
    const key = trimmed.toLowerCase();
    if (!byKey.has(key)) {
      byKey.set(key, trimmed);
    }
  };

  if (field === 'customer') {
    db.customers.forEach((x) => addName(x.name));
    db.entries.forEach((e) => addName(e.customer));
    db.transports.forEach((x) => addName(x.customer));
    (db.hotels || []).forEach((h) => addName(h.customer));
    db.vouchers.filter((v) => v.type === 'receipt').forEach((v) => addName(v.party));
  } else {
    db.suppliers.forEach((x) => {
      const c = x.category || 'all';
      if (
        !catFilter ||
        catFilter === 'all' ||
        c === 'all' ||
        c === catFilter ||
        (c === 'both' && (catFilter === 'visa' || catFilter === 'transport'))
      ) {
        addName(x.name);
      }
    });
    if (!catFilter || catFilter === 'visa' || catFilter === 'both' || catFilter === 'all') {
      db.entries.forEach((e) => addName(e.supplier));
    }
    if (!catFilter || catFilter === 'transport' || catFilter === 'both' || catFilter === 'all') {
      db.transports.forEach((x) => addName(x.supplier));
    }
    if (!catFilter || catFilter === 'hotel' || catFilter === 'both' || catFilter === 'all') {
      (db.hotels || []).forEach((h) => addName(h.supplier));
    }
    if (!catFilter || catFilter === 'both' || catFilter === 'all') {
      db.vouchers.filter((v) => v.type === 'payment').forEach((v) => addName(v.party));
    }
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, lang));
}

export function nextCode(db: AccountingDB, kind: 'customer' | 'supplier'): string {
  const arr = kind === 'customer' ? db.customers : db.suppliers;
  const prefix = kind === 'customer' ? 'CUS' : 'SUP';
  const max = arr.reduce((m, x) => Math.max(m, Number(String(x.code || '').replace(/\D/g, '')) || 0), 0);
  return prefix + String(max + 1).padStart(4, '0');
}

export function nextTrnRef(db: AccountingDB): string {
  const max = db.transports.reduce((m, x) => Math.max(m, Number(String(x.refNo || '').replace(/\D/g, '')) || 0), 0);
  return 'TRN-' + String(Math.max(max, db.transports.length) + 1).padStart(4, '0');
}

export function nextHotelRef(db: AccountingDB): string {
  const max = db.hotels.reduce((m, x) => Math.max(m, Number(String(x.refNo || '').replace(/\D/g, '')) || 0), 0);
  return 'HTL-' + String(Math.max(max, db.hotels.length) + 1).padStart(4, '0');
}

export function nextVchNo(db: AccountingDB): string {
  const max = db.vouchers.reduce((m, v) => Math.max(m, Number(String(v.no || '').replace(/\D/g, '')) || 0), 0);
  return 'V-' + String(Math.max(max, db.vouchers.length) + 1).padStart(5, '0');
}

export function nextTrsRef(db: AccountingDB): string {
  const max = db.treasury.reduce((m, x) => Math.max(m, Number(String(x.refNo || '').replace(/\D/g, '')) || 0), 0);
  return 'TRS-' + String(Math.max(max, db.treasury.length) + 1).padStart(4, '0');
}

export function nextEmpCode(db: AccountingDB): string {
  const max = db.employees.reduce((m, x) => Math.max(m, Number(String(x.code || '').replace(/\D/g, '')) || 0), 0);
  return 'EMP-' + String(Math.max(max, db.employees.length) + 1).padStart(4, '0');
}

export function nextPayRef(db: AccountingDB): string {
  const max = db.payroll.reduce((m, x) => Math.max(m, Number(String(x.refNo || '').replace(/\D/g, '')) || 0), 0);
  return 'PAY-' + String(Math.max(max, db.payroll.length) + 1).padStart(4, '0');
}

export function nextInvRef(db: AccountingDB): string {
  const list = db.invoices || [];
  const max = list.reduce((m, x) => Math.max(m, Number(String(x.invoiceNo || '').replace(/\D/g, '')) || 0), 0);
  return 'INV-' + String(Math.max(max, list.length) + 1).padStart(4, '0');
}

export function csvDownload(name: string, rows: (string | number)[][]): void {
  const csv =
    '\uFEFF' +
    rows
      .map((r) => r.map((x) => '"' + String(x ?? '').replace(/"/g, '""') + '"').join(','))
      .join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function toWestDigits(s: unknown): string {
  const map: Record<string, string> = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  };
  return String(s ?? '').replace(/[٠-٩۰-۹]/g, (c) => map[c] || c);
}

export function splitSheetLine(line: string, sep: string): string[] {
  if (sep === '\t') return line.split('\t').map((x) => x.trim());
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === sep && !inQ) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

export function normalizeSheetDate(v: unknown): string {
  const s = toWestDigits(v).trim();
  if (!s) return today();
  const m1 = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, '0')}-${m1[3].padStart(2, '0')}`;
  const m2 = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m2) return `${m2[3]}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
  return today();
}

export function mapSheetField(h: string): string | null {
  const n = toWestDigits(h)
    .toLowerCase()
    .replace(/[*:#()[\]{}\-_/.\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!n) return null;
  const aliases: Record<string, string[]> = {
    groupNo: ['رقم المجموعة', 'المجموعة', 'كود المجموعة', 'group no', 'group', 'group number', 'groupno'],
    date: ['التاريخ', 'تاريخ التسجيل', 'تاريخ', 'date', 'registration date'],
    pax: ['عدد المعتمرين', 'المعتمرين', 'العدد', 'pax', 'pilgrims', 'count', 'qty'],
    customer: ['اسم العميل', 'العميل', 'الوكيل', 'customer', 'customer name', 'client'],
    supplier: ['مورد التأشيرات', 'مورد التاشيرات', 'اسم المورد', 'المورد', 'supplier', 'visa supplier', 'vendor'],
    currency: ['العملة', 'عملة الأسعار', 'عملة', 'currency', 'curr'],
    buy: ['سعر الشراء', 'سعر الشراء للتأشيرة', 'سعر الشراء بالريال', 'شراء', 'buy', 'buy price', 'cost', 'unit buy'],
    sell: ['سعر البيع', 'سعر البيع للتأشيرة', 'سعر البيع بالريال', 'بيع', 'sell', 'sell price', 'unit sell', 'price'],
    rate: ['سعر الصرف', 'سعر التحويل', 'الصرف', 'rate', 'fx rate', 'fx'],
    notes: ['ملاحظات', 'تفاصيل', 'notes', 'note', 'remarks'],
  };
  for (const k of Object.keys(aliases)) {
    if (aliases[k].some((a) => n === a || (a.length >= 4 && (n.includes(a) || a.includes(n))))) {
      return k;
    }
  }
  return null;
}
