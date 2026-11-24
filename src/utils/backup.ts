import { AccountingDB, Lang } from '../types/accounting';
import { bi } from '../i18n/translations';

const BACKUP_ARRAY_KEYS = [
  'entries',
  'transports',
  'hotels',
  'vouchers',
  'treasury',
  'employees',
  'payroll',
  'customers',
  'suppliers',
  'cycleOperations',
  'invoices',
  'umrahAgents',
  'umrahGroups',
  'umrahPilgrims',
  'umrahFlights',
  'umrahFieldStaff',
] as const;

export function parseBackupJson(rawText: string): {
  data: AccountingDB | null;
  totalRecords: number;
  summaryText: (lang: Lang) => string;
} {
  try {
    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { data: null, totalRecords: 0, summaryText: () => '' };
    }

    const hasKnownArray = BACKUP_ARRAY_KEYS.some((k) => Array.isArray(parsed[k]));
    if (!hasKnownArray) {
      return { data: null, totalRecords: 0, summaryText: () => '' };
    }

    const normalized: AccountingDB = {
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      transports: Array.isArray(parsed.transports) ? parsed.transports : [],
      hotels: Array.isArray(parsed.hotels) ? parsed.hotels : [],
      vouchers: Array.isArray(parsed.vouchers) ? parsed.vouchers : [],
      treasury: Array.isArray(parsed.treasury) ? parsed.treasury : [],
      employees: Array.isArray(parsed.employees) ? parsed.employees : [],
      payroll: Array.isArray(parsed.payroll) ? parsed.payroll : [],
      customers: Array.isArray(parsed.customers) ? parsed.customers : [],
      suppliers: Array.isArray(parsed.suppliers) ? parsed.suppliers : [],
      cycleOperations: Array.isArray(parsed.cycleOperations) ? parsed.cycleOperations : [],
      invoices: Array.isArray(parsed.invoices) ? parsed.invoices : [],
      umrahAgents: Array.isArray(parsed.umrahAgents) ? parsed.umrahAgents : [],
      umrahGroups: Array.isArray(parsed.umrahGroups) ? parsed.umrahGroups : [],
      umrahPilgrims: Array.isArray(parsed.umrahPilgrims) ? parsed.umrahPilgrims : [],
      umrahFlights: Array.isArray(parsed.umrahFlights) ? parsed.umrahFlights : [],
      umrahFieldStaff: Array.isArray(parsed.umrahFieldStaff) ? parsed.umrahFieldStaff : [],
      rate: Number(parsed.rate) > 0 ? Number(parsed.rate) : 3.75,
    };

    const totalRecords =
      normalized.entries.length +
      normalized.transports.length +
      normalized.hotels.length +
      normalized.vouchers.length +
      normalized.treasury.length +
      normalized.employees.length +
      normalized.payroll.length +
      normalized.customers.length +
      normalized.suppliers.length +
      normalized.cycleOperations.length +
      normalized.invoices.length +
      (normalized.umrahAgents?.length || 0) +
      (normalized.umrahGroups?.length || 0) +
      (normalized.umrahPilgrims?.length || 0) +
      (normalized.umrahFlights?.length || 0) +
      (normalized.umrahFieldStaff?.length || 0);

    const summaryText = (lang: Lang) =>
      bi(
        lang,
        `سيتم استرداد ${totalRecords} سجل (التأشيرات: ${normalized.entries.length}، النقل: ${normalized.transports.length}، الفواتير: ${normalized.invoices.length}، السندات: ${normalized.vouchers.length}، الخزنة: ${normalized.treasury.length}، الموظفون: ${normalized.employees.length}) واستبدال البيانات الحالية في السحابة. هل تريد المتابعة؟`,
        `Restore ${totalRecords} records (Visas: ${normalized.entries.length}, Transport: ${normalized.transports.length}, Invoices: ${normalized.invoices.length}, Vouchers: ${normalized.vouchers.length}, Treasury: ${normalized.treasury.length}, Staff: ${normalized.employees.length}) and replace current cloud workspace data. Continue?`
      );

    return { data: normalized, totalRecords, summaryText };
  } catch {
    return { data: null, totalRecords: 0, summaryText: () => '' };
  }
}
