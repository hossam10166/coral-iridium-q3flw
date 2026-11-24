import React, { useState } from 'react';
import {
  CheckSquare,
  Copy,
  Edit3,
  Mail,
  Plus,
  Send,
  ShieldCheck,
  Square,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react';
import {
  Lang,
  PageId,
  StaffRole,
  WorkspaceInvite,
} from '../../types/accounting';
import { bi, tKey } from '../../i18n/translations';
import {
  buildGoogleInviteEmailContent,
  buildMailtoHref,
  getSharedAppUrl,
} from '../../services/gmailService';
import { InviteEmailDraft, SendInviteEmailModal } from '../SendInviteEmailModal';
import {
  ConfirmConfig,
  EmptyRow,
  Panel,
  btnPrimaryCls,
  btnSecondaryCls,
  btnSoftBlueCls,
  btnSoftRedCls,
  btnTealCls,
  inputCls,
  labelCls,
} from '../AccountingUI';

const ASSIGNABLE_PAGES: { id: PageId; labelKey: string }[] = [
  { id: 'dashboard', labelKey: 'navDashboard' },
  { id: 'entry', labelKey: 'navEntry' },
  { id: 'transport', labelKey: 'navTransport' },
  { id: 'groups', labelKey: 'navGroups' },
  { id: 'operations', labelKey: 'navOperations' },
  { id: 'customers', labelKey: 'navCustomers' },
  { id: 'suppliers', labelKey: 'navSuppliers' },
  { id: 'coding', labelKey: 'navCoding' },
  { id: 'customerLedger', labelKey: 'navCustLedger' },
  { id: 'supplierLedger', labelKey: 'navSuppLedger' },
  { id: 'voucher', labelKey: 'navVoucher' },
  { id: 'invoice', labelKey: 'navInvoice' },
  { id: 'treasury', labelKey: 'navTreasury' },
  { id: 'employees', labelKey: 'navEmployees' },
  { id: 'reports', labelKey: 'navReports' },
];

const DEFAULT_INVITE_PERMS: PageId[] = ASSIGNABLE_PAGES.map((p) => p.id);

interface GoogleInvitesPanelProps {
  lang: Lang;
  workspaceInvites: WorkspaceInvite[];
  onCreateInvite: (input: {
    email: string;
    displayName: string;
    role: StaffRole;
    permissions: PageId[];
  }) => Promise<void>;
  onUpdateInvite: (
    inviteId: string,
    patch: {
      displayName: string;
      role: StaffRole;
      active: boolean;
      permissions: PageId[];
    }
  ) => Promise<void>;
  onDeleteInvite: (inviteId: string) => Promise<void>;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
  onConfirm: (cfg: ConfirmConfig) => void;
}

export const GoogleInvitesPanel: React.FC<GoogleInvitesPanelProps> = ({
  lang,
  workspaceInvites,
  onCreateInvite,
  onUpdateInvite,
  onDeleteInvite,
  onToast,
  onConfirm,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<StaffRole>('admin');
  const [active, setActive] = useState(true);
  const [permissions, setPermissions] = useState<PageId[]>(DEFAULT_INVITE_PERMS);
  const [busy, setBusy] = useState(false);
  const [lastCreatedInvite, setLastCreatedInvite] = useState<{
    email: string;
    displayName: string;
    role: StaffRole;
  } | null>(null);
  const [emailDraft, setEmailDraft] = useState<InviteEmailDraft | null>(null);

  const getRoleLabel = (r: StaffRole) =>
    r === 'admin'
      ? bi(lang, 'شريك / مشرف كامل', 'Full Operational Admin')
      : bi(lang, 'صلاحيات مخصصة', 'Custom Screen Permissions');

  const openInviteEmailModal = (inv: { email: string; displayName: string; role: StaffRole }) => {
    const content = buildGoogleInviteEmailContent(lang, {
      displayName: inv.displayName,
      email: inv.email,
      roleLabel: getRoleLabel(inv.role),
    });
    setEmailDraft({
      recipientName: inv.displayName,
      to: inv.email,
      subject: content.subject,
      body: content.body,
    });
  };

  const handleCopyInviteText = async (inv: { email: string; displayName: string; role: StaffRole }) => {
    const content = buildGoogleInviteEmailContent(lang, {
      displayName: inv.displayName,
      email: inv.email,
      roleLabel: getRoleLabel(inv.role),
    });
    try {
      await navigator.clipboard.writeText(`${content.subject}\n\n${content.body}`);
      onToast(
        bi(
          lang,
          `تم نسخ رسالة الدعوة ورابط السستم لـ ${inv.email}`,
          `Invitation message & link copied for ${inv.email}`
        )
      );
    } catch {
      onToast(bi(lang, 'تعذر النسخ التلقائي للحافظة', 'Could not copy automatically'), 'info');
    }
  };

  const handleCopySharedUrl = async () => {
    const url = getSharedAppUrl();
    try {
      await navigator.clipboard.writeText(url);
      onToast(bi(lang, 'تم نسخ رابط مشاركة السستم للحافظة', 'Shared system link copied'));
    } catch {
      onToast(bi(lang, 'تعذر النسخ التلقائي للحافظة', 'Could not copy automatically'), 'info');
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setEmail('');
    setDisplayName('');
    setRole('admin');
    setActive(true);
    setPermissions(DEFAULT_INVITE_PERMS);
  };

  const togglePerm = (id: PageId) => {
    setPermissions((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const startEdit = (inv: WorkspaceInvite) => {
    setEditingId(inv.id);
    setEmail(inv.email);
    setDisplayName(inv.displayName);
    setRole(inv.role);
    setActive(inv.active);
    setPermissions(inv.permissions?.length ? inv.permissions : ['dashboard']);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = displayName.trim() || cleanEmail.split('@')[0] || '';
    const finalPerms: PageId[] =
      role === 'admin'
        ? ASSIGNABLE_PAGES.map((p) => p.id)
        : permissions.length > 0
          ? permissions
          : ['dashboard'];

    setBusy(true);
    try {
      if (editingId) {
        await onUpdateInvite(editingId, {
          displayName: cleanName,
          role,
          active,
          permissions: finalPerms,
        });
        onToast(bi(lang, 'تم تحديث صلاحيات الإيميل المشارك بنجاح', 'Shared email permissions updated'));
        resetForm();
      } else {
        await onCreateInvite({
          email: cleanEmail,
          displayName: cleanName,
          role,
          permissions: finalPerms,
        });
        setLastCreatedInvite({
          email: cleanEmail,
          displayName: cleanName,
          role,
        });
        onToast(
          bi(
            lang,
            `تمت مشاركة السستم مع الإيميل (${cleanEmail}) بنجاح`,
            `Workspace shared with ${cleanEmail} successfully`
          )
        );
        resetForm();
      }
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || '';
      if (msg === 'INVALID_EMAIL') {
        onToast(bi(lang, 'يرجى إدخال بريد إلكتروني صحيح', 'Please enter a valid email address'), 'error');
      } else if (msg === 'SELF_EMAIL') {
        onToast(
          bi(lang, 'لا يمكنك دعوة إيميل المالك نفسه', 'You cannot invite your own owner email'),
          'error'
        );
      } else if (msg === 'DUPLICATE_EMAIL') {
        onToast(
          bi(lang, 'هذا البريد الإلكتروني مشارك بالفعل', 'This email is already shared'),
          'error'
        );
      } else {
        onToast(
          bi(lang, `تعذر مشاركة الإيميل: ${msg}`, `Could not share email: ${msg}`),
          'error'
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async (inv: WorkspaceInvite) => {
    try {
      await onUpdateInvite(inv.id, {
        displayName: inv.displayName,
        role: inv.role,
        active: !inv.active,
        permissions: inv.permissions,
      });
      onToast(
        !inv.active
          ? bi(lang, `تم تفعيل مشاركة ${inv.email}`, `Enabled access for ${inv.email}`)
          : bi(lang, `تم إيقاف مشاركة ${inv.email}`, `Suspended access for ${inv.email}`)
      );
    } catch {
      onToast(bi(lang, 'تعذر تحديث حالة المشاركة', 'Could not update invite status'), 'error');
    }
  };

  const handleDelete = (inv: WorkspaceInvite) => {
    onConfirm({
      title: bi(lang, 'إلغاء مشاركة إيميل Google', 'Revoke Google Email Access'),
      message: bi(
        lang,
        `هل تريد حذف مشاركة الإيميل "${inv.email}"؟ سيفقد فوراً إمكانية فتح بيانات الشركة.`,
        `Remove shared access for "${inv.email}"? They will immediately lose access to your company data.`
      ),
      danger: true,
      onConfirm: async () => {
        await onDeleteInvite(inv.id);
        if (editingId === inv.id) resetForm();
        onToast(bi(lang, 'تم إلغاء مشاركة الإيميل بنجاح', 'Shared email access revoked'));
      },
    });
  };

  return (
    <div className="space-y-5">
      {lastCreatedInvite && (() => {
        const quickContent = buildGoogleInviteEmailContent(lang, {
          displayName: lastCreatedInvite.displayName,
          email: lastCreatedInvite.email,
          roleLabel: getRoleLabel(lastCreatedInvite.role),
        });
        return (
          <div className="no-print p-4 rounded-2xl bg-teal-50 border border-teal-300 text-teal-950 text-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-sm text-[#0f766e]">
                <Mail className="w-4 h-4 shrink-0" />
                <span>
                  {bi(
                    lang,
                    `تم تفعيل دخول (${lastCreatedInvite.displayName}) — أرسل له رابط فتح السستم على بريده الآن`,
                    `Access enabled for ${lastCreatedInvite.displayName} — send the system link now`
                  )}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setLastCreatedInvite(null)}
                className={btnSecondaryCls}
              >
                {bi(lang, 'إخفاء', 'Dismiss')}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => openInviteEmailModal(lastCreatedInvite)}
                className={btnTealCls}
              >
                <Send className="w-3.5 h-3.5" />
                <span>{bi(lang, 'إرسال رسالة عبر Gmail الآن', 'Send Invite via Gmail')}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleCopyInviteText(lastCreatedInvite)}
                className={btnSoftBlueCls}
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{bi(lang, 'نسخ رسالة الدعوة والرابط', 'Copy Invite Message')}</span>
              </button>
              <a
                href={buildMailtoHref(lastCreatedInvite.email, quickContent.subject, quickContent.body)}
                className={btnSecondaryCls}
              >
                <Mail className="w-3.5 h-3.5" />
                <span>{bi(lang, 'فتح تطبيق البريد', 'Open Mail App')}</span>
              </a>
            </div>
          </div>
        );
      })()}

      <Panel
        className="no-print"
        title={
          editingId
            ? bi(lang, `تعديل مشاركة الإيميل: ${email}`, `Edit Shared Email: ${email}`)
            : tKey(lang, 'googleShareTitle')
        }
        actions={
          editingId ? (
            <button type="button" onClick={resetForm} className={btnSecondaryCls}>
              {tKey(lang, 'btnCancel')}
            </button>
          ) : undefined
        }
      >
        <div className="mb-4 p-3.5 rounded-xl bg-teal-50/70 border border-teal-200 text-xs text-slate-700 leading-relaxed">
          {bi(
            lang,
            'أضف بريد Google (Gmail) لشريكك أو محاسبك هنا، وعندما يفتح رابط السستم من أي جهاز آخر ويضغط «فتح السستم بحساب Google» بنفس ذلك الإيميل سيدخل مباشرة إلى نفس بيانات شركتك ويعمل عليها معك لحظياً.',
            'Add another Google (Gmail) address here. When that person opens the system from any device and clicks "Open System with Google" using this email, they will enter your exact shared company workspace in real time.'
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            <div>
              <label className={labelCls}>
                {bi(lang, 'إيميل Google المشارك *', 'Shared Google Email *')}
              </label>
              <input
                type="email"
                required
                disabled={Boolean(editingId)}
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@gmail.com"
                className={`${inputCls} font-mono-num disabled:bg-slate-100 disabled:text-slate-500`}
              />
            </div>

            <div>
              <label className={labelCls}>
                {bi(lang, 'الاسم / المسمى الظاهر *', 'Collaborator Name *')}
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={bi(lang, 'مثال: شريك الإدارة / المحاسب', 'e.g. Partner / Accountant')}
                className={inputCls}
              />
            </div>

            {editingId ? (
              <div>
                <label className={labelCls}>{tKey(lang, 'thStatus')}</label>
                <select
                  value={active ? 'active' : 'suspended'}
                  onChange={(e) => setActive(e.target.value === 'active')}
                  className={inputCls}
                >
                  <option value="active">{bi(lang, 'نشط (مسموح بالفتح والعمل)', 'Active')}</option>
                  <option value="suspended">{bi(lang, 'موقوف', 'Suspended')}</option>
                </select>
              </div>
            ) : (
              <div className="flex items-end">
                <div className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#1d4ed8] shrink-0" />
                  <span>{bi(lang, 'يدخل مباشرة بزر Google من أي جهاز', 'Signs in via Google from any device')}</span>
                </div>
              </div>
            )}
          </div>

          {/* Role Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                role === 'admin'
                  ? 'border-[#0f766e] bg-teal-50/50'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="googleInviteRole"
                checked={role === 'admin'}
                onChange={() => setRole('admin')}
                className="mt-1 accent-[#0f766e]"
              />
              <div>
                <div className="text-xs font-bold text-slate-900">
                  {bi(lang, 'شريك / مشرف كامل (Admin)', 'Full Operational Admin')}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {bi(
                    lang,
                    'يفتح ويعمل على جميع شاشات السستم وبيانات الشركة (ما عدا إعدادات المالك وحسابات الدخول).',
                    'Full access to all company records & screens (excludes Owner Settings & Access Management).'
                  )}
                </div>
              </div>
            </label>

            <label
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                role === 'staff'
                  ? 'border-[#1d4ed8] bg-blue-50/50'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="googleInviteRole"
                checked={role === 'staff'}
                onChange={() => setRole('staff')}
                className="mt-1 accent-[#1d4ed8]"
              />
              <div>
                <div className="text-xs font-bold text-slate-900">
                  {bi(lang, 'صلاحيات مخصصة (Custom)', 'Custom Screen Permissions')}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {bi(
                    lang,
                    'تحديد الشاشات المسموح لهذا الإيميل بفتحها والعمل عليها فقط.',
                    'Choose specific screens this Google email can view and edit.'
                  )}
                </div>
              </div>
            </label>
          </div>

          {role === 'staff' && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#1d4ed8]" />
                  <span>{bi(lang, 'الشاشات المصرح لهذا الإيميل بفتحها:', 'Allowed System Screens:')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPermissions(ASSIGNABLE_PAGES.map((p) => p.id))}
                    className={btnSoftBlueCls}
                  >
                    {bi(lang, 'تحديد الكل', 'Select All')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPermissions(['dashboard'])}
                    className={btnSecondaryCls}
                  >
                    {bi(lang, 'لوحة التحكم فقط', 'Dashboard Only')}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {ASSIGNABLE_PAGES.map((pg) => {
                  const checked = permissions.includes(pg.id);
                  return (
                    <button
                      key={pg.id}
                      type="button"
                      onClick={() => togglePerm(pg.id)}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs text-start transition cursor-pointer ${
                        checked
                          ? 'bg-white border-[#1d4ed8] text-[#1d4ed8] font-semibold'
                          : 'bg-white/60 border-slate-200 text-slate-600 hover:bg-white'
                      }`}
                    >
                      {checked ? (
                        <CheckSquare className="w-3.5 h-3.5 shrink-0 text-[#1d4ed8]" />
                      ) : (
                        <Square className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                      )}
                      <span className="truncate">{tKey(lang, pg.labelKey)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            {editingId && (
              <button type="button" onClick={resetForm} className={btnSecondaryCls}>
                {tKey(lang, 'btnCancel')}
              </button>
            )}
            <button type="submit" disabled={busy} className={btnPrimaryCls}>
              <Plus className="w-3.5 h-3.5" />
              <span>
                {busy
                  ? bi(lang, 'جاري الحفظ...', 'Saving...')
                  : editingId
                    ? bi(lang, 'حفظ التعديلات', 'Save Changes')
                    : bi(lang, 'مشاركة السستم مع هذا الإيميل', 'Share Workspace with Email')}
              </span>
            </button>
          </div>
        </form>
      </Panel>

      <Panel
        title={tKey(lang, 'googleShareListTitle')}
        actions={
          <button type="button" onClick={() => void handleCopySharedUrl()} className={btnSoftBlueCls}>
            <Copy className="w-3.5 h-3.5" />
            <span>{bi(lang, 'نسخ رابط السستم', 'Copy System Link')}</span>
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'الاسم', 'Name')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'إيميل Google', 'Google Email')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'الدور', 'Role')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'الصلاحيات', 'Permissions')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thStatus')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold no-print">{tKey(lang, 'thAction')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {workspaceInvites.length === 0 ? (
                <EmptyRow colSpan={6} lang={lang} />
              ) : (
                workspaceInvites.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-2.5 font-semibold text-slate-900">{inv.displayName}</td>
                    <td className="py-2.5 px-2.5 font-mono-num font-bold text-[#1d4ed8]" dir="ltr">
                      {inv.email}
                    </td>
                    <td className="py-2.5 px-2.5">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          inv.role === 'admin'
                            ? 'bg-teal-100 text-teal-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {inv.role === 'admin'
                          ? bi(lang, 'مشرف كامل', 'Admin')
                          : bi(lang, 'مخصص', 'Custom')}
                      </span>
                    </td>
                    <td className="py-2.5 px-2.5 text-slate-600">
                      {inv.role === 'admin'
                        ? bi(lang, 'جميع الشاشات التشغيلية والمالية', 'All operational & financial pages')
                        : bi(
                            lang,
                            `${inv.permissions?.length || 0} شاشات مفعّلة`,
                            `${inv.permissions?.length || 0} allowed screens`
                          )}
                    </td>
                    <td className="py-2.5 px-2.5">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          inv.active ? 'bg-teal-100 text-teal-800' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {inv.active ? bi(lang, 'نشط', 'Active') : bi(lang, 'موقوف', 'Suspended')}
                      </span>
                    </td>
                    <td className="py-2.5 px-2.5 no-print">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          title={bi(lang, 'إرسال رابط الدعوة عبر Gmail', 'Send invite via Gmail')}
                          onClick={() => openInviteEmailModal(inv)}
                          className={btnSoftBlueCls}
                        >
                          <Send className="w-3 h-3" />
                          <span>{bi(lang, 'إرسال Gmail', 'Send Gmail')}</span>
                        </button>
                        <button
                          type="button"
                          title={bi(lang, 'نسخ رسالة الدعوة والرابط', 'Copy invite message')}
                          onClick={() => void handleCopyInviteText(inv)}
                          className={btnSecondaryCls}
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleActive(inv)}
                          className={inv.active ? btnSecondaryCls : btnSoftBlueCls}
                        >
                          {inv.active ? <UserX className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                          <span>{inv.active ? bi(lang, 'إيقاف', 'Disable') : bi(lang, 'تفعيل', 'Enable')}</span>
                        </button>
                        <button type="button" onClick={() => startEdit(inv)} className={btnSoftBlueCls}>
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button type="button" onClick={() => handleDelete(inv)} className={btnSoftRedCls}>
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <SendInviteEmailModal
        lang={lang}
        draft={emailDraft}
        onClose={() => setEmailDraft(null)}
        onToast={onToast}
      />
    </div>
  );
};
