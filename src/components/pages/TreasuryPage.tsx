import React, { useEffect, useMemo, useState } from 'react';
import { Download, Edit3, Plus, Trash2, Users } from 'lucide-react';
import {
  AccountingDB,
  Lang,
  PageId,
  TREASURY_ACCOUNTS,
  TREASURY_CATEGORIES,
  TreasuryAccount,
  TreasuryCategory,
  TreasuryCurrency,
  TreasuryEntry,
  TreasuryType,
} from '../../types/accounting';
import { bi, tKey } from '../../i18n/translations';
import {
  buildTreasuryLedgerRows,
  calcTreasurySummary,
  csvDownload,
  fmt,
  nextTrsRef,
  toSAR,
  today,
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

interface TreasuryPageProps {
  db: AccountingDB;
  lang: Lang;
  onNavigate: (page: PageId) => void;
  onSaveTx: (item: TreasuryEntry, isEdit: boolean) => Promise<void>;
  onDeleteTx: (id: number) => Promise<void>;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
  onConfirm: (cfg: ConfirmConfig) => void;
}

export const TreasuryPage: React.FC<TreasuryPageProps> = ({
  db,
  lang,
  onNavigate,
  onSaveTx,
  onDeleteTx,
  onToast,
  onConfirm,
}) => {
  const [editId, setEditId] = useState<number | null>(null);
  const [refNo, setRefNo] = useState(() => nextTrsRef(db));
  const [date, setDate] = useState(today());
  const [category, setCategory] = useState<TreasuryCategory>('expense');
  const [type, setType] = useState<TreasuryType>('out');
  const [account, setAccount] = useState<TreasuryAccount>('cashbox');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<TreasuryCurrency>('SAR');
  const [rate, setRate] = useState(String(db.rate || 3.75));
  const [manualSAR, setManualSAR] = useState('');
  const [manualSAREdited, setManualSAREdited] = useState(false);
  const [manualEGP, setManualEGP] = useState('');
  const [manualUSD, setManualUSD] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [mode, setMode] = useState<'unified' | 'direct'>('unified');
  const [accountFilter, setAccountFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!editId) setRefNo(nextTrsRef(db));
  }, [db.treasury.length, editId, db]);

  const handleCategoryChange = (nextCat: TreasuryCategory) => {
    setCategory(nextCat);
    if (nextCat === 'capital' || nextCat === 'receipt_extra') {
      setType('in');
    } else if (nextCat === 'expense' || nextCat === 'salary' || nextCat === 'advance') {
      setType('out');
    }
  };

  const resetForm = () => {
    setEditId(null);
    setRefNo(nextTrsRef(db));
    setDate(today());
    setCategory('expense');
    setType('out');
    setAccount('cashbox');
    setAmount('');
    setCurrency('SAR');
    setRate(String(db.rate || 3.75));
    setManualSAR('');
    setManualSAREdited(false);
    setManualEGP('');
    setManualUSD('');
    setEmployeeId('');
    setDescription('');
    setNotes('');
  };

  const fxRate = Number(rate || (currency === 'EGP' ? 13 : db.rate || 3.75)) || (currency === 'EGP' ? 13 : 3.75);
  const autoAmountSAR = toSAR(amount, currency, fxRate, db.rate);
  const effectiveAmountSAR = manualSAREdited && manualSAR.trim() !== '' ? Number(manualSAR || 0) : autoAmountSAR;

  const handleAmountChange = (val: string) => {
    setAmount(val);
    setManualSAREdited(false);
    const num = Number(val || 0);
    if (num > 0) {
      setManualSAR(toSAR(num, currency, fxRate, db.rate).toFixed(2));
    } else {
      setManualSAR('');
    }
  };

  const handleCurrencyChange = (nextCur: TreasuryCurrency) => {
    setCurrency(nextCur);
    setManualSAREdited(false);
    const nextRateStr = nextCur === 'EGP' ? '13' : nextCur === 'USD' ? String(db.rate || 3.75) : rate || String(db.rate || 3.75);
    setRate(nextRateStr);
    const nextRateNum = Number(nextRateStr) || 1;
    const num = Number(amount || 0);
    if (num > 0) {
      setManualSAR(toSAR(num, nextCur, nextRateNum, db.rate).toFixed(2));
    }
  };

  const handleRateChange = (val: string) => {
    setRate(val);
    setManualSAREdited(false);
    const nextRateNum = Number(val || 0);
    const num = Number(amount || 0);
    if (num > 0 && nextRateNum > 0) {
      setManualSAR(toSAR(num, currency, nextRateNum, db.rate).toFixed(2));
    }
  };

  const handleManualSARChange = (val: string) => {
    setManualSAR(val);
    setManualSAREdited(true);
    const sarNum = Number(val || 0);
    const origNum = Number(amount || 0);
    if (sarNum > 0 && origNum > 0) {
      if (currency === 'USD') {
        setRate((sarNum / origNum).toFixed(4));
      } else if (currency === 'EGP') {
        setRate((origNum / sarNum).toFixed(4));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!refNo.trim() || !description.trim() || !(amt > 0)) {
      onToast(
        bi(lang, 'يرجى إدخال المرجع والبيان والمبلغ', 'Please enter Ref #, Description, and Amount'),
        'error'
      );
      return;
    }
    if (!(fxRate > 0) || !(effectiveAmountSAR > 0)) {
      onToast(
        bi(lang, 'يرجى إدخال سعر صرف ومعادل ريال صحيحين أكبر من صفر', 'Please enter valid exchange rate and SAR equivalent'),
        'error'
      );
      return;
    }

    const empNum = employeeId ? Number(employeeId) : undefined;
    const empObj = empNum ? db.employees.find((x) => x.id === empNum) : undefined;

    const egpOpt = manualEGP.trim() !== '' ? Math.max(0, Number(manualEGP || 0)) : currency === 'EGP' ? amt : undefined;
    const usdOpt = manualUSD.trim() !== '' ? Math.max(0, Number(manualUSD || 0)) : currency === 'USD' ? amt : undefined;

    const payload: TreasuryEntry = {
      id: editId || Date.now(),
      refNo: refNo.trim(),
      date,
      type,
      category,
      account,
      amount: amt,
      currency,
      rate: fxRate,
      amountSAR: Math.max(0.01, Number(effectiveAmountSAR.toFixed(2))),
      ...(egpOpt !== undefined ? { amountEGP: Number(egpOpt.toFixed(2)) } : {}),
      ...(usdOpt !== undefined ? { amountUSD: Number(usdOpt.toFixed(2)) } : {}),
      description: description.trim(),
      ...(empNum ? { employeeId: empNum } : {}),
      employeeName: empObj?.name || '',
      notes: notes.trim(),
    };

    setSaving(true);
    try {
      await onSaveTx(payload, Boolean(editId));
      onToast(
        editId
          ? bi(lang, 'تم تحديث حركة الخزنة', 'Treasury entry updated')
          : bi(lang, 'تم حفظ حركة الخزنة', 'Treasury entry saved')
      );
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: TreasuryEntry) => {
    setEditId(item.id);
    setRefNo(item.refNo);
    setDate(item.date);
    setCategory(item.category);
    setType(item.type);
    setAccount(item.account);
    setAmount(String(item.amount));
    setCurrency((item.currency || 'SAR') as TreasuryCurrency);
    setRate(String(item.rate || (item.currency === 'EGP' ? 13 : db.rate || 3.75)));
    setManualSAR(String(Number(item.amountSAR || 0)));
    setManualSAREdited(true);
    setManualEGP(item.amountEGP !== undefined ? String(item.amountEGP) : '');
    setManualUSD(item.amountUSD !== undefined ? String(item.amountUSD) : '');
    setEmployeeId(item.employeeId ? String(item.employeeId) : '');
    setDescription(item.description);
    setNotes(item.notes || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (id: number, refLabel: string) => {
    onConfirm({
      title: bi(lang, 'حذف حركة خزنة', 'Delete Treasury Entry'),
      message: bi(lang, `هل تريد حذف حركة الخزنة "${refLabel}"؟`, `Delete treasury entry "${refLabel}"?`),
      danger: true,
      onConfirm: async () => {
        await onDeleteTx(id);
        if (editId === id) resetForm();
        onToast(bi(lang, 'تم حذف حركة الخزنة', 'Treasury entry deleted'));
      },
    });
  };

  const summary = useMemo(() => calcTreasurySummary(db), [db]);
  const allLedgerRows = useMemo(() => buildTreasuryLedgerRows(db, mode, lang), [db, mode, lang]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allLedgerRows
      .filter((r) => {
        if (accountFilter !== 'all' && r.account !== accountFilter) return false;
        if (catFilter !== 'all' && r.category !== catFilter) return false;
        if (
          q &&
          !`${r.refNo} ${r.catLabel} ${r.accLabel} ${r.description} ${r.partyOrEmp} ${r.notes}`
            .toLowerCase()
            .includes(q)
        ) {
          return false;
        }
        return true;
      })
      .slice()
      .reverse();
  }, [allLedgerRows, accountFilter, catFilter, search]);

  const exportCsv = () => {
    csvDownload('treasury_ledger.csv', [
      [
        tKey(lang, 'thRef'),
        tKey(lang, 'thDate'),
        tKey(lang, 'thCat'),
        tKey(lang, 'lblTrsAcc'),
        tKey(lang, 'thTrsEmp'),
        tKey(lang, 'thDesc'),
        tKey(lang, 'lblCurrency'),
        bi(lang, 'المبلغ الأصلي', 'Original Amount'),
        bi(lang, 'سعر الصرف', 'Exchange Rate'),
        bi(lang, 'جنيه مصري (EGP)', 'EGP'),
        bi(lang, 'دولار (USD)', 'USD'),
        tKey(lang, 'thIn'),
        tKey(lang, 'thOut'),
        tKey(lang, 'thBal'),
      ],
      ...allLedgerRows.map((r) => [
        r.refNo,
        r.date,
        r.catLabel,
        r.accLabel,
        r.partyOrEmp,
        r.description,
        r.currency || 'SAR',
        r.amount !== undefined ? r.amount.toFixed(2) : '',
        r.rate !== undefined ? String(r.rate) : '',
        r.amountEGP !== undefined ? r.amountEGP.toFixed(2) : '',
        r.amountUSD !== undefined ? r.amountUSD.toFixed(2) : '',
        r.inSAR.toFixed(2),
        r.outSAR.toFixed(2),
        r.balance.toFixed(2),
      ]),
    ]);
  };

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <KpiCard label={tKey(lang, 'trsKpiCash')} value={fmt(summary.cashboxBalance)} tone="blue" />
        <KpiCard label={tKey(lang, 'trsKpiBank')} value={fmt(summary.bankNet)} tone="slate" />
        <KpiCard label={tKey(lang, 'trsKpiCustody')} value={fmt(summary.custodyNet)} tone="amber" />
        <KpiCard
          label={tKey(lang, 'trsKpiPayrollVault')}
          value={`${fmt(summary.payrollVaultEGP)} ج.م`}
          sub={bi(
            lang,
            `المعادل المحاسبي: ${fmt(summary.payrollVaultNet)} ر.س`,
            `Accounting eq.: ${fmt(summary.payrollVaultNet)} SAR`
          )}
          tone="teal"
        />
        <KpiCard label={tKey(lang, 'trsKpiLiquidity')} value={fmt(summary.totalLiquidity)} tone="emerald" />
        <KpiCard label={tKey(lang, 'trsKpiExpenses')} value={fmt(summary.operatingExpenses)} tone="red" />
        <KpiCard label={tKey(lang, 'trsKpiPayroll')} value={fmt(summary.payrollOutflows)} tone="amber" />
      </div>

      {/* Form Panel */}
      <Panel
        className="no-print"
        title={editId ? tKey(lang, 'trsFormEdit') : tKey(lang, 'trsFormNew')}
        actions={
          <>
            <button type="button" onClick={() => onNavigate('employees')} className={btnSecondaryCls}>
              <Users className="w-3.5 h-3.5" />
              <span>{tKey(lang, 'btnGoEmployees')}</span>
            </button>
            <button type="button" onClick={resetForm} className={btnSecondaryCls}>
              {tKey(lang, 'btnClear')}
            </button>
          </>
        }
      >
        <div className="mb-4 p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-slate-700">
          {tKey(lang, 'trsNotice')}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            <div>
              <label className={labelCls}>{tKey(lang, 'thRef')}</label>
              <input
                type="text"
                required
                value={refNo}
                onChange={(e) => setRefNo(e.target.value)}
                className={`${inputCls} font-mono-num`}
              />
            </div>
            <div>
              <label className={labelCls}>{tKey(lang, 'thDate')}</label>
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{tKey(lang, 'lblTrsCat')}</label>
              <select
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value as TreasuryCategory)}
                className={inputCls}
              >
                {(Object.keys(TREASURY_CATEGORIES) as TreasuryCategory[]).map((k) => (
                  <option key={k} value={k}>
                    {TREASURY_CATEGORIES[k][lang]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{tKey(lang, 'thType')}</label>
              <select value={type} onChange={(e) => setType(e.target.value as TreasuryType)} className={inputCls}>
                <option value="out">{tKey(lang, 'trsOut')}</option>
                <option value="in">{tKey(lang, 'trsIn')}</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{tKey(lang, 'lblTrsAcc')}</label>
              <select
                value={account}
                onChange={(e) => setAccount(e.target.value as TreasuryAccount)}
                className={inputCls}
              >
                {(Object.keys(TREASURY_ACCOUNTS) as TreasuryAccount[]).map((k) => (
                  <option key={k} value={k}>
                    {TREASURY_ACCOUNTS[k][lang]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{tKey(lang, 'lblAmount')}</label>
              <input
                type="number"
                step="any"
                min={0.01}
                required
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                className={`${inputCls} font-mono-num`}
              />
            </div>
            <div>
              <label className={labelCls}>{tKey(lang, 'lblCurrency')}</label>
              <select
                value={currency}
                onChange={(e) => handleCurrencyChange(e.target.value as TreasuryCurrency)}
                className={inputCls}
              >
                <option value="SAR">SAR (ر.س)</option>
                <option value="USD">USD ($)</option>
                <option value="EGP">EGP (ج.م)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>
                {currency === 'EGP'
                  ? bi(lang, 'سعر الصرف منول (جنيه/ريال)', 'Manual FX (EGP / SAR)')
                  : currency === 'USD'
                    ? bi(lang, 'سعر الصرف منول (دولار/ريال)', 'Manual FX (USD / SAR)')
                    : bi(lang, 'سعر الصرف منول', 'Manual FX Rate')}
              </label>
              <input
                type="number"
                step="any"
                min={0.0001}
                required
                value={rate}
                onChange={(e) => handleRateChange(e.target.value)}
                className={`${inputCls} font-mono-num`}
              />
            </div>
            <div>
              <label className={labelCls}>{tKey(lang, 'lblTrsEmp')}</label>
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputCls}>
                <option value="">{bi(lang, '— بدون ربط —', '— None —')}</option>
                {db.employees.map((emp) => (
                  <option key={emp.id} value={String(emp.id)}>
                    {emp.name} ({emp.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{tKey(lang, 'lblTrsDesc')}</label>
              <input
                type="text"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Optional Multi-Currency Manual Pricing & Direct SAR Override for ALL Accounts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <div>
              <label className={labelCls}>{bi(lang, 'المعادل بالريال (ر.س) — منول', 'SAR Equivalent (Manual)')}</label>
              <input
                type="number"
                step="any"
                min={0.01}
                value={manualSAR}
                onChange={(e) => handleManualSARChange(e.target.value)}
                placeholder={autoAmountSAR > 0 ? autoAmountSAR.toFixed(2) : '0.00'}
                className={`${inputCls} font-mono-num bg-white font-bold`}
              />
            </div>
            <div>
              <label className={labelCls}>{bi(lang, 'المبلغ بالجنيه (EGP) منول (اختياري)', 'EGP Amount (Optional Manual)')}</label>
              <input
                type="number"
                step="any"
                min={0}
                value={manualEGP}
                onChange={(e) => setManualEGP(e.target.value)}
                placeholder="0.00"
                className={`${inputCls} font-mono-num bg-white`}
              />
            </div>
            <div>
              <label className={labelCls}>{bi(lang, 'المبلغ بالدولار (USD) منول (اختياري)', 'USD Amount (Optional Manual)')}</label>
              <input
                type="number"
                step="any"
                min={0}
                value={manualUSD}
                onChange={(e) => setManualUSD(e.target.value)}
                placeholder="0.00"
                className={`${inputCls} font-mono-num bg-white`}
              />
            </div>
            <div>
              <label className={labelCls}>{tKey(lang, 'lblNotes')}</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} bg-white`} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono-num text-slate-700">
              <span>
                {bi(lang, 'المعادل بالريال:', 'SAR Equivalent:')}{' '}
                <strong className={type === 'in' ? 'text-[#0f766e]' : 'text-red-700'}>
                  {fmt(effectiveAmountSAR)} ر.س
                </strong>
              </span>
              <span className="text-slate-500">
                {bi(lang, 'سعر الصرف المسجل:', 'FX Rate:')} <strong>{fxRate}</strong> ({currency})
              </span>
            </div>
            <button type="submit" disabled={saving} className={btnPrimaryCls}>
              <Plus className="w-3.5 h-3.5" />
              <span>{editId ? tKey(lang, 'btnUpdateTrs') : tKey(lang, 'btnSaveTrs')}</span>
            </button>
          </div>
        </form>
      </Panel>

      {/* Treasury Ledger Table */}
      <Panel
        title={tKey(lang, 'trsLogTitle')}
        actions={
          <>
            <div className="inline-flex rounded-xl bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setMode('unified')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  mode === 'unified' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                {tKey(lang, 'trsModeUnified')}
              </button>
              <button
                type="button"
                onClick={() => setMode('direct')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  mode === 'direct' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                {tKey(lang, 'trsModeDirect')}
              </button>
            </div>

            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="h-9 px-3 rounded-xl border border-slate-200 text-xs bg-white"
            >
              <option value="all">{bi(lang, 'كل الحسابات', 'All Accounts')}</option>
              {(Object.keys(TREASURY_ACCOUNTS) as TreasuryAccount[]).map((k) => (
                <option key={k} value={k}>
                  {TREASURY_ACCOUNTS[k][lang]}
                </option>
              ))}
            </select>

            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="h-9 px-3 rounded-xl border border-slate-200 text-xs bg-white"
            >
              <option value="all">{bi(lang, 'كل التصنيفات', 'All Categories')}</option>
              {(Object.keys(TREASURY_CATEGORIES) as TreasuryCategory[]).map((k) => (
                <option key={k} value={k}>
                  {TREASURY_CATEGORIES[k][lang]}
                </option>
              ))}
              {mode === 'unified' && <option value="voucher">{tKey(lang, 'fVch')}</option>}
            </select>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tKey(lang, 'searchPlaceholder')}
              className="h-9 px-3 rounded-xl border border-slate-200 text-xs w-36 focus:outline-none focus:border-[#1d4ed8]"
            />

            <button type="button" onClick={exportCsv} className={btnSecondaryCls}>
              <Download className="w-3.5 h-3.5" />
              <span>{tKey(lang, 'btnCsv')}</span>
            </button>
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thRef')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thDate')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thCat')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'lblTrsAcc')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thTrsEmp')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thDesc')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thIn')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thOut')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thBal')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold no-print">{tKey(lang, 'thAction')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <EmptyRow colSpan={10} lang={lang} />
              ) : (
                filteredRows.map((r) => {
                  const directObj =
                    r.source === 'treasury' && r.id !== null
                      ? db.treasury.find((x) => x.id === r.id)
                      : undefined;
                  return (
                    <tr key={`${r.source}-${r.refNo}-${r.id ?? 'v'}`} className="hover:bg-slate-50">
                      <td className="py-2 px-2.5 font-mono-num font-bold">{r.refNo}</td>
                      <td className="py-2 px-2.5 font-mono-num">{r.date}</td>
                      <td className="py-2 px-2.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            r.type === 'in' ? 'bg-teal-100 text-teal-800' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {r.catLabel}
                        </span>
                      </td>
                      <td className="py-2 px-2.5">{r.accLabel}</td>
                      <td className="py-2 px-2.5">{r.partyOrEmp || '-'}</td>
                      <td className="py-2 px-2.5">
                        <div>{r.description}</div>
                        {(r.currency && r.currency !== 'SAR' && r.rate) || (r.amountEGP && r.amountEGP > 0) || (r.amountUSD && r.amountUSD > 0) ? (
                          <div className="text-[11px] text-slate-500 font-mono-num">
                            {r.amountEGP && r.amountEGP > 0 ? `${fmt(r.amountEGP)} ج.م` : ''}
                            {r.amountEGP && r.amountEGP > 0 && r.amountUSD && r.amountUSD > 0 ? ' · ' : ''}
                            {r.amountUSD && r.amountUSD > 0 ? `$${fmt(r.amountUSD)}` : ''}
                            {r.rate && r.rate > 0 ? ` (${bi(lang, 'صرف', 'FX')}: ${r.rate})` : ''}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-2 px-2.5 font-mono-num text-[#0f766e] font-semibold">
                        {r.inSAR > 0 ? fmt(r.inSAR) : '-'}
                      </td>
                      <td className="py-2 px-2.5 font-mono-num text-red-700 font-semibold">
                        {r.outSAR > 0 ? fmt(r.outSAR) : '-'}
                      </td>
                      <td className="py-2 px-2.5 font-mono-num font-bold text-slate-900">{fmt(r.balance)}</td>
                      <td className="py-2 px-2.5 no-print">
                        {directObj ? (
                          <div className="flex items-center gap-1.5">
                            <button type="button" onClick={() => handleEdit(directObj)} className={btnSoftBlueCls}>
                              <Edit3 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(directObj.id, directObj.refNo)}
                              className={btnSoftRedCls}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            {bi(lang, 'سند تلقائي', 'Voucher')}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
};
