import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Check,
  CheckSquare,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Square,
  Trash2,
  Vault,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { normalizeUsername } from '../../firebase';
import { buildStaffAccountEmailContent, getSharedAppUrl } from '../../services/gmailService';
import { InviteEmailDraft, SendInviteEmailModal } from '../SendInviteEmailModal';
import {
  AccountingDB,
  EMPLOYEE_STATUS,
  EmployeeRecord,
  EmployeeStatus,
  Lang,
  PAYROLL_TYPES,
  PageId,
  PayrollRecord,
  PayrollType,
  StaffAccount,
  StaffRole,
  TREASURY_ACCOUNTS,
  TreasuryAccount,
  TreasuryEntry,
  WorkspaceInvite,
} from '../../types/accounting';
import { EmployeesVaultPanel } from './EmployeesVaultPanel';
import { GoogleInvitesPanel } from './GoogleInvitesPanel';
import {
  ASSIGNABLE_PAGES,
  CreatedStaffCredentials,
  DEFAULT_STAFF_PERMS,
  FIREBASE_AUTH_PROVIDERS_URL,
  StaffAccountsPanel,
  generateStrongPassword,
} from './StaffAccountsPanel';
import { bi, tKey } from '../../i18n/translations';
import {
  calcEmpTotal,
  csvDownload,
  fmt,
  getEgpAmount,
  nextEmpCode,
  nextPayRef,
  nextTrsRef,
  sumBy,
  toSAR,
  today,
} from '../../utils/calculations';
import {
  ConfirmConfig,
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
} from '../AccountingUI';

interface EmployeesPageProps {
  db: AccountingDB;
  lang: Lang;
  staffAccounts: StaffAccount[];
  workspaceInvites: WorkspaceInvite[];
  initialTab?: 'staff' | 'payroll' | 'vault' | 'accounts' | 'googleShare';
  initialPayEmpId?: number | null;
  onConsumeInitial?: () => void;
  onNavigate: (page: PageId) => void;
  onSaveEmployee: (emp: EmployeeRecord, isEdit: boolean) => Promise<void>;
  onDeleteEmployee: (id: number) => Promise<void>;
  onSavePayroll: (rec: PayrollRecord, linkedTrs?: TreasuryEntry) => Promise<void>;
  onDeletePayroll: (rec: PayrollRecord) => Promise<void>;
  onSaveTx: (item: TreasuryEntry, isEdit: boolean) => Promise<void>;
  onDeleteTx: (id: number) => Promise<void>;
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
  onCreateWorkspaceInvite: (input: {
    email: string;
    displayName: string;
    role: StaffRole;
    permissions: PageId[];
  }) => Promise<void>;
  onUpdateWorkspaceInvite: (
    inviteId: string,
    patch: {
      displayName: string;
      role: StaffRole;
      active: boolean;
      permissions: PageId[];
    }
  ) => Promise<void>;
  onDeleteWorkspaceInvite: (inviteId: string) => Promise<void>;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
  onConfirm: (cfg: ConfirmConfig) => void;
}

export const EmployeesPage: React.FC<EmployeesPageProps> = ({
  db,
  lang,
  staffAccounts,
  workspaceInvites,
  initialTab,
  initialPayEmpId,
  onConsumeInitial,
  onNavigate,
  onSaveEmployee,
  onDeleteEmployee,
  onSavePayroll,
  onDeletePayroll,
  onSaveTx,
  onDeleteTx,
  onCreateStaffAccount,
  onUpdateStaffAccount,
  onDeleteStaffAccount,
  onCreateWorkspaceInvite,
  onUpdateWorkspaceInvite,
  onDeleteWorkspaceInvite,
  onToast,
  onConfirm,
}) => {
  const { isWorkspaceOwner } = useAuth();
  const [tab, setTab] = useState<'staff' | 'payroll' | 'vault' | 'accounts' | 'googleShare'>(
    initialTab || 'vault'
  );
  const [preselectedEmpId, setPreselectedEmpId] = useState<number | null>(null);
  const [preselectedAccUid, setPreselectedAccUid] = useState<string | null>(null);
  const clearPreselection = useCallback(() => {
    setPreselectedEmpId(null);
    setPreselectedAccUid(null);
  }, []);

  // Employee Form State
  const [editEmpId, setEditEmpId] = useState<number | null>(null);
  const [empCode, setEmpCode] = useState(() => nextEmpCode(db));
  const [empName, setEmpName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [phone, setPhone] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [hireDate, setHireDate] = useState(today());
  const [empStatus, setEmpStatus] = useState<EmployeeStatus>('active');
  const [baseSalary, setBaseSalary] = useState('0');
  const [housingAllowance, setHousingAllowance] = useState('0');
  const [transportAllowance, setTransportAllowance] = useState('0');
  const [otherAllowance, setOtherAllowance] = useState('0');
  const [empNotes, setEmpNotes] = useState('');
  const [savingEmp, setSavingEmp] = useState(false);

  // Optional Inline System Login Creation State (when adding new employee)
  const [createLogin, setCreateLogin] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPass, setShowLoginPass] = useState(true);
  const [loginRole, setLoginRole] = useState<StaffRole>('staff');
  const [loginPerms, setLoginPerms] = useState<PageId[]>(DEFAULT_STAFF_PERMS);
  const [createdInlineCreds, setCreatedInlineCreds] = useState<CreatedStaffCredentials | null>(null);
  const [copiedInlineCreds, setCopiedInlineCreds] = useState(false);
  const [loginConsoleAlert, setLoginConsoleAlert] = useState(false);
  const [inlineEmailDraft, setInlineEmailDraft] = useState<InviteEmailDraft | null>(null);

  // Payroll Form State (Unified EGP)
  const [payRef, setPayRef] = useState(() => nextPayRef(db));
  const [payDate, setPayDate] = useState(today());
  const [payMonth, setPayMonth] = useState(() => today().slice(0, 7));
  const [payEmpId, setPayEmpId] = useState(() => (db.employees[0] ? String(db.employees[0].id) : ''));
  const [payType, setPayType] = useState<PayrollType>('salary');
  const [payAmountEGP, setPayAmountEGP] = useState('');
  const [postToTreasury, setPostToTreasury] = useState(true);
  const [payAccount, setPayAccount] = useState<TreasuryAccount>('payroll_vault');
  const [payNotes, setPayNotes] = useState('');
  const [savingPay, setSavingPay] = useState(false);

  // Payroll Filters
  const [filterMonth, setFilterMonth] = useState('');
  const [filterPayType, setFilterPayType] = useState('all');
  const [paySearch, setPaySearch] = useState('');

  useEffect(() => {
    if (!editEmpId) setEmpCode(nextEmpCode(db));
  }, [db.employees.length, editEmpId, db]);

  useEffect(() => {
    setPayRef(nextPayRef(db));
  }, [db.payroll.length, db]);

  useEffect(() => {
    if (!payEmpId && db.employees.length > 0) {
      const first = db.employees[0];
      setPayEmpId(String(first.id));
      if (payType === 'salary' && !payAmountEGP) {
        setPayAmountEGP(String(calcEmpTotal(first)));
      }
    }
  }, [db.employees, payEmpId, payType, payAmountEGP]);

  useEffect(() => {
    if (!initialTab && !initialPayEmpId) return;
    if (initialTab) setTab(initialTab);
    if (initialPayEmpId) {
      const emp = db.employees.find((x) => x.id === initialPayEmpId);
      setTab('payroll');
      setPayEmpId(String(initialPayEmpId));
      setPayType('salary');
      if (emp) setPayAmountEGP(String(calcEmpTotal(emp)));
      setPostToTreasury(true);
    }
    onConsumeInitial?.();
  }, [initialTab, initialPayEmpId, db.employees, onConsumeInitial]);

  const resetEmpForm = () => {
    setEditEmpId(null);
    setEmpCode(nextEmpCode(db));
    setEmpName('');
    setJobTitle('');
    setDepartment('');
    setPhone('');
    setNationalId('');
    setHireDate(today());
    setEmpStatus('active');
    setBaseSalary('0');
    setHousingAllowance('0');
    setTransportAllowance('0');
    setOtherAllowance('0');
    setEmpNotes('');
    setCreateLogin(false);
    setLoginUsername('');
    setLoginPassword('');
    setLoginRole('staff');
    setLoginPerms(DEFAULT_STAFF_PERMS);
  };

  const toggleLoginPerm = (id: PageId) => {
    setLoginPerms((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const handleToggleCreateLogin = (checked: boolean) => {
    setCreateLogin(checked);
    if (checked) {
      if (!loginUsername.trim()) {
        const suggested = normalizeUsername(empCode);
        if (suggested) setLoginUsername(suggested);
      }
      if (!loginPassword) {
        setLoginPassword(generateStrongPassword());
        setShowLoginPass(true);
      }
    }
  };

  const handleCopyInlineCreds = async () => {
    if (!createdInlineCreds) return;
    const url = getSharedAppUrl();
    const text =
      lang === 'ar'
        ? `بيانات الدخول إلى نظام BEST UNITED:\nالموظف: ${createdInlineCreds.displayName}\nاسم المستخدم (Username): ${createdInlineCreds.username}\nكلمة المرور (Password): ${createdInlineCreds.password}\nرابط الدخول: ${url}`
        : `BEST UNITED System Login Credentials:\nEmployee: ${createdInlineCreds.displayName}\nUsername: ${createdInlineCreds.username}\nPassword: ${createdInlineCreds.password}\nLogin URL: ${url}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedInlineCreds(true);
      onToast(bi(lang, 'تم نسخ بيانات الدخول للحافظة', 'Login credentials copied to clipboard'));
    } catch {
      onToast(bi(lang, 'تعذر النسخ التلقائي، انسخ البيانات يدوياً', 'Copy manually from the box'), 'info');
    }
  };

  const previewSalary =
    Number(baseSalary || 0) +
    Number(housingAllowance || 0) +
    Number(transportAllowance || 0) +
    Number(otherAllowance || 0);

  const handleEmpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empName.trim() || !jobTitle.trim() || !empCode.trim()) {
      onToast(bi(lang, 'يرجى إدخال كود الموظف والاسم والمسمى الوظيفي', 'Please enter Code, Name, and Job Title'), 'error');
      return;
    }

    const shouldCreateLogin = !editEmpId && isWorkspaceOwner && createLogin;
    const cleanUser = normalizeUsername(loginUsername);
    if (shouldCreateLogin) {
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
      if (loginPassword.length < 6) {
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
    }

    const existingEmp = editEmpId ? db.employees.find((x) => x.id === editEmpId) : undefined;
    const payload: EmployeeRecord = {
      id: editEmpId || Date.now(),
      code: empCode.trim(),
      name: empName.trim(),
      jobTitle: jobTitle.trim(),
      department: department.trim(),
      phone: phone.trim(),
      nationalId: nationalId.trim(),
      hireDate,
      baseSalary: Math.max(0, Number(baseSalary || 0)),
      housingAllowance: Math.max(0, Number(housingAllowance || 0)),
      transportAllowance: Math.max(0, Number(transportAllowance || 0)),
      otherAllowance: Math.max(0, Number(otherAllowance || 0)),
      ...(existingEmp?.salaryDay ? { salaryDay: existingEmp.salaryDay } : {}),
      status: empStatus,
      notes: empNotes.trim(),
    };

    setSavingEmp(true);
    setLoginConsoleAlert(false);
    try {
      await onSaveEmployee(payload, Boolean(editEmpId));

      if (shouldCreateLogin) {
        const finalPerms: PageId[] =
          loginRole === 'admin'
            ? ASSIGNABLE_PAGES.map((p) => p.id)
            : loginPerms.length > 0
              ? loginPerms
              : ['dashboard'];
        try {
          await onCreateStaffAccount({
            username: cleanUser,
            password: loginPassword,
            displayName: payload.name,
            role: loginRole,
            permissions: finalPerms,
            employeeId: payload.id,
          });
          setCreatedInlineCreds({
            displayName: payload.name,
            username: cleanUser,
            password: loginPassword,
            role: loginRole,
          });
          setCopiedInlineCreds(false);
          onToast(
            bi(
              lang,
              `تم إضافة الموظف وإنشاء حساب الدخول (@${cleanUser}) بنجاح`,
              `Employee added and login (@${cleanUser}) created`
            )
          );
          resetEmpForm();
        } catch (err: unknown) {
          const code = (err as { code?: string; message?: string })?.code || '';
          const msg = (err as { message?: string })?.message || '';
          if (code === 'auth/operation-not-allowed') {
            setLoginConsoleAlert(true);
            onToast(
              bi(
                lang,
                'تم حفظ الموظف، ولكن يجب تفعيل خيار Email/Password في Firebase Console لإنشاء اليوزر والباسورد',
                'Employee saved, but Email/Password must be enabled in Firebase Console first'
              ),
              'error'
            );
          } else if (msg === 'USERNAME_TAKEN_DIFFERENT_PASSWORD') {
            onToast(
              bi(
                lang,
                'تم حفظ الموظف، لكن اسم المستخدم مسجل مسبقاً بكلمة مرور مختلفة. اختر اسماً آخر من تبويب حسابات الدخول.',
                'Employee saved, but username exists with a different password. Use another username in Accounts tab.'
              ),
              'error'
            );
          } else if (msg === 'USERNAME_OWNED_BY_OTHER_WORKSPACE') {
            onToast(
              bi(
                lang,
                'تم حفظ الموظف، لكن اسم المستخدم مرتبط بشركة أخرى. اختر اسم مستخدم مختلف.',
                'Employee saved, but username belongs to another workspace. Choose a different username.'
              ),
              'error'
            );
          } else if (code === 'auth/email-already-in-use') {
            onToast(
              bi(
                lang,
                'تم حفظ الموظف، لكن اسم المستخدم مسجل مسبقاً. أنشئ له يوزر من تبويب حسابات الدخول',
                'Employee saved, but username already exists. Create login from Accounts tab'
              ),
              'error'
            );
          } else {
            onToast(
              bi(
                lang,
                `تم حفظ الموظف، لكن تعذر إنشاء حساب الدخول: ${code || msg}`,
                `Employee saved, but login creation failed: ${code || msg}`
              ),
              'error'
            );
          }
        }
      } else {
        onToast(
          editEmpId
            ? bi(lang, 'تم تحديث بيانات الموظف', 'Employee updated')
            : bi(lang, 'تم إضافة الموظف بنجاح', 'Employee added')
        );
        resetEmpForm();
      }
    } finally {
      setSavingEmp(false);
    }
  };

  const handleEditEmp = (emp: EmployeeRecord) => {
    setEditEmpId(emp.id);
    setEmpCode(emp.code);
    setEmpName(emp.name);
    setJobTitle(emp.jobTitle);
    setDepartment(emp.department || '');
    setPhone(emp.phone || '');
    setNationalId(emp.nationalId || '');
    setHireDate(emp.hireDate || today());
    setEmpStatus(emp.status || 'active');
    setBaseSalary(String(emp.baseSalary));
    setHousingAllowance(String(emp.housingAllowance));
    setTransportAllowance(String(emp.transportAllowance));
    setOtherAllowance(String(emp.otherAllowance));
    setEmpNotes(emp.notes || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteEmp = (emp: EmployeeRecord) => {
    const hasLinks =
      db.payroll.some((p) => p.employeeId === emp.id) ||
      db.treasury.some((t) => t.employeeId === emp.id);
    if (hasLinks) {
      onToast(
        bi(lang, 'لا يمكن حذف موظف لديه مسيرات رواتب أو قيود خزنة مرتبطة', 'Cannot delete employee with linked payroll or treasury records'),
        'error'
      );
      return;
    }

    onConfirm({
      title: bi(lang, 'حذف موظف', 'Delete Employee'),
      message: bi(lang, `هل تريد حذف الموظف "${emp.name}"؟`, `Delete employee "${emp.name}"?`),
      danger: true,
      onConfirm: async () => {
        await onDeleteEmployee(emp.id);
        if (editEmpId === emp.id) resetEmpForm();
        onToast(bi(lang, 'تم حذف الموظف', 'Employee deleted'));
      },
    });
  };

  const handlePayEmployeeClick = (emp: EmployeeRecord) => {
    setTab('payroll');
    setPayEmpId(String(emp.id));
    setPayType('salary');
    setPayAmountEGP(String(calcEmpTotal(emp)));
    setPostToTreasury(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePayEmpSelect = (val: string) => {
    setPayEmpId(val);
    const emp = db.employees.find((x) => String(x.id) === val);
    if (emp && payType === 'salary') {
      setPayAmountEGP(String(calcEmpTotal(emp)));
    }
  };

  const handlePayTypeChange = (tp: PayrollType) => {
    setPayType(tp);
    if (tp === 'deduction') {
      setPostToTreasury(false);
    } else if (tp === 'salary') {
      const emp = db.employees.find((x) => String(x.id) === payEmpId);
      if (emp) setPayAmountEGP(String(calcEmpTotal(emp)));
    }
  };

  const handlePayrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const emp = db.employees.find((x) => String(x.id) === payEmpId);
    const egpVal = Math.max(0, Number(payAmountEGP || 0));

    if (!emp || !payRef.trim() || egpVal <= 0) {
      onToast(
        bi(
          lang,
          'يرجى اختيار الموظف وإدخال مبلغ صحيح بالجنيه المصري (ج.م)',
          'Please select an employee and enter a valid amount in EGP'
        ),
        'error'
      );
      return;
    }

    const r = 13;
    const safeSAR = Math.max(0.01, Number(toSAR(egpVal, 'EGP', r, db.rate).toFixed(2)));

    const willPost = payType !== 'deduction' && postToTreasury;
    const trsId = willPost ? Date.now() + 1 : undefined;

    const payRec: PayrollRecord = {
      id: Date.now(),
      refNo: payRef.trim(),
      date: payDate,
      month: payMonth,
      employeeId: emp.id,
      employeeName: emp.name,
      recordType: payType,
      amount: Number(egpVal.toFixed(2)),
      currency: 'EGP',
      rate: r,
      amountSAR: safeSAR,
      amountEGP: Number(egpVal.toFixed(2)),
      amountUSD: 0,
      postToTreasury: willPost,
      treasuryAccount: payAccount,
      ...(trsId ? { linkedTreasuryId: trsId } : {}),
      notes: payNotes.trim(),
    };

    const linkedTrs: TreasuryEntry | undefined =
      willPost && trsId
        ? {
            id: trsId,
            refNo: nextTrsRef(db),
            date: payDate,
            type: 'out',
            category: payType === 'advance' ? 'advance' : 'salary',
            account: payAccount,
            amount: Number(egpVal.toFixed(2)),
            currency: 'EGP',
            rate: r,
            amountSAR: safeSAR,
            amountEGP: Number(egpVal.toFixed(2)),
            amountUSD: 0,
            description: `${PAYROLL_TYPES[payType][lang]} - ${emp.name} (${payMonth})`,
            employeeId: emp.id,
            employeeName: emp.name,
            notes: payNotes.trim(),
          }
        : undefined;

    setSavingPay(true);
    try {
      await onSavePayroll(payRec, linkedTrs);
      onToast(bi(lang, 'تم تسجيل حركة الراتب بالجنيه المصري بنجاح', 'Payroll record saved in EGP'));
      setPayNotes('');
    } finally {
      setSavingPay(false);
    }
  };

  const handleDeletePayrollRow = (rec: PayrollRecord) => {
    onConfirm({
      title: bi(lang, 'حذف سجل راتب', 'Delete Payroll Record'),
      message: bi(
        lang,
        `هل تريد حذف حركة "${rec.refNo}" (${rec.employeeName})${rec.linkedTreasuryId ? ' وقيد الخزنة المرتبط بها' : ''}؟`,
        `Delete payroll record "${rec.refNo}" (${rec.employeeName})${rec.linkedTreasuryId ? ' and its linked treasury entry' : ''}?`
      ),
      danger: true,
      onConfirm: async () => {
        await onDeletePayroll(rec);
        onToast(bi(lang, 'تم حذف حركة الراتب', 'Payroll record deleted'));
      },
    });
  };

  const activeEmployees = db.employees.filter((e) => e.status === 'active');
  const monthlyLiability = sumBy(activeEmployees, calcEmpTotal);
  const totalPaid = sumBy(
    db.payroll.filter((p) => p.recordType === 'salary' || p.recordType === 'bonus'),
    (p) => getEgpAmount(p)
  );
  const totalAdvDed = sumBy(
    db.payroll.filter((p) => p.recordType === 'advance' || p.recordType === 'deduction'),
    (p) => getEgpAmount(p)
  );

  const filteredPayroll = useMemo(() => {
    const q = paySearch.trim().toLowerCase();
    return db.payroll
      .filter((p) => {
        if (filterMonth && p.month !== filterMonth) return false;
        if (filterPayType !== 'all' && p.recordType !== filterPayType) return false;
        if (q && !`${p.refNo} ${p.employeeName} ${p.notes}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .slice()
      .reverse();
  }, [db.payroll, filterMonth, filterPayType, paySearch]);

  const exportEmployeesCsv = () => {
    csvDownload('employees.csv', [
      [
        tKey(lang, 'lblCode'),
        tKey(lang, 'lblEmpName'),
        tKey(lang, 'lblJobTitle'),
        tKey(lang, 'lblDept'),
        tKey(lang, 'lblPhone'),
        tKey(lang, 'lblHireDate'),
        tKey(lang, 'lblBaseSalary'),
        tKey(lang, 'thAllowances'),
        tKey(lang, 'thTotalSalary'),
        tKey(lang, 'thStatus'),
      ],
      ...db.employees.map((e) => [
        e.code,
        e.name,
        e.jobTitle,
        e.department,
        e.phone,
        e.hireDate,
        e.baseSalary,
        e.housingAllowance + e.transportAllowance + e.otherAllowance,
        calcEmpTotal(e),
        EMPLOYEE_STATUS[e.status]?.[lang] || e.status,
      ]),
    ]);
  };

  const exportPayrollCsv = () => {
    csvDownload('payroll_egp.csv', [
      [
        tKey(lang, 'thRef'),
        tKey(lang, 'thDate'),
        tKey(lang, 'lblPayMonth'),
        tKey(lang, 'lblEmpName'),
        tKey(lang, 'thType'),
        bi(lang, 'المبلغ بالجنيه المصري (EGP)', 'Amount (EGP)'),
        tKey(lang, 'lblCurrency'),
        tKey(lang, 'thTreasuryLink'),
        tKey(lang, 'lblNotes'),
      ],
      ...db.payroll.map((p) => [
        p.refNo,
        p.date,
        p.month,
        p.employeeName,
        PAYROLL_TYPES[p.recordType]?.[lang] || p.recordType,
        getEgpAmount(p).toFixed(2),
        'EGP',
        p.postToTreasury ? TREASURY_ACCOUNTS[p.treasuryAccount]?.[lang] : '-',
        p.notes,
      ]),
    ]);
  };

  return (
    <div className="space-y-5">
      {/* Top Switcher & Treasury Shortcut */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap rounded-xl bg-white border border-slate-200 p-1 gap-0.5">
          <button
            type="button"
            onClick={() => setTab('vault')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
              tab === 'vault' ? 'bg-[#0f766e] text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Vault className="w-3.5 h-3.5" />
            <span>{tKey(lang, 'empTabVault')}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('staff')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
              tab === 'staff' ? 'bg-[#0f1e36] text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tKey(lang, 'empTabStaff')}
          </button>
          <button
            type="button"
            onClick={() => setTab('payroll')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
              tab === 'payroll' ? 'bg-[#0f1e36] text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tKey(lang, 'empTabPayroll')}
          </button>
          {isWorkspaceOwner && (
            <>
              <button
                type="button"
                onClick={() => setTab('accounts')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                  tab === 'accounts' ? 'bg-[#1d4ed8] text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{tKey(lang, 'empTabAccounts')}</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('googleShare')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                  tab === 'googleShare' ? 'bg-[#0f766e] text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                <span>{tKey(lang, 'empTabGoogleShare')}</span>
              </button>
            </>
          )}
        </div>

        <button type="button" onClick={() => onNavigate('treasury')} className={btnSecondaryCls}>
          <Wallet className="w-3.5 h-3.5" />
          <span>{tKey(lang, 'btnGoTreasury')}</span>
        </button>
      </div>

      {/* 4 KPIs (Unified EGP) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <KpiCard
          label={tKey(lang, 'empKpiCount')}
          value={`${db.employees.length} (${activeEmployees.length})`}
          tone="blue"
        />
        <KpiCard label={tKey(lang, 'empKpiLiability')} value={`${fmt(monthlyLiability)} ج.م`} tone="amber" />
        <KpiCard label={tKey(lang, 'empKpiPaid')} value={`${fmt(totalPaid)} ج.م`} tone="teal" />
        <KpiCard label={tKey(lang, 'empKpiAdv')} value={`${fmt(totalAdvDed)} ج.م`} tone="red" />
      </div>

      {tab === 'vault' ? (
        <EmployeesVaultPanel
          db={db}
          lang={lang}
          onSaveTx={onSaveTx}
          onDeleteTx={onDeleteTx}
          onSavePayroll={onSavePayroll}
          onDeletePayroll={onDeletePayroll}
          onToast={onToast}
          onConfirm={onConfirm}
        />
      ) : tab === 'googleShare' && isWorkspaceOwner ? (
        <GoogleInvitesPanel
          lang={lang}
          workspaceInvites={workspaceInvites}
          onCreateInvite={onCreateWorkspaceInvite}
          onUpdateInvite={onUpdateWorkspaceInvite}
          onDeleteInvite={onDeleteWorkspaceInvite}
          onToast={onToast}
          onConfirm={onConfirm}
        />
      ) : tab === 'accounts' && isWorkspaceOwner ? (
        <StaffAccountsPanel
          lang={lang}
          employees={db.employees}
          staffAccounts={staffAccounts}
          preselectedEmployeeId={preselectedEmpId}
          preselectedAccountUid={preselectedAccUid}
          onClearPreselection={clearPreselection}
          onCreateStaffAccount={onCreateStaffAccount}
          onUpdateStaffAccount={onUpdateStaffAccount}
          onDeleteStaffAccount={onDeleteStaffAccount}
          onToast={onToast}
          onConfirm={onConfirm}
        />
      ) : tab === 'staff' ? (
        <>
          {createdInlineCreds && (
            <div className="no-print p-4 rounded-2xl bg-teal-50 border border-teal-300 text-teal-950 text-xs space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-bold text-sm text-[#0f766e]">
                  <KeyRound className="w-4 h-4" />
                  <span>
                    {bi(
                      lang,
                      `تم إنشاء بيانات دخول الموظف (${createdInlineCreds.displayName}) بنجاح — انسخها وأرسلها للموظف`,
                      `Employee Login Created (${createdInlineCreds.displayName}) — Copy & Share`
                    )}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const roleLabel =
                        createdInlineCreds.role === 'admin'
                          ? bi(lang, 'مشرف إداري', 'Operational Admin')
                          : bi(lang, 'موظف بصلاحيات مخصصة', 'Staff (Custom Permissions)');
                      const content = buildStaffAccountEmailContent(lang, {
                        displayName: createdInlineCreds.displayName,
                        username: createdInlineCreds.username,
                        password: createdInlineCreds.password,
                        roleLabel,
                      });
                      setInlineEmailDraft({
                        recipientName: createdInlineCreds.displayName,
                        to: '',
                        subject: content.subject,
                        body: content.body,
                      });
                    }}
                    className={btnTealCls}
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{bi(lang, 'إرسال عبر Gmail', 'Send via Gmail')}</span>
                  </button>
                  <button type="button" onClick={() => void handleCopyInlineCreds()} className={btnPrimaryCls}>
                    {copiedInlineCreds ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>
                      {copiedInlineCreds
                        ? bi(lang, 'تم النسخ', 'Copied')
                        : bi(lang, 'نسخ بيانات الدخول', 'Copy Login Credentials')}
                    </span>
                  </button>
                  <button type="button" onClick={() => setCreatedInlineCreds(null)} className={btnSecondaryCls}>
                    {bi(lang, 'إخفاء', 'Dismiss')}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-white p-3 rounded-xl border border-teal-200 font-mono-num" dir="ltr">
                <div>
                  <span className="text-slate-500 text-[11px] block">Username</span>
                  <strong className="text-sm text-[#1d4ed8]">{createdInlineCreds.username}</strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">Password</span>
                  <strong className="text-sm text-slate-900">{createdInlineCreds.password}</strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">Login Method</span>
                  <strong className="text-xs text-slate-700">Employee Username &amp; Password</strong>
                </div>
              </div>
            </div>
          )}

          {loginConsoleAlert && (
            <div className="no-print p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-700" />
                <span>
                  {bi(
                    lang,
                    'خطوة مطلوبة في لوحة تحكم Firebase لتفعيل الدخول باليوزر والباسورد',
                    'Firebase Console Step Required for Username/Password Login'
                  )}
                </span>
              </div>
              <p className="leading-relaxed">
                {bi(
                  lang,
                  'افتح رابط Firebase Authentication أدناه ثم فعّل مزود الدخول (Email/Password) واضغط Save، وبعدها يمكنك إنشاء يوزر نيم وباسورد لأي موظف.',
                  'Open Firebase Authentication below, enable the Email/Password sign-in provider and click Save.'
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
            title={editEmpId ? tKey(lang, 'empFormEdit') : tKey(lang, 'empFormNew')}
            actions={
              <button type="button" onClick={resetEmpForm} className={btnSecondaryCls}>
                {tKey(lang, 'btnClear')}
              </button>
            }
          >
            <form onSubmit={handleEmpSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div>
                  <label className={labelCls}>{tKey(lang, 'lblCode')}</label>
                  <input
                    type="text"
                    required
                    value={empCode}
                    onChange={(e) => setEmpCode(e.target.value)}
                    className={`${inputCls} font-mono-num`}
                  />
                </div>
                <div>
                  <label className={labelCls}>{tKey(lang, 'lblEmpName')}</label>
                  <input
                    type="text"
                    required
                    value={empName}
                    onChange={(e) => setEmpName(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>{tKey(lang, 'lblJobTitle')}</label>
                  <input
                    type="text"
                    required
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>{tKey(lang, 'lblDept')}</label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>{tKey(lang, 'lblPhone')}</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={`${inputCls} font-mono-num`}
                  />
                </div>
                <div>
                  <label className={labelCls}>{tKey(lang, 'lblNationalId')}</label>
                  <input
                    type="text"
                    value={nationalId}
                    onChange={(e) => setNationalId(e.target.value)}
                    className={`${inputCls} font-mono-num`}
                  />
                </div>
                <div>
                  <label className={labelCls}>{tKey(lang, 'lblHireDate')}</label>
                  <input
                    type="date"
                    required
                    value={hireDate}
                    onChange={(e) => setHireDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>{tKey(lang, 'thStatus')}</label>
                  <select
                    value={empStatus}
                    onChange={(e) => setEmpStatus(e.target.value as EmployeeStatus)}
                    className={inputCls}
                  >
                    {(Object.keys(EMPLOYEE_STATUS) as EmployeeStatus[]).map((k) => (
                      <option key={k} value={k}>
                        {EMPLOYEE_STATUS[k][lang]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{tKey(lang, 'lblBaseSalary')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    required
                    value={baseSalary}
                    onChange={(e) => setBaseSalary(e.target.value)}
                    className={`${inputCls} font-mono-num`}
                  />
                </div>
                <div>
                  <label className={labelCls}>{tKey(lang, 'lblHousing')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={housingAllowance}
                    onChange={(e) => setHousingAllowance(e.target.value)}
                    className={`${inputCls} font-mono-num`}
                  />
                </div>
                <div>
                  <label className={labelCls}>{tKey(lang, 'lblTransportAllow')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={transportAllowance}
                    onChange={(e) => setTransportAllowance(e.target.value)}
                    className={`${inputCls} font-mono-num`}
                  />
                </div>
                <div>
                  <label className={labelCls}>{tKey(lang, 'lblOtherAllow')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={otherAllowance}
                    onChange={(e) => setOtherAllowance(e.target.value)}
                    className={`${inputCls} font-mono-num`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-end">
                <div className="lg:col-span-6">
                  <label className={labelCls}>{tKey(lang, 'lblNotes')}</label>
                  <input
                    type="text"
                    value={empNotes}
                    onChange={(e) => setEmpNotes(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="lg:col-span-6 flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs font-mono-num text-slate-700">
                    {bi(lang, 'إجمالي الراتب الشهري:', 'Total Monthly Salary:')}{' '}
                    <strong className="text-[#0f766e]">{fmt(previewSalary)} ج.م</strong>
                  </div>
                  <button type="submit" disabled={savingEmp} className={btnPrimaryCls}>
                    <Plus className="w-3.5 h-3.5" />
                    <span>{editEmpId ? tKey(lang, 'btnUpdateEmp') : tKey(lang, 'btnSaveEmp')}</span>
                  </button>
                </div>
              </div>

              {/* Optional Direct System Login Creation (Username & Password) */}
              {!editEmpId && isWorkspaceOwner && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3.5">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={createLogin}
                      onChange={(e) => handleToggleCreateLogin(e.target.checked)}
                      className="w-4 h-4 accent-[#1d4ed8]"
                    />
                    <KeyRound className="w-4 h-4 text-[#1d4ed8]" />
                    <span className="text-xs font-bold text-slate-900">
                      {bi(
                        lang,
                        'إنشاء حساب دخول للنظام (اسم مستخدم وكلمة مرور) لهذا الموظف مباشرة',
                        'Create System Login Account (Username & Password) for this employee'
                      )}
                    </span>
                  </label>

                  {createLogin && (
                    <div className="space-y-3.5 pt-2 border-t border-blue-200/70">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                        <div>
                          <label className={labelCls}>{tKey(lang, 'lblUsername')} *</label>
                          <input
                            type="text"
                            required={createLogin}
                            dir="ltr"
                            value={loginUsername}
                            onChange={(e) => setLoginUsername(e.target.value)}
                            placeholder="e.g. ahmed01"
                            className={`${inputCls} font-mono-num`}
                          />
                          {loginUsername && (
                            <div className="mt-1 text-[11px] text-slate-500 font-mono-num" dir="ltr">
                              {bi(lang, 'سيتم الدخول بـ:', 'Login ID:')}{' '}
                              <strong>@{normalizeUsername(loginUsername) || '...'}</strong>
                            </div>
                          )}
                        </div>

                        <div>
                          <label className={labelCls}>{tKey(lang, 'lblPassword')} *</label>
                          <div className="flex items-center gap-1.5">
                            <div className="relative flex-1">
                              <input
                                type={showLoginPass ? 'text' : 'password'}
                                required={createLogin}
                                minLength={6}
                                dir="ltr"
                                value={loginPassword}
                                onChange={(e) => setLoginPassword(e.target.value)}
                                placeholder="min 6 chars"
                                className={`${inputCls} pe-9 font-mono-num`}
                              />
                              <button
                                type="button"
                                onClick={() => setShowLoginPass((s) => !s)}
                                className="absolute inset-y-0 end-0 px-2.5 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                                tabIndex={-1}
                              >
                                {showLoginPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                            <button
                              type="button"
                              title={bi(lang, 'توليد كلمة مرور قوية', 'Generate Password')}
                              onClick={() => {
                                setLoginPassword(generateStrongPassword());
                                setShowLoginPass(true);
                              }}
                              className="h-9 px-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer shrink-0"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className={labelCls}>{bi(lang, 'نوع الحساب والصلاحية', 'Account Role')}</label>
                          <select
                            value={loginRole}
                            onChange={(e) => setLoginRole(e.target.value as StaffRole)}
                            className={inputCls}
                          >
                            <option value="staff">
                              {bi(lang, 'موظف بصلاحيات مخصصة (Staff)', 'Staff (Custom Permissions)')}
                            </option>
                            <option value="admin">
                              {bi(lang, 'مشرف إداري (كل الشاشات التشغيلية)', 'Admin (All Operational Screens)')}
                            </option>
                          </select>
                        </div>
                      </div>

                      {loginRole === 'staff' && (
                        <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                              <ShieldCheck className="w-4 h-4 text-[#1d4ed8]" />
                              <span>{bi(lang, 'الشاشات المصرح للموظف فتحها:', 'Allowed System Screens:')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setLoginPerms(ASSIGNABLE_PAGES.map((p) => p.id))}
                                className={btnSoftBlueCls}
                              >
                                {bi(lang, 'تحديد الكل', 'Select All')}
                              </button>
                              <button
                                type="button"
                                onClick={() => setLoginPerms(['dashboard'])}
                                className={btnSecondaryCls}
                              >
                                {bi(lang, 'لوحة التحكم فقط', 'Dashboard Only')}
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                            {ASSIGNABLE_PAGES.map((pg) => {
                              const checked = loginPerms.includes(pg.id);
                              return (
                                <button
                                  key={pg.id}
                                  type="button"
                                  onClick={() => toggleLoginPerm(pg.id)}
                                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs text-start transition cursor-pointer ${
                                    checked
                                      ? 'bg-blue-50/40 border-[#1d4ed8] text-[#1d4ed8] font-semibold'
                                      : 'bg-slate-50/50 border-slate-200 text-slate-600 hover:bg-white'
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
                    </div>
                  )}
                </div>
              )}
            </form>
          </Panel>

          <Panel
            title={tKey(lang, 'empListTitle')}
            actions={
              <button type="button" onClick={exportEmployeesCsv} className={btnSecondaryCls}>
                <Download className="w-3.5 h-3.5" />
                <span>{tKey(lang, 'btnCsv')}</span>
              </button>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'lblCode')}</th>
                    <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'lblEmpName')}</th>
                    <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'lblJobTitle')}</th>
                    <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'lblPhone')}</th>
                    <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'lblBaseSalary')}</th>
                    <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thAllowances')}</th>
                    <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thTotalSalary')}</th>
                    <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thStatus')}</th>
                    {isWorkspaceOwner && (
                      <th className="py-2.5 px-2.5 text-start font-bold no-print">
                        {bi(lang, 'حساب الدخول', 'System Login')}
                      </th>
                    )}
                    <th className="py-2.5 px-2.5 text-start font-bold no-print">{tKey(lang, 'thAction')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {db.employees.length === 0 ? (
                    <EmptyRow colSpan={isWorkspaceOwner ? 10 : 9} lang={lang} />
                  ) : (
                    db.employees.map((e) => {
                      const allow = e.housingAllowance + e.transportAllowance + e.otherAllowance;
                      const tot = calcEmpTotal(e);
                      const st = EMPLOYEE_STATUS[e.status] || EMPLOYEE_STATUS.active;
                      const linkedAcc = staffAccounts.find((a) => a.employeeId === e.id);
                      return (
                        <tr key={e.id} className="hover:bg-slate-50">
                          <td className="py-2 px-2.5 font-mono-num font-bold">{e.code}</td>
                          <td className="py-2 px-2.5 font-semibold text-slate-900">{e.name}</td>
                          <td className="py-2 px-2.5">
                            <div>{e.jobTitle}</div>
                            {e.department && <div className="text-[11px] text-slate-400">{e.department}</div>}
                          </td>
                          <td className="py-2 px-2.5 font-mono-num">{e.phone || '-'}</td>
                          <td className="py-2 px-2.5 font-mono-num">{fmt(e.baseSalary)} ج.م</td>
                          <td className="py-2 px-2.5 font-mono-num">{fmt(allow)} ج.م</td>
                          <td className="py-2 px-2.5 font-mono-num font-bold text-[#0f766e]">{fmt(tot)} ج.م</td>
                          <td className="py-2 px-2.5">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${st.cls}`}>
                              {st[lang]}
                            </span>
                          </td>
                          {isWorkspaceOwner && (
                            <td className="py-2 px-2.5 no-print">
                              {linkedAcc ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreselectedEmpId(null);
                                    setPreselectedAccUid(linkedAcc.uid);
                                    setTab('accounts');
                                  }}
                                  className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-teal-50 hover:bg-teal-100 text-[#0f766e] text-[11px] font-semibold transition cursor-pointer whitespace-nowrap"
                                >
                                  <KeyRound className="w-3 h-3" />
                                  <span dir="ltr" className="font-mono-num">
                                    @{linkedAcc.username}
                                  </span>
                                  {!linkedAcc.active && (
                                    <span className="text-red-600">({bi(lang, 'موقوف', 'Off')})</span>
                                  )}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreselectedAccUid(null);
                                    setPreselectedEmpId(e.id);
                                    setTab('accounts');
                                  }}
                                  className={btnSoftBlueCls}
                                >
                                  <KeyRound className="w-3 h-3" />
                                  <span>{bi(lang, 'عمل يوزر وباسورد', 'Create Login')}</span>
                                </button>
                              )}
                            </td>
                          )}
                          <td className="py-2 px-2.5 no-print">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handlePayEmployeeClick(e)}
                                className={btnSoftBlueCls}
                              >
                                <Banknote className="w-3 h-3" />
                                <span>{bi(lang, 'صرف', 'Pay')}</span>
                              </button>
                              <button type="button" onClick={() => handleEditEmp(e)} className={btnSoftBlueCls}>
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button type="button" onClick={() => handleDeleteEmp(e)} className={btnSoftRedCls}>
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
        </>
      ) : (
        <>
          {/* Payroll Tab */}
          <Panel className="no-print" title={tKey(lang, 'payFormTitle')}>
            <div className="mb-4 p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-slate-700">
              {tKey(lang, 'payNotice')}
            </div>

            <form onSubmit={handlePayrollSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div>
                  <label className={labelCls}>{tKey(lang, 'thRef')}</label>
                  <input
                    type="text"
                    required
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    className={`${inputCls} font-mono-num`}
                  />
                </div>
                <div>
                  <label className={labelCls}>{tKey(lang, 'thDate')}</label>
                  <input
                    type="date"
                    required
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>{tKey(lang, 'lblPayMonth')}</label>
                  <input
                    type="month"
                    required
                    value={payMonth}
                    onChange={(e) => setPayMonth(e.target.value)}
                    className={`${inputCls} font-mono-num`}
                  />
                </div>
                <div>
                  <label className={labelCls}>{tKey(lang, 'lblEmpName')}</label>
                  <select
                    required
                    value={payEmpId}
                    onChange={(e) => handlePayEmpSelect(e.target.value)}
                    className={inputCls}
                  >
                    {db.employees.length === 0 ? (
                      <option value="">{bi(lang, 'لا يوجد موظفون', 'No employees')}</option>
                    ) : (
                      db.employees.map((e) => (
                        <option key={e.id} value={String(e.id)}>
                          {e.name} ({e.code})
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{tKey(lang, 'thType')}</label>
                  <select
                    value={payType}
                    onChange={(e) => handlePayTypeChange(e.target.value as PayrollType)}
                    className={inputCls}
                  >
                    {(Object.keys(PAYROLL_TYPES) as PayrollType[]).map((k) => (
                      <option key={k} value={k}>
                        {PAYROLL_TYPES[k][lang]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{bi(lang, 'المبلغ بالجنيه المصري (ج.م / EGP) *', 'Amount (EGP) *')}</label>
                  <input
                    type="number"
                    step="any"
                    min={0.01}
                    required
                    value={payAmountEGP}
                    onChange={(e) => setPayAmountEGP(e.target.value)}
                    placeholder="0.00"
                    className={`${inputCls} font-mono-num font-bold border-teal-300`}
                  />
                </div>
                <div>
                  <label className={labelCls}>{tKey(lang, 'lblCurrency')}</label>
                  <div className="h-9 px-3 rounded-lg border border-teal-200 bg-teal-50/70 text-[#0f766e] text-xs font-bold flex items-center justify-between">
                    <span>{bi(lang, 'جنيه مصري (ج.م)', 'Egyptian Pound')}</span>
                    <span className="font-mono-num">EGP</span>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>{tKey(lang, 'lblTrsAcc')}</label>
                  <select
                    disabled={payType === 'deduction' || !postToTreasury}
                    value={payAccount}
                    onChange={(e) => setPayAccount(e.target.value as TreasuryAccount)}
                    className={inputCls}
                  >
                    {(Object.keys(TREASURY_ACCOUNTS) as TreasuryAccount[]).map((k) => (
                      <option key={k} value={k}>
                        {TREASURY_ACCOUNTS[k][lang]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{tKey(lang, 'lblNotes')}</label>
                  <input
                    type="text"
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={payType === 'deduction'}
                    checked={payType !== 'deduction' && postToTreasury}
                    onChange={(e) => setPostToTreasury(e.target.checked)}
                    className="w-4 h-4 accent-[#0f766e]"
                  />
                  <span>{tKey(lang, 'lblPostTreasury')}</span>
                </label>

                <button type="submit" disabled={savingPay || db.employees.length === 0} className={btnPrimaryCls}>
                  <Plus className="w-3.5 h-3.5" />
                  <span>{tKey(lang, 'btnSavePay')}</span>
                </button>
              </div>
            </form>
          </Panel>

          <Panel
            title={tKey(lang, 'payLogTitle')}
            actions={
              <>
                <input
                  type="month"
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  className="h-9 px-3 rounded-xl border border-slate-200 text-xs font-mono-num"
                />
                <select
                  value={filterPayType}
                  onChange={(e) => setFilterPayType(e.target.value)}
                  className="h-9 px-3 rounded-xl border border-slate-200 text-xs bg-white"
                >
                  <option value="all">{bi(lang, 'كل الأنواع', 'All Types')}</option>
                  {(Object.keys(PAYROLL_TYPES) as PayrollType[]).map((k) => (
                    <option key={k} value={k}>
                      {PAYROLL_TYPES[k][lang]}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={paySearch}
                  onChange={(e) => setPaySearch(e.target.value)}
                  placeholder={tKey(lang, 'searchPlaceholder')}
                  className="h-9 px-3 rounded-xl border border-slate-200 text-xs w-36 focus:outline-none focus:border-[#1d4ed8]"
                />
                <button type="button" onClick={exportPayrollCsv} className={btnSecondaryCls}>
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
                    <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thRef')}</th>
                    <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thDate')}</th>
                    <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'lblPayMonth')}</th>
                    <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'lblEmpName')}</th>
                    <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thType')}</th>
                    <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'lblAmount')}</th>
                    <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'thTreasuryLink')}</th>
                    <th className="py-2.5 px-2.5 text-start font-bold">{tKey(lang, 'lblNotes')}</th>
                    <th className="py-2.5 px-2.5 text-start font-bold no-print">{tKey(lang, 'thAction')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPayroll.length === 0 ? (
                    <EmptyRow colSpan={9} lang={lang} />
                  ) : (
                    filteredPayroll.map((p) => {
                      const pt = PAYROLL_TYPES[p.recordType] || PAYROLL_TYPES.salary;
                      return (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="py-2 px-2.5 font-mono-num font-bold">{p.refNo}</td>
                          <td className="py-2 px-2.5 font-mono-num">{p.date}</td>
                          <td className="py-2 px-2.5 font-mono-num">{p.month}</td>
                          <td className="py-2 px-2.5 font-semibold">{p.employeeName}</td>
                          <td className="py-2 px-2.5">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${pt.cls}`}>
                              {pt[lang]}
                            </span>
                          </td>
                          <td className="py-2 px-2.5 font-mono-num font-bold text-[#0f766e]">
                            {fmt(getEgpAmount(p))} ج.م
                          </td>
                          <td className="py-2 px-2.5">
                            {p.postToTreasury ? TREASURY_ACCOUNTS[p.treasuryAccount]?.[lang] : '-'}
                          </td>
                          <td className="py-2 px-2.5 text-slate-500">{p.notes || '-'}</td>
                          <td className="py-2 px-2.5 no-print">
                            <button type="button" onClick={() => handleDeletePayrollRow(p)} className={btnSoftRedCls}>
                              <Trash2 className="w-3 h-3" />
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
        </>
      )}

      <SendInviteEmailModal
        lang={lang}
        draft={inlineEmailDraft}
        onClose={() => setInlineEmailDraft(null)}
        onToast={onToast}
      />
    </div>
  );
};
