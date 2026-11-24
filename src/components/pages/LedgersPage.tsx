import React, { useEffect, useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { AccountingDB, GroupInvoice, Lang, VoucherEntry } from '../../types/accounting';
import { bi, tKey } from '../../i18n/translations';
import {
  entryVals,
  fmt,
  fmtUSD,
  getPartyNames,
  htlVals,
  sumBy,
  tCity,
  tRoute,
  today,
  trnVals,
} from '../../utils/calculations';
import { EmptyRow, KpiCard, Panel, btnSecondaryCls, inputCls, labelCls } from '../AccountingUI';

type SectorFilter = 'all' | 'visa' | 'transport' | 'hotel' | 'voucher';

interface LedgerRow {
  sector: Exclude<SectorFilter, 'all'>;
  sectorLabel: string;
  voucherType?: 'receipt' | 'payment';
  date: string;
  ref: string;
  desc: string;
  pax?: number;
  unitPriceSAR?: number;
  origCurrency?: string;
  origUnitPrice?: number;
  debit: number;
  credit: number;
  debitUSD: number;
  creditUSD: number;
  balance: number;
  balanceUSD: number;
}

export const LedgerPage: React.FC<{
  kind: 'customer' | 'supplier';
  db: AccountingDB;
  lang: Lang;
  initialParty?: string | null;
  onConsumeParty?: () => void;
}> = ({ kind, db, lang, initialParty, onConsumeParty }) => {
  const defaultRate = Number(db.rate || 3.75) || 3.75;

  const parties = useMemo(
    () => getPartyNames(db, kind, lang, kind === 'supplier' ? 'all' : undefined),
    [db, kind, lang]
  );

  const [party, setParty] = useState(() => initialParty || parties[0] || '');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sector, setSector] = useState<SectorFilter>('all');
  const [printPaper, setPrintPaper] = useState<'a4-landscape' | 'a3-landscape' | 'a4-portrait'>('a4-landscape');

  useEffect(() => {
    if (initialParty) {
      setParty(initialParty);
      onConsumeParty?.();
    } else if (!party && parties.length > 0) {
      setParty(parties[0]);
    }
  }, [initialParty, parties, party, onConsumeParty]);

  const {
    openingBalance,
    openingBalanceUSD,
    rows,
    totals,
    clientInvoices,
  } = useMemo(() => {
    const emptyRes = {
      openingBalance: 0,
      openingBalanceUSD: 0,
      rows: [] as LedgerRow[],
      totals: {
        visa: 0,
        visaUSD: 0,
        trn: 0,
        trnUSD: 0,
        htl: 0,
        htlUSD: 0,
        vch: 0,
        vchUSD: 0,
        vchCount: 0,
        pax: 0,
        debit: 0,
        debitUSD: 0,
        credit: 0,
        creditUSD: 0,
        balance: 0,
        balanceUSD: 0,
      },
      clientInvoices: [] as GroupInvoice[],
    };

    if (!party) return emptyRes;

    const normParty = (val?: string | null) =>
      String(val || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    const normalizeIsoDate = (rawDate?: string | null): string => {
      const s = String(rawDate || '').trim();
      if (!s) return '';
      const m1 = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (m1) return `${m1[1]}-${m1[2].padStart(2, '0')}-${m1[3].padStart(2, '0')}`;
      const m2 = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
      if (m2) return `${m2[3]}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
      return s;
    };
    const targetParty = normParty(party);

    const masterCode =
      kind === 'customer'
        ? normParty(db.customers.find((c) => normParty(c.name) === targetParty)?.code)
        : normParty(db.suppliers.find((s) => normParty(s.name) === targetParty)?.code);

    const matchesParty = (val?: string | null) => {
      const n = normParty(val);
      if (!n) return false;
      return n === targetParty || (Boolean(masterCode) && n === masterCode);
    };

    const isAlsoSupplier =
      db.suppliers.some((s) => normParty(s.name) === targetParty) ||
      db.entries.some((e) => normParty(e.supplier) === targetParty) ||
      db.transports.some((x) => normParty(x.supplier) === targetParty) ||
      (db.hotels || []).some((h) => normParty(h.supplier) === targetParty);

    const raw: Omit<LedgerRow, 'balance' | 'balanceUSD'>[] = [];
    const matchedVouchers: (VoucherEntry & { usdAmount: number })[] = [];

    const toVoucherUSD = (v: VoucherEntry) => {
      if (v.currency === 'USD') return Number(v.amount || 0);
      const r = Number(v.rate || defaultRate) || defaultRate;
      return r > 0 ? Number(v.amountSAR || 0) / r : 0;
    };

    const customerGroupNos = new Set<string>();

    if (kind === 'customer') {
      // 1. Visa Entries
      db.entries
        .filter((e) => matchesParty(e.customer))
        .forEach((e) => {
          const grpKey = normParty(e.groupNo);
          if (grpKey) customerGroupNos.add(grpKey);
          const v = entryVals(e, defaultRate);
          const r = Number(e.rate || defaultRate) || defaultRate;
          const salesUSD =
            e.currency === 'USD'
              ? Number(e.sell || 0) * Number(e.pax || 0)
              : r > 0
                ? v.sales / r
                : 0;
          raw.push({
            sector: 'visa',
            sectorLabel: tKey(lang, 'fVisa'),
            date: e.date,
            ref: e.groupNo,
            desc: `${bi(lang, 'تأشيرات', 'Visas')}${e.notes ? ` · ${e.notes}` : ''}`,
            pax: Number(e.pax || 0),
            unitPriceSAR: v.sell,
            origCurrency: e.currency,
            origUnitPrice: Number(e.sell || 0),
            debit: v.sales,
            credit: 0,
            debitUSD: salesUSD,
            creditUSD: 0,
          });
        });

      // 2. Transport Entries
      const linkedTransportIds = new Set<number>();
      db.transports
        .filter((x) => matchesParty(x.customer))
        .forEach((x) => {
          linkedTransportIds.add(x.id);
          const grpKey = normParty(x.groupNo);
          if (grpKey) customerGroupNos.add(grpKey);
          const v = trnVals(x, defaultRate);
          const r = Number(x.rate || defaultRate) || defaultRate;
          const cnt = Math.max(1, Number(x.vehicleCount || 1));
          const salesUSD =
            x.currency === 'USD' ? Number(x.sell || 0) * cnt : r > 0 ? v.sales / r : 0;
          const trnPax = Number(x.pax || 0);
          raw.push({
            sector: 'transport',
            sectorLabel: tKey(lang, 'fTrn'),
            date: x.date,
            ref: x.groupNo ? `${x.refNo} (${x.groupNo})` : x.refNo,
            desc: `${tRoute(x.route, lang)} · ${x.vehicleCount} × ${x.vehicleType}${
              trnPax > 0 && sector !== 'transport' ? ` · ${trnPax} ${bi(lang, 'معتمر', 'pax')}` : ''
            }${x.notes ? ` · ${x.notes}` : ''}`,
            pax: sector === 'transport' && trnPax > 0 ? trnPax : undefined,
            unitPriceSAR: v.sell,
            origCurrency: x.currency,
            origUnitPrice: Number(x.sell || 0),
            debit: v.sales,
            credit: 0,
            debitUSD: salesUSD,
            creditUSD: 0,
          });
        });

      // 2b. Cycle Operations with direct sell price not yet linked to db.transports
      (db.cycleOperations || [])
        .filter((op) => {
          if (op.status === 'cancelled') return false;
          if (!(Number(op.sell || 0) > 0)) return false;
          if (op.linkedTransportId && linkedTransportIds.has(op.linkedTransportId)) return false;
          if (matchesParty(op.customer)) return true;
          if (!op.customer && op.groupNo && customerGroupNos.has(normParty(op.groupNo))) return true;
          return false;
        })
        .forEach((op) => {
          const cnt = Math.max(1, Number(op.vehicleCount || 1));
          const salesSAR = Number(op.sell || 0) * cnt;
          const salesUSD = defaultRate > 0 ? salesSAR / defaultRate : 0;
          const opPax = Number(op.totalPax || 0);
          raw.push({
            sector: 'transport',
            sectorLabel: tKey(lang, 'fTrn'),
            date: op.date || today(),
            ref: op.groupNo ? `${op.stageLabel} (${op.groupNo})` : op.stageLabel,
            desc: `${op.routeDetails || op.direction || op.stageLabel} · ${cnt} × ${op.vehicleType || '-'}${
              opPax > 0 && sector !== 'transport' ? ` · ${opPax} ${bi(lang, 'معتمر', 'pax')}` : ''
            }`,
            pax: sector === 'transport' && opPax > 0 ? opPax : undefined,
            unitPriceSAR: Number(op.sell || 0),
            origCurrency: 'SAR',
            origUnitPrice: Number(op.sell || 0),
            debit: salesSAR,
            credit: 0,
            debitUSD: salesUSD,
            creditUSD: 0,
          });
        });

      // 3. Active Hotel Bookings
      (db.hotels || [])
        .filter((h) => h.status !== 'cancelled' && matchesParty(h.customer))
        .forEach((h) => {
          const hv = htlVals(h, defaultRate);
          const r = Number(h.rate || defaultRate) || defaultRate;
          const salesUSD =
            h.currency === 'USD' ? Number(h.sell || 0) * hv.roomNights : r > 0 ? hv.sales / r : 0;
          raw.push({
            sector: 'hotel',
            sectorLabel: bi(lang, 'الفنادق', 'Hotel'),
            date: h.bookingDate || h.checkIn,
            ref: h.groupNo ? `${h.refNo} (${h.groupNo})` : h.refNo,
            desc: `${h.hotelName} (${tCity(h.city, lang)}) · ${hv.rooms} ${bi(lang, 'غرف', 'rm')} × ${hv.nights} ${bi(lang, 'ليالي', 'nt')} (${h.checkIn} → ${h.checkOut})`,
            unitPriceSAR: hv.sell,
            origCurrency: h.currency,
            origUnitPrice: Number(h.sell || 0),
            debit: hv.sales,
            credit: 0,
            debitUSD: salesUSD,
            creditUSD: 0,
          });
        });

      // 4. Receipt Vouchers from Client (and customer-only refund payments if any)
      db.vouchers
        .filter((v) => matchesParty(v.party))
        .forEach((v) => {
          if (v.type === 'receipt') {
            const usdVal = toVoucherUSD(v);
            matchedVouchers.push({ ...v, usdAmount: usdVal });
            raw.push({
              sector: 'voucher',
              sectorLabel: bi(lang, 'سند قبض', 'Receipt'),
              voucherType: 'receipt',
              date: v.date,
              ref: v.no,
              desc: v.note
                ? `${bi(lang, 'سند قبض من العميل', 'Client Receipt')} · ${v.note}`
                : bi(lang, 'سند قبض من العميل', 'Receipt Voucher from Client'),
              unitPriceSAR: Number(v.amountSAR || 0),
              origCurrency: v.currency,
              origUnitPrice: Number(v.amount || 0),
              debit: 0,
              credit: Number(v.amountSAR || 0),
              debitUSD: 0,
              creditUSD: usdVal,
            });
          } else if (v.type === 'payment' && !isAlsoSupplier) {
            const usdVal = toVoucherUSD(v);
            raw.push({
              sector: 'voucher',
              sectorLabel: bi(lang, 'سند صرف', 'Payment'),
              voucherType: 'payment',
              date: v.date,
              ref: v.no,
              desc: v.note
                ? `${bi(lang, 'سند صرف للعميل', 'Client Payment')} · ${v.note}`
                : bi(lang, 'سند صرف / رد للعميل', 'Payment / Refund to Client'),
              unitPriceSAR: Number(v.amountSAR || 0),
              origCurrency: v.currency,
              origUnitPrice: Number(v.amount || 0),
              debit: Number(v.amountSAR || 0),
              credit: 0,
              debitUSD: usdVal,
              creditUSD: 0,
            });
          }
        });
    } else {
      // Supplier Ledger
      db.entries
        .filter((e) => matchesParty(e.supplier))
        .forEach((e) => {
          const v = entryVals(e, defaultRate);
          const r = Number(e.rate || defaultRate) || defaultRate;
          const costUSD =
            e.currency === 'USD'
              ? Number(e.buy || 0) * Number(e.pax || 0)
              : r > 0
                ? v.cost / r
                : 0;
          raw.push({
            sector: 'visa',
            sectorLabel: tKey(lang, 'fVisa'),
            date: e.date,
            ref: e.groupNo,
            desc: `${bi(lang, 'مشتريات تأشيرات', 'Visa Cost')}${e.notes ? ` · ${e.notes}` : ''}`,
            pax: Number(e.pax || 0),
            unitPriceSAR: v.buy,
            origCurrency: e.currency,
            origUnitPrice: Number(e.buy || 0),
            debit: 0,
            credit: v.cost,
            debitUSD: 0,
            creditUSD: costUSD,
          });
        });

      db.transports
        .filter((x) => matchesParty(x.supplier))
        .forEach((x) => {
          const v = trnVals(x, defaultRate);
          const r = Number(x.rate || defaultRate) || defaultRate;
          const cnt = Math.max(1, Number(x.vehicleCount || 1));
          const costUSD =
            x.currency === 'USD' ? Number(x.buy || 0) * cnt : r > 0 ? v.cost / r : 0;
          const trnPax = Number(x.pax || 0);
          raw.push({
            sector: 'transport',
            sectorLabel: tKey(lang, 'fTrn'),
            date: x.date,
            ref: x.groupNo ? `${x.refNo} (${x.groupNo})` : x.refNo,
            desc: `${tRoute(x.route, lang)} · ${x.vehicleCount} × ${x.vehicleType}${
              trnPax > 0 && sector !== 'transport' ? ` · ${trnPax} ${bi(lang, 'معتمر', 'pax')}` : ''
            }`,
            pax: sector === 'transport' && trnPax > 0 ? trnPax : undefined,
            unitPriceSAR: v.buy,
            origCurrency: x.currency,
            origUnitPrice: Number(x.buy || 0),
            debit: 0,
            credit: v.cost,
            debitUSD: 0,
            creditUSD: costUSD,
          });
        });

      (db.hotels || [])
        .filter((h) => h.status !== 'cancelled' && matchesParty(h.supplier))
        .forEach((h) => {
          const hv = htlVals(h, defaultRate);
          const r = Number(h.rate || defaultRate) || defaultRate;
          const costUSD =
            h.currency === 'USD' ? Number(h.buy || 0) * hv.roomNights : r > 0 ? hv.cost / r : 0;
          raw.push({
            sector: 'hotel',
            sectorLabel: bi(lang, 'الفنادق', 'Hotel'),
            date: h.bookingDate || h.checkIn,
            ref: h.groupNo ? `${h.refNo} (${h.groupNo})` : h.refNo,
            desc: `${h.hotelName} (${tCity(h.city, lang)}) · ${hv.rooms} ${bi(lang, 'غرف', 'rm')} × ${hv.nights} ${bi(lang, 'ليالي', 'nt')}`,
            unitPriceSAR: hv.buy,
            origCurrency: h.currency,
            origUnitPrice: Number(h.buy || 0),
            debit: 0,
            credit: hv.cost,
            debitUSD: 0,
            creditUSD: costUSD,
          });
        });

      db.vouchers
        .filter((v) => v.type === 'payment' && matchesParty(v.party))
        .forEach((v) => {
          const usdVal = toVoucherUSD(v);
          matchedVouchers.push({ ...v, usdAmount: usdVal });
          raw.push({
            sector: 'voucher',
            sectorLabel: bi(lang, 'سند صرف', 'Payment'),
            voucherType: 'payment',
            date: v.date,
            ref: v.no,
            desc: v.note || bi(lang, 'سند صرف للمورد', 'Supplier Payment Voucher'),
            unitPriceSAR: Number(v.amountSAR || 0),
            origCurrency: v.currency,
            origUnitPrice: Number(v.amount || 0),
            debit: Number(v.amountSAR || 0),
            credit: 0,
            debitUSD: usdVal,
            creditUSD: 0,
          });
        });
    }

    const sectorFiltered = raw
      .filter((r) => sector === 'all' || r.sector === sector)
      .map((r) => ({ ...r, date: normalizeIsoDate(r.date) || r.date }));

    const sectorOrder: Record<Exclude<SectorFilter, 'all'>, number> = {
      visa: 1,
      transport: 2,
      hotel: 3,
      voucher: 4,
    };
    sectorFiltered.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const sa = sectorOrder[a.sector] ?? 9;
      const sb = sectorOrder[b.sector] ?? 9;
      if (sa !== sb) return sa - sb;
      return a.ref.localeCompare(b.ref);
    });

    const fromIso = fromDate ? normalizeIsoDate(fromDate) : '';
    const toIso = toDate ? normalizeIsoDate(toDate) : '';

    const opening = fromIso
      ? sumBy(
          sectorFiltered.filter((r) => r.date < fromIso),
          (r) => (kind === 'customer' ? r.debit - r.credit : r.credit - r.debit)
        )
      : 0;
    const openingUSD = fromIso
      ? sumBy(
          sectorFiltered.filter((r) => r.date < fromIso),
          (r) => (kind === 'customer' ? r.debitUSD - r.creditUSD : r.creditUSD - r.debitUSD)
        )
      : 0;

    const inRange = sectorFiltered.filter((r) => {
      if (fromIso && r.date < fromIso) return false;
      if (toIso && r.date > toIso) return false;
      return true;
    });

    let running = opening;
    let runningUSD = openingUSD;
    const ledRows: LedgerRow[] = inRange.map((r) => {
      running += kind === 'customer' ? r.debit - r.credit : r.credit - r.debit;
      runningUSD += kind === 'customer' ? r.debitUSD - r.creditUSD : r.creditUSD - r.debitUSD;
      return { ...r, balance: running, balanceUSD: runningUSD };
    });

    const visaRows = inRange.filter((r) => r.sector === 'visa');
    const trnRows = inRange.filter((r) => r.sector === 'transport');
    const htlRows = inRange.filter((r) => r.sector === 'hotel');
    const vchRows = inRange.filter((r) => r.sector === 'voucher');

    const visaSum = sumBy(visaRows, (r) => (kind === 'customer' ? r.debit : r.credit));
    const visaSumUSD = sumBy(visaRows, (r) => (kind === 'customer' ? r.debitUSD : r.creditUSD));
    const trnSum = sumBy(trnRows, (r) => (kind === 'customer' ? r.debit : r.credit));
    const trnSumUSD = sumBy(trnRows, (r) => (kind === 'customer' ? r.debitUSD : r.creditUSD));
    const htlSum = sumBy(htlRows, (r) => (kind === 'customer' ? r.debit : r.credit));
    const htlSumUSD = sumBy(htlRows, (r) => (kind === 'customer' ? r.debitUSD : r.creditUSD));

    const filteredPartyVouchers = matchedVouchers.filter((v) => {
      const vd = normalizeIsoDate(v.date);
      if (fromIso && vd < fromIso) return false;
      if (toIso && vd > toIso) return false;
      return true;
    });

    const vchSum = sumBy(filteredPartyVouchers, (v) => Number(v.amountSAR || 0));
    const vchSumUSD = sumBy(filteredPartyVouchers, (v) => v.usdAmount);

    const totalPax = sumBy(
      sector === 'transport' ? inRange : visaRows,
      (r) => Number(r.pax || 0)
    );

    const matchedInvoices =
      kind === 'customer'
        ? (db.invoices || [])
            .filter((inv) => {
              const idate = normalizeIsoDate(inv.date);
              if (fromIso && idate < fromIso) return false;
              if (toIso && idate > toIso) return false;
              const grp = normParty(inv.groupNo);
              if (grp && customerGroupNos.has(grp)) return true;
              const gName = normParty(inv.groupName);
              if (gName && (gName === targetParty || gName.includes(targetParty))) return true;
              return false;
            })
            .sort(
              (a, b) =>
                normalizeIsoDate(a.date).localeCompare(normalizeIsoDate(b.date)) ||
                a.invoiceNo.localeCompare(b.invoiceNo)
            )
        : [];

    return {
      openingBalance: opening,
      openingBalanceUSD: openingUSD,
      rows: ledRows,
      totals: {
        visa: visaSum,
        visaUSD: visaSumUSD,
        trn: trnSum,
        trnUSD: trnSumUSD,
        htl: htlSum,
        htlUSD: htlSumUSD,
        vch: vchSum || sumBy(vchRows, (r) => (kind === 'customer' ? r.credit : r.debit)),
        vchUSD: vchSumUSD || sumBy(vchRows, (r) => (kind === 'customer' ? r.creditUSD : r.debitUSD)),
        vchCount: filteredPartyVouchers.length,
        pax: totalPax,
        debit: sumBy(inRange, (r) => r.debit),
        debitUSD: sumBy(inRange, (r) => r.debitUSD),
        credit: sumBy(inRange, (r) => r.credit),
        creditUSD: sumBy(inRange, (r) => r.creditUSD),
        balance: running,
        balanceUSD: runningUSD,
      },
      clientInvoices: matchedInvoices,
    };
  }, [party, kind, db, lang, sector, fromDate, toDate, defaultRate]);

  const printDocTitle = useMemo(() => {
    const safePart = (s: string) =>
      s
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 60);
    const todayStr = today();
    return party ? `${safePart(party)}_${todayStr}` : `Statement_${todayStr}`;
  }, [party]);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = printDocTitle;
    return () => {
      document.title = prevTitle;
    };
  }, [printDocTitle]);

  const handlePrint = () => {
    document.title = printDocTitle;
    window.print();
  };

  const pageCssSize =
    printPaper === 'a3-landscape'
      ? 'A3 landscape'
      : printPaper === 'a4-portrait'
        ? 'A4 portrait'
        : 'A4 landscape';

  return (
    <div className="space-y-5 print:space-y-2">
      <style>{`@media print { @page { size: ${pageCssSize}; margin: 4mm; } }`}</style>
      <Panel
        title={kind === 'customer' ? tKey(lang, 'navCustLedger') : tKey(lang, 'navSuppLedger')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={printPaper}
              onChange={(e) =>
                setPrintPaper(e.target.value as 'a4-landscape' | 'a3-landscape' | 'a4-portrait')
              }
              title={bi(lang, 'حجم ورقة الطباعة', 'Print Paper Size')}
              className="h-9 px-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#1d4ed8]"
            >
              <option value="a4-landscape">{bi(lang, 'ورقة الطباعة: A4 أفقي (واسع)', 'Paper: A4 Landscape')}</option>
              <option value="a3-landscape">{bi(lang, 'ورقة الطباعة: A3 أفقي (كبير جداً)', 'Paper: A3 Landscape (Large)')}</option>
              <option value="a4-portrait">{bi(lang, 'ورقة الطباعة: A4 عمودي', 'Paper: A4 Portrait')}</option>
            </select>
            <button type="button" onClick={handlePrint} className={btnSecondaryCls}>
              <Printer className="w-3.5 h-3.5" />
              <span>{tKey(lang, 'btnPrint')}</span>
            </button>
          </div>
        }
      >
        <div className="no-print grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
          <div>
            <label className={labelCls}>
              {kind === 'customer' ? tKey(lang, 'thCustomer') : tKey(lang, 'thSupplier')}
            </label>
            <select value={party} onChange={(e) => setParty(e.target.value)} className={inputCls}>
              {parties.length === 0 ? (
                <option value="">{bi(lang, 'لا توجد أطراف', 'No parties')}</option>
              ) : (
                parties.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))
              )}
            </select>
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'من تاريخ', 'From Date')}</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'إلى تاريخ', 'To Date')}</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'القطاع', 'Sector')}</label>
            <div className="inline-flex rounded-xl bg-slate-100 p-0.5 w-full overflow-x-auto">
              {(['all', 'visa', 'transport', 'hotel', 'voucher'] as SectorFilter[]).map((s) => {
                const label =
                  s === 'all'
                    ? tKey(lang, 'fAll')
                    : s === 'visa'
                      ? tKey(lang, 'fVisa')
                      : s === 'transport'
                        ? tKey(lang, 'fTrn')
                        : s === 'hotel'
                          ? bi(lang, 'الفنادق', 'Hotels')
                          : kind === 'customer'
                            ? bi(lang, 'سندات القبض', 'Receipts')
                            : tKey(lang, 'fVch');
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSector(s)}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                      sector === s ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Print Header with Party Name & Today's Date */}
        {party && (
          <div className="hidden print:flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-300 text-xs">
            <div className="font-bold text-slate-900 text-sm">
              {kind === 'customer' ? bi(lang, 'الشركة / العميل:', 'Company / Client:') : bi(lang, 'المورد:', 'Supplier:')}{' '}
              <span className="text-[#1d4ed8]">{party}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 font-mono-num text-slate-700">
              <span>
                {bi(lang, 'تاريخ اليوم:', 'Date:')} <strong>{today()}</strong>
              </span>
              {(fromDate || toDate) && (
                <span>
                  ({fromDate || '...'} → {toDate || '...'})
                </span>
              )}
            </div>
          </div>
        )}

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 print:grid-cols-6 gap-3 print:gap-1.5 mb-4 print:mb-2 [&>div]:print:p-2 [&>div]:print:rounded-lg">
          <KpiCard
            label={bi(lang, 'إجمالي المعتمرين', 'Total Pilgrims')}
            value={totals.pax.toLocaleString('en-US')}
            tone="blue"
          />
          <KpiCard
            label={kind === 'customer' ? tKey(lang, 'thVisaSales') : tKey(lang, 'thVisaCosts')}
            value={fmt(totals.visa)}
            sub={bi(lang, 'ر.س', 'SAR')}
            tone="blue"
          />
          <KpiCard
            label={kind === 'customer' ? tKey(lang, 'thTrnSales') : tKey(lang, 'thTrnCosts')}
            value={fmt(totals.trn)}
            sub={
              totals.htl > 0
                ? `${bi(lang, 'فنادق:', 'Htl:')} ${fmt(totals.htl)} ${bi(lang, 'ر.س', 'SAR')}`
                : bi(lang, 'ر.س', 'SAR')
            }
            tone="slate"
          />
          <KpiCard
            label={
              kind === 'customer'
                ? bi(lang, `سندات القبض (${totals.vchCount})`, `Receipts (${totals.vchCount})`)
                : bi(lang, `سندات الصرف (${totals.vchCount})`, `Payments (${totals.vchCount})`)
            }
            value={fmt(totals.vch)}
            sub={bi(lang, 'ر.س', 'SAR')}
            tone="teal"
          />
          <KpiCard
            label={bi(lang, 'رصيد أول المدة', 'Opening Balance')}
            value={fmt(openingBalance)}
            sub={bi(lang, 'ر.س', 'SAR')}
            tone="slate"
          />
          <KpiCard
            label={kind === 'customer' ? tKey(lang, 'thBalDue') : tKey(lang, 'thRemBal')}
            value={fmt(totals.balance)}
            sub={bi(lang, 'ر.س', 'SAR')}
            tone={totals.balance > 0 ? 'red' : 'teal'}
          />
        </div>

        {/* Comprehensive Client / Party Summary Bar (SAR Only) */}
        {party && (
          <div className="mb-5 print:mb-2 p-3 print:p-2 rounded-xl print:rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="font-bold text-[#0f1e36]">
              {kind === 'customer'
                ? bi(lang, `ملخص حساب العميل (${party}):`, `Client Account Summary (${party}):`)
                : bi(lang, `ملخص حساب المورد (${party}):`, `Supplier Account Summary (${party}):`)}
            </div>
            <div className="flex flex-wrap items-center gap-4 font-mono-num">
              <span className="text-slate-700">
                {bi(lang, 'إجمالي المستحق:', 'Total Billed:')}{' '}
                <strong className="text-slate-900">
                  {fmt(totals.visa + totals.trn + totals.htl)} {bi(lang, 'ر.س', 'SAR')}
                </strong>
              </span>
              <span className="text-[#0f766e]">
                {kind === 'customer'
                  ? bi(lang, 'سندات القبض المحصّلة:', 'Client Receipts:')
                  : bi(lang, 'سندات الصرف المسددة:', 'Supplier Payments:')}{' '}
                <strong>
                  {fmt(totals.vch)} {bi(lang, 'ر.س', 'SAR')}
                </strong>
              </span>
              <span className={totals.balance > 0 ? 'text-red-700' : 'text-[#0f766e]'}>
                {bi(lang, 'الصافي المتبقي:', 'Net Balance:')}{' '}
                <strong>
                  {fmt(totals.balance)} {bi(lang, 'ر.س', 'SAR')}
                </strong>
              </span>
            </div>
          </div>
        )}

        {/* Statement Table */}
        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full text-xs border-collapse ledger-print-table">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <th className="py-2.5 px-2.5 text-start font-bold whitespace-nowrap">{tKey(lang, 'thDate')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold whitespace-nowrap">{tKey(lang, 'thType')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold whitespace-nowrap">{tKey(lang, 'thRefGroup')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold whitespace-nowrap">
                  {bi(lang, 'السعر / القيمة الأصلية', 'Price / Orig.')}
                </th>
                <th className="py-2.5 px-2.5 text-start font-bold whitespace-nowrap">
                  {bi(lang, 'عدد المعتمرين', 'Pilgrims')}
                </th>
                <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thDesc')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold whitespace-nowrap">
                  {kind === 'customer' ? tKey(lang, 'thDebitSales') : tKey(lang, 'thDebitPay')}
                </th>
                <th className="py-2.5 px-2.5 text-start font-bold whitespace-nowrap">
                  {kind === 'customer' ? tKey(lang, 'thCreditRec') : tKey(lang, 'thCreditCost')}
                </th>
                <th className="py-2.5 px-2.5 text-start font-bold whitespace-nowrap">{tKey(lang, 'thBal')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fromDate && (
                <tr className="bg-slate-50/80 font-semibold">
                  <td className="py-2 px-2.5 font-mono-num">{fromDate}</td>
                  <td className="py-2 px-2.5">-</td>
                  <td className="py-2 px-2.5">-</td>
                  <td className="py-2 px-2.5 font-mono-num">-</td>
                  <td className="py-2 px-2.5 font-mono-num">-</td>
                  <td className="py-2 px-2.5">{bi(lang, 'رصيد مرحّل (أول المدة)', 'Opening Balance')}</td>
                  <td className="py-2 px-2.5 font-mono-num">-</td>
                  <td className="py-2 px-2.5 font-mono-num">-</td>
                  <td className="py-2 px-2.5 font-mono-num font-bold">{fmt(openingBalance)}</td>
                </tr>
              )}
              {rows.length === 0 ? (
                <EmptyRow colSpan={9} lang={lang} />
              ) : (
                rows.map((r, i) => (
                  <tr
                    key={`${r.sector}-${r.ref}-${i}`}
                    className={
                      r.sector === 'voucher'
                        ? r.voucherType === 'receipt'
                          ? 'bg-teal-50/40 hover:bg-teal-50/70'
                          : 'bg-red-50/30 hover:bg-red-50/50'
                        : 'hover:bg-slate-50'
                    }
                  >
                    <td className="py-2 px-2.5 font-mono-num whitespace-nowrap">{r.date}</td>
                    <td className="py-2 px-2.5 font-semibold whitespace-nowrap">
                      {r.sector === 'voucher' ? (
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            r.voucherType === 'receipt'
                              ? 'bg-teal-100 text-teal-800'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {r.sectorLabel}
                        </span>
                      ) : (
                        r.sectorLabel
                      )}
                    </td>
                    <td className="py-2 px-2.5 font-mono-num font-semibold whitespace-nowrap">{r.ref}</td>
                    <td className="py-2 px-2.5 font-mono-num whitespace-nowrap">
                      {r.origCurrency === 'USD' && r.origUnitPrice !== undefined ? (
                        <div>
                          <span className="font-bold text-[#1d4ed8]">${fmt(r.origUnitPrice)} USD</span>
                          {r.unitPriceSAR !== undefined && (
                            <span className="block text-[10px] text-slate-400">
                              ({fmt(r.unitPriceSAR)} {bi(lang, 'ر.س', 'SAR')})
                            </span>
                          )}
                        </div>
                      ) : r.unitPriceSAR !== undefined ? (
                        <span className="font-bold text-[#0f766e]">
                          {fmt(r.unitPriceSAR)} {bi(lang, 'ر.س', 'SAR')}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-2 px-2.5 font-mono-num font-semibold text-[#1d4ed8]">
                      {r.pax && r.pax > 0 ? r.pax.toLocaleString('en-US') : '-'}
                    </td>
                    <td className="py-2 px-2.5">{r.desc}</td>
                    <td className="py-2 px-2.5 font-mono-num">
                      {r.debit > 0 ? fmt(r.debit) : '-'}
                    </td>
                    <td className="py-2 px-2.5 font-mono-num text-[#0f766e] font-semibold">
                      {r.credit > 0 ? fmt(r.credit) : '-'}
                    </td>
                    <td className="py-2 px-2.5 font-mono-num font-bold text-slate-900">
                      {fmt(r.balance)}
                    </td>
                  </tr>
                ))
              )}
              {rows.length > 0 && (
                <tr className="bg-slate-50 font-bold text-slate-900 border-t-2 border-slate-200">
                  <td colSpan={3} className="py-2.5 px-2.5">
                    {bi(lang, 'الإجمالي', 'Totals')}
                  </td>
                  <td className="py-2.5 px-2.5 font-mono-num">-</td>
                  <td className="py-2.5 px-2.5 font-mono-num text-[#1d4ed8]">
                    {totals.pax > 0 ? totals.pax.toLocaleString('en-US') : '-'}
                  </td>
                  <td className="py-2.5 px-2.5">-</td>
                  <td className="py-2.5 px-2.5 font-mono-num">
                    {fmt(totals.debit)} {bi(lang, 'ر.س', 'SAR')}
                  </td>
                  <td className="py-2.5 px-2.5 font-mono-num text-[#0f766e]">
                    {fmt(totals.credit)} {bi(lang, 'ر.س', 'SAR')}
                  </td>
                  <td className="py-2.5 px-2.5 font-mono-num text-[#1d4ed8]">
                    {fmt(totals.balance)} {bi(lang, 'ر.س', 'SAR')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Linked Client Group Invoices Reference Section */}
      {kind === 'customer' && party && clientInvoices.length > 0 && (
        <Panel
          title={bi(
            lang,
            `فواتير المجموعات للعميل بالريال (${clientInvoices.length})`,
            `Client Group Invoices in SAR (${clientInvoices.length})`
          )}
        >
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full text-xs border-collapse ledger-print-table">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <th className="py-2 px-2.5 text-start font-bold">{bi(lang, 'رقم الفاتورة', 'Invoice #')}</th>
                  <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thDate')}</th>
                  <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thGroup')}</th>
                  <th className="py-2 px-2.5 text-start font-bold">{bi(lang, 'اسم المجموعة', 'Group Name')}</th>
                  <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thCount')}</th>
                  <th className="py-2 px-2.5 text-start font-bold">{bi(lang, 'الإجمالي (ر.س)', 'Total (SAR)')}</th>
                  <th className="py-2 px-2.5 text-start font-bold">{bi(lang, 'تاريخ الاستحقاق', 'Due Date')}</th>
                  <th className="py-2 px-2.5 text-start font-bold">{bi(lang, 'الحالة', 'Status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clientInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="py-2 px-2.5 font-mono-num font-bold text-[#1d4ed8]">{inv.invoiceNo}</td>
                    <td className="py-2 px-2.5 font-mono-num">{inv.date}</td>
                    <td className="py-2 px-2.5 font-mono-num font-semibold">{inv.groupNo}</td>
                    <td className="py-2 px-2.5 font-semibold">{inv.groupName}</td>
                    <td className="py-2 px-2.5 font-mono-num">{inv.pax}</td>
                    <td className="py-2 px-2.5 font-mono-num font-bold text-slate-900">
                      {fmt(Number(inv.totalUSD || 0) * defaultRate)} {bi(lang, 'ر.س', 'SAR')}
                    </td>
                    <td className="py-2 px-2.5 font-mono-num text-slate-500">{inv.dueDate || '-'}</td>
                    <td className="py-2 px-2.5">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          inv.paymentStatus === 'paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {inv.paymentStatus === 'paid' ? bi(lang, 'مسددة', 'Paid') : bi(lang, 'غير مسددة', 'Unpaid')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-900">
                  <td colSpan={4} className="py-2.5 px-2.5">
                    {bi(lang, `إجمالي فواتير العميل (${clientInvoices.length})`, `Total Invoices (${clientInvoices.length})`)}
                  </td>
                  <td className="py-2.5 px-2.5 font-mono-num">
                    {sumBy(clientInvoices, (inv) => Number(inv.pax || 0)).toLocaleString('en-US')}
                  </td>
                  <td className="py-2.5 px-2.5 font-mono-num text-[#1d4ed8]">
                    {fmt(sumBy(clientInvoices, (inv) => Number(inv.totalUSD || 0) * defaultRate))}{' '}
                    {bi(lang, 'ر.س', 'SAR')}
                  </td>
                  <td colSpan={2} className="py-2.5 px-2.5" />
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
};
