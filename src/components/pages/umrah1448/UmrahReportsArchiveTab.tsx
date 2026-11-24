import React, { useMemo, useState } from 'react';
import { Archive, ArchiveRestore, BarChart3, Download, Eye, Printer } from 'lucide-react';
import { UmrahGroup } from '../../../types/accounting';
import { bi, tKey } from '../../../i18n/translations';
import { csvDownload, entryVals, fmt, htlVals, sumBy, trnVals } from '../../../utils/calculations';
import {
  EmptyRow,
  KpiCard,
  Panel,
  btnSecondaryCls,
  btnSoftBlueCls,
  inputCls,
} from '../../AccountingUI';
import {
  UMRAH_ARRIVAL_STATUS,
  UMRAH_GROUP_STATUS,
  UMRAH_PROGRAM_LABELS,
  UMRAH_VISA_STATUS,
  UmrahSharedProps,
} from './umrahShared';

interface Props extends UmrahSharedProps {
  mode: 'reports' | 'archive';
}

export const UmrahReportsArchiveTab: React.FC<Props> = ({
  mode,
  db,
  lang,
  onSaveGroup,
  onToast,
}) => {
  const agents = db.umrahAgents || [];
  const groups = db.umrahGroups || [];
  const pilgrims = db.umrahPilgrims || [];
  const flights = db.umrahFlights || [];
  const staff = db.umrahFieldStaff || [];

  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveView, setArchiveView] = useState<'groups' | 'agents'>('groups');
  const [archiveFilter, setArchiveFilter] = useState<'all' | 'archived' | 'active'>('all');
  const [selectedGroupCode, setSelectedGroupCode] = useState<string | null>(null);

  // --- Financial & Operational Aggregations ---
  const analytics = useMemo(() => {
    const pilgrimFeesSAR = sumBy(pilgrims, (p) => Number(p.feeSAR || 0));
    const pilgrimPaidSAR = sumBy(pilgrims, (p) => Number(p.paidSAR || 0));
    const pilgrimDueSAR = Math.max(0, pilgrimFeesSAR - pilgrimPaidSAR);

    const visaEntriesSales = sumBy(db.entries, (e) => entryVals(e, db.rate).sales);
    const visaEntriesCost = sumBy(db.entries, (e) => entryVals(e, db.rate).cost);
    const visaEntriesProfit = visaEntriesSales - visaEntriesCost;

    const umrahGroupVisaEstSales = sumBy(groups, (g) => {
      const cnt = pilgrims.filter((p) => p.groupCode === g.groupCode).length || g.targetPax;
      return cnt * Number(g.visaSellSAR || 0);
    });
    const umrahGroupVisaEstCost = sumBy(groups, (g) => {
      const cnt = pilgrims.filter((p) => p.groupCode === g.groupCode).length || g.targetPax;
      return cnt * Number(g.visaBuySAR || 0);
    });

    const transportSales = sumBy(db.transports, (t) => trnVals(t, db.rate).sales);
    const transportCost = sumBy(db.transports, (t) => trnVals(t, db.rate).cost);
    const transportProfit = transportSales - transportCost;

    const hotelSales = sumBy(db.hotels, (h) => htlVals(h, db.rate).sales);
    const hotelCost = sumBy(db.hotels, (h) => htlVals(h, db.rate).cost);
    const hotelProfit = hotelSales - hotelCost;

    const visasDraft = pilgrims.filter((p) => p.visaStatus === 'draft').length;
    const visasSubmitted = pilgrims.filter((p) => p.visaStatus === 'submitted').length;
    const visasIssued = pilgrims.filter((p) => p.visaStatus === 'issued').length;
    const visasRejected = pilgrims.filter((p) => p.visaStatus === 'rejected').length;

    const arrPending = pilgrims.filter((p) => p.arrivalStatus === 'pending').length;
    const arrInKsa = pilgrims.filter((p) => p.arrivalStatus === 'arrived').length;
    const arrDeparted = pilgrims.filter((p) => p.arrivalStatus === 'departed').length;

    const groupRows = groups.map((g) => {
      const grpPilgrims = pilgrims.filter((p) => p.groupCode === g.groupCode);
      const count = grpPilgrims.length;
      const issued = grpPilgrims.filter((p) => p.visaStatus === 'issued').length;
      const arrived = grpPilgrims.filter((p) => p.arrivalStatus === 'arrived').length;
      const fees = sumBy(grpPilgrims, (p) => Number(p.feeSAR || 0));
      const paid = sumBy(grpPilgrims, (p) => Number(p.paidSAR || 0));
      const estVisaProfit = (count || g.targetPax) * (Number(g.visaSellSAR || 0) - Number(g.visaBuySAR || 0));
      return { group: g, count, issued, arrived, fees, paid, due: Math.max(0, fees - paid), estVisaProfit };
    });

    return {
      pilgrimFeesSAR,
      pilgrimPaidSAR,
      pilgrimDueSAR,
      visaEntriesSales,
      visaEntriesCost,
      visaEntriesProfit,
      umrahGroupVisaEstSales,
      umrahGroupVisaEstCost,
      transportSales,
      transportCost,
      transportProfit,
      hotelSales,
      hotelCost,
      hotelProfit,
      visasDraft,
      visasSubmitted,
      visasIssued,
      visasRejected,
      arrPending,
      arrInKsa,
      arrDeparted,
      groupRows,
    };
  }, [pilgrims, groups, db.entries, db.transports, db.hotels, db.rate]);

  const exportFinancialReportCsv = () => {
    csvDownload('umrah-1448-financial-operations-report.csv', [
      [
        bi(lang, 'كود المجموعة', 'Group Code'),
        bi(lang, 'اسم المجموعة', 'Group Name'),
        bi(lang, 'البرنامج', 'Program'),
        bi(lang, 'الوكيل', 'Agent'),
        bi(lang, 'المستهدف', 'Target Pax'),
        bi(lang, 'المسجلون', 'Registered'),
        bi(lang, 'التأشيرات الصادرة', 'Issued Visas'),
        bi(lang, 'داخل المملكة', 'Arrived'),
        bi(lang, 'رسوم الباقات ر.س', 'Package Fees SAR'),
        bi(lang, 'المحصل ر.س', 'Paid SAR'),
        bi(lang, 'المتبقي ر.س', 'Due SAR'),
        bi(lang, 'ربح التأشيرات التقديري ر.س', 'Est. Visa Profit SAR'),
      ],
      ...analytics.groupRows.map((r) => [
        r.group.groupCode,
        r.group.groupName,
        UMRAH_PROGRAM_LABELS[r.group.programType][lang],
        r.group.agentName,
        r.group.targetPax,
        r.count,
        r.issued,
        r.arrived,
        r.fees.toFixed(2),
        r.paid.toFixed(2),
        r.due.toFixed(2),
        r.estVisaProfit.toFixed(2),
      ]),
    ]);
  };

  // --- Archive Filtering & Actions ---
  const toggleArchiveGroup = async (g: UmrahGroup) => {
    const nextStatus = g.status === 'archived' ? 'completed' : 'archived';
    await onSaveGroup({ ...g, status: nextStatus }, true);
    onToast(
      nextStatus === 'archived'
        ? bi(lang, `تمت أرشفة المجموعة ${g.groupCode}`, `Group ${g.groupCode} archived`)
        : bi(lang, `تمت استعادة المجموعة ${g.groupCode}`, `Group ${g.groupCode} restored`),
      'info'
    );
  };

  const archivedGroupsList = useMemo(() => {
    const q = archiveSearch.trim().toLowerCase();
    return groups.filter((g) => {
      if (archiveFilter === 'archived' && g.status !== 'archived') return false;
      if (archiveFilter === 'active' && g.status === 'archived') return false;
      if (q) {
        const hay = `${g.groupCode} ${g.groupName} ${g.agentName} ${g.supervisorName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [groups, archiveFilter, archiveSearch]);

  const agentHistoryRows = useMemo(() => {
    const q = archiveSearch.trim().toLowerCase();
    const map = new Map<
      string,
      { name: string; country: string; phone: string; groupsCount: number; pilgrimsCount: number; totalFees: number; totalPaid: number }
    >();
    agents.forEach((a) => {
      map.set(a.name, {
        name: a.name,
        country: a.country,
        phone: a.phone,
        groupsCount: 0,
        pilgrimsCount: 0,
        totalFees: 0,
        totalPaid: 0,
      });
    });
    db.customers.forEach((c) => {
      if (c.name && !map.has(c.name)) {
        map.set(c.name, {
          name: c.name,
          country: '-',
          phone: '-',
          groupsCount: 0,
          pilgrimsCount: 0,
          totalFees: 0,
          totalPaid: 0,
        });
      }
    });
    groups.forEach((g) => {
      if (!g.agentName) return;
      const cur = map.get(g.agentName) || {
        name: g.agentName,
        country: '-',
        phone: '-',
        groupsCount: 0,
        pilgrimsCount: 0,
        totalFees: 0,
        totalPaid: 0,
      };
      cur.groupsCount += 1;
      map.set(g.agentName, cur);
    });
    pilgrims.forEach((p) => {
      if (!p.agentName) return;
      const cur = map.get(p.agentName) || {
        name: p.agentName,
        country: '-',
        phone: '-',
        groupsCount: 0,
        pilgrimsCount: 0,
        totalFees: 0,
        totalPaid: 0,
      };
      cur.pilgrimsCount += 1;
      cur.totalFees += Number(p.feeSAR || 0);
      cur.totalPaid += Number(p.paidSAR || 0);
      map.set(p.agentName, cur);
    });
    return Array.from(map.values()).filter((r) => !q || `${r.name} ${r.country} ${r.phone}`.toLowerCase().includes(q));
  }, [agents, db.customers, groups, pilgrims, archiveSearch]);

  const selectedDossier = useMemo(() => {
    if (!selectedGroupCode) return null;
    const grp = groups.find((g) => g.groupCode === selectedGroupCode) || null;
    const grpPilgrims = pilgrims.filter((p) => p.groupCode === selectedGroupCode);
    const grpFlights = flights.filter((f) => f.groupCode === selectedGroupCode);
    const grpTransport = db.transports.filter((t) => t.groupNo === selectedGroupCode);
    return { grp, grpPilgrims, grpFlights, grpTransport };
  }, [selectedGroupCode, groups, pilgrims, flights, db.transports]);

  const exportArchiveCsv = () => {
    if (archiveView === 'agents') {
      csvDownload('umrah-1448-clients-archive.csv', [
        [
          bi(lang, 'الشركة / العميل', 'Agent / Client'),
          bi(lang, 'الدولة', 'Country'),
          bi(lang, 'الجوال', 'Phone'),
          bi(lang, 'عدد المجموعات', 'Groups'),
          bi(lang, 'عدد المعتمرين', 'Pilgrims'),
          bi(lang, 'إجمالي الرسوم ر.س', 'Total Fees SAR'),
          bi(lang, 'المحصل ر.س', 'Paid SAR'),
        ],
        ...agentHistoryRows.map((r) => [
          r.name,
          r.country,
          r.phone,
          r.groupsCount,
          r.pilgrimsCount,
          r.totalFees.toFixed(2),
          r.totalPaid.toFixed(2),
        ]),
      ]);
      return;
    }
    csvDownload('umrah-1448-groups-archive.csv', [
      [
        bi(lang, 'كود المجموعة', 'Group Code'),
        bi(lang, 'اسم المجموعة', 'Group Name'),
        bi(lang, 'الموسم', 'Season'),
        bi(lang, 'الوكيل', 'Agent'),
        bi(lang, 'المعتمرون', 'Pilgrims'),
        bi(lang, 'الوصول', 'Arrival'),
        bi(lang, 'المغادرة', 'Departure'),
        bi(lang, 'الحالة', 'Status'),
      ],
      ...archivedGroupsList.map((g) => [
        g.groupCode,
        g.groupName,
        g.season,
        g.agentName,
        pilgrims.filter((p) => p.groupCode === g.groupCode).length,
        g.arrivalDate,
        g.departureDate,
        UMRAH_GROUP_STATUS[g.status][lang],
      ]),
    ]);
  };

  if (mode === 'archive') {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <KpiCard label={bi(lang, 'إجمالي المجموعات', 'All Groups')} value={groups.length} tone="slate" />
          <KpiCard
            label={bi(lang, 'المجموعات المؤرشفة', 'Archived Groups')}
            value={groups.filter((g) => g.status === 'archived').length}
            tone="amber"
          />
          <KpiCard label={bi(lang, 'العملاء والوكلاء', 'Clients & Agents')} value={agentHistoryRows.length} tone="blue" />
          <KpiCard label={bi(lang, 'إجمالي سجلات المعتمرين', 'Pilgrim Records')} value={pilgrims.length} tone="teal" />
        </div>

        <Panel
          title={
            <span className="flex items-center gap-2">
              <Archive className="w-4 h-4 text-[#1d4ed8]" />
              {bi(lang, 'الأرشيف الكامل للمجموعات والشركات والعملاء (موسم 1448)', 'Complete Groups & Clients Archive')}
            </span>
          }
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setArchiveView('groups')}
                className={
                  archiveView === 'groups'
                    ? 'px-3 h-8 rounded-lg bg-[#1d4ed8] text-white text-xs font-semibold cursor-pointer'
                    : btnSecondaryCls
                }
              >
                {bi(lang, 'أرشيف المجموعات', 'Groups Archive')}
              </button>
              <button
                type="button"
                onClick={() => setArchiveView('agents')}
                className={
                  archiveView === 'agents'
                    ? 'px-3 h-8 rounded-lg bg-[#1d4ed8] text-white text-xs font-semibold cursor-pointer'
                    : btnSecondaryCls
                }
              >
                {bi(lang, 'أرشيف العملاء والوكلاء', 'Clients Archive')}
              </button>
              <button type="button" onClick={exportArchiveCsv} className={btnSecondaryCls}>
                <Download className="w-3.5 h-3.5" />
                <span>{tKey(lang, 'exportCsv')}</span>
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <input
              type="text"
              value={archiveSearch}
              onChange={(e) => setArchiveSearch(e.target.value)}
              placeholder={bi(lang, 'بحث في الأرشيف بالكود أو الاسم أو الوكيل...', 'Search archive...')}
              className={`${inputCls} sm:col-span-2`}
            />
            {archiveView === 'groups' && (
              <select
                value={archiveFilter}
                onChange={(e) => setArchiveFilter(e.target.value as 'all' | 'archived' | 'active')}
                className={inputCls}
              >
                <option value="all">{bi(lang, 'كل المجموعات (نشط ومؤرشف)', 'All Groups')}</option>
                <option value="archived">{bi(lang, 'المؤرشفة فقط', 'Archived Only')}</option>
                <option value="active">{bi(lang, 'النشطة / المكتملة فقط', 'Non-Archived Only')}</option>
              </select>
            )}
          </div>

          {archiveView === 'groups' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-y border-slate-200 text-slate-600">
                    <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'الكود والمجموعة', 'Group')}</th>
                    <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'الوكيل', 'Agent')}</th>
                    <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'المعتمرون', 'Pilgrims')}</th>
                    <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'الرحلات والنقل', 'Flights & Buses')}</th>
                    <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'الحالة', 'Status')}</th>
                    <th className="py-2.5 px-3 text-end font-semibold">{bi(lang, 'ملف المجموعة وأرشفة', 'Dossier & Archive')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {archivedGroupsList.length === 0 ? (
                    <EmptyRow colSpan={6} lang={lang} />
                  ) : (
                    archivedGroupsList.map((g) => {
                      const st = UMRAH_GROUP_STATUS[g.status];
                      const pCnt = pilgrims.filter((p) => p.groupCode === g.groupCode).length;
                      const fCnt = flights.filter((f) => f.groupCode === g.groupCode).length;
                      const tCnt = db.transports.filter((t) => t.groupNo === g.groupCode).length;
                      return (
                        <tr key={g.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900 font-mono-num">{g.groupCode}</div>
                            <div className="text-[11px] text-slate-500">{g.groupName}</div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">{g.agentName}</td>
                          <td className="py-2.5 px-3 font-mono-num">
                            {pCnt} / {g.targetPax}
                          </td>
                          <td className="py-2.5 px-3 font-mono-num text-slate-600">
                            {fCnt} {bi(lang, 'رحلة', 'flt')} · {tCnt} {bi(lang, 'نقل', 'bus')}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${st.cls}`}>
                              {st[lang]}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-end">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedGroupCode((prev) => (prev === g.groupCode ? null : g.groupCode))
                                }
                                className={btnSoftBlueCls}
                              >
                                <Eye className="w-3 h-3" />
                                <span>{bi(lang, 'فتح الملف', 'Dossier')}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => void toggleArchiveGroup(g)}
                                className="inline-flex items-center gap-1 px-2.5 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold cursor-pointer"
                              >
                                {g.status === 'archived' ? (
                                  <>
                                    <ArchiveRestore className="w-3 h-3" />
                                    <span>{bi(lang, 'استعادة', 'Restore')}</span>
                                  </>
                                ) : (
                                  <>
                                    <Archive className="w-3 h-3" />
                                    <span>{bi(lang, 'أرشفة', 'Archive')}</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-y border-slate-200 text-slate-600">
                    <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'الوكيل / العميل', 'Agent / Client')}</th>
                    <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'الدولة والجوال', 'Country & Phone')}</th>
                    <th className="py-2.5 px-3 text-center font-semibold">{bi(lang, 'المجموعات', 'Groups')}</th>
                    <th className="py-2.5 px-3 text-center font-semibold">{bi(lang, 'المعتمرون', 'Pilgrims')}</th>
                    <th className="py-2.5 px-3 text-end font-semibold">{bi(lang, 'إجمالي الفوترة ر.س', 'Total Billed')}</th>
                    <th className="py-2.5 px-3 text-end font-semibold">{bi(lang, 'المحصل ر.س', 'Collected')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agentHistoryRows.length === 0 ? (
                    <EmptyRow colSpan={6} lang={lang} />
                  ) : (
                    agentHistoryRows.map((r) => (
                      <tr key={r.name} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 font-semibold text-slate-900">{r.name}</td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {r.country} {r.phone !== '-' ? `· ${r.phone}` : ''}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono-num">{r.groupsCount}</td>
                        <td className="py-2.5 px-3 text-center font-mono-num">{r.pilgrimsCount}</td>
                        <td className="py-2.5 px-3 text-end font-mono-num font-semibold">{fmt(r.totalFees)}</td>
                        <td className="py-2.5 px-3 text-end font-mono-num text-[#0f766e] font-semibold">
                          {fmt(r.totalPaid)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* Full Group Dossier Drill-down */}
        {selectedDossier && selectedDossier.grp && (
          <Panel
            title={bi(
              lang,
              `الملف الشامل للمجموعة: ${selectedDossier.grp.groupCode} — ${selectedDossier.grp.groupName}`,
              `Group Dossier: ${selectedDossier.grp.groupCode}`
            )}
            actions={
              <button type="button" onClick={() => setSelectedGroupCode(null)} className={btnSecondaryCls}>
                {bi(lang, 'إغلاق الملف', 'Close')}
              </button>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/60 space-y-1.5">
                <div className="font-bold text-slate-900">{bi(lang, 'بيانات المجموعة', 'Group Info')}</div>
                <div>{bi(lang, 'الوكيل:', 'Agent:')} {selectedDossier.grp.agentName}</div>
                <div>{bi(lang, 'المشرف:', 'Supervisor:')} {selectedDossier.grp.supervisorName || '-'}</div>
                <div className="font-mono-num">
                  {selectedDossier.grp.arrivalDate} → {selectedDossier.grp.departureDate || '-'}
                </div>
              </div>
              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/60 space-y-1.5">
                <div className="font-bold text-slate-900">
                  {bi(lang, `الرحلات الجوية (${selectedDossier.grpFlights.length})`, `Flights (${selectedDossier.grpFlights.length})`)}
                </div>
                {selectedDossier.grpFlights.length === 0 ? (
                  <div className="text-slate-400">{bi(lang, 'لا توجد رحلات مربوطة', 'No linked flights')}</div>
                ) : (
                  selectedDossier.grpFlights.map((f) => (
                    <div key={f.id} className="font-mono-num text-slate-700">
                      {f.flightNo} · {f.flightDate} ({f.originAirport}→{f.destAirport})
                    </div>
                  ))
                )}
              </div>
              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/60 space-y-1.5">
                <div className="font-bold text-slate-900">
                  {bi(lang, `النقل والحافلات (${selectedDossier.grpTransport.length})`, `Transport (${selectedDossier.grpTransport.length})`)}
                </div>
                {selectedDossier.grpTransport.length === 0 ? (
                  <div className="text-slate-400">{bi(lang, 'لا توجد رحلات نقل مربوطة', 'No linked transport')}</div>
                ) : (
                  selectedDossier.grpTransport.map((t) => (
                    <div key={t.id} className="text-slate-700">
                      {t.route} · {t.vehicleCount}× {t.vehicleType}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-y border-slate-200 text-slate-600">
                    <th className="py-2 px-3 text-start font-semibold">{bi(lang, 'المعتمر', 'Pilgrim')}</th>
                    <th className="py-2 px-3 text-start font-semibold">{bi(lang, 'الجواز', 'Passport')}</th>
                    <th className="py-2 px-3 text-start font-semibold">{bi(lang, 'التأشيرة', 'Visa')}</th>
                    <th className="py-2 px-3 text-start font-semibold">{bi(lang, 'فندق مكة / المدينة', 'Hotels')}</th>
                    <th className="py-2 px-3 text-start font-semibold">{bi(lang, 'الحركة', 'Movement')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedDossier.grpPilgrims.length === 0 ? (
                    <EmptyRow colSpan={5} lang={lang} />
                  ) : (
                    selectedDossier.grpPilgrims.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2 px-3 font-semibold">{p.fullName}</td>
                        <td className="py-2 px-3 font-mono-num">{p.passportNo}</td>
                        <td className="py-2 px-3 font-mono-num">
                          {p.visaNo || '-'} ({UMRAH_VISA_STATUS[p.visaStatus][lang]})
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {p.makkahHotel || '-'} / {p.madinahHotel || '-'}
                        </td>
                        <td className="py-2 px-3">{UMRAH_ARRIVAL_STATUS[p.arrivalStatus][lang]}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </div>
    );
  }

  // --- Mode: Financial & Operational Reports ---
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <KpiCard
          label={bi(lang, 'إجمالي باقات المعتمرين', 'Total Pilgrim Package Fees')}
          value={`${fmt(analytics.pilgrimFeesSAR)} ${bi(lang, 'ر.س', 'SAR')}`}
          sub={`${bi(lang, 'المحصل:', 'Paid:')} ${fmt(analytics.pilgrimPaidSAR)}`}
          tone="blue"
        />
        <KpiCard
          label={bi(lang, 'متبقي تحصيل المعتمرين', 'Pilgrim Receivables')}
          value={`${fmt(analytics.pilgrimDueSAR)} ${bi(lang, 'ر.س', 'SAR')}`}
          tone="amber"
        />
        <KpiCard
          label={bi(lang, 'صافي ربح التأشيرات العام', 'Visa Register Net Profit')}
          value={`${fmt(analytics.visaEntriesProfit)} ${bi(lang, 'ر.س', 'SAR')}`}
          sub={`${bi(lang, 'المبيعات:', 'Sales:')} ${fmt(analytics.visaEntriesSales)}`}
          tone="teal"
        />
        <KpiCard
          label={bi(lang, 'ربح النقل والفنادق المسجل', 'Transport + Hotels Profit')}
          value={`${fmt(analytics.transportProfit + analytics.hotelProfit)} ${bi(lang, 'ر.س', 'SAR')}`}
          sub={`${bi(lang, 'النقل:', 'Trn:')} ${fmt(analytics.transportProfit)} · ${bi(lang, 'الفنادق:', 'Htl:')} ${fmt(analytics.hotelProfit)}`}
          tone="emerald"
        />
      </div>

      {/* Operational Health Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title={bi(lang, 'موقف إصدار تأشيرات العمرة 1448', 'Umrah 1448 Visa Issuance Pipeline')}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
              <div className="text-[11px] text-slate-500">{UMRAH_VISA_STATUS.draft[lang]}</div>
              <div className="text-lg font-bold text-slate-800 font-mono-num mt-1">{analytics.visasDraft}</div>
            </div>
            <div className="border border-slate-200 rounded-xl p-3 bg-blue-50/60">
              <div className="text-[11px] text-[#1d4ed8]">{UMRAH_VISA_STATUS.submitted[lang]}</div>
              <div className="text-lg font-bold text-[#1d4ed8] font-mono-num mt-1">{analytics.visasSubmitted}</div>
            </div>
            <div className="border border-slate-200 rounded-xl p-3 bg-teal-50/70">
              <div className="text-[11px] text-[#0f766e]">{UMRAH_VISA_STATUS.issued[lang]}</div>
              <div className="text-lg font-bold text-[#0f766e] font-mono-num mt-1">{analytics.visasIssued}</div>
            </div>
            <div className="border border-slate-200 rounded-xl p-3 bg-red-50/60">
              <div className="text-[11px] text-red-700">{UMRAH_VISA_STATUS.rejected[lang]}</div>
              <div className="text-lg font-bold text-red-700 font-mono-num mt-1">{analytics.visasRejected}</div>
            </div>
          </div>
        </Panel>

        <Panel title={bi(lang, 'تقرير التشغيل الميداني والوصول والمغادرة', 'Field Operations & Arrival Status')}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="border border-slate-200 rounded-xl p-3 bg-amber-50/60">
              <div className="text-[11px] text-amber-800">{bi(lang, 'بانتظار الوصول', 'Pending')}</div>
              <div className="text-lg font-bold text-amber-800 font-mono-num mt-1">{analytics.arrPending}</div>
            </div>
            <div className="border border-slate-200 rounded-xl p-3 bg-teal-50/70">
              <div className="text-[11px] text-[#0f766e]">{bi(lang, 'داخل المملكة', 'In KSA')}</div>
              <div className="text-lg font-bold text-[#0f766e] font-mono-num mt-1">{analytics.arrInKsa}</div>
            </div>
            <div className="border border-slate-200 rounded-xl p-3 bg-blue-50/60">
              <div className="text-[11px] text-[#1d4ed8]">{bi(lang, 'غادروا بسلام', 'Departed')}</div>
              <div className="text-lg font-bold text-[#1d4ed8] font-mono-num mt-1">{analytics.arrDeparted}</div>
            </div>
            <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
              <div className="text-[11px] text-slate-600">{bi(lang, 'المشرفون / الرحلات', 'Staff / Flights')}</div>
              <div className="text-lg font-bold text-slate-800 font-mono-num mt-1">
                {staff.length} / {flights.length}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* Group-by-Group Financial & Operational Summary */}
      <Panel
        title={
          <span className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#1d4ed8]" />
            {bi(lang, 'التقرير المالي والتشغيلي التفصيلي حسب المجموعة', 'Group-Level Financial & Operational Report')}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <button type="button" onClick={exportFinancialReportCsv} className={btnSecondaryCls}>
              <Download className="w-3.5 h-3.5" />
              <span>{tKey(lang, 'exportCsv')}</span>
            </button>
            <button type="button" onClick={() => window.print()} className={btnSecondaryCls}>
              <Printer className="w-3.5 h-3.5" />
              <span>{tKey(lang, 'btnPrint')}</span>
            </button>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-y border-slate-200 text-slate-600">
                <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'المجموعة والوكيل', 'Group & Agent')}</th>
                <th className="py-2.5 px-3 text-center font-semibold">{bi(lang, 'المعتمرون', 'Registered / Target')}</th>
                <th className="py-2.5 px-3 text-center font-semibold">{bi(lang, 'تأشيرات صادرة', 'Issued')}</th>
                <th className="py-2.5 px-3 text-center font-semibold">{bi(lang, 'وصلوا', 'Arrived')}</th>
                <th className="py-2.5 px-3 text-end font-semibold">{bi(lang, 'إجمالي الباقات ر.س', 'Total Fees')}</th>
                <th className="py-2.5 px-3 text-end font-semibold">{bi(lang, 'المحصل / المتبقي ر.س', 'Paid / Due')}</th>
                <th className="py-2.5 px-3 text-end font-semibold">{bi(lang, 'ربح التأشيرات التقديري', 'Est. Visa Profit')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {analytics.groupRows.length === 0 ? (
                <EmptyRow colSpan={7} lang={lang} />
              ) : (
                analytics.groupRows.map((r) => (
                  <tr key={r.group.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900 font-mono-num">{r.group.groupCode}</div>
                      <div className="text-[11px] text-slate-500">
                        {r.group.groupName} · {r.group.agentName}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono-num">
                      {r.count} / {r.group.targetPax}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono-num text-[#0f766e] font-semibold">{r.issued}</td>
                    <td className="py-2.5 px-3 text-center font-mono-num text-[#1d4ed8] font-semibold">{r.arrived}</td>
                    <td className="py-2.5 px-3 text-end font-mono-num font-semibold">{fmt(r.fees)}</td>
                    <td className="py-2.5 px-3 text-end font-mono-num">
                      <span className="text-[#0f766e]">{fmt(r.paid)}</span>
                      <span className="text-slate-400"> / </span>
                      <span className={r.due > 0 ? 'text-amber-700 font-semibold' : 'text-slate-400'}>
                        {fmt(r.due)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-end font-mono-num font-bold text-[#0f766e]">
                      {fmt(r.estVisaProfit)}
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
