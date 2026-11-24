import React, { useMemo, useState } from 'react';
import { BedDouble, Building, CheckSquare, Download, Hotel } from 'lucide-react';
import {
  HOTEL_CITIES,
  HOTEL_ROOM_TYPES,
  HOTEL_STATUS_LABELS,
  HOTEL_SUGGESTIONS,
  HotelCity,
  HotelRoomType,
  UmrahPilgrim,
} from '../../../types/accounting';
import { bi, tKey } from '../../../i18n/translations';
import { csvDownload, sumBy } from '../../../utils/calculations';
import {
  EmptyRow,
  KpiCard,
  Panel,
  btnPrimaryCls,
  btnSecondaryCls,
  btnTealCls,
  inputCls,
  labelCls,
} from '../../AccountingUI';
import { UmrahSharedProps } from './umrahShared';

const ROOM_CAPACITY: Record<HotelRoomType, number> = {
  single: 1,
  double: 2,
  triple: 3,
  quad: 4,
  quint: 5,
  suite: 2,
};

export const UmrahHotelsRoomsTab: React.FC<UmrahSharedProps> = ({
  db,
  lang,
  onSavePilgrim,
  onToast,
}) => {
  const pilgrims = db.umrahPilgrims || [];
  const groups = db.umrahGroups || [];
  const hotelBookings = db.hotels || [];

  const [targetCity, setTargetCity] = useState<HotelCity>('makkah');
  const [hotelName, setHotelName] = useState('');
  const [roomNo, setRoomNo] = useState('');
  const [roomType, setRoomType] = useState<HotelRoomType>('quad');
  const [groupFilter, setGroupFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [applying, setApplying] = useState(false);

  const groupCodes = useMemo(() => {
    const s = new Set<string>();
    groups.forEach((g) => g.groupCode && s.add(g.groupCode));
    pilgrims.forEach((p) => p.groupCode && s.add(p.groupCode));
    return Array.from(s);
  }, [groups, pilgrims]);

  const hotelSuggestions = useMemo(() => {
    const s = new Set<string>(HOTEL_SUGGESTIONS[targetCity][lang] || []);
    hotelBookings.filter((h) => h.city === targetCity).forEach((h) => h.hotelName && s.add(h.hotelName));
    return Array.from(s);
  }, [targetCity, lang, hotelBookings]);

  const filteredPilgrims = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pilgrims.filter((p) => {
      if (groupFilter !== 'all' && p.groupCode !== groupFilter) return false;
      if (q) {
        const hay = `${p.fullName} ${p.passportNo} ${p.groupCode} ${p.makkahHotel} ${p.madinahHotel} ${p.jeddahHotel} ${p.makkahRoomNo} ${p.madinahRoomNo}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [pilgrims, groupFilter, search]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAllFiltered = () => {
    const visibleIds = filteredPilgrims.map((p) => p.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const applyBatchRooming = async () => {
    const cleanHotel = hotelName.trim();
    const cleanRoom = roomNo.trim();
    if (!cleanHotel) {
      onToast(bi(lang, 'يرجى تحديد اسم الفندق أولاً', 'Please select or enter hotel name'), 'error');
      return;
    }
    const targets =
      selectedIds.length > 0
        ? pilgrims.filter((p) => selectedIds.includes(p.id))
        : groupFilter !== 'all'
          ? filteredPilgrims
          : [];

    if (targets.length === 0) {
      onToast(
        bi(lang, 'اختر معتمرين من الجدول أو اختر مجموعة لتطبيق التسكين عليها', 'Select pilgrims or filter a group first'),
        'error'
      );
      return;
    }

    setApplying(true);
    try {
      for (const p of targets) {
        const patch: Partial<UmrahPilgrim> = { roomType };
        if (targetCity === 'makkah') {
          patch.makkahHotel = cleanHotel;
          if (cleanRoom) patch.makkahRoomNo = cleanRoom;
        } else if (targetCity === 'madinah') {
          patch.madinahHotel = cleanHotel;
          if (cleanRoom) patch.madinahRoomNo = cleanRoom;
        } else {
          patch.jeddahHotel = cleanHotel;
          if (cleanRoom) patch.jeddahRoomNo = cleanRoom;
        }
        await onSavePilgrim({ ...p, ...patch }, true);
      }
      onToast(
        bi(
          lang,
          `تم تسكين ${targets.length} معتمر في ${cleanHotel}${cleanRoom ? ` - غرفة ${cleanRoom}` : ''}`,
          `Assigned ${targets.length} pilgrims to ${cleanHotel}`
        )
      );
      setSelectedIds([]);
    } finally {
      setApplying(false);
    }
  };

  const updateInlineRoom = async (p: UmrahPilgrim, city: HotelCity, hotel: string, room: string) => {
    const updated: UmrahPilgrim =
      city === 'makkah'
        ? { ...p, makkahHotel: hotel, makkahRoomNo: room }
        : city === 'madinah'
          ? { ...p, madinahHotel: hotel, madinahRoomNo: room }
          : { ...p, jeddahHotel: hotel, jeddahRoomNo: room };
    await onSavePilgrim(updated, true);
    onToast(bi(lang, `تم تحديث تسكين ${p.fullName}`, `Updated rooming for ${p.fullName}`), 'info');
  };

  // Room Occupancy Summary grouped by (Hotel, RoomNo) for targetCity
  const roomSummary = useMemo(() => {
    const map = new Map<
      string,
      { hotel: string; room: string; roomType: HotelRoomType; occupants: UmrahPilgrim[] }
    >();
    pilgrims.forEach((p) => {
      const h =
        targetCity === 'makkah' ? p.makkahHotel : targetCity === 'madinah' ? p.madinahHotel : p.jeddahHotel;
      const r =
        targetCity === 'makkah' ? p.makkahRoomNo : targetCity === 'madinah' ? p.madinahRoomNo : p.jeddahRoomNo;
      if (!h && !r) return;
      const key = `${h || '-'}__${r || '-'}`;
      const existing = map.get(key);
      if (existing) {
        existing.occupants.push(p);
      } else {
        map.set(key, {
          hotel: h || bi(lang, 'فندق غير محدد', 'Unassigned Hotel'),
          room: r || bi(lang, 'بدون رقم غرفة', 'No Room #'),
          roomType: p.roomType || 'quad',
          occupants: [p],
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.hotel.localeCompare(b.hotel) || a.room.localeCompare(b.room));
  }, [pilgrims, targetCity, lang]);

  const makkahAssigned = pilgrims.filter((p) => Boolean(p.makkahHotel)).length;
  const madinahAssigned = pilgrims.filter((p) => Boolean(p.madinahHotel)).length;
  const unassignedCount = pilgrims.filter((p) => !p.makkahHotel && !p.madinahHotel && !p.jeddahHotel).length;
  const totalContractedRooms = sumBy(
    hotelBookings.filter((h) => h.status !== 'cancelled'),
    (h) => Number(h.rooms || 0)
  );

  const exportRoomingCsv = () => {
    csvDownload('umrah-1448-rooming-list.csv', [
      [
        bi(lang, 'المجموعة', 'Group'),
        bi(lang, 'اسم المعتمر', 'Pilgrim'),
        bi(lang, 'الجنس', 'Gender'),
        bi(lang, 'رقم الجواز', 'Passport'),
        bi(lang, 'نوع الغرفة', 'Room Type'),
        bi(lang, 'فندق مكة', 'Makkah Hotel'),
        bi(lang, 'غرفة مكة', 'Makkah Room'),
        bi(lang, 'فندق المدينة', 'Madinah Hotel'),
        bi(lang, 'غرفة المدينة', 'Madinah Room'),
        bi(lang, 'فندق جدة', 'Jeddah Hotel'),
        bi(lang, 'غرفة جدة', 'Jeddah Room'),
      ],
      ...filteredPilgrims.map((p) => [
        p.groupCode,
        p.fullName,
        p.gender === 'female' ? bi(lang, 'أنثى', 'Female') : bi(lang, 'ذكر', 'Male'),
        p.passportNo,
        HOTEL_ROOM_TYPES[p.roomType]?.[lang] || p.roomType,
        p.makkahHotel,
        p.makkahRoomNo,
        p.madinahHotel,
        p.madinahRoomNo,
        p.jeddahHotel,
        p.jeddahRoomNo,
      ]),
    ]);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <KpiCard label={bi(lang, 'مسكنون بفنادق مكة', 'Assigned in Makkah')} value={makkahAssigned} tone="amber" />
        <KpiCard label={bi(lang, 'مسكنون بفنادق المدينة', 'Assigned in Madinah')} value={madinahAssigned} tone="teal" />
        <KpiCard label={bi(lang, 'بانتظار توزيع الفنادق', 'Unassigned Pilgrims')} value={unassignedCount} tone="red" />
        <KpiCard
          label={bi(lang, 'غرف الفنادق المتعاقد عليها', 'Contracted Hotel Rooms')}
          value={totalContractedRooms}
          sub={`${hotelBookings.length} ${bi(lang, 'حجز فندقي', 'bookings')}`}
          tone="blue"
        />
      </div>

      {/* Batch Rooming Control */}
      <Panel
        title={
          <span className="flex items-center gap-2">
            <BedDouble className="w-4 h-4 text-[#1d4ed8]" />
            {bi(lang, 'توزيع المعتمرين على الفنادق والغرف (مكة / المدينة / جدة)', 'Assign Pilgrims to Hotels & Rooms')}
          </span>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 items-end">
          <div>
            <label className={labelCls}>{bi(lang, 'المدينة', 'City')}</label>
            <select
              value={targetCity}
              onChange={(e) => {
                setTargetCity(e.target.value as HotelCity);
                setHotelName('');
              }}
              className={inputCls}
            >
              {Object.entries(HOTEL_CITIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v[lang]}
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className={labelCls}>{bi(lang, 'اسم الفندق *', 'Hotel Name *')}</label>
            <input
              list="umrah-hotel-suggestions"
              value={hotelName}
              onChange={(e) => setHotelName(e.target.value)}
              placeholder={bi(lang, 'اختر من الفنادق المقترحة أو اكتب الاسم...', 'Select or type hotel name...')}
              className={inputCls}
            />
            <datalist id="umrah-hotel-suggestions">
              {hotelSuggestions.map((h) => (
                <option key={h} value={h} />
              ))}
            </datalist>
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'رقم الغرفة', 'Room No')}</label>
            <input
              type="text"
              value={roomNo}
              onChange={(e) => setRoomNo(e.target.value)}
              placeholder="402"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'نوع الغرفة', 'Room Type')}</label>
            <select
              value={roomType}
              onChange={(e) => setRoomType(e.target.value as HotelRoomType)}
              className={inputCls}
            >
              {Object.entries(HOTEL_ROOM_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v[lang]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {selectedIds.length > 0
              ? bi(lang, `المعتمرون المحددون: ${selectedIds.length}`, `Selected pilgrims: ${selectedIds.length}`)
              : groupFilter !== 'all'
                ? bi(lang, `سيتم التطبيق على معتمرى المجموعة ${groupFilter} (${filteredPilgrims.length})`, `Will apply to filtered group ${groupFilter}`)
                : bi(lang, 'حدد المعتمرين من الجدول أدناه أو فلتر بمجموعة لتسكينهم دفعة واحدة', 'Select pilgrims below or filter a group to batch assign')}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={applying} onClick={() => void applyBatchRooming()} className={btnTealCls}>
              <CheckSquare className="w-3.5 h-3.5" />
              <span>{applying ? bi(lang, 'جاري التسكين...', 'Assigning...') : bi(lang, 'تطبيق التسكين', 'Apply Rooming')}</span>
            </button>
          </div>
        </div>
      </Panel>

      {/* Room Occupancy Board */}
      <Panel
        title={
          <span className="flex items-center gap-2">
            <Building className="w-4 h-4 text-[#0f766e]" />
            {bi(
              lang,
              `خريطة إشغال الغرف في ${HOTEL_CITIES[targetCity].ar} (${roomSummary.length} غرفة)`,
              `Room Occupancy Grid - ${HOTEL_CITIES[targetCity].en} (${roomSummary.length})`
            )}
          </span>
        }
      >
        {roomSummary.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-6">
            {bi(lang, 'لم يتم تسكين أي غرف في هذه المدينة بعد', 'No rooms assigned in this city yet')}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {roomSummary.map((rm) => {
              const cap = ROOM_CAPACITY[rm.roomType] || 4;
              const over = rm.occupants.length > cap;
              return (
                <div
                  key={`${rm.hotel}__${rm.room}`}
                  className={`border rounded-xl p-3 space-y-2 ${
                    over ? 'border-red-300 bg-red-50/40' : 'border-slate-200 bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">{rm.hotel}</div>
                      <div className="text-[11px] text-slate-500 font-mono-num">
                        {bi(lang, 'غرفة:', 'Room:')} <strong className="text-slate-800">{rm.room}</strong> ·{' '}
                        {HOTEL_ROOM_TYPES[rm.roomType]?.[lang]}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold font-mono-num shrink-0 ${
                        over
                          ? 'bg-red-100 text-red-700'
                          : rm.occupants.length === cap
                            ? 'bg-teal-100 text-[#0f766e]'
                            : 'bg-blue-50 text-[#1d4ed8]'
                      }`}
                    >
                      {rm.occupants.length} / {cap}
                    </span>
                  </div>
                  <div className="space-y-1 pt-1 border-t border-slate-200/70">
                    {rm.occupants.map((occ) => (
                      <div key={occ.id} className="flex items-center justify-between text-[11px] text-slate-700">
                        <span className="truncate">{occ.fullName}</span>
                        <span className="font-mono-num text-slate-400 shrink-0">{occ.groupCode}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Pilgrims Rooming Assignment Table */}
      <Panel
        title={bi(lang, 'جدول التسكين التفصيلي للمعتمرين (Rooming List)', 'Detailed Pilgrim Rooming List')}
        actions={
          <button type="button" onClick={exportRoomingCsv} className={btnSecondaryCls}>
            <Download className="w-3.5 h-3.5" />
            <span>{tKey(lang, 'exportCsv')}</span>
          </button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={bi(lang, 'بحث بالاسم / الفندق / رقم الغرفة...', 'Search name, hotel, room...')}
            className={inputCls}
          />
          <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className={inputCls}>
            <option value="all">{bi(lang, 'كل المجموعات', 'All Groups')}</option>
            {groupCodes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button type="button" onClick={toggleSelectAllFiltered} className={btnPrimaryCls}>
            <span>{bi(lang, 'تحديد / إلغاء تحديد الظاهرين', 'Toggle Select Visible')}</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-y border-slate-200 text-slate-600">
                <th className="py-2.5 px-2.5 text-center w-9">
                  <input
                    type="checkbox"
                    checked={
                      filteredPilgrims.length > 0 && filteredPilgrims.every((p) => selectedIds.includes(p.id))
                    }
                    onChange={toggleSelectAllFiltered}
                    aria-label="Select all"
                  />
                </th>
                <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'المعتمر والمجموعة', 'Pilgrim & Group')}</th>
                <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'نوع الغرفة', 'Type')}</th>
                <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'فندق وغرفة مكة', 'Makkah Hotel & Room')}</th>
                <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'فندق وغرفة المدينة', 'Madinah Hotel & Room')}</th>
                <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'فندق وغرفة جدة', 'Jeddah Hotel & Room')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPilgrims.length === 0 ? (
                <EmptyRow colSpan={6} lang={lang} />
              ) : (
                filteredPilgrims.map((p) => (
                  <PilgrimRoomRow key={p.id} pilgrim={p} lang={lang} selected={selectedIds.includes(p.id)} onToggle={() => toggleSelect(p.id)} onSaveRoom={updateInlineRoom} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Active Hotel Contracts from Accounting DB */}
      {hotelBookings.length > 0 && (
        <Panel
          title={
            <span className="flex items-center gap-2">
              <Hotel className="w-4 h-4 text-amber-600" />
              {bi(lang, 'الحجوزات الفندقية المرتبطة بالنظام', 'Linked Hotel Bookings')}
            </span>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-y border-slate-200 text-slate-600">
                  <th className="py-2 px-3 text-start font-semibold">{bi(lang, 'المرجع', 'Ref')}</th>
                  <th className="py-2 px-3 text-start font-semibold">{bi(lang, 'المدينة والفندق', 'City & Hotel')}</th>
                  <th className="py-2 px-3 text-start font-semibold">{bi(lang, 'المجموعة', 'Group')}</th>
                  <th className="py-2 px-3 text-start font-semibold">{bi(lang, 'الفترة والليالي', 'Dates & Nights')}</th>
                  <th className="py-2 px-3 text-start font-semibold">{bi(lang, 'الغرف / المعتمرين', 'Rooms / Pax')}</th>
                  <th className="py-2 px-3 text-start font-semibold">{bi(lang, 'الحالة', 'Status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hotelBookings.map((h) => {
                  const st = HOTEL_STATUS_LABELS[h.status];
                  return (
                    <tr key={h.id}>
                      <td className="py-2 px-3 font-mono-num font-semibold">{h.refNo}</td>
                      <td className="py-2 px-3">
                        <div className="font-semibold text-slate-800">{h.hotelName}</div>
                        <div className="text-[11px] text-slate-500">{HOTEL_CITIES[h.city]?.[lang]}</div>
                      </td>
                      <td className="py-2 px-3 font-mono-num">{h.groupNo || '-'}</td>
                      <td className="py-2 px-3 font-mono-num text-slate-600">
                        {h.checkIn} → {h.checkOut} ({h.nights})
                      </td>
                      <td className="py-2 px-3 font-mono-num">
                        {h.rooms} / {h.pax}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${st.cls}`}>{st[lang]}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
};

const PilgrimRoomRow: React.FC<{
  pilgrim: UmrahPilgrim;
  lang: 'ar' | 'en';
  selected: boolean;
  onToggle: () => void;
  onSaveRoom: (p: UmrahPilgrim, city: HotelCity, hotel: string, room: string) => Promise<void>;
}> = ({ pilgrim, lang, selected, onToggle, onSaveRoom }) => {
  const [mkH, setMkH] = useState(pilgrim.makkahHotel);
  const [mkR, setMkR] = useState(pilgrim.makkahRoomNo);
  const [mdH, setMdH] = useState(pilgrim.madinahHotel);
  const [mdR, setMdR] = useState(pilgrim.madinahRoomNo);
  const [jdH, setJdH] = useState(pilgrim.jeddahHotel);
  const [jdR, setJdR] = useState(pilgrim.jeddahRoomNo);

  return (
    <tr className={selected ? 'bg-blue-50/40' : 'hover:bg-slate-50/60'}>
      <td className="py-2 px-2.5 text-center">
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label={pilgrim.fullName} />
      </td>
      <td className="py-2 px-3">
        <div className="font-semibold text-slate-900">{pilgrim.fullName}</div>
        <div className="text-[11px] text-slate-500 font-mono-num">
          {pilgrim.groupCode} · {pilgrim.passportNo}
        </div>
      </td>
      <td className="py-2 px-3 text-slate-600">{HOTEL_ROOM_TYPES[pilgrim.roomType]?.[lang]}</td>
      <td className="py-2 px-3">
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={mkH}
            onChange={(e) => setMkH(e.target.value)}
            onBlur={() => {
              if (mkH !== pilgrim.makkahHotel || mkR !== pilgrim.makkahRoomNo) {
                void onSaveRoom(pilgrim, 'makkah', mkH.trim(), mkR.trim());
              }
            }}
            placeholder={bi(lang, 'فندق مكة', 'Makkah hotel')}
            className="h-7 px-2 rounded border border-slate-200 text-[11px] w-36 bg-white"
          />
          <input
            type="text"
            value={mkR}
            onChange={(e) => setMkR(e.target.value)}
            onBlur={() => {
              if (mkH !== pilgrim.makkahHotel || mkR !== pilgrim.makkahRoomNo) {
                void onSaveRoom(pilgrim, 'makkah', mkH.trim(), mkR.trim());
              }
            }}
            placeholder="#"
            className="h-7 px-1.5 rounded border border-slate-200 text-[11px] w-14 font-mono-num bg-white"
          />
        </div>
      </td>
      <td className="py-2 px-3">
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={mdH}
            onChange={(e) => setMdH(e.target.value)}
            onBlur={() => {
              if (mdH !== pilgrim.madinahHotel || mdR !== pilgrim.madinahRoomNo) {
                void onSaveRoom(pilgrim, 'madinah', mdH.trim(), mdR.trim());
              }
            }}
            placeholder={bi(lang, 'فندق المدينة', 'Madinah hotel')}
            className="h-7 px-2 rounded border border-slate-200 text-[11px] w-36 bg-white"
          />
          <input
            type="text"
            value={mdR}
            onChange={(e) => setMdR(e.target.value)}
            onBlur={() => {
              if (mdH !== pilgrim.madinahHotel || mdR !== pilgrim.madinahRoomNo) {
                void onSaveRoom(pilgrim, 'madinah', mdH.trim(), mdR.trim());
              }
            }}
            placeholder="#"
            className="h-7 px-1.5 rounded border border-slate-200 text-[11px] w-14 font-mono-num bg-white"
          />
        </div>
      </td>
      <td className="py-2 px-3">
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={jdH}
            onChange={(e) => setJdH(e.target.value)}
            onBlur={() => {
              if (jdH !== pilgrim.jeddahHotel || jdR !== pilgrim.jeddahRoomNo) {
                void onSaveRoom(pilgrim, 'jeddah', jdH.trim(), jdR.trim());
              }
            }}
            placeholder={bi(lang, 'فندق جدة', 'Jeddah hotel')}
            className="h-7 px-2 rounded border border-slate-200 text-[11px] w-32 bg-white"
          />
          <input
            type="text"
            value={jdR}
            onChange={(e) => setJdR(e.target.value)}
            onBlur={() => {
              if (jdH !== pilgrim.jeddahHotel || jdR !== pilgrim.jeddahRoomNo) {
                void onSaveRoom(pilgrim, 'jeddah', jdH.trim(), jdR.trim());
              }
            }}
            placeholder="#"
            className="h-7 px-1.5 rounded border border-slate-200 text-[11px] w-14 font-mono-num bg-white"
          />
        </div>
      </td>
    </tr>
  );
};
