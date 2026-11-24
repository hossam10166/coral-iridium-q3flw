import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Plus, Search, Trash2, X } from 'lucide-react';
import {
  AccountingDB,
  CustomerMaster,
  Lang,
  SupplierCategory,
  SupplierMaster,
} from '../../types/accounting';
import { bi, tKey } from '../../i18n/translations';
import {
  entryVals,
  fmt,
  getPartyNames,
  htlVals,
  nextCode,
  sumBy,
  trnVals,
} from '../../utils/calculations';
import {
  ConfirmConfig,
  EmptyRow,
  Panel,
  btnPrimaryCls,
  btnSoftBlueCls,
  btnSoftRedCls,
  inputCls,
  labelCls,
} from '../AccountingUI';

export const CustomersPage: React.FC<{
  db: AccountingDB;
  lang: Lang;
  onOpenLedger: (name: string) => void;
}> = ({ db, lang, onOpenLedger }) => {
  const [search, setSearch] = useState('');

  const customerRows = useMemo(() => {
    const names = getPartyNames(db, 'customer', lang);
    const normParty = (val?: string | null) => String(val || '').trim().toLowerCase();
    const masterByName = new Map(db.customers.map((c) => [normParty(c.name), c]));

    return names.map((name) => {
      const key = normParty(name);
      const master = masterByName.get(key);
      const ve = db.entries.filter((e) => normParty(e.customer) === key);
      const tr = db.transports.filter((x) => normParty(x.customer) === key);
      const ht = (db.hotels || []).filter((h) => h.status !== 'cancelled' && normParty(h.customer) === key);
      const paxCount = sumBy(ve, (e) => Number(e.pax || 0));
      const vs = sumBy(ve, (e) => entryVals(e, db.rate).sales);
      const ts = sumBy(tr, (x) => trnVals(x, db.rate).sales);
      const hs = sumBy(ht, (h) => htlVals(h, db.rate).sales);
      const tot = vs + ts + hs;
      const rec = sumBy(
        db.vouchers.filter((v) => v.type === 'receipt' && normParty(v.party) === key),
        (v) => v.amountSAR
      );
      const bal = tot - rec;
      return {
        name,
        code: master?.code || '',
        note: master?.note || '',
        groupsCount: ve.length,
        paxCount,
        vs,
        ts,
        tot,
        rec,
        bal,
      };
    });
  }, [db, lang]);

  const trimmedQuery = search.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    if (!trimmedQuery) return customerRows;
    return customerRows.filter((row) =>
      `${row.name} ${row.code} ${row.note}`.toLowerCase().includes(trimmedQuery)
    );
  }, [customerRows, trimmedQuery]);

  const totals = useMemo(
    () => ({
      groupsCount: sumBy(filteredRows, (r) => r.groupsCount),
      paxCount: sumBy(filteredRows, (r) => r.paxCount),
      vs: sumBy(filteredRows, (r) => r.vs),
      ts: sumBy(filteredRows, (r) => r.ts),
      tot: sumBy(filteredRows, (r) => r.tot),
      rec: sumBy(filteredRows, (r) => r.rec),
      bal: sumBy(filteredRows, (r) => r.bal),
    }),
    [filteredRows]
  );

  return (
    <Panel
      title={tKey(lang, 'custDirTitle')}
      actions={
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-500 font-mono-num">
            {filteredRows.length} / {customerRows.length}
          </span>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={bi(lang, 'بحث باسم العميل أو الكود...', 'Search customer name or code...')}
              aria-label={bi(lang, 'بحث في العملاء', 'Search customers')}
              className="h-9 ps-8 pe-8 rounded-xl border border-slate-200 text-xs w-60 bg-white focus:outline-none focus:border-[#1d4ed8] focus:ring-2 focus:ring-blue-500/15 transition"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label={bi(lang, 'مسح البحث', 'Clear search')}
                className="absolute top-1/2 -translate-y-1/2 end-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="overflow-auto max-h-[calc(100vh-235px)] rounded-xl border border-slate-200 print:max-h-none print:overflow-visible print:border-0">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_0_#e2e8f0] print:static">
            <tr className="bg-slate-50 text-slate-600">
              <th className="py-2.5 px-2.5 text-start font-bold whitespace-nowrap bg-slate-50">
                {tKey(lang, 'thCustomer')}
              </th>
              <th className="py-2.5 px-2.5 text-start font-bold whitespace-nowrap bg-slate-50">
                {tKey(lang, 'thGroups')}
              </th>
              <th className="py-2.5 px-2.5 text-start font-bold whitespace-nowrap bg-slate-50">
                {bi(lang, 'عدد المعتمرين', 'Pilgrims (Pax)')}
              </th>
              <th className="py-2.5 px-2.5 text-start font-bold whitespace-nowrap bg-slate-50">
                {tKey(lang, 'thVisaSales')}
              </th>
              <th className="py-2.5 px-2.5 text-start font-bold whitespace-nowrap bg-slate-50">
                {tKey(lang, 'thTrnSales')}
              </th>
              <th className="py-2.5 px-2.5 text-start font-bold whitespace-nowrap bg-slate-50">
                {tKey(lang, 'thTotalSales')}
              </th>
              <th className="py-2.5 px-2.5 text-start font-bold whitespace-nowrap bg-slate-50">
                {tKey(lang, 'thCollected')}
              </th>
              <th className="py-2.5 px-2.5 text-start font-bold whitespace-nowrap bg-slate-50">
                {tKey(lang, 'thBalDue')}
              </th>
              <th className="py-2.5 px-2.5 text-start font-bold whitespace-nowrap bg-slate-50 no-print">
                {tKey(lang, 'thStatement')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.length === 0 ? (
              <EmptyRow
                colSpan={9}
                lang={lang}
                label={
                  trimmedQuery
                    ? bi(lang, 'لا توجد نتائج مطابقة للبحث', 'No matching customers found')
                    : undefined
                }
              />
            ) : (
              filteredRows.map((row) => (
                <tr key={row.name} className="hover:bg-slate-50">
                  <td className="py-2 px-2.5 font-bold text-slate-900">{row.name}</td>
                  <td className="py-2 px-2.5 font-mono-num">{row.groupsCount}</td>
                  <td className="py-2 px-2.5 font-mono-num font-semibold text-slate-800">{row.paxCount}</td>
                  <td className="py-2 px-2.5 font-mono-num">{fmt(row.vs)}</td>
                  <td className="py-2 px-2.5 font-mono-num">{fmt(row.ts)}</td>
                  <td className="py-2 px-2.5 font-mono-num font-semibold">{fmt(row.tot)}</td>
                  <td className="py-2 px-2.5 font-mono-num text-[#0f766e]">{fmt(row.rec)}</td>
                  <td
                    className={`py-2 px-2.5 font-mono-num font-bold ${
                      row.bal > 0 ? 'text-amber-700' : 'text-[#0f766e]'
                    }`}
                  >
                    {fmt(row.bal)}
                  </td>
                  <td className="py-2 px-2.5 no-print">
                    <button type="button" onClick={() => onOpenLedger(row.name)} className={btnSoftBlueCls}>
                      <FileText className="w-3 h-3" />
                      <span>{tKey(lang, 'thStatement')}</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {filteredRows.length > 0 && (
            <tfoot className="sticky bottom-0 z-10 bg-slate-100 border-t-2 border-slate-300 shadow-[0_-1px_0_0_#cbd5e1] print:static">
              <tr className="font-bold text-slate-900">
                <td className="py-2.5 px-2.5 bg-slate-100 whitespace-nowrap">
                  {bi(lang, 'الإجمالي', 'Total')} ({filteredRows.length})
                </td>
                <td className="py-2.5 px-2.5 bg-slate-100 font-mono-num">{totals.groupsCount}</td>
                <td className="py-2.5 px-2.5 bg-slate-100 font-mono-num text-[#1d4ed8]">{totals.paxCount}</td>
                <td className="py-2.5 px-2.5 bg-slate-100 font-mono-num">{fmt(totals.vs)}</td>
                <td className="py-2.5 px-2.5 bg-slate-100 font-mono-num">{fmt(totals.ts)}</td>
                <td className="py-2.5 px-2.5 bg-slate-100 font-mono-num">{fmt(totals.tot)}</td>
                <td className="py-2.5 px-2.5 bg-slate-100 font-mono-num text-[#0f766e]">{fmt(totals.rec)}</td>
                <td
                  className={`py-2.5 px-2.5 bg-slate-100 font-mono-num ${
                    totals.bal > 0 ? 'text-amber-700' : 'text-[#0f766e]'
                  }`}
                >
                  {fmt(totals.bal)}
                </td>
                <td className="py-2.5 px-2.5 bg-slate-100 no-print" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Panel>
  );
};

export const SuppliersPage: React.FC<{
  db: AccountingDB;
  lang: Lang;
  onOpenLedger: (name: string) => void;
}> = ({ db, lang, onOpenLedger }) => {
  const names = getPartyNames(db, 'supplier', lang, 'all');

  const catLabel = (c: SupplierCategory) => {
    const map: Record<SupplierCategory, string> = {
      all: tKey(lang, 'catAll'),
      both: tKey(lang, 'catBoth'),
      visa: tKey(lang, 'catVisa'),
      transport: tKey(lang, 'catTrn'),
      hotel: tKey(lang, 'catHtl'),
    };
    return map[c] || map.all;
  };

  return (
    <Panel title={tKey(lang, 'suppDirTitle')}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thSupplier')}</th>
              <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thCat')}</th>
              <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thVisaCosts')}</th>
              <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thTrnCosts')}</th>
              <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thTotalPay')}</th>
              <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thPaid')}</th>
              <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thRemBal')}</th>
              <th className="py-2.5 px-2.5 text-start font-bold no-print">{tKey(lang, 'thStatement')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {names.length === 0 ? (
              <EmptyRow colSpan={8} lang={lang} />
            ) : (
              names.map((name) => {
                const normParty = (val?: string | null) => String(val || '').trim().toLowerCase();
                const key = normParty(name);
                const sup = db.suppliers.find((s) => normParty(s.name) === key);
                const vc = sumBy(
                  db.entries.filter((e) => normParty(e.supplier) === key),
                  (e) => entryVals(e, db.rate).cost
                );
                const tc = sumBy(
                  db.transports.filter((x) => normParty(x.supplier) === key),
                  (x) => trnVals(x, db.rate).cost
                );
                const hc = sumBy(
                  (db.hotels || []).filter((h) => h.status !== 'cancelled' && normParty(h.supplier) === key),
                  (h) => htlVals(h, db.rate).cost
                );
                const inferredCat: SupplierCategory =
                  sup?.category ||
                  (vc > 0 && tc > 0
                    ? 'both'
                    : hc > 0 && vc === 0 && tc === 0
                      ? 'hotel'
                      : tc > 0 && vc === 0
                        ? 'transport'
                        : 'visa');
                const tot = vc + tc + hc;
                const paid = sumBy(
                  db.vouchers.filter((v) => v.type === 'payment' && normParty(v.party) === key),
                  (v) => v.amountSAR
                );
                const bal = tot - paid;
                return (
                  <tr key={name} className="hover:bg-slate-50">
                    <td className="py-2 px-2.5 font-bold text-slate-900">{name}</td>
                    <td className="py-2 px-2.5">{catLabel(inferredCat)}</td>
                    <td className="py-2 px-2.5 font-mono-num">{fmt(vc)}</td>
                    <td className="py-2 px-2.5 font-mono-num">{fmt(tc)}</td>
                    <td className="py-2 px-2.5 font-mono-num font-semibold">{fmt(tot)}</td>
                    <td className="py-2 px-2.5 font-mono-num text-[#0f766e]">{fmt(paid)}</td>
                    <td
                      className={`py-2 px-2.5 font-mono-num font-bold ${
                        bal > 0 ? 'text-red-700' : 'text-[#0f766e]'
                      }`}
                    >
                      {fmt(bal)}
                    </td>
                    <td className="py-2 px-2.5 no-print">
                      <button type="button" onClick={() => onOpenLedger(name)} className={btnSoftBlueCls}>
                        <FileText className="w-3 h-3" />
                        <span>{tKey(lang, 'thStatement')}</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
};

export const CodingPage: React.FC<{
  db: AccountingDB;
  lang: Lang;
  onSaveCustomer: (c: CustomerMaster) => Promise<void>;
  onSaveSupplier: (s: SupplierMaster) => Promise<void>;
  onDeleteMaster: (kind: 'customer' | 'supplier', code: string) => Promise<void>;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
  onConfirm: (cfg: ConfirmConfig) => void;
}> = ({ db, lang, onSaveCustomer, onSaveSupplier, onDeleteMaster, onToast, onConfirm }) => {
  const [custCode, setCustCode] = useState(() => nextCode(db, 'customer'));
  const [custName, setCustName] = useState('');
  const [custNote, setCustNote] = useState('');

  const [suppCode, setSuppCode] = useState(() => nextCode(db, 'supplier'));
  const [suppName, setSuppName] = useState('');
  const [suppCat, setSuppCat] = useState<SupplierCategory>('all');
  const [suppNote, setSuppNote] = useState('');

  useEffect(() => {
    setCustCode(nextCode(db, 'customer'));
  }, [db.customers.length, db]);

  useEffect(() => {
    setSuppCode(nextCode(db, 'supplier'));
  }, [db.suppliers.length, db]);

  const catLabel = (c: SupplierCategory) => {
    const map: Record<SupplierCategory, string> = {
      all: tKey(lang, 'catAll'),
      both: tKey(lang, 'catBoth'),
      visa: tKey(lang, 'catVisa'),
      transport: tKey(lang, 'catTrn'),
      hotel: tKey(lang, 'catHtl'),
    };
    return map[c] || map.all;
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = custName.trim();
    if (!n) return;
    if (db.customers.some((c) => c.name.toLowerCase() === n.toLowerCase())) {
      onToast(bi(lang, 'اسم العميل مسجل مسبقاً', 'Customer name already exists'), 'error');
      return;
    }
    await onSaveCustomer({ code: custCode.trim() || nextCode(db, 'customer'), name: n, note: custNote.trim() });
    setCustName('');
    setCustNote('');
    onToast(bi(lang, 'تم حفظ كود العميل بنجاح', 'Customer code saved'));
  };

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = suppName.trim();
    if (!n) return;
    if (db.suppliers.some((s) => s.name.toLowerCase() === n.toLowerCase())) {
      onToast(bi(lang, 'اسم المورد مسجل مسبقاً', 'Supplier name already exists'), 'error');
      return;
    }
    await onSaveSupplier({
      code: suppCode.trim() || nextCode(db, 'supplier'),
      name: n,
      category: suppCat,
      note: suppNote.trim(),
    });
    setSuppName('');
    setSuppNote('');
    onToast(bi(lang, 'تم حفظ كود المورد بنجاح', 'Supplier code saved'));
  };

  const handleDeleteParty = (kind: 'customer' | 'supplier', code: string, name: string) => {
    const hasLinks =
      kind === 'customer'
        ? db.entries.some((e) => e.customer === name) ||
          db.transports.some((t) => t.customer === name) ||
          db.vouchers.some((v) => v.type === 'receipt' && v.party === name)
        : db.entries.some((e) => e.supplier === name) ||
          db.transports.some((t) => t.supplier === name) ||
          db.vouchers.some((v) => v.type === 'payment' && v.party === name);

    if (hasLinks) {
      onToast(
        bi(lang, 'لا يمكن الحذف لوجود حركات مالية مرتبطة بهذا الطرف', 'Cannot delete: party has linked transactions'),
        'error'
      );
      return;
    }

    onConfirm({
      title: bi(lang, 'حذف كود الطرف', 'Delete Party Code'),
      message: bi(lang, `هل تريد حذف "${name}" (${code})؟`, `Delete "${name}" (${code})?`),
      danger: true,
      onConfirm: async () => {
        await onDeleteMaster(kind, code);
        onToast(bi(lang, 'تم الحذف بنجاح', 'Deleted successfully'));
      },
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Customers Coding */}
      <Panel title={tKey(lang, 'codeCustTitle')}>
        <form onSubmit={handleAddCustomer} className="no-print space-y-3 mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>{tKey(lang, 'lblCode')}</label>
              <input
                type="text"
                required
                value={custCode}
                onChange={(e) => setCustCode(e.target.value)}
                className={`${inputCls} font-mono-num`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>{tKey(lang, 'lblCustomer')}</label>
              <input
                type="text"
                required
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[160px]">
              <label className={labelCls}>{tKey(lang, 'lblNotes')}</label>
              <input type="text" value={custNote} onChange={(e) => setCustNote(e.target.value)} className={inputCls} />
            </div>
            <button type="submit" className={btnPrimaryCls}>
              <Plus className="w-3.5 h-3.5" />
              <span>{tKey(lang, 'btnSaveCust')}</span>
            </button>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'lblCode')}</th>
                <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thCustomer')}</th>
                <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'lblNotes')}</th>
                <th className="py-2 px-2.5 text-start font-bold no-print">{tKey(lang, 'thAction')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {db.customers.length === 0 ? (
                <EmptyRow colSpan={4} lang={lang} />
              ) : (
                db.customers.map((c) => (
                  <tr key={c.code} className="hover:bg-slate-50">
                    <td className="py-2 px-2.5 font-mono-num font-bold">{c.code}</td>
                    <td className="py-2 px-2.5 font-semibold">{c.name}</td>
                    <td className="py-2 px-2.5 text-slate-500">{c.note || '-'}</td>
                    <td className="py-2 px-2.5 no-print">
                      <button
                        type="button"
                        onClick={() => handleDeleteParty('customer', c.code, c.name)}
                        className={btnSoftRedCls}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Suppliers Coding */}
      <Panel title={tKey(lang, 'codeSuppTitle')}>
        <form onSubmit={handleAddSupplier} className="no-print space-y-3 mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>{tKey(lang, 'lblCode')}</label>
              <input
                type="text"
                required
                value={suppCode}
                onChange={(e) => setSuppCode(e.target.value)}
                className={`${inputCls} font-mono-num`}
              />
            </div>
            <div>
              <label className={labelCls}>{tKey(lang, 'thSupplier')}</label>
              <input
                type="text"
                required
                value={suppName}
                onChange={(e) => setSuppName(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{tKey(lang, 'thCat')}</label>
              <select
                value={suppCat}
                onChange={(e) => setSuppCat(e.target.value as SupplierCategory)}
                className={inputCls}
              >
                <option value="all">{tKey(lang, 'catAll')}</option>
                <option value="both">{tKey(lang, 'catBoth')}</option>
                <option value="visa">{tKey(lang, 'catVisa')}</option>
                <option value="transport">{tKey(lang, 'catTrn')}</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[160px]">
              <label className={labelCls}>{tKey(lang, 'lblNotes')}</label>
              <input type="text" value={suppNote} onChange={(e) => setSuppNote(e.target.value)} className={inputCls} />
            </div>
            <button type="submit" className={btnPrimaryCls}>
              <Plus className="w-3.5 h-3.5" />
              <span>{tKey(lang, 'btnSaveSupp')}</span>
            </button>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'lblCode')}</th>
                <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thSupplier')}</th>
                <th className="py-2 px-2.5 text-start font-bold">{tKey(lang, 'thCat')}</th>
                <th className="py-2 px-2.5 text-start font-bold no-print">{tKey(lang, 'thAction')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {db.suppliers.length === 0 ? (
                <EmptyRow colSpan={4} lang={lang} />
              ) : (
                db.suppliers.map((s) => (
                  <tr key={s.code} className="hover:bg-slate-50">
                    <td className="py-2 px-2.5 font-mono-num font-bold">{s.code}</td>
                    <td className="py-2 px-2.5 font-semibold">{s.name}</td>
                    <td className="py-2 px-2.5">{catLabel(s.category)}</td>
                    <td className="py-2 px-2.5 no-print">
                      <button
                        type="button"
                        onClick={() => handleDeleteParty('supplier', s.code, s.name)}
                        className={btnSoftRedCls}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
};
