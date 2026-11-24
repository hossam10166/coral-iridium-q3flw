import React, { useMemo, useState } from 'react';
import { Building2, Download, Edit3, Layers, Plus, Trash2 } from 'lucide-react';
import {
  UmrahAgent,
  UmrahAgentStatus,
  UmrahGroup,
  UmrahGroupStatus,
  UmrahProgramType,
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
import {
  UMRAH_GROUP_STATUS,
  UMRAH_PROGRAM_LABELS,
  UmrahSharedProps,
} from './umrahShared';

interface Props extends UmrahSharedProps {
  mode: 'agents' | 'groups';
}

export const UmrahAgentsGroupsTab: React.FC<Props> = ({
  mode,
  db,
  lang,
  onSaveAgent,
  onDeleteAgent,
  onSaveGroup,
  onDeleteGroup,
  onToast,
  onConfirm,
}) => {
  const agents = db.umrahAgents || [];
  const groups = db.umrahGroups || [];
  const pilgrims = db.umrahPilgrims || [];
  const staffList = db.umrahFieldStaff || [];

  // --- Agent Form State ---
  const [editAgentId, setEditAgentId] = useState<number | null>(null);
  const [agtCode, setAgtCode] = useState(() => `AGT-${String(agents.length + 1).padStart(3, '0')}`);
  const [agtName, setAgtName] = useState('');
  const [agtCountry, setAgtCountry] = useState('مصر');
  const [agtLicense, setAgtLicense] = useState('');
  const [agtContact, setAgtContact] = useState('');
  const [agtPhone, setAgtPhone] = useState('');
  const [agtEmail, setAgtEmail] = useState('');
  const [agtCommission, setAgtCommission] = useState('0');
  const [agtStatus, setAgtStatus] = useState<UmrahAgentStatus>('active');
  const [agtNotes, setAgtNotes] = useState('');
  const [agtSearch, setAgtSearch] = useState('');
  const [agtFilterStatus, setAgtFilterStatus] = useState<'all' | UmrahAgentStatus>('all');
  const [savingAgt, setSavingAgt] = useState(false);

  // --- Group Form State ---
  const [editGroupId, setEditGroupId] = useState<number | null>(null);
  const [grpCode, setGrpCode] = useState(() => `UMR-1448-${String(groups.length + 1).padStart(3, '0')}`);
  const [grpName, setGrpName] = useState('');
  const [grpProgram, setGrpProgram] = useState<UmrahProgramType>('umrah');
  const [grpAgent, setGrpAgent] = useState('');
  const [grpSupervisor, setGrpSupervisor] = useState('');
  const [grpTargetPax, setGrpTargetPax] = useState('45');
  const [grpVisaBuy, setGrpVisaBuy] = useState('500');
  const [grpVisaSell, setGrpVisaSell] = useState('560');
  const [grpPkgPrice, setGrpPkgPrice] = useState('0');
  const [grpArrival, setGrpArrival] = useState(today());
  const [grpDeparture, setGrpDeparture] = useState('');
  const [grpStatus, setGrpStatus] = useState<UmrahGroupStatus>('planning');
  const [grpNotes, setGrpNotes] = useState('');
  const [grpSearch, setGrpSearch] = useState('');
  const [grpFilterStatus, setGrpFilterStatus] = useState<'all' | UmrahGroupStatus>('all');
  const [grpFilterProgram, setGrpFilterProgram] = useState<'all' | UmrahProgramType>('all');
  const [savingGrp, setSavingGrp] = useState(false);

  const allAgentNames = useMemo(() => {
    const s = new Set<string>();
    agents.forEach((a) => a.name && s.add(a.name));
    db.customers.forEach((c) => c.name && s.add(c.name));
    return Array.from(s);
  }, [agents, db.customers]);

  const supervisorNames = useMemo(() => {
    const s = new Set<string>();
    staffList.forEach((st) => st.name && s.add(st.name));
    db.employees.forEach((e) => e.name && s.add(e.name));
    return Array.from(s);
  }, [staffList, db.employees]);

  const resetAgentForm = () => {
    setEditAgentId(null);
    setAgtCode(`AGT-${String(agents.length + 1).padStart(3, '0')}`);
    setAgtName('');
    setAgtCountry('مصر');
    setAgtLicense('');
    setAgtContact('');
    setAgtPhone('');
    setAgtEmail('');
    setAgtCommission('0');
    setAgtStatus('active');
    setAgtNotes('');
  };

  const resetGroupForm = () => {
    setEditGroupId(null);
    setGrpCode(`UMR-1448-${String(groups.length + 1).padStart(3, '0')}`);
    setGrpName('');
    setGrpProgram('umrah');
    setGrpAgent('');
    setGrpSupervisor('');
    setGrpTargetPax('45');
    setGrpVisaBuy('500');
    setGrpVisaSell('560');
    setGrpPkgPrice('0');
    setGrpArrival(today());
    setGrpDeparture('');
    setGrpStatus('planning');
    setGrpNotes('');
  };

  const handleSaveAgentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agtName.trim()) return;
    setSavingAgt(true);
    try {
      await onSaveAgent(
        {
          id: editAgentId || Date.now(),
          code: agtCode.trim() || `AGT-${Date.now().toString().slice(-4)}`,
          name: agtName.trim(),
          country: agtCountry.trim(),
          licenseNo: agtLicense.trim(),
          contactPerson: agtContact.trim(),
          phone: agtPhone.trim(),
          email: agtEmail.trim(),
          commissionSAR: Math.max(0, Number(agtCommission || 0)),
          status: agtStatus,
          notes: agtNotes.trim(),
        },
        Boolean(editAgentId)
      );
      onToast(
        editAgentId
          ? bi(lang, 'تم تحديث بيانات الشركة / الوكيل', 'Agent updated')
          : bi(lang, 'تم تسجيل الشركة / الوكيل بنجاح', 'Agent saved')
      );
      resetAgentForm();
    } finally {
      setSavingAgt(false);
    }
  };

  const handleSyncCustomersAsAgents = async () => {
    const existingNames = new Set(agents.map((a) => a.name.trim().toLowerCase()));
    const missing = db.customers.filter((c) => c.name && !existingNames.has(c.name.trim().toLowerCase()));
    if (missing.length === 0) {
      onToast(bi(lang, 'جميع العملاء المكوّدين مسجلون بالفعل كوكلاء', 'All customers already registered'), 'info');
      return;
    }
    setSavingAgt(true);
    try {
      let baseId = Date.now();
      for (const c of missing) {
        await onSaveAgent(
          {
            id: ++baseId,
            code: c.code || `AGT-${String(baseId).slice(-4)}`,
            name: c.name,
            country: '',
            licenseNo: '',
            contactPerson: '',
            phone: '',
            email: '',
            commissionSAR: 0,
            status: 'active',
            notes: c.note || '',
          },
          false
        );
      }
      onToast(bi(lang, `تم استيراد ${missing.length} عميل إلى قائمة الوكلاء`, `Imported ${missing.length} agents`));
    } finally {
      setSavingAgt(false);
    }
  };

  const handleSaveGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grpCode.trim() || !grpName.trim() || !grpAgent.trim()) return;
    setSavingGrp(true);
    try {
      await onSaveGroup(
        {
          id: editGroupId || Date.now(),
          groupCode: grpCode.trim(),
          groupName: grpName.trim(),
          season: '1448',
          programType: grpProgram,
          agentName: grpAgent.trim(),
          supervisorName: grpSupervisor.trim(),
          targetPax: Math.max(0, Math.round(Number(grpTargetPax || 0))),
          visaBuySAR: Math.max(0, Number(grpVisaBuy || 0)),
          visaSellSAR: Math.max(0, Number(grpVisaSell || 0)),
          packagePriceSAR: Math.max(0, Number(grpPkgPrice || 0)),
          arrivalDate: grpArrival,
          departureDate: grpDeparture,
          status: grpStatus,
          notes: grpNotes.trim(),
        },
        Boolean(editGroupId)
      );
      onToast(
        editGroupId
          ? bi(lang, 'تم تحديث بيانات المجموعة 1448', 'Group 1448 updated')
          : bi(lang, 'تم إنشاء المجموعة بنجاح', 'Group 1448 created')
      );
      resetGroupForm();
    } finally {
      setSavingGrp(false);
    }
  };

  const filteredAgents = useMemo(() => {
    const q = agtSearch.trim().toLowerCase();
    return agents.filter((a) => {
      if (agtFilterStatus !== 'all' && a.status !== agtFilterStatus) return false;
      if (q && !`${a.code} ${a.name} ${a.country} ${a.licenseNo} ${a.contactPerson} ${a.phone}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [agents, agtFilterStatus, agtSearch]);

  const filteredGroups = useMemo(() => {
    const q = grpSearch.trim().toLowerCase();
    return groups.filter((g) => {
      if (grpFilterStatus !== 'all' && g.status !== grpFilterStatus) return false;
      if (grpFilterProgram !== 'all' && g.programType !== grpFilterProgram) return false;
      if (q && !`${g.groupCode} ${g.groupName} ${g.agentName} ${g.supervisorName}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [groups, grpFilterStatus, grpFilterProgram, grpSearch]);

  if (mode === 'agents') {
    const activeCount = agents.filter((a) => a.status === 'active').length;
    const totalLinkedGroups = groups.length;
    const totalPilgrimsCount = pilgrims.length;

    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <KpiCard
            label={bi(lang, 'إجمالي الشركات والوكلاء', 'Total Partner Companies & Agents')}
            value={agents.length}
            sub={bi(lang, `نشط: ${activeCount}`, `Active: ${activeCount}`)}
            tone="blue"
          />
          <KpiCard
            label={bi(lang, 'مجموعات موسم 1448 المسجلة', 'Registered 1448 Groups')}
            value={totalLinkedGroups}
            tone="teal"
          />
          <KpiCard
            label={bi(lang, 'المعتمرون المسجلون لدى الوكلاء', 'Pilgrims Across Agents')}
            value={totalPilgrimsCount}
            tone="emerald"
          />
        </div>

        <Panel
          className="no-print"
          title={
            <span className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#1d4ed8]" />
              <span>
                {editAgentId
                  ? bi(lang, 'تعديل بيانات شركة / وكيل العمرة', 'Edit Umrah Partner / Agent')
                  : bi(lang, 'إدارة الشركات والوكلاء — إضافة شركة أو وكيل خارجي', 'Partner Companies & External Agents')}
              </span>
            </span>
          }
          actions={
            <>
              {db.customers.length > 0 && (
                <button
                  type="button"
                  disabled={savingAgt}
                  onClick={() => void handleSyncCustomersAsAgents()}
                  className={btnTealCls}
                >
                  {bi(lang, 'استيراد من دليل العملاء', 'Import from Customers')}
                </button>
              )}
              <button type="button" onClick={resetAgentForm} className={btnSecondaryCls}>
                {tKey(lang, 'btnClear')}
              </button>
            </>
          }
        >
          <form onSubmit={handleSaveAgentSubmit} className="space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div>
                <label className={labelCls}>{bi(lang, 'كود الوكيل *', 'Agent Code *')}</label>
                <input
                  type="text"
                  required
                  value={agtCode}
                  onChange={(e) => setAgtCode(e.target.value)}
                  className={`${inputCls} font-mono-num`}
                />
              </div>
              <div>
                <label className={labelCls}>{bi(lang, 'اسم الشركة / الوكيل *', 'Company / Agent Name *')}</label>
                <input
                  type="text"
                  required
                  value={agtName}
                  onChange={(e) => setAgtName(e.target.value)}
                  placeholder={bi(lang, 'مثال: شركة النور للسياحة', 'e.g. Al Noor Travel')}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{bi(lang, 'الدولة', 'Country')}</label>
                <input
                  type="text"
                  value={agtCountry}
                  onChange={(e) => setAgtCountry(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{bi(lang, 'رقم الترخيص / التصريح', 'License #')}</label>
                <input
                  type="text"
                  value={agtLicense}
                  onChange={(e) => setAgtLicense(e.target.value)}
                  className={`${inputCls} font-mono-num`}
                />
              </div>
              <div>
                <label className={labelCls}>{bi(lang, 'الشخص المسؤول', 'Contact Person')}</label>
                <input
                  type="text"
                  value={agtContact}
                  onChange={(e) => setAgtContact(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{bi(lang, 'رقم الهاتف / واتساب', 'Phone / WhatsApp')}</label>
                <input
                  type="text"
                  dir="ltr"
                  value={agtPhone}
                  onChange={(e) => setAgtPhone(e.target.value)}
                  className={`${inputCls} font-mono-num`}
                />
              </div>
              <div>
                <label className={labelCls}>{bi(lang, 'البريد الإلكتروني', 'Email')}</label>
                <input
                  type="email"
                  dir="ltr"
                  value={agtEmail}
                  onChange={(e) => setAgtEmail(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{bi(lang, 'عمولة الوكيل / معتمر (ر.س)', 'Commission / Pax (SAR)')}</label>
                <input
                  type="number"
                  step="any"
                  min={0}
                  value={agtCommission}
                  onChange={(e) => setAgtCommission(e.target.value)}
                  className={`${inputCls} font-mono-num`}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-end">
              <div className="lg:col-span-3">
                <label className={labelCls}>{bi(lang, 'الحالة', 'Status')}</label>
                <select
                  value={agtStatus}
                  onChange={(e) => setAgtStatus(e.target.value as UmrahAgentStatus)}
                  className={inputCls}
                >
                  <option value="active">{bi(lang, 'نشط ومعتمد', 'Active')}</option>
                  <option value="suspended">{bi(lang, 'موقوف مؤقتاً', 'Suspended')}</option>
                </select>
              </div>
              <div className="lg:col-span-6">
                <label className={labelCls}>{tKey(lang, 'lblNotes')}</label>
                <input
                  type="text"
                  value={agtNotes}
                  onChange={(e) => setAgtNotes(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="lg:col-span-3 flex justify-end">
                <button type="submit" disabled={savingAgt} className={btnPrimaryCls}>
                  <Plus className="w-3.5 h-3.5" />
                  <span>{editAgentId ? bi(lang, 'تحديث الوكيل', 'Update Agent') : bi(lang, 'حفظ الوكيل', 'Save Agent')}</span>
                </button>
              </div>
            </div>
          </form>
        </Panel>

        <Panel
          title={bi(lang, 'دليل الشركات والوكلاء المعتمدين — موسم 1448', 'Authorized Agents & Companies Directory')}
          actions={
            <>
              <select
                value={agtFilterStatus}
                onChange={(e) => setAgtFilterStatus(e.target.value as 'all' | UmrahAgentStatus)}
                className="h-9 px-3 rounded-xl border border-slate-200 text-xs bg-white"
              >
                <option value="all">{bi(lang, 'كل الحالات', 'All Statuses')}</option>
                <option value="active">{bi(lang, 'نشط فقط', 'Active Only')}</option>
                <option value="suspended">{bi(lang, 'موقوف فقط', 'Suspended Only')}</option>
              </select>
              <input
                type="text"
                value={agtSearch}
                onChange={(e) => setAgtSearch(e.target.value)}
                placeholder={tKey(lang, 'searchPlaceholder')}
                className="h-9 px-3 rounded-xl border border-slate-200 text-xs w-44 focus:outline-none focus:border-[#1d4ed8]"
              />
              <button
                type="button"
                onClick={() =>
                  csvDownload('umrah_1448_agents.csv', [
                    ['Code', 'Name', 'Country', 'License', 'Contact', 'Phone', 'Email', 'Commission SAR', 'Status', 'Notes'],
                    ...filteredAgents.map((a) => [
                      a.code,
                      a.name,
                      a.country,
                      a.licenseNo,
                      a.contactPerson,
                      a.phone,
                      a.email,
                      a.commissionSAR,
                      a.status,
                      a.notes,
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
                  <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'lblCode')}</th>
                  <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'الشركة / الوكيل', 'Company / Agent')}</th>
                  <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'الدولة / الترخيص', 'Country / License')}</th>
                  <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'المسؤول والتواصل', 'Contact')}</th>
                  <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'المجموعات', 'Groups')}</th>
                  <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'المعتمرون', 'Pilgrims')}</th>
                  <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'العمولة ر.س', 'Comm. SAR')}</th>
                  <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'الحالة', 'Status')}</th>
                  <th className="py-2.5 px-2.5 text-start font-bold no-print">{tKey(lang, 'thAction')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAgents.length === 0 ? (
                  <EmptyRow colSpan={9} lang={lang} />
                ) : (
                  filteredAgents.map((a) => {
                    const grpCount = groups.filter((g) => g.agentName === a.name).length;
                    const paxCount = pilgrims.filter((p) => p.agentName === a.name).length;
                    return (
                      <tr key={a.id} className="hover:bg-slate-50">
                        <td className="py-2 px-2.5 font-mono-num font-bold">{a.code}</td>
                        <td className="py-2 px-2.5 font-semibold text-slate-900">{a.name}</td>
                        <td className="py-2 px-2.5 text-slate-600">
                          {[a.country || '-', a.licenseNo].filter(Boolean).join(' · ')}
                        </td>
                        <td className="py-2 px-2.5">
                          <div>{a.contactPerson || '-'}</div>
                          {(a.phone || a.email) && (
                            <div className="text-[11px] text-slate-500 font-mono-num" dir="ltr">
                              {[a.phone, a.email].filter(Boolean).join(' / ')}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-2.5 font-mono-num font-bold text-[#1d4ed8]">{grpCount}</td>
                        <td className="py-2 px-2.5 font-mono-num font-bold text-[#0f766e]">{paxCount}</td>
                        <td className="py-2 px-2.5 font-mono-num">{fmt(a.commissionSAR)}</td>
                        <td className="py-2 px-2.5">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${
                              a.status === 'active' ? 'bg-teal-50 text-[#0f766e]' : 'bg-red-50 text-red-700'
                            }`}
                          >
                            {a.status === 'active' ? bi(lang, 'نشط', 'Active') : bi(lang, 'موقوف', 'Suspended')}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 no-print">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditAgentId(a.id);
                                setAgtCode(a.code);
                                setAgtName(a.name);
                                setAgtCountry(a.country);
                                setAgtLicense(a.licenseNo);
                                setAgtContact(a.contactPerson);
                                setAgtPhone(a.phone);
                                setAgtEmail(a.email);
                                setAgtCommission(String(a.commissionSAR));
                                setAgtStatus(a.status);
                                setAgtNotes(a.notes);
                              }}
                              className={btnSoftBlueCls}
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onConfirm({
                                  title: bi(lang, 'حذف وكيل', 'Delete Agent'),
                                  message: bi(lang, `حذف "${a.name}"؟`, `Delete "${a.name}"?`),
                                  danger: true,
                                  onConfirm: () => onDeleteAgent(a.id),
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
      </div>
    );
  }

  // --- Groups Mode (إنشاء مجموعات العمرة والحج) ---
  const activeGroups = groups.filter((g) => g.status !== 'archived');
  const totalTargetPax = sumBy(activeGroups, (g) => g.targetPax);
  const estVisaSales = sumBy(activeGroups, (g) => g.targetPax * g.visaSellSAR);
  const estVisaProfit = sumBy(activeGroups, (g) => g.targetPax * (g.visaSellSAR - g.visaBuySAR));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <KpiCard label={bi(lang, 'مجموعات العمرة والحج 1448', '1448 Groups')} value={groups.length} tone="blue" />
        <KpiCard label={bi(lang, 'إجمالي العدد المستهدف (معتمر)', 'Target Pilgrims')} value={totalTargetPax} tone="teal" />
        <KpiCard label={bi(lang, 'مبيعات التأشيرات التقديرية (ر.س)', 'Est. Visa Sales (SAR)')} value={fmt(estVisaSales)} tone="emerald" />
        <KpiCard label={bi(lang, 'الربح المتوقع للتأشيرات (ر.س)', 'Est. Visa Profit (SAR)')} value={fmt(estVisaProfit)} tone="amber" />
      </div>

      <Panel
        className="no-print"
        title={
          <span className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#0f766e]" />
            <span>
              {editGroupId
                ? bi(lang, 'تعديل مجموعة العمرة / الحج 1448', 'Edit 1448 Group')
                : bi(lang, 'إنشاء مجموعة عمرة أو حج جديدة (موسم 1448)', 'Create Umrah / Hajj Group (Season 1448)')}
            </span>
          </span>
        }
        actions={
          <button type="button" onClick={resetGroupForm} className={btnSecondaryCls}>
            {tKey(lang, 'btnClear')}
          </button>
        }
      >
        <form onSubmit={handleSaveGroupSubmit} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div>
              <label className={labelCls}>{bi(lang, 'كود المجموعة *', 'Group Code *')}</label>
              <input
                type="text"
                required
                value={grpCode}
                onChange={(e) => setGrpCode(e.target.value)}
                className={`${inputCls} font-mono-num`}
              />
            </div>
            <div>
              <label className={labelCls}>{bi(lang, 'اسم المجموعة *', 'Group Name *')}</label>
              <input
                type="text"
                required
                value={grpName}
                onChange={(e) => setGrpName(e.target.value)}
                placeholder={bi(lang, 'مثال: عمرة رجب المميزة - الفوج الأول', 'e.g. Rajab VIP Umrah Batch 1')}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{bi(lang, 'نوع البرنامج *', 'Program Type *')}</label>
              <select
                value={grpProgram}
                onChange={(e) => setGrpProgram(e.target.value as UmrahProgramType)}
                className={inputCls}
              >
                <option value="umrah">{UMRAH_PROGRAM_LABELS.umrah[lang]}</option>
                <option value="hajj">{UMRAH_PROGRAM_LABELS.hajj[lang]}</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{bi(lang, 'الشركة / الوكيل *', 'Agent / Company *')}</label>
              <input
                type="text"
                required
                list="umrah-agent-options"
                value={grpAgent}
                onChange={(e) => setGrpAgent(e.target.value)}
                className={inputCls}
              />
              <datalist id="umrah-agent-options">
                {allAgentNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={labelCls}>{bi(lang, 'المشرف الميداني', 'Supervisor')}</label>
              <input
                type="text"
                list="umrah-supervisor-options"
                value={grpSupervisor}
                onChange={(e) => setGrpSupervisor(e.target.value)}
                className={inputCls}
              />
              <datalist id="umrah-supervisor-options">
                {supervisorNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={labelCls}>{bi(lang, 'العدد المستهدف', 'Target Pax')}</label>
              <input
                type="number"
                min={0}
                value={grpTargetPax}
                onChange={(e) => setGrpTargetPax(e.target.value)}
                className={`${inputCls} font-mono-num`}
              />
            </div>
            <div>
              <label className={labelCls}>{bi(lang, 'شراء التأشيرة (ر.س)', 'Visa Buy (SAR)')}</label>
              <input
                type="number"
                step="any"
                min={0}
                value={grpVisaBuy}
                onChange={(e) => setGrpVisaBuy(e.target.value)}
                className={`${inputCls} font-mono-num`}
              />
            </div>
            <div>
              <label className={labelCls}>{bi(lang, 'بيع التأشيرة (ر.س)', 'Visa Sell (SAR)')}</label>
              <input
                type="number"
                step="any"
                min={0}
                value={grpVisaSell}
                onChange={(e) => setGrpVisaSell(e.target.value)}
                className={`${inputCls} font-mono-num`}
              />
            </div>
            <div>
              <label className={labelCls}>{bi(lang, 'سعر الباقة / معتمر (ر.س)', 'Package Price / Pax (SAR)')}</label>
              <input
                type="number"
                step="any"
                min={0}
                value={grpPkgPrice}
                onChange={(e) => setGrpPkgPrice(e.target.value)}
                className={`${inputCls} font-mono-num`}
              />
            </div>
            <div>
              <label className={labelCls}>{bi(lang, 'تاريخ الوصول المتوقع', 'Arrival Date')}</label>
              <input
                type="date"
                value={grpArrival}
                onChange={(e) => setGrpArrival(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{bi(lang, 'تاريخ المغادرة المتوقع', 'Departure Date')}</label>
              <input
                type="date"
                value={grpDeparture}
                onChange={(e) => setGrpDeparture(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{bi(lang, 'حالة المجموعة', 'Status')}</label>
              <select
                value={grpStatus}
                onChange={(e) => setGrpStatus(e.target.value as UmrahGroupStatus)}
                className={inputCls}
              >
                {(Object.keys(UMRAH_GROUP_STATUS) as UmrahGroupStatus[]).map((st) => (
                  <option key={st} value={st}>
                    {UMRAH_GROUP_STATUS[st][lang]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-end">
            <div className="lg:col-span-9">
              <label className={labelCls}>{tKey(lang, 'lblNotes')}</label>
              <input
                type="text"
                value={grpNotes}
                onChange={(e) => setGrpNotes(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="lg:col-span-3 flex justify-end">
              <button type="submit" disabled={savingGrp} className={btnPrimaryCls}>
                <Plus className="w-3.5 h-3.5" />
                <span>{editGroupId ? bi(lang, 'تحديث المجموعة', 'Update Group') : bi(lang, 'إنشاء المجموعة', 'Create Group')}</span>
              </button>
            </div>
          </div>
        </form>
      </Panel>

      <Panel
        title={bi(lang, 'سجل مجموعات العمرة والحج 1448', '1448 Umrah & Hajj Groups Registry')}
        actions={
          <>
            <select
              value={grpFilterProgram}
              onChange={(e) => setGrpFilterProgram(e.target.value as 'all' | UmrahProgramType)}
              className="h-9 px-3 rounded-xl border border-slate-200 text-xs bg-white"
            >
              <option value="all">{bi(lang, 'عمرة وحج', 'All Programs')}</option>
              <option value="umrah">{UMRAH_PROGRAM_LABELS.umrah[lang]}</option>
              <option value="hajj">{UMRAH_PROGRAM_LABELS.hajj[lang]}</option>
            </select>
            <select
              value={grpFilterStatus}
              onChange={(e) => setGrpFilterStatus(e.target.value as 'all' | UmrahGroupStatus)}
              className="h-9 px-3 rounded-xl border border-slate-200 text-xs bg-white"
            >
              <option value="all">{bi(lang, 'كل الحالات', 'All Statuses')}</option>
              {(Object.keys(UMRAH_GROUP_STATUS) as UmrahGroupStatus[]).map((st) => (
                <option key={st} value={st}>
                  {UMRAH_GROUP_STATUS[st][lang]}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={grpSearch}
              onChange={(e) => setGrpSearch(e.target.value)}
              placeholder={tKey(lang, 'searchPlaceholder')}
              className="h-9 px-3 rounded-xl border border-slate-200 text-xs w-44 focus:outline-none focus:border-[#1d4ed8]"
            />
            <button
              type="button"
              onClick={() =>
                csvDownload('umrah_1448_groups.csv', [
                  ['Code', 'Name', 'Program', 'Agent', 'Supervisor', 'Target Pax', 'Visa Buy', 'Visa Sell', 'Arrival', 'Departure', 'Status'],
                  ...filteredGroups.map((g) => [
                    g.groupCode,
                    g.groupName,
                    g.programType,
                    g.agentName,
                    g.supervisorName,
                    g.targetPax,
                    g.visaBuySAR,
                    g.visaSellSAR,
                    g.arrivalDate,
                    g.departureDate,
                    g.status,
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
                <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'الكود', 'Code')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'المجموعة / البرنامج', 'Group / Program')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'الوكيل', 'Agent')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'المشرف', 'Supervisor')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'المسجل / المستهدف', 'Registered / Target')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'التأشيرة (شراء/بيع)', 'Visa Buy/Sell')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'الوصول ← المغادرة', 'Dates')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'الحالة', 'Status')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold no-print">{tKey(lang, 'thAction')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredGroups.length === 0 ? (
                <EmptyRow colSpan={9} lang={lang} />
              ) : (
                filteredGroups.map((g) => {
                  const regCount = pilgrims.filter((p) => p.groupCode === g.groupCode).length;
                  const issuedCount = pilgrims.filter((p) => p.groupCode === g.groupCode && p.visaStatus === 'issued').length;
                  const st = UMRAH_GROUP_STATUS[g.status];
                  return (
                    <tr key={g.id} className="hover:bg-slate-50">
                      <td className="py-2 px-2.5 font-mono-num font-bold">{g.groupCode}</td>
                      <td className="py-2 px-2.5">
                        <div className="font-semibold text-slate-900">{g.groupName}</div>
                        <div className="text-[11px] text-slate-500">{UMRAH_PROGRAM_LABELS[g.programType][lang]}</div>
                      </td>
                      <td className="py-2 px-2.5">{g.agentName}</td>
                      <td className="py-2 px-2.5">{g.supervisorName || '-'}</td>
                      <td className="py-2 px-2.5 font-mono-num">
                        <strong className="text-[#1d4ed8]">{regCount}</strong> / {g.targetPax}
                        <span className="text-[11px] text-[#0f766e] ms-1.5">({issuedCount} {bi(lang, 'صادرة', 'issued')})</span>
                      </td>
                      <td className="py-2 px-2.5 font-mono-num">
                        {fmt(g.visaBuySAR)} / <strong className="text-[#0f766e]">{fmt(g.visaSellSAR)}</strong>
                      </td>
                      <td className="py-2 px-2.5 font-mono-num text-[11px]">
                        {g.arrivalDate || '-'} ← {g.departureDate || '-'}
                      </td>
                      <td className="py-2 px-2.5">
                        <select
                          value={g.status}
                          onChange={(e) =>
                            void onSaveGroup({ ...g, status: e.target.value as UmrahGroupStatus }, true)
                          }
                          className={`px-2 py-1 rounded text-[11px] font-semibold border border-slate-200 ${st.cls}`}
                        >
                          {(Object.keys(UMRAH_GROUP_STATUS) as UmrahGroupStatus[]).map((k) => (
                            <option key={k} value={k}>
                              {UMRAH_GROUP_STATUS[k][lang]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-2.5 no-print">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditGroupId(g.id);
                              setGrpCode(g.groupCode);
                              setGrpName(g.groupName);
                              setGrpProgram(g.programType);
                              setGrpAgent(g.agentName);
                              setGrpSupervisor(g.supervisorName);
                              setGrpTargetPax(String(g.targetPax));
                              setGrpVisaBuy(String(g.visaBuySAR));
                              setGrpVisaSell(String(g.visaSellSAR));
                              setGrpPkgPrice(String(g.packagePriceSAR));
                              setGrpArrival(g.arrivalDate);
                              setGrpDeparture(g.departureDate);
                              setGrpStatus(g.status);
                              setGrpNotes(g.notes);
                            }}
                            className={btnSoftBlueCls}
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onConfirm({
                                title: bi(lang, 'حذف مجموعة', 'Delete Group'),
                                message: bi(lang, `حذف المجموعة "${g.groupName}"؟`, `Delete group "${g.groupName}"?`),
                                danger: true,
                                onConfirm: () => onDeleteGroup(g.id),
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
    </div>
  );
};
