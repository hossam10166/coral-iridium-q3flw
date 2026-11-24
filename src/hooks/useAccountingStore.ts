import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  OperationType,
  createStaffAuthUser,
  db as firestore,
  handleFirestoreError,
  normalizeUsername,
  runOfflineAwareWrite,
} from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import {
  ALL_PAGE_IDS,
  AccountingDB,
  CustomerMaster,
  CycleOperation,
  EmployeeRecord,
  GroupInvoice,
  HotelBooking,
  LEGACY_STORAGE_KEY,
  PageId,
  PayrollRecord,
  STAGES,
  StaffAccount,
  StaffRole,
  SupplierMaster,
  TreasuryEntry,
  TransportEntry,
  UmrahAgent,
  UmrahFieldStaff,
  UmrahFlight,
  UmrahGroup,
  UmrahPilgrim,
  VisaEntry,
  VoucherEntry,
  WorkspaceInvite,
  clampStr,
  cycleOpDocId,
  safeDocId,
} from '../types/accounting';
import { nextTrnRef, normalizeTime24, today } from '../utils/calculations';

const EMPTY_DB: AccountingDB = {
  entries: [],
  transports: [],
  hotels: [],
  vouchers: [],
  treasury: [],
  employees: [],
  payroll: [],
  customers: [],
  suppliers: [],
  cycleOperations: [],
  invoices: [],
  umrahAgents: [],
  umrahGroups: [],
  umrahPilgrims: [],
  umrahFlights: [],
  umrahFieldStaff: [],
  rate: 3.75,
};

function sanitizeVisa(raw: Partial<VisaEntry>, defaultRate: number): VisaEntry {
  return {
    id: Number(raw.id) || Date.now(),
    groupNo: clampStr(raw.groupNo || 'GRP-' + Date.now(), 80),
    date: clampStr(raw.date || today(), 20),
    pax: Math.max(1, Math.round(Number(raw.pax || 1))),
    customer: clampStr(raw.customer || '-', 160),
    supplier: clampStr(raw.supplier || '-', 160),
    currency: raw.currency === 'USD' ? 'USD' : 'SAR',
    buy: Math.max(0, Number(raw.buy || 0)),
    sell: Math.max(0, Number(raw.sell || 0)),
    rate: Number(raw.rate) > 0 ? Number(raw.rate) : defaultRate,
    notes: clampStr(raw.notes || '', 500),
  };
}

function sanitizeTransport(raw: Partial<TransportEntry>, defaultRate: number): TransportEntry {
  return {
    id: Number(raw.id) || Date.now(),
    refNo: clampStr(raw.refNo || 'TRN-' + Date.now(), 80),
    groupNo: clampStr(raw.groupNo || '', 80),
    date: clampStr(raw.date || today(), 20),
    route: clampStr(raw.route || 'الوصول', 160),
    vehicleType: clampStr(raw.vehicleType || 'باص 49 راكب', 100),
    vehicleCount: Math.max(1, Math.round(Number(raw.vehicleCount || 1))),
    pax: Math.max(0, Math.round(Number(raw.pax || 0))),
    customer: clampStr(raw.customer || '', 160),
    supplier: clampStr(raw.supplier || '-', 160),
    currency: raw.currency === 'USD' ? 'USD' : 'SAR',
    buy: Math.max(0, Number(raw.buy || 0)),
    sell: Math.max(0, Number(raw.sell || 0)),
    rate: Number(raw.rate) > 0 ? Number(raw.rate) : defaultRate,
    driverName: clampStr(raw.driverName || '', 120),
    plateNo: clampStr(raw.plateNo || '', 60),
    notes: clampStr(raw.notes || '', 500),
  };
}

function sanitizeHotel(raw: Partial<HotelBooking>, defaultRate: number): HotelBooking {
  const validCities = ['makkah', 'madinah', 'jeddah'] as const;
  const validRooms = ['single', 'double', 'triple', 'quad', 'quint', 'suite'] as const;
  const validMeals = ['RO', 'BB', 'HB', 'FB', 'AI'] as const;
  const validStatus = ['confirmed', 'pending', 'checked_in', 'checked_out', 'cancelled'] as const;
  return {
    id: Number(raw.id) || Date.now(),
    refNo: clampStr(raw.refNo || 'HTL-' + Date.now(), 80),
    groupNo: clampStr(raw.groupNo || '', 80),
    bookingDate: clampStr(raw.bookingDate || raw.checkIn || today(), 20),
    city: validCities.includes(raw.city as HotelBooking['city']) ? (raw.city as HotelBooking['city']) : 'makkah',
    hotelName: clampStr(raw.hotelName || '-', 180),
    confirmationNo: clampStr(raw.confirmationNo || '', 80),
    checkIn: clampStr(raw.checkIn || today(), 20),
    checkOut: clampStr(raw.checkOut || today(), 20),
    nights: Math.min(365, Math.max(1, Math.round(Number(raw.nights || 1)))),
    roomType: validRooms.includes(raw.roomType as HotelBooking['roomType']) ? (raw.roomType as HotelBooking['roomType']) : 'quad',
    mealPlan: validMeals.includes(raw.mealPlan as HotelBooking['mealPlan']) ? (raw.mealPlan as HotelBooking['mealPlan']) : 'BB',
    rooms: Math.max(1, Math.round(Number(raw.rooms || 1))),
    pax: Math.max(0, Math.round(Number(raw.pax || 0))),
    status: validStatus.includes(raw.status as HotelBooking['status']) ? (raw.status as HotelBooking['status']) : 'confirmed',
    customer: clampStr(raw.customer || '-', 160),
    supplier: clampStr(raw.supplier || '-', 160),
    currency: raw.currency === 'USD' ? 'USD' : 'SAR',
    buy: Math.max(0, Number(raw.buy || 0)),
    sell: Math.max(0, Number(raw.sell || 0)),
    rate: Number(raw.rate) > 0 ? Number(raw.rate) : defaultRate,
    notes: clampStr(raw.notes || '', 500),
  };
}

function sanitizeVoucher(raw: Partial<VoucherEntry>, defaultRate: number): VoucherEntry {
  const amt = Math.max(0.01, Number(raw.amount || 0.01));
  const rate = Number(raw.rate) > 0 ? Number(raw.rate) : defaultRate;
  const cur = raw.currency === 'USD' ? 'USD' : 'SAR';
  const amtSAR = Number(raw.amountSAR) > 0 ? Number(raw.amountSAR) : amt * (cur === 'USD' ? rate : 1);
  return {
    no: clampStr(raw.no || 'V-' + Date.now(), 60),
    type: raw.type === 'payment' ? 'payment' : 'receipt',
    date: clampStr(raw.date || today(), 20),
    party: clampStr(raw.party || '-', 160),
    amount: amt,
    currency: cur,
    rate,
    amountSAR: amtSAR,
    note: clampStr(raw.note || '', 500),
  };
}

function sanitizeTreasury(raw: Partial<TreasuryEntry>, defaultRate: number): TreasuryEntry {
  const validCats = ['expense', 'capital', 'salary', 'advance', 'transfer', 'receipt_extra', 'other'] as const;
  const validAccs = ['cashbox', 'bank', 'custody', 'payroll_vault'] as const;
  const cur = raw.currency === 'USD' ? 'USD' : raw.currency === 'EGP' ? 'EGP' : 'SAR';
  const amt = Math.max(0.01, Number(raw.amount || 0.01));
  const fallbackRate = cur === 'EGP' ? 13 : defaultRate;
  const rate = Number(raw.rate) > 0 ? Number(raw.rate) : fallbackRate;
  const computedSAR = cur === 'USD' ? amt * rate : cur === 'EGP' ? amt / rate : amt;
  const amtSAR = Math.max(0.01, Number(raw.amountSAR) > 0 ? Number(raw.amountSAR) : computedSAR);
  const out: TreasuryEntry = {
    id: Number(raw.id) || Date.now(),
    refNo: clampStr(raw.refNo || 'TRS-' + Date.now(), 80),
    date: clampStr(raw.date || today(), 20),
    type: raw.type === 'in' ? 'in' : 'out',
    category: validCats.includes(raw.category as TreasuryEntry['category'])
      ? (raw.category as TreasuryEntry['category'])
      : 'expense',
    account: validAccs.includes(raw.account as TreasuryEntry['account'])
      ? (raw.account as TreasuryEntry['account'])
      : 'cashbox',
    amount: amt,
    currency: cur,
    rate,
    amountSAR: Number(amtSAR.toFixed(2)),
    description: clampStr(raw.description || '-', 240),
    employeeName: clampStr(raw.employeeName || '', 160),
    notes: clampStr(raw.notes || '', 500),
  };
  if (raw.amountEGP !== undefined && raw.amountEGP !== null && Number.isFinite(Number(raw.amountEGP)) && Number(raw.amountEGP) >= 0) {
    out.amountEGP = Number(Number(raw.amountEGP).toFixed(2));
  }
  if (raw.amountUSD !== undefined && raw.amountUSD !== null && Number.isFinite(Number(raw.amountUSD)) && Number(raw.amountUSD) >= 0) {
    out.amountUSD = Number(Number(raw.amountUSD).toFixed(2));
  }
  if (typeof raw.employeeId === 'number' && raw.employeeId > 0) {
    out.employeeId = raw.employeeId;
  }
  return out;
}

function sanitizeEmployee(raw: Partial<EmployeeRecord>): EmployeeRecord {
  const validStatus = ['active', 'on_leave', 'inactive'] as const;
  const out: EmployeeRecord = {
    id: Number(raw.id) || Date.now(),
    code: clampStr(raw.code || 'EMP-' + Date.now(), 60),
    name: clampStr(raw.name || '-', 160),
    jobTitle: clampStr(raw.jobTitle || '-', 120),
    department: clampStr(raw.department || '', 120),
    phone: clampStr(raw.phone || '', 40),
    nationalId: clampStr(raw.nationalId || '', 40),
    hireDate: clampStr(raw.hireDate || today(), 20),
    baseSalary: Math.max(0, Number(raw.baseSalary || 0)),
    housingAllowance: Math.max(0, Number(raw.housingAllowance || 0)),
    transportAllowance: Math.max(0, Number(raw.transportAllowance || 0)),
    otherAllowance: Math.max(0, Number(raw.otherAllowance || 0)),
    status: validStatus.includes(raw.status as EmployeeRecord['status'])
      ? (raw.status as EmployeeRecord['status'])
      : 'active',
    notes: clampStr(raw.notes || '', 500),
  };
  if (raw.salaryDay !== undefined && raw.salaryDay !== null && Number(raw.salaryDay) >= 1) {
    out.salaryDay = Math.min(31, Math.max(1, Math.round(Number(raw.salaryDay))));
  }
  return out;
}

function sanitizePayroll(raw: Partial<PayrollRecord>): PayrollRecord {
  const validTypes = ['salary', 'advance', 'bonus', 'deduction'] as const;
  const validAccs = ['cashbox', 'bank', 'custody', 'payroll_vault'] as const;
  const out: PayrollRecord = {
    id: Number(raw.id) || Date.now(),
    refNo: clampStr(raw.refNo || 'PAY-' + Date.now(), 80),
    date: clampStr(raw.date || today(), 20),
    month: clampStr(raw.month || today().slice(0, 7), 12),
    employeeId: Number(raw.employeeId || 1),
    employeeName: clampStr(raw.employeeName || '-', 160),
    recordType: validTypes.includes(raw.recordType as PayrollRecord['recordType'])
      ? (raw.recordType as PayrollRecord['recordType'])
      : 'salary',
    amount: Math.max(0.01, Number(raw.amount || 0.01)),
    postToTreasury: Boolean(raw.postToTreasury),
    treasuryAccount: validAccs.includes(raw.treasuryAccount as PayrollRecord['treasuryAccount'])
      ? (raw.treasuryAccount as PayrollRecord['treasuryAccount'])
      : 'cashbox',
    notes: clampStr(raw.notes || '', 500),
  };
  if (raw.currency === 'SAR' || raw.currency === 'USD' || raw.currency === 'EGP') {
    out.currency = raw.currency;
  }
  if (raw.rate !== undefined && raw.rate !== null && Number(raw.rate) > 0) {
    out.rate = Number(raw.rate);
  }
  if (raw.amountSAR !== undefined && raw.amountSAR !== null && Number.isFinite(Number(raw.amountSAR)) && Number(raw.amountSAR) >= 0) {
    out.amountSAR = Number(Number(raw.amountSAR).toFixed(2));
  }
  if (raw.amountEGP !== undefined && raw.amountEGP !== null && Number.isFinite(Number(raw.amountEGP)) && Number(raw.amountEGP) >= 0) {
    out.amountEGP = Number(Number(raw.amountEGP).toFixed(2));
  }
  if (raw.amountUSD !== undefined && raw.amountUSD !== null && Number.isFinite(Number(raw.amountUSD)) && Number(raw.amountUSD) >= 0) {
    out.amountUSD = Number(Number(raw.amountUSD).toFixed(2));
  }
  if (typeof raw.linkedTreasuryId === 'number' && raw.linkedTreasuryId > 0) {
    out.linkedTreasuryId = raw.linkedTreasuryId;
  }
  return out;
}

function sanitizeCustomer(raw: Partial<CustomerMaster>): CustomerMaster {
  return {
    code: clampStr(raw.code || 'CUS0001', 60),
    name: clampStr(raw.name || '-', 160),
    note: clampStr(raw.note || '', 500),
  };
}

function sanitizeSupplier(raw: Partial<SupplierMaster>): SupplierMaster {
  const validCats = ['all', 'both', 'visa', 'transport', 'hotel'] as const;
  return {
    code: clampStr(raw.code || 'SUP0001', 60),
    name: clampStr(raw.name || '-', 160),
    category: validCats.includes(raw.category as SupplierMaster['category'])
      ? (raw.category as SupplierMaster['category'])
      : 'all',
    note: clampStr(raw.note || '', 500),
  };
}

function sanitizeCycleOp(raw: Partial<CycleOperation>): CycleOperation {
  const validStages = ['arrival', 'ziyarat1', 'internal', 'ziyarat2', 'departure', 'custom'] as const;
  const validStatus = ['pending', 'in_progress', 'completed', 'cancelled'] as const;
  const stageKey = validStages.includes(raw.stageKey as CycleOperation['stageKey'])
    ? (raw.stageKey as CycleOperation['stageKey'])
    : 'custom';
  const groupNo = clampStr(raw.groupNo || 'GRP', 80);
  const stMeta = STAGES.find((s) => s.key === stageKey);
  const direction = clampStr(raw.direction ?? raw.stageLabel ?? stMeta?.ar ?? '', 160);
  const fromLocation = clampStr(raw.fromLocation || '', 160);
  const toLocation = clampStr(raw.toLocation || '', 160);
  const hotelName = clampStr(raw.hotelName || '', 180);
  const driverPhone = clampStr(raw.driverPhone || '', 40);
  const totalPax = Math.max(0, Math.round(Number(raw.totalPax ?? 0)));
  const totalBus = Math.max(0, Math.round(Number(raw.totalBus ?? raw.vehicleCount ?? 1)));
  const composedRoute =
    fromLocation || toLocation ? [fromLocation, toLocation].filter(Boolean).join(' ← ') : raw.routeDetails || '';
  const out: CycleOperation = {
    id: safeDocId(raw.id || `${groupNo}__${stageKey}`),
    groupNo,
    stageKey,
    stageLabel: clampStr(raw.stageLabel || direction || stMeta?.ar || 'عملية', 120),
    status: validStatus.includes(raw.status as CycleOperation['status'])
      ? (raw.status as CycleOperation['status'])
      : 'pending',
    direction,
    totalPax,
    totalBus,
    fromLocation,
    toLocation,
    hotelName,
    date: clampStr(raw.date || '', 20),
    time: clampStr(normalizeTime24(raw.time || ''), 20),
    routeDetails: clampStr(composedRoute, 200),
    vehicleType: clampStr(raw.vehicleType || 'باص 49 راكب', 100),
    vehicleCount: Math.max(1, totalBus || Math.round(Number(raw.vehicleCount || 1))),
    supplier: clampStr(raw.supplier || '', 160),
    customer: clampStr(raw.customer || '', 160),
    driverName: clampStr(raw.driverName || '', 120),
    driverPhone,
    plateNo: clampStr(raw.plateNo || '', 60),
    buy: Math.max(0, Number(raw.buy || 0)),
    sell: Math.max(0, Number(raw.sell || 0)),
    notes: clampStr(raw.notes || '', 500),
  };
  if (typeof raw.linkedTransportId === 'number' && raw.linkedTransportId > 0) {
    out.linkedTransportId = raw.linkedTransportId;
  }
  return out;
}

function sanitizeInvoice(raw: Partial<GroupInvoice>): GroupInvoice {
  const pax = Math.max(0, Math.round(Number(raw.pax || 0)));
  const visaPrice = Math.max(0, Number(raw.visaPrice || 0));
  const multiEntryVisaCount = Math.max(0, Math.round(Number(raw.multiEntryVisaCount || 0)));
  const multiEntryVisaPrice = Math.max(0, Number(raw.multiEntryVisaPrice || 0));
  const minPaxCount = Math.max(0, Math.round(Number(raw.minPaxCount || 0)));
  const minPaxRate = raw.minPaxRate !== undefined && raw.minPaxRate !== null ? Math.max(0, Number(raw.minPaxRate)) : 26.67;
  const badrPrice = Math.max(0, Number(raw.badrPrice || 0));
  const trainStationPrice = Math.max(0, Number(raw.trainStationPrice || 0));
  const taifPrice = Math.max(0, Number(raw.taifPrice || 0));
  const hudaibiyahPrice = Math.max(0, Number(raw.hudaibiyahPrice || 0));
  const customSegmentLabel = clampStr(raw.customSegmentLabel || '', 240);
  const customSegmentPrice = Math.max(0, Number(raw.customSegmentPrice || 0));
  const customSegmentsJson = clampStr(raw.customSegmentsJson || '', 2000);
  const totalUSD = Number(
    (
      pax * visaPrice +
      multiEntryVisaCount * multiEntryVisaPrice +
      minPaxCount * minPaxRate +
      badrPrice +
      trainStationPrice +
      taifPrice +
      hudaibiyahPrice +
      customSegmentPrice
    ).toFixed(2)
  );
  const out: GroupInvoice = {
    id: Number(raw.id) || Date.now(),
    invoiceNo: clampStr(raw.invoiceNo || 'INV-' + Date.now(), 60),
    date: clampStr(raw.date || today(), 20),
    groupNo: clampStr(raw.groupNo || 'GRP', 80),
    groupName: clampStr(raw.groupName || '-', 160),
    pax,
    visaPrice,
    multiEntryVisaCount,
    multiEntryVisaPrice,
    minPaxCount,
    minPaxRate,
    badrPrice,
    trainStationPrice,
    taifPrice,
    hudaibiyahPrice,
    customSegmentLabel,
    customSegmentPrice,
    customSegmentsJson,
    totalUSD,
    notes: clampStr(raw.notes || '', 500),
  };
  const cleanDue = clampStr(raw.dueDate || '', 20);
  if (cleanDue.length >= 8) {
    out.dueDate = cleanDue;
  }
  if (raw.paymentStatus === 'paid' || raw.paymentStatus === 'unpaid') {
    out.paymentStatus = raw.paymentStatus;
  }
  return out;
}

function sanitizeUmrahAgent(raw: Partial<UmrahAgent>): UmrahAgent {
  return {
    id: Number(raw.id) || Date.now(),
    code: clampStr(raw.code || 'AGT-' + Date.now().toString().slice(-4), 60),
    name: clampStr(raw.name || '-', 160),
    country: clampStr(raw.country || '', 100),
    licenseNo: clampStr(raw.licenseNo || '', 80),
    contactPerson: clampStr(raw.contactPerson || '', 120),
    phone: clampStr(raw.phone || '', 40),
    email: clampStr(raw.email || '', 160),
    commissionSAR: Math.max(0, Number(raw.commissionSAR || 0)),
    status: raw.status === 'suspended' ? 'suspended' : 'active',
    notes: clampStr(raw.notes || '', 500),
  };
}

function sanitizeUmrahGroup(raw: Partial<UmrahGroup>): UmrahGroup {
  const validStatus = ['planning', 'visas_processing', 'in_ksa', 'completed', 'archived'] as const;
  return {
    id: Number(raw.id) || Date.now(),
    groupCode: clampStr(raw.groupCode || 'UMR-' + Date.now().toString().slice(-4), 80),
    groupName: clampStr(raw.groupName || '-', 160),
    season: clampStr(raw.season || '1448', 20),
    programType: raw.programType === 'hajj' ? 'hajj' : 'umrah',
    agentName: clampStr(raw.agentName || '-', 160),
    supervisorName: clampStr(raw.supervisorName || '', 120),
    targetPax: Math.max(0, Math.round(Number(raw.targetPax || 0))),
    visaBuySAR: Math.max(0, Number(raw.visaBuySAR || 0)),
    visaSellSAR: Math.max(0, Number(raw.visaSellSAR || 0)),
    packagePriceSAR: Math.max(0, Number(raw.packagePriceSAR || 0)),
    arrivalDate: clampStr(raw.arrivalDate || '', 20),
    departureDate: clampStr(raw.departureDate || '', 20),
    status: validStatus.includes(raw.status as UmrahGroup['status'])
      ? (raw.status as UmrahGroup['status'])
      : 'planning',
    notes: clampStr(raw.notes || '', 500),
  };
}

function sanitizeUmrahPilgrim(raw: Partial<UmrahPilgrim>): UmrahPilgrim {
  const validVisa = ['draft', 'submitted', 'issued', 'rejected', 'cancelled'] as const;
  const validRooms = ['single', 'double', 'triple', 'quad', 'quint', 'suite'] as const;
  const validArrival = ['pending', 'arrived', 'departed'] as const;
  return {
    id: Number(raw.id) || Date.now(),
    fullName: clampStr(raw.fullName || '-', 160),
    gender: raw.gender === 'female' ? 'female' : 'male',
    nationality: clampStr(raw.nationality || 'مصري', 80),
    passportNo: clampStr(raw.passportNo || 'P-' + Date.now().toString().slice(-6), 60),
    passportExpiry: clampStr(raw.passportExpiry || '', 20),
    birthDate: clampStr(raw.birthDate || '', 20),
    phone: clampStr(raw.phone || '', 40),
    groupCode: clampStr(raw.groupCode || 'UMR-1448', 80),
    agentName: clampStr(raw.agentName || '', 160),
    visaNo: clampStr(raw.visaNo || '', 60),
    visaStatus: validVisa.includes(raw.visaStatus as UmrahPilgrim['visaStatus'])
      ? (raw.visaStatus as UmrahPilgrim['visaStatus'])
      : 'draft',
    visaIssueDate: clampStr(raw.visaIssueDate || '', 20),
    makkahHotel: clampStr(raw.makkahHotel || '', 180),
    makkahRoomNo: clampStr(raw.makkahRoomNo || '', 40),
    madinahHotel: clampStr(raw.madinahHotel || '', 180),
    madinahRoomNo: clampStr(raw.madinahRoomNo || '', 40),
    jeddahHotel: clampStr(raw.jeddahHotel || '', 180),
    jeddahRoomNo: clampStr(raw.jeddahRoomNo || '', 40),
    roomType: validRooms.includes(raw.roomType as UmrahPilgrim['roomType'])
      ? (raw.roomType as UmrahPilgrim['roomType'])
      : 'quad',
    flightNo: clampStr(raw.flightNo || '', 40),
    busNo: clampStr(raw.busNo || '', 60),
    arrivalStatus: validArrival.includes(raw.arrivalStatus as UmrahPilgrim['arrivalStatus'])
      ? (raw.arrivalStatus as UmrahPilgrim['arrivalStatus'])
      : 'pending',
    feeSAR: Math.max(0, Number(raw.feeSAR || 0)),
    paidSAR: Math.max(0, Number(raw.paidSAR || 0)),
    notes: clampStr(raw.notes || '', 500),
  };
}

function sanitizeUmrahFlight(raw: Partial<UmrahFlight>): UmrahFlight {
  const validStatus = ['scheduled', 'landed', 'delayed', 'departed', 'cancelled'] as const;
  return {
    id: Number(raw.id) || Date.now(),
    flightNo: clampStr(raw.flightNo || 'SV-000', 40),
    airline: clampStr(raw.airline || 'الخطوط السعودية', 100),
    direction: raw.direction === 'departure' ? 'departure' : 'arrival',
    originAirport: clampStr(raw.originAirport || '', 80),
    destAirport: clampStr(raw.destAirport || '', 80),
    flightDate: clampStr(raw.flightDate || today(), 20),
    flightTime: clampStr(normalizeTime24(raw.flightTime || ''), 20),
    terminal: clampStr(raw.terminal || '', 60),
    groupCode: clampStr(raw.groupCode || '', 80),
    paxCount: Math.max(0, Math.round(Number(raw.paxCount || 0))),
    busAssigned: clampStr(raw.busAssigned || '', 80),
    supervisorName: clampStr(raw.supervisorName || '', 120),
    status: validStatus.includes(raw.status as UmrahFlight['status'])
      ? (raw.status as UmrahFlight['status'])
      : 'scheduled',
    notes: clampStr(raw.notes || '', 500),
  };
}

function sanitizeUmrahFieldStaff(raw: Partial<UmrahFieldStaff>): UmrahFieldStaff {
  const validRoles = ['supervisor', 'delegate', 'driver_coord'] as const;
  const validCities = ['makkah', 'madinah', 'jeddah', 'airport'] as const;
  const validShift = ['on_duty', 'standby', 'off_duty'] as const;
  return {
    id: Number(raw.id) || Date.now(),
    name: clampStr(raw.name || '-', 160),
    role: validRoles.includes(raw.role as UmrahFieldStaff['role'])
      ? (raw.role as UmrahFieldStaff['role'])
      : 'supervisor',
    phone: clampStr(raw.phone || '', 40),
    city: validCities.includes(raw.city as UmrahFieldStaff['city'])
      ? (raw.city as UmrahFieldStaff['city'])
      : 'makkah',
    assignedGroup: clampStr(raw.assignedGroup || '', 80),
    assignedBus: clampStr(raw.assignedBus || '', 80),
    shiftStatus: validShift.includes(raw.shiftStatus as UmrahFieldStaff['shiftStatus'])
      ? (raw.shiftStatus as UmrahFieldStaff['shiftStatus'])
      : 'on_duty',
    notes: clampStr(raw.notes || '', 500),
  };
}

export function useAccountingStore() {
  const { user, profile, workspaceId, isWorkspaceOwner, profileReady, lang, updateProfileRate } = useAuth();
  const [entries, setEntries] = useState<VisaEntry[]>([]);
  const [transports, setTransports] = useState<TransportEntry[]>([]);
  const [hotels, setHotels] = useState<HotelBooking[]>([]);
  const [vouchers, setVouchers] = useState<VoucherEntry[]>([]);
  const [treasury, setTreasury] = useState<TreasuryEntry[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [payroll, setPayroll] = useState<PayrollRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerMaster[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierMaster[]>([]);
  const [cycleOperations, setCycleOperations] = useState<CycleOperation[]>([]);
  const [invoices, setInvoices] = useState<GroupInvoice[]>([]);
  const [umrahAgents, setUmrahAgents] = useState<UmrahAgent[]>([]);
  const [umrahGroups, setUmrahGroups] = useState<UmrahGroup[]>([]);
  const [umrahPilgrims, setUmrahPilgrims] = useState<UmrahPilgrim[]>([]);
  const [umrahFlights, setUmrahFlights] = useState<UmrahFlight[]>([]);
  const [umrahFieldStaff, setUmrahFieldStaff] = useState<UmrahFieldStaff[]>([]);
  const [staffAccounts, setStaffAccounts] = useState<StaffAccount[]>([]);
  const [workspaceInvites, setWorkspaceInvites] = useState<WorkspaceInvite[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!user || !workspaceId || !profileReady) {
      setLoadingData(!profileReady && Boolean(user));
      return;
    }

    setLoadingData(true);
    const uid = workspaceId;
    const readyFlags: Record<string, boolean> = {};
    const cols = [
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
    ];
    const markReady = (name: string) => {
      readyFlags[name] = true;
      if (cols.every((c) => readyFlags[c])) {
        setLoadingData(false);
      }
    };

    const listen = <T,>(
      colName: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      sortFn?: (a: T, b: T) => number
    ) => {
      const path = `users/${uid}/${colName}`;
      const q = query(collection(firestore, 'users', uid, colName), where('ownerId', '==', uid));
      return onSnapshot(
        q,
        (snap) => {
          const items = snap.docs.map((d) => d.data() as T);
          if (sortFn) items.sort(sortFn);
          setter(items);
          markReady(colName);
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, path);
        }
      );
    };

    const unsubs = [
      listen<VisaEntry>('entries', setEntries, (a, b) => a.id - b.id),
      listen<TransportEntry>('transports', setTransports, (a, b) => a.id - b.id),
      listen<HotelBooking>('hotels', setHotels, (a, b) => a.id - b.id),
      listen<VoucherEntry>('vouchers', setVouchers, (a, b) => a.no.localeCompare(b.no)),
      listen<TreasuryEntry>('treasury', setTreasury, (a, b) => a.id - b.id),
      listen<EmployeeRecord>('employees', setEmployees, (a, b) => a.id - b.id),
      listen<PayrollRecord>('payroll', setPayroll, (a, b) => a.id - b.id),
      listen<CustomerMaster>('customers', setCustomers, (a, b) => a.code.localeCompare(b.code)),
      listen<SupplierMaster>('suppliers', setSuppliers, (a, b) => a.code.localeCompare(b.code)),
      listen<CycleOperation>('cycleOperations', setCycleOperations, (a, b) => a.id.localeCompare(b.id)),
      listen<GroupInvoice>('invoices', setInvoices, (a, b) => a.id - b.id),
      listen<UmrahAgent>('umrahAgents', setUmrahAgents, (a, b) => a.id - b.id),
      listen<UmrahGroup>('umrahGroups', setUmrahGroups, (a, b) => a.id - b.id),
      listen<UmrahPilgrim>('umrahPilgrims', setUmrahPilgrims, (a, b) => a.id - b.id),
      listen<UmrahFlight>('umrahFlights', setUmrahFlights, (a, b) => a.id - b.id),
      listen<UmrahFieldStaff>('umrahFieldStaff', setUmrahFieldStaff, (a, b) => a.id - b.id),
    ];

    if (isWorkspaceOwner) {
      const sq = query(collection(firestore, 'staffAccounts'), where('workspaceId', '==', uid));
      unsubs.push(
        onSnapshot(
          sq,
          (snap) => {
            const list = snap.docs
              .map((d) => d.data() as StaffAccount)
              .sort((a, b) => a.username.localeCompare(b.username));
            setStaffAccounts(list);
          },
          (err) => {
            handleFirestoreError(err, OperationType.LIST, 'staffAccounts');
          }
        )
      );

      const iq = query(collection(firestore, 'workspaceInvites'), where('workspaceId', '==', uid));
      unsubs.push(
        onSnapshot(
          iq,
          (snap) => {
            const list = snap.docs
              .map((d) => d.data() as WorkspaceInvite)
              .sort((a, b) => a.email.localeCompare(b.email));
            setWorkspaceInvites(list);
          },
          (err) => {
            handleFirestoreError(err, OperationType.LIST, 'workspaceInvites');
          }
        )
      );
    } else {
      setStaffAccounts([]);
      setWorkspaceInvites([]);
    }

    const offlineTimer =
      typeof navigator !== 'undefined' && !navigator.onLine
        ? window.setTimeout(() => setLoadingData(false), 1200)
        : null;

    return () => {
      if (offlineTimer !== null) window.clearTimeout(offlineTimer);
      unsubs.forEach((u) => u());
    };
  }, [user, workspaceId, isWorkspaceOwner, profileReady]);

  const db: AccountingDB = useMemo(
    () => ({
      entries,
      transports,
      hotels,
      vouchers,
      treasury,
      employees,
      payroll,
      customers,
      suppliers,
      cycleOperations,
      invoices,
      umrahAgents,
      umrahGroups,
      umrahPilgrims,
      umrahFlights,
      umrahFieldStaff,
      rate: profile?.rate || 3.75,
    }),
    [
      entries,
      transports,
      hotels,
      vouchers,
      treasury,
      employees,
      payroll,
      customers,
      suppliers,
      cycleOperations,
      invoices,
      umrahAgents,
      umrahGroups,
      umrahPilgrims,
      umrahFlights,
      umrahFieldStaff,
      profile?.rate,
    ]
  );

  const legacyLocalData = useMemo((): AccountingDB | null => {
    try {
      const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const count =
        (Array.isArray(parsed.entries) ? parsed.entries.length : 0) +
        (Array.isArray(parsed.transports) ? parsed.transports.length : 0) +
        (Array.isArray(parsed.hotels) ? parsed.hotels.length : 0) +
        (Array.isArray(parsed.vouchers) ? parsed.vouchers.length : 0) +
        (Array.isArray(parsed.treasury) ? parsed.treasury.length : 0) +
        (Array.isArray(parsed.employees) ? parsed.employees.length : 0) +
        (Array.isArray(parsed.customers) ? parsed.customers.length : 0) +
        (Array.isArray(parsed.suppliers) ? parsed.suppliers.length : 0) +
        (Array.isArray(parsed.invoices) ? parsed.invoices.length : 0);
      if (count === 0) return null;
      return {
        ...EMPTY_DB,
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
        rate: Number(parsed.rate) > 0 ? Number(parsed.rate) : 3.75,
      };
    } catch {
      return null;
    }
  }, []);

  // --- Staff Login Accounts CRUD (Workspace Owner Only) ---
  const createStaffAccount = useCallback(
    async (input: {
      username: string;
      password: string;
      displayName: string;
      role: StaffRole;
      permissions: PageId[];
      employeeId?: number;
    }) => {
      if (!user || !workspaceId || !isWorkspaceOwner) return;
      const username = normalizeUsername(input.username);
      if (!username || username.length < 2) {
        throw new Error('INVALID_USERNAME');
      }
      const staffUid = await createStaffAuthUser(username, input.password);
      const validPerms = input.permissions.filter((p) => ALL_PAGE_IDS.includes(p)).slice(0, 20);
      const permissions: PageId[] = validPerms.length > 0 ? validPerms : ['dashboard'];

      const path = `staffAccounts/${staffUid}`;
      const existingInWorkspace = staffAccounts.some((s) => s.uid === staffUid);

      if (existingInWorkspace) {
        await runOfflineAwareWrite(
          updateDoc(doc(firestore, 'staffAccounts', staffUid), {
            displayName: clampStr(input.displayName || username, 120),
            role: input.role === 'admin' ? 'admin' : 'staff',
            active: true,
            permissions,
            employeeId:
              typeof input.employeeId === 'number' && input.employeeId > 0
                ? input.employeeId
                : deleteField(),
            updatedAt: serverTimestamp(),
          }),
          OperationType.UPDATE,
          path
        );
        return;
      }

      const payload: Record<string, unknown> = {
        uid: staffUid,
        workspaceId,
        createdBy: user.uid,
        username: clampStr(username, 60),
        displayName: clampStr(input.displayName || username, 120),
        role: input.role === 'admin' ? 'admin' : 'staff',
        active: true,
        permissions,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (typeof input.employeeId === 'number' && input.employeeId > 0) {
        payload.employeeId = input.employeeId;
      }

      try {
        await setDoc(doc(firestore, 'staffAccounts', staffUid), payload);
      } catch (err) {
        const code = String((err as { code?: string })?.code || '');
        if (code === 'permission-denied') {
          throw new Error('USERNAME_OWNED_BY_OTHER_WORKSPACE');
        }
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    },
    [user, workspaceId, isWorkspaceOwner, staffAccounts]
  );

  const updateStaffAccount = useCallback(
    async (
      staffUid: string,
      patch: {
        displayName: string;
        role: StaffRole;
        active: boolean;
        permissions: PageId[];
        employeeId?: number;
      }
    ) => {
      if (!user || !isWorkspaceOwner) return;
      const validPerms = patch.permissions.filter((p) => ALL_PAGE_IDS.includes(p)).slice(0, 20);
      const permissions: PageId[] = validPerms.length > 0 ? validPerms : ['dashboard'];
      const path = `staffAccounts/${staffUid}`;
      await runOfflineAwareWrite(
        updateDoc(doc(firestore, 'staffAccounts', staffUid), {
          displayName: clampStr(patch.displayName, 120),
          role: patch.role === 'admin' ? 'admin' : 'staff',
          active: Boolean(patch.active),
          permissions,
          employeeId:
            typeof patch.employeeId === 'number' && patch.employeeId > 0
              ? patch.employeeId
              : deleteField(),
          updatedAt: serverTimestamp(),
        }),
        OperationType.UPDATE,
        path
      );
    },
    [user, isWorkspaceOwner]
  );

  const deleteStaffAccount = useCallback(
    async (staffUid: string) => {
      if (!user || !isWorkspaceOwner) return;
      const path = `staffAccounts/${staffUid}`;
      await runOfflineAwareWrite(
        deleteDoc(doc(firestore, 'staffAccounts', staffUid)),
        OperationType.DELETE,
        path
      );
    },
    [user, isWorkspaceOwner]
  );

  // --- Shared Google Email Invites CRUD (Workspace Owner Only) ---
  const createWorkspaceInvite = useCallback(
    async (input: {
      email: string;
      displayName: string;
      role: StaffRole;
      permissions: PageId[];
    }) => {
      if (!user || !workspaceId || !isWorkspaceOwner) return;
      const cleanEmail = String(input.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        throw new Error('INVALID_EMAIL');
      }
      if (cleanEmail === (user.email || '').trim().toLowerCase()) {
        throw new Error('SELF_EMAIL');
      }
      if (workspaceInvites.some((inv) => inv.email.toLowerCase() === cleanEmail)) {
        throw new Error('DUPLICATE_EMAIL');
      }

      const inviteId = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const validPerms = input.permissions.filter((p) => ALL_PAGE_IDS.includes(p)).slice(0, 20);
      const permissions: PageId[] = validPerms.length > 0 ? validPerms : ['dashboard'];

      const path = `workspaceInvites/${inviteId}`;
      await runOfflineAwareWrite(
        setDoc(doc(firestore, 'workspaceInvites', inviteId), {
          id: inviteId,
          workspaceId,
          invitedBy: user.uid,
          email: clampStr(cleanEmail, 200),
          displayName: clampStr(input.displayName || cleanEmail.split('@')[0], 120),
          role: input.role === 'admin' ? 'admin' : 'staff',
          active: true,
          permissions,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        OperationType.CREATE,
        path
      );
    },
    [user, workspaceId, isWorkspaceOwner, workspaceInvites]
  );

  const updateWorkspaceInvite = useCallback(
    async (
      inviteId: string,
      patch: {
        displayName: string;
        role: StaffRole;
        active: boolean;
        permissions: PageId[];
      }
    ) => {
      if (!user || !isWorkspaceOwner) return;
      const validPerms = patch.permissions.filter((p) => ALL_PAGE_IDS.includes(p)).slice(0, 20);
      const permissions: PageId[] = validPerms.length > 0 ? validPerms : ['dashboard'];
      const path = `workspaceInvites/${inviteId}`;
      await runOfflineAwareWrite(
        updateDoc(doc(firestore, 'workspaceInvites', inviteId), {
          displayName: clampStr(patch.displayName, 120),
          role: patch.role === 'admin' ? 'admin' : 'staff',
          active: Boolean(patch.active),
          permissions,
          updatedAt: serverTimestamp(),
        }),
        OperationType.UPDATE,
        path
      );
    },
    [user, isWorkspaceOwner]
  );

  const deleteWorkspaceInvite = useCallback(
    async (inviteId: string) => {
      if (!user || !isWorkspaceOwner) return;
      const path = `workspaceInvites/${inviteId}`;
      await runOfflineAwareWrite(
        deleteDoc(doc(firestore, 'workspaceInvites', inviteId)),
        OperationType.DELETE,
        path
      );
    },
    [user, isWorkspaceOwner]
  );

  // --- CRUD Actions ---
  const saveVisaEntry = useCallback(
    async (item: VisaEntry, isEdit: boolean) => {
      if (!workspaceId) return;
      const clean = sanitizeVisa(item, db.rate);
      const id = safeDocId(clean.id);
      const path = `users/${workspaceId}/entries/${id}`;
      const ref = doc(firestore, 'users', workspaceId, 'entries', id);
      if (isEdit) {
        const { id: _id, ...mutable } = clean;
        await runOfflineAwareWrite(
          updateDoc(ref, { ...mutable, updatedAt: serverTimestamp() }),
          OperationType.UPDATE,
          path
        );
      } else {
        await runOfflineAwareWrite(
          setDoc(ref, {
            ...clean,
            ownerId: workspaceId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          OperationType.CREATE,
          path
        );
      }
    },
    [workspaceId, db.rate]
  );

  const importVisaEntriesBatch = useCallback(
    async (items: VisaEntry[]) => {
      if (!workspaceId || !items.length) return;
      const path = `users/${workspaceId}/entries`;
      for (let i = 0; i < items.length; i += 400) {
        const chunk = items.slice(i, i + 400);
        const batch = writeBatch(firestore);
        chunk.forEach((raw) => {
          const clean = sanitizeVisa(raw, db.rate);
          const id = safeDocId(clean.id);
          const ref = doc(firestore, 'users', workspaceId, 'entries', id);
          batch.set(ref, {
            ...clean,
            ownerId: workspaceId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        await runOfflineAwareWrite(batch.commit(), OperationType.WRITE, path);
      }
    },
    [workspaceId, db.rate]
  );

  const deleteVisaEntry = useCallback(
    async (id: number) => {
      if (!workspaceId) return;
      const docId = safeDocId(id);
      const path = `users/${workspaceId}/entries/${docId}`;
      await runOfflineAwareWrite(
        deleteDoc(doc(firestore, 'users', workspaceId, 'entries', docId)),
        OperationType.DELETE,
        path
      );
    },
    [workspaceId]
  );

  const deleteAllGroups = useCallback(async () => {
    if (!workspaceId) return;
    const ops: { col: string; id: string }[] = [
      ...entries.map((e) => ({ col: 'entries', id: safeDocId(e.id) })),
      ...cycleOperations.map((o) => ({ col: 'cycleOperations', id: safeDocId(o.id) })),
    ];
    for (let i = 0; i < ops.length; i += 400) {
      const batch = writeBatch(firestore);
      ops.slice(i, i + 400).forEach((op) => {
        batch.delete(doc(firestore, 'users', workspaceId, op.col, op.id));
      });
      await runOfflineAwareWrite(batch.commit(), OperationType.DELETE, `users/${workspaceId}/entries`);
    }
  }, [workspaceId, entries, cycleOperations]);

  const saveTransport = useCallback(
    async (item: TransportEntry, isEdit: boolean) => {
      if (!workspaceId) return;
      const clean = sanitizeTransport(item, db.rate);
      const id = safeDocId(clean.id);
      const path = `users/${workspaceId}/transports/${id}`;
      const ref = doc(firestore, 'users', workspaceId, 'transports', id);
      if (isEdit) {
        const { id: _id, ...mutable } = clean;
        await runOfflineAwareWrite(
          updateDoc(ref, { ...mutable, updatedAt: serverTimestamp() }),
          OperationType.UPDATE,
          path
        );
      } else {
        await runOfflineAwareWrite(
          setDoc(ref, {
            ...clean,
            ownerId: workspaceId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          OperationType.CREATE,
          path
        );
      }
    },
    [workspaceId, db.rate]
  );

  const deleteTransport = useCallback(
    async (id: number) => {
      if (!workspaceId) return;
      const docId = safeDocId(id);
      const path = `users/${workspaceId}/transports/${docId}`;
      await runOfflineAwareWrite(
        deleteDoc(doc(firestore, 'users', workspaceId, 'transports', docId)),
        OperationType.DELETE,
        path
      );
    },
    [workspaceId]
  );

  const deleteTransportsBatch = useCallback(
    async (ids: number[]) => {
      if (!workspaceId || ids.length === 0) return;
      const uniqueIds = Array.from(new Set(ids.map((id) => safeDocId(id)).filter(Boolean)));
      const path = `users/${workspaceId}/transports`;
      for (let i = 0; i < uniqueIds.length; i += 400) {
        const batch = writeBatch(firestore);
        uniqueIds.slice(i, i + 400).forEach((docId) => {
          batch.delete(doc(firestore, 'users', workspaceId, 'transports', docId));
        });
        await runOfflineAwareWrite(batch.commit(), OperationType.DELETE, path);
      }
    },
    [workspaceId]
  );

  const importTransportsBatch = useCallback(
    async (items: TransportEntry[], mode: 'append' | 'replace' = 'append') => {
      if (!workspaceId) return;
      const path = `users/${workspaceId}/transports`;
      const ops: Array<{ type: 'delete' | 'set'; id: string; data?: Record<string, unknown> }> = [];

      if (mode === 'replace') {
        transports.forEach((existing) => {
          ops.push({ type: 'delete', id: safeDocId(existing.id) });
        });
      }

      items.forEach((raw) => {
        const clean = sanitizeTransport(raw, db.rate);
        const docId = safeDocId(clean.id);
        ops.push({
          type: 'set',
          id: docId,
          data: {
            ...clean,
            ownerId: workspaceId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        });
      });

      for (let i = 0; i < ops.length; i += 400) {
        const batch = writeBatch(firestore);
        ops.slice(i, i + 400).forEach((op) => {
          const ref = doc(firestore, 'users', workspaceId, 'transports', op.id);
          if (op.type === 'delete') batch.delete(ref);
          else if (op.data) batch.set(ref, op.data);
        });
        await runOfflineAwareWrite(batch.commit(), OperationType.WRITE, path);
      }
    },
    [workspaceId, transports, db.rate]
  );

  const saveHotel = useCallback(
    async (item: HotelBooking, isEdit: boolean) => {
      if (!workspaceId) return;
      const clean = sanitizeHotel(item, db.rate);
      const id = safeDocId(clean.id);
      const path = `users/${workspaceId}/hotels/${id}`;
      const ref = doc(firestore, 'users', workspaceId, 'hotels', id);
      if (isEdit) {
        const { id: _id, ...mutable } = clean;
        await runOfflineAwareWrite(
          updateDoc(ref, { ...mutable, updatedAt: serverTimestamp() }),
          OperationType.UPDATE,
          path
        );
      } else {
        await runOfflineAwareWrite(
          setDoc(ref, {
            ...clean,
            ownerId: workspaceId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          OperationType.CREATE,
          path
        );
      }
    },
    [workspaceId, db.rate]
  );

  const deleteHotel = useCallback(
    async (id: number) => {
      if (!workspaceId) return;
      const docId = safeDocId(id);
      const path = `users/${workspaceId}/hotels/${docId}`;
      await runOfflineAwareWrite(
        deleteDoc(doc(firestore, 'users', workspaceId, 'hotels', docId)),
        OperationType.DELETE,
        path
      );
    },
    [workspaceId]
  );

  const saveVoucher = useCallback(
    async (item: VoucherEntry, isEdit = false, originalNo?: string) => {
      if (!workspaceId) return;
      const clean = sanitizeVoucher(item, db.rate);
      const id = safeDocId(clean.no);
      const path = `users/${workspaceId}/vouchers/${id}`;
      const ref = doc(firestore, 'users', workspaceId, 'vouchers', id);
      if (isEdit) {
        const oldId = originalNo ? safeDocId(originalNo) : id;
        if (oldId !== id) {
          const batch = writeBatch(firestore);
          batch.delete(doc(firestore, 'users', workspaceId, 'vouchers', oldId));
          batch.set(ref, {
            ...clean,
            ownerId: workspaceId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await runOfflineAwareWrite(batch.commit(), OperationType.WRITE, path);
        } else {
          const { no: _no, ...mutable } = clean;
          await runOfflineAwareWrite(
            updateDoc(ref, {
              ...mutable,
              updatedAt: serverTimestamp(),
            }),
            OperationType.UPDATE,
            path
          );
        }
      } else {
        await runOfflineAwareWrite(
          setDoc(ref, {
            ...clean,
            ownerId: workspaceId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          OperationType.CREATE,
          path
        );
      }
    },
    [workspaceId, db.rate]
  );

  const deleteVoucher = useCallback(
    async (no: string) => {
      if (!workspaceId) return;
      const docId = safeDocId(no);
      const path = `users/${workspaceId}/vouchers/${docId}`;
      await runOfflineAwareWrite(
        deleteDoc(doc(firestore, 'users', workspaceId, 'vouchers', docId)),
        OperationType.DELETE,
        path
      );
    },
    [workspaceId]
  );

  const saveTreasuryTx = useCallback(
    async (item: TreasuryEntry, isEdit: boolean) => {
      if (!workspaceId) return;
      const clean = sanitizeTreasury(item, db.rate);
      const id = safeDocId(clean.id);
      const path = `users/${workspaceId}/treasury/${id}`;
      const ref = doc(firestore, 'users', workspaceId, 'treasury', id);
      if (isEdit) {
        const { id: _id, employeeId, amountEGP, amountUSD, ...mutable } = clean;
        await runOfflineAwareWrite(
          updateDoc(ref, {
            ...mutable,
            employeeId: employeeId ? employeeId : deleteField(),
            amountEGP: typeof amountEGP === 'number' ? amountEGP : deleteField(),
            amountUSD: typeof amountUSD === 'number' ? amountUSD : deleteField(),
            updatedAt: serverTimestamp(),
          }),
          OperationType.UPDATE,
          path
        );
      } else {
        await runOfflineAwareWrite(
          setDoc(ref, {
            ...clean,
            ownerId: workspaceId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          OperationType.CREATE,
          path
        );
      }
    },
    [workspaceId, db.rate]
  );

  const deleteTreasuryTx = useCallback(
    async (id: number) => {
      if (!workspaceId) return;
      const docId = safeDocId(id);
      const path = `users/${workspaceId}/treasury/${docId}`;
      const batch = writeBatch(firestore);
      batch.delete(doc(firestore, 'users', workspaceId, 'treasury', docId));
      payroll
        .filter((p) => p.linkedTreasuryId === id)
        .forEach((p) => {
          batch.update(doc(firestore, 'users', workspaceId, 'payroll', safeDocId(p.id)), {
            linkedTreasuryId: deleteField(),
            updatedAt: serverTimestamp(),
          });
        });
      await runOfflineAwareWrite(batch.commit(), OperationType.DELETE, path);
    },
    [workspaceId, payroll]
  );

  const saveEmployee = useCallback(
    async (item: EmployeeRecord, isEdit: boolean) => {
      if (!workspaceId) return;
      const clean = sanitizeEmployee(item);
      const id = safeDocId(clean.id);
      const path = `users/${workspaceId}/employees/${id}`;
      const ref = doc(firestore, 'users', workspaceId, 'employees', id);
      if (isEdit) {
        const { id: _id, salaryDay, ...mutable } = clean;
        await runOfflineAwareWrite(
          updateDoc(ref, {
            ...mutable,
            salaryDay: typeof salaryDay === 'number' ? salaryDay : deleteField(),
            updatedAt: serverTimestamp(),
          }),
          OperationType.UPDATE,
          path
        );
      } else {
        await runOfflineAwareWrite(
          setDoc(ref, {
            ...clean,
            ownerId: workspaceId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          OperationType.CREATE,
          path
        );
      }
    },
    [workspaceId]
  );

  const deleteEmployee = useCallback(
    async (id: number) => {
      if (!workspaceId) return;
      const docId = safeDocId(id);
      const path = `users/${workspaceId}/employees/${docId}`;
      await runOfflineAwareWrite(
        deleteDoc(doc(firestore, 'users', workspaceId, 'employees', docId)),
        OperationType.DELETE,
        path
      );
    },
    [workspaceId]
  );

  const savePayroll = useCallback(
    async (item: PayrollRecord, linkedTrs?: TreasuryEntry) => {
      if (!workspaceId) return;
      const cleanPay = sanitizePayroll(item);
      const payId = safeDocId(cleanPay.id);
      const path = `users/${workspaceId}/payroll/${payId}`;
      const batch = writeBatch(firestore);
      if (linkedTrs) {
        const cleanTrs = sanitizeTreasury(linkedTrs, db.rate);
        const trsId = safeDocId(cleanTrs.id);
        batch.set(doc(firestore, 'users', workspaceId, 'treasury', trsId), {
          ...cleanTrs,
          ownerId: workspaceId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      batch.set(doc(firestore, 'users', workspaceId, 'payroll', payId), {
        ...cleanPay,
        ownerId: workspaceId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await runOfflineAwareWrite(batch.commit(), OperationType.CREATE, path);
    },
    [workspaceId, db.rate]
  );

  const deletePayroll = useCallback(
    async (rec: PayrollRecord) => {
      if (!workspaceId) return;
      const payId = safeDocId(rec.id);
      const path = `users/${workspaceId}/payroll/${payId}`;
      const batch = writeBatch(firestore);
      batch.delete(doc(firestore, 'users', workspaceId, 'payroll', payId));
      if (rec.linkedTreasuryId) {
        batch.delete(doc(firestore, 'users', workspaceId, 'treasury', safeDocId(rec.linkedTreasuryId)));
      }
      await runOfflineAwareWrite(batch.commit(), OperationType.DELETE, path);
    },
    [workspaceId]
  );

  const saveCustomerCode = useCallback(
    async (item: CustomerMaster) => {
      if (!workspaceId) return;
      const clean = sanitizeCustomer(item);
      const id = safeDocId(clean.code);
      const path = `users/${workspaceId}/customers/${id}`;
      await runOfflineAwareWrite(
        setDoc(doc(firestore, 'users', workspaceId, 'customers', id), {
          ...clean,
          ownerId: workspaceId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        OperationType.CREATE,
        path
      );
    },
    [workspaceId]
  );

  const saveSupplierCode = useCallback(
    async (item: SupplierMaster) => {
      if (!workspaceId) return;
      const clean = sanitizeSupplier(item);
      const id = safeDocId(clean.code);
      const path = `users/${workspaceId}/suppliers/${id}`;
      await runOfflineAwareWrite(
        setDoc(doc(firestore, 'users', workspaceId, 'suppliers', id), {
          ...clean,
          ownerId: workspaceId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        OperationType.CREATE,
        path
      );
    },
    [workspaceId]
  );

  const deleteMaster = useCallback(
    async (kind: 'customer' | 'supplier', code: string) => {
      if (!workspaceId) return;
      const col = kind === 'customer' ? 'customers' : 'suppliers';
      const id = safeDocId(code);
      const path = `users/${workspaceId}/${col}/${id}`;
      await runOfflineAwareWrite(
        deleteDoc(doc(firestore, 'users', workspaceId, col, id)),
        OperationType.DELETE,
        path
      );
    },
    [workspaceId]
  );

  const saveCycleOperations = useCallback(
    async (groupNo: string, opsInput: CycleOperation[], syncToTransport: boolean): Promise<number> => {
      if (!workspaceId) return 0;
      const entry = entries.find((e) => e.groupNo === groupNo);
      const batch = writeBatch(firestore);
      let syncedCount = 0;
      let trnBase = Date.now();
      let tempTransports = [...transports];
      const path = `users/${workspaceId}/cycleOperations`;

      try {
        for (const rawOp of opsInput) {
          const prevOp = cycleOperations.find((o) => o.groupNo === groupNo && o.stageKey === rawOp.stageKey);
          const cleanOp = sanitizeCycleOp({
            ...rawOp,
            linkedTransportId: rawOp.linkedTransportId ?? prevOp?.linkedTransportId,
          });
          const opDocId = cycleOpDocId(groupNo, cleanOp.stageKey);
          const opRef = doc(firestore, 'users', workspaceId, 'cycleOperations', opDocId);
          const routeText = cleanOp.routeDetails
            ? `${cleanOp.stageLabel} - ${cleanOp.routeDetails}`
            : cleanOp.stageLabel;

          if (cleanOp.status === 'cancelled' && cleanOp.linkedTransportId) {
            batch.delete(doc(firestore, 'users', workspaceId, 'transports', safeDocId(cleanOp.linkedTransportId)));
            delete cleanOp.linkedTransportId;
          } else if (
            syncToTransport &&
            cleanOp.supplier &&
            (cleanOp.buy > 0 || cleanOp.sell > 0) &&
            cleanOp.status !== 'cancelled'
          ) {
            syncedCount++;
            const existingTrn =
              cleanOp.linkedTransportId && tempTransports.find((x) => x.id === cleanOp.linkedTransportId);
            if (existingTrn) {
              const updatedTrn = sanitizeTransport(
                {
                  ...existingTrn,
                  date: cleanOp.date || existingTrn.date,
                  route: routeText,
                  vehicleType: cleanOp.vehicleType,
                  vehicleCount: cleanOp.vehicleCount,
                  customer: cleanOp.customer || existingTrn.customer || entry?.customer || '',
                  supplier: cleanOp.supplier,
                  buy: cleanOp.buy,
                  sell: cleanOp.sell,
                  driverName: cleanOp.driverName,
                  plateNo: cleanOp.plateNo,
                  notes: cleanOp.notes,
                },
                db.rate
              );
              const { id: _id, ...mutable } = updatedTrn;
              batch.update(doc(firestore, 'users', workspaceId, 'transports', safeDocId(existingTrn.id)), {
                ...mutable,
                updatedAt: serverTimestamp(),
              });
            } else {
              const newId = ++trnBase;
              const refNo = nextTrnRef({ ...db, transports: tempTransports });
              const newTrn = sanitizeTransport(
                {
                  id: newId,
                  refNo,
                  groupNo,
                  date: cleanOp.date || entry?.date || today(),
                  route: routeText,
                  vehicleType: cleanOp.vehicleType,
                  vehicleCount: cleanOp.vehicleCount,
                  pax: entry?.pax || 0,
                  customer: cleanOp.customer || entry?.customer || '',
                  supplier: cleanOp.supplier,
                  currency: 'SAR',
                  buy: cleanOp.buy,
                  sell: cleanOp.sell,
                  rate: db.rate,
                  driverName: cleanOp.driverName,
                  plateNo: cleanOp.plateNo,
                  notes: cleanOp.notes,
                },
                db.rate
              );
              tempTransports.push(newTrn);
              batch.set(doc(firestore, 'users', workspaceId, 'transports', safeDocId(newId)), {
                ...newTrn,
                ownerId: workspaceId,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
              cleanOp.linkedTransportId = newId;
            }
          }

          if (prevOp) {
            const { id: _id, linkedTransportId, ...mutable } = cleanOp;
            batch.update(opRef, {
              ...mutable,
              linkedTransportId: linkedTransportId ? linkedTransportId : deleteField(),
              updatedAt: serverTimestamp(),
            });
          } else {
            batch.set(opRef, {
              ...cleanOp,
              ownerId: workspaceId,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }

        await runOfflineAwareWrite(batch.commit(), OperationType.WRITE, path);
        return syncedCount;
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    },
    [workspaceId, entries, transports, cycleOperations, db]
  );

  const saveCycleOperation = useCallback(
    async (item: CycleOperation, isEdit: boolean) => {
      if (!workspaceId) return;
      const clean = sanitizeCycleOp(item);
      const docId = safeDocId(clean.id);
      const path = `users/${workspaceId}/cycleOperations/${docId}`;
      const ref = doc(firestore, 'users', workspaceId, 'cycleOperations', docId);
      if (isEdit) {
        const { id: _id, linkedTransportId, ...mutable } = clean;
        await runOfflineAwareWrite(
          updateDoc(ref, {
            ...mutable,
            linkedTransportId: linkedTransportId ? linkedTransportId : deleteField(),
            updatedAt: serverTimestamp(),
          }),
          OperationType.UPDATE,
          path
        );
      } else {
        await runOfflineAwareWrite(
          setDoc(ref, {
            ...clean,
            ownerId: workspaceId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          OperationType.CREATE,
          path
        );
      }
    },
    [workspaceId]
  );

  const importCycleOperationsBatch = useCallback(
    async (items: CycleOperation[], mode: 'append' | 'replace' = 'append') => {
      if (!workspaceId) return;
      const path = `users/${workspaceId}/cycleOperations`;
      const ops: Array<{ type: 'delete' | 'set'; id: string; data?: Record<string, unknown> }> = [];

      if (mode === 'replace') {
        cycleOperations.forEach((existing) => {
          ops.push({ type: 'delete', id: safeDocId(existing.id) });
        });
      }

      items.forEach((raw) => {
        const clean = sanitizeCycleOp(raw);
        const docId = safeDocId(clean.id);
        ops.push({
          type: 'set',
          id: docId,
          data: {
            ...clean,
            id: docId,
            ownerId: workspaceId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        });
      });

      for (let i = 0; i < ops.length; i += 400) {
        const batch = writeBatch(firestore);
        ops.slice(i, i + 400).forEach((op) => {
          const ref = doc(firestore, 'users', workspaceId, 'cycleOperations', op.id);
          if (op.type === 'delete') batch.delete(ref);
          else if (op.data) batch.set(ref, op.data);
        });
        await runOfflineAwareWrite(batch.commit(), OperationType.WRITE, path);
      }
    },
    [workspaceId, cycleOperations]
  );

  const deleteCycleOperation = useCallback(
    async (id: string) => {
      if (!workspaceId) return;
      const docId = safeDocId(id);
      const path = `users/${workspaceId}/cycleOperations/${docId}`;
      await runOfflineAwareWrite(
        deleteDoc(doc(firestore, 'users', workspaceId, 'cycleOperations', docId)),
        OperationType.DELETE,
        path
      );
    },
    [workspaceId]
  );

  const deleteCycleOperationsBatch = useCallback(
    async (ids: string[]) => {
      if (!workspaceId || ids.length === 0) return;
      const uniqueIds = Array.from(new Set(ids.map((id) => safeDocId(id)).filter(Boolean)));
      const path = `users/${workspaceId}/cycleOperations`;
      for (let i = 0; i < uniqueIds.length; i += 400) {
        const batch = writeBatch(firestore);
        uniqueIds.slice(i, i + 400).forEach((docId) => {
          batch.delete(doc(firestore, 'users', workspaceId, 'cycleOperations', docId));
        });
        await runOfflineAwareWrite(batch.commit(), OperationType.DELETE, path);
      }
    },
    [workspaceId]
  );

  const saveInvoice = useCallback(
    async (item: GroupInvoice, isEdit: boolean) => {
      if (!workspaceId) return;
      const clean = sanitizeInvoice(item);
      const id = safeDocId(clean.id);
      const path = `users/${workspaceId}/invoices/${id}`;
      const ref = doc(firestore, 'users', workspaceId, 'invoices', id);
      if (isEdit) {
        const { id: _id, dueDate, paymentStatus, ...mutable } = clean;
        await runOfflineAwareWrite(
          updateDoc(ref, {
            ...mutable,
            dueDate: dueDate ? dueDate : deleteField(),
            paymentStatus: paymentStatus ? paymentStatus : deleteField(),
            updatedAt: serverTimestamp(),
          }),
          OperationType.UPDATE,
          path
        );
      } else {
        await runOfflineAwareWrite(
          setDoc(ref, {
            ...clean,
            ownerId: workspaceId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          OperationType.CREATE,
          path
        );
      }
    },
    [workspaceId]
  );

  const deleteInvoice = useCallback(
    async (id: number) => {
      if (!workspaceId) return;
      const docId = safeDocId(id);
      const path = `users/${workspaceId}/invoices/${docId}`;
      await runOfflineAwareWrite(
        deleteDoc(doc(firestore, 'users', workspaceId, 'invoices', docId)),
        OperationType.DELETE,
        path
      );
    },
    [workspaceId]
  );

  // --- Umrah 1448 CRUD Actions ---
  const saveUmrahAgent = useCallback(
    async (item: UmrahAgent, isEdit: boolean) => {
      if (!workspaceId) return;
      const clean = sanitizeUmrahAgent(item);
      const id = safeDocId(clean.id);
      const path = `users/${workspaceId}/umrahAgents/${id}`;
      const ref = doc(firestore, 'users', workspaceId, 'umrahAgents', id);
      if (isEdit) {
        const { id: _id, ...mutable } = clean;
        await runOfflineAwareWrite(
          updateDoc(ref, { ...mutable, updatedAt: serverTimestamp() }),
          OperationType.UPDATE,
          path
        );
      } else {
        await runOfflineAwareWrite(
          setDoc(ref, {
            ...clean,
            ownerId: workspaceId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          OperationType.CREATE,
          path
        );
      }
    },
    [workspaceId]
  );

  const deleteUmrahAgent = useCallback(
    async (id: number) => {
      if (!workspaceId) return;
      const docId = safeDocId(id);
      const path = `users/${workspaceId}/umrahAgents/${docId}`;
      await runOfflineAwareWrite(
        deleteDoc(doc(firestore, 'users', workspaceId, 'umrahAgents', docId)),
        OperationType.DELETE,
        path
      );
    },
    [workspaceId]
  );

  const saveUmrahGroup = useCallback(
    async (item: UmrahGroup, isEdit: boolean) => {
      if (!workspaceId) return;
      const clean = sanitizeUmrahGroup(item);
      const id = safeDocId(clean.id);
      const path = `users/${workspaceId}/umrahGroups/${id}`;
      const ref = doc(firestore, 'users', workspaceId, 'umrahGroups', id);
      if (isEdit) {
        const { id: _id, ...mutable } = clean;
        await runOfflineAwareWrite(
          updateDoc(ref, { ...mutable, updatedAt: serverTimestamp() }),
          OperationType.UPDATE,
          path
        );
      } else {
        await runOfflineAwareWrite(
          setDoc(ref, {
            ...clean,
            ownerId: workspaceId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          OperationType.CREATE,
          path
        );
      }
    },
    [workspaceId]
  );

  const deleteUmrahGroup = useCallback(
    async (id: number) => {
      if (!workspaceId) return;
      const docId = safeDocId(id);
      const path = `users/${workspaceId}/umrahGroups/${docId}`;
      await runOfflineAwareWrite(
        deleteDoc(doc(firestore, 'users', workspaceId, 'umrahGroups', docId)),
        OperationType.DELETE,
        path
      );
    },
    [workspaceId]
  );

  const saveUmrahPilgrim = useCallback(
    async (item: UmrahPilgrim, isEdit: boolean) => {
      if (!workspaceId) return;
      const clean = sanitizeUmrahPilgrim(item);
      const id = safeDocId(clean.id);
      const path = `users/${workspaceId}/umrahPilgrims/${id}`;
      const ref = doc(firestore, 'users', workspaceId, 'umrahPilgrims', id);
      if (isEdit) {
        const { id: _id, ...mutable } = clean;
        await runOfflineAwareWrite(
          updateDoc(ref, { ...mutable, updatedAt: serverTimestamp() }),
          OperationType.UPDATE,
          path
        );
      } else {
        await runOfflineAwareWrite(
          setDoc(ref, {
            ...clean,
            ownerId: workspaceId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          OperationType.CREATE,
          path
        );
      }
    },
    [workspaceId]
  );

  const importUmrahPilgrimsBatch = useCallback(
    async (items: UmrahPilgrim[]) => {
      if (!workspaceId || !items.length) return;
      const path = `users/${workspaceId}/umrahPilgrims`;
      for (let i = 0; i < items.length; i += 400) {
        const chunk = items.slice(i, i + 400);
        const batch = writeBatch(firestore);
        chunk.forEach((raw) => {
          const clean = sanitizeUmrahPilgrim(raw);
          const id = safeDocId(clean.id);
          const ref = doc(firestore, 'users', workspaceId, 'umrahPilgrims', id);
          batch.set(ref, {
            ...clean,
            ownerId: workspaceId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        await runOfflineAwareWrite(batch.commit(), OperationType.WRITE, path);
      }
    },
    [workspaceId]
  );

  const deleteUmrahPilgrim = useCallback(
    async (id: number) => {
      if (!workspaceId) return;
      const docId = safeDocId(id);
      const path = `users/${workspaceId}/umrahPilgrims/${docId}`;
      await runOfflineAwareWrite(
        deleteDoc(doc(firestore, 'users', workspaceId, 'umrahPilgrims', docId)),
        OperationType.DELETE,
        path
      );
    },
    [workspaceId]
  );

  const saveUmrahFlight = useCallback(
    async (item: UmrahFlight, isEdit: boolean) => {
      if (!workspaceId) return;
      const clean = sanitizeUmrahFlight(item);
      const id = safeDocId(clean.id);
      const path = `users/${workspaceId}/umrahFlights/${id}`;
      const ref = doc(firestore, 'users', workspaceId, 'umrahFlights', id);
      if (isEdit) {
        const { id: _id, ...mutable } = clean;
        await runOfflineAwareWrite(
          updateDoc(ref, { ...mutable, updatedAt: serverTimestamp() }),
          OperationType.UPDATE,
          path
        );
      } else {
        await runOfflineAwareWrite(
          setDoc(ref, {
            ...clean,
            ownerId: workspaceId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          OperationType.CREATE,
          path
        );
      }
    },
    [workspaceId]
  );

  const deleteUmrahFlight = useCallback(
    async (id: number) => {
      if (!workspaceId) return;
      const docId = safeDocId(id);
      const path = `users/${workspaceId}/umrahFlights/${docId}`;
      await runOfflineAwareWrite(
        deleteDoc(doc(firestore, 'users', workspaceId, 'umrahFlights', docId)),
        OperationType.DELETE,
        path
      );
    },
    [workspaceId]
  );

  const saveUmrahFieldStaff = useCallback(
    async (item: UmrahFieldStaff, isEdit: boolean) => {
      if (!workspaceId) return;
      const clean = sanitizeUmrahFieldStaff(item);
      const id = safeDocId(clean.id);
      const path = `users/${workspaceId}/umrahFieldStaff/${id}`;
      const ref = doc(firestore, 'users', workspaceId, 'umrahFieldStaff', id);
      if (isEdit) {
        const { id: _id, ...mutable } = clean;
        await runOfflineAwareWrite(
          updateDoc(ref, { ...mutable, updatedAt: serverTimestamp() }),
          OperationType.UPDATE,
          path
        );
      } else {
        await runOfflineAwareWrite(
          setDoc(ref, {
            ...clean,
            ownerId: workspaceId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          OperationType.CREATE,
          path
        );
      }
    },
    [workspaceId]
  );

  const deleteUmrahFieldStaff = useCallback(
    async (id: number) => {
      if (!workspaceId) return;
      const docId = safeDocId(id);
      const path = `users/${workspaceId}/umrahFieldStaff/${docId}`;
      await runOfflineAwareWrite(
        deleteDoc(doc(firestore, 'users', workspaceId, 'umrahFieldStaff', docId)),
        OperationType.DELETE,
        path
      );
    },
    [workspaceId]
  );

  const replaceAllData = useCallback(
    async (incomingDb: AccountingDB, clearExistingFirst = true) => {
      if (!workspaceId || !isWorkspaceOwner) return;
      const uid = workspaceId;
      const rate = Number(incomingDb.rate) > 0 ? Number(incomingDb.rate) : 3.75;

      try {
        await updateProfileRate(rate);

        const setMap = new Map<string, { col: string; id: string; data: Record<string, unknown> }>();

        const pushSet = (col: string, id: string, data: object) => {
          setMap.set(`${col}__${id}`, {
            col,
            id,
            data: {
              ...data,
              ownerId: uid,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
          });
        };

        (incomingDb.entries || []).forEach((x) => {
          const clean = sanitizeVisa(x, rate);
          pushSet('entries', safeDocId(clean.id), clean);
        });
        (incomingDb.transports || []).forEach((x) => {
          const clean = sanitizeTransport(x, rate);
          pushSet('transports', safeDocId(clean.id), clean);
        });
        (incomingDb.hotels || []).forEach((x) => {
          const clean = sanitizeHotel(x, rate);
          pushSet('hotels', safeDocId(clean.id), clean);
        });
        (incomingDb.vouchers || []).forEach((x) => {
          const clean = sanitizeVoucher(x, rate);
          pushSet('vouchers', safeDocId(clean.no), clean);
        });
        (incomingDb.treasury || []).forEach((x) => {
          const clean = sanitizeTreasury(x, rate);
          pushSet('treasury', safeDocId(clean.id), clean);
        });
        (incomingDb.employees || []).forEach((x) => {
          const clean = sanitizeEmployee(x);
          pushSet('employees', safeDocId(clean.id), clean);
        });
        (incomingDb.payroll || []).forEach((x) => {
          const clean = sanitizePayroll(x);
          pushSet('payroll', safeDocId(clean.id), clean);
        });
        (incomingDb.customers || []).forEach((x) => {
          const clean = sanitizeCustomer(x);
          pushSet('customers', safeDocId(clean.code), clean);
        });
        (incomingDb.suppliers || []).forEach((x) => {
          const clean = sanitizeSupplier(x);
          pushSet('suppliers', safeDocId(clean.code), clean);
        });
        (incomingDb.cycleOperations || []).forEach((x) => {
          const clean = sanitizeCycleOp(x);
          pushSet('cycleOperations', safeDocId(clean.id), clean);
        });
        (incomingDb.invoices || []).forEach((x) => {
          const clean = sanitizeInvoice(x);
          pushSet('invoices', safeDocId(clean.id), clean);
        });
        (incomingDb.umrahAgents || []).forEach((x) => {
          const clean = sanitizeUmrahAgent(x);
          pushSet('umrahAgents', safeDocId(clean.id), clean);
        });
        (incomingDb.umrahGroups || []).forEach((x) => {
          const clean = sanitizeUmrahGroup(x);
          pushSet('umrahGroups', safeDocId(clean.id), clean);
        });
        (incomingDb.umrahPilgrims || []).forEach((x) => {
          const clean = sanitizeUmrahPilgrim(x);
          pushSet('umrahPilgrims', safeDocId(clean.id), clean);
        });
        (incomingDb.umrahFlights || []).forEach((x) => {
          const clean = sanitizeUmrahFlight(x);
          pushSet('umrahFlights', safeDocId(clean.id), clean);
        });
        (incomingDb.umrahFieldStaff || []).forEach((x) => {
          const clean = sanitizeUmrahFieldStaff(x);
          pushSet('umrahFieldStaff', safeDocId(clean.id), clean);
        });

        const operations: Array<{ type: 'delete' | 'set'; col: string; id: string; data?: Record<string, unknown> }> = [];

        if (clearExistingFirst) {
          const maybeDelete = (col: string, id: string) => {
            if (!setMap.has(`${col}__${id}`)) {
              operations.push({ type: 'delete', col, id });
            }
          };
          entries.forEach((x) => maybeDelete('entries', safeDocId(x.id)));
          transports.forEach((x) => maybeDelete('transports', safeDocId(x.id)));
          hotels.forEach((x) => maybeDelete('hotels', safeDocId(x.id)));
          vouchers.forEach((x) => maybeDelete('vouchers', safeDocId(x.no)));
          treasury.forEach((x) => maybeDelete('treasury', safeDocId(x.id)));
          employees.forEach((x) => maybeDelete('employees', safeDocId(x.id)));
          payroll.forEach((x) => maybeDelete('payroll', safeDocId(x.id)));
          customers.forEach((x) => maybeDelete('customers', safeDocId(x.code)));
          suppliers.forEach((x) => maybeDelete('suppliers', safeDocId(x.code)));
          cycleOperations.forEach((x) => maybeDelete('cycleOperations', safeDocId(x.id)));
          invoices.forEach((x) => maybeDelete('invoices', safeDocId(x.id)));
          umrahAgents.forEach((x) => maybeDelete('umrahAgents', safeDocId(x.id)));
          umrahGroups.forEach((x) => maybeDelete('umrahGroups', safeDocId(x.id)));
          umrahPilgrims.forEach((x) => maybeDelete('umrahPilgrims', safeDocId(x.id)));
          umrahFlights.forEach((x) => maybeDelete('umrahFlights', safeDocId(x.id)));
          umrahFieldStaff.forEach((x) => maybeDelete('umrahFieldStaff', safeDocId(x.id)));
        }

        setMap.forEach((op) => {
          operations.push({ type: 'set', col: op.col, id: op.id, data: op.data });
        });

        for (let i = 0; i < operations.length; i += 400) {
          const batch = writeBatch(firestore);
          operations.slice(i, i + 400).forEach((op) => {
            const ref = doc(firestore, 'users', uid, op.col, op.id);
            if (op.type === 'delete') batch.delete(ref);
            else if (op.data) batch.set(ref, op.data);
          });
          await runOfflineAwareWrite(batch.commit(), OperationType.WRITE, `users/${uid}`);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
      }
    },
    [
      workspaceId,
      isWorkspaceOwner,
      updateProfileRate,
      entries,
      transports,
      hotels,
      vouchers,
      treasury,
      employees,
      payroll,
      customers,
      suppliers,
      cycleOperations,
      invoices,
      umrahAgents,
      umrahGroups,
      umrahPilgrims,
      umrahFlights,
      umrahFieldStaff,
    ]
  );

  const migrateLegacyLocalData = useCallback(async () => {
    if (!legacyLocalData) return;
    await replaceAllData(legacyLocalData, false);
  }, [legacyLocalData, replaceAllData]);

  return {
    db,
    lang,
    loadingData,
    legacyLocalData,
    staffAccounts,
    createStaffAccount,
    updateStaffAccount,
    deleteStaffAccount,
    workspaceInvites,
    createWorkspaceInvite,
    updateWorkspaceInvite,
    deleteWorkspaceInvite,
    saveVisaEntry,
    importVisaEntriesBatch,
    deleteVisaEntry,
    deleteAllGroups,
    saveTransport,
    importTransportsBatch,
    deleteTransport,
    deleteTransportsBatch,
    saveHotel,
    deleteHotel,
    saveVoucher,
    deleteVoucher,
    saveTreasuryTx,
    deleteTreasuryTx,
    saveEmployee,
    deleteEmployee,
    savePayroll,
    deletePayroll,
    saveCustomerCode,
    saveSupplierCode,
    deleteMaster,
    saveCycleOperations,
    saveCycleOperation,
    importCycleOperationsBatch,
    deleteCycleOperation,
    deleteCycleOperationsBatch,
    saveInvoice,
    deleteInvoice,
    saveUmrahAgent,
    deleteUmrahAgent,
    saveUmrahGroup,
    deleteUmrahGroup,
    saveUmrahPilgrim,
    importUmrahPilgrimsBatch,
    deleteUmrahPilgrim,
    saveUmrahFlight,
    deleteUmrahFlight,
    saveUmrahFieldStaff,
    deleteUmrahFieldStaff,
    updateSettingsRate: updateProfileRate,
    importFullBackup: (d: AccountingDB) => replaceAllData(d, true),
    migrateLegacyLocalData,
  };
}
