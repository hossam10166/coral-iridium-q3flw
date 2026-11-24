import React from 'react';
import { Printer } from 'lucide-react';
import { AccountingDB, Lang } from '../../types/accounting';
import { bi, tKey } from '../../i18n/translations';
import {
  calcTreasurySummary,
  entryVals,
  fmt,
  getPartyNames,
  sumBy,
  trnVals,
} from '../../utils/calculations';
import { EmptyRow, KpiCard, Panel, btnSecondaryCls } from '../AccountingUI';

export const ReportsPage: React.FC<{
  db: AccountingDB;
  lang: Lang;
}> = ({ db, lang }) => {
  const vs = sumBy(db.entries, (e) => entryVals(e, db.rate).sales);
  const vc = sumBy(db.entries, (e) => entryVals(e, db.rate).cost);
  const vp = vs - vc;

  const ts = sumBy(db.transports, (x) => trnVals(x, db.rate).sales);
  const tc = sumBy(db.transports, (x) => trnVals(x, db.rate).cost);
  const tp = ts - tc;

  const sales = vs + ts;
  const cost = vc + tc;
  const profit = sales - cost;
  const margin = sales > 0 ? (profit / sales) * 100 : 0;

  const trs = calcTreasurySummary(db);
  const netProfitAfterExpenses = profit - trs.operatingExpenses - trs.payrollOutflows;

  const topCustomers = getPartyNames(db, 'customer', lang)
    .map((name) => {
      const s =
        sumBy(db.entries.filter((e) => e.customer === name), (e) => entryVals(e, db.rate).sales) +
        sumBy(db.transports.filter((x) => x.customer === name), (x) => trnVals(x, db.rate).sales);
      return { name, total: s };
    })
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 7);

  const topSuppliers = getPartyNames(db, 'supplier', lang, 'all')
    .map((name) => {
      const c =
        sumBy(db.entries.filter((e) => e.supplier === name), (e) => entryVals(e, db.rate).cost) +
        sumBy(db.transports.filter((x) => x.supplier === name), (x) => trnVals(x, db.rate).cost);
      return { name, total: c };
    })
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 7);

  return (
    <div className="space-y-5">
      <Panel
        title={tKey(lang, 'repTitle')}
        actions={
          <button type="button" onClick={() => window.print()} className={btnSecondaryCls}>
            <Printer className="w-3.5 h-3.5" />
            <span>{tKey(lang, 'btnPrint')}</span>
          </button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
          <KpiCard label={tKey(lang, 'repSales')} value={fmt(sales)} tone="blue" />
          <KpiCard label={tKey(lang, 'repCost')} value={fmt(cost)} tone="amber" />
          <KpiCard label={tKey(lang, 'repProfit')} value={fmt(profit)} tone="teal" />
          <KpiCard label={tKey(lang, 'repMargin')} value={`${margin.toFixed(1)}%`} tone="emerald" />
        </div>

        <div className="overflow-x-auto mb-5">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <th className="py-2.5 px-3 text-start font-bold">{bi(lang, 'القطاع', 'Sector')}</th>
                <th className="py-2.5 px-3 text-start font-bold">{bi(lang, 'العدد', 'Count')}</th>
                <th className="py-2.5 px-3 text-start font-bold">{tKey(lang, 'repSales')}</th>
                <th className="py-2.5 px-3 text-start font-bold">{tKey(lang, 'repCost')}</th>
                <th className="py-2.5 px-3 text-start font-bold">{tKey(lang, 'repProfit')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono-num">
              <tr>
                <td className="py-2.5 px-3 font-sans font-semibold">{tKey(lang, 'fVisa')}</td>
                <td className="py-2.5 px-3">{db.entries.length}</td>
                <td className="py-2.5 px-3">{fmt(vs)}</td>
                <td className="py-2.5 px-3">{fmt(vc)}</td>
                <td className="py-2.5 px-3 text-[#0f766e] font-bold">{fmt(vp)}</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-sans font-semibold">{tKey(lang, 'fTrn')}</td>
                <td className="py-2.5 px-3">{db.transports.length}</td>
                <td className="py-2.5 px-3">{fmt(ts)}</td>
                <td className="py-2.5 px-3">{fmt(tc)}</td>
                <td className="py-2.5 px-3 text-[#0f766e] font-bold">{fmt(tp)}</td>
              </tr>
              <tr className="bg-slate-50 font-bold text-slate-900">
                <td className="py-2.5 px-3 font-sans">{bi(lang, 'الإجمالي', 'Total')}</td>
                <td className="py-2.5 px-3">{db.entries.length + db.transports.length}</td>
                <td className="py-2.5 px-3">{fmt(sales)}</td>
                <td className="py-2.5 px-3">{fmt(cost)}</td>
                <td className="py-2.5 px-3 text-[#0f766e]">{fmt(profit)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="text-slate-500">{tKey(lang, 'trsKpiExpenses')}</div>
            <div className="font-mono-num font-bold text-red-700 mt-1">{fmt(trs.operatingExpenses)} SAR</div>
          </div>
          <div>
            <div className="text-slate-500">{tKey(lang, 'trsKpiPayroll')}</div>
            <div className="font-mono-num font-bold text-amber-700 mt-1">{fmt(trs.payrollOutflows)} SAR</div>
          </div>
          <div>
            <div className="text-slate-500">{bi(lang, 'صافي الربح بعد المصروفات والرواتب', 'Net Profit After Expenses')}</div>
            <div
              className={`font-mono-num font-bold mt-1 ${
                netProfitAfterExpenses >= 0 ? 'text-[#0f766e]' : 'text-red-700'
              }`}
            >
              {fmt(netProfitAfterExpenses)} SAR
            </div>
          </div>
          <div>
            <div className="text-slate-500">{tKey(lang, 'trsKpiLiquidity')}</div>
            <div className="font-mono-num font-bold text-[#1d4ed8] mt-1">
              {fmt(trs.totalLiquidity)} SAR ({bi(lang, 'خزنة:', 'Cash:')} {fmt(trs.cashboxBalance)})
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title={tKey(lang, 'topCustTitle')}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <th className="py-2 px-2.5 text-start font-bold">#</th>
                  <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thCustomer')}</th>
                  <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thTotalSales')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topCustomers.length === 0 ? (
                  <EmptyRow colSpan={3} lang={lang} />
                ) : (
                  topCustomers.map((c, idx) => (
                    <tr key={c.name} className="hover:bg-slate-50">
                      <td className="py-2 px-2.5 font-mono-num">{idx + 1}</td>
                      <td className="py-2 px-2.5 font-semibold">{c.name}</td>
                      <td className="py-2 px-2.5 font-mono-num font-bold text-[#1d4ed8]">{fmt(c.total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title={tKey(lang, 'topSuppTitle')}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <th className="py-2 px-2.5 text-start font-bold">#</th>
                  <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thSupplier')}</th>
                  <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thCost')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topSuppliers.length === 0 ? (
                  <EmptyRow colSpan={3} lang={lang} />
                ) : (
                  topSuppliers.map((s, idx) => (
                    <tr key={s.name} className="hover:bg-slate-50">
                      <td className="py-2 px-2.5 font-mono-num">{idx + 1}</td>
                      <td className="py-2 px-2.5 font-semibold">{s.name}</td>
                      <td className="py-2 px-2.5 font-mono-num font-bold text-amber-700">{fmt(s.total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
};
