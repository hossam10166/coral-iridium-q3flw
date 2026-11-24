import React, { useMemo, useState } from 'react';
import { Bus, CalendarCheck2, Trash2 } from 'lucide-react';
import { AccountingDB, Lang, PageId, TransportEntry } from '../../types/accounting';
import { bi, tKey } from '../../i18n/translations';
import { entryVals, fmt, sumBy, trnVals } from '../../utils/calculations';
import {
  ConfirmConfig,
  EmptyRow,
  Panel,
  btnDangerCls,
  btnSoftBlueCls,
} from '../AccountingUI';

interface GroupsPageProps {
  db: AccountingDB;
  lang: Lang;
  onOpenOperations: (groupNo: string) => void;
  onPrefillTransport: (groupNo: string) => void;
  onDeleteAllGroups: () => Promise<void>;
  onNavigate: (page: PageId) => void;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
  onConfirm: (cfg: ConfirmConfig) => void;
}

type GroupSourceFilter = 'all' | 'with_transport' | 'transport_only' | 'with_visa';

interface UnifiedGroupRow {
  key: string;
  groupNo: string;
  date: string;
  customer: string;
  supplier: string;
  pax: number;
  visaSales: number;
  visaProfit: number;
  hasVisa: boolean;
  trns: TransportEntry[];
  trnSales: number;
  trnProfit: number;
  totalProfit: number;
  done: number;
  sortOrder: number;
}

export const GroupsPage: React.FC<GroupsPageProps> = ({
  db,
  lang,
  onOpenOperations,
  onPrefillTransport,
  onDeleteAllGroups,
  onToast,
  onConfirm,
}) => {
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<GroupSourceFilter>('all');

  const allGroups = useMemo<UnifiedGroupRow[]>(() => {
    const trnByKey = new Map<string, TransportEntry[]>();
    db.transports.forEach((t) => {
      const g = String(t.groupNo || '').trim();
      if (!g) return;
      const k = g.toLowerCase();
      const arr = trnByKey.get(k);
      if (arr) arr.push(t);
      else trnByKey.set(k, [t]);
    });

    const opsDoneByKey = new Map<string, number>();
    db.cycleOperations.forEach((o) => {
      if (o.status !== 'completed') return;
      const g = String(o.groupNo || '').trim();
      if (!g) return;
      const k = g.toLowerCase();
      opsDoneByKey.set(k, (opsDoneByKey.get(k) || 0) + 1);
    });

    const rows: UnifiedGroupRow[] = [];
    const seenKeys = new Set<string>();

    db.entries.forEach((e, idx) => {
      const g = String(e.groupNo || '').trim();
      if (!g) return;
      const k = g.toLowerCase();
      seenKeys.add(k);

      const v = entryVals(e, db.rate);
      const trns = trnByKey.get(k) || [];
      const trnSales = sumBy(trns, (x) => trnVals(x, db.rate).sales);
      const trnProfit = sumBy(trns, (x) => trnVals(x, db.rate).profit);
      const done = opsDoneByKey.get(k) || 0;

      rows.push({
        key: `visa-${e.id}`,
        groupNo: g,
        date: e.date,
        customer: e.customer,
        supplier: e.supplier,
        pax: e.pax,
        visaSales: v.sales,
        visaProfit: v.profit,
        hasVisa: true,
        trns,
        trnSales,
        trnProfit,
        totalProfit: v.profit + trnProfit,
        done,
        sortOrder: idx,
      });
    });

    let extraIdx = db.entries.length;
    trnByKey.forEach((trns, k) => {
      if (seenKeys.has(k)) return;
      seenKeys.add(k);

      const displayGroupNo = String(trns[0].groupNo || '').trim();
      const latestDate =
        trns
          .map((x) => x.date)
          .filter(Boolean)
          .sort()
          .slice(-1)[0] || '-';
      const customers = Array.from(
        new Set(trns.map((x) => String(x.customer || '').trim()).filter(Boolean))
      );
      const maxPax = Math.max(0, ...trns.map((x) => Number(x.pax || 0)));

      const trnSales = sumBy(trns, (x) => trnVals(x, db.rate).sales);
      const trnProfit = sumBy(trns, (x) => trnVals(x, db.rate).profit);
      const done = opsDoneByKey.get(k) || 0;

      rows.push({
        key: `trn-${k}`,
        groupNo: displayGroupNo,
        date: latestDate,
        customer: customers.join('، ') || '-',
        supplier: '',
        pax: maxPax,
        visaSales: 0,
        visaProfit: 0,
        hasVisa: false,
        trns,
        trnSales,
        trnProfit,
        totalProfit: trnProfit,
        done,
        sortOrder: extraIdx++,
      });
    });

    return rows;
  }, [db.entries, db.transports, db.cycleOperations, db.rate]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allGroups
      .filter((g) => {
        if (sourceFilter === 'with_transport' && g.trns.length === 0) return false;
        if (sourceFilter === 'transport_only' && g.hasVisa) return false;
        if (sourceFilter === 'with_visa' && !g.hasVisa) return false;
        if (!q) return true;
        const trnText = g.trns.map((t) => `${t.refNo} ${t.supplier} ${t.route} ${t.customer}`).join(' ');
        return `${g.groupNo} ${g.customer} ${g.supplier} ${trnText}`.toLowerCase().includes(q);
      })
      .slice()
      .reverse();
  }, [allGroups, search, sourceFilter]);

  const totals = useMemo(() => {
    return {
      pax: sumBy(filtered, (g) => g.pax),
      visaSales: sumBy(filtered, (g) => g.visaSales),
      trnCount: sumBy(filtered, (g) => g.trns.length),
      trnSales: sumBy(filtered, (g) => g.trnSales),
      profit: sumBy(filtered, (g) => g.totalProfit),
    };
  }, [filtered]);

  const handleDeleteAll = () => {
    if (!db.entries.length) return;
    onConfirm({
      title: bi(lang, 'حذف جميع المجموعات', 'Delete All Groups'),
      message: bi(
        lang,
        `سيتم حذف جميع مجموعات التأشيرات (${db.entries.length}) وعمليات النقل الخاصة بها نهائياً. هل أنت متأكد؟`,
        `This will permanently delete all ${db.entries.length} registered visa groups and their cycle operations. Proceed?`
      ),
      danger: true,
      onConfirm: async () => {
        await onDeleteAllGroups();
        onToast(bi(lang, 'تم حذف جميع المجموعات بنجاح', 'All groups deleted'));
      },
    });
  };

  return (
    <Panel
      title={tKey(lang, 'groupsTitle')}
      actions={
        <>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as GroupSourceFilter)}
            className="h-9 px-3 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:border-[#1d4ed8]"
          >
            <option value="all">{bi(lang, `كل المجموعات (${allGroups.length})`, `All Groups (${allGroups.length})`)}</option>
            <option value="with_transport">{bi(lang, 'عليها بيانات نقل', 'With Transport Data')}</option>
            <option value="transport_only">{bi(lang, 'نقل فقط (بدون تأشيرة)', 'Transport Only')}</option>
            <option value="with_visa">{bi(lang, 'مسجلة بالتأشيرات', 'With Visa Entry')}</option>
          </select>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tKey(lang, 'searchPlaceholder')}
            className="h-9 px-3 rounded-xl border border-slate-200 text-xs w-44 focus:outline-none focus:border-[#1d4ed8]"
          />
          {db.entries.length > 0 && (
            <button type="button" onClick={handleDeleteAll} className={btnDangerCls}>
              <Trash2 className="w-3.5 h-3.5" />
              <span>{tKey(lang, 'btnDelAllGroups')}</span>
            </button>
          )}
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thGroup')}</th>
              <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thDate')}</th>
              <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thCustomer')}</th>
              <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thVisaSupp')}</th>
              <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thPax')}</th>
              <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thVisaSales')}</th>
              <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thLinkedTrn')}</th>
              <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thTotalProfit')}</th>
              <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thCycleCount')}</th>
              <th className="py-2.5 px-2.5 text-start font-bold no-print">{tKey(lang, 'thAction')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <EmptyRow colSpan={10} lang={lang} />
            ) : (
              filtered.map((g) => (
                <tr key={g.key} className="hover:bg-slate-50">
                  <td className="py-2 px-2.5 font-bold text-slate-900">
                    <div className="flex items-center gap-1.5">
                      <span>{g.groupNo}</span>
                      {!g.hasVisa && (
                        <span className="inline-flex px-1.5 py-0.5 rounded bg-blue-50 text-[#1d4ed8] text-[10px] font-semibold">
                          {bi(lang, 'نقل', 'Trn')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-2.5 font-mono-num">{g.date}</td>
                  <td className="py-2 px-2.5">{g.customer}</td>
                  <td className="py-2 px-2.5">
                    {g.hasVisa ? (
                      g.supplier
                    ) : (
                      <span className="text-[11px] font-semibold text-[#1d4ed8]">
                        {bi(lang, 'نقل فقط', 'Transport Only')}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2.5 font-mono-num">{g.pax > 0 ? g.pax : '-'}</td>
                  <td className="py-2 px-2.5 font-mono-num">{g.hasVisa ? fmt(g.visaSales) : '-'}</td>
                  <td className="py-2 px-2.5 font-mono-num">
                    <span className={g.trns.length > 0 ? 'font-semibold text-slate-900' : 'text-slate-400'}>
                      {g.trns.length} ({fmt(g.trnSales)})
                    </span>
                  </td>
                  <td className="py-2 px-2.5 font-mono-num font-bold text-[#0f766e]">{fmt(g.totalProfit)}</td>
                  <td className="py-2 px-2.5 font-mono-num">{g.done}/5</td>
                  <td className="py-2 px-2.5 no-print">
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onOpenOperations(g.groupNo)}
                        className={btnSoftBlueCls}
                      >
                        <CalendarCheck2 className="w-3 h-3" />
                        <span>{bi(lang, 'الدورة', 'Cycle')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onPrefillTransport(g.groupNo)}
                        className={btnSoftBlueCls}
                      >
                        <Bus className="w-3 h-3" />
                        <span>{bi(lang, '+ نقل', '+ Transport')}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-900">
                <td colSpan={4} className="py-2.5 px-2.5">
                  {bi(lang, 'الإجمالي', 'Total')} ({filtered.length})
                </td>
                <td className="py-2.5 px-2.5 font-mono-num">{totals.pax.toLocaleString('en-US')}</td>
                <td className="py-2.5 px-2.5 font-mono-num">{fmt(totals.visaSales)}</td>
                <td className="py-2.5 px-2.5 font-mono-num">
                  {totals.trnCount} ({fmt(totals.trnSales)})
                </td>
                <td className="py-2.5 px-2.5 font-mono-num text-[#0f766e]">{fmt(totals.profit)}</td>
                <td colSpan={2} className="py-2.5 px-2.5" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Panel>
  );
};
