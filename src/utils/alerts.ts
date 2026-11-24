import {
  AccountingDB,
  EmployeeRecord,
  GroupInvoice,
  Lang,
} from '../types/accounting';
import { bi } from '../i18n/translations';
import { addDaysISO, calcEmpTotal, fmt, fmtUSD, today } from './calculations';

export type AlertSeverity = 'overdue' | 'due_today' | 'upcoming';
export type DueAlertKind = 'invoice' | 'salary';

export interface DueAlertItem {
  id: string;
  kind: DueAlertKind;
  severity: AlertSeverity;
  dueDate: string;
  daysRemaining: number;
  title: string;
  subtitle: string;
  amountLabel: string;
  isEstimatedDueDate?: boolean;
  invoice?: GroupInvoice;
  employee?: EmployeeRecord;
  salaryMonth?: string;
}

export const ALERT_WINDOW_STORAGE_KEY = 'best_united_alert_window_days';
export const DEFAULT_INVOICE_PAYMENT_DAYS = 7;
export const DEFAULT_SALARY_PAY_DAY = 27;

export function getSavedAlertWindowDays(): number {
  if (typeof window === 'undefined') return 7;
  const raw = Number(window.localStorage.getItem(ALERT_WINDOW_STORAGE_KEY));
  return [3, 7, 14, 30].includes(raw) ? raw : 7;
}

export function setSavedAlertWindowDays(days: number): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ALERT_WINDOW_STORAGE_KEY, String(days));
}

/** Difference in whole calendar days: targetISO - fromISO */
export function diffCalendarDays(fromISO: string, toISO: string): number {
  const f = new Date(`${fromISO.slice(0, 10)}T00:00:00Z`);
  const t = new Date(`${toISO.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) return 9999;
  return Math.round((t.getTime() - f.getTime()) / 86400000);
}

export function getEffectiveInvoiceDueDate(inv: GroupInvoice): {
  dueDate: string;
  isEstimated: boolean;
} {
  if (inv.dueDate && inv.dueDate.trim().length >= 8) {
    return { dueDate: inv.dueDate.trim().slice(0, 10), isEstimated: false };
  }
  return {
    dueDate: addDaysISO(inv.date || today(), DEFAULT_INVOICE_PAYMENT_DAYS),
    isEstimated: true,
  };
}

function clampDateToMonth(year: number, month1Based: number, day: number): string {
  const lastDay = new Date(Date.UTC(year, month1Based, 0)).getUTCDate();
  const safeDay = Math.min(Math.max(1, Math.round(day)), lastDay);
  return `${String(year).padStart(4, '0')}-${String(month1Based).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

function nextMonthYear(year: number, month1Based: number): { year: number; month: number } {
  if (month1Based >= 12) return { year: year + 1, month: 1 };
  return { year, month: month1Based + 1 };
}

export function formatDueCountdown(daysRemaining: number, lang: Lang): string {
  if (daysRemaining < 0) {
    const overdue = Math.abs(daysRemaining);
    return overdue === 1
      ? bi(lang, 'متأخر بيوم واحد', 'Overdue by 1 day')
      : bi(lang, `متأخر بـ ${overdue} أيام`, `Overdue by ${overdue} days`);
  }
  if (daysRemaining === 0) {
    return bi(lang, 'يستحق اليوم', 'Due today');
  }
  if (daysRemaining === 1) {
    return bi(lang, 'يستحق غداً (متبقي يوم)', 'Due tomorrow (1 day left)');
  }
  return bi(lang, `متبقي ${daysRemaining} أيام`, `${daysRemaining} days left`);
}

export function buildDueAlerts(
  db: AccountingDB,
  lang: Lang,
  windowDays = 7,
  refDateISO = today()
): DueAlertItem[] {
  const alerts: DueAlertItem[] = [];
  const safeWindow = Math.max(1, Math.round(windowDays));

  // 1. Unpaid Group Invoices approaching or past due date
  (db.invoices || []).forEach((inv) => {
    if (inv.paymentStatus === 'paid') return;
    if (Number(inv.totalUSD || 0) <= 0) return;

    const { dueDate, isEstimated } = getEffectiveInvoiceDueDate(inv);
    const daysRemaining = diffCalendarDays(refDateISO, dueDate);
    if (daysRemaining > safeWindow) return;

    const severity: AlertSeverity =
      daysRemaining < 0 ? 'overdue' : daysRemaining === 0 ? 'due_today' : 'upcoming';

    alerts.push({
      id: `inv_${inv.id}`,
      kind: 'invoice',
      severity,
      dueDate,
      daysRemaining,
      title: bi(
        lang,
        `فاتورة ${inv.invoiceNo} — ${inv.groupName}`,
        `Invoice ${inv.invoiceNo} — ${inv.groupName}`
      ),
      subtitle: bi(
        lang,
        `مجموعة ${inv.groupNo} · ${inv.pax} معتمر`,
        `Group ${inv.groupNo} · ${inv.pax} pax`
      ),
      amountLabel: `${fmtUSD(inv.totalUSD)} USD`,
      isEstimatedDueDate: isEstimated,
      invoice: inv,
    });
  });

  // 2. Active Employees Payroll approaching or past monthly salary due day
  const curYear = Number(refDateISO.slice(0, 4)) || new Date().getUTCFullYear();
  const curMonthNum = Number(refDateISO.slice(5, 7)) || new Date().getUTCMonth() + 1;
  const curMonthKey = `${String(curYear).padStart(4, '0')}-${String(curMonthNum).padStart(2, '0')}`;
  const nxt = nextMonthYear(curYear, curMonthNum);
  const nxtMonthKey = `${String(nxt.year).padStart(4, '0')}-${String(nxt.month).padStart(2, '0')}`;

  (db.employees || []).forEach((emp) => {
    if (emp.status !== 'active') return;
    const totalSalary = calcEmpTotal(emp);
    if (totalSalary <= 0) return;

    const payDay = emp.salaryDay && emp.salaryDay >= 1 ? emp.salaryDay : DEFAULT_SALARY_PAY_DAY;
    const paidCurMonth = (db.payroll || []).some(
      (p) => p.employeeId === emp.id && p.month === curMonthKey && p.recordType === 'salary'
    );
    const paidNxtMonth = (db.payroll || []).some(
      (p) => p.employeeId === emp.id && p.month === nxtMonthKey && p.recordType === 'salary'
    );

    let targetMonth = curMonthKey;
    let dueDate = clampDateToMonth(curYear, curMonthNum, payDay);

    if (paidCurMonth) {
      if (paidNxtMonth) return;
      targetMonth = nxtMonthKey;
      dueDate = clampDateToMonth(nxt.year, nxt.month, payDay);
    }

    const daysRemaining = diffCalendarDays(refDateISO, dueDate);
    if (daysRemaining > safeWindow) return;

    const advancesEGP = (db.payroll || [])
      .filter((p) => p.employeeId === emp.id && p.month === targetMonth && p.recordType === 'advance')
      .reduce((acc, p) => acc + Number(p.amountEGP ?? p.amount ?? 0), 0);

    const netEstimated = Math.max(0, totalSalary - advancesEGP);
    const severity: AlertSeverity =
      daysRemaining < 0 ? 'overdue' : daysRemaining === 0 ? 'due_today' : 'upcoming';

    alerts.push({
      id: `sal_${emp.id}_${targetMonth}`,
      kind: 'salary',
      severity,
      dueDate,
      daysRemaining,
      title: bi(
        lang,
        `راتب شهر ${targetMonth} — ${emp.name}`,
        `Salary ${targetMonth} — ${emp.name}`
      ),
      subtitle: advancesEGP > 0
        ? bi(
            lang,
            `${emp.jobTitle} (${emp.code}) · سلف مخصومة: ${fmt(advancesEGP)} ج.م`,
            `${emp.jobTitle} (${emp.code}) · Advances: ${fmt(advancesEGP)} EGP`
          )
        : bi(
            lang,
            `${emp.jobTitle} · كود ${emp.code}`,
            `${emp.jobTitle} · Code ${emp.code}`
          ),
      amountLabel: `${fmt(netEstimated)} ${bi(lang, 'ج.م', 'EGP')}`,
      employee: emp,
      salaryMonth: targetMonth,
    });
  });

  // Sort by most urgent first (smallest daysRemaining), then invoices before salaries on tie
  return alerts.sort((a, b) => {
    if (a.daysRemaining !== b.daysRemaining) return a.daysRemaining - b.daysRemaining;
    if (a.kind !== b.kind) return a.kind === 'invoice' ? -1 : 1;
    return a.title.localeCompare(b.title, lang);
  });
}
