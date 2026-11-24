import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clipboard,
  FileScan,
  Loader2,
  Plus,
  RotateCw,
  ScanLine,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Lang, UmrahPilgrim } from '../../../types/accounting';
import { bi } from '../../../i18n/translations';
import {
  extractMrzFromText,
  iso3ToNationality,
  parseTd3Mrz,
  preparePassportPayload,
} from '../../../utils/mrzParser';
import {
  btnPrimaryCls,
  btnSecondaryCls,
  btnSoftBlueCls,
  btnSoftRedCls,
  btnTealCls,
} from '../../AccountingUI';

export interface ScannedPassportItem {
  uid: string;
  file?: File;
  fileName: string;
  previewUrl: string;
  status: 'queued' | 'scanning' | 'ready' | 'error';
  statusNote?: string;
  errorMsg?: string;
  mrzLine1: string;
  mrzLine2: string;
  mrzVerified: boolean;
  confidence: string;
  fullName: string;
  arabicName: string;
  passportNo: string;
  nationality: string;
  gender: 'male' | 'female';
  birthDate: string;
  passportExpiry: string;
}

interface Props {
  open: boolean;
  lang: Lang;
  defaultGroupCode: string;
  defaultAgentName: string;
  defaultFeeSAR: number;
  onClose: () => void;
  onFillForm: (data: {
    fullName: string;
    passportNo: string;
    nationality: string;
    gender: 'male' | 'female';
    birthDate: string;
    passportExpiry: string;
    notes?: string;
  }) => void;
  onBatchSave: (items: UmrahPilgrim[]) => Promise<void>;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

function isUnderSixMonths(expiryIso: string): boolean {
  if (!expiryIso || !/^\d{4}-\d{2}-\d{2}$/.test(expiryIso)) return false;
  const exp = new Date(expiryIso + 'T00:00:00Z');
  if (Number.isNaN(exp.getTime())) return false;
  const sixMonths = new Date();
  sixMonths.setUTCMonth(sixMonths.getUTCMonth() + 6);
  return exp < sixMonths;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatScanError(status: number, code: string, rawMsg: string, lang: Lang): string {
  if (status === 429 || code === 'RESOURCE_EXHAUSTED') {
    return bi(
      lang,
      'تم الوصول للحد المجاني لعدد الطلبات في الدقيقة (5 صور/دقيقة). انتظر بضع ثوانٍ واضغط "إعادة المحاولة"، أو قم بترقية مفتاح API من Settings > Secrets لزيادة الحصة.',
      'Free-tier rate limit reached (5 requests/min). Wait a few seconds and click Retry, or add a billing-enabled API key in Settings > Secrets.'
    );
  }
  if (status === 403 || code === 'PERMISSION_DENIED' || code === 'MISSING_API_KEY' || code === 'API_KEY_INVALID') {
    return bi(
      lang,
      'يرجى التحقق من صلاحية مفتاح Gemini API في إعدادات المشروع (Settings > Secrets).',
      'Please verify your Gemini API key in Settings > Secrets.'
    );
  }
  return rawMsg || bi(lang, 'تعذرت قراءة صورة الجواز', 'Failed to scan passport image');
}

export const PassportMrzModal: React.FC<Props> = ({
  open,
  lang,
  defaultGroupCode,
  defaultAgentName,
  defaultFeeSAR,
  onClose,
  onFillForm,
  onBatchSave,
  onToast,
}) => {
  const [items, setItems] = useState<ScannedPassportItem[]>([]);
  const [rawMrzText, setRawMrzText] = useState('');
  const [preferArabicName, setPreferArabicName] = useState(false);
  const [savingBatch, setSavingBatch] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const queueRef = useRef<Array<{ uid: string; file: File; base64: string; mimeType: string }>>([]);
  const runningQueueRef = useRef(false);

  const runSingleScan = useCallback(
    async (entry: { uid: string; file: File; base64: string; mimeType: string }) => {
      const { uid, base64, mimeType } = entry;
      const maxRetries = 2;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        setItems((prev) =>
          prev.map((it) =>
            it.uid === uid
              ? {
                  ...it,
                  status: 'scanning',
                  statusNote:
                    attempt > 0
                      ? bi(lang, `إعادة المحاولة (${attempt}/${maxRetries})...`, `Retrying (${attempt}/${maxRetries})...`)
                      : bi(lang, 'جاري قراءة الـ MRZ...', 'Reading MRZ...'),
                  errorMsg: undefined,
                }
              : it
          )
        );

        try {
          const res = await fetch('/api/passport/read-mrz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64, mimeType }),
          });
          const json = await res.json();

          if (res.status === 429 && attempt < maxRetries) {
            const waitSec = Math.min(18, Math.max(7, Number(json?.retryAfterSeconds || 8)));
            for (let rem = waitSec; rem > 0; rem--) {
              setItems((prev) =>
                prev.map((it) =>
                  it.uid === uid
                    ? {
                        ...it,
                        status: 'scanning',
                        statusNote: bi(
                          lang,
                          `حد الحصة المؤقت — إعادة تلقائية خلال ${rem} ثوانٍ...`,
                          `Rate limit pause — auto-retrying in ${rem}s...`
                        ),
                      }
                    : it
                )
              );
              await sleep(1000);
            }
            continue;
          }

          if (!res.ok || !json?.ok) {
            const friendly = formatScanError(res.status, String(json?.code || ''), String(json?.error || ''), lang);
            setItems((prev) =>
              prev.map((it) =>
                it.uid === uid ? { ...it, status: 'error', statusNote: undefined, errorMsg: friendly } : it
              )
            );
            return;
          }

          const aiData = json.data || {};
          if (!aiData.detected) {
            const notDetectedMsg =
              aiData.notes ||
              bi(lang, 'تعذر العثور على بيانات جواز سفر أو سطر MRZ في الصورة', 'Could not detect passport or MRZ in image');
            setItems((prev) =>
              prev.map((it) =>
                it.uid === uid ? { ...it, status: 'error', statusNote: undefined, errorMsg: notDetectedMsg } : it
              )
            );
            return;
          }

          const line1 = String(aiData.mrzLine1 || '').trim();
          const line2 = String(aiData.mrzLine2 || '').trim();
          const mrzParsed = line1 && line2 ? parseTd3Mrz(line1, line2) : null;

          const mrzVerified = Boolean(mrzParsed?.valid);
          const resolvedPassportNo = (mrzParsed?.checksumDetails.passportOk && mrzParsed.passportNo
            ? mrzParsed.passportNo
            : String(aiData.passportNo || '')
          )
            .trim()
            .toUpperCase();
          const resolvedBirth =
            mrzParsed?.checksumDetails.birthOk && mrzParsed.birthDate
              ? mrzParsed.birthDate
              : String(aiData.birthDate || '').trim();
          const resolvedExpiry =
            mrzParsed?.checksumDetails.expiryOk && mrzParsed.passportExpiry
              ? mrzParsed.passportExpiry
              : String(aiData.passportExpiry || '').trim();
          const resolvedName = (mrzParsed?.fullName && mrzVerified
            ? mrzParsed.fullName
            : String(aiData.fullName || mrzParsed?.fullName || '')
          )
            .replace(/\s+/g, ' ')
            .trim();
          const resolvedArabic = String(aiData.arabicName || '').trim();
          const natCode = mrzParsed?.nationalityCode || String(aiData.nationalityCode || '');
          const resolvedNationality = iso3ToNationality(natCode, lang);
          const resolvedGender: 'male' | 'female' =
            mrzParsed?.gender || (String(aiData.gender || '').toLowerCase() === 'female' ? 'female' : 'male');

          setItems((prev) =>
            prev.map((it) =>
              it.uid === uid
                ? {
                    ...it,
                    status: 'ready',
                    statusNote: undefined,
                    errorMsg: undefined,
                    mrzLine1: mrzParsed?.line1 || line1,
                    mrzLine2: mrzParsed?.line2 || line2,
                    mrzVerified,
                    confidence: String(aiData.confidence || 'medium'),
                    fullName: resolvedName,
                    arabicName: resolvedArabic,
                    passportNo: resolvedPassportNo,
                    nationality: resolvedNationality,
                    gender: resolvedGender,
                    birthDate: resolvedBirth,
                    passportExpiry: resolvedExpiry,
                  }
                : it
            )
          );
          return;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : bi(lang, 'فشلت قراءة الصورة', 'Scan failed');
          setItems((prev) =>
            prev.map((it) =>
              it.uid === uid ? { ...it, status: 'error', statusNote: undefined, errorMsg: msg } : it
            )
          );
          return;
        }
      }
    },
    [lang]
  );

  const processQueue = useCallback(async () => {
    if (runningQueueRef.current) return;
    runningQueueRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const next = queueRef.current.shift();
        if (!next) continue;
        await runSingleScan(next);
        // Slight pacing between consecutive images to respect API RPM limits
        if (queueRef.current.length > 0) {
          await sleep(1200);
        }
      }
    } finally {
      runningQueueRef.current = false;
    }
  }, [runSingleScan]);

  const enqueueFiles = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files || files.length === 0) return;
      for (const file of Array.from(files)) {
        const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const prep = await preparePassportPayload(file);
        setItems((prev) => [
          {
            uid,
            file,
            fileName: file.name || 'passport-image',
            previewUrl: prep.previewUrl,
            status: 'queued',
            statusNote: bi(lang, 'في قائمة الانتظار...', 'Queued...'),
            mrzLine1: '',
            mrzLine2: '',
            mrzVerified: false,
            confidence: '',
            fullName: '',
            arabicName: '',
            passportNo: '',
            nationality: lang === 'ar' ? 'مصري' : 'Egyptian',
            gender: 'male',
            birthDate: '',
            passportExpiry: '',
          },
          ...prev,
        ]);
        queueRef.current.push({ uid, file, base64: prep.base64, mimeType: prep.mimeType });
      }
      void processQueue();
    },
    [lang, processQueue]
  );

  const retryItem = async (it: ScannedPassportItem) => {
    if (!it.file) return;
    const prep = await preparePassportPayload(it.file);
    setItems((prev) =>
      prev.map((x) =>
        x.uid === it.uid
          ? { ...x, status: 'queued', statusNote: bi(lang, 'في قائمة الانتظار...', 'Queued...'), errorMsg: undefined }
          : x
      )
    );
    queueRef.current.push({ uid: it.uid, file: it.file, base64: prep.base64, mimeType: prep.mimeType });
    void processQueue();
  };

  // Support Ctrl+V image paste while modal is open
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const clipFiles = e.clipboardData?.files;
      if (clipFiles && clipFiles.length > 0) {
        e.preventDefault();
        void enqueueFiles(clipFiles);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [open, enqueueFiles]);

  const handleParseRawMrz = () => {
    const parsed = extractMrzFromText(rawMrzText);
    if (!parsed) {
      onToast(
        bi(lang, 'يرجى لصق سطرَي MRZ صحيحين (44 حرفاً لكل سطر يبدأ بـ P<)', 'Please paste valid 2-line TD3 MRZ text'),
        'error'
      );
      return;
    }
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setItems((prev) => [
      {
        uid,
        fileName: 'MRZ Text Input',
        previewUrl: '',
        status: 'ready',
        mrzLine1: parsed.line1,
        mrzLine2: parsed.line2,
        mrzVerified: parsed.valid,
        confidence: parsed.valid ? 'high' : 'medium',
        fullName: parsed.fullName,
        arabicName: '',
        passportNo: parsed.passportNo,
        nationality: iso3ToNationality(parsed.nationalityCode, lang),
        gender: parsed.gender,
        birthDate: parsed.birthDate,
        passportExpiry: parsed.passportExpiry,
      },
      ...prev,
    ]);
    setRawMrzText('');
    onToast(bi(lang, 'تم تحليل سطري MRZ وإضافة البيانات بنجاح', 'MRZ lines parsed successfully'));
  };

  const updateItemField = <K extends keyof ScannedPassportItem>(
    uid: string,
    key: K,
    value: ScannedPassportItem[K]
  ) => {
    setItems((prev) => prev.map((it) => (it.uid === uid ? { ...it, [key]: value } : it)));
  };

  const handleApplySingle = (it: ScannedPassportItem) => {
    const chosenName = preferArabicName && it.arabicName ? it.arabicName : it.fullName || it.arabicName;
    if (!chosenName || !it.passportNo) {
      onToast(bi(lang, 'الاسم ورقم الجواز مطلوبان للتعبئة', 'Name and Passport # required'), 'error');
      return;
    }
    onFillForm({
      fullName: chosenName,
      passportNo: it.passportNo.toUpperCase(),
      nationality: it.nationality,
      gender: it.gender,
      birthDate: it.birthDate,
      passportExpiry: it.passportExpiry,
      notes: it.arabicName && chosenName !== it.arabicName ? `${it.arabicName}` : undefined,
    });
    onClose();
  };

  const readyItems = items.filter((it) => it.status === 'ready' && (it.fullName || it.arabicName) && it.passportNo);

  const handleBatchSaveAll = async () => {
    if (readyItems.length === 0) return;
    setSavingBatch(true);
    try {
      let baseId = Date.now();
      const pilgrimsToSave: UmrahPilgrim[] = readyItems.map((it) => {
        const chosenName = (preferArabicName && it.arabicName ? it.arabicName : it.fullName || it.arabicName).trim();
        return {
          id: ++baseId,
          fullName: chosenName,
          gender: it.gender,
          nationality: it.nationality || (lang === 'ar' ? 'مصري' : 'Egyptian'),
          passportNo: it.passportNo.trim().toUpperCase(),
          passportExpiry: it.passportExpiry,
          birthDate: it.birthDate,
          phone: '',
          groupCode: defaultGroupCode || 'UMR-1448-001',
          agentName: defaultAgentName || '',
          visaNo: '',
          visaStatus: 'draft',
          visaIssueDate: '',
          makkahHotel: '',
          makkahRoomNo: '',
          madinahHotel: '',
          madinahRoomNo: '',
          jeddahHotel: '',
          jeddahRoomNo: '',
          roomType: 'quad',
          flightNo: '',
          busNo: '',
          arrivalStatus: 'pending',
          feeSAR: Math.max(0, Number(defaultFeeSAR || 0)),
          paidSAR: 0,
          notes: it.arabicName && chosenName !== it.arabicName ? it.arabicName : '',
        };
      });

      await onBatchSave(pilgrimsToSave);
      onToast(
        bi(
          lang,
          `تم تسجيل ${pilgrimsToSave.length} معتمر من مسح الجوازات في المجموعة ${defaultGroupCode}`,
          `Saved ${pilgrimsToSave.length} scanned pilgrims to ${defaultGroupCode}`
        )
      );
      setItems([]);
      onClose();
    } finally {
      setSavingBatch(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="no-print fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-5xl max-h-[92vh] bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#1d4ed8] flex items-center justify-center shrink-0">
              <ScanLine className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {bi(lang, 'نظام قراءة جوازات السفر (Read MRZ Image)', 'Passport MRZ Image & Code Scanner')}
              </h3>
              <p className="text-[11px] text-slate-500">
                {bi(
                  lang,
                  'ارفع صورة جواز واحد أو عدة جوازات دفعة واحدة، أو التقط بالكاميرا، أو الصق صورة (Ctrl+V) لقراءة بيانات MRZ تلقائياً',
                  'Upload one or multiple passport photos, capture via camera, or paste image (Ctrl+V) to extract MRZ data'
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Image Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                void enqueueFiles(e.dataTransfer.files);
              }}
              className={`lg:col-span-7 border-2 border-dashed rounded-2xl p-5 flex flex-col items-center justify-center text-center transition ${
                dragActive ? 'border-[#1d4ed8] bg-blue-50/60' : 'border-slate-300 bg-slate-50/60'
              }`}
            >
              <FileScan className="w-8 h-8 text-[#1d4ed8] mb-2" />
              <div className="text-xs font-bold text-slate-800">
                {bi(
                  lang,
                  'اسحب وأفلت صور جوازات السفر هنا (أو اضغط Ctrl+V للصق صورة)',
                  'Drag & drop passport images here (or Ctrl+V to paste)'
                )}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 mb-3">
                {bi(lang, 'يدعم JPG, PNG, WEBP, PDF — صورة واحدة أو دفعة جوازات', 'Supports JPG, PNG, WEBP, PDF — single or batch')}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={btnPrimaryCls}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{bi(lang, 'اختيار صور الجوازات', 'Select Passport Images')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className={btnTealCls}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{bi(lang, 'تصوير بالكاميرا', 'Camera Scan')}</span>
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  void enqueueFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  void enqueueFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>

            {/* Direct 2-line MRZ Text Input */}
            <div className="lg:col-span-5 border border-slate-200 rounded-2xl p-4 bg-white flex flex-col justify-between space-y-2.5">
              <div>
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Clipboard className="w-3.5 h-3.5 text-[#0f766e]" />
                  <span>{bi(lang, 'قراءة نص سطرَي MRZ مباشرة (اختياري)', 'Direct 2-Line MRZ Text Parser')}</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {bi(
                    lang,
                    'إذا كان لديك جهاز قارئ جوازات سلكي أو نص الـ MRZ (44 حرفاً × سطرين):',
                    'For hardware passport wedge readers or raw TD3 MRZ text:'
                  )}
                </p>
              </div>
              <textarea
                rows={3}
                dir="ltr"
                value={rawMrzText}
                onChange={(e) => setRawMrzText(e.target.value)}
                placeholder={'P<EGYAHMED<<MOHAMED<ALI<<<<<<<<<<<<<<<<<<<<<\nA123456789EGY8503124M3005158<<<<<<<<<<<<<<04'}
                className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-[11px] font-mono-num uppercase focus:outline-none focus:border-[#1d4ed8]"
              />
              <button type="button" onClick={handleParseRawMrz} className={btnSecondaryCls}>
                <ScanLine className="w-3.5 h-3.5" />
                <span>{bi(lang, 'تحليل سطري MRZ', 'Parse MRZ Lines')}</span>
              </button>
            </div>
          </div>

          {/* Options Bar */}
          {items.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div className="flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={preferArabicName}
                    onChange={(e) => setPreferArabicName(e.target.checked)}
                  />
                  <span>
                    {bi(
                      lang,
                      'استخدام الاسم العربي (إن وجد بالجواز) بدلاً من الإنجليزي',
                      'Prefer printed Arabic name when available'
                    )}
                  </span>
                </label>
              </div>
              <div className="text-[11px] text-slate-500 font-mono-num">
                {bi(lang, 'المجموعة المستهدفة للاستيراد الجماعي:', 'Target Group:')}{' '}
                <strong className="text-[#1d4ed8]">{defaultGroupCode}</strong>
              </div>
            </div>
          )}

          {/* Scanned Passports Results */}
          {items.length > 0 && (
            <div className="space-y-2.5">
              {items.map((it) => {
                const shortExpiry = it.status === 'ready' && isUnderSixMonths(it.passportExpiry);
                return (
                  <div
                    key={it.uid}
                    className={`border rounded-xl p-3.5 ${
                      it.status === 'error'
                        ? 'border-red-200 bg-red-50/40'
                        : shortExpiry
                          ? 'border-amber-300 bg-amber-50/30'
                          : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      {it.previewUrl ? (
                        <img
                          src={it.previewUrl}
                          alt={it.fileName}
                          className="w-20 h-16 object-cover rounded-lg border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-20 h-16 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                          <ScanLine className="w-5 h-5" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-semibold text-slate-700 truncate max-w-48">{it.fileName}</span>
                            {(it.status === 'scanning' || it.status === 'queued') && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-[#1d4ed8] text-[11px] font-semibold">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>{it.statusNote || bi(lang, 'جاري قراءة الـ MRZ...', 'Reading MRZ...')}</span>
                              </span>
                            )}
                            {it.status === 'ready' && it.mrzVerified && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 text-[#0f766e] text-[11px] font-semibold">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>{bi(lang, 'MRZ موثق حسابياً', 'MRZ Checksum Verified')}</span>
                              </span>
                            )}
                            {it.status === 'ready' && !it.mrzVerified && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 text-[11px] font-semibold">
                                <AlertTriangle className="w-3 h-3" />
                                <span>{bi(lang, 'تحقق من الحقول يدوياً', 'Verify Fields')}</span>
                              </span>
                            )}
                            {shortExpiry && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-100 text-red-700 text-[11px] font-semibold">
                                {bi(lang, 'تنبيه: صلاحية الجواز أقل من 6 أشهر', 'Alert: Expiry < 6 months')}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {it.status === 'error' && it.file && (
                              <button
                                type="button"
                                onClick={() => void retryItem(it)}
                                className={btnSoftBlueCls}
                              >
                                <RotateCw className="w-3 h-3" />
                                <span>{bi(lang, 'إعادة المحاولة', 'Retry')}</span>
                              </button>
                            )}
                            {it.status === 'ready' && (
                              <button
                                type="button"
                                onClick={() => handleApplySingle(it)}
                                className={btnSoftBlueCls}
                              >
                                <Plus className="w-3 h-3" />
                                <span>{bi(lang, 'تعبئة في النموذج', 'Fill Form')}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setItems((prev) => prev.filter((x) => x.uid !== it.uid))}
                              className={btnSoftRedCls}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {it.status === 'error' && (
                          <div className="text-xs text-red-700 font-medium leading-relaxed">{it.errorMsg}</div>
                        )}

                        {it.status === 'ready' && (
                          <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 text-xs">
                              <div className="lg:col-span-2">
                                <div className="text-[10px] text-slate-500 mb-0.5">
                                  {bi(lang, 'الاسم الإنجليزي (MRZ)', 'Full Name (MRZ)')}
                                </div>
                                <input
                                  type="text"
                                  dir="ltr"
                                  value={it.fullName}
                                  onChange={(e) => updateItemField(it.uid, 'fullName', e.target.value)}
                                  className="w-full h-8 px-2 rounded-lg border border-slate-200 text-xs font-mono-num uppercase"
                                />
                              </div>
                              <div>
                                <div className="text-[10px] text-slate-500 mb-0.5">
                                  {bi(lang, 'رقم الجواز', 'Passport #')}
                                </div>
                                <input
                                  type="text"
                                  dir="ltr"
                                  value={it.passportNo}
                                  onChange={(e) => updateItemField(it.uid, 'passportNo', e.target.value.toUpperCase())}
                                  className="w-full h-8 px-2 rounded-lg border border-slate-200 text-xs font-mono-num uppercase font-bold"
                                />
                              </div>
                              <div>
                                <div className="text-[10px] text-slate-500 mb-0.5">
                                  {bi(lang, 'الجنسية / النوع', 'Nationality / Sex')}
                                </div>
                                <div className="grid grid-cols-2 gap-1">
                                  <input
                                    type="text"
                                    value={it.nationality}
                                    onChange={(e) => updateItemField(it.uid, 'nationality', e.target.value)}
                                    className="h-8 px-1.5 rounded-lg border border-slate-200 text-xs"
                                  />
                                  <select
                                    value={it.gender}
                                    onChange={(e) =>
                                      updateItemField(it.uid, 'gender', e.target.value as 'male' | 'female')
                                    }
                                    className="h-8 px-1 rounded-lg border border-slate-200 text-xs bg-white"
                                  >
                                    <option value="male">{bi(lang, 'ذكر', 'M')}</option>
                                    <option value="female">{bi(lang, 'أنثى', 'F')}</option>
                                  </select>
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] text-slate-500 mb-0.5">
                                  {bi(lang, 'تاريخ الميلاد', 'Birth Date')}
                                </div>
                                <input
                                  type="date"
                                  value={it.birthDate}
                                  onChange={(e) => updateItemField(it.uid, 'birthDate', e.target.value)}
                                  className="w-full h-8 px-2 rounded-lg border border-slate-200 text-xs font-mono-num"
                                />
                              </div>
                              <div>
                                <div className="text-[10px] text-slate-500 mb-0.5">
                                  {bi(lang, 'انتهاء الجواز', 'Expiry Date')}
                                </div>
                                <input
                                  type="date"
                                  value={it.passportExpiry}
                                  onChange={(e) => updateItemField(it.uid, 'passportExpiry', e.target.value)}
                                  className="w-full h-8 px-2 rounded-lg border border-slate-200 text-xs font-mono-num"
                                />
                              </div>
                            </div>

                            {(it.arabicName || it.mrzLine1 || it.mrzLine2) && (
                              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-500">
                                {it.arabicName && (
                                  <div>
                                    {bi(lang, 'الاسم بالعربي:', 'Arabic Name:')}{' '}
                                    <strong className="text-slate-800">{it.arabicName}</strong>
                                  </div>
                                )}
                                {(it.mrzLine1 || it.mrzLine2) && (
                                  <div dir="ltr" className="font-mono-num text-[10px] bg-slate-100 px-2 py-1 rounded truncate max-w-full">
                                    {it.mrzLine1} | {it.mrzLine2}
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500 font-mono-num">
            {bi(lang, `الجاهز للاستيراد: ${readyItems.length}`, `Ready to save: ${readyItems.length}`)}
          </div>
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  queueRef.current = [];
                  setItems([]);
                }}
                className={btnSecondaryCls}
              >
                {bi(lang, 'مسح الكل', 'Clear List')}
              </button>
            )}
            <button type="button" onClick={onClose} className={btnSecondaryCls}>
              {bi(lang, 'إغلاق', 'Close')}
            </button>
            {readyItems.length > 0 && (
              <button
                type="button"
                disabled={savingBatch}
                onClick={() => void handleBatchSaveAll()}
                className={btnTealCls}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  {savingBatch
                    ? bi(lang, 'جاري الحفظ...', 'Saving...')
                    : bi(
                        lang,
                        `حفظ (${readyItems.length}) معتمر بالمجموعة`,
                        `Save ${readyItems.length} Pilgrims to Group`
                      )}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
