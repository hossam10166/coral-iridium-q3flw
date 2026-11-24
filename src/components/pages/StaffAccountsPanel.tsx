import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckSquare,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Square,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react';
import {
  EmployeeRecord,
  Lang,
  PageId,
  StaffAccount,
  StaffRole,
} from '../../types/accounting';
import { bi, tKey } from '../../i18n/translations';
import { normalizeUsername } from '../../firebase';
import { buildStaffAccountEmailContent, getSharedAppUrl } from '../../services/gmailService';
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

export const FIREBASE_AUTH_PROVIDERS_URL =
  'https://console.firebase.google.com/project/coral-iridium-q3flw/authentication/providers';

export const ASSIGNABLE_PAGES: { id: PageId; labelKey: string }[] = [
  { id: 'dashboard', labelKey: 'navDashboard' },
  { id: 'entry', labelKey: 'navEntry' },
  { id: 'umrahVisa1448', labelKey: 'navUmrah1448' },
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

export const DEFAULT_STAFF_PERMS: PageId[] = [
  'dashboard',
  'entry',
  'transport',
  'groups',
  'operations',
];

export interface CreatedStaffCredentials {
  displayName: string;
  username: string;
  password: string;
  role: StaffRole;
}

interface StaffAccountsPanelProps {
  lang: Lang;
  employees: EmployeeRecord[];
  staffAccounts: StaffAccount[];
  preselectedEmployeeId?: number | null;
  preselectedAccountUid?: string | null;
  onClearPreselection?: () => void;
  onCreateStaffAccount: (input: {
    username: string;
    password: string;
    displayName: string;
    role: StaffRole;
    permissions: PageId[];
    employeeId?: number;
  }) => Promise<void>;
  onUpdateStaffAccount: (
    staffUid: string,
    patch: {
      displayName: string;
      role: StaffRole;
      active: boolean;
      permissions: PageId[];
      employeeId?: number;
    }
  ) => Promise<void>;
  onDeleteStaffAccount: (staffUid: string) => Promise<void>;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
  onConfirm: (cfg: ConfirmConfig) => void;
}

export function generateStrongPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789@#';
  let out = 'BU';
  for (let i = 0; i < 8; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

export const StaffAccountsPanel: React.FC<StaffAccountsPanelProps> = ({
  lang,
  employees,
  staffAccounts,
  preselectedEmployeeId,
  preselectedAccountUid,
  onClearPreselection,
  onCreateStaffAccount,
  onUpdateStaffAccount,
  onDeleteStaffAccount,
  onToast,
  onConfirm,
}) => {
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [linkedEmpId, setLinkedEmpId] = useState<string>('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(true);
  const [role, setRole] = useState<StaffRole>('staff');
  const [active, setActive] = useState(true);
  const [permissions, setPermissions] = useState<PageId[]>(DEFAULT_STAFF_PERMS);
  const [busy, setBusy] = useState(false);
  const [consoleEnableAlert, setConsoleEnableAlert] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<CreatedStaffCredentials | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);
  const [emailDraft, setEmailDraft] = useState<InviteEmailDraft | null>(null);

  const openStaffEmailModal = (opts: {
    displayName: string;
    username: string;
    password?: string;
    role: StaffRole;
  }) => {
    const roleLabel =
      opts.role === 'admin'
        ? bi(lang, 'مشرف إداري', 'Operational Admin')
        : bi(lang, 'موظف بصلاحيات مخصصة', 'Staff (Custom Permissions)');
    const content = buildStaffAccountEmailContent(lang, {
      displayName: opts.displayName,
      username: opts.username,
      password: opts.password,
      roleLabel,
    });
    setEmailDraft({
      recipientName: opts.displayName,
      to: '',
      subject: content.subject,
      body: content.body,
    });
  };

  const handleCopyStaffInvite = async (acc: StaffAccount) => {
    const roleLabel =
      acc.role === 'admin'
        ? bi(lang, 'مشرف إداري', 'Operational Admin')
        : bi(lang, 'موظف بصلاحيات مخصصة', 'Staff (Custom Permissions)');
    const content = buildStaffAccountEmailContent(lang, {
      displayName: acc.displayName,
      username: acc.username,
      roleLabel,
    });
    try {
      await navigator.clipboard.writeText(`${content.subject}\n\n${content.body}`);
      onToast(
        bi(
          lang,
          `تم نسخ دعوة ورابط الدخول للموظف (@${acc.username})`,
          `Login invite & link copied for @${acc.username}`
        )
      );
    } catch {
      onToast(bi(lang, 'تعذر النسخ التلقائي للحافظة', 'Could not copy automatically'), 'info');
    }
  };

  const resetForm = () => {
    setEditingUid(null);
    setLinkedEmpId('');
    setDisplayName('');
    setUsername('');
    setPassword('');
    setRole('staff');
    setActive(true);
    setPermissions(DEFAULT_STAFF_PERMS);
  };

  useEffect(() => {
    if (preselectedAccountUid) {
      const acc = staffAccounts.find((a) => a.uid === preselectedAccountUid);
      if (acc) {
        setEditingUid(acc.uid);
        setLinkedEmpId(acc.employeeId ? String(acc.employeeId) : '');
        setDisplayName(acc.displayName);
        setUsername(acc.username);
        setPassword('');
        setRole(acc.role);
        setActive(acc.active);
        setPermissions(acc.permissions?.length ? acc.permissions : ['dashboard']);
        onClearPreselection?.();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    if (preselectedEmployeeId) {
      const emp = employees.find((e) => e.id === preselectedEmployeeId);
      if (emp) {
        setEditingUid(null);
        setLinkedEmpId(String(emp.id));
        setDisplayName(emp.name);
        const suggested = normalizeUsername(emp.code) || `emp${String(emp.id).slice(-4)}`;
        setUsername(suggested);
        setPassword(generateStrongPassword());
        setShowPass(true);
        setRole('staff');
        setActive(true);
        setPermissions(DEFAULT_STAFF_PERMS);
        onClearPreselection?.();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [preselectedEmployeeId, preselectedAccountUid, employees, staffAccounts, onClearPreselection]);

  const handleSelectEmployee = (val: string) => {
    setLinkedEmpId(val);
    const emp = employees.find((e) => String(e.id) === val);
    if (emp) {
      if (!displayName.trim() || !editingUid) {
        setDisplayName(emp.name);
      }
      if (!editingUid && !username.trim()) {
        const cleanCode = normalizeUsername(emp.code);
        if (cleanCode) setUsername(cleanCode);
      }
    }
  };

  const togglePerm = (id: PageId) => {
    setPermissions((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleSelectAllPerms = () => {
    setPermissions(ASSIGNABLE_PAGES.map((p) => p.id));
  };

  const handleDeselectPerms = () => {
    setPermissions(['dashboard']);
  };

  const startEdit = (acc: StaffAccount) => {
    setEditingUid(acc.uid);
    setLinkedEmpId(acc.employeeId ? String(acc.employeeId) : '');
    setDisplayName(acc.displayName);
    setUsername(acc.username);
    setPassword('');
    setRole(acc.role);
    setActive(acc.active);
    setPermissions(acc.permissions?.length ? acc.permissions : ['dashboard']);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = displayName.trim();
    if (!cleanName) {
      onToast(bi(lang, 'يرجى إدخال اسم الموظف الظاهر', 'Please enter display name'), 'error');
      return;
    }

    const empIdNum = linkedEmpId ? Number(linkedEmpId) : undefined;
    const finalPerms: PageId[] =
      role === 'admin'
        ? ASSIGNABLE_PAGES.map((p) => p.id)
        : permissions.length > 0
          ? permissions
          : ['dashboard'];

    setBusy(true);
    setConsoleEnableAlert(false);
    try {
      if (editingUid) {
        await onUpdateStaffAccount(editingUid, {
          displayName: cleanName,
          role,
          active,
          permissions: finalPerms,
          employeeId: empIdNum,
        });
        onToast(bi(lang, 'تم تحديث صلاحيات وحساب الموظف بنجاح', 'Employee login account updated'));
        resetForm();
      } else {
        const cleanUser = normalizeUsername(username);
        if (!cleanUser || cleanUser.length < 2) {
          onToast(
            bi(
              lang,
              'اسم المستخدم يجب أن يتكون من حرفين إنجليزيين على الأقل (a-z, 0-9)',
              'Username must be at least 2 English letters/numbers'
            ),
            'error'
          );
          return;
        }
        if (password.length < 6) {
          onToast(
            bi(lang, 'كلمة المرور يجب ألا تقل عن 6 أحرف', 'Password must be at least 6 characters'),
            'error'
          );
          return;
        }
        if (staffAccounts.some((s) => s.username === cleanUser)) {
          onToast(
            bi(lang, 'اسم المستخدم مستخدم بالفعل، اختر اسماً آخر', 'Username is already taken'),
            'error'
          );
          return;
        }

        await onCreateStaffAccount({
          username: cleanUser,
          password,
          displayName: cleanName,
          role,
          permissions: finalPerms,
          employeeId: empIdNum,
        });
        setCreatedCreds({
          displayName: cleanName,
          username: cleanUser,
          password,
          role,
        });
        setCopiedCreds(false);
        onToast(
          bi(
            lang,
            `تم إنشاء حساب الدخول للموظف (@${cleanUser}) بنجاح`,
            `Login account (@${cleanUser}) created successfully`
          )
        );
        resetForm();
      }
    } catch (err: unknown) {
      const code = (err as { code?: string; message?: string })?.code || '';
      const msg = (err as { message?: string })?.message || '';
      if (code === 'auth/operation-not-allowed') {
        setConsoleEnableAlert(true);
        onToast(
          bi(
            lang,
            'يجب تفعيل خيار Email/Password في Firebase Console أولاً',
            'Enable Email/Password sign-in in Firebase Console first'
          ),
          'error'
        );
      } else if (msg === 'USERNAME_TAKEN_DIFFERENT_PASSWORD') {
        onToast(
          bi(
            lang,
            'اسم المستخدم مسجل مسبقاً بكلمة مرور مختلفة. اختر اسم مستخدم جديد (مثل إضافة رقم) أو أدخل كلمة المرور المطابقة لربطه.',
            'Username exists with a different password. Choose a new username or enter the matching password to link it.'
          ),
          'error'
        );
      } else if (msg === 'USERNAME_OWNED_BY_OTHER_WORKSPACE') {
        onToast(
          bi(
            lang,
            'اسم المستخدم مرتبط بشركة أخرى، يرجى اختيار اسم مستخدم مختلف.',
            'This username belongs to another workspace. Please choose a different username.'
          ),
          'error'
        );
      } else if (code === 'auth/email-already-in-use') {
        onToast(
          bi(
            lang,
            'اسم المستخدم مسجل مسبقاً في نظام المصادقة، يرجى اختيار اسم مستخدم جديد',
            'This username already exists in Auth. Please choose a different username'
          ),
          'error'
        );
      } else if (code === 'auth/weak-password') {
        onToast(
          bi(lang, 'كلمة المرور ضعيفة، يجب أن تكون 6 أحرف على الأقل', 'Password must be at least 6 characters'),
          'error'
        );
      } else if (msg === 'INVALID_USERNAME') {
        onToast(bi(lang, 'اسم المستخدم غير صالح', 'Invalid username'), 'error');
      } else {
        onToast(
          bi(lang, `تعذر حفظ الحساب: ${code || msg}`, `Could not save account: ${code || msg}`),
          'error'
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async (acc: StaffAccount) => {
    try {
      await onUpdateStaffAccount(acc.uid, {
        displayName: acc.displayName,
        role: acc.role,
        active: !acc.active,
        permissions: acc.permissions,
        employeeId: acc.employeeId,
      });
      onToast(
        !acc.active
          ? bi(lang, `تم تفعيل حساب @${acc.username}`, `Enabled @${acc.username}`)
          : bi(lang, `تم إيقاف حساب @${acc.username}`, `Suspended @${acc.username}`)
      );
    } catch {
      onToast(bi(lang, 'تعذر تحديث حالة الحساب', 'Could not update status'), 'error');
    }
  };

  const handleDelete = (acc: StaffAccount) => {
    onConfirm({
      title: bi(lang, 'حذف حساب دخول موظف', 'Delete Employee Login Account'),
      message: bi(
        lang,
        `هل تريد حذف حساب الدخول "@${acc.username}" (${acc.displayName})؟ سيتم منع دخوله إلى النظام فوراً.`,
        `Delete login account "@${acc.username}" (${acc.displayName})? They will immediately lose access to the system.`
      ),
      danger: true,
      onConfirm: async () => {
        await onDeleteStaffAccount(acc.uid);
        if (editingUid === acc.uid) resetForm();
        onToast(bi(lang, 'تم حذف حساب الدخول ومنع الوصول', 'Login account removed'));
      },
    });
  };

  const cleanUsernamePreview = normalizeUsername(username);

  const handleCopyCredentials = async () => {
    if (!createdCreds) return;
    const url = getSharedAppUrl();
    const text =
      lang === 'ar'
        ? `بيانات الدخول إلى نظام BEST UNITED:\nالموظف: ${createdCreds.displayName}\nاسم المستخدم (Username): ${createdCreds.username}\nكلمة المرور (Password): ${createdCreds.password}\nرابط الدخول: ${url}`
        : `BEST UNITED System Login Credentials:\nEmployee: ${createdCreds.displayName}\nUsername: ${createdCreds.username}\nPassword: ${createdCreds.password}\nLogin URL: ${url}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCreds(true);
      onToast(bi(lang, 'تم نسخ بيانات الدخول للحافظة', 'Login credentials copied to clipboard'));
    } catch {
      onToast(bi(lang, 'تعذر النسخ التلقائي، انسخ البيانات يدوياً', 'Copy manually from the box'), 'info');
    }
  };

  return (
    <div className="space-y-5">
      {createdCreds && (
        <div className="no-print p-4 rounded-2xl bg-teal-50 border border-teal-300 text-teal-950 text-xs space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-sm text-[#0f766e]">
              <KeyRound className="w-4 h-4" />
              <span>
                {bi(
                  lang,
                  `تم إنشاء بيانات دخول الموظف (${createdCreds.displayName}) بنجاح — انسخها وأرسلها للموظف`,
                  `Employee Login Created (${createdCreds.displayName}) — Copy & Share`
                )}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                    openStaffEmailModal({
                      displayName: createdCreds.displayName,
                      username: createdCreds.username,
                      password: createdCreds.password,
                      role: createdCreds.role,
                    })
                }
                className={btnTealCls}
              >
                <Send className="w-3.5 h-3.5" />
                <span>{bi(lang, 'إرسال عبر Gmail', 'Send via Gmail')}</span>
              </button>
              <button type="button" onClick={() => void handleCopyCredentials()} className={btnPrimaryCls}>
                {copiedCreds ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>
                  {copiedCreds
                    ? bi(lang, 'تم النسخ', 'Copied')
                    : bi(lang, 'نسخ بيانات الدخول', 'Copy Login Credentials')}
                </span>
              </button>
              <button type="button" onClick={() => setCreatedCreds(null)} className={btnSecondaryCls}>
                {bi(lang, 'إخفاء', 'Dismiss')}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-white p-3 rounded-xl border border-teal-200 font-mono-num" dir="ltr">
            <div>
              <span className="text-slate-500 text-[11px] block">Username</span>
              <strong className="text-sm text-[#1d4ed8]">{createdCreds.username}</strong>
            </div>
            <div>
              <span className="text-slate-500 text-[11px] block">Password</span>
              <strong className="text-sm text-slate-900">{createdCreds.password}</strong>
            </div>
            <div>
              <span className="text-slate-500 text-[11px] block">Login Method</span>
              <strong className="text-xs text-slate-700">Employee Username &amp; Password</strong>
            </div>
          </div>
        </div>
      )}

      {consoleEnableAlert && (
        <div className="no-print p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs space-y-2">
          <div className="flex items-center gap-2 font-bold text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-700" />
            <span>
              {bi(
                lang,
                'خطوة مطلوبة في لوحة تحكم Firebase لتشغيل حسابات الموظفين',
                'Firebase Console Step Required for Employee Username/Password Login'
              )}
            </span>
          </div>
          <p className="leading-relaxed">
            {bi(
              lang,
              'افتح رابط Firebase Authentication أدناه ثم فعّل مزود الدخول (Email/Password) واضغط Save، وبعدها يمكنك إنشاء حسابات الموظفين مباشرة دون مغادرة النظام.',
              'Open Firebase Authentication below, enable the Email/Password sign-in provider and click Save. Then you can create employee accounts here.'
            )}
          </p>
          <a
            href={FIREBASE_AUTH_PROVIDERS_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-bold text-[#1d4ed8] underline"
          >
            <span>{bi(lang, 'فتح صفحة مزودي الدخول في Firebase Console', 'Open Firebase Auth Providers')}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      <Panel
        className="no-print"
        title={
          editingUid
            ? bi(lang, `تعديل حساب وصلاحيات: @${username}`, `Edit Account & Permissions: @${username}`)
            : tKey(lang, 'staffAccTitle')
        }
        actions={
          <button type="button" onClick={resetForm} className={btnSecondaryCls}>
            {tKey(lang, 'btnClear')}
          </button>
        }
      >
        <div className="mb-4 p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-slate-700 leading-relaxed">
          {bi(
            lang,
            'أنشئ اسم مستخدم (Username) وكلمة مرور لكل موظف للدخول مباشرة إلى قاعدة بيانات الشركة السحابية، مع التحكم الكامل في الشاشات المسموح له بالوصول إليها.',
            'Create a dedicated username and password for each employee to sign in directly to your shared company cloud workspace, with full control over allowed screens.'
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div>
              <label className={labelCls}>
                {bi(lang, 'ربط بسجل موظف (اختياري)', 'Link to Employee Record (Optional)')}
              </label>
              <select
                value={linkedEmpId}
                onChange={(e) => handleSelectEmployee(e.target.value)}
                className={inputCls}
              >
                <option value="">{bi(lang, '— غير مرتبط بموظف محدد —', '— Not linked —')}</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={String(emp.id)}>
                    {emp.name} ({emp.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>{bi(lang, 'الاسم الظاهر للموظف *', 'Display Name *')}</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={bi(lang, 'مثال: أحمد محمد - المحاسبة', 'e.g. Ahmed - Accounting')}
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>{tKey(lang, 'lblUsername')} *</label>
              <input
                type="text"
                required
                disabled={Boolean(editingUid)}
                dir="ltr"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. ahmed01"
                className={`${inputCls} font-mono-num disabled:bg-slate-100 disabled:text-slate-500`}
              />
              {!editingUid && username && (
                <div className="mt-1 text-[11px] text-slate-500 font-mono-num" dir="ltr">
                  {bi(lang, 'سيتم الدخول بـ:', 'Login ID:')} <strong>@{cleanUsernamePreview || '...'}</strong>
                </div>
              )}
            </div>

            {!editingUid ? (
              <div>
                <label className={labelCls}>{tKey(lang, 'lblPassword')} *</label>
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <input
                      type={showPass ? 'text' : 'password'}
                      required
                      minLength={6}
                      dir="ltr"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="min 6 chars"
                      className={`${inputCls} pe-9 font-mono-num`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((s) => !s)}
                      className="absolute inset-y-0 end-0 px-2.5 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                      tabIndex={-1}
                    >
                      {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    title={bi(lang, 'توليد كلمة مرور قوية', 'Generate Password')}
                    onClick={() => {
                      setPassword(generateStrongPassword());
                      setShowPass(true);
                    }}
                    className="h-9 px-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <label className={labelCls}>{tKey(lang, 'thStatus')}</label>
                <select
                  value={active ? 'active' : 'suspended'}
                  onChange={(e) => setActive(e.target.value === 'active')}
                  className={inputCls}
                >
                  <option value="active">{bi(lang, 'نشط (مسموح بالدخول)', 'Active (Can Sign In)')}</option>
                  <option value="suspended">{bi(lang, 'موقوف (ممنوع من الدخول)', 'Suspended (Blocked)')}</option>
                </select>
                <div className="mt-1 text-[11px] text-slate-500">
                  {bi(
                    lang,
                    'لتعيين كلمة مرور جديدة: احذف الحساب من الجدول وأنشئ اسم مستخدم جديد.',
                    'To issue a new password: delete the account below and create a fresh username.'
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Role Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                role === 'staff'
                  ? 'border-[#1d4ed8] bg-blue-50/50'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="staffRole"
                checked={role === 'staff'}
                onChange={() => setRole('staff')}
                className="mt-1 accent-[#1d4ed8]"
              />
              <div>
                <div className="text-xs font-bold text-slate-900">
                  {bi(lang, 'موظف بصلاحيات مخصصة (Staff)', 'Staff (Custom Permissions)')}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {bi(
                    lang,
                    'يدخل فقط إلى الأقسام والشاشات التي تحددها له في الصلاحيات أدناه.',
                    'Accesses only the selected screens checked below.'
                  )}
                </div>
              </div>
            </label>

            <label
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                role === 'admin'
                  ? 'border-[#0f766e] bg-teal-50/50'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="staffRole"
                checked={role === 'admin'}
                onChange={() => setRole('admin')}
                className="mt-1 accent-[#0f766e]"
              />
              <div>
                <div className="text-xs font-bold text-slate-900">
                  {bi(lang, 'مشرف إداري (Admin)', 'Operational Admin')}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {bi(
                    lang,
                    'صلاحية كاملة على جميع أقسام المحاسبة والعمليات (ما عدا إعدادات المالك وإدارة الحسابات).',
                    'Full access to all accounting & operational modules (excludes Owner Settings & Accounts).'
                  )}
                </div>
              </div>
            </label>
          </div>

          {/* Granular Page Permissions */}
          {role === 'staff' && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#1d4ed8]" />
                  <span>{bi(lang, 'الشاشات المصرح للموظف فتحها:', 'Allowed System Screens:')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={handleSelectAllPerms} className={btnSoftBlueCls}>
                    {bi(lang, 'تحديد الكل', 'Select All')}
                  </button>
                  <button type="button" onClick={handleDeselectPerms} className={btnSecondaryCls}>
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
            {editingUid && (
              <button type="button" onClick={resetForm} className={btnSecondaryCls}>
                {tKey(lang, 'btnCancel')}
              </button>
            )}
            <button type="submit" disabled={busy} className={btnPrimaryCls}>
              {editingUid ? <KeyRound className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              <span>
                {busy
                  ? bi(lang, 'جاري الحفظ...', 'Saving...')
                  : editingUid
                    ? bi(lang, 'حفظ التعديلات', 'Save Changes')
                    : bi(lang, 'إنشاء حساب الموظف', 'Create Employee Account')}
              </span>
            </button>
          </div>
        </form>
      </Panel>

      {/* Provisioned Staff Accounts Table */}
      <Panel title={tKey(lang, 'staffAccListTitle')}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'الموظف', 'Employee')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'اسم المستخدم', 'Username')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'الدور', 'Role')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{bi(lang, 'الصلاحيات', 'Permissions')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thStatus')}</th>
                <th className="py-2.5 px-2.5 text-start font-bold no-print">{tKey(lang, 'thAction')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staffAccounts.length === 0 ? (
                <EmptyRow colSpan={6} lang={lang} />
              ) : (
                staffAccounts.map((acc) => {
                  const emp = acc.employeeId ? employees.find((e) => e.id === acc.employeeId) : undefined;
                  return (
                    <tr key={acc.uid} className="hover:bg-slate-50">
                      <td className="py-2.5 px-2.5">
                        <div className="font-semibold text-slate-900">{acc.displayName}</div>
                        {emp && (
                          <div className="text-[11px] text-slate-400">
                            {emp.name} ({emp.code})
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-2.5 font-mono-num font-bold text-[#1d4ed8]" dir="ltr">
                        @{acc.username}
                      </td>
                      <td className="py-2.5 px-2.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            acc.role === 'admin'
                              ? 'bg-teal-100 text-teal-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {acc.role === 'admin'
                            ? bi(lang, 'مشرف إداري', 'Admin')
                            : bi(lang, 'موظف', 'Staff')}
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 text-slate-600">
                        {acc.role === 'admin'
                          ? bi(lang, 'كامل الشاشات التشغيلية والمالية', 'All operational & financial pages')
                          : bi(
                              lang,
                              `${acc.permissions?.length || 0} شاشات مفعّلة`,
                              `${acc.permissions?.length || 0} allowed screens`
                            )}
                      </td>
                      <td className="py-2.5 px-2.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            acc.active ? 'bg-teal-100 text-teal-800' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {acc.active ? bi(lang, 'نشط', 'Active') : bi(lang, 'موقوف', 'Suspended')}
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 no-print">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            title={bi(lang, 'إرسال بيانات الدخول عبر Gmail', 'Send login invite via Gmail')}
                            onClick={() =>
                              openStaffEmailModal({
                                displayName: acc.displayName,
                                username: acc.username,
                                role: acc.role,
                              })
                            }
                            className={btnSoftBlueCls}
                          >
                            <Send className="w-3 h-3" />
                            <span>{bi(lang, 'إرسال Gmail', 'Send Gmail')}</span>
                          </button>
                          <button
                            type="button"
                            title={bi(lang, 'نسخ رسالة الدعوة ورابط الدخول', 'Copy invite message & link')}
                            onClick={() => void handleCopyStaffInvite(acc)}
                            className={btnSecondaryCls}
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            title={acc.active ? bi(lang, 'إيقاف الحساب', 'Suspend') : bi(lang, 'تفعيل الحساب', 'Activate')}
                            onClick={() => void handleToggleActive(acc)}
                            className={acc.active ? btnSecondaryCls : btnSoftBlueCls}
                          >
                            {acc.active ? <UserX className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                            <span>{acc.active ? bi(lang, 'إيقاف', 'Disable') : bi(lang, 'تفعيل', 'Enable')}</span>
                          </button>
                          <button type="button" onClick={() => startEdit(acc)} className={btnSoftBlueCls}>
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button type="button" onClick={() => handleDelete(acc)} className={btnSoftRedCls}>
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

      <SendInviteEmailModal
        lang={lang}
        draft={emailDraft}
        onClose={() => setEmailDraft(null)}
        onToast={onToast}
      />
    </div>
  );
};
