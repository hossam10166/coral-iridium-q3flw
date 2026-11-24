import { Lang } from '../types/accounting';

export interface ParsedMrzResult {
  valid: boolean;
  checksumDetails: {
    passportOk: boolean;
    birthOk: boolean;
    expiryOk: boolean;
    compositeOk: boolean;
  };
  line1: string;
  line2: string;
  fullName: string;
  surname: string;
  givenNames: string;
  passportNo: string;
  issuingCountryCode: string;
  nationalityCode: string;
  birthDate: string;
  passportExpiry: string;
  gender: 'male' | 'female';
  personalNumber: string;
}

const ISO3_NATIONALITY_MAP: Record<string, { ar: string; en: string }> = {
  EGY: { ar: 'مصري', en: 'Egyptian' },
  SAU: { ar: 'سعودي', en: 'Saudi' },
  IDN: { ar: 'إندونيسي', en: 'Indonesian' },
  PAK: { ar: 'باكستاني', en: 'Pakistani' },
  IND: { ar: 'هندي', en: 'Indian' },
  BGD: { ar: 'بنغلاديشي', en: 'Bangladeshi' },
  MYS: { ar: 'ماليزي', en: 'Malaysian' },
  TUR: { ar: 'تركي', en: 'Turkish' },
  JOR: { ar: 'أردني', en: 'Jordanian' },
  PSE: { ar: 'فلسطيني', en: 'Palestinian' },
  SYR: { ar: 'سوري', en: 'Syrian' },
  LBN: { ar: 'لبناني', en: 'Lebanese' },
  IRQ: { ar: 'عراقي', en: 'Iraqi' },
  YEM: { ar: 'يمني', en: 'Yemeni' },
  SDN: { ar: 'سوداني', en: 'Sudanese' },
  LBY: { ar: 'ليبي', en: 'Libyan' },
  TUN: { ar: 'تونسي', en: 'Tunisian' },
  DZA: { ar: 'جزائري', en: 'Algerian' },
  MAR: { ar: 'مغربي', en: 'Moroccan' },
  MRT: { ar: 'موريتاني', en: 'Mauritanian' },
  ARE: { ar: 'إماراتي', en: 'Emirati' },
  KWT: { ar: 'كويتي', en: 'Kuwaiti' },
  QAT: { ar: 'قطري', en: 'Qatari' },
  BHR: { ar: 'بحريني', en: 'Bahraini' },
  OMN: { ar: 'عماني', en: 'Omani' },
  NGA: { ar: 'نيجيري', en: 'Nigerian' },
  SEN: { ar: 'سنغالي', en: 'Senegalese' },
  SOM: { ar: 'صومالي', en: 'Somali' },
  GBR: { ar: 'بريطاني', en: 'British' },
  USA: { ar: 'أمريكي', en: 'American' },
  CAN: { ar: 'كندي', en: 'Canadian' },
  FRA: { ar: 'فرنسي', en: 'French' },
  DEU: { ar: 'ألماني', en: 'German' },
};

export function iso3ToNationality(code: string, lang: Lang): string {
  const clean = (code || '').replace(/[^A-Z]/gi, '').toUpperCase().slice(0, 3);
  if (!clean) return lang === 'ar' ? 'مصري' : 'Egyptian';
  const found = ISO3_NATIONALITY_MAP[clean];
  if (found) return found[lang];
  return clean;
}

function mrzCharValue(ch: string): number {
  if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48;
  if (ch >= 'A' && ch <= 'Z') return ch.charCodeAt(0) - 55;
  return 0; // '<' or filler
}

export function computeMrzCheckDigit(field: string): string {
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < field.length; i++) {
    sum += mrzCharValue(field[i]) * weights[i % 3];
  }
  return String(sum % 10);
}

function normalizeMrzLine(raw: string): string {
  return (raw || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9<]/g, '<')
    .padEnd(44, '<')
    .slice(0, 44);
}

function parseMrzDate(yymmdd: string, kind: 'birth' | 'expiry'): string {
  if (!/^\d{6}$/.test(yymmdd)) return '';
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return '';

  const currentYY = new Date().getFullYear() % 100;
  let fullYear: number;
  if (kind === 'birth') {
    fullYear = yy > currentYY ? 1900 + yy : 2000 + yy;
  } else {
    // Expiry dates for active/historical passports fall roughly within 1980..2079
    fullYear = yy >= 80 ? 1900 + yy : 2000 + yy;
  }
  return `${fullYear}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

export function parseTd3Mrz(rawLine1: string, rawLine2: string): ParsedMrzResult | null {
  const l1Clean = (rawLine1 || '').toUpperCase().replace(/\s+/g, '');
  const l2Clean = (rawLine2 || '').toUpperCase().replace(/\s+/g, '');
  if (l1Clean.length < 30 || l2Clean.length < 30) return null;

  const line1 = normalizeMrzLine(l1Clean);
  const line2 = normalizeMrzLine(l2Clean);

  const issuingCountryCode = line1.slice(2, 5).replace(/</g, '');
  const nameSection = line1.slice(5);
  const [rawSurname, ...restParts] = nameSection.split('<<');
  const surname = (rawSurname || '').replace(/<+/g, ' ').trim();
  const givenNames = restParts.join(' ').replace(/<+/g, ' ').trim();
  const fullName = [givenNames, surname].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  const passportRaw = line2.slice(0, 9);
  const passportNo = passportRaw.replace(/</g, '').trim();
  const passportCd = line2[9];

  const nationalityCode = line2.slice(10, 13).replace(/</g, '');
  const birthRaw = line2.slice(13, 19);
  const birthCd = line2[19];
  const birthDate = parseMrzDate(birthRaw, 'birth');

  const sexChar = line2[20];
  const gender: 'male' | 'female' = sexChar === 'F' ? 'female' : 'male';

  const expiryRaw = line2.slice(21, 27);
  const expiryCd = line2[27];
  const passportExpiry = parseMrzDate(expiryRaw, 'expiry');

  const personalRaw = line2.slice(28, 42);
  const personalNumber = personalRaw.replace(/</g, '').trim();
  const personalCd = line2[42];
  const compositeCd = line2[43];

  const passportOk = computeMrzCheckDigit(passportRaw) === passportCd;
  const birthOk = /^\d{6}$/.test(birthRaw) && computeMrzCheckDigit(birthRaw) === birthCd;
  const expiryOk = /^\d{6}$/.test(expiryRaw) && computeMrzCheckDigit(expiryRaw) === expiryCd;
  const compositeInput = line2.slice(0, 10) + line2.slice(13, 20) + line2.slice(21, 43);
  const compositeOk =
    computeMrzCheckDigit(compositeInput) === compositeCd &&
    (personalNumber === '' || computeMrzCheckDigit(personalRaw) === personalCd || personalCd === '<');

  const valid = Boolean(passportNo && fullName && passportOk && birthOk && expiryOk);

  return {
    valid,
    checksumDetails: { passportOk, birthOk, expiryOk, compositeOk },
    line1,
    line2,
    fullName,
    surname,
    givenNames,
    passportNo,
    issuingCountryCode,
    nationalityCode,
    birthDate,
    passportExpiry,
    gender,
    personalNumber,
  };
}

export function extractMrzFromText(text: string): ParsedMrzResult | null {
  const lines = (text || '')
    .split(/\r?\n/)
    .map((l) => l.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9<]/g, ''))
    .filter((l) => l.length >= 36);

  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].startsWith('P')) {
      const parsed = parseTd3Mrz(lines[i], lines[i + 1]);
      if (parsed) return parsed;
    }
  }
  if (lines.length >= 2) {
    return parseTd3Mrz(lines[0], lines[1]);
  }
  return null;
}

export async function preparePassportPayload(
  file: File
): Promise<{ base64: string; mimeType: string; previewUrl: string }> {
  if (file.type === 'application/pdf') {
    const dataUrl = await readFileAsDataUrl(file);
    return { base64: dataUrl, mimeType: 'application/pdf', previewUrl: '' };
  }

  const dataUrl = await readFileAsDataUrl(file);
  try {
    const img = await loadImage(dataUrl);
    const maxDim = 1600;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0, width, height);
      const compressed = canvas.toDataURL('image/jpeg', 0.88);
      return { base64: compressed, mimeType: 'image/jpeg', previewUrl: compressed };
    }
  } catch {
    // Fallback to raw data URL if canvas resize fails
  }
  return { base64: dataUrl, mimeType: file.type || 'image/jpeg', previewUrl: dataUrl };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}
