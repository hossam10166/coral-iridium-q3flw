import React, { useMemo, useState } from 'react';
import { Bus, Download, Edit3, Plus, Trash2, UserCheck } from 'lucide-react';
import {
  Currency,
  TransportEntry,
  UmrahFieldCity,
  UmrahFieldStaff,
  UmrahShiftStatus,
  UmrahStaffRole,
  VEHICLE_TYPES,
} from '../../../types/accounting';
import { bi, tKey } from '../../../i18n/translations';
import { csvDownload, fmt, nextTrnRef, sumBy, today, trnVals } from '../../../utils/calculations';
import {
  EmptyRow,
  KpiCard,
  Panel,
  btnPrimaryCls,
  btnSecondaryCls,
  btnSoftBlueCls,
  btnSoftRedCls,
  inputCls,
  labelCls,
} from '../../AccountingUI';
import {
  UMRAH_FIELD_CITIES,
  UMRAH_SHIFT_STATUS,
  UMRAH_STAFF_ROLES,
  UmrahSharedProps,
} from './umrahShared';

interface Props extends UmrahSharedProps {
  mode: 'transport' | 'staff';
}

const INTERCITY_ROUTES = [
  'مطار جدة ← مكة المكرمة',
  'مكة المكرمة ← المدينة المنورة',
  'المدينة المنورة ← مكة المكرمة',
  'مكة المكرمة ← مطار جدة',
  'مطار المدينة ← فندق المدينة',
  'فندق المدينة ← مطار المدينة',
  'مزارات مكة المكرمة',
  'مزارات المدينة المنورة',
];

export const UmrahTransportStaffTab: React.FC<Props> = ({
  mode,
  db,
  lang,
  onSaveTransport,
  onDeleteTransport,
  onSaveFieldStaff,
  onDeleteFieldStaff,
  onToast,
  onConfirm,
}) => {
  const transports = db.transports || [];
  const staffList = db.umrahFieldStaff || [];
  const groups = db.umrahGroups || [];
  const pilgrims = db.umrahPilgrims || [];

  // --- Intercity Transport Form State ---
  const [editTrnId, setEditTrnId] = useState<number | null>(null);
  const [trnRefNo, setTrnRefNo] = useState(() => nextTrnRef(db));
  const [trnGroupNo, setTrnGroupNo] = useState('');
  const [trnDate, setTrnDate] = useState(today());
  const [trnRoute, setTrnRoute] = useState(INTERCITY_ROUTES[0]);
  const [trnVehicleType, setTrnVehicleType] = useState(VEHICLE_TYPES[0]);
  const [trnVehicleCount, setTrnVehicleCount] = useState('1');
  const [trnPax, setTrnPax] = useState('45');
  const [trnCustomer, setTrnCustomer] = useState('');
  const [trnSupplier, setTrnSupplier] = useState('');
  const [trnCurrency, setTrnCurrency] = useState<Currency>('SAR');
  const [trnBuy, setTrnBuy] = useState('0');
  const [trnSell, setTrnSell] = useState('0');
  const [trnDriverName, setTrnDriverName] = useState('');
  const [trnPlateNo, setTrnPlateNo] = useState('');
  const [trnNotes, setTrnNotes] = useState('');
  const [trnSearch, setTrnSearch] = useState('');
  const [trnFilterRoute, setTrnFilterRoute] = useState('all');
  const [savingTrn, setSavingTrn] = useState(false);

  // --- Field Staff Form State ---
  const [editStaffId, setEditStaffId] = useState<number | null>(null);
  const [stName, setStName] = useState('');
  const [stRole, setStRole] = useState<UmrahStaffRole>('supervisor');
  const [stPhone, setStPhone] = useState('');
  const [stCity, setStCity] = useState<UmrahFieldCity>('makkah');
  const [stGroup, setStGroup] = useState('');
  const [stBus, setStBus] = useState('');
  const [stShift, setStShift] = useState<UmrahShiftStatus>('on_duty');
  const [stNotes, setStNotes] = useState('');
  const [stSearch, setStSearch] = useState('');
  const [stFilterCity, setStFilterCity] = useState<'all' | UmrahFieldCity>('all');
  const [stFilterRole, setStFilterRole] = useState<'all' | UmrahStaffRole>('all');
  const [savingStaff, setSavingStaff] = useState(false);

  const groupCodes = useMemo(() => {
    const s = new Set<string>();
    groups.forEach((g) => g.groupCode && s.add(g.groupCode));
    db.entries.forEach((e) => e.groupNo && s.add(e.groupNo));
    pilgrims.forEach((p) => p.groupCode && s.add(p.groupCode));
    return Array.from(s);
  }, [groups, db.entries, pilgrims]);

  const supplierNames = useMemo(() => {
    const s = new Set<string>();
    db.suppliers.forEach((x) => x.name && s.add(x.name));
    transports.forEach((t) => t.supplier && s.add(t.supplier));
    return Array.from(s);
  }, [db.suppliers, transports]);

  const customerNames = useMemo(() => {
    const s = new Set<string>();
    (db.umrahAgents || []).forEach((a) => a.name && s.add(a.name));
    db.customers.forEach((c) => c.name && s.add(c.name));
    return Array.from(s);
  }, [db.umrahAgents, db.customers]);

  // --- Transport Handlers ---
  const resetTrnForm = () => {
    setEditTrnId(null);
    setTrnRefNo(nextTrnRef(db));
    setTrnGroupNo('');
    setTrnDate(today());
    setTrnRoute(INTERCITY_ROUTES[0]);
    setTrnVehicleType(VEHICLE_TYPES[0]);
    setTrnVehicleCount('1');
    setTrnPax('45');
    setTrnCustomer('');
    setTrnSupplier('');
    setTrnCurrency('SAR');
    setTrnBuy('0');
    setTrnSell('0');
    setTrnDriverName('');
    setTrnPlateNo('');
    setTrnNotes('');
  };

  const handleEditTrn = (t: TransportEntry) => {
    setEditTrnId(t.id);
    setTrnRefNo(t.refNo);
    setTrnGroupNo(t.groupNo);
    setTrnDate(t.date);
    setTrnRoute(t.route);
    setTrnVehicleType(t.vehicleType);
    setTrnVehicleCount(String(t.vehicleCount));
    setTrnPax(String(t.pax));
    setTrnCustomer(t.customer);
    setTrnSupplier(t.supplier);
    setTrnCurrency(t.currency);
    setTrnBuy(String(t.buy));
    setTrnSell(String(t.sell));
    setTrnDriverName(t.driverName);
    setTrnPlateNo(t.plateNo);
    setTrnNotes(t.notes);
  };

  const handleSaveTrn = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanRoute = trnRoute.trim();
    const cleanSupplier = trnSupplier.trim() || bi(lang, 'مورد نقل مباشر', 'Direct Fleet');
    if (!cleanRoute) {
      onToast(bi(lang, 'يرجى تحديد خط السير بين المدن', 'Please enter route'), 'error');
      return;
    }
    setSavingTrn(true);
    try {
      const payload: TransportEntry = {
        id: editTrnId ?? Date.now(),
        refNo: trnRefNo.trim() || nextTrnRef(db),
        groupNo: trnGroupNo.trim(),
        date: trnDate || today(),
        route: cleanRoute,
        vehicleType: trnVehicleType.trim() || VEHICLE_TYPES[0],
        vehicleCount: Math.max(1, Math.round(Number(trnVehicleCount || 1))),
        pax: Math.max(0, Math.round(Number(trnPax || 0))),
        customer: trnCustomer.trim(),
        supplier: cleanSupplier,
        currency: trnCurrency,
        buy: Math.max(0, Number(trnBuy || 0)),
        sell: Math.max(0, Number(trnSell || 0)),
        rate: db.rate || 3.75,
        driverName: trnDriverName.trim(),
        plateNo: trnPlateNo.trim(),
        notes: trnNotes.trim(),
      };
      await onSaveTransport(payload, editTrnId !== null);
      onToast(
        editTrnId !== null
          ? bi(lang, 'تم تحديث حركة الحافلة بنجاح', 'Transport updated')
          : bi(lang, 'تم حفظ حركة الحافلة وربطها بحسابات النقل', 'Transport saved & synced with Transport Ledger')
      );
      resetTrnForm();
    } finally {
      setSavingTrn(false);
    }
  };

  const handleDeleteTrnConfirm = (t: TransportEntry) => {
    onConfirm({
      title: bi(lang, 'حذف حركة النقل', 'Delete Transport Record'),
      message: bi(lang, `هل تريد حذف عملية النقل ${t.refNo}؟`, `Delete transport ${t.refNo}?`),
      danger: true,
      onConfirm: async () => {
        await onDeleteTransport(t.id);
        onToast(bi(lang, 'تم حذف حركة النقل', 'Transport deleted'), 'info');
      },
    });
  };

  const filteredTransports = useMemo(() => {
    const q = trnSearch.trim().toLowerCase();
    return transports
      .filter((t) => {
        if (trnFilterRoute !== 'all' && !t.route.includes(trnFilterRoute)) return false;
        if (q) {
          const hay = `${t.refNo} ${t.groupNo} ${t.route} ${t.supplier} ${t.customer} ${t.driverName} ${t.plateNo}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [transports, trnFilterRoute, trnSearch]);

  const trnStats = useMemo(() => {
    const buses = sumBy(filteredTransports, (t) => Number(t.vehicleCount || 0));
    const pax = sumBy(filteredTransports, (t) => Number(t.pax || 0));
    const sales = sumBy(filteredTransports, (t) => trnVals(t, db.rate).sales);
    const profit = sumBy(filteredTransports, (t) => trnVals(t, db.rate).profit);
    return { buses, pax, sales, profit };
  }, [filteredTransports, db.rate]);

  const exportTransportCsv = () => {
    csvDownload('umrah-1448-transport.csv', [
      [
        bi(lang, 'المرجع', 'Ref'),
        bi(lang, 'التاريخ', 'Date'),
        bi(lang, 'المجموعة', 'Group'),
        bi(lang, 'المسار', 'Route'),
        bi(lang, 'نوع المركبة', 'Vehicle'),
        bi(lang, 'عدد الحافلات', 'Buses'),
        bi(lang, 'الركاب', 'Pax'),
        bi(lang, 'العميل', 'Agent/Customer'),
        bi(lang, 'شركة النقل / المورد', 'Supplier'),
        bi(lang, 'السائق', 'Driver'),
        bi(lang, 'اللوحة', 'Plate'),
        bi(lang, 'البيع ر.س', 'Sell SAR'),
        bi(lang, 'الربح ر.س', 'Profit SAR'),
      ],
      ...filteredTransports.map((t) => {
        const v = trnVals(t, db.rate);
        return [
          t.refNo,
          t.date,
          t.groupNo,
          t.route,
          t.vehicleType,
          t.vehicleCount,
          t.pax,
          t.customer,
          t.supplier,
          t.driverName,
          t.plateNo,
          v.sales.toFixed(2),
          v.profit.toFixed(2),
        ];
      }),
    ]);
  };

  // --- Staff Handlers ---
  const resetStaffForm = () => {
    setEditStaffId(null);
    setStName('');
    setStRole('supervisor');
    setStPhone('');
    setStCity('makkah');
    setStGroup('');
    setStBus('');
    setStShift('on_duty');
    setStNotes('');
  };

  const handleEditStaff = (s: UmrahFieldStaff) => {
    setEditStaffId(s.id);
    setStName(s.name);
    setStRole(s.role);
    setStPhone(s.phone);
    setStCity(s.city);
    setStGroup(s.assignedGroup);
    setStBus(s.assignedBus);
    setStShift(s.shiftStatus);
    setStNotes(s.notes);
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = stName.trim();
    if (!cleanName) {
      onToast(bi(lang, 'يرجى إدخال اسم المشرف أو المندوب', 'Please enter staff name'), 'error');
      return;
    }
    setSavingStaff(true);
    try {
      const payload: UmrahFieldStaff = {
        id: editStaffId ?? Date.now(),
        name: cleanName,
        role: stRole,
        phone: stPhone.trim(),
        city: stCity,
        assignedGroup: stGroup.trim(),
        assignedBus: stBus.trim(),
        shiftStatus: stShift,
        notes: stNotes.trim(),
      };
      await onSaveFieldStaff(payload, editStaffId !== null);
      onToast(
        editStaffId !== null
          ? bi(lang, 'تم تحديث بيانات المشرف / المندوب', 'Field staff updated')
          : bi(lang, 'تمت إضافة المشرف / المندوب بنجاح', 'Field staff saved')
      );
      resetStaffForm();
    } finally {
      setSavingStaff(false);
    }
  };

  const handleStaffShiftChange = async (s: UmrahFieldStaff, nextShift: UmrahShiftStatus) => {
    await onSaveFieldStaff({ ...s, shiftStatus: nextShift }, true);
    onToast(bi(lang, 'تم تحديث حالة المناوبة', 'Shift status updated'), 'info');
  };

  const handleDeleteStaffConfirm = (s: UmrahFieldStaff) => {
    onConfirm({
      title: bi(lang, 'حذف مشرف / مندوب', 'Delete Field Staff'),
      message: bi(lang, `هل تريد حذف ${s.name}؟`, `Delete ${s.name}?`),
      danger: true,
      onConfirm: async () => {
        await onDeleteFieldStaff(s.id);
        onToast(bi(lang, 'تم حذف المشرف / المندوب', 'Field staff deleted'), 'info');
      },
    });
  };

  const filteredStaff = useMemo(() => {
    const q = stSearch.trim().toLowerCase();
    return staffList.filter((s) => {
      if (stFilterCity !== 'all' && s.city !== stFilterCity) return false;
      if (stFilterRole !== 'all' && s.role !== stFilterRole) return false;
      if (q) {
        const hay = `${s.name} ${s.phone} ${s.assignedGroup} ${s.assignedBus}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [staffList, stFilterCity, stFilterRole, stSearch]);

  const exportStaffCsv = () => {
    csvDownload('umrah-1448-field-staff.csv', [
      [
        bi(lang, 'الاسم', 'Name'),
        bi(lang, 'الدور', 'Role'),
        bi(lang, 'الجوال', 'Phone'),
        bi(lang, 'الموقع / المدينة', 'City'),
        bi(lang, 'المجموعة المكلفة', 'Assigned Group'),
        bi(lang, 'الحافلة', 'Assigned Bus'),
        bi(lang, 'حالة المناوبة', 'Shift Status'),
        bi(lang, 'ملاحظات', 'Notes'),
      ],
      ...filteredStaff.map((s) => [
        s.name,
        UMRAH_STAFF_ROLES[s.role][lang],
        s.phone,
        UMRAH_FIELD_CITIES[s.city][lang],
        s.assignedGroup,
        s.assignedBus,
        UMRAH_SHIFT_STATUS[s.shiftStatus][lang],
        s.notes,
      ]),
    ]);
  };

  if (mode === 'staff') {
    const onDutyCount = staffList.filter((s) => s.shiftStatus === 'on_duty').length;
    const supervisorsCount = staffList.filter((s) => s.role === 'supervisor').length;
    const delegatesCount = staffList.filter((s) => s.role === 'delegate').length;

    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <KpiCard label={bi(lang, 'إجمالي الكادر الميداني', 'Total Field Staff')} value={staffList.length} tone="slate" />
          <KpiCard label={bi(lang, 'في الخدمة حالياً', 'Currently On Duty')} value={onDutyCount} tone="teal" />
          <KpiCard label={bi(lang, 'مشرفو المجموعات', 'Group Supervisors')} value={supervisorsCount} tone="blue" />
          <KpiCard label={bi(lang, 'مناديب المطار والمدن', 'Field Delegates')} value={delegatesCount} tone="amber" />
        </div>

        <Panel
          title={
            <span className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#1d4ed8]" />
              {editStaffId !== null
                ? bi(lang, 'تعديل بيانات مشرف / مندوب', 'Edit Field Staff')
                : bi(lang, 'تسجيل مشرف أو مندوب ميداني وتوزيعه على المواقع', 'Add Supervisor / Field Delegate')}
            </span>
          }
        >
          <form onSubmit={handleSaveStaff} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div>
              <label className={labelCls}>{bi(lang, 'الاسم الكامل *', 'Full Name *')}</label>
              <input
                type="text"
                value={stName}
                onChange={(e) => setStName(e.target.value)}
                placeholder={bi(lang, 'اسم المشرف أو المندوب', 'Staff name')}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>{bi(lang, 'الصفة / الدور', 'Role')}</label>
              <select
                value={stRole}
                onChange={(e) => setStRole(e.target.value as UmrahStaffRole)}
                className={inputCls}
              >
                {Object.entries(UMRAH_STAFF_ROLES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v[lang]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{bi(lang, 'رقم الجوال السعودي / واتساب', 'Phone / WhatsApp')}</label>
              <input
                type="text"
                value={stPhone}
                onChange={(e) => setStPhone(e.target.value)}
                placeholder="+9665..."
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{bi(lang, 'موقع التمركز', 'Station / City')}</label>
              <select
                value={stCity}
                onChange={(e) => setStCity(e.target.value as UmrahFieldCity)}
                className={inputCls}
              >
                {Object.entries(UMRAH_FIELD_CITIES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v[lang]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{bi(lang, 'المجموعة المكلف بها', 'Assigned Group')}</label>
              <input
                list="umrah-staff-groups"
                value={stGroup}
                onChange={(e) => setStGroup(e.target.value)}
                placeholder="UMR-1448-001"
                className={inputCls}
              />
              <datalist id="umrah-staff-groups">
                {groupCodes.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={labelCls}>{bi(lang, 'رقم الحافلة', 'Assigned Bus')}</label>
              <input
                type="text"
                value={stBus}
                onChange={(e) => setStBus(e.target.value)}
                placeholder="BUS-01"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{bi(lang, 'حالة المناوبة', 'Shift Status')}</label>
              <select
                value={stShift}
                onChange={(e) => setStShift(e.target.value as UmrahShiftStatus)}
                className={inputCls}
              >
                {Object.entries(UMRAH_SHIFT_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v[lang]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{bi(lang, 'ملاحظات التكليف', 'Notes')}</label>
              <input type="text" value={stNotes} onChange={(e) => setStNotes(e.target.value)} className={inputCls} />
            </div>
            <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-2">
              <button type="submit" disabled={savingStaff} className={btnPrimaryCls}>
                <Plus className="w-3.5 h-3.5" />
                <span>
                  {editStaffId !== null ? bi(lang, 'تحديث البيانات', 'Update Staff') : bi(lang, 'إضافة للقائمة', 'Save Staff')}
                </span>
              </button>
              {editStaffId !== null && (
                <button type="button" onClick={resetStaffForm} className={btnSecondaryCls}>
                  {bi(lang, 'إلغاء', 'Cancel')}
                </button>
              )}
            </div>
          </form>
        </Panel>

        <Panel
          title={bi(lang, 'قائمة المشرفين والمناديب ومناوباتهم', 'Supervisors & Delegates Roster')}
          actions={
            <button type="button" onClick={exportStaffCsv} className={btnSecondaryCls}>
              <Download className="w-3.5 h-3.5" />
              <span>{tKey(lang, 'exportCsv')}</span>
            </button>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <input
              type="text"
              value={stSearch}
              onChange={(e) => setStSearch(e.target.value)}
              placeholder={bi(lang, 'بحث بالاسم / الجوال / المجموعة / الحافلة...', 'Search name, phone, group...')}
              className={inputCls}
            />
            <select
              value={stFilterCity}
              onChange={(e) => setStFilterCity(e.target.value as 'all' | UmrahFieldCity)}
              className={inputCls}
            >
              <option value="all">{bi(lang, 'كل المواقع والمدن', 'All Cities')}</option>
              {Object.entries(UMRAH_FIELD_CITIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v[lang]}
                </option>
              ))}
            </select>
            <select
              value={stFilterRole}
              onChange={(e) => setStFilterRole(e.target.value as 'all' | UmrahStaffRole)}
              className={inputCls}
            >
              <option value="all">{bi(lang, 'كل الأدوار', 'All Roles')}</option>
              {Object.entries(UMRAH_STAFF_ROLES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v[lang]}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-y border-slate-200 text-slate-600">
                  <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'المشرف / المندوب', 'Name')}</th>
                  <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'الدور', 'Role')}</th>
                  <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'الموقع', 'City')}</th>
                  <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'الجوال', 'Phone')}</th>
                  <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'المجموعة والحافلة', 'Group & Bus')}</th>
                  <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'المناوبة', 'Shift')}</th>
                  <th className="py-2.5 px-3 text-end font-semibold">{bi(lang, 'إجراءات', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStaff.length === 0 ? (
                  <EmptyRow colSpan={7} lang={lang} />
                ) : (
                  filteredStaff.map((s) => {
                    const st = UMRAH_SHIFT_STATUS[s.shiftStatus];
                    return (
                      <tr key={s.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">{s.name}</div>
                          {s.notes && <div className="text-[11px] text-slate-500">{s.notes}</div>}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">{UMRAH_STAFF_ROLES[s.role][lang]}</td>
                        <td className="py-2.5 px-3 text-slate-700">{UMRAH_FIELD_CITIES[s.city][lang]}</td>
                        <td className="py-2.5 px-3 font-mono-num text-slate-600">{s.phone || '-'}</td>
                        <td className="py-2.5 px-3 font-mono-num">
                          <div className="text-slate-800 font-semibold">{s.assignedGroup || '-'}</div>
                          <div className="text-[11px] text-slate-500">{s.assignedBus || '-'}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <select
                            value={s.shiftStatus}
                            onChange={(e) => void handleStaffShiftChange(s, e.target.value as UmrahShiftStatus)}
                            className={`px-2 py-1 rounded-md text-[11px] font-semibold border border-slate-200 cursor-pointer ${st.cls}`}
                          >
                            {Object.entries(UMRAH_SHIFT_STATUS).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v[lang]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5 px-3 text-end">
                          <div className="inline-flex items-center gap-1.5">
                            <button type="button" onClick={() => handleEditStaff(s)} className={btnSoftBlueCls}>
                              <Edit3 className="w-3 h-3" />
                              <span>{tKey(lang, 'edit')}</span>
                            </button>
                            <button type="button" onClick={() => handleDeleteStaffConfirm(s)} className={btnSoftRedCls}>
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
  }

  // --- Mode: Transport (Buses between Makkah, Madinah & Jeddah) ---
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <KpiCard label={bi(lang, 'إجمالي رحلات الحافلات', 'Bus Trips')} value={filteredTransports.length} tone="slate" />
        <KpiCard label={bi(lang, 'عدد الحافلات التشغيلية', 'Total Buses')} value={trnStats.buses} tone="blue" />
        <KpiCard label={bi(lang, 'إجمالي المعتمرين المنقولين', 'Transported Pax')} value={trnStats.pax} tone="teal" />
        <KpiCard
          label={bi(lang, 'صافي ربح النقل (ر.س)', 'Transport Net Profit')}
          value={`${fmt(trnStats.profit)} ${bi(lang, 'ر.س', 'SAR')}`}
          sub={`${bi(lang, 'المبيعات:', 'Sales:')} ${fmt(trnStats.sales)}`}
          tone="emerald"
        />
      </div>

      <Panel
        title={
          <span className="flex items-center gap-2">
            <Bus className="w-4 h-4 text-[#1d4ed8]" />
            {editTrnId !== null
              ? bi(lang, 'تعديل رحلة نقل بين مكة والمدينة وجدة', 'Edit Intercity Bus Trip')
              : bi(lang, 'إضافة رحلة حافلة ونقل بين مكة والمدينة وجدة', 'Schedule Intercity Bus & Shuttle')}
          </span>
        }
      >
        <form onSubmit={handleSaveTrn} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div>
            <label className={labelCls}>{bi(lang, 'خط السير *', 'Route *')}</label>
            <input
              list="umrah-intercity-routes"
              value={trnRoute}
              onChange={(e) => setTrnRoute(e.target.value)}
              className={inputCls}
              required
            />
            <datalist id="umrah-intercity-routes">
              {INTERCITY_ROUTES.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'التاريخ', 'Date')}</label>
            <input type="date" value={trnDate} onChange={(e) => setTrnDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'كود المجموعة', 'Group Code')}</label>
            <input
              list="umrah-trn-groups"
              value={trnGroupNo}
              onChange={(e) => setTrnGroupNo(e.target.value)}
              placeholder="UMR-1448-001"
              className={inputCls}
            />
            <datalist id="umrah-trn-groups">
              {groupCodes.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'المرجع', 'Ref No')}</label>
            <input type="text" value={trnRefNo} onChange={(e) => setTrnRefNo(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'نوع المركبة', 'Vehicle Type')}</label>
            <select value={trnVehicleType} onChange={(e) => setTrnVehicleType(e.target.value)} className={inputCls}>
              {VEHICLE_TYPES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'عدد الحافلات', 'Bus Count')}</label>
            <input
              type="number"
              min={1}
              value={trnVehicleCount}
              onChange={(e) => setTrnVehicleCount(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'عدد المعتمرين', 'Pax')}</label>
            <input type="number" min={0} value={trnPax} onChange={(e) => setTrnPax(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'شركة النقل / المورد *', 'Transport Supplier *')}</label>
            <input
              list="umrah-trn-suppliers"
              value={trnSupplier}
              onChange={(e) => setTrnSupplier(e.target.value)}
              placeholder={bi(lang, 'شركة الحافلات / المورد', 'Fleet supplier')}
              className={inputCls}
            />
            <datalist id="umrah-trn-suppliers">
              {supplierNames.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'الوكيل / العميل', 'Agent / Customer')}</label>
            <input
              list="umrah-trn-customers"
              value={trnCustomer}
              onChange={(e) => setTrnCustomer(e.target.value)}
              className={inputCls}
            />
            <datalist id="umrah-trn-customers">
              {customerNames.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'اسم السائق', 'Driver Name')}</label>
            <input
              type="text"
              value={trnDriverName}
              onChange={(e) => setTrnDriverName(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'رقم اللوحة / الكود', 'Plate No')}</label>
            <input type="text" value={trnPlateNo} onChange={(e) => setTrnPlateNo(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'العملة', 'Currency')}</label>
            <select value={trnCurrency} onChange={(e) => setTrnCurrency(e.target.value as Currency)} className={inputCls}>
              <option value="SAR">SAR</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'تكلفة الحافلة', 'Buy / Bus')}</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={trnBuy}
              onChange={(e) => setTrnBuy(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>{bi(lang, 'سعر البيع للحافلة', 'Sell / Bus')}</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={trnSell}
              onChange={(e) => setTrnSell(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>{bi(lang, 'ملاحظات التحرك', 'Notes')}</label>
            <input type="text" value={trnNotes} onChange={(e) => setTrnNotes(e.target.value)} className={inputCls} />
          </div>
          <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-2">
            <button type="submit" disabled={savingTrn} className={btnPrimaryCls}>
              <Plus className="w-3.5 h-3.5" />
              <span>
                {editTrnId !== null ? bi(lang, 'تحديث رحلة النقل', 'Update Trip') : bi(lang, 'حفظ رحلة النقل', 'Save Trip')}
              </span>
            </button>
            {editTrnId !== null && (
              <button type="button" onClick={resetTrnForm} className={btnSecondaryCls}>
                {bi(lang, 'إلغاء', 'Cancel')}
              </button>
            )}
          </div>
        </form>
      </Panel>

      <Panel
        title={bi(lang, 'سجل حركة الحافلات بين مكة والمدينة وجدة', 'Intercity Buses & Transport Log')}
        actions={
          <button type="button" onClick={exportTransportCsv} className={btnSecondaryCls}>
            <Download className="w-3.5 h-3.5" />
            <span>{tKey(lang, 'exportCsv')}</span>
          </button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <input
            type="text"
            value={trnSearch}
            onChange={(e) => setTrnSearch(e.target.value)}
            placeholder={bi(lang, 'بحث بالمسار / المجموعة / السائق / اللوحة / المورد...', 'Search route, group, driver, plate...')}
            className={inputCls}
          />
          <select value={trnFilterRoute} onChange={(e) => setTrnFilterRoute(e.target.value)} className={inputCls}>
            <option value="all">{bi(lang, 'كل خطوط السير', 'All Routes')}</option>
            <option value="مكة">{bi(lang, 'خطوط مكة المكرمة', 'Makkah Routes')}</option>
            <option value="المدينة">{bi(lang, 'خطوط المدينة المنورة', 'Madinah Routes')}</option>
            <option value="جدة">{bi(lang, 'خطوط جدة والمطار', 'Jeddah / Airport')}</option>
            <option value="مزارات">{bi(lang, 'المزارات', 'Ziyarat')}</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-y border-slate-200 text-slate-600">
                <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'المرجع والتاريخ', 'Ref & Date')}</th>
                <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'المسار والمجموعة', 'Route & Group')}</th>
                <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'الحافلة والركاب', 'Bus & Pax')}</th>
                <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'السائق واللوحة', 'Driver & Plate')}</th>
                <th className="py-2.5 px-3 text-start font-semibold">{bi(lang, 'المورد والعميل', 'Supplier & Agent')}</th>
                <th className="py-2.5 px-3 text-end font-semibold">{bi(lang, 'البيع / الربح ر.س', 'Sell / Profit')}</th>
                <th className="py-2.5 px-3 text-end font-semibold">{bi(lang, 'إجراءات', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTransports.length === 0 ? (
                <EmptyRow colSpan={7} lang={lang} />
              ) : (
                filteredTransports.map((t) => {
                  const v = trnVals(t, db.rate);
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 font-mono-num">
                        <div className="font-semibold text-slate-900">{t.refNo}</div>
                        <div className="text-[11px] text-slate-500">{t.date}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-800">{t.route}</div>
                        <div className="text-[11px] text-slate-500 font-mono-num">{t.groupNo || '-'}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-slate-800">
                          {t.vehicleCount} × {t.vehicleType}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono-num">
                          {t.pax} {bi(lang, 'معتمر', 'pax')}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-slate-800">{t.driverName || '-'}</div>
                        <div className="text-[11px] text-slate-500 font-mono-num">{t.plateNo || '-'}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-slate-800">{t.supplier}</div>
                        <div className="text-[11px] text-slate-500">{t.customer || '-'}</div>
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono-num">
                        <div className="font-bold text-slate-900">{fmt(v.sales)}</div>
                        <div className={`text-[11px] font-semibold ${v.profit >= 0 ? 'text-[#0f766e]' : 'text-red-600'}`}>
                          {fmt(v.profit)}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-end">
                        <div className="inline-flex items-center gap-1.5">
                          <button type="button" onClick={() => handleEditTrn(t)} className={btnSoftBlueCls}>
                            <Edit3 className="w-3 h-3" />
                            <span>{tKey(lang, 'edit')}</span>
                          </button>
                          <button type="button" onClick={() => handleDeleteTrnConfirm(t)} className={btnSoftRedCls}>
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
