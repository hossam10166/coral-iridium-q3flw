import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Download,
  Edit3,
  Plus,
  Trash2,
  Vault,
} from 'lucide-react';
import {
  AccountingDB,
  EmployeeRecord,
  Lang,
  PAYROLL_TYPES,
  PayrollRecord,
  PayrollType,
  TREASURY_CATEGORIES,
  TreasuryCategory,
  TreasuryEntry,
  TreasuryType,
} from '../../types/accounting';
import { bi, tKey } from '../../i18n/translations';
import {
  calcEmpTotal,
  csvDownload,
  fmt,
  getEgpAmount,
  nextPayRef,
  nextTrsRef,
  sumBy,
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

interface EmployeesVaultPanelProps {
  db: AccountingDB;
  lang: Lang;
  onSaveTx: (item: TreasuryEntry, isEdit: boolean) => Promise<void>;
  onDeleteTx: (id: number) => Promise<void>;
  onSavePayroll: (rec: PayrollRecord, linkedTrs?: TreasuryEntry) => Promise<void>;
  onDeletePayroll: (rec: PayrollRecord) => Promise<void>;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
  onConfirm: (cfg: ConfirmConfig) => void;
}

const DEFAULT_EGP_PER_SAR = 13;

export const EmployeesVaultPanel: React.FC<EmployeesVaultPanelProps> = ({
  db,
  lang,
  onSaveTx,
  onDeleteTx,
  onSavePayroll,
  onDeletePayroll,
  onToast,
  onConfirm,
}) => {
  const [editTxId, setEditTxId] = useState<number | null>(null);
  const [refNo, setRefNo] = useState(() => nextTrsRef(db));
  const [date, setDate] = useState(today());
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [txType, setTxType] = useState<TreasuryType>('out');
  const [category, setCategory] = useState<TreasuryCategory>('salary');
  const [payrollKind, setPayrollKind] = useState<Exclude<PayrollType, 'deduction'>>('salary');
  const [employeeId, setEmployeeId] = useState(() => (db.employees[0] ? String(db.employees[0].id) : ''));
  const [amountEGP, setAmountEGP] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [alsoSavePayroll, setAlsoSavePayroll] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState<'all' | TreasuryType>('all');
  const [filterEmp, setFilterEmp] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!editTxId) {
      setRefNo(nextTrsRef(db));
    }
  }, [db.treasury.length, editTxId, db]);

  const selectedEmployee = useMemo(
    () => (employeeId ? db.employees.find((x) => String(x.id) === employeeId) : undefined),
    [db.employees, employeeId]
  );

  const vaultEntries = useMemo(
    () =>
      db.treasury
        .filter((t) => t.account === 'payroll_vault')
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id),
    [db.treasury]
  );

  const stats = useMemo(() => {
    const inEntries = vaultEntries.filter((t) => t.type === 'in');
    const outEntries = vaultEntries.filter((t) => t.type === 'out');
    const inEGP = sumBy(inEntries, (t) => getEgpAmount(t, DEFAULT_EGP_PER_SAR));
    const outEGP = sumBy(outEntries, (t) => getEgpAmount(t, DEFAULT_EGP_PER_SAR));
    return {
      inEGP,
      outEGP,
      netEGP: inEGP - outEGP,
      inCount: inEntries.length,
      outCount: outEntries.length,
    };
  }, [vaultEntries]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vaultEntries
      .filter((t) => {
        if (filterType !== 'all' && t.type !== filterType) return false;
        if (filterEmp !== 'all' && String(t.employeeId || '') !== filterEmp) return false;
        if (
          q &&
          !`${t.refNo} ${t.date} ${t.employeeName} ${t.description} ${t.notes}`.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .slice()
      .reverse();
  }, [vaultEntries, filterType, filterEmp, search]);

  const filteredTotals = useMemo(() => {
    const inRows = filteredRows.filter((t) => t.type === 'in');
    const outRows = filteredRows.filter((t) => t.type === 'out');
    const inEGP = sumBy(inRows, (t) => getEgpAmount(t, DEFAULT_EGP_PER_SAR));
    const outEGP = sumBy(outRows, (t) => getEgpAmount(t, DEFAULT_EGP_PER_SAR));
    return {
      inEGP,
      outEGP,
      netEGP: inEGP - outEGP,
    };
  }, [filteredRows]);

  const resetForm = () => {
    setEditTxId(null);
    setRefNo(nextTrsRef(db));
    setDate(today());
    setMonth(today().slice(0, 7));
    setTxType('out');
    setCategory('salary');
    setPayrollKind('salary');
    setAmountEGP('');
    setDescription('');
    setNotes('');
    setAlsoSavePayroll(true);
  };

  const handleModeSwitch = (nextType: TreasuryType) => {
    setTxType(nextType);
    if (nextType === 'in') {
      setCategory('capital');
      setAlsoSavePayroll(false);
    } else {
      setCategory(payrollKind === 'advance' ? 'advance' : 'salary');
      setAlsoSavePayroll(true);
    }
  };

  const handleEmployeeChange = (val: string) => {
    setEmployeeId(val);
    if (!editTxId && txType === 'out' && payrollKind === 'salary') {
      const emp = db.employees.find((x) => String(x.id) === val);
      if (emp) {
        const total = calcEmpTotal(emp);
        if (total > 0) setAmountEGP(String(total));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const egpVal = Math.max(0, Number(amountEGP || 0));

    if (egpVal <= 0) {
      onToast(
        bi(lang, 'يرجى إدخال مبلغ صحيح بالجنيه المصري (ج.م)', 'Please enter a valid amount in EGP'),
        'error'
      );
      return;
    }

    const empObj: EmployeeRecord | undefined = employeeId
      ? db.employees.find((x) => String(x.id) === employeeId)
      : undefined;

    if (txType === 'out' && alsoSavePayroll && !editTxId && !empObj) {
      onToast(
        bi(lang, 'اختر الموظف لصرف الراتب أو ألغِ الترحيل لسجل الرواتب', 'Select an employee or uncheck Payroll sync'),
        'error'
      );
      return;
    }

    const safeSAR = Math.max(0.01, Number(toSAR(egpVal, 'EGP', DEFAULT_EGP_PER_SAR, db.rate).toFixed(2)));

    const autoDesc =
      txType === 'in'
        ? bi(lang, 'تغذية خزنة الموظفين والرواتب (ج.م)', 'Employees & Salaries Vault Funding (EGP)')
        : `${PAYROLL_TYPES[payrollKind][lang]}${empObj ? ` - ${empObj.name}` : ''} (${month})`;

    const finalDesc = (description.trim() || autoDesc).slice(0, 240);
    const txId = editTxId || Date.now();

    const trsPayload: TreasuryEntry = {
      id: txId,
      refNo: refNo.trim() || nextTrsRef(db),
      date,
      type: txType,
      category:
        txType === 'in'
          ? category === 'receipt_extra'
            ? 'receipt_extra'
            : category === 'transfer'
              ? 'transfer'
              : 'capital'
          : payrollKind === 'advance'
            ? 'advance'
            : 'salary',
      account: 'payroll_vault',
      amount: Number(egpVal.toFixed(2)),
      currency: 'EGP',
      rate: DEFAULT_EGP_PER_SAR,
      amountSAR: safeSAR,
      amountEGP: Number(egpVal.toFixed(2)),
      amountUSD: 0,
      description: finalDesc,
      ...(empObj ? { employeeId: empObj.id } : {}),
      employeeName: empObj?.name || '',
      notes: notes.trim(),
    };

    setSaving(true);
    try {
      if (!editTxId && txType === 'out' && alsoSavePayroll && empObj) {
        const payRec: PayrollRecord = {
          id: txId + 1,
          refNo: nextPayRef(db),
          date,
          month,
          employeeId: empObj.id,
          employeeName: empObj.name,
          recordType: payrollKind,
          amount: Number(egpVal.toFixed(2)),
          currency: 'EGP',
          rate: DEFAULT_EGP_PER_SAR,
          amountSAR: safeSAR,
          amountEGP: Number(egpVal.toFixed(2)),
          amountUSD: 0,
          postToTreasury: true,
          treasuryAccount: 'payroll_vault',
          linkedTreasuryId: trsPayload.id,
          notes: notes.trim() || finalDesc,
        };
        await onSavePayroll(payRec, trsPayload);
        onToast(
          bi(
            lang,
            'تم تسجيل الحركة بالجنيه المصري في خزنة الموظفين وسجل الرواتب بنجاح',
            'Saved in EGP to Employees Vault and Payroll Log'
          )
        );
      } else {
        await onSaveTx(trsPayload, Boolean(editTxId));
        onToast(
          editTxId
            ? bi(lang, 'تم تحديث حركة خزنة الموظفين', 'Employees Vault entry updated')
            : bi(lang, 'تم حفظ الحركة بالجنيه المصري في خزنة الموظفين والرواتب', 'Saved in EGP to Employees Vault')
        );
      }
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleEditRow = (t: TreasuryEntry) => {
    const egp = getEgpAmount(t, DEFAULT_EGP_PER_SAR);
    setEditTxId(t.id);
    setRefNo(t.refNo);
    setDate(t.date);
    setTxType(t.type);
    setCategory(t.category);
    if (t.category === 'advance') setPayrollKind('advance');
    else setPayrollKind('salary');
    setEmployeeId(t.employeeId ? String(t.employeeId) : '');
    setAmountEGP(egp > 0 ? String(egp) : '');
    setDescription(t.description);
    setNotes(t.notes || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteRow = (t: TreasuryEntry) => {
    const linkedPayroll = db.payroll.find((p) => p.linkedTreasuryId === t.id);
    onConfirm({
      title: bi(lang, 'حذف حركة من خزنة الموظفين', 'Delete Vault Entry'),
      message: bi(
        lang,
        `هل تريد حذف الحركة "${t.refNo}" (${t.description})${linkedPayroll ? ' وسجل الراتب المرتبط بها' : ''}؟`,
        `Delete vault entry "${t.refNo}" (${t.description})${linkedPayroll ? ' and its linked payroll record' : ''}?`
      ),
      danger: true,
      onConfirm: async () => {
        if (linkedPayroll) {
          await onDeletePayroll(linkedPayroll);
        } else {
          await onDeleteTx(t.id);
        }
        if (editTxId === t.id) resetForm();
        onToast(bi(lang, 'تم الحذف من خزنة الموظفين والرواتب', 'Deleted from Employees Vault'));
      },
    });
  };

  const exportVaultCsv = () => {
    csvDownload('employees_salaries_vault_egp.csv', [
      [
        tKey(lang, 'thRef'),
        tKey(lang, 'thDate'),
        tKey(lang, 'thType'),
        tKey(lang, 'thTrsEmp'),
        tKey(lang, 'thDesc'),
        bi(lang, 'المبلغ بالجنيه المصري (EGP)', 'Amount (EGP)'),
        tKey(lang, 'lblCurrency'),
        tKey(lang, 'lblNotes'),
      ],
      ...filteredRows.map((t) => {
        const sign = t.type === 'in' ? 1 : -1;
        const egp = getEgpAmount(t, DEFAULT_EGP_PER_SAR);
        return [
          t.refNo,
          t.date,
          t.type === 'in' ? bi(lang, 'وارد / تغذية', 'Deposit') : bi(lang, 'منصرف راتب/سلفة', 'Payout'),
          t.employeeName || '-',
          t.description,
          (sign * egp).toFixed(2),
          'EGP',
          t.notes || '',
        ];
      }),
    ]);
  };

  return (
    <div className="space-y-5">
      {/* Unified EGP Vault KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <KpiCard
          label={bi(lang, 'رصيد خزنة الموظفين (ج.م)', 'Vault Balance (EGP)')}
          value={`${fmt(stats.netEGP)} ج.م`}
          sub={bi(lang, 'عملة موحدة: الجنيه المصري (EGP)', 'Unified Currency: EGP')}
          tone="teal"
        />
        <KpiCard
          label={bi(lang, 'إجمالي التغذية / الوارد (ج.م)', 'Total Deposits (EGP)')}
          value={`${fmt(stats.inEGP)} ج.م`}
          sub={bi(lang, `${stats.inCount} حركة تغذية`, `${stats.inCount} deposits`)}
          tone="blue"
        />
        <KpiCard
          label={bi(lang, 'إجمالي المنصرف للرواتب والسلف (ج.م)', 'Total Payouts (EGP)')}
          value={`${fmt(stats.outEGP)} ج.م`}
          sub={bi(lang, `${stats.outCount} حركة صرف`, `${stats.outCount} payouts`)}
          tone="amber"
        />
        <KpiCard
          label={bi(lang, 'إجمالي حركات الخزنة', 'Total Vault Entries')}
          value={String(vaultEntries.length)}
          sub={bi(
            lang,
            `وارد: ${stats.inCount} · منصرف: ${stats.outCount}`,
            `In: ${stats.inCount} · Out: ${stats.outCount}`
          )}
          tone="emerald"
        />
      </div>

      {/* Unified EGP Vault Entry Form */}
      <Panel
        className="no-print"
        title={
          <div className="flex items-center gap-2">
            <Vault className="w-4 h-4 text-[#0f766e]" />
            <span>
              {editTxId
                ? bi(lang, 'تعديل حركة في خزنة الموظفين والرواتب', 'Edit Employees Vault Entry')
                : bi(
                    lang,
                    'خزنة الموظفين والرواتب (العملة الموحدة: الجنيه المصري ج.م)',
                    'Employees & Salaries Vault (Unified Currency: EGP)'
                  )}
            </span>
          </div>
        }
        actions={
          <button type="button" onClick={resetForm} className={btnSecondaryCls}>
            {tKey(lang, 'btnClear')}
          </button>
        }
      >
        <div className="mb-4 p-3 rounded-xl bg-teal-50/70 border border-teal-200 text-xs text-slate-700 flex flex-wrap items-center justify-between gap-2">
          <span>
            {bi(
              lang,
              'جميع حركات خزنة الموظفين والرواتب موحدة بالجنيه المصري (ج.م / EGP) لتسهيل تغذية الخزنة وصرف الرواتب والسلف ومتابعة الرصيد الفعلي.',
              'All Employees & Salaries Vault transactions are unified in Egyptian Pounds (EGP).'
            )}
          </span>
          <span className="px-2.5 py-0.5 rounded-lg bg-white border border-teal-200 font-bold text-[#0f766e] font-mono-num">
            EGP (ج.م)
          </span>
        </div>

        {/* Quick Operation Toggle */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => handleModeSwitch('out')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
              txType === 'out'
                ? 'bg-red-50 border-red-300 text-red-800'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <ArrowUpCircle className="w-4 h-4" />
            <span>{bi(lang, 'صرف راتب / سلفة / مكافأة (منصرف)', 'Disburse Salary / Advance (Outflow)')}</span>
          </button>
          <button
            type="button"
            onClick={() => handleModeSwitch('in')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
              txType === 'in'
                ? 'bg-teal-50 border-teal-300 text-[#0f766e]'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <ArrowDownCircle className="w-4 h-4" />
            <span>{bi(lang, 'إيداع / تغذية خزنة الموظفين (وارد)', 'Fund Employees Vault (Inflow)')}</span>
          </button>
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
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputCls}
              />
            </div>
            {txType === 'out' ? (
              <div>
                <label className={labelCls}>{tKey(lang, 'thType')}</label>
                <select
                  value={payrollKind}
                  onChange={(e) => setPayrollKind(e.target.value as Exclude<PayrollType, 'deduction'>)}
                  className={inputCls}
                >
                  <option value="salary">{PAYROLL_TYPES.salary[lang]}</option>
                  <option value="advance">{PAYROLL_TYPES.advance[lang]}</option>
                  <option value="bonus">{PAYROLL_TYPES.bonus[lang]}</option>
                </select>
              </div>
            ) : (
              <div>
                <label className={labelCls}>{tKey(lang, 'lblTrsCat')}</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TreasuryCategory)}
                  className={inputCls}
                >
                  <option value="capital">{TREASURY_CATEGORIES.capital[lang]}</option>
                  <option value="transfer">{TREASURY_CATEGORIES.transfer[lang]}</option>
                  <option value="receipt_extra">{TREASURY_CATEGORIES.receipt_extra[lang]}</option>
                </select>
              </div>
            )}
            <div>
              <label className={labelCls}>
                {txType === 'out'
                  ? bi(lang, 'الموظف', 'Employee')
                  : bi(lang, 'الموظف / المسئول (اختياري)', 'Employee (Optional)')}
              </label>
              <select
                value={employeeId}
                onChange={(e) => handleEmployeeChange(e.target.value)}
                className={inputCls}
              >
                <option value="">{bi(lang, '— خزنة عامة / بدون موظف محدد —', '— General Vault —')}</option>
                {db.employees.map((emp) => (
                  <option key={emp.id} value={String(emp.id)}>
                    {emp.name} ({emp.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>
                {bi(lang, 'المبلغ بالجنيه المصري (ج.م / EGP) *', 'Amount (EGP) *')}
              </label>
              <input
                type="number"
                step="any"
                min={0.01}
                required
                value={amountEGP}
                onChange={(e) => setAmountEGP(e.target.value)}
                placeholder="0.00"
                className={`${inputCls} font-mono-num font-bold border-teal-300`}
              />
              {txType === 'out' && selectedEmployee && calcEmpTotal(selectedEmployee) > 0 && (
                <button
                  type="button"
                  onClick={() => setAmountEGP(String(calcEmpTotal(selectedEmployee)))}
                  className="mt-1 text-[11px] font-semibold text-[#0f766e] hover:underline cursor-pointer"
                >
                  {bi(
                    lang,
                    `الراتب المسجل: ${fmt(calcEmpTotal(selectedEmployee))} ج.م (اضغط للتعبئة)`,
                    `Registered salary: ${fmt(calcEmpTotal(selectedEmployee))} EGP (Fill)`
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5 items-end">
            {txType === 'out' && (
              <div className="lg:col-span-2">
                <label className={labelCls}>{tKey(lang, 'lblPayMonth')}</label>
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className={`${inputCls} font-mono-num`}
                />
              </div>
            )}
            <div className={txType === 'out' ? 'lg:col-span-5' : 'lg:col-span-6'}>
              <label className={labelCls}>{tKey(lang, 'lblTrsDesc')}</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  txType === 'in'
                    ? bi(lang, 'مثال: تغذية خزنة الموظفين والرواتب لشهر ...', 'e.g. Monthly payroll vault funding')
                    : bi(lang, 'مثال: راتب شهر / سلفة / مكافأة (يُملأ تلقائياً لو تُرك فارغاً)', 'Auto-filled if left blank')
                }
                className={inputCls}
              />
            </div>
            <div className={txType === 'out' ? 'lg:col-span-5' : 'lg:col-span-6'}>
              <label className={labelCls}>{tKey(lang, 'lblNotes')}</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {!editTxId && txType === 'out' ? (
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={alsoSavePayroll}
                  onChange={(e) => setAlsoSavePayroll(e.target.checked)}
                  className="w-4 h-4 accent-[#0f766e]"
                />
                <span>
                  {bi(
                    lang,
                    'تسجيل القيد تلقائياً في سجل الرواتب والسلف أيضاً',
                    'Also record automatically in Payroll Log'
                  )}
                </span>
              </label>
            ) : (
              <div />
            )}

            <button type="submit" disabled={saving} className={btnPrimaryCls}>
              <Plus className="w-3.5 h-3.5" />
              <span>
                {editTxId
                  ? bi(lang, 'تحديث القيد في الخزنة', 'Update Vault Entry')
                  : txType === 'in'
                    ? bi(lang, 'حفظ التغذية في خزنة الموظفين', 'Save Deposit to Vault')
                    : bi(lang, 'صرف وتسجيل الراتب في الخزنة', 'Save Salary in Vault')}
              </span>
            </button>
          </div>
        </form>
      </Panel>

      {/* Vault Ledger Table */}
      <Panel
        title={bi(lang, 'سجل خزنة الموظفين والرواتب (ج.م / EGP)', 'Employees & Salaries Vault Ledger (EGP)')}
        actions={
          <>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as 'all' | TreasuryType)}
              className="h-9 px-3 rounded-xl border border-slate-200 text-xs bg-white"
            >
              <option value="all">{bi(lang, 'الكل (وارد ومنصرف)', 'All (In & Out)')}</option>
              <option value="in">{bi(lang, 'وارد / تغذية فقط', 'Deposits Only')}</option>
              <option value="out">{bi(lang, 'منصرف رواتب فقط', 'Payouts Only')}</option>
            </select>
            <select
              value={filterEmp}
              onChange={(e) => setFilterEmp(e.target.value)}
              className="h-9 px-3 rounded-xl border border-slate-200 text-xs bg-white"
            >
              <option value="all">{bi(lang, 'كل الموظفين', 'All Employees')}</option>
              {db.employees.map((emp) => (
                <option key={emp.id} value={String(emp.id)}>
                  {emp.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tKey(lang, 'searchPlaceholder')}
              className="h-9 px-3 rounded-xl border border-slate-200 text-xs w-40 focus:outline-none focus:border-[#1d4ed8]"
            />
            <button type="button" onClick={exportVaultCsv} className={btnSecondaryCls}>
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
                <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thType')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thTrsEmp')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thDesc')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'المبلغ (ج.م)', 'Amount (EGP)')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'lblCurrency')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold no-print">{tKey(lang, 'thAction')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <EmptyRow colSpan={8} lang={lang} />
              ) : (
                filteredRows.map((t) => {
                  const egp = getEgpAmount(t, DEFAULT_EGP_PER_SAR);
                  const signCls = t.type === 'in' ? 'text-[#0f766e]' : 'text-red-700';
                  const signPrefix = t.type === 'in' ? '+' : '-';
                  return (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="py-2 px-2.5 font-mono-num font-bold">{t.refNo}</td>
                      <td className="py-2 px-2.5 font-mono-num">{t.date}</td>
                      <td className="py-2 px-2.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            t.type === 'in' ? 'bg-teal-100 text-teal-800' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {t.type === 'in' ? bi(lang, 'وارد / تغذية', 'Deposit') : TREASURY_CATEGORIES[t.category]?.[lang] || t.category}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 font-semibold">{t.employeeName || '-'}</td>
                      <td className="py-2 px-2.5">
                        <div>{t.description}</div>
                        {t.notes && t.notes !== t.description && (
                          <div className="text-[11px] text-slate-400">{t.notes}</div>
                        )}
                      </td>
                      <td className={`py-2 px-2.5 font-mono-num font-bold ${signCls}`}>
                        {`${signPrefix}${fmt(egp)} ج.م`}
                      </td>
                      <td className="py-2 px-2.5">
                        <span className="inline-flex px-2 py-0.5 rounded-md bg-teal-50 text-[#0f766e] font-mono-num text-[11px] font-bold">
                          EGP
                        </span>
                      </td>
                      <td className="py-2 px-2.5 no-print">
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={() => handleEditRow(t)} className={btnSoftBlueCls}>
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button type="button" onClick={() => handleDeleteRow(t)} className={btnSoftRedCls}>
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredRows.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 font-bold text-slate-900 border-t border-slate-200">
                  <td colSpan={5} className="py-2.5 px-2.5">
                    {bi(lang, `صافي الرصيد (${filteredRows.length} حركة)`, `Net Filtered Balance (${filteredRows.length})`)}
                  </td>
                  <td className={`py-2.5 px-2.5 font-mono-num ${filteredTotals.netEGP >= 0 ? 'text-[#0f766e]' : 'text-red-700'}`}>
                    {fmt(filteredTotals.netEGP)} ج.م
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Panel>
    </div>
  );
};
