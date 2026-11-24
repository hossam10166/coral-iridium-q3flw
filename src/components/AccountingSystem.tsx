import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Bell,
  BookOpen,
  Bus,
  CalendarCheck2,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Globe,
  Layers,
  LayoutDashboard,
  LogOut,
  Printer,
  Settings,
  Stamp,
  Tag,
  Truck,
  Upload,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAccountingStore } from '../hooks/useAccountingStore';
import { bi, tKey } from '../i18n/translations';
import { GroupInvoice, PageId } from '../types/accounting';
import { parseBackupJson } from '../utils/backup';
import { formatTime24, today } from '../utils/calculations';
import {
  buildDueAlerts,
  formatDueCountdown,
  getSavedAlertWindowDays,
  setSavedAlertWindowDays,
} from '../utils/alerts';
import {
  ConfirmConfig,
  ConfirmModal,
  ToastBanner,
  ToastState,
  btnPrimaryCls,
  btnSecondaryCls,
} from './AccountingUI';
import { PWAInstallButton } from './PWAControls';
import { DashboardPage } from './pages/DashboardPage';
import { VisaEntryPage } from './pages/VisaEntryPage';
import { UmrahVisa1448Page } from './pages/UmrahVisa1448Page';
import { TransportPage } from './pages/TransportPage';
import { GroupsPage } from './pages/GroupsPage';
import { OperationsPage } from './pages/OperationsPage';
import { CodingPage, CustomersPage, SuppliersPage } from './pages/CustomersSuppliersPages';
import { LedgerPage } from './pages/LedgersPage';
import { VoucherPage } from './pages/VoucherPage';
import { InvoicePage } from './pages/InvoicePage';
import { TreasuryPage } from './pages/TreasuryPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';

interface NavItem {
  id: PageId;
  labelKey: string;
  icon: React.FC<{ className?: string }>;
}

const NAV_GROUPS: { groupKey: string; items: NavItem[] }[] = [
  {
    groupKey: 'grpOps',
    items: [
      { id: 'dashboard', labelKey: 'navDashboard', icon: LayoutDashboard },
      { id: 'entry', labelKey: 'navEntry', icon: FileSpreadsheet },
      { id: 'umrahVisa1448', labelKey: 'navUmrah1448', icon: Stamp },
      { id: 'transport', labelKey: 'navTransport', icon: Bus },
      { id: 'groups', labelKey: 'navGroups', icon: Layers },
      { id: 'operations', labelKey: 'navOperations', icon: CalendarCheck2 },
    ],
  },
  {
    groupKey: 'grpAccounts',
    items: [
      { id: 'customers', labelKey: 'navCustomers', icon: Users },
      { id: 'suppliers', labelKey: 'navSuppliers', icon: Truck },
      { id: 'coding', labelKey: 'navCoding', icon: Tag },
      { id: 'customerLedger', labelKey: 'navCustLedger', icon: BookOpen },
      { id: 'supplierLedger', labelKey: 'navSuppLedger', icon: BookOpen },
    ],
  },
  {
    groupKey: 'grpFinance',
    items: [
      { id: 'voucher', labelKey: 'navVoucher', icon: CreditCard },
      { id: 'invoice', labelKey: 'navInvoice', icon: FileText },
      { id: 'treasury', labelKey: 'navTreasury', icon: Wallet },
      { id: 'employees', labelKey: 'navEmployees', icon: UserCheck },
      { id: 'reports', labelKey: 'navReports', icon: BarChart3 },
      { id: 'settings', labelKey: 'navSettings', icon: Settings },
    ],
  },
];

export const AccountingSystem: React.FC = () => {
  const { user, profile, staffAccount, sharedInvite, isWorkspaceOwner, allowedPages, lang, toggleLang, logout } =
    useAuth();
  const store = useAccountingStore();
  const { db } = store;

  const [page, setPage] = useState<PageId>('dashboard');
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const visibleNavGroups = useMemo(() => {
    return NAV_GROUPS.map((grp) => ({
      ...grp,
      items: grp.items.filter((item) => allowedPages.includes(item.id)),
    })).filter((grp) => grp.items.length > 0);
  }, [allowedPages]);

  useEffect(() => {
    if (!allowedPages.includes(page)) {
      setPage(allowedPages[0] || 'dashboard');
    }
  }, [allowedPages, page]);

  const navigateIfAllowed = useCallback(
    (target: PageId) => {
      if (allowedPages.includes(target)) {
        setPage(target);
      }
    },
    [allowedPages]
  );

  const [prefillTrnGroup, setPrefillTrnGroup] = useState<string | null>(null);
  const [opsInitialGroup, setOpsInitialGroup] = useState<string | null>(null);
  const [custLedgerParty, setCustLedgerParty] = useState<string | null>(null);
  const [suppLedgerParty, setSuppLedgerParty] = useState<string | null>(null);
  const [empInitialTab, setEmpInitialTab] = useState<
    'staff' | 'payroll' | 'vault' | 'accounts' | 'googleShare' | undefined
  >(undefined);
  const [empInitialPayEmpId, setEmpInitialPayEmpId] = useState<number | null>(null);

  const [alertWindowDays, setAlertWindowDays] = useState<number>(() => getSavedAlertWindowDays());
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [markingHeaderPaidId, setMarkingHeaderPaidId] = useState<number | null>(null);
  const alertsPopoverRef = useRef<HTMLDivElement | null>(null);

  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<number | null>(null);
  const restoreFileRef = useRef<HTMLInputElement | null>(null);
  const [confirmCfg, setConfirmCfg] = useState<ConfirmConfig | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const canSeeInvoiceAlerts = allowedPages.includes('invoice');
  const canSeeEmployeeAlerts = allowedPages.includes('employees');
  const canSeeAnyAlerts = canSeeInvoiceAlerts || canSeeEmployeeAlerts;
  const todayISO = today();

  const dueAlerts = useMemo(() => {
    if (!canSeeAnyAlerts) return [];
    return buildDueAlerts(db, lang, alertWindowDays, todayISO).filter((item) => {
      if (item.kind === 'invoice' && !canSeeInvoiceAlerts) return false;
      if (item.kind === 'salary' && !canSeeEmployeeAlerts) return false;
      return true;
    });
  }, [db, lang, alertWindowDays, todayISO, canSeeAnyAlerts, canSeeInvoiceAlerts, canSeeEmployeeAlerts]);

  const urgentAlertCount = useMemo(
    () => dueAlerts.filter((a) => a.severity === 'overdue' || a.severity === 'due_today').length,
    [dueAlerts]
  );

  const handleAlertWindowChange = useCallback((days: number) => {
    setSavedAlertWindowDays(days);
    setAlertWindowDays(days);
  }, []);

  const openPayrollForEmployee = useCallback(
    (employeeId: number) => {
      setEmpInitialTab('payroll');
      setEmpInitialPayEmpId(employeeId);
      setAlertsOpen(false);
      navigateIfAllowed('employees');
    },
    [navigateIfAllowed]
  );

  useEffect(() => {
    if (!alertsOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (alertsPopoverRef.current && !alertsPopoverRef.current.contains(e.target as Node)) {
        setAlertsOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAlertsOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [alertsOpen]);

  const isEmbedded = typeof window !== 'undefined' && window.self !== window.top;
  const currentAppUrl = typeof window !== 'undefined' ? window.location.href : '/';

  const showToast = useCallback((message: string, tone: 'success' | 'error' | 'info' = 'success') => {
    setToast({ id: Date.now(), message, tone });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      setToast(null);
    }, 3200);
  }, []);

  const handleHeaderMarkInvoicePaid = async (inv: GroupInvoice) => {
    setMarkingHeaderPaidId(inv.id);
    try {
      await store.saveInvoice({ ...inv, paymentStatus: 'paid' }, true);
      showToast(
        bi(lang, `تم تحديد الفاتورة ${inv.invoiceNo} كمسددة`, `Invoice ${inv.invoiceNo} marked as paid`)
      );
    } finally {
      setMarkingHeaderPaidId(null);
    }
  };

  const handleConfirmOk = async () => {
    if (!confirmCfg) return;
    setConfirmBusy(true);
    try {
      await confirmCfg.onConfirm();
      setConfirmCfg(null);
    } finally {
      setConfirmBusy(false);
    }
  };

  const quickBackup = () => {
    const json = JSON.stringify(db, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `best-united-accounting-1448-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast(bi(lang, 'تم تصدير النسخة الاحتياطية بنجاح', 'Backup exported successfully'));
  };

  const handleQuickRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseBackupJson(String(reader.result || ''));
      e.target.value = '';
      if (!parsed.data) {
        showToast(bi(lang, 'ملف النسخة الاحتياطية غير صالح', 'Invalid backup JSON file'), 'error');
        return;
      }
      const backupData = parsed.data;
      setConfirmCfg({
        title: bi(lang, 'استرداد نسخة احتياطية', 'Restore Backup'),
        message: parsed.summaryText(lang),
        danger: true,
        onConfirm: async () => {
          await store.importFullBackup(backupData);
          showToast(bi(lang, 'تم استرداد النسخة الاحتياطية إلى السحابة بنجاح', 'Backup restored successfully'));
        },
      });
    };
    reader.readAsText(file);
  };

  const currentNavLabel =
    NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === page)?.labelKey || 'navDashboard';

  return (
    <div className="app-shell min-h-screen flex bg-[#f6f8fb]">
      {/* Fixed Responsive Sidebar */}
      <aside className="no-print w-[68px] lg:w-[260px] shrink-0 bg-[#0f1e36] text-slate-300 flex flex-col sticky top-0 h-screen">
        {/* Brand Header */}
        <div className="p-3 lg:px-4 lg:py-4 border-b border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white p-1 flex items-center justify-center shrink-0">
            <img src="/logo.png" alt="BEST UNITED" className="w-full h-full object-contain" />
          </div>
          <div className="hidden lg:block min-w-0">
            <div className="text-sm font-bold text-white truncate">BEST UNITED</div>
            <div className="text-[11px] text-slate-400 truncate">
              {bi(lang, 'نظام الحسابات · 1448', 'Accounting Suite · 1448')}
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {visibleNavGroups.map((grp) => (
            <div key={grp.groupKey}>
              <div className="hidden lg:block px-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400/80">
                {tKey(lang, grp.groupKey)}
              </div>
              <div className="space-y-0.5">
                {grp.items.map((item) => {
                  const Icon = item.icon;
                  const active = page === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={tKey(lang, item.labelKey)}
                      onClick={() => setPage(item.id)}
                      className={`w-full flex items-center justify-center lg:justify-start gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                        active
                          ? 'bg-[#1d4ed8] text-white font-semibold shadow-xs'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="hidden lg:inline truncate">{tKey(lang, item.labelKey)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Authenticated User Footer */}
        <div className="p-2.5 lg:p-3 border-t border-white/10 space-y-2">
          <div className="hidden lg:flex items-center gap-2.5 px-2 py-1.5 rounded-xl bg-white/5">
            {profile?.photoURL ? (
              <img
                src={profile.photoURL}
                alt={profile.displayName}
                className="w-8 h-8 rounded-full object-cover shrink-0 border border-white/20"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[#1d4ed8] text-white text-xs font-bold flex items-center justify-center shrink-0">
                {(profile?.displayName || staffAccount?.username || 'U').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white truncate">
                {profile?.displayName || user?.displayName}
              </div>
              <div className="text-[10px] text-slate-400 truncate font-mono-num">
                {staffAccount
                  ? `@${staffAccount.username} · ${
                      staffAccount.role === 'admin'
                        ? bi(lang, 'مشرف', 'Admin')
                        : bi(lang, 'موظف', 'Staff')
                    }`
                  : sharedInvite
                    ? `${bi(lang, 'مشارك Google', 'Shared Google')} · ${user?.email || sharedInvite.email}`
                    : user?.email}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void logout()}
            title={tKey(lang, 'logout')}
            className="w-full flex items-center justify-center lg:justify-start gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-red-600/90 text-slate-100 text-xs font-semibold transition cursor-pointer whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden lg:inline">{tKey(lang, 'logout')}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content flex-1 min-w-0 p-4 sm:p-6">
        {/* Print Letterhead */}
        <div className="print-letterhead hidden items-center justify-between pb-4 mb-5 border-b-2 border-[#0f1e36]">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="BEST UNITED" className="w-12 h-12 object-contain" />
            <div>
              <div className="text-base font-bold text-[#0f1e36]">BEST UNITED TRAVEL &amp; TOURISM</div>
              <div className="text-xs text-slate-500">
                {bi(
                  lang,
                  'شركة بست يونايتد للسفريات والسياحة - نظام الحسابات المتكامل 1448',
                  'Integrated Visas & Transport Accounting · Season 1448'
                )}
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-600 text-end space-y-0.5">
            <div className="font-mono-num" dir="ltr">
              {today()} · {formatTime24(now)}
            </div>
            <div className="text-[11px] font-semibold text-slate-700">
              {bi(lang, 'طُبعت بواسطة:', 'Printed by:')}{' '}
              <span>
                {staffAccount
                  ? `${staffAccount.displayName} (@${staffAccount.username})`
                  : profile?.displayName ||
                    user?.displayName ||
                    sharedInvite?.displayName ||
                    bi(lang, 'الإدارة', 'Management')}
              </span>
            </div>
          </div>
        </div>

        {/* Sticky Top Utility Bar */}
        <header className="no-print sticky top-2 z-30 shadow-xs bg-white border border-slate-200 rounded-2xl px-4 sm:px-5 py-3 mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 p-1 flex items-center justify-center shrink-0">
              <img src="/logo.png" alt="BEST UNITED TRAVEL" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900">{tKey(lang, currentNavLabel)}</h1>
              <div className="text-[11px] text-slate-500">
                {bi(lang, 'شركة BEST UNITED TRAVEL · موسم 1448 هـ', 'BEST UNITED TRAVEL · Season 1448H')}
                {staffAccount
                  ? ` · ${staffAccount.displayName} (@${staffAccount.username})`
                  : sharedInvite
                    ? ` · ${bi(lang, 'دخول مشترك', 'Shared')} (${user?.email || sharedInvite.email})`
                    : user?.email
                      ? ` · ${user.email}`
                      : ''}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canSeeAnyAlerts && (
              <div ref={alertsPopoverRef} className="relative">
                <button
                  type="button"
                  onClick={() => setAlertsOpen((o) => !o)}
                  title={bi(lang, 'تنبيهات الاستحقاق (الفواتير والرواتب)', 'Due-Date Alerts')}
                  className={`relative inline-flex items-center gap-1.5 px-3 h-9 rounded-xl border text-xs font-bold transition cursor-pointer ${
                    urgentAlertCount > 0
                      ? 'bg-red-50 hover:bg-red-100 border-red-200 text-red-700'
                      : dueAlerts.length > 0
                        ? 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">{bi(lang, 'التنبيهات', 'Alerts')}</span>
                  {dueAlerts.length > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono-num font-bold leading-none ${
                        urgentAlertCount > 0
                          ? 'bg-red-600 text-white'
                          : 'bg-amber-500 text-white'
                      }`}
                    >
                      {dueAlerts.length}
                    </span>
                  )}
                </button>

                {alertsOpen && (
                  <div className="absolute end-0 mt-2 w-80 sm:w-96 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden">
                    <div className="px-4 py-3 bg-[#0f1e36] text-white flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-amber-300" />
                        <span className="text-xs font-bold">
                          {bi(lang, 'تنبيهات الفواتير والرواتب', 'Invoices & Payroll Alerts')}
                        </span>
                      </div>
                      <select
                        value={alertWindowDays}
                        onChange={(e) => handleAlertWindowChange(Number(e.target.value))}
                        className="h-7 px-2 rounded-lg bg-white/10 border border-white/20 text-[11px] font-bold text-white focus:outline-none"
                      >
                        <option value={3} className="text-slate-900">
                          {bi(lang, '3 أيام', '3 days')}
                        </option>
                        <option value={7} className="text-slate-900">
                          {bi(lang, '7 أيام', '7 days')}
                        </option>
                        <option value={14} className="text-slate-900">
                          {bi(lang, '14 يوماً', '14 days')}
                        </option>
                        <option value={30} className="text-slate-900">
                          {bi(lang, '30 يوماً', '30 days')}
                        </option>
                      </select>
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                      {dueAlerts.length === 0 ? (
                        <div className="p-5 text-center text-xs text-slate-500 space-y-1.5">
                          <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
                          <div className="font-semibold text-slate-700">
                            {bi(
                              lang,
                              'لا توجد استحقاقات قريبة أو متأخرة حالياً',
                              'No upcoming or overdue items right now'
                            )}
                          </div>
                        </div>
                      ) : (
                        dueAlerts.slice(0, 8).map((item) => (
                          <div key={item.id} className="p-3 hover:bg-slate-50 transition space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  {item.severity === 'overdue' ? (
                                    <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                                  ) : (
                                    <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                  )}
                                  <span className="text-xs font-bold text-slate-900 truncate">
                                    {item.title}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                  {item.subtitle}
                                </div>
                              </div>
                              <div className="text-end shrink-0">
                                <div className="text-[11px] font-bold font-mono-num text-slate-900" dir="ltr">
                                  {item.amountLabel}
                                </div>
                                <div
                                  className={`text-[10px] font-bold ${
                                    item.severity === 'overdue'
                                      ? 'text-red-600'
                                      : item.severity === 'due_today'
                                        ? 'text-amber-700'
                                        : 'text-blue-700'
                                  }`}
                                >
                                  {formatDueCountdown(item.daysRemaining, lang)}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-2 text-[10px]">
                              <span className="font-mono-num text-slate-400" dir="ltr">
                                {item.dueDate}
                              </span>
                              <div className="flex items-center gap-1.5">
                                {item.kind === 'invoice' && item.invoice ? (
                                  <>
                                    <button
                                      type="button"
                                      disabled={markingHeaderPaidId === item.invoice.id}
                                      onClick={() => void handleHeaderMarkInvoicePaid(item.invoice!)}
                                      className="px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold cursor-pointer"
                                    >
                                      {bi(lang, 'تحديد كمسددة', 'Mark Paid')}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAlertsOpen(false);
                                        navigateIfAllowed('invoice');
                                      }}
                                      className="px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-[#1d4ed8] font-bold cursor-pointer"
                                    >
                                      {bi(lang, 'فتح', 'Open')}
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      item.employee
                                        ? openPayrollForEmployee(item.employee.id)
                                        : navigateIfAllowed('employees')
                                    }
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-teal-50 hover:bg-teal-100 text-[#0f766e] font-bold cursor-pointer"
                                  >
                                    <Banknote className="w-3 h-3" />
                                    <span>{bi(lang, 'صرف الراتب', 'Pay Salary')}</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div
              dir="ltr"
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold font-mono-num"
              title={bi(lang, 'الساعة بنظام 24 ساعة', '24-Hour Clock')}
            >
              <Clock className="w-3.5 h-3.5 text-[#1d4ed8]" />
              <span>{formatTime24(now)}</span>
            </div>
            <PWAInstallButton lang={lang} />
            {isEmbedded && (
              <a
                href={currentAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={tKey(lang, 'openExternalTab')}
                className={btnSecondaryCls}
              >
                <ExternalLink className="w-3.5 h-3.5 text-[#1d4ed8]" />
                <span className="hidden md:inline">{bi(lang, 'فتح في Chrome', 'Open in Chrome')}</span>
              </a>
            )}
            <button type="button" onClick={toggleLang} className={btnSecondaryCls}>
              <Globe className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
            </button>
            <button type="button" onClick={quickBackup} className={btnPrimaryCls}>
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{tKey(lang, 'btnBackup')}</span>
            </button>
            {isWorkspaceOwner && (
              <>
                <button
                  type="button"
                  onClick={() => restoreFileRef.current?.click()}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-xl bg-teal-50 hover:bg-teal-100 border border-teal-200 text-[#0f766e] text-xs font-semibold transition cursor-pointer whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{tKey(lang, 'btnRestoreBackup')}</span>
                </button>
                <input
                  ref={restoreFileRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleQuickRestoreFile}
                />
              </>
            )}
            <button type="button" onClick={() => window.print()} className={btnSecondaryCls}>
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{tKey(lang, 'btnPrint')}</span>
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-semibold transition cursor-pointer whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{tKey(lang, 'logout')}</span>
            </button>
          </div>
        </header>

        {/* Initial Cloud Sync Loading State */}
        {store.loadingData ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 flex flex-col items-center justify-center text-center">
            <div className="w-10 h-10 rounded-full border-[3px] border-slate-200 border-t-[#1d4ed8] animate-spin mb-3" />
            <div className="text-sm font-bold text-slate-800">
              {bi(lang, 'جاري تحميل البيانات المحاسبية...', 'Loading accounting workspace...')}
            </div>
          </div>
        ) : (
          <>
            {page === 'dashboard' && (
              <DashboardPage
                db={db}
                lang={lang}
                legacyLocalData={isWorkspaceOwner ? store.legacyLocalData : null}
                onMigrateLegacy={async () => {
                  await store.migrateLegacyLocalData();
                  showToast(bi(lang, 'تم ترحيل البيانات إلى السحابة بنجاح', 'Local data imported to cloud'));
                }}
                onNavigate={navigateIfAllowed}
              />
            )}

            {page === 'entry' && (
              <VisaEntryPage
                db={db}
                lang={lang}
                onSave={store.saveVisaEntry}
                onImportBatch={store.importVisaEntriesBatch}
                onDelete={store.deleteVisaEntry}
                onDeleteAllGroups={store.deleteAllGroups}
                onToast={showToast}
                onConfirm={setConfirmCfg}
              />
            )}

            {page === 'umrahVisa1448' && (
              <UmrahVisa1448Page
                db={db}
                lang={lang}
                onSaveAgent={store.saveUmrahAgent}
                onDeleteAgent={store.deleteUmrahAgent}
                onSaveGroup={store.saveUmrahGroup}
                onDeleteGroup={store.deleteUmrahGroup}
                onSavePilgrim={store.saveUmrahPilgrim}
                onImportPilgrims={store.importUmrahPilgrimsBatch}
                onDeletePilgrim={store.deleteUmrahPilgrim}
                onSaveFlight={store.saveUmrahFlight}
                onDeleteFlight={store.deleteUmrahFlight}
                onSaveFieldStaff={store.saveUmrahFieldStaff}
                onDeleteFieldStaff={store.deleteUmrahFieldStaff}
                onSaveTransport={store.saveTransport}
                onDeleteTransport={store.deleteTransport}
                onToast={showToast}
                onConfirm={setConfirmCfg}
              />
            )}

            {page === 'transport' && (
              <TransportPage
                db={db}
                lang={lang}
                prefillGroup={prefillTrnGroup}
                onConsumePrefill={() => setPrefillTrnGroup(null)}
                onSave={store.saveTransport}
                onImportBatch={store.importTransportsBatch}
                onDelete={store.deleteTransport}
                onDeleteBatch={store.deleteTransportsBatch}
                onToast={showToast}
                onConfirm={setConfirmCfg}
              />
            )}

            {page === 'groups' && (
              <GroupsPage
                db={db}
                lang={lang}
                onOpenOperations={(g) => {
                  setOpsInitialGroup(g);
                  navigateIfAllowed('operations');
                }}
                onPrefillTransport={(g) => {
                  setPrefillTrnGroup(g);
                  navigateIfAllowed('transport');
                }}
                onDeleteAllGroups={store.deleteAllGroups}
                onNavigate={navigateIfAllowed}
                onToast={showToast}
                onConfirm={setConfirmCfg}
              />
            )}

            {page === 'operations' && (
              <OperationsPage
                db={db}
                lang={lang}
                initialGroup={opsInitialGroup}
                onConsumeInitialGroup={() => setOpsInitialGroup(null)}
                onSaveOperation={store.saveCycleOperation}
                onImportOperations={store.importCycleOperationsBatch}
                onDeleteOperation={store.deleteCycleOperation}
                onDeleteOperationsBatch={store.deleteCycleOperationsBatch}
                onToast={showToast}
                onConfirm={setConfirmCfg}
              />
            )}

            {page === 'customers' && (
              <CustomersPage
                db={db}
                lang={lang}
                onOpenLedger={(name) => {
                  setCustLedgerParty(name);
                  navigateIfAllowed('customerLedger');
                }}
              />
            )}

            {page === 'suppliers' && (
              <SuppliersPage
                db={db}
                lang={lang}
                onOpenLedger={(name) => {
                  setSuppLedgerParty(name);
                  navigateIfAllowed('supplierLedger');
                }}
              />
            )}

            {page === 'coding' && (
              <CodingPage
                db={db}
                lang={lang}
                onSaveCustomer={store.saveCustomerCode}
                onSaveSupplier={store.saveSupplierCode}
                onDeleteMaster={store.deleteMaster}
                onToast={showToast}
                onConfirm={setConfirmCfg}
              />
            )}

            {page === 'customerLedger' && (
              <LedgerPage
                kind="customer"
                db={db}
                lang={lang}
                initialParty={custLedgerParty}
                onConsumeParty={() => setCustLedgerParty(null)}
              />
            )}

            {page === 'supplierLedger' && (
              <LedgerPage
                kind="supplier"
                db={db}
                lang={lang}
                initialParty={suppLedgerParty}
                onConsumeParty={() => setSuppLedgerParty(null)}
              />
            )}

            {page === 'voucher' && (
              <VoucherPage
                db={db}
                lang={lang}
                onSaveVoucher={store.saveVoucher}
                onDeleteVoucher={store.deleteVoucher}
                onToast={showToast}
                onConfirm={setConfirmCfg}
              />
            )}

            {page === 'invoice' && (
              <InvoicePage
                db={db}
                lang={lang}
                onSaveInvoice={store.saveInvoice}
                onDeleteInvoice={store.deleteInvoice}
                onToast={showToast}
                onConfirm={setConfirmCfg}
              />
            )}

            {page === 'treasury' && (
              <TreasuryPage
                db={db}
                lang={lang}
                onNavigate={navigateIfAllowed}
                onSaveTx={store.saveTreasuryTx}
                onDeleteTx={store.deleteTreasuryTx}
                onToast={showToast}
                onConfirm={setConfirmCfg}
              />
            )}

            {page === 'employees' && (
              <EmployeesPage
                db={db}
                lang={lang}
                staffAccounts={store.staffAccounts}
                workspaceInvites={store.workspaceInvites}
                initialTab={empInitialTab}
                initialPayEmpId={empInitialPayEmpId}
                onConsumeInitial={() => {
                  setEmpInitialTab(undefined);
                  setEmpInitialPayEmpId(null);
                }}
                onNavigate={navigateIfAllowed}
                onSaveEmployee={store.saveEmployee}
                onDeleteEmployee={store.deleteEmployee}
                onSavePayroll={store.savePayroll}
                onDeletePayroll={store.deletePayroll}
                onSaveTx={store.saveTreasuryTx}
                onDeleteTx={store.deleteTreasuryTx}
                onCreateStaffAccount={store.createStaffAccount}
                onUpdateStaffAccount={store.updateStaffAccount}
                onDeleteStaffAccount={store.deleteStaffAccount}
                onCreateWorkspaceInvite={store.createWorkspaceInvite}
                onUpdateWorkspaceInvite={store.updateWorkspaceInvite}
                onDeleteWorkspaceInvite={store.deleteWorkspaceInvite}
                onToast={showToast}
                onConfirm={setConfirmCfg}
              />
            )}

            {page === 'reports' && <ReportsPage db={db} lang={lang} />}

            {page === 'settings' && isWorkspaceOwner && (
              <SettingsPage
                db={db}
                lang={lang}
                legacyLocalData={store.legacyLocalData}
                staffAccounts={store.staffAccounts}
                workspaceInvites={store.workspaceInvites}
                onUpdateRate={store.updateSettingsRate}
                onImportBackup={store.importFullBackup}
                onMigrateLegacy={store.migrateLegacyLocalData}
                onCreateStaffAccount={store.createStaffAccount}
                onUpdateStaffAccount={store.updateStaffAccount}
                onDeleteStaffAccount={store.deleteStaffAccount}
                onCreateWorkspaceInvite={store.createWorkspaceInvite}
                onUpdateWorkspaceInvite={store.updateWorkspaceInvite}
                onDeleteWorkspaceInvite={store.deleteWorkspaceInvite}
                onToast={showToast}
                onConfirm={setConfirmCfg}
              />
            )}
          </>
        )}
      </main>

      <ConfirmModal
        config={confirmCfg}
        lang={lang}
        busy={confirmBusy}
        onCancel={() => !confirmBusy && setConfirmCfg(null)}
        onConfirm={() => void handleConfirmOk()}
      />
      <ToastBanner toast={toast} onClose={() => setToast(null)} />
    </div>
  );
};
