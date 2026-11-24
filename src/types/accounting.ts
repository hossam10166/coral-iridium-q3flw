export type Lang = 'ar' | 'en';
export type Currency = 'SAR' | 'USD';
export type TreasuryCurrency = 'SAR' | 'USD' | 'EGP';

export type PageId =
  | 'dashboard'
  | 'entry'
  | 'umrahVisa1448'
  | 'transport'
  | 'groups'
  | 'operations'
  | 'customers'
  | 'suppliers'
  | 'coding'
  | 'customerLedger'
  | 'supplierLedger'
  | 'voucher'
  | 'invoice'
  | 'treasury'
  | 'employees'
  | 'reports'
  | 'settings';

export const ALL_PAGE_IDS: PageId[] = [
  'dashboard',
  'entry',
  'umrahVisa1448',
  'transport',
  'groups',
  'operations',
  'customers',
  'suppliers',
  'coding',
  'customerLedger',
  'supplierLedger',
  'voucher',
  'invoice',
  'treasury',
  'employees',
  'reports',
  'settings',
];

export type StaffRole = 'admin' | 'staff';

export interface StaffAccount {
  uid: string;
  workspaceId: string;
  createdBy: string;
  username: string;
  displayName: string;
  role: StaffRole;
  active: boolean;
  permissions: PageId[];
  employeeId?: number;
}

export interface WorkspaceInvite {
  id: string;
  workspaceId: string;
  invitedBy: string;
  email: string;
  displayName: string;
  role: StaffRole;
  active: boolean;
  permissions: PageId[];
}

export type HotelCity = 'makkah' | 'madinah' | 'jeddah';
export type HotelRoomType = 'single' | 'double' | 'triple' | 'quad' | 'quint' | 'suite';
export type HotelMealPlan = 'RO' | 'BB' | 'HB' | 'FB' | 'AI';
export type HotelStatus = 'confirmed' | 'pending' | 'checked_in' | 'checked_out' | 'cancelled';

export type CycleStageKey = 'arrival' | 'ziyarat1' | 'internal' | 'ziyarat2' | 'departure' | 'custom';
export type CycleStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export type TreasuryType = 'in' | 'out';
export type TreasuryCategory =
  | 'expense'
  | 'capital'
  | 'salary'
  | 'advance'
  | 'transfer'
  | 'receipt_extra'
  | 'other';
export type TreasuryAccount = 'cashbox' | 'bank' | 'custody' | 'payroll_vault';

export type EmployeeStatus = 'active' | 'on_leave' | 'inactive';
export type PayrollType = 'salary' | 'advance' | 'bonus' | 'deduction';
export type SupplierCategory = 'all' | 'both' | 'visa' | 'transport' | 'hotel';

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  rate: number;
  lang: Lang;
}

export interface VisaEntry {
  id: number;
  groupNo: string;
  date: string;
  pax: number;
  customer: string;
  supplier: string;
  currency: Currency;
  buy: number;
  sell: number;
  rate: number;
  notes: string;
}

export interface TransportEntry {
  id: number;
  refNo: string;
  groupNo: string;
  date: string;
  route: string;
  vehicleType: string;
  vehicleCount: number;
  pax: number;
  customer: string;
  supplier: string;
  currency: Currency;
  buy: number;
  sell: number;
  rate: number;
  driverName: string;
  plateNo: string;
  notes: string;
}

export interface HotelBooking {
  id: number;
  refNo: string;
  groupNo: string;
  bookingDate: string;
  city: HotelCity;
  hotelName: string;
  confirmationNo: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  roomType: HotelRoomType;
  mealPlan: HotelMealPlan;
  rooms: number;
  pax: number;
  status: HotelStatus;
  customer: string;
  supplier: string;
  currency: Currency;
  buy: number;
  sell: number;
  rate: number;
  notes: string;
}

export interface VoucherEntry {
  no: string;
  type: 'receipt' | 'payment';
  date: string;
  party: string;
  amount: number;
  currency: Currency;
  rate: number;
  amountSAR: number;
  note: string;
}

export interface TreasuryEntry {
  id: number;
  refNo: string;
  date: string;
  type: TreasuryType;
  category: TreasuryCategory;
  account: TreasuryAccount;
  amount: number;
  currency: TreasuryCurrency;
  rate: number;
  amountSAR: number;
  amountEGP?: number;
  amountUSD?: number;
  description: string;
  employeeId?: number;
  employeeName: string;
  notes: string;
}

export interface EmployeeRecord {
  id: number;
  code: string;
  name: string;
  jobTitle: string;
  department: string;
  phone: string;
  nationalId: string;
  hireDate: string;
  baseSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowance: number;
  status: EmployeeStatus;
  salaryDay?: number;
  notes: string;
}

export interface PayrollRecord {
  id: number;
  refNo: string;
  date: string;
  month: string;
  employeeId: number;
  employeeName: string;
  recordType: PayrollType;
  amount: number;
  currency?: TreasuryCurrency;
  rate?: number;
  amountSAR?: number;
  amountEGP?: number;
  amountUSD?: number;
  postToTreasury: boolean;
  treasuryAccount: TreasuryAccount;
  linkedTreasuryId?: number;
  notes: string;
}

export interface CustomerMaster {
  code: string;
  name: string;
  note: string;
}

export interface SupplierMaster {
  code: string;
  name: string;
  category: SupplierCategory;
  note: string;
}

export interface CycleOperation {
  id: string;
  groupNo: string;
  stageKey: CycleStageKey;
  stageLabel: string;
  status: CycleStatus;
  direction?: string;
  totalPax?: number;
  totalBus?: number;
  fromLocation?: string;
  toLocation?: string;
  hotelName?: string;
  date: string;
  time: string;
  routeDetails: string;
  vehicleType: string;
  vehicleCount: number;
  supplier: string;
  customer?: string;
  driverName: string;
  driverPhone?: string;
  plateNo: string;
  buy: number;
  sell: number;
  notes: string;
  linkedTransportId?: number;
}

export interface GroupInvoice {
  id: number;
  invoiceNo: string;
  date: string;
  groupNo: string;
  groupName: string;
  pax: number;
  visaPrice: number;
  multiEntryVisaCount?: number;
  multiEntryVisaPrice?: number;
  minPaxCount: number;
  minPaxRate: number;
  badrPrice: number;
  trainStationPrice: number;
  taifPrice: number;
  hudaibiyahPrice: number;
  customSegmentLabel?: string;
  customSegmentPrice?: number;
  customSegmentsJson?: string;
  totalUSD: number;
  dueDate?: string;
  paymentStatus?: 'unpaid' | 'paid';
  notes: string;
}

export type UmrahAgentStatus = 'active' | 'suspended';
export type UmrahProgramType = 'umrah' | 'hajj';
export type UmrahGroupStatus = 'planning' | 'visas_processing' | 'in_ksa' | 'completed' | 'archived';
export type UmrahVisaStatus = 'draft' | 'submitted' | 'issued' | 'rejected' | 'cancelled';
export type UmrahArrivalStatus = 'pending' | 'arrived' | 'departed';
export type UmrahFlightStatus = 'scheduled' | 'landed' | 'delayed' | 'departed' | 'cancelled';
export type UmrahStaffRole = 'supervisor' | 'delegate' | 'driver_coord';
export type UmrahFieldCity = 'makkah' | 'madinah' | 'jeddah' | 'airport';
export type UmrahShiftStatus = 'on_duty' | 'standby' | 'off_duty';

export interface UmrahAgent {
  id: number;
  code: string;
  name: string;
  country: string;
  licenseNo: string;
  contactPerson: string;
  phone: string;
  email: string;
  commissionSAR: number;
  status: UmrahAgentStatus;
  notes: string;
}

export interface UmrahGroup {
  id: number;
  groupCode: string;
  groupName: string;
  season: string;
  programType: UmrahProgramType;
  agentName: string;
  supervisorName: string;
  targetPax: number;
  visaBuySAR: number;
  visaSellSAR: number;
  packagePriceSAR: number;
  arrivalDate: string;
  departureDate: string;
  status: UmrahGroupStatus;
  notes: string;
}

export interface UmrahPilgrim {
  id: number;
  fullName: string;
  gender: 'male' | 'female';
  nationality: string;
  passportNo: string;
  passportExpiry: string;
  birthDate: string;
  phone: string;
  groupCode: string;
  agentName: string;
  visaNo: string;
  visaStatus: UmrahVisaStatus;
  visaIssueDate: string;
  makkahHotel: string;
  makkahRoomNo: string;
  madinahHotel: string;
  madinahRoomNo: string;
  jeddahHotel: string;
  jeddahRoomNo: string;
  roomType: HotelRoomType;
  flightNo: string;
  busNo: string;
  arrivalStatus: UmrahArrivalStatus;
  feeSAR: number;
  paidSAR: number;
  notes: string;
}

export interface UmrahFlight {
  id: number;
  flightNo: string;
  airline: string;
  direction: 'arrival' | 'departure';
  originAirport: string;
  destAirport: string;
  flightDate: string;
  flightTime: string;
  terminal: string;
  groupCode: string;
  paxCount: number;
  busAssigned: string;
  supervisorName: string;
  status: UmrahFlightStatus;
  notes: string;
}

export interface UmrahFieldStaff {
  id: number;
  name: string;
  role: UmrahStaffRole;
  phone: string;
  city: UmrahFieldCity;
  assignedGroup: string;
  assignedBus: string;
  shiftStatus: UmrahShiftStatus;
  notes: string;
}

export interface AccountingDB {
  entries: VisaEntry[];
  transports: TransportEntry[];
  hotels: HotelBooking[];
  vouchers: VoucherEntry[];
  treasury: TreasuryEntry[];
  employees: EmployeeRecord[];
  payroll: PayrollRecord[];
  customers: CustomerMaster[];
  suppliers: SupplierMaster[];
  cycleOperations: CycleOperation[];
  invoices: GroupInvoice[];
  umrahAgents?: UmrahAgent[];
  umrahGroups?: UmrahGroup[];
  umrahPilgrims?: UmrahPilgrim[];
  umrahFlights?: UmrahFlight[];
  umrahFieldStaff?: UmrahFieldStaff[];
  rate: number;
}

export const LEGACY_STORAGE_KEY = 'daleelVisaAccounting_v1';
export const LANG_STORAGE_KEY = 'best_united_lang';

export const DEFAULT_ROUTES = ['الوصول', 'المزارات', 'تحرك داخلي', 'مزارات', 'الطائف', 'المغادرة'];
export const ROUTE_EN: Record<string, string> = {
  الوصول: 'Arrival',
  المزارات: 'Ziyarat',
  'تحرك داخلي': 'Internal Transfer',
  مزارات: 'Ziyarat Tours',
  الطائف: 'Taif',
  المغادرة: 'Departure',
  القدوم: 'Arrival',
  'التنقل الداخلي': 'Internal Transfer',
};

export const VEHICLE_TYPES = [
  'باص 49 راكب',
  'باص VIP',
  'كوستر 25 راكب',
  'هايس 13 راكب',
  'سيارة عائلية / H1',
  'جمس / VIP',
  'أخرى',
];
export const VEHICLE_EN: Record<string, string> = {
  'باص 49 راكب': '49-Seater Bus',
  'باص VIP': 'VIP Bus',
  'كوستر 25 راكب': '25-Seater Coaster',
  'هايس 13 راكب': '13-Seater Hiace',
  'سيارة عائلية / H1': 'Family Car / H1',
  'جمس / VIP': 'GMC / VIP',
  أخرى: 'Other',
};

export const STAGES: {
  key: CycleStageKey;
  order: number;
  ar: string;
  en: string;
  hintAr: string;
  hintEn: string;
}[] = [
  { key: 'arrival', order: 1, ar: 'القدوم', en: 'Arrival', hintAr: 'مثال: المطار ← الفندق', hintEn: 'e.g. Airport → Hotel' },
  { key: 'ziyarat1', order: 2, ar: 'المزارات', en: 'Ziyarat (Makkah)', hintAr: 'مثال: مزارات مكة المكرمة', hintEn: 'e.g. Makkah Ziyarat' },
  { key: 'internal', order: 3, ar: 'التنقل الداخلي', en: 'Internal Transfer', hintAr: 'مثال: مكة ← المدينة', hintEn: 'e.g. Makkah → Madinah' },
  { key: 'ziyarat2', order: 4, ar: 'المزارات', en: 'Ziyarat (Madinah)', hintAr: 'مثال: مزارات المدينة المنورة', hintEn: 'e.g. Madinah Ziyarat' },
  { key: 'departure', order: 5, ar: 'المغادرة', en: 'Departure', hintAr: 'مثال: الفندق ← المطار', hintEn: 'e.g. Hotel → Airport' },
];

export const STATUS_LABELS: Record<CycleStatus, { ar: string; en: string; cls: string }> = {
  pending: { ar: 'مجدول', en: 'Scheduled', cls: 'bg-slate-100 text-slate-600' },
  in_progress: { ar: 'قيد التنفيذ', en: 'In Progress', cls: 'bg-amber-100 text-amber-800' },
  completed: { ar: 'مكتمل', en: 'Completed', cls: 'bg-teal-100 text-teal-800' },
  cancelled: { ar: 'ملغي', en: 'Cancelled', cls: 'bg-red-100 text-red-700' },
};

export const HOTEL_CITIES: Record<HotelCity, { ar: string; en: string; cls: string }> = {
  makkah: { ar: 'مكة المكرمة', en: 'Makkah', cls: 'bg-amber-100 text-amber-800' },
  madinah: { ar: 'المدينة المنورة', en: 'Madinah', cls: 'bg-emerald-100 text-emerald-800' },
  jeddah: { ar: 'جدة', en: 'Jeddah', cls: 'bg-blue-100 text-blue-800' },
};

export const HOTEL_ROOM_TYPES: Record<HotelRoomType, { ar: string; en: string }> = {
  single: { ar: 'فردية (Single)', en: 'Single' },
  double: { ar: 'ثنائية (Double)', en: 'Double' },
  triple: { ar: 'ثلاثية (Triple)', en: 'Triple' },
  quad: { ar: 'رباعية (Quad)', en: 'Quad' },
  quint: { ar: 'خماسية (Quint)', en: 'Quint' },
  suite: { ar: 'جناح (Suite)', en: 'Suite' },
};

export const HOTEL_MEAL_PLANS: Record<HotelMealPlan, { ar: string; en: string }> = {
  RO: { ar: 'بدون وجبات (RO)', en: 'Room Only (RO)' },
  BB: { ar: 'إفطار فقط (BB)', en: 'Bed & Breakfast (BB)' },
  HB: { ar: 'نصف إقامة (HB)', en: 'Half Board (HB)' },
  FB: { ar: 'إقامة كاملة (FB)', en: 'Full Board (FB)' },
  AI: { ar: 'شامل كلياً (AI)', en: 'All Inclusive (AI)' },
};

export const HOTEL_STATUS_LABELS: Record<HotelStatus, { ar: string; en: string; cls: string }> = {
  confirmed: { ar: 'مؤكد', en: 'Confirmed', cls: 'bg-teal-100 text-teal-800' },
  pending: { ar: 'قيد الانتظار', en: 'Pending', cls: 'bg-amber-100 text-amber-800' },
  checked_in: { ar: 'تم التسكين', en: 'Checked In', cls: 'bg-blue-100 text-blue-800' },
  checked_out: { ar: 'تمت المغادرة', en: 'Checked Out', cls: 'bg-slate-100 text-slate-600' },
  cancelled: { ar: 'ملغي', en: 'Cancelled', cls: 'bg-red-100 text-red-700' },
};

export const HOTEL_SUGGESTIONS: Record<HotelCity, { ar: string[]; en: string[] }> = {
  makkah: {
    ar: [
      'فندق برج الساعة فيرمونت مكة',
      'فندق سويس أوتيل المقام مكة',
      'فندق سويس أوتيل مكة',
      'فندق دار التوحيد إنتركونتيننتال',
      'فندق جبل عمر كونراد مكة',
      'فندق جبل عمر حياة ريجنسي مكة',
      'فندق جبل عمر ماريوت مكة',
      'فندق بولمان زمزم مكة',
      'فندق أنجم مكة',
      'فندق فوكو مكة',
      'فندق الشهداء مكة',
      'أبراج الكسوة مكة',
    ],
    en: [
      'Fairmont Makkah Clock Royal Tower',
      'Swissotel Al Maqam Makkah',
      'Swissotel Makkah',
      'Dar Al Tawhid InterContinental Makkah',
      'Conrad Jabal Omar Makkah',
      'Hyatt Regency Jabal Omar Makkah',
      'Jabal Omar Marriott Hotel Makkah',
      'Pullman Zamzam Makkah',
      'Anjum Hotel Makkah',
      'voco Makkah',
      'Al Shohada Hotel Makkah',
      'Al Kiswah Towers Hotel Makkah',
    ],
  },
  madinah: {
    ar: [
      'فندق دار التقوى المدينة',
      'فندق ذا أوبروي المدينة',
      'فندق دار الإيمان إنتركونتيننتال',
      'فندق أنوار المدينة موفنبيك',
      'فندق بولمان زمزم المدينة',
      'فندق هيلتون المدينة',
      'فندق كراون بلازا المدينة',
      'فندق فرونتيل الحارثية المدينة',
      'فندق روتانا المسك المدينة',
      'فندق سجى المدينة',
      'فندق إيلاف طيبة المدينة',
    ],
    en: [
      'Dar Al Taqwa Hotel Madinah',
      'The Oberoi Madinah',
      'Dar Al Iman InterContinental',
      'Anwar Al Madinah Movenpick',
      'Pullman Zamzam Madinah',
      'Madinah Hilton',
      'Crowne Plaza Madinah',
      'Frontel Al Harithia Hotel',
      'Al Misk Hotel Madinah',
      'Saja Al Madinah Hotel',
      'Elaf Taiba Hotel Madinah',
    ],
  },
  jeddah: {
    ar: [
      'فندق هيلتون جدة',
      'فندق شيراتون جدة',
      'فندق كراون بلازا جدة',
      'فندق إنتركونتيننتال جدة',
      'فندق روزوود جدة',
      'فندق موفنبيك جدة',
      'فندق الحمراء جدة',
      'فندق بارك حياة جدة',
      'فندق راديسون بلو جدة',
      'فندق إيبيس جدة',
    ],
    en: [
      'Jeddah Hilton',
      'Sheraton Jeddah Hotel',
      'Crowne Plaza Jeddah',
      'InterContinental Jeddah',
      'Rosewood Jeddah',
      'Movenpick Hotel Jeddah',
      'Al Hamra Hotel Jeddah',
      'Park Hyatt Jeddah',
      'Radisson Blu Hotel Jeddah',
      'Ibis Jeddah City Center',
    ],
  },
};

export const TREASURY_ACCOUNTS: Record<TreasuryAccount, { ar: string; en: string }> = {
  cashbox: { ar: 'الخزنة النقدية', en: 'Cashbox' },
  bank: { ar: 'الحساب البنكي', en: 'Bank Account' },
  custody: { ar: 'عهدة موظف', en: 'Staff Custody' },
  payroll_vault: { ar: 'خزنة الموظفين والرواتب', en: 'Employees & Salaries Vault' },
};

export const TREASURY_CATEGORIES: Record<TreasuryCategory, { ar: string; en: string }> = {
  expense: { ar: 'مصروف تشغيلي', en: 'Operating Expense' },
  capital: { ar: 'تغذية خزنة / رأس مال', en: 'Capital / Funding' },
  salary: { ar: 'صرف راتب', en: 'Salary Payout' },
  advance: { ar: 'سلفة موظف', en: 'Staff Advance' },
  transfer: { ar: 'تحويل داخلي', en: 'Internal Transfer' },
  receipt_extra: { ar: 'إيراد متنوع', en: 'Misc Income' },
  other: { ar: 'أخرى', en: 'Other' },
};

export const EMPLOYEE_STATUS: Record<EmployeeStatus, { ar: string; en: string; cls: string }> = {
  active: { ar: 'على رأس العمل', en: 'Active', cls: 'bg-teal-100 text-teal-800' },
  on_leave: { ar: 'إجازة', en: 'On Leave', cls: 'bg-amber-100 text-amber-800' },
  inactive: { ar: 'موقوف / منتهي', en: 'Inactive', cls: 'bg-red-100 text-red-700' },
};

export const PAYROLL_TYPES: Record<PayrollType, { ar: string; en: string; cls: string }> = {
  salary: { ar: 'راتب شهري', en: 'Monthly Salary', cls: 'bg-teal-100 text-teal-800' },
  advance: { ar: 'سلفة', en: 'Advance', cls: 'bg-amber-100 text-amber-800' },
  bonus: { ar: 'مكافأة', en: 'Bonus', cls: 'bg-blue-100 text-blue-800' },
  deduction: { ar: 'خصم', en: 'Deduction', cls: 'bg-red-100 text-red-700' },
};

export function clampStr(val: unknown, max: number): string {
  return String(val ?? '').trim().slice(0, max);
}

export function safeDocId(raw: string | number): string {
  const cleaned = String(raw).replace(/[^a-zA-Z0-9_\-]/g, '_');
  return (cleaned || `doc_${Date.now()}`).slice(0, 128);
}

export function cycleOpDocId(groupNo: string, stageKey: CycleStageKey): string {
  let hash = 0;
  for (let i = 0; i < groupNo.length; i++) {
    hash = ((hash << 5) - hash + groupNo.charCodeAt(i)) | 0;
  }
  const safePrefix = groupNo.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 40) || 'grp';
  const hex = (hash >>> 0).toString(36);
  return `${safePrefix}_${hex}__${stageKey}`.slice(0, 128);
}
