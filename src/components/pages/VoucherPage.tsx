import React, { useEffect, useMemo, useState } from 'react';
import { Edit3, FileText, Plus, Printer, Save, Search, Trash2, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { AccountingDB, Currency, Lang, TransportEntry, VisaEntry, VoucherEntry } from '../../types/accounting';
import { bi, tKey } from '../../i18n/translations';
import {
  entryVals,
  fmt,
  fmtUSD,
  formatTime24,
  getPartyNames,
  nextVchNo,
  sumBy,
  toSAR,
  today,
  trnVals,
} from '../../utils/calculations';
import {
  ConfirmConfig,
  EmptyRow,
  KpiCard,
  Panel,
  btnPrimaryCls,
  btnSecondaryCls,
  btnSoftBlueCls,
  btnSoftRedCls,
  inputCls,
  labelCls,
} from '../AccountingUI';

interface VoucherPageProps {
  db: AccountingDB;
  lang: Lang;
  onSaveVoucher: (v: VoucherEntry, isEdit?: boolean, originalNo?: string) => Promise<void>;
  onDeleteVoucher: (no: string) => Promise<void>;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
  onConfirm: (cfg: ConfirmConfig) => void;
}

export const VoucherPage: React.FC<VoucherPageProps> = ({
  db,
  lang,
  onSaveVoucher,
  onDeleteVoucher,
  onToast,
  onConfirm,
}) => {
  const { user, profile, staffAccount, sharedInvite } = useAuth();
  const defaultRate = Number(db.rate || 3.75) || 3.75;

  const printedByLabel = useMemo(() => {
    if (staffAccount) {
      return `${staffAccount.displayName} (@${staffAccount.username})`;
    }
    const name = profile?.displayName || user?.displayName || sharedInvite?.displayName || '';
    return name || bi(lang, 'الإدارة', 'Management');
  }, [staffAccount, profile, user, sharedInvite, lang]);

  const [editNo, setEditNo] = useState<string | null>(null);
  const [no, setNo] = useState(() => nextVchNo(db));
  const [type, setType] = useState<'receipt' | 'payment'>('receipt');
  const [date, setDate] = useState(today());
  const [party, setParty] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [rate, setRate] = useState(String(defaultRate));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'receipt' | 'payment'>('all');
  const [partyFilter, setPartyFilter] = useState<string>('all');
  const [previewVoucher, setPreviewVoucher] = useState<VoucherEntry | null>(null);

  useEffect(() => {
    if (!editNo) {
      setNo(nextVchNo(db));
    }
  }, [db.vouchers.length, editNo, db]);

  useEffect(() => {
    document.body.classList.toggle('printing-invoice', Boolean(previewVoucher));
    return () => {
      document.body.classList.remove('printing-invoice');
    };
  }, [previewVoucher]);

  const partyList = useMemo(
    () =>
      type === 'receipt'
        ? getPartyNames(db, 'customer', lang)
        : getPartyNames(db, 'supplier', lang, 'all'),
    [db, type, lang]
  );

  const voucherPartyOptions = useMemo(() => {
    const set = new Set<string>();
    db.vouchers.forEach((v) => {
      const p = String(v.party || '').trim();
      if (p) set.add(p);
    });
    return [...set].sort((a, b) => a.localeCompare(b, lang));
  }, [db.vouchers, lang]);

  const fxRate = Number(rate || defaultRate) || defaultRate;
  const amountSAR = toSAR(amount, currency, fxRate, defaultRate);
  const amountUSD =
    currency === 'USD' ? Number(amount || 0) : fxRate > 0 ? Number(amountSAR || 0) / fxRate : 0;

  const getVoucherUSD = (v: VoucherEntry): number => {
    if (v.currency === 'USD') return Number(v.amount || 0);
    const r = Number(v.rate || defaultRate) || defaultRate;
    return r > 0 ? Number(v.amountSAR || 0) / r : 0;
  };

  const getEntrySalesUSD = (e: VisaEntry): number => {
    const pax = Number(e.pax || 0);
    if (e.currency === 'USD') return Number(e.sell || 0) * pax;
    const r = Number(e.rate || defaultRate) || defaultRate;
    return r > 0 ? entryVals(e, defaultRate).sales / r : 0;
  };

  const getTransportSalesUSD = (x: TransportEntry): number => {
    const cnt = Math.max(1, Number(x.vehicleCount || 1));
    if (x.currency === 'USD') return Number(x.sell || 0) * cnt;
    const r = Number(x.rate || defaultRate) || defaultRate;
    return r > 0 ? trnVals(x, defaultRate).sales / r : 0;
  };

  const getEntryCostUSD = (e: VisaEntry): number => {
    const pax = Number(e.pax || 0);
    if (e.currency === 'USD') return Number(e.buy || 0) * pax;
    const r = Number(e.rate || defaultRate) || defaultRate;
    return r > 0 ? entryVals(e, defaultRate).cost / r : 0;
  };

  const getTransportCostUSD = (x: TransportEntry): number => {
    const cnt = Math.max(1, Number(x.vehicleCount || 1));
    if (x.currency === 'USD') return Number(x.buy || 0) * cnt;
    const r = Number(x.rate || defaultRate) || defaultRate;
    return r > 0 ? trnVals(x, defaultRate).cost / r : 0;
  };

  const computePartySummaryUSD = (partyName: string) => {
    const norm = partyName.trim().toLowerCase();
    if (!norm) return null;
    const match = (val?: string) => String(val || '').trim().toLowerCase() === norm;

    const receipts = db.vouchers.filter((v) => v.type === 'receipt' && match(v.party));
    const payments = db.vouchers.filter((v) => v.type === 'payment' && match(v.party));
    const receiptsUSD = sumBy(receipts, getVoucherUSD);
    const paymentsUSD = sumBy(payments, getVoucherUSD);
    const receiptsSAR = sumBy(receipts, (v) => Number(v.amountSAR || 0));
    const paymentsSAR = sumBy(payments, (v) => Number(v.amountSAR || 0));

    const custVisaUSD = sumBy(db.entries.filter((e) => match(e.customer)), getEntrySalesUSD);
    const custTrnUSD = sumBy(db.transports.filter((x) => match(x.customer)), getTransportSalesUSD);
    const customerSalesUSD = custVisaUSD + custTrnUSD;
    const customerBalanceUSD = customerSalesUSD - receiptsUSD;

    const suppVisaUSD = sumBy(db.entries.filter((e) => match(e.supplier)), getEntryCostUSD);
    const suppTrnUSD = sumBy(db.transports.filter((x) => match(x.supplier)), getTransportCostUSD);
    const supplierCostUSD = suppVisaUSD + suppTrnUSD;
    const supplierBalanceUSD = supplierCostUSD - paymentsUSD;

    return {
      partyName: partyName.trim(),
      receiptsUSD,
      paymentsUSD,
      receiptsSAR,
      paymentsSAR,
      customerSalesUSD,
      customerBalanceUSD,
      supplierCostUSD,
      supplierBalanceUSD,
      netVouchersUSD: receiptsUSD - paymentsUSD,
      vouchersCount: receipts.length + payments.length,
    };
  };

  const formPartySummary = useMemo(
    () => computePartySummaryUSD(party),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [party, db.vouchers, db.entries, db.transports, defaultRate]
  );

  const filteredVouchers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.vouchers
      .filter((v) => {
        if (typeFilter !== 'all' && v.type !== typeFilter) return false;
        if (partyFilter !== 'all' && String(v.party || '').trim() !== partyFilter) return false;
        if (!q) return true;
        const typeTxt = v.type === 'receipt' ? 'سند قبض قبض receipt' : 'سند صرف صرف payment';
        return `${v.no} ${v.party} ${v.date} ${v.amount} ${v.amountSAR} ${v.currency} ${v.note || ''} ${typeTxt}`
          .toLowerCase()
          .includes(q);
      })
      .slice()
      .reverse();
  }, [db.vouchers, search, typeFilter, partyFilter]);

  const totalReceiptsSAR = useMemo(
    () => sumBy(filteredVouchers.filter((v) => v.type === 'receipt'), (v) => Number(v.amountSAR || 0)),
    [filteredVouchers]
  );
  const totalPaymentsSAR = useMemo(
    () => sumBy(filteredVouchers.filter((v) => v.type === 'payment'), (v) => Number(v.amountSAR || 0)),
    [filteredVouchers]
  );

  const totalReceiptsUSD = useMemo(
    () => sumBy(filteredVouchers.filter((v) => v.type === 'receipt'), getVoucherUSD),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredVouchers, defaultRate]
  );
  const totalPaymentsUSD = useMemo(
    () => sumBy(filteredVouchers.filter((v) => v.type === 'payment'), getVoucherUSD),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredVouchers, defaultRate]
  );

  const activeLogParty = useMemo(() => {
    if (partyFilter !== 'all') return partyFilter;
    const uniqueParties = Array.from(
      new Set(filteredVouchers.map((v) => String(v.party || '').trim()).filter(Boolean))
    );
    if (uniqueParties.length === 1) return uniqueParties[0];
    return '';
  }, [partyFilter, filteredVouchers]);

  const activeLogPartySummary = useMemo(
    () => computePartySummaryUSD(activeLogParty),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeLogParty, db.vouchers, db.entries, db.transports, defaultRate]
  );

  const resetForm = () => {
    setEditNo(null);
    setNo(nextVchNo(db));
    setType('receipt');
    setDate(today());
    setParty('');
    setAmount('');
    setCurrency('USD');
    setRate(String(defaultRate));
    setNote('');
  };

  const handleEdit = (v: VoucherEntry) => {
    setEditNo(v.no);
    setNo(v.no);
    setType(v.type);
    setDate(v.date);
    setParty(v.party);
    setAmount(String(v.amount));
    setCurrency(v.currency || 'SAR');
    setRate(String(v.rate || defaultRate));
    setNote(v.note || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedNo = no.trim();
    const amt = Number(amount);
    if (!trimmedNo || !party.trim() || !(amt > 0)) {
      onToast(
        bi(lang, 'يرجى إدخال رقم السند واسم الطرف والمبلغ', 'Please enter Voucher #, Party Name, and Amount'),
        'error'
      );
      return;
    }

    const duplicate = db.vouchers.find(
      (v) => v.no.toLowerCase() === trimmedNo.toLowerCase() && v.no !== editNo
    );
    if (duplicate) {
      onToast(
        bi(lang, `رقم السند "${trimmedNo}" مسجل مسبقاً`, `Voucher # "${trimmedNo}" already exists`),
        'error'
      );
      return;
    }

    const payload: VoucherEntry = {
      no: trimmedNo,
      type,
      date,
      party: party.trim(),
      amount: amt,
      currency,
      rate: fxRate,
      amountSAR,
      note: note.trim(),
    };

    setSaving(true);
    try {
      await onSaveVoucher(payload, Boolean(editNo), editNo || undefined);
      onToast(
        editNo
          ? bi(lang, 'تم تحديث السند بنجاح', 'Voucher updated successfully')
          : bi(lang, 'تم حفظ السند بنجاح', 'Voucher saved successfully')
      );
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (v: VoucherEntry) => {
    onConfirm({
      title: bi(lang, 'حذف السند', 'Delete Voucher'),
      message: bi(lang, `هل تريد حذف السند "${v.no}" (${v.party})؟`, `Delete voucher "${v.no}" (${v.party})?`),
      danger: true,
      onConfirm: async () => {
        await onDeleteVoucher(v.no);
        if (editNo === v.no) resetForm();
        onToast(bi(lang, 'تم حذف السند', 'Voucher deleted'));
      },
    });
  };

  const handlePrintVoucher = (v: VoucherEntry) => {
    const prevTitle = document.title;
    const safeParty = String(v.party || '')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 40);
    const prefix = v.type === 'receipt' ? 'Receipt' : 'Payment';
    document.title = `${prefix}_${v.no}${safeParty ? `_${safeParty}` : ''}`;
    const restore = () => {
      document.title = prevTitle;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    window.print();
    window.setTimeout(restore, 1500);
  };

  const bgPrintSuppression = previewVoucher ? 'print:hidden' : '';

  return (
    <div className="space-y-5">
      {/* KPI Summary in USD */}
      <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3.5 ${bgPrintSuppression}`}>
        <KpiCard
          label={bi(lang, 'إجمالي سندات القبض (بالدولار)', 'Total Receipts (USD)')}
          value={fmtUSD(totalReceiptsUSD)}
          sub={`${fmt(totalReceiptsSAR)} SAR`}
          tone="teal"
        />
        <KpiCard
          label={bi(lang, 'إجمالي سندات الصرف (بالدولار)', 'Total Payments (USD)')}
          value={fmtUSD(totalPaymentsUSD)}
          sub={`${fmt(totalPaymentsSAR)} SAR`}
          tone="red"
        />
        <KpiCard
          label={
            activeLogPartySummary
              ? bi(
                  lang,
                  `إجمالي العميل بالدولار — ${activeLogPartySummary.partyName}`,
                  `Client Total (USD) — ${activeLogPartySummary.partyName}`
                )
              : bi(lang, 'صافي الإجمالي بالدولار (قبض - صرف)', 'Net Total (USD)')
          }
          value={
            activeLogPartySummary
              ? fmtUSD(
                  typeFilter === 'payment'
                    ? activeLogPartySummary.paymentsUSD
                    : activeLogPartySummary.customerSalesUSD > 0
                      ? activeLogPartySummary.customerBalanceUSD
                      : activeLogPartySummary.receiptsUSD - activeLogPartySummary.paymentsUSD
                )
              : fmtUSD(totalReceiptsUSD - totalPaymentsUSD)
          }
          sub={
            activeLogPartySummary
              ? activeLogPartySummary.customerSalesUSD > 0
                ? bi(
                    lang,
                    `المستحق: ${fmtUSD(activeLogPartySummary.customerSalesUSD)} | المحصّل: ${fmtUSD(activeLogPartySummary.receiptsUSD)}`,
                    `Due: ${fmtUSD(activeLogPartySummary.customerSalesUSD)} | Paid: ${fmtUSD(activeLogPartySummary.receiptsUSD)}`
                  )
                : bi(
                    lang,
                    `قبض: ${fmtUSD(activeLogPartySummary.receiptsUSD)} | صرف: ${fmtUSD(activeLogPartySummary.paymentsUSD)}`,
                    `Rec: ${fmtUSD(activeLogPartySummary.receiptsUSD)} | Pay: ${fmtUSD(activeLogPartySummary.paymentsUSD)}`
                  )
              : `${fmt(totalReceiptsSAR - totalPaymentsSAR)} SAR`
          }
          tone="blue"
        />
      </div>

      <Panel
        className="no-print"
        title={
          editNo
            ? bi(lang, `تعديل سند (${editNo})`, `Edit Voucher (${editNo})`)
            : tKey(lang, 'vchFormTitle')
        }
        actions={
          <button type="button" onClick={resetForm} className={btnSecondaryCls}>
            {editNo ? tKey(lang, 'btnCancel') : tKey(lang, 'btnClear')}
          </button>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div>
              <label className={labelCls}>{tKey(lang, 'thVchNo')}</label>
              <input
                type="text"
                required
                value={no}
                onChange={(e) => setNo(e.target.value)}
                className={`${inputCls} font-mono-num`}
              />
            </div>
            <div>
              <label className={labelCls}>{tKey(lang, 'lblVchType')}</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'receipt' | 'payment')}
                className={inputCls}
              >
                <option value="receipt">{tKey(lang, 'optRec')}</option>
                <option value="payment">{tKey(lang, 'optPay')}</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{tKey(lang, 'thDate')}</label>
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{tKey(lang, 'lblParty')}</label>
              <input
                type="text"
                required
                list="vch-party-dl"
                value={party}
                onChange={(e) => setParty(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{tKey(lang, 'lblAmount')}</label>
              <input
                type="number"
                step="0.01"
                min={0.01}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`${inputCls} font-mono-num`}
              />
            </div>
            <div>
              <label className={labelCls}>{tKey(lang, 'lblCurrency')}</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className={inputCls}>
                <option value="USD">USD ($)</option>
                <option value="SAR">SAR (ر.س)</option>
              </select>
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
            <div>
              <label className={labelCls}>{tKey(lang, 'lblVchNote')}</label>
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
            </div>
          </div>

          {formPartySummary && (
            <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="font-bold text-[#0f1e36]">
                {bi(lang, 'ملخص العميل / الطرف بالدولار:', 'Client / Party Summary (USD):')}{' '}
                <span className="text-[#1d4ed8]">{formPartySummary.partyName}</span>
              </div>
              <div className="flex flex-wrap items-center gap-4 font-mono-num">
                {type === 'receipt' ? (
                  <>
                    <span className="text-slate-700">
                      {bi(lang, 'إجمالي المستحق:', 'Total Due:')}{' '}
                      <strong className="text-slate-900">{fmtUSD(formPartySummary.customerSalesUSD)}</strong>
                    </span>
                    <span className="text-[#0f766e]">
                      {bi(lang, 'إجمالي القبض:', 'Receipts:')}{' '}
                      <strong>{fmtUSD(formPartySummary.receiptsUSD)}</strong>
                    </span>
                    <span className={formPartySummary.customerBalanceUSD > 0 ? 'text-red-700' : 'text-emerald-700'}>
                      {bi(lang, 'المتبقي بالدولار:', 'Balance (USD):')}{' '}
                      <strong>{fmtUSD(formPartySummary.customerBalanceUSD)}</strong>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-slate-700">
                      {bi(lang, 'إجمالي المشتريات:', 'Total Cost:')}{' '}
                      <strong className="text-slate-900">{fmtUSD(formPartySummary.supplierCostUSD)}</strong>
                    </span>
                    <span className="text-red-700">
                      {bi(lang, 'إجمالي الصرف:', 'Payments:')}{' '}
                      <strong>{fmtUSD(formPartySummary.paymentsUSD)}</strong>
                    </span>
                    <span className="text-[#1d4ed8]">
                      {bi(lang, 'المتبقي بالدولار:', 'Balance (USD):')}{' '}
                      <strong>{fmtUSD(formPartySummary.supplierBalanceUSD)}</strong>
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono-num text-slate-700">
              <span>
                {bi(lang, 'المعادل بالدولار:', 'Equivalent in USD:')}{' '}
                <strong className="text-[#0f766e]">{fmtUSD(amountUSD)} USD</strong>
              </span>
              <span>
                {bi(lang, 'المعادل بالريال السعودي:', 'Equivalent in SAR:')}{' '}
                <strong className="text-[#1d4ed8]">{fmt(amountSAR)} SAR</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              {editNo && (
                <button type="button" onClick={resetForm} className={btnSecondaryCls}>
                  {tKey(lang, 'btnCancel')}
                </button>
              )}
              <button type="submit" disabled={saving} className={btnPrimaryCls}>
                {editNo ? <Save className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{editNo ? bi(lang, 'تحديث السند', 'Update Voucher') : tKey(lang, 'btnSaveVch')}</span>
              </button>
            </div>
          </div>
        </form>

        <datalist id="vch-party-dl">
          {partyList.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </Panel>

      <Panel
        className={bgPrintSuppression}
        title={tKey(lang, 'vchLogTitle')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={bi(lang, 'تصفية حسب العميل', 'Filter by client')}
              value={partyFilter}
              onChange={(e) => setPartyFilter(e.target.value)}
              className={`h-9 px-3 rounded-xl border text-xs bg-white font-semibold max-w-[210px] focus:outline-none focus:border-[#1d4ed8] ${
                partyFilter !== 'all'
                  ? 'border-[#1d4ed8] text-[#1d4ed8] bg-blue-50/50'
                  : 'border-slate-200 text-slate-700'
              }`}
            >
              <option value="all">{bi(lang, 'كل العملاء / الأطراف', 'All Clients / Parties')}</option>
              {voucherPartyOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              aria-label={bi(lang, 'تصفية حسب النوع', 'Filter by type')}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | 'receipt' | 'payment')}
              className="h-9 px-3 rounded-xl border border-slate-200 text-xs bg-white font-semibold text-slate-700 focus:outline-none focus:border-[#1d4ed8]"
            >
              <option value="all">{bi(lang, 'الكل (قبض وصرف)', 'All Vouchers')}</option>
              <option value="receipt">{bi(lang, 'سندات القبض فقط', 'Receipts Only')}</option>
              <option value="payment">{bi(lang, 'سندات الصرف فقط', 'Payments Only')}</option>
            </select>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={bi(lang, 'بحث برقم السند أو الطرف أو البيان...', 'Search #, party, date, note...')}
                className="h-9 ps-8 pe-3 rounded-xl border border-slate-200 text-xs w-56 focus:outline-none focus:border-[#1d4ed8]"
              />
            </div>
            {(partyFilter !== 'all' || typeFilter !== 'all' || search.trim()) && (
              <button
                type="button"
                onClick={() => {
                  setPartyFilter('all');
                  setTypeFilter('all');
                  setSearch('');
                }}
                className={btnSecondaryCls}
              >
                <X className="w-3.5 h-3.5" />
                <span>{bi(lang, 'مسح', 'Clear')}</span>
              </button>
            )}
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thVchNo')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thType')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thDate')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'lblParty')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thOrigAmt')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'المعادل ($)', 'USD Eqv')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thAmtSar')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'lblVchNote')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold no-print">{tKey(lang, 'thAction')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredVouchers.length === 0 ? (
                <EmptyRow colSpan={9} lang={lang} />
              ) : (
                filteredVouchers.map((v) => {
                  const usdVal = getVoucherUSD(v);
                  return (
                    <tr key={v.no} className="hover:bg-slate-50">
                      <td className="py-2 px-2.5 font-mono-num font-bold">{v.no}</td>
                      <td className="py-2 px-2.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            v.type === 'receipt' ? 'bg-teal-100 text-teal-800' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {v.type === 'receipt' ? bi(lang, 'سند قبض', 'Receipt') : bi(lang, 'سند صرف', 'Payment')}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 font-mono-num">{v.date}</td>
                      <td className="py-2 px-2.5 font-semibold">{v.party}</td>
                      <td className="py-2 px-2.5 font-mono-num">
                        {fmt(v.amount)} {v.currency}
                      </td>
                      <td className="py-2 px-2.5 font-mono-num font-bold text-[#1d4ed8]">
                        {fmtUSD(usdVal)} USD
                      </td>
                      <td className="py-2 px-2.5 font-mono-num font-semibold text-slate-700">
                        {fmt(v.amountSAR)} SAR
                      </td>
                      <td className="py-2 px-2.5 text-slate-600">{v.note || '-'}</td>
                      <td className="py-2 px-2.5 no-print">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPreviewVoucher(v)}
                            title={
                              v.type === 'receipt'
                                ? bi(lang, 'طباعة سند قبض', 'Print Receipt Voucher')
                                : bi(lang, 'طباعة سند صرف', 'Print Payment Voucher')
                            }
                            className="inline-flex items-center justify-center gap-1 px-2.5 h-7 rounded-lg bg-teal-50 hover:bg-teal-100 text-[#0f766e] text-[11px] font-semibold transition cursor-pointer whitespace-nowrap"
                          >
                            <Printer className="w-3 h-3" />
                            <span>
                              {v.type === 'receipt'
                                ? bi(lang, 'طباعة سند قبض', 'Print Receipt')
                                : bi(lang, 'طباعة سند صرف', 'Print Payment')}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEdit(v)}
                            title={bi(lang, 'تعديل السند', 'Edit Voucher')}
                            className={btnSoftBlueCls}
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(v)}
                            title={bi(lang, 'حذف السند', 'Delete Voucher')}
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
            {filteredVouchers.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-900">
                  <td colSpan={4} className="py-2.5 px-2.5">
                    {activeLogParty
                      ? bi(
                          lang,
                          `إجمالي العميل (${activeLogParty}) — ${filteredVouchers.length} سند`,
                          `Client Total (${activeLogParty}) — ${filteredVouchers.length}`
                        )
                      : `${bi(lang, 'الإجمالي', 'Total')} (${filteredVouchers.length})`}
                  </td>
                  <td colSpan={5} className="py-2.5 px-2.5 font-mono-num">
                    <div className="flex flex-wrap items-center gap-4">
                      <span className="text-[#0f766e]">
                        {bi(lang, 'إجمالي القبض بالدولار:', 'Total Receipts (USD):')}{' '}
                        {fmtUSD(totalReceiptsUSD)} ({fmt(totalReceiptsSAR)} SAR)
                      </span>
                      <span className="text-red-700">
                        {bi(lang, 'إجمالي الصرف بالدولار:', 'Total Payments (USD):')}{' '}
                        {fmtUSD(totalPaymentsUSD)} ({fmt(totalPaymentsSAR)} SAR)
                      </span>
                      <span className="text-[#1d4ed8]">
                        {bi(lang, 'الصافي بالدولار:', 'Net (USD):')}{' '}
                        {fmtUSD(totalReceiptsUSD - totalPaymentsUSD)}
                      </span>
                    </div>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Panel>

      {/* Formal Printable Receipt / Payment Voucher Modal */}
      {previewVoucher && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto print:static print:inset-auto print:bg-white print:p-0 print:block">
          <style>{`@media print { @page { size: A4 portrait; margin: 10mm; } }`}</style>
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden my-auto print:shadow-none print:border-0 print:rounded-none print:max-w-none">
            {/* Modal Action Bar (Hidden when printing) */}
            <div className="no-print px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#0f766e]" />
                <span>
                  {previewVoucher.type === 'receipt'
                    ? bi(lang, `معاينة طباعة سند قبض: ${previewVoucher.no}`, `Receipt Voucher Preview: ${previewVoucher.no}`)
                    : bi(lang, `معاينة طباعة سند صرف: ${previewVoucher.no}`, `Payment Voucher Preview: ${previewVoucher.no}`)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintVoucher(previewVoucher)}
                  className={btnPrimaryCls}
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>
                    {previewVoucher.type === 'receipt'
                      ? bi(lang, 'طباعة سند القبض', 'Print Receipt')
                      : bi(lang, 'طباعة سند الصرف', 'Print Payment')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewVoucher(null)}
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Formal Printable Voucher Body */}
            <div className="p-6 sm:p-8 space-y-6 text-slate-900 bg-white border-4 border-double border-slate-200 m-2 sm:m-3 rounded-xl print:m-0">
              {/* Company Header */}
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b-2 border-[#0f1e36]">
                <div className="flex items-center gap-3.5">
                  <img src="/logo.png" alt="BEST UNITED" className="w-16 h-16 object-contain" />
                  <div>
                    <div className="text-lg font-bold text-[#0f1e36]">BEST UNITED TRAVEL &amp; TOURISM</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {bi(lang, 'شركة بست يونايتد للسفريات والسياحة · موسم 1448 هـ', 'Umrah & Travel Services · Season 1448H')}
                    </div>
                  </div>
                </div>
                <div className="text-end">
                  <div
                    className={`inline-block px-3 py-1 rounded-lg text-xs font-bold border ${
                      previewVoucher.type === 'receipt'
                        ? 'bg-teal-50 text-[#0f766e] border-teal-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                    }`}
                  >
                    {previewVoucher.type === 'receipt'
                      ? bi(lang, 'سند قبض · RECEIPT VOUCHER', 'RECEIPT VOUCHER')
                      : bi(lang, 'سند صرف · PAYMENT VOUCHER', 'PAYMENT VOUCHER')}
                  </div>
                  <div className="text-base font-bold font-mono-num text-slate-900 mt-1.5" dir="ltr">
                    #{previewVoucher.no}
                  </div>
                  <div className="text-xs text-slate-500 font-mono-num mt-0.5">
                    {bi(lang, 'التاريخ:', 'Date:')} {previewVoucher.date}
                  </div>
                </div>
              </div>

              {/* Amount Summary Box */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <div className="text-[11px] text-slate-500 font-semibold">
                    {bi(lang, 'المبلغ بالعملة الأصلية', 'Original Amount')}
                  </div>
                  <div className="text-lg font-bold font-mono-num text-slate-900 mt-0.5" dir="ltr">
                    {fmt(previewVoucher.amount)} {previewVoucher.currency}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 font-semibold">
                    {bi(lang, 'المعادل بالريال السعودي (SAR)', 'SAR Equivalent')}
                  </div>
                  <div className="text-lg font-bold font-mono-num text-[#0f766e] mt-0.5" dir="ltr">
                    {fmt(previewVoucher.amountSAR)} {bi(lang, 'ر.س', 'SAR')}
                  </div>
                </div>
              </div>

              {/* Voucher Details */}
              <div className="space-y-3 text-sm border border-slate-200 rounded-xl p-4 sm:p-5 bg-white">
                <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2.5 border-b border-dashed border-slate-200">
                  <span className="text-xs font-bold text-slate-500">
                    {previewVoucher.type === 'receipt'
                      ? bi(lang, 'استلمنا من السادة / العميل:', 'Received From:')
                      : bi(lang, 'صرفنا إلى السادة / المورد:', 'Paid To:')}
                  </span>
                  <span className="text-base font-bold text-[#0f1e36]">{previewVoucher.party}</span>
                </div>

                <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2.5 border-b border-dashed border-slate-200">
                  <span className="text-xs font-bold text-slate-500">
                    {bi(lang, 'مبلغ وقدره:', 'Amount:')}
                  </span>
                  <span className="font-mono-num font-bold text-slate-900" dir="ltr">
                    {previewVoucher.currency === 'SAR'
                      ? `${fmt(previewVoucher.amountSAR)} SAR`
                      : `${fmtUSD(getVoucherUSD(previewVoucher))} USD · ${fmt(previewVoucher.amountSAR)} SAR`}
                  </span>
                </div>

                <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2.5 border-b border-dashed border-slate-200">
                  <span className="text-xs font-bold text-slate-500">
                    {bi(lang, 'سعر الصرف:', 'Exchange Rate:')}
                  </span>
                  <span className="font-mono-num font-semibold text-slate-700" dir="ltr">
                    1 USD = {fmt(previewVoucher.rate || defaultRate)} SAR
                  </span>
                </div>

                <div className="pt-1">
                  <div className="text-xs font-bold text-slate-500 mb-1">
                    {bi(lang, 'وذلك عن / البيان:', 'Description / Note:')}
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-800 leading-relaxed min-h-[44px]">
                    {previewVoucher.note || bi(lang, 'دفعة حساب', 'Account Payment')}
                  </div>
                </div>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-3 gap-4 pt-6 text-center text-xs text-slate-600">
                <div className="space-y-8">
                  <div className="font-bold text-slate-800">{bi(lang, 'توقيع المستلم', 'Receiver Signature')}</div>
                  <div className="border-t border-slate-300 pt-1 text-[11px] text-slate-400">
                    {bi(lang, 'الاسم والتوقيع', 'Name & Signature')}
                  </div>
                </div>
                <div className="space-y-8">
                  <div className="font-bold text-slate-800">{bi(lang, 'المحاسب', 'Accountant')}</div>
                  <div className="border-t border-slate-300 pt-1 text-[11px] text-slate-400">
                    {bi(lang, 'التوقيع', 'Signature')}
                  </div>
                </div>
                <div className="space-y-8">
                  <div className="font-bold text-slate-800">{bi(lang, 'اعتماد الإدارة والختم', 'Management & Stamp')}</div>
                  <div className="border-t border-slate-300 pt-1 text-[11px] text-slate-400">
                    BEST UNITED TRAVEL
                  </div>
                </div>
              </div>

              {/* Print Attribution Footer (No Email) */}
              <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                <div className="font-semibold text-slate-700">
                  {bi(lang, 'طُبعت بواسطة:', 'Printed by:')}{' '}
                  <span className="text-[#1d4ed8]">{printedByLabel}</span>
                </div>
                <div className="font-mono-num" dir="ltr">
                  {today()} · {formatTime24(new Date(), false)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

