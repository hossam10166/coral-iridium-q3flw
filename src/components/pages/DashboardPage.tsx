import React, { useMemo } from 'react';
import {
  ArrowUpRight,
  Building2,
  CalendarCheck2,
  DatabaseBackup,
  DollarSign,
  FileText,
  Landmark,
  Layers,
  Users,
  Vault,
  Wallet,
} from 'lucide-react';
import {
  AccountingDB,
  CycleStatus,
  Lang,
  PageId,
  STAGES,
  STATUS_LABELS,
} from '../../types/accounting';
import { bi, tKey } from '../../i18n/translations';
import {
  calcTreasurySummary,
  entryVals,
  fmt,
  fmtUSD,
  sumBy,
  tRoute,
  trnVals,
} from '../../utils/calculations';
import { EmptyRow, KpiCard, Panel, btnPrimaryCls, btnSecondaryCls } from '../AccountingUI';

interface DashboardPageProps {
  db: AccountingDB;
  lang: Lang;
  legacyLocalData: AccountingDB | null;
  onMigrateLegacy: () => Promise<void>;
  onNavigate: (page: PageId) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  db,
  lang,
  legacyLocalData,
  onMigrateLegacy,
  onNavigate,
}) => {
  const [migrating, setMigrating] = React.useState(false);

  const vSales = sumBy(db.entries, (e) => entryVals(e, db.rate).sales);
  const vCost = sumBy(db.entries, (e) => entryVals(e, db.rate).cost);
  const vProfit = vSales - vCost;
  const pax = sumBy(db.entries, (e) => e.pax);

  const tSales = sumBy(db.transports, (x) => trnVals(x, db.rate).sales);
  const tCost = sumBy(db.transports, (x) => trnVals(x, db.rate).cost);
  const tProfit = tSales - tCost;

  const totalSales = vSales + tSales;
  const totalCost = vCost + tCost;
  const totalProfit = vProfit + tProfit;

  const invoices = db.invoices || [];
  const totalInvoicesUSD = sumBy(invoices, (inv) => Number(inv.totalUSD || 0));

  const rec = sumBy(
    db.vouchers.filter((v) => v.type === 'receipt'),
    (v) => v.amountSAR
  );
  const pay = sumBy(
    db.vouchers.filter((v) => v.type === 'payment'),
    (v) => v.amountSAR
  );
  const trs = calcTreasurySummary(db);

  // Current Groups Status Breakdown
  const groupStatuses = useMemo(() => {
    return db.entries.map((entry) => {
      const ops = db.cycleOperations.filter((o) => o.groupNo === entry.groupNo);
      const completed = ops.filter((o) => o.status === 'completed').length;
      const inProgress = ops.filter((o) => o.status === 'in_progress').length;
      const cancelled = ops.filter((o) => o.status === 'cancelled').length;

      let overallStatus: CycleStatus = 'pending';
      if (completed === STAGES.length) {
        overallStatus = 'completed';
      } else if (completed > 0 || inProgress > 0) {
        overallStatus = 'in_progress';
      } else if (cancelled === STAGES.length && ops.length === STAGES.length) {
        overallStatus = 'cancelled';
      }

      const grpProfit =
        entryVals(entry, db.rate).profit +
        sumBy(
          db.transports.filter((t) => t.groupNo === entry.groupNo),
          (t) => trnVals(t, db.rate).profit
        );

      return {
        entry,
        completed,
        totalStages: STAGES.length,
        overallStatus,
        grpProfit,
      };
    });
  }, [db.entries, db.cycleOperations, db.transports, db.rate]);

  const completedGroupsCount = groupStatuses.filter((g) => g.overallStatus === 'completed').length;
  const inProgressGroupsCount = groupStatuses.filter((g) => g.overallStatus === 'in_progress').length;
  const pendingGroupsCount = groupStatuses.filter((g) => g.overallStatus === 'pending').length;

  const isCloudEmpty =
    db.entries.length === 0 &&
    db.transports.length === 0 &&
    db.vouchers.length === 0 &&
    db.treasury.length === 0 &&
    db.employees.length === 0 &&
    db.customers.length === 0 &&
    db.suppliers.length === 0 &&
    invoices.length === 0;

  const handleMigrate = async () => {
    setMigrating(true);
    try {
      await onMigrateLegacy();
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="space-y-5">
      {legacyLocalData && isCloudEmpty && (
        <div className="no-print bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <DatabaseBackup className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-amber-950">
                {bi(
                  lang,
                  'تم العثور على بيانات محلية سابقة على هذا المتصفح',
                  'Previous Local Browser Data Detected'
                )}
              </div>
              <div className="text-xs text-amber-800 mt-0.5">
                {bi(
                  lang,
                  `توجد ${legacyLocalData.entries.length} مجموعة تأشيرات و${legacyLocalData.transports.length} عملية نقل محفوظة محلياً. يمكنك استيرادها إلى حسابك السحابي بنقرة واحدة.`,
                  `Found ${legacyLocalData.entries.length} visa groups and ${legacyLocalData.transports.length} transports saved locally. Import them to your cloud account now.`
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            disabled={migrating}
            onClick={handleMigrate}
            className={btnPrimaryCls}
          >
            {migrating
              ? bi(lang, 'جاري الترحيل...', 'Importing...')
              : bi(lang, 'ترحيل البيانات المحلية للسحابة', 'Import Local Data to Cloud')}
          </button>
        </div>
      )}

      {/* Executive Summary Banner: Total Treasury + Quick Financial KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <KpiCard
          label={bi(lang, 'إجمالي الخزنة والسيولة الموحدة (ر.س)', 'Total Treasury & Liquidity (SAR)')}
          value={`${fmt(trs.totalLiquidity)}`}
          sub={bi(
            lang,
            `نقدي: ${fmt(trs.cashboxBalance)} | بنكي: ${fmt(trs.bankNet)}`,
            `Cash: ${fmt(trs.cashboxBalance)} | Bank: ${fmt(trs.bankNet)}`
          )}
          tone="blue"
        />
        <KpiCard label={tKey(lang, 'kpiSales')} value={fmt(totalSales)} tone="teal" />
        <KpiCard label={tKey(lang, 'kpiCost')} value={fmt(totalCost)} tone="amber" />
        <KpiCard
          label={tKey(lang, 'kpiProfit')}
          value={fmt(totalProfit)}
          sub={
            totalSales > 0
              ? `${bi(lang, 'الهامش:', 'Margin:')} ${((totalProfit / totalSales) * 100).toFixed(1)}%`
              : undefined
          }
          tone="emerald"
        />
        <KpiCard
          label={bi(lang, 'حالة المجموعات والمعتمرين', 'Groups & Pilgrims Status')}
          value={db.entries.length}
          sub={bi(
            lang,
            `${pax} معتمر · مكتمل: ${completedGroupsCount} | جاري: ${inProgressGroupsCount}`,
            `${pax} pax · Done: ${completedGroupsCount} | Active: ${inProgressGroupsCount}`
          )}
          tone="blue"
        />
        <KpiCard label={tKey(lang, 'kpiCustBal')} value={fmt(totalSales - rec)} tone="emerald" />
        <KpiCard label={tKey(lang, 'kpiSuppBal')} value={fmt(totalCost - pay)} tone="red" />
        <KpiCard
          label={bi(lang, 'إجمالي الفواتير (دولار $)', 'Group Invoices Total (USD)')}
          value={fmtUSD(totalInvoicesUSD)}
          sub={bi(lang, `${invoices.length} فاتورة · الصرف ${Number(db.rate || 3.75).toFixed(2)}`, `${invoices.length} invoices · FX ${Number(db.rate || 3.75).toFixed(2)}`)}
          tone="slate"
        />
      </div>

      {/* Financial Summary + Total Treasury Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Panel
          title={tKey(lang, 'sectorTitle')}
          className="lg:col-span-7"
          actions={
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => onNavigate('invoice')} className={btnSecondaryCls}>
                <FileText className="w-3.5 h-3.5" />
                <span>{tKey(lang, 'navInvoice')}</span>
              </button>
              <button type="button" onClick={() => onNavigate('reports')} className={btnSecondaryCls}>
                <span>{tKey(lang, 'navReports')}</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <th className="py-2.5 px-3 text-start font-bold">{bi(lang, 'القطاع', 'Sector')}</th>
                  <th className="py-2.5 px-3 text-start font-bold">{bi(lang, 'المبيعات', 'Sales')}</th>
                  <th className="py-2.5 px-3 text-start font-bold">{bi(lang, 'التكاليف', 'Cost')}</th>
                  <th className="py-2.5 px-3 text-start font-bold">{bi(lang, 'الربح', 'Profit')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono-num">
                <tr>
                  <td className="py-2.5 px-3 font-sans font-semibold text-slate-800">
                    {bi(lang, `التأشيرات (${db.entries.length} مجموعة)`, `Visas (${db.entries.length} groups)`)}
                  </td>
                  <td className="py-2.5 px-3">{fmt(vSales)}</td>
                  <td className="py-2.5 px-3">{fmt(vCost)}</td>
                  <td className="py-2.5 px-3 text-[#0f766e] font-bold">{fmt(vProfit)}</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-sans font-semibold text-slate-800">
                    {bi(lang, `النقل (${db.transports.length} عملية)`, `Transport (${db.transports.length} trips)`)}
                  </td>
                  <td className="py-2.5 px-3">{fmt(tSales)}</td>
                  <td className="py-2.5 px-3">{fmt(tCost)}</td>
                  <td className="py-2.5 px-3 text-[#0f766e] font-bold">{fmt(tProfit)}</td>
                </tr>
                <tr className="bg-slate-50 font-bold text-slate-900">
                  <td className="py-2.5 px-3 font-sans">{bi(lang, 'الإجمالي الكلي (ر.س)', 'Grand Total (SAR)')}</td>
                  <td className="py-2.5 px-3">{fmt(totalSales)}</td>
                  <td className="py-2.5 px-3">{fmt(totalCost)}</td>
                  <td className="py-2.5 px-3 text-[#0f766e]">{fmt(totalProfit)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* USD Invoices Quick Strip */}
          <div className="mt-3.5 p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-emerald-900 font-semibold">
              <DollarSign className="w-4 h-4 text-emerald-700" />
              <span>
                {bi(
                  lang,
                  `فواتير المجموعات بالدولار الأمريكي (${invoices.length} فاتورة مسجلة)`,
                  `USD Group Invoices (${invoices.length} saved)`
                )}
              </span>
            </div>
            <strong className="font-mono-num text-sm text-emerald-800" dir="ltr">
              {fmtUSD(totalInvoicesUSD)} USD
            </strong>
          </div>
        </Panel>

        {/* Total Treasury Panel */}
        <Panel
          title={
            <div className="flex items-center gap-2">
              <Vault className="w-4 h-4 text-[#1d4ed8]" />
              <span>{bi(lang, 'إجمالي الخزنة والسيولة', 'Treasury & Liquidity Summary')}</span>
            </div>
          }
          className="lg:col-span-5"
          actions={
            <>
              <button type="button" onClick={() => onNavigate('treasury')} className={btnSecondaryCls}>
                <Wallet className="w-3.5 h-3.5" />
                <span>{tKey(lang, 'navTreasury')}</span>
              </button>
              <button type="button" onClick={() => onNavigate('employees')} className={btnSecondaryCls}>
                <Users className="w-3.5 h-3.5" />
                <span>{tKey(lang, 'navEmployees')}</span>
              </button>
            </>
          }
        >
          {/* 4 Treasury Accounts Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                <Wallet className="w-3 h-3 text-[#0f766e]" />
                <span>{bi(lang, 'الخزنة النقدية', 'Cashbox')}</span>
              </div>
              <div className="text-xs font-bold font-mono-num text-slate-900 mt-1">{fmt(trs.cashboxBalance)}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                <Landmark className="w-3 h-3 text-[#1d4ed8]" />
                <span>{bi(lang, 'البنك', 'Bank')}</span>
              </div>
              <div className="text-xs font-bold font-mono-num text-slate-900 mt-1">{fmt(trs.bankNet)}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                <Building2 className="w-3 h-3 text-amber-600" />
                <span>{bi(lang, 'العهدة', 'Custody')}</span>
              </div>
              <div className="text-xs font-bold font-mono-num text-slate-900 mt-1">{fmt(trs.custodyNet)}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-teal-50/70 border border-teal-200">
              <div className="flex items-center gap-1 text-[10px] font-semibold text-teal-800">
                <Vault className="w-3 h-3 text-[#0f766e]" />
                <span>{bi(lang, 'خزنة الرواتب', 'Payroll Vault')}</span>
              </div>
              <div className="text-xs font-bold font-mono-num text-[#0f766e] mt-1">{fmt(trs.payrollVaultEGP)} ج.م</div>
            </div>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-600">{bi(lang, 'إجمالي المقبوضات (سندات قبض)', 'Customer Receipts (Vouchers)')}</span>
              <strong className="font-mono-num text-[#0f766e]">{fmt(rec)} ر.س</strong>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-600">{bi(lang, 'إجمالي المدفوعات (سندات صرف)', 'Supplier Payments (Vouchers)')}</span>
              <strong className="font-mono-num text-red-700">{fmt(pay)} ر.س</strong>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-600">{bi(lang, 'حركات الخزنة المباشرة (وارد / منصرف)', 'Direct Treasury (In / Out)')}</span>
              <strong className="font-mono-num text-slate-900">
                {fmt(trs.directIn)} / {fmt(trs.directOut)}
              </strong>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-600">{bi(lang, 'المصروفات التشغيلية والرواتب', 'Operating Expenses & Payroll')}</span>
              <strong className="font-mono-num text-amber-700">
                {fmt(trs.operatingExpenses + trs.payrollOutflows)} ر.س
              </strong>
            </div>
            <div className="mt-2 p-3 rounded-xl bg-[#0f1e36] text-white flex items-center justify-between">
              <span className="font-bold text-xs">{bi(lang, 'إجمالي الخزنة والسيولة الموحدة', 'Total Unified Treasury')}</span>
              <strong className="font-mono-num text-base text-emerald-400">{fmt(trs.totalLiquidity)} ر.س</strong>
            </div>
          </div>
        </Panel>
      </div>

      {/* Current Groups Operational Status Panel */}
      <Panel
        title={
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#0f766e]" />
            <span>{bi(lang, 'حالة المجموعات الحالية ومتابعة الدورة', 'Current Groups Status & Cycle Progress')}</span>
          </div>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onNavigate('groups')} className={btnSecondaryCls}>
              <Layers className="w-3.5 h-3.5" />
              <span>{tKey(lang, 'navGroups')}</span>
            </button>
            <button type="button" onClick={() => onNavigate('operations')} className={btnSecondaryCls}>
              <CalendarCheck2 className="w-3.5 h-3.5" />
              <span>{tKey(lang, 'navOperations')}</span>
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-teal-900">
              {bi(lang, 'مجموعات مكتملة (5/5 مراحل)', 'Completed Groups (5/5)')}
            </span>
            <strong className="text-base font-bold font-mono-num text-[#0f766e]">{completedGroupsCount}</strong>
          </div>
          <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-900">
              {bi(lang, 'مجموعات قيد التشغيل', 'In Progress Groups')}
            </span>
            <strong className="text-base font-bold font-mono-num text-amber-700">{inProgressGroupsCount}</strong>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">
              {bi(lang, 'مجموعات مجدولة / بانتظار البدء', 'Scheduled / Pending Groups')}
            </span>
            <strong className="text-base font-bold font-mono-num text-slate-900">{pendingGroupsCount}</strong>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thGroup')}</th>
                <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thCustomer')}</th>
                <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thPax')}</th>
                <th className="py-2 px-2.5 text-start font-bold">{bi(lang, 'تقدم الدورة', 'Cycle Progress')}</th>
                <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thStatus')}</th>
                <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thTotalProfit')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groupStatuses.length === 0 ? (
                <EmptyRow colSpan={6} lang={lang} />
              ) : (
                groupStatuses.slice(-6).reverse().map(({ entry, completed, totalStages, overallStatus, grpProfit }) => {
                  const st = STATUS_LABELS[overallStatus];
                  const pct = Math.round((completed / totalStages) * 100);
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50">
                      <td className="py-2 px-2.5 font-bold font-mono-num text-[#1d4ed8]">{entry.groupNo}</td>
                      <td className="py-2 px-2.5 font-semibold text-slate-900">{entry.customer}</td>
                      <td className="py-2 px-2.5 font-mono-num">{entry.pax}</td>
                      <td className="py-2 px-2.5 min-w-[140px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                overallStatus === 'completed' ? 'bg-[#0f766e]' : 'bg-[#1d4ed8]'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="font-mono-num text-[11px] font-semibold text-slate-600">
                            {completed}/{totalStages}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-2.5">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${st.cls}`}>
                          {st[lang]}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 font-mono-num font-bold text-[#0f766e]">{fmt(grpProfit)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Recent Visas & Recent Transports */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel
          title={tKey(lang, 'recentVisasTitle')}
          actions={
            <button type="button" onClick={() => onNavigate('entry')} className={btnSecondaryCls}>
              <span>{tKey(lang, 'navEntry')}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thGroup')}</th>
                  <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thCustomer')}</th>
                  <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thCount')}</th>
                  <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thSales')}</th>
                  <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thProfit')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {db.entries.length === 0 ? (
                  <EmptyRow colSpan={5} lang={lang} />
                ) : (
                  db.entries.slice(-5).reverse().map((e) => {
                    const v = entryVals(e, db.rate);
                    return (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="py-2 px-2.5 font-bold text-slate-900">{e.groupNo}</td>
                        <td className="py-2 px-2.5">{e.customer}</td>
                        <td className="py-2 px-2.5 font-mono-num">{e.pax}</td>
                        <td className="py-2 px-2.5 font-mono-num">{fmt(v.sales)}</td>
                        <td className="py-2 px-2.5 font-mono-num text-[#0f766e] font-semibold">{fmt(v.profit)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title={tKey(lang, 'recentTrnTitle')}
          actions={
            <button type="button" onClick={() => onNavigate('transport')} className={btnSecondaryCls}>
              <span>{tKey(lang, 'navTransport')}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thRef')}</th>
                  <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thRoute')}</th>
                  <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thSupplier')}</th>
                  <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thSales')}</th>
                  <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thProfit')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {db.transports.length === 0 ? (
                  <EmptyRow colSpan={5} lang={lang} />
                ) : (
                  db.transports.slice(-5).reverse().map((x) => {
                    const v = trnVals(x, db.rate);
                    return (
                      <tr key={x.id} className="hover:bg-slate-50">
                        <td className="py-2 px-2.5 font-bold text-slate-900">{x.refNo}</td>
                        <td className="py-2 px-2.5">{tRoute(x.route, lang)}</td>
                        <td className="py-2 px-2.5">{x.supplier}</td>
                        <td className="py-2 px-2.5 font-mono-num">{fmt(v.sales)}</td>
                        <td className="py-2 px-2.5 font-mono-num text-[#0f766e] font-semibold">{fmt(v.profit)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
};

