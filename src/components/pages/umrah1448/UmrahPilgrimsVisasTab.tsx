import React, { useMemo, useState } from 'react';
import { BadgeCheck, ClipboardPaste, Download, Edit3, Plus, ScanLine, Trash2, UserPlus } from 'lucide-react';
import {
  UmrahPilgrim,
  UmrahVisaStatus,
} from '../../../types/accounting';
import { bi, tKey } from '../../../i18n/translations';
import { csvDownload, fmt, sumBy, today } from '../../../utils/calculations';
import {
  EmptyRow,
  KpiCard,
  Panel,
  btnPrimaryCls,
  btnSecondaryCls,
  btnSoftBlueCls,
  btnSoftRedCls,
  btnTealCls,
  inputCls,
  labelCls,
} from '../../AccountingUI';
import { UMRAH_VISA_STATUS, UmrahSharedProps } from './umrahShared';
import { PassportMrzModal } from './PassportMrzModal';

interface Props extends UmrahSharedProps {
  mode: 'pilgrims' | 'visas';
}

export const UmrahPilgrimsVisasTab: React.FC<Props> = ({
  mode,
  db,
  lang,
  onSavePilgrim,
  onImportPilgrims,
  onDeletePilgrim,
  onToast,
  onConfirm,
}) => {
  const pilgrims = db.umrahPilgrims || [];
  const groups = db.umrahGroups || [];
  const agents = db.umrahAgents || [];

  const [editId, setEditId] = useState<number | null>(null);
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [nationality, setNationality] = useState('مصري');
  const [passportNo, setPassportNo] = useState('');
  const [passportExpiry, setPassportExpiry] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [groupCode, setGroupCode] = useState(() => groups[0]?.groupCode || 'UMR-1448-001');
  const [agentName, setAgentName] = useState(() => groups[0]?.agentName || agents[0]?.name || '');
  const [visaNo, setVisaNo] = useState('');
  const [visaStatus, setVisaStatus] = useState<UmrahVisaStatus>('draft');
  const [visaIssueDate, setVisaIssueDate] = useState('');
  const [feeSAR, setFeeSAR] = useState('560');
  const [paidSAR, setPaidSAR] = useState('0');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Batch Paste Importer & MRZ Passport Scanner
  const [showBatch, setShowBatch] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [showMrzScanner, setShowMrzScanner] = useState(false);

  // Filters
  const [filterGroup, setFilterGroup] = useState('all');
  const [filterVisaStatus, setFilterVisaStatus] = useState<'all' | UmrahVisaStatus>('all');
  const [search, setSearch] = useState('');

  // Track editing existing record fields so hotel/flight assignments aren't overwritten
  const editingOrigin = useMemo(
    () => (editId ? pilgrims.find((p) => p.id === editId) : undefined),
    [editId, pilgrims]
  );

  const groupCodes = useMemo(() => {
    const s = new Set<string>();
    groups.forEach((g) => s.add(g.groupCode));
    db.entries.forEach((e) => s.add(e.groupNo));
    pilgrims.forEach((p) => p.groupCode && s.add(p.groupCode));
    return Array.from(s);
  }, [groups, db.entries, pilgrims]);

  const handleGroupChange = (nextCode: string) => {
    setGroupCode(nextCode);
    const matchedGroup = groups.find((g) => g.groupCode === nextCode);
    if (matchedGroup) {
      setAgentName(matchedGroup.agentName);
      if (!editId && matchedGroup.visaSellSAR > 0) {
        setFeeSAR(String(matchedGroup.visaSellSAR));
      }
    } else {
      const matchedEntry = db.entries.find((e) => e.groupNo === nextCode);
      if (matchedEntry) setAgentName(matchedEntry.customer);
    }
  };

  const resetForm = () => {
    setEditId(null);
    setFullName('');
    setGender('male');
    setNationality('مصري');
    setPassportNo('');
    setPassportExpiry('');
    setBirthDate('');
    setPhone('');
    setVisaNo('');
    setVisaStatus('draft');
    setVisaIssueDate('');
    setFeeSAR('560');
    setPaidSAR('0');
    setNotes('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !passportNo.trim() || !groupCode.trim()) return;
    setSaving(true);
    try {
      const payload: UmrahPilgrim = {
        id: editId || Date.now(),
        fullName: fullName.trim(),
        gender,
        nationality: nationality.trim() || 'مصري',
        passportNo: passportNo.trim().toUpperCase(),
        passportExpiry,
        birthDate,
        phone: phone.trim(),
        groupCode: groupCode.trim(),
        agentName: agentName.trim(),
        visaNo: visaNo.trim(),
        visaStatus,
        visaIssueDate,
        makkahHotel: editingOrigin?.makkahHotel || '',
        makkahRoomNo: editingOrigin?.makkahRoomNo || '',
        madinahHotel: editingOrigin?.madinahHotel || '',
        madinahRoomNo: editingOrigin?.madinahRoomNo || '',
        jeddahHotel: editingOrigin?.jeddahHotel || '',
        jeddahRoomNo: editingOrigin?.jeddahRoomNo || '',
        roomType: editingOrigin?.roomType || 'quad',
        flightNo: editingOrigin?.flightNo || '',
        busNo: editingOrigin?.busNo || '',
        arrivalStatus: editingOrigin?.arrivalStatus || 'pending',
        feeSAR: Math.max(0, Number(feeSAR || 0)),
        paidSAR: Math.max(0, Number(paidSAR || 0)),
        notes: notes.trim(),
      };
      await onSavePilgrim(payload, Boolean(editId));
      onToast(
        editId
          ? bi(lang, 'تم تحديث بيانات المعتمر والجواز', 'Pilgrim record updated')
          : bi(lang, 'تم تسجيل المعتمر بنجاح', 'Pilgrim registered')
      );
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleBatchImport = async () => {
    const lines = batchText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    let baseId = Date.now();
    const items: UmrahPilgrim[] = [];
    for (const line of lines) {
      const cols = line.includes('\t') ? line.split('\t') : line.split(',');
      const name = (cols[0] || '').trim();
      const pass = (cols[1] || '').trim().toUpperCase();
      if (!name || !pass || name.includes('الاسم') || name.toLowerCase() === 'name') continue;
      const nat = (cols[2] || 'مصري').trim();
      const gRaw = (cols[3] || '').trim().toLowerCase();
      const gVal: 'male' | 'female' = gRaw.includes('أنثى') || gRaw === 'f' || gRaw === 'female' ? 'female' : 'male';
      const grp = (cols[4] || groupCode || 'UMR-1448-001').trim();
      const ph = (cols[5] || '').trim();
      const exp = (cols[6] || '').trim();
      const fee = Number(cols[7] || feeSAR || 0) || 0;

      items.push({
        id: ++baseId,
        fullName: name,
        gender: gVal,
        nationality: nat,
        passportNo: pass,
        passportExpiry: exp,
        birthDate: '',
        phone: ph,
        groupCode: grp,
        agentName: agentName.trim(),
        visaNo: '',
        visaStatus: 'draft',
        visaIssueDate: '',
        makkahHotel: '',
        makkahRoomNo: '',
        madinahHotel: '',
        madinahRoomNo: '',
        jeddahHotel: '',
        jeddahRoomNo: '',
        roomType: 'quad',
        flightNo: '',
        busNo: '',
        arrivalStatus: 'pending',
        feeSAR: Math.max(0, fee),
        paidSAR: 0,
        notes: '',
      });
    }

    if (items.length === 0) {
      onToast(bi(lang, 'لم يتم العثور على صفوف صالحة (الاسم، رقم الجواز)', 'No valid rows found'), 'error');
      return;
    }

    setSaving(true);
    try {
      await onImportPilgrims(items);
      onToast(bi(lang, `تم استيراد ${items.length} معتمر بنجاح`, `Imported ${items.length} pilgrims`));
      setBatchText('');
      setShowBatch(false);
    } finally {
      setSaving(false);
    }
  };

  const filteredPilgrims = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pilgrims.filter((p) => {
      if (filterGroup !== 'all' && p.groupCode !== filterGroup) return false;
      if (filterVisaStatus !== 'all' && p.visaStatus !== filterVisaStatus) return false;
      if (
        q &&
        !`${p.fullName} ${p.passportNo} ${p.visaNo} ${p.groupCode} ${p.agentName} ${p.nationality} ${p.phone}`
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [pilgrims, filterGroup, filterVisaStatus, search]);

  const counts = useMemo(() => {
    return {
      total: pilgrims.length,
      draft: pilgrims.filter((p) => p.visaStatus === 'draft').length,
      submitted: pilgrims.filter((p) => p.visaStatus === 'submitted').length,
      issued: pilgrims.filter((p) => p.visaStatus === 'issued').length,
      rejected: pilgrims.filter((p) => p.visaStatus === 'rejected').length,
      totalFee: sumBy(filteredPilgrims, (p) => p.feeSAR),
      totalPaid: sumBy(filteredPilgrims, (p) => p.paidSAR),
    };
  }, [pilgrims, filteredPilgrims]);

  const startEdit = (p: UmrahPilgrim) => {
    setEditId(p.id);
    setFullName(p.fullName);
    setGender(p.gender);
    setNationality(p.nationality);
    setPassportNo(p.passportNo);
    setPassportExpiry(p.passportExpiry);
    setBirthDate(p.birthDate);
    setPhone(p.phone);
    setGroupCode(p.groupCode);
    setAgentName(p.agentName);
    setVisaNo(p.visaNo);
    setVisaStatus(p.visaStatus);
    setVisaIssueDate(p.visaIssueDate);
    setFeeSAR(String(p.feeSAR));
    setPaidSAR(String(p.paidSAR));
    setNotes(p.notes);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-5">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <KpiCard
          label={bi(lang, 'إجمالي المعتمرين المسجلين', 'Total Registered Pilgrims')}
          value={counts.total}
          sub={bi(lang, `الذكور: ${pilgrims.filter((p) => p.gender === 'male').length} · الإناث: ${pilgrims.filter((p) => p.gender === 'female').length}`, `M: ${pilgrims.filter((p) => p.gender === 'male').length} · F: ${pilgrims.filter((p) => p.gender === 'female').length}`)}
          tone="blue"
        />
        <KpiCard
          label={bi(lang, 'تأشيرات صادرة', 'Issued Visas')}
          value={counts.issued}
          sub={bi(lang, `مرفوعة للمنصة: ${counts.submitted}`, `Submitted: ${counts.submitted}`)}
          tone="teal"
        />
        <KpiCard
          label={bi(lang, 'مسودات / بانتظار الرفع', 'Draft / Pending')}
          value={counts.draft}
          sub={bi(lang, `مرفوضة: ${counts.rejected}`, `Rejected: ${counts.rejected}`)}
          tone="amber"
        />
        <KpiCard
          label={bi(lang, 'إجمالي الرسوم / المدفوع (ر.س)', 'Fees / Paid (SAR)')}
          value={fmt(counts.totalFee)}
          sub={bi(lang, `المدفوع: ${fmt(counts.totalPaid)} ر.س`, `Paid: ${fmt(counts.totalPaid)} SAR`)}
          tone="emerald"
        />
      </div>

      {/* Form Panel (Pilgrim & Passport OR Visa Entry) */}
      {(mode === 'pilgrims' || editId !== null) && (
        <Panel
          className="no-print"
          title={
            <span className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#1d4ed8]" />
              <span>
                {editId
                  ? bi(lang, 'تعديل بيانات المعتمر والجواز والتأشيرة', 'Edit Pilgrim, Passport & Visa')
                  : bi(lang, 'تسجيل معتمر جديد وبيانات جواز السفر', 'Register Pilgrim & Passport Data')}
              </span>
            </span>
          }
          actions={
            <>
              {mode === 'pilgrims' && (
                <button
                  type="button"
                  onClick={() => setShowMrzScanner(true)}
                  className={btnPrimaryCls}
                >
                  <ScanLine className="w-3.5 h-3.5" />
                  <span>{bi(lang, 'قراءة جواز السفر (MRZ)', 'Read Passport MRZ')}</span>
                </button>
              )}
              {mode === 'pilgrims' && !editId && (
                <button
                  type="button"
                  onClick={() => setShowBatch((s) => !s)}
                  className={btnTealCls}
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  <span>{bi(lang, 'إدخال جماعي من Excel', 'Batch Paste from Excel')}</span>
                </button>
              )}
              <button type="button" onClick={resetForm} className={btnSecondaryCls}>
                {tKey(lang, 'btnClear')}
              </button>
            </>
          }
        >
          {showBatch && (
            <div className="mb-4 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="text-xs font-bold text-slate-800">
                {bi(
                  lang,
                  'الصق بيانات المعتمرين (الاسم، رقم الجواز، الجنسية، النوع ذكر/أنثى، كود المجموعة، الجوال، انتهاء الجواز، الرسوم):',
                  'Paste pilgrim rows (Name, Passport #, Nationality, Gender, Group Code, Phone, Expiry, Fee):'
                )}
              </div>
              <textarea
                rows={4}
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                placeholder={bi(
                  lang,
                  'أحمد محمد علي\tA12345678\tمصري\tذكر\tUMR-1448-001\t01012345678\t2030-05-01\t560',
                  'Ahmed Ali\tA12345678\tEgyptian\tMale\tUMR-1448-001\t01012345678\t2030-05-01\t560'
                )}
                className="w-full p-3 rounded-xl border border-slate-200 bg-white text-xs font-mono-num"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowBatch(false)} className={btnSecondaryCls}>
                  {tKey(lang, 'btnCancel')}
                </button>
                <button type="button" disabled={saving} onClick={() => void handleBatchImport()} className={btnPrimaryCls}>
                  {bi(lang, 'استيراد المعتمرين', 'Import Pilgrims')}
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div>
                <label className={labelCls}>{bi(lang, 'الاسم الكامل (كما بالجواز) *', 'Full Name (Passport) *')}</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{bi(lang, 'رقم جواز السفر *', 'Passport # *')}</label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={passportNo}
                  onChange={(e) => setPassportNo(e.target.value)}
                  className={`${inputCls} font-mono-num uppercase`}
                />
              </div>
              <div>
                <label className={labelCls}>{bi(lang, 'انتهاء جواز السفر', 'Passport Expiry')}</label>
                <input
                  type="date"
                  value={passportExpiry}
                  onChange={(e) => setPassportExpiry(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{bi(lang, 'تاريخ الميلاد', 'Birth Date')}</label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{bi(lang, 'الجنسية', 'Nationality')}</label>
                <input
                  type="text"
                  value={nationality}
                  onChange={(e) => setNationality(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{bi(lang, 'النوع', 'Gender')}</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as 'male' | 'female')}
                  className={inputCls}
                >
                  <option value="male">{bi(lang, 'ذكر', 'Male')}</option>
                  <option value="female">{bi(lang, 'أنثى', 'Female')}</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>{bi(lang, 'المجموعة *', 'Group Code *')}</label>
                <input
                  type="text"
                  required
                  list="pilgrim-group-codes"
                  value={groupCode}
                  onChange={(e) => handleGroupChange(e.target.value)}
                  className={`${inputCls} font-mono-num`}
                />
                <datalist id="pilgrim-group-codes">
                  {groupCodes.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className={labelCls}>{bi(lang, 'الوكيل / الشركة', 'Agent / Company')}</label>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{bi(lang, 'رقم الجوال', 'Phone')}</label>
                <input
                  type="text"
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={`${inputCls} font-mono-num`}
                />
              </div>
              <div>
                <label className={labelCls}>{bi(lang, 'رقم التأشيرة (إن وجد)', 'Visa #')}</label>
                <input
                  type="text"
                  dir="ltr"
                  value={visaNo}
                  onChange={(e) => setVisaNo(e.target.value)}
                  className={`${inputCls} font-mono-num`}
                />
              </div>
              <div>
                <label className={labelCls}>{bi(lang, 'حالة التأشيرة', 'Visa Status')}</label>
                <select
                  value={visaStatus}
                  onChange={(e) => setVisaStatus(e.target.value as UmrahVisaStatus)}
                  className={inputCls}
                >
                  {(Object.keys(UMRAH_VISA_STATUS) as UmrahVisaStatus[]).map((vs) => (
                    <option key={vs} value={vs}>
                      {UMRAH_VISA_STATUS[vs][lang]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{bi(lang, 'الرسوم / المدفوع (ر.س)', 'Fee / Paid (SAR)')}</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={feeSAR}
                    onChange={(e) => setFeeSAR(e.target.value)}
                    placeholder={bi(lang, 'الرسوم', 'Fee')}
                    className={`${inputCls} font-mono-num`}
                  />
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={paidSAR}
                    onChange={(e) => setPaidSAR(e.target.value)}
                    placeholder={bi(lang, 'المدفوع', 'Paid')}
                    className={`${inputCls} font-mono-num`}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-end">
              <div className="lg:col-span-9">
                <label className={labelCls}>{tKey(lang, 'lblNotes')}</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="lg:col-span-3 flex justify-end">
                <button type="submit" disabled={saving} className={btnPrimaryCls}>
                  <Plus className="w-3.5 h-3.5" />
                  <span>{editId ? bi(lang, 'تحديث البيانات', 'Update Pilgrim') : bi(lang, 'حفظ المعتمر', 'Save Pilgrim')}</span>
                </button>
              </div>
            </div>
          </form>
        </Panel>
      )}

      {/* Registry / Visa Processing Table */}
      <Panel
        title={
          <span className="flex items-center gap-2">
            <BadgeCheck className="w-4 h-4 text-[#0f766e]" />
            <span>
              {mode === 'visas'
                ? bi(lang, 'إدارة التأشيرات وحالات إصدارها (تحديث فوري)', 'Visa Issuance & Status Tracking')
                : bi(lang, 'سجل المعتمرين وبيانات جوازات السفر', 'Pilgrims & Passports Registry')}
            </span>
          </span>
        }
        actions={
          <>
            <select
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
              className="h-9 px-3 rounded-xl border border-slate-200 text-xs bg-white"
            >
              <option value="all">{bi(lang, 'كل المجموعات', 'All Groups')}</option>
              {groupCodes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={filterVisaStatus}
              onChange={(e) => setFilterVisaStatus(e.target.value as 'all' | UmrahVisaStatus)}
              className="h-9 px-3 rounded-xl border border-slate-200 text-xs bg-white"
            >
              <option value="all">{bi(lang, 'كل حالات التأشيرة', 'All Visa Statuses')}</option>
              {(Object.keys(UMRAH_VISA_STATUS) as UmrahVisaStatus[]).map((vs) => (
                <option key={vs} value={vs}>
                  {UMRAH_VISA_STATUS[vs][lang]}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={bi(lang, 'بحث بالاسم / الجواز / التأشيرة...', 'Search name / passport / visa...')}
              className="h-9 px-3 rounded-xl border border-slate-200 text-xs w-48 focus:outline-none focus:border-[#1d4ed8]"
            />
            <button
              type="button"
              onClick={() =>
                csvDownload(`umrah_1448_${mode}.csv`, [
                  ['Full Name', 'Gender', 'Nationality', 'Passport #', 'Expiry', 'Group', 'Agent', 'Visa #', 'Visa Status', 'Issue Date', 'Fee SAR', 'Paid SAR'],
                  ...filteredPilgrims.map((p) => [
                    p.fullName,
                    p.gender,
                    p.nationality,
                    p.passportNo,
                    p.passportExpiry,
                    p.groupCode,
                    p.agentName,
                    p.visaNo,
                    p.visaStatus,
                    p.visaIssueDate,
                    p.feeSAR,
                    p.paidSAR,
                  ]),
                ])
              }
              className={btnSecondaryCls}
            >
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
                <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'المعتمر', 'Pilgrim')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'جواز السفر / الانتهاء', 'Passport / Expiry')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'المجموعة والوكيل', 'Group & Agent')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'رقم التأشيرة', 'Visa #')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'حالة التأشيرة', 'Visa Status')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'تاريخ الإصدار', 'Issue Date')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'الرسوم / المتبقي', 'Fee / Balance')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold no-print">{tKey(lang, 'thAction')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPilgrims.length === 0 ? (
                <EmptyRow colSpan={8} lang={lang} />
              ) : (
                filteredPilgrims.map((p) => {
                  const st = UMRAH_VISA_STATUS[p.visaStatus];
                  const remaining = Math.max(0, p.feeSAR - p.paidSAR);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="py-2 px-2.5">
                        <div className="font-semibold text-slate-900">{p.fullName}</div>
                        <div className="text-[11px] text-slate-500">
                          {p.nationality} · {p.gender === 'male' ? bi(lang, 'ذكر', 'Male') : bi(lang, 'أنثى', 'Female')}
                          {p.phone ? ` · ${p.phone}` : ''}
                        </div>
                      </td>
                      <td className="py-2 px-2.5 font-mono-num">
                        <div className="font-bold text-slate-900">{p.passportNo}</div>
                        {p.passportExpiry && (
                          <div className="text-[11px] text-slate-500">{p.passportExpiry}</div>
                        )}
                      </td>
                      <td className="py-2 px-2.5">
                        <div className="font-mono-num font-bold text-[#1d4ed8]">{p.groupCode}</div>
                        <div className="text-[11px] text-slate-500">{p.agentName || '-'}</div>
                      </td>
                      <td className="py-2 px-2.5">
                        {mode === 'visas' ? (
                          <input
                            type="text"
                            dir="ltr"
                            defaultValue={p.visaNo}
                            placeholder={bi(lang, 'أدخل رقم التأشيرة', 'Enter Visa #')}
                            onBlur={(e) => {
                              const next = e.target.value.trim();
                              if (next !== p.visaNo) {
                                void onSavePilgrim(
                                  {
                                    ...p,
                                    visaNo: next,
                                    visaStatus: next && p.visaStatus === 'draft' ? 'issued' : p.visaStatus,
                                    visaIssueDate: next && !p.visaIssueDate ? today() : p.visaIssueDate,
                                  },
                                  true
                                );
                              }
                            }}
                            className="h-8 w-32 px-2 rounded-lg border border-slate-200 bg-white font-mono-num text-xs"
                          />
                        ) : (
                          <span className="font-mono-num font-semibold">{p.visaNo || '-'}</span>
                        )}
                      </td>
                      <td className="py-2 px-2.5">
                        <select
                          value={p.visaStatus}
                          onChange={(e) => {
                            const nextSt = e.target.value as UmrahVisaStatus;
                            void onSavePilgrim(
                              {
                                ...p,
                                visaStatus: nextSt,
                                visaIssueDate: nextSt === 'issued' && !p.visaIssueDate ? today() : p.visaIssueDate,
                              },
                              true
                            );
                          }}
                          className={`px-2 py-1 rounded text-[11px] font-semibold border border-slate-200 ${st.cls}`}
                        >
                          {(Object.keys(UMRAH_VISA_STATUS) as UmrahVisaStatus[]).map((k) => (
                            <option key={k} value={k}>
                              {UMRAH_VISA_STATUS[k][lang]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-2.5 font-mono-num text-slate-600">{p.visaIssueDate || '-'}</td>
                      <td className="py-2 px-2.5 font-mono-num">
                        <div>{fmt(p.feeSAR)}</div>
                        <div className={`text-[11px] ${remaining > 0 ? 'text-amber-700 font-semibold' : 'text-[#0f766e]'}`}>
                          {remaining > 0
                            ? `${bi(lang, 'متبقي:', 'Due:')} ${fmt(remaining)}`
                            : bi(lang, 'مسدد', 'Paid')}
                        </div>
                      </td>
                      <td className="py-2 px-2.5 no-print">
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={() => startEdit(p)} className={btnSoftBlueCls}>
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onConfirm({
                                title: bi(lang, 'حذف سجل معتمر', 'Delete Pilgrim'),
                                message: bi(lang, `حذف "${p.fullName}"؟`, `Delete "${p.fullName}"?`),
                                danger: true,
                                onConfirm: () => onDeletePilgrim(p.id),
                              })
                            }
                            className={btnSoftRedCls}
                          >
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

      <PassportMrzModal
        open={showMrzScanner}
        lang={lang}
        defaultGroupCode={groupCode}
        defaultAgentName={agentName}
        defaultFeeSAR={Number(feeSAR || 0)}
        onClose={() => setShowMrzScanner(false)}
        onFillForm={(data) => {
          setFullName(data.fullName);
          setPassportNo(data.passportNo);
          setNationality(data.nationality);
          setGender(data.gender);
          if (data.birthDate) setBirthDate(data.birthDate);
          if (data.passportExpiry) setPassportExpiry(data.passportExpiry);
          if (data.notes) setNotes(data.notes);
          onToast(bi(lang, 'تمت تعبئة بيانات جواز السفر في النموذج للمراجعة والحفظ', 'Passport fields populated in form'));
        }}
        onBatchSave={onImportPilgrims}
        onToast={onToast}
      />
    </div>
  );
};
