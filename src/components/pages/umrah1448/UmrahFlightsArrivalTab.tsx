import React, { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, Download, Edit3, Plane, Plus, Trash2 } from 'lucide-react';
import {
  UmrahArrivalStatus,
  UmrahFlight,
  UmrahFlightStatus,
  UmrahPilgrim,
} from '../../../types/accounting';
import { bi, tKey } from '../../../i18n/translations';
import { csvDownload, normalizeTime24, sumBy, today } from '../../../utils/calculations';
import {
  EmptyRow,
  KpiCard,
  Panel,
  Time24Input,
  btnPrimaryCls,
  btnSecondaryCls,
  btnSoftBlueCls,
  btnSoftRedCls,
  btnTealCls,
  inputCls,
  labelCls,
} from '../../AccountingUI';
import {
  UMRAH_ARRIVAL_STATUS,
  UMRAH_FLIGHT_STATUS,
  UmrahSharedProps,
} from './umrahShared';

interface Props extends UmrahSharedProps {
  mode: 'flights' | 'arrivals';
}

export const UmrahFlightsArrivalTab: React.FC<Props> = ({
  mode,
  db,
  lang,
  onSaveFlight,
  onDeleteFlight,
  onSavePilgrim,
  onToast,
  onConfirm,
}) => {
  const flights = db.umrahFlights || [];
  const groups = db.umrahGroups || [];
  const pilgrims = db.umrahPilgrims || [];
  const staffList = db.umrahFieldStaff || [];

  // Flight Form State
  const [editId, setEditId] = useState<number | null>(null);
  const [flightNo, setFlightNo] = useState('');
  const [airline, setAirline] = useState('الخطوط السعودية');
  const [direction, setDirection] = useState<'arrival' | 'departure'>('arrival');
  const [originAirport, setOriginAirport] = useState('CAI');
  const [destAirport, setDestAirport] = useState('JED');
  const [flightDate, setFlightDate] = useState(today());
  const [flightTime, setFlightTime] = useState('14:30');
  const [terminal, setTerminal] = useState('الصالة الشمالية / الحجاج');
  const [groupCode, setGroupCode] = useState('');
  const [paxCount, setPaxCount] = useState('45');
  const [busAssigned, setBusAssigned] = useState('');
  const [supervisorName, setSupervisorName] = useState('');
  const [status, setStatus] = useState<UmrahFlightStatus>('scheduled');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Filters
  const [fltDirection, setFltDirection] = useState<'all' | 'arrival' | 'departure'>('all');
  const [fltStatus, setFltStatus] = useState<'all' | UmrahFlightStatus>('all');
  const [fltGroup, setFltGroup] = useState('all');
  const [fltSearch, setFltSearch] = useState('');

  // Arrival/Departure Pilgrim Filters
  const [arrGroupFilter, setArrGroupFilter] = useState('all');
  const [arrStatusFilter, setArrStatusFilter] = useState<'all' | UmrahArrivalStatus>('all');
  const [arrSearch, setArrSearch] = useState('');
  const [busyPilgrimId, setBusyPilgrimId] = useState<number | null>(null);

  const groupCodes = useMemo(() => {
    const s = new Set<string>();
    groups.forEach((g) => g.groupCode && s.add(g.groupCode));
    db.entries.forEach((e) => e.groupNo && s.add(e.groupNo));
    pilgrims.forEach((p) => p.groupCode && s.add(p.groupCode));
    return Array.from(s);
  }, [groups, db.entries, pilgrims]);

  const supervisorNames = useMemo(() => {
    const s = new Set<string>();
    staffList.forEach((st) => st.name && s.add(st.name));
    db.employees.forEach((e) => e.name && s.add(e.name));
    return Array.from(s);
  }, [staffList, db.employees]);

  const resetFlightForm = () => {
    setEditId(null);
    setFlightNo('');
    setAirline('الخطوط السعودية');
    setDirection('arrival');
    setOriginAirport('CAI');
    setDestAirport('JED');
    setFlightDate(today());
    setFlightTime('14:30');
    setTerminal('الصالة الشمالية / الحجاج');
    setGroupCode('');
    setPaxCount('45');
    setBusAssigned('');
    setSupervisorName('');
    setStatus('scheduled');
    setNotes('');
  };

  const handleEditFlight = (f: UmrahFlight) => {
    setEditId(f.id);
    setFlightNo(f.flightNo);
    setAirline(f.airline);
    setDirection(f.direction);
    setOriginAirport(f.originAirport);
    setDestAirport(f.destAirport);
    setFlightDate(f.flightDate);
    setFlightTime(normalizeTime24(f.flightTime));
    setTerminal(f.terminal);
    setGroupCode(f.groupCode);
    setPaxCount(String(f.paxCount));
    setBusAssigned(f.busAssigned);
    setSupervisorName(f.supervisorName);
    setStatus(f.status);
    setNotes(f.notes);
  };

  const handleSaveFlight = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNo = flightNo.trim();
    const cleanAirline = airline.trim();
    if (!cleanNo || !cleanAirline) {
      onToast(bi(lang, 'يرجى إدخال رقم الرحلة وشركة الطيران', 'Please enter flight number and airline'), 'error');
      return;
    }
    setSaving(true);
    try {
      const payload: UmrahFlight = {
        id: editId ?? Date.now(),
        flightNo: cleanNo,
        airline: cleanAirline,
        direction,
        originAirport: originAirport.trim(),
        destAirport: destAirport.trim(),
        flightDate: flightDate || today(),
        flightTime: normalizeTime24(flightTime.trim()),
        terminal: terminal.trim(),
        groupCode: groupCode.trim(),
        paxCount: Math.max(0, Math.round(Number(paxCount || 0))),
        busAssigned: busAssigned.trim(),
        supervisorName: supervisorName.trim(),
        status,
        notes: notes.trim(),
      };
      await onSaveFlight(payload, editId !== null);
      onToast(
        editId !== null
          ? bi(lang, 'تم تحديث بيانات الرحلة بنجاح', 'Flight updated')
          : bi(lang, 'تم تسجيل الرحلة بنجاح', 'Flight saved')
      );
      resetFlightForm();
    } finally {
      setSaving(false);
    }
  };

  const handleFlightStatusChange = async (f: UmrahFlight, nextStatus: UmrahFlightStatus) => {
    await onSaveFlight({ ...f, status: nextStatus }, true);
    onToast(bi(lang, 'تم تحديث حالة الرحلة', 'Flight status updated'), 'info');
  };

  const handleDeleteFlightConfirm = (f: UmrahFlight) => {
    onConfirm({
      title: bi(lang, 'حذف الرحلة', 'Delete Flight'),
      message: bi(lang, `هل تريد حذف الرحلة ${f.flightNo}؟`, `Delete flight ${f.flightNo}?`),
      danger: true,
      onConfirm: async () => {
        await onDeleteFlight(f.id);
        onToast(bi(lang, 'تم حذف الرحلة', 'Flight deleted'), 'info');
      },
    });
  };

  const filteredFlights = useMemo(() => {
    const q = fltSearch.trim().toLowerCase();
    return flights
      .filter((f) => {
        if (fltDirection !== 'all' && f.direction !== fltDirection) return false;
        if (fltStatus !== 'all' && f.status !== fltStatus) return false;
        if (fltGroup !== 'all' && f.groupCode !== fltGroup) return false;
        if (q) {
          const hay = `${f.flightNo} ${f.airline} ${f.originAirport} ${f.destAirport} ${f.groupCode} ${f.busAssigned} ${f.supervisorName}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => a.flightDate.localeCompare(b.flightDate) || a.flightTime.localeCompare(b.flightTime));
  }, [flights, fltDirection, fltStatus, fltGroup, fltSearch]);

  const exportFlightsCsv = () => {
    csvDownload('umrah-1448-flights.csv', [
      [
        bi(lang, 'رقم الرحلة', 'Flight No'),
        bi(lang, 'الطيران', 'Airline'),
        bi(lang, 'الاتجاه', 'Direction'),
        bi(lang, 'من', 'Origin'),
        bi(lang, 'إلى', 'Destination'),
        bi(lang, 'التاريخ', 'Date'),
        bi(lang, 'الوقت', 'Time'),
        bi(lang, 'الصالة', 'Terminal'),
        bi(lang, 'المجموعة', 'Group'),
        bi(lang, 'الركاب', 'Pax'),
        bi(lang, 'الحافلة', 'Bus'),
        bi(lang, 'المشرف', 'Supervisor'),
        bi(lang, 'الحالة', 'Status'),
      ],
      ...filteredFlights.map((f) => [
        f.flightNo,
        f.airline,
        f.direction === 'arrival' ? bi(lang, 'وصول', 'Arrival') : bi(lang, 'مغادرة', 'Departure'),
        f.originAirport,
        f.destAirport,
        f.flightDate,
        normalizeTime24(f.flightTime),
        f.terminal,
        f.groupCode,
        f.paxCount,
        f.busAssigned,
        f.supervisorName,
        UMRAH_FLIGHT_STATUS[f.status][lang],
      ]),
    ]);
  };

  // --- Arrival / Departure Manifest Actions ---
  const todayStr = today();
  const arrivalsCount = flights.filter((f) => f.direction === 'arrival').length;
  const departuresCount = flights.filter((f) => f.direction === 'departure').length;
  const landedCount = flights.filter((f) => f.status === 'landed').length;
  const totalFlightPax = sumBy(flights, (f) => Number(f.paxCount || 0));

  const pilgrimsPending = pilgrims.filter((p) => p.arrivalStatus === 'pending').length;
  const pilgrimsArrived = pilgrims.filter((p) => p.arrivalStatus === 'arrived').length;
  const pilgrimsDeparted = pilgrims.filter((p) => p.arrivalStatus === 'departed').length;
  const flightsToday = flights.filter((f) => f.flightDate === todayStr);

  const filteredManifest = useMemo(() => {
    const q = arrSearch.trim().toLowerCase();
    return pilgrims.filter((p) => {
      if (arrGroupFilter !== 'all' && p.groupCode !== arrGroupFilter) return false;
      if (arrStatusFilter !== 'all' && p.arrivalStatus !== arrStatusFilter) return false;
      if (q) {
        const hay = `${p.fullName} ${p.passportNo} ${p.visaNo} ${p.flightNo} ${p.busNo} ${p.groupCode}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [pilgrims, arrGroupFilter, arrStatusFilter, arrSearch]);

  const updatePilgrimArrival = async (p: UmrahPilgrim, nextStatus: UmrahArrivalStatus) => {
    setBusyPilgrimId(p.id);
    try {
      await onSavePilgrim({ ...p, arrivalStatus: nextStatus }, true);
      onToast(
        bi(lang, `تم تحديث حركة ${p.fullName} إلى: ${UMRAH_ARRIVAL_STATUS[nextStatus].ar}`, `Updated ${p.fullName} to ${UMRAH_ARRIVAL_STATUS[nextStatus].en}`),
        'info'
      );
    } finally {
      setBusyPilgrimId(null);
    }
  };

  const batchMarkGroupArrival = async (nextStatus: UmrahArrivalStatus) => {
    if (arrGroupFilter === 'all') {
      onToast(bi(lang, 'اختر مجموعة محددة أولاً للتحديث الجماعي', 'Select a specific group first for batch update'), 'error');
      return;
    }
    const targets = filteredManifest.filter((p) => p.arrivalStatus !== nextStatus);
    if (targets.length === 0) {
      onToast(bi(lang, 'جميع معتمرى التصفية على نفس الحالة بالفعل', 'All filtered pilgrims already have this status'), 'info');
      return;
    }
    onConfirm({
      title: bi(lang, 'تحديث جماعي لحركة الوصول والمغادرة', 'Batch Arrival/Departure Update'),
      message: bi(
        lang,
        `سيتم تحديث حالة ${targets.length} معتمر إلى "${UMRAH_ARRIVAL_STATUS[nextStatus].ar}"، هل تود المتابعة؟`,
        `Update ${targets.length} pilgrims to "${UMRAH_ARRIVAL_STATUS[nextStatus].en}"?`
      ),
      onConfirm: async () => {
        for (const p of targets) {
          await onSavePilgrim({ ...p, arrivalStatus: nextStatus }, true);
        }
        onToast(bi(lang, `تم تحديث ${targets.length} معتمر بنجاح`, `Updated ${targets.length} pilgrims`));
      },
    });
  };

  const exportManifestCsv = () => {
    csvDownload('umrah-1448-arrival-departure.csv', [
      [
        bi(lang, 'المعتمر', 'Pilgrim'),
        bi(lang, 'رقم الجواز', 'Passport'),
        bi(lang, 'رقم التأشيرة', 'Visa No'),
        bi(lang, 'المجموعة', 'Group'),
        bi(lang, 'رقم الرحلة', 'Flight No'),
        bi(lang, 'رقم الحافلة', 'Bus No'),
        bi(lang, 'حالة الوصول والمغادرة', 'Movement Status'),
      ],
      ...filteredManifest.map((p) => [
        p.fullName,
        p.passportNo,
        p.visaNo,
        p.groupCode,
        p.flightNo,
        p.busNo,
        UMRAH_ARRIVAL_STATUS[p.arrivalStatus][lang],
      ]),
    ]);
  };

  if (mode === 'arrivals') {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <KpiCard label={bi(lang, 'بانتظار الوصول', 'Pending Arrival')} value={pilgrimsPending} tone="amber" />
          <KpiCard label={bi(lang, 'داخل المملكة (وصلوا)', 'Arrived in KSA')} value={pilgrimsArrived} tone="teal" />
          <KpiCard label={bi(lang, 'تمت المغادرة بسلام', 'Departed')} value={pilgrimsDeparted} tone="blue" />
          <KpiCard
            label={bi(lang, 'رحلات اليوم', "Today's Flights")}
            value={flightsToday.length}
            sub={todayStr}
            tone="slate"
          />
        </div>

        {/* Today's Flights Quick Strip */}
        <Panel title={bi(lang, 'جدول حركة الطيران القريبة / اليوم', 'Flight Movement Feed')}>
          {flights.length === 0 ? (
            <div className="text-xs text-slate-400 py-4 text-center">
              {bi(lang, 'لم يتم تسجيل رحلات طيران بعد من تبويب الطيران والرحلات', 'No flights scheduled yet')}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {flights.slice(0, 6).map((f) => {
                const st = UMRAH_FLIGHT_STATUS[f.status];
                return (
                  <div key={f.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50/70 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-bold text-slate-900 text-xs font-mono-num">
                        {f.direction === 'arrival' ? (
                          <ArrowDownLeft className="w-4 h-4 text-[#0f766e]" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4 text-[#1d4ed8]" />
                        )}
                        <span>{f.flightNo}</span>
                        <span className="text-slate-400 font-normal">· {f.airline}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${st.cls}`}>{st[lang]}</span>
                    </div>
                    <div className="text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2 font-mono-num">
                      <span>
                        {f.originAirport || '-'} → {f.destAirport || '-'}
                      </span>
                      <span>
                        {f.flightDate} · {normalizeTime24(f.flightTime) || '--:--'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center justify-between gap-2">
                      <span>
                        {bi(lang, 'المجموعة:', 'Group:')} <strong className="text-slate-800">{f.groupCode || '-'}</strong> ({f.paxCount})
                      </span>
                      <span>{f.busAssigned ? `${bi(lang, 'حافلة:', 'Bus:')} ${f.busAssigned}` : ''}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {/* Pilgrim Arrival / Departure Manifest */}
        <Panel
          title={bi(lang, 'بيان متابعة الوصول والمغادرة للمعتمرين', 'Pilgrim Arrival & Departure Control')}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void batchMarkGroupArrival('arrived')}
                className={btnTealCls}
              >
                <Check className="w-3.5 h-3.5" />
                <span>{bi(lang, 'تأكيد وصول المجموعة', 'Mark Group Arrived')}</span>
              </button>
              <button
                type="button"
                onClick={() => void batchMarkGroupArrival('departed')}
                className={btnPrimaryCls}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>{bi(lang, 'تأكيد مغادرة المجموعة', 'Mark Group Departed')}</span>
              </button>
              <button type="button" onClick={exportManifestCsv} className={btnSecondaryCls}>
                <Download className="w-3.5 h-3.5" />
                <span>{tKey(lang, 'exportCsv')}</span>
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <input
              type="text"
              value={arrSearch}
              onChange={(e) => setArrSearch(e.target.value)}
              placeholder={bi(lang, 'بحث بالاسم / الجواز / التأشيرة / الرحلة...', 'Search pilgrim, passport, flight...')}
              className={inputCls}
            />
            <select value={arrGroupFilter} onChange={(e) => setArrGroupFilter(e.target.value)} className={inputCls}>
              <option value="all">{bi(lang, 'كل المجموعات', 'All Groups')}</option>
              {groupCodes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={arrStatusFilter}
              onChange={(e) => setArrStatusFilter(e.target.value as 'all' | UmrahArrivalStatus)}
              className={inputCls}
            >
              <option value="all">{bi(lang, 'كل حالات الحركة', 'All Movement Statuses')}</option>
              <option value="pending">{UMRAH_ARRIVAL_STATUS.pending[lang]}</option>
              <option value="arrived">{UMRAH_ARRIVAL_STATUS.arrived[lang]}</option>
              <option value="departed">{UMRAH_ARRIVAL_STATUS.departed[lang]}</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-y border-slate-200 text-slate-600">
                  <th className="py-2.5 px-3 text-start font-semibold">#</th>
                  <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'اسم المعتمر', 'Pilgrim')}</th>
                  <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'الجواز / التأشيرة', 'Passport / Visa')}</th>
                  <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'المجموعة', 'Group')}</th>
                  <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'الرحلة والحافلة', 'Flight & Bus')}</th>
                  <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'الحالة الحالية', 'Status')}</th>
                  <th className="py-2.5 px-3 text-end font-semibold">{bi(lang, 'تحديث فوري', 'Quick Action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredManifest.length === 0 ? (
                  <EmptyRow colSpan={7} lang={lang} />
                ) : (
                  filteredManifest.map((p, idx) => {
                    const st = UMRAH_ARRIVAL_STATUS[p.arrivalStatus];
                    const busy = busyPilgrimId === p.id;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 font-mono-num text-slate-400">{idx + 1}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">{p.fullName}</div>
                          <div className="text-[11px] text-slate-500">{p.agentName || '-'}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono-num">
                          <div className="text-slate-800">{p.passportNo}</div>
                          <div className="text-[11px] text-slate-500">{p.visaNo || '-'}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono-num font-semibold text-slate-700">{p.groupCode}</td>
                        <td className="py-2.5 px-3 font-mono-num text-slate-600">
                          <div>{p.flightNo || '-'}</div>
                          <div className="text-[11px] text-slate-400">{p.busNo || '-'}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold ${st.cls}`}>
                            {st[lang]}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-end">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={busy || p.arrivalStatus === 'arrived'}
                              onClick={() => void updatePilgrimArrival(p, 'arrived')}
                              className="px-2.5 h-7 rounded-lg bg-teal-50 hover:bg-teal-100 disabled:opacity-40 text-[#0f766e] text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                            >
                              {bi(lang, 'وصول', 'Arrived')}
                            </button>
                            <button
                              type="button"
                              disabled={busy || p.arrivalStatus === 'departed'}
                              onClick={() => void updatePilgrimArrival(p, 'departed')}
                              className="px-2.5 h-7 rounded-lg bg-blue-50 hover:bg-blue-100 disabled:opacity-40 text-[#1d4ed8] text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                            >
                              {bi(lang, 'مغادرة', 'Departed')}
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
        </Panel>
      </div>
    );
  }

  // --- Mode: Flights ---
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <KpiCard label={bi(lang, 'إجمالي الرحلات المسجلة', 'Total Flights')} value={flights.length} tone="slate" />
        <KpiCard label={bi(lang, 'رحلات الوصول للمملكة', 'Arrival Flights')} value={arrivalsCount} tone="teal" />
        <KpiCard label={bi(lang, 'رحلات المغادرة والعودة', 'Departure Flights')} value={departuresCount} tone="blue" />
        <KpiCard
          label={bi(lang, 'إجمالي الركاب بالرحلات', 'Total Flight Pax')}
          value={totalFlightPax}
          sub={`${bi(lang, 'وصلت فعلياً:', 'Landed:')} ${landedCount}`}
          tone="amber"
        />
      </div>

      <Panel
        title={
          <span className="flex items-center gap-2">
            <Plane className="w-4 h-4 text-[#1d4ed8]" />
            {editId !== null
              ? bi(lang, 'تعديل بيانات رحلة طيران', 'Edit Flight Record')
              : bi(lang, 'تسجيل رحلة طيران وموعد وصول / مغادرة', 'Register Flight & Arrival Schedule')}
          </span>
        }
      >
        <form onSubmit={handleSaveFlight} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div>
            <label className={labelCls}>{bi(lang, 'رقم الرحلة *', 'Flight No *')}</label>
            <input
              type="text"
              value={flightNo}
              onChange={(e) => setFlightNo(e.target.value)}
              placeholder="SV-304"
              className={inputCls}
              required
            />
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'شركة الطيران *', 'Airline *')}</label>
            <input
              type="text"
              value={airline}
              onChange={(e) => setAirline(e.target.value)}
              placeholder="الخطوط السعودية / مصر للطيران"
              className={inputCls}
              required
            />
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'نوع الرحلة (وصول / مغادرة)', 'Direction')}</label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'arrival' | 'departure')}
              className={inputCls}
            >
              <option value="arrival">{bi(lang, 'رحلة وصول إلى المملكة', 'Arrival to KSA')}</option>
              <option value="departure">{bi(lang, 'رحلة مغادرة / عودة', 'Departure from KSA')}</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'حالة الرحلة', 'Flight Status')}</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as UmrahFlightStatus)}
              className={inputCls}
            >
              {Object.entries(UMRAH_FLIGHT_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v[lang]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'مطار الإقلاع', 'Origin Airport')}</label>
            <input
              type="text"
              value={originAirport}
              onChange={(e) => setOriginAirport(e.target.value)}
              placeholder="CAI / HBE"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'مطار الوصول', 'Destination Airport')}</label>
            <input
              type="text"
              value={destAirport}
              onChange={(e) => setDestAirport(e.target.value)}
              placeholder="JED / MED"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'تاريخ الرحلة', 'Flight Date')}</label>
            <input type="date" value={flightDate} onChange={(e) => setFlightDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'موعد الوصول / الإقلاع (24 ساعة)', 'Time (24H)')}</label>
            <Time24Input value={flightTime} onChange={setFlightTime} />
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'الصالة / المطار', 'Terminal')}</label>
            <input
              type="text"
              value={terminal}
              onChange={(e) => setTerminal(e.target.value)}
              placeholder="صالة الحجاج / الصالة 1"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'كود المجموعة', 'Group Code')}</label>
            <input
              list="umrah-flight-groups"
              value={groupCode}
              onChange={(e) => setGroupCode(e.target.value)}
              placeholder="UMR-1448-001"
              className={inputCls}
            />
            <datalist id="umrah-flight-groups">
              {groupCodes.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'عدد الركاب', 'Pax Count')}</label>
            <input
              type="number"
              min={0}
              value={paxCount}
              onChange={(e) => setPaxCount(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'الحافلة المخصصة بالاستقبال', 'Assigned Bus')}</label>
            <input
              type="text"
              value={busAssigned}
              onChange={(e) => setBusAssigned(e.target.value)}
              placeholder="BUS-01"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'مشرف الاستقبال / المندوب', 'Supervisor')}</label>
            <input
              list="umrah-flight-supervisors"
              value={supervisorName}
              onChange={(e) => setSupervisorName(e.target.value)}
              className={inputCls}
            />
            <datalist id="umrah-flight-supervisors">
              {supervisorNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>{bi(lang, 'ملاحظات التشغيل', 'Notes')}</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" disabled={saving} className={btnPrimaryCls}>
              <Plus className="w-3.5 h-3.5" />
              <span>
                {editId !== null ? bi(lang, 'تحديث الرحلة', 'Update Flight') : bi(lang, 'حفظ الرحلة', 'Save Flight')}
              </span>
            </button>
            {editId !== null && (
              <button type="button" onClick={resetFlightForm} className={btnSecondaryCls}>
                {bi(lang, 'إلغاء', 'Cancel')}
              </button>
            )}
          </div>
        </form>
      </Panel>

      <Panel
        title={bi(lang, 'جدول الرحلات الجوية ومواعيد الوصول والمغادرة', 'Flights & Schedules Register')}
        actions={
          <button type="button" onClick={exportFlightsCsv} className={btnSecondaryCls}>
            <Download className="w-3.5 h-3.5" />
            <span>{tKey(lang, 'exportCsv')}</span>
          </button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <input
            type="text"
            value={fltSearch}
            onChange={(e) => setFltSearch(e.target.value)}
            placeholder={bi(lang, 'بحث برقم الرحلة / الطيران / المجموعة...', 'Search flight, airline, group...')}
            className={inputCls}
          />
          <select
            value={fltDirection}
            onChange={(e) => setFltDirection(e.target.value as 'all' | 'arrival' | 'departure')}
            className={inputCls}
          >
            <option value="all">{bi(lang, 'كل الاتجاهات', 'All Directions')}</option>
            <option value="arrival">{bi(lang, 'رحلات الوصول', 'Arrivals')}</option>
            <option value="departure">{bi(lang, 'رحلات المغادرة', 'Departures')}</option>
          </select>
          <select
            value={fltStatus}
            onChange={(e) => setFltStatus(e.target.value as 'all' | UmrahFlightStatus)}
            className={inputCls}
          >
            <option value="all">{bi(lang, 'كل الحالات', 'All Statuses')}</option>
            {Object.entries(UMRAH_FLIGHT_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v[lang]}
              </option>
            ))}
          </select>
          <select value={fltGroup} onChange={(e) => setFltGroup(e.target.value)} className={inputCls}>
            <option value="all">{bi(lang, 'كل المجموعات', 'All Groups')}</option>
            {groupCodes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-y border-slate-200 text-slate-600">
                <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'الرحلة والطيران', 'Flight / Airline')}</th>
                <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'الاتجاه والمسار', 'Direction & Route')}</th>
                <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'الموعد والصالة', 'Date / Time / Terminal')}</th>
                <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'المجموعة والركاب', 'Group & Pax')}</th>
                <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'الحافلة والمشرف', 'Bus & Supervisor')}</th>
                <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'الحالة', 'Status')}</th>
                <th className="py-2.5 px-3 text-end font-semibold">{bi(lang, 'إجراءات', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredFlights.length === 0 ? (
                <EmptyRow colSpan={7} lang={lang} />
              ) : (
                filteredFlights.map((f) => {
                  const st = UMRAH_FLIGHT_STATUS[f.status];
                  return (
                    <tr key={f.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900 font-mono-num">{f.flightNo}</div>
                        <div className="text-[11px] text-slate-500">{f.airline}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1 font-semibold text-slate-800">
                          {f.direction === 'arrival' ? (
                            <ArrowDownLeft className="w-3.5 h-3.5 text-[#0f766e]" />
                          ) : (
                            <ArrowUpRight className="w-3.5 h-3.5 text-[#1d4ed8]" />
                          )}
                          <span>{f.direction === 'arrival' ? bi(lang, 'وصول', 'Arrival') : bi(lang, 'مغادرة', 'Departure')}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono-num">
                          {f.originAirport || '-'} → {f.destAirport || '-'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono-num">
                        <div className="text-slate-800">
                          {f.flightDate} · {normalizeTime24(f.flightTime) || '--:--'}
                        </div>
                        <div className="text-[11px] text-slate-500">{f.terminal || '-'}</div>
                      </td>
                      <td className="py-2.5 px-3 font-mono-num">
                        <div className="font-semibold text-slate-800">{f.groupCode || '-'}</div>
                        <div className="text-[11px] text-slate-500">
                          {f.paxCount} {bi(lang, 'معتمر', 'pax')}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-slate-800 font-mono-num">{f.busAssigned || '-'}</div>
                        <div className="text-[11px] text-slate-500">{f.supervisorName || '-'}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          value={f.status}
                          onChange={(e) => void handleFlightStatusChange(f, e.target.value as UmrahFlightStatus)}
                          className={`px-2 py-1 rounded-md text-[11px] font-semibold border border-slate-200 cursor-pointer ${st.cls}`}
                        >
                          {Object.entries(UMRAH_FLIGHT_STATUS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v[lang]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 px-3 text-end">
                        <div className="inline-flex items-center gap-1.5">
                          <button type="button" onClick={() => handleEditFlight(f)} className={btnSoftBlueCls}>
                            <Edit3 className="w-3 h-3" />
                            <span>{tKey(lang, 'edit')}</span>
                          </button>
                          <button type="button" onClick={() => handleDeleteFlightConfirm(f)} className={btnSoftRedCls}>
                            <Trash2 className="w-3 h-3" />
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
      </Panel>
    </div>
  );
};
