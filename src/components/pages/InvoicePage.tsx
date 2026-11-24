import React, { useEffect, useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';
import {
  CheckCircle2,
  DollarSign,
  Download,
  Edit3,
  FileText,
  Lock,
  Plus,
  Printer,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { AccountingDB, GroupInvoice, Lang } from '../../types/accounting';
import { bi, tKey } from '../../i18n/translations';
import { useAuth } from '../../contexts/AuthContext';
import { csvDownload, fmt, fmtUSD, formatTime24, nextInvRef, sumBy, today } from '../../utils/calculations';
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

const DEFAULT_MINPAX_RATE = 26.67;
const SAR_INVOICE_RATE = 3.76;

interface InvoicePageProps {
  db: AccountingDB;
  lang: Lang;
  onSaveInvoice: (item: GroupInvoice, isEdit: boolean) => Promise<void>;
  onDeleteInvoice: (id: number) => Promise<void>;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
  onConfirm: (cfg: ConfirmConfig) => void;
}

interface ManualSegmentDraft {
  label: string;
  price: string;
}

interface ParsedCustomSegment {
  label: string;
  price: number;
}

function parseInvoiceCustomSegments(inv: GroupInvoice, lang: Lang): ParsedCustomSegment[] {
  const fallbackLabel = bi(lang, 'مقطع يدوي', 'Manual Segment');
  if (inv.customSegmentsJson) {
    try {
      const parsed = JSON.parse(inv.customSegmentsJson);
      if (Array.isArray(parsed)) {
        const list = parsed
          .map((item) => ({
            label: String(item?.label || '').trim() || fallbackLabel,
            price: Math.max(0, Number(item?.price || 0)),
          }))
          .filter((item) => item.price > 0);
        if (list.length > 0) return list;
      }
    } catch {
      // ignore invalid JSON fallback
    }
  }
  const singlePrice = Math.max(0, Number(inv.customSegmentPrice || 0));
  if (singlePrice > 0) {
    return [{ label: (inv.customSegmentLabel || '').trim() || fallbackLabel, price: singlePrice }];
  }
  return [];
}

export const InvoicePage: React.FC<InvoicePageProps> = ({
  db,
  lang,
  onSaveInvoice,
  onDeleteInvoice,
  onToast,
  onConfirm,
}) => {
  const { user, profile, staffAccount, sharedInvite } = useAuth();
  const invoices = db.invoices || [];
  const invoiceBodyRef = useRef<HTMLDivElement | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const printedByLabel = useMemo(() => {
    if (staffAccount) {
      return `${staffAccount.displayName} (@${staffAccount.username})`;
    }
    const name = profile?.displayName || user?.displayName || sharedInvite?.displayName || '';
    return name || bi(lang, 'الإدارة', 'Management');
  }, [staffAccount, profile, user, sharedInvite, lang]);

  const [editId, setEditId] = useState<number | null>(null);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [date, setDate] = useState(today());
  const [groupNo, setGroupNo] = useState('');
  const [groupName, setGroupName] = useState('');
  const [pax, setPax] = useState('');
  const [visaPrice, setVisaPrice] = useState('');
  const [multiEntryVisaCount, setMultiEntryVisaCount] = useState('');
  const [multiEntryVisaPrice, setMultiEntryVisaPrice] = useState('');
  const [minPaxCount, setMinPaxCount] = useState('');
  const [minPaxRate, setMinPaxRate] = useState(String(DEFAULT_MINPAX_RATE));
  const [lockMinPaxRate, setLockMinPaxRate] = useState(true);

  // Extra segments (USD)
  const [badrPrice, setBadrPrice] = useState('');
  const [trainStationPrice, setTrainStationPrice] = useState('');
  const [taifPrice, setTaifPrice] = useState('');
  const [hudaibiyahPrice, setHudaibiyahPrice] = useState('');
  const [manualSegments, setManualSegments] = useState<ManualSegmentDraft[]>([{ label: '', price: '' }]);
  const [notes, setNotes] = useState('');

  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewInv, setPreviewInv] = useState<GroupInvoice | null>(null);

  const effectiveInvNo = editId ? invoiceNo : invoiceNo || nextInvRef(db);

  // Live numeric calculations in USD
  const paxNum = Math.max(0, Math.round(Number(pax || 0)));
  const visaPriceNum = Math.max(0, Number(visaPrice || 0));
  const visaTotalUSD = paxNum * visaPriceNum;

  const multiEntryCountNum = Math.max(0, Math.round(Number(multiEntryVisaCount || 0)));
  const multiEntryPriceNum = Math.max(0, Number(multiEntryVisaPrice || 0));
  const multiEntryTotalUSD = multiEntryCountNum * multiEntryPriceNum;

  const minPaxCountNum = Math.max(0, Math.round(Number(minPaxCount || 0)));
  const minPaxRateNum = Math.max(0, Number(minPaxRate === '' ? DEFAULT_MINPAX_RATE : minPaxRate));
  const minPaxTotalUSD = minPaxCountNum * minPaxRateNum;

  const badrNum = Math.max(0, Number(badrPrice || 0));
  const trainNum = Math.max(0, Number(trainStationPrice || 0));
  const taifNum = Math.max(0, Number(taifPrice || 0));
  const hudaibiyahNum = Math.max(0, Number(hudaibiyahPrice || 0));
  const validManualSegments = manualSegments
    .map((s) => ({
      label: s.label.trim(),
      price: Math.max(0, Number(s.price || 0)),
    }))
    .filter((s) => s.price > 0 || s.label !== '');
  const manualSegmentsTotalUSD = Number(
    sumBy(validManualSegments, (s) => s.price).toFixed(2)
  );
  const extraSegmentsTotalUSD = badrNum + trainNum + taifNum + hudaibiyahNum + manualSegmentsTotalUSD;

  const grandTotalUSD = Number(
    (visaTotalUSD + multiEntryTotalUSD + minPaxTotalUSD + extraSegmentsTotalUSD).toFixed(2)
  );
  const grandTotalSAR = Number((grandTotalUSD * SAR_INVOICE_RATE).toFixed(2));

  useEffect(() => {
    document.body.classList.toggle('printing-invoice', Boolean(previewInv));
    return () => {
      document.body.classList.remove('printing-invoice');
    };
  }, [previewInv]);

  // KPI Aggregates (all USD)
  const totalInvoicesCount = invoices.length;
  const totalVisasUSD = useMemo(
    () =>
      sumBy(
        invoices,
        (inv) =>
          Number(inv.pax || 0) * Number(inv.visaPrice || 0) +
          Number(inv.multiEntryVisaCount || 0) * Number(inv.multiEntryVisaPrice || 0)
      ),
    [invoices]
  );
  const totalMinPaxAndExtraUSD = useMemo(
    () =>
      sumBy(
        invoices,
        (inv) =>
          Number(inv.minPaxCount || 0) * Number(inv.minPaxRate ?? DEFAULT_MINPAX_RATE) +
          Number(inv.badrPrice || 0) +
          Number(inv.trainStationPrice || 0) +
          Number(inv.taifPrice || 0) +
          Number(inv.hudaibiyahPrice || 0) +
          Number(inv.customSegmentPrice || 0)
      ),
    [invoices]
  );
  const totalAllInvoicesUSD = useMemo(() => sumBy(invoices, (inv) => Number(inv.totalUSD || 0)), [invoices]);
  const totalAllInvoicesSAR = Number((totalAllInvoicesUSD * SAR_INVOICE_RATE).toFixed(2));

  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...invoices]
      .reverse()
      .filter(
        (inv) =>
          !q ||
          inv.invoiceNo.toLowerCase().includes(q) ||
          inv.groupNo.toLowerCase().includes(q) ||
          inv.groupName.toLowerCase().includes(q) ||
          (inv.notes || '').toLowerCase().includes(q)
      );
  }, [invoices, search]);

  const handleSelectRegisteredGroup = (selectedGrpNo: string) => {
    if (!selectedGrpNo) return;
    const entry = db.entries.find((e) => e.groupNo === selectedGrpNo);
    if (!entry) return;
    setGroupNo(entry.groupNo);
    if (!groupName.trim()) {
      setGroupName(entry.customer);
    }
    setPax(String(entry.pax));
    // Convert sell price to USD if stored in SAR
    const rate = Number(entry.rate || db.rate || 3.75);
    const usdPerVisa = entry.currency === 'USD' ? entry.sell : entry.sell / (rate > 0 ? rate : 3.75);
    if (usdPerVisa > 0) {
      setVisaPrice(usdPerVisa.toFixed(2));
    }
  };

  const resetForm = () => {
    setEditId(null);
    setInvoiceNo('');
    setDate(today());
    setGroupNo('');
    setGroupName('');
    setPax('');
    setVisaPrice('');
    setMultiEntryVisaCount('');
    setMultiEntryVisaPrice('');
    setMinPaxCount('');
    setMinPaxRate(String(DEFAULT_MINPAX_RATE));
    setLockMinPaxRate(true);
    setBadrPrice('');
    setTrainStationPrice('');
    setTaifPrice('');
    setHudaibiyahPrice('');
    setManualSegments([{ label: '', price: '' }]);
    setNotes('');
  };

  const buildPayloadFromForm = (): GroupInvoice | null => {
    if (!groupNo.trim() || !groupName.trim()) {
      onToast(bi(lang, 'يرجى إدخال رقم المجموعة واسم المجموعة', 'Please enter Group # and Group Name'), 'error');
      return null;
    }
    const pricedManuals = validManualSegments.filter((s) => s.price > 0);
    const customLabel = pricedManuals
      .map((s) => s.label || bi(lang, 'مقطع يدوي', 'Manual Segment'))
      .join(' + ')
      .slice(0, 240);
    const customJson = pricedManuals.length
      ? JSON.stringify(
          pricedManuals.map((s) => ({
            label: (s.label || bi(lang, 'مقطع يدوي', 'Manual Segment')).slice(0, 120),
            price: Number(s.price.toFixed(2)),
          }))
        ).slice(0, 2000)
      : '';
    const existingInv = editId ? invoices.find((x) => x.id === editId) : undefined;
    return {
      id: editId ?? Date.now(),
      invoiceNo: effectiveInvNo.trim() || nextInvRef(db),
      date: date || today(),
      ...(existingInv?.dueDate ? { dueDate: existingInv.dueDate } : {}),
      ...(existingInv?.paymentStatus ? { paymentStatus: existingInv.paymentStatus } : {}),
      groupNo: groupNo.trim(),
      groupName: groupName.trim(),
      pax: paxNum,
      visaPrice: visaPriceNum,
      multiEntryVisaCount: multiEntryCountNum,
      multiEntryVisaPrice: multiEntryPriceNum,
      minPaxCount: minPaxCountNum,
      minPaxRate: minPaxRateNum,
      badrPrice: badrNum,
      trainStationPrice: trainNum,
      taifPrice: taifNum,
      hudaibiyahPrice: hudaibiyahNum,
      customSegmentLabel: customLabel,
      customSegmentPrice: manualSegmentsTotalUSD,
      customSegmentsJson: customJson,
      totalUSD: grandTotalUSD,
      notes: notes.trim(),
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = buildPayloadFromForm();
    if (!payload) return;
    setSaving(true);
    try {
      await onSaveInvoice(payload, Boolean(editId));
      onToast(
        editId
          ? bi(lang, 'تم تحديث الفاتورة بنجاح', 'Invoice updated successfully')
          : bi(lang, 'تم حفظ الفاتورة بالدولار بنجاح', 'USD Invoice saved successfully')
      );
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (inv: GroupInvoice) => {
    setEditId(inv.id);
    setInvoiceNo(inv.invoiceNo);
    setDate(inv.date);
    setGroupNo(inv.groupNo);
    setGroupName(inv.groupName);
    setPax(String(inv.pax));
    setVisaPrice(String(inv.visaPrice));
    setMultiEntryVisaCount(inv.multiEntryVisaCount ? String(inv.multiEntryVisaCount) : '');
    setMultiEntryVisaPrice(inv.multiEntryVisaPrice ? String(inv.multiEntryVisaPrice) : '');
    setMinPaxCount(String(inv.minPaxCount));
    setMinPaxRate(String(inv.minPaxRate ?? DEFAULT_MINPAX_RATE));
    setLockMinPaxRate(Number(inv.minPaxRate ?? DEFAULT_MINPAX_RATE) === DEFAULT_MINPAX_RATE);
    setBadrPrice(inv.badrPrice ? String(inv.badrPrice) : '');
    setTrainStationPrice(inv.trainStationPrice ? String(inv.trainStationPrice) : '');
    setTaifPrice(inv.taifPrice ? String(inv.taifPrice) : '');
    setHudaibiyahPrice(inv.hudaibiyahPrice ? String(inv.hudaibiyahPrice) : '');
    const parsedCustoms = parseInvoiceCustomSegments(inv, lang);
    setManualSegments(
      parsedCustoms.length > 0
        ? parsedCustoms.map((s) => ({ label: s.label, price: String(s.price) }))
        : [{ label: '', price: '' }]
    );
    setNotes(inv.notes || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (inv: GroupInvoice) => {
    onConfirm({
      title: bi(lang, 'حذف فاتورة', 'Delete Invoice'),
      message: bi(
        lang,
        `هل تريد حذف الفاتورة رقم ${inv.invoiceNo} للمجموعة ${inv.groupNo} (${inv.groupName})؟`,
        `Delete invoice ${inv.invoiceNo} for group ${inv.groupNo} (${inv.groupName})?`
      ),
      danger: true,
      onConfirm: async () => {
        await onDeleteInvoice(inv.id);
        if (editId === inv.id) resetForm();
        if (previewInv?.id === inv.id) setPreviewInv(null);
        onToast(bi(lang, 'تم حذف الفاتورة', 'Invoice deleted'));
      },
    });
  };

  const handlePreviewCurrent = () => {
    const payload = buildPayloadFromForm();
    if (!payload) return;
    setPreviewInv(payload);
  };

  const handleDownloadInvoicePdf = async () => {
    if (!previewInv || !invoiceBodyRef.current) return;
    setExportingPdf(true);
    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      const imgs = Array.from(invoiceBodyRef.current.querySelectorAll('img'));
      await Promise.all(
        imgs.map((img) =>
          typeof img.decode === 'function'
            ? img.decode().catch(() => undefined)
            : Promise.resolve()
        )
      );
      const canvas = await html2canvas(invoiceBodyRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const maxW = pdfWidth - margin * 2;
      const maxH = pdfHeight - margin * 2;
      let drawW = maxW;
      let drawH = (canvas.height * drawW) / canvas.width;
      if (drawH > maxH) {
        drawH = maxH;
        drawW = (canvas.width * drawH) / canvas.height;
      }
      const xOffset = (pdfWidth - drawW) / 2;
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', xOffset, margin, drawW, drawH);
      const safePart = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 50);
      pdf.save(`BEST_UNITED_TRAVEL_${safePart(previewInv.invoiceNo)}_${safePart(previewInv.groupNo)}.pdf`);
      onToast(bi(lang, 'تم تحميل الفاتورة PDF بنجاح', 'Invoice PDF downloaded successfully'));
    } catch {
      onToast(bi(lang, 'تعذر إنشاء ملف PDF للفاتورة', 'Failed to export invoice PDF'), 'error');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportCsv = () => {
    const rows: (string | number)[][] = [
      [
        bi(lang, 'رقم الفاتورة', 'Invoice #'),
        bi(lang, 'التاريخ', 'Date'),
        bi(lang, 'رقم المجموعة', 'Group #'),
        bi(lang, 'اسم المجموعة', 'Group Name'),
        bi(lang, 'عدد المعتمرين', 'Pilgrims (Pax)'),
        bi(lang, 'سعر التأشيرة ($)', 'Visa Price (USD)'),
        bi(lang, 'إجمالي التأشيرات ($)', 'Visas Total (USD)'),
        bi(lang, 'عدد Multiple-entry visa', 'Multiple-entry Visa Count'),
        bi(lang, 'سعر Multiple-entry visa ($)', 'Multiple-entry Visa Price (USD)'),
        bi(lang, 'إجمالي Multiple-entry visa ($)', 'Multiple-entry Visa Total (USD)'),
        bi(lang, 'عدد MinPax', 'MinPax Count'),
        bi(lang, 'سعر MinPax ($)', 'MinPax Fixed Rate (USD)'),
        bi(lang, 'إجمالي MinPax ($)', 'MinPax Total (USD)'),
        bi(lang, 'بدر ($)', 'Badr (USD)'),
        bi(lang, 'محطة قطار ($)', 'Train Station (USD)'),
        bi(lang, 'الطائف ($)', 'Taif (USD)'),
        bi(lang, 'حديبية ($)', 'Hudaibiyah (USD)'),
        bi(lang, 'مقطع يدوي', 'Manual Segment'),
        bi(lang, 'سعر المقطع اليدوي ($)', 'Manual Segment (USD)'),
        bi(lang, 'الإجمالي الكلي ($)', 'Grand Total (USD)'),
        bi(lang, 'الإجمالي بالريال', 'Grand Total (SAR)'),
        bi(lang, 'ملاحظات', 'Notes'),
      ],
    ];
    invoices.forEach((inv) => {
      const vTotal = Number(inv.pax || 0) * Number(inv.visaPrice || 0);
      const meCount = Number(inv.multiEntryVisaCount || 0);
      const mePrice = Number(inv.multiEntryVisaPrice || 0);
      const meTotal = meCount * mePrice;
      const mpTotal = Number(inv.minPaxCount || 0) * Number(inv.minPaxRate ?? DEFAULT_MINPAX_RATE);
      const sarTotal = Number(inv.totalUSD || 0) * SAR_INVOICE_RATE;
      rows.push([
        inv.invoiceNo,
        inv.date,
        inv.groupNo,
        inv.groupName,
        inv.pax,
        inv.visaPrice.toFixed(2),
        vTotal.toFixed(2),
        meCount,
        mePrice.toFixed(2),
        meTotal.toFixed(2),
        inv.minPaxCount,
        Number(inv.minPaxRate ?? DEFAULT_MINPAX_RATE).toFixed(2),
        mpTotal.toFixed(2),
        Number(inv.badrPrice || 0).toFixed(2),
        Number(inv.trainStationPrice || 0).toFixed(2),
        Number(inv.taifPrice || 0).toFixed(2),
        Number(inv.hudaibiyahPrice || 0).toFixed(2),
        inv.customSegmentLabel || '',
        Number(inv.customSegmentPrice || 0).toFixed(2),
        Number(inv.totalUSD || 0).toFixed(2),
        sarTotal.toFixed(2),
        inv.notes || '',
      ]);
    });
    csvDownload(`invoices-usd-${today()}.csv`, rows);
    onToast(bi(lang, 'تم تصدير سجل الفواتير بالدولار بنجاح', 'USD invoices exported'));
  };

  const extraSegments = [
    {
      key: 'badr',
      ar: 'بدر',
      en: 'Badr',
      hintAr: 'مقطع زيارة بدر',
      hintEn: 'Badr Ziyarat segment',
      value: badrPrice,
      onChange: setBadrPrice,
    },
    {
      key: 'train',
      ar: 'محطة قطار',
      en: 'Train Station',
      hintAr: 'مقطع محطة قطار الحرمين',
      hintEn: 'Haramain Train Station transfer',
      value: trainStationPrice,
      onChange: setTrainStationPrice,
    },
    {
      key: 'taif',
      ar: 'الطائف',
      en: 'Taif',
      hintAr: 'مقطع رحلة الطائف',
      hintEn: 'Taif route segment',
      value: taifPrice,
      onChange: setTaifPrice,
    },
    {
      key: 'hudaibiyah',
      ar: 'حديبية',
      en: 'Hudaibiyah',
      hintAr: 'مقطع مزار الحديبية',
      hintEn: 'Hudaibiyah segment',
      value: hudaibiyahPrice,
      onChange: setHudaibiyahPrice,
    },
  ];

  // When a formal invoice modal is open, suppress background KPIs/tables in @media print so ONLY the formal invoice prints.
  const bgPrintSuppression = previewInv ? 'no-print' : '';

  return (
    <div className="space-y-5">
      {/* KPI Strip (All in USD) */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 ${bgPrintSuppression}`}>
        <KpiCard
          tone="blue"
          label={bi(lang, 'إجمالي الفواتير المسجلة', 'Total Saved Invoices')}
          value={totalInvoicesCount}
          sub={bi(lang, 'فواتير بالدولار الأمريكي (USD)', 'Billed in USD ($)')}
        />
        <KpiCard
          tone="teal"
          label={bi(lang, 'إجمالي التأشيرات (دولار)', 'Total Visas (USD)')}
          value={fmtUSD(totalVisasUSD)}
          sub={bi(lang, 'التأشيرات + Multiple-entry visa', 'Umrah & Multiple-entry Visas')}
        />
        <KpiCard
          tone="amber"
          label={bi(lang, 'إجمالي MinPax والمقاطع الإضافية', 'MinPax & Extra Segments (USD)')}
          value={fmtUSD(totalMinPaxAndExtraUSD)}
          sub={bi(lang, 'MinPax ($26.67) + بدر/قطار/طائف/حديبية', 'MinPax ($26.67) + Extra Routes')}
        />
        <KpiCard
          tone="emerald"
          label={bi(lang, 'الإجمالي الكلي للفواتير ($)', 'Total Invoiced Amount (USD)')}
          value={fmtUSD(totalAllInvoicesUSD)}
          sub={bi(
            lang,
            `الإجمالي بالريال: ${fmt(totalAllInvoicesSAR)} ر.س`,
            `Total in SAR: ${fmt(totalAllInvoicesSAR)} SAR`
          )}
        />
      </div>

      {/* Invoice Builder Form */}
      <Panel
        className="no-print"
        title={
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#1d4ed8]" />
            <span>
              {editId
                ? bi(lang, `تعديل فاتورة رقم: ${effectiveInvNo}`, `Edit Invoice: ${effectiveInvNo}`)
                : bi(lang, 'إنشاء فاتورة مجموعة جديدة (العملة بالدولار USD)', 'Create Group Invoice (USD)')}
            </span>
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
              <DollarSign className="w-3.5 h-3.5" />
              <span>{bi(lang, 'جميع الأسعار بالدولار USD', 'All Prices in USD ($)')}</span>
            </span>
            <button type="button" onClick={resetForm} className={btnSecondaryCls}>
              {tKey(lang, 'btnClear')}
            </button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Section 01: Group Details */}
          <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-[#0f1e36]">
                {bi(lang, '01. بيانات الفاتورة والمجموعة', '01. Invoice & Group Details')}
              </div>
              {db.entries.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500">
                    {bi(lang, 'تعبئة سريعة من مجموعة مسجلة:', 'Quick fill from Visa Group:')}
                  </span>
                  <select
                    value=""
                    onChange={(e) => handleSelectRegisteredGroup(e.target.value)}
                    className="h-8 px-2.5 rounded-lg border border-blue-200 bg-blue-50/70 text-xs font-semibold text-[#1d4ed8] focus:outline-none"
                  >
                    <option value="">{bi(lang, '— اختر مجموعة —', '— Pick a group —')}</option>
                    {db.entries.map((e) => (
                      <option key={e.id} value={e.groupNo}>
                        {e.groupNo} — {e.customer} ({e.pax} {bi(lang, 'معتمر', 'pax')})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div>
                <label className={labelCls}>{bi(lang, 'رقم الفاتورة *', 'Invoice # *')}</label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={effectiveInvNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  placeholder="INV-0001"
                  className={`${inputCls} font-mono-num font-bold`}
                />
              </div>

              <div>
                <label className={labelCls}>{bi(lang, 'تاريخ الفاتورة *', 'Invoice Date *')}</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={`${inputCls} font-mono-num`}
                />
              </div>

              <div>
                <label className={labelCls}>{bi(lang, 'رقم المجموعة *', 'Group Number *')}</label>
                <input
                  type="text"
                  required
                  list="invoiceGroupSuggestions"
                  value={groupNo}
                  onChange={(e) => setGroupNo(e.target.value)}
                  placeholder={bi(lang, 'مثال: GRP-101', 'e.g. GRP-101')}
                  className={`${inputCls} font-mono-num`}
                />
                <datalist id="invoiceGroupSuggestions">
                  {db.entries.map((e) => (
                    <option key={e.id} value={e.groupNo}>
                      {e.customer}
                    </option>
                  ))}
                </datalist>
              </div>

              <div>
                <label className={labelCls}>{bi(lang, 'اسم المجموعة *', 'Group Name *')}</label>
                <input
                  type="text"
                  required
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder={bi(lang, 'مثال: مجموعة النور / شركة ...', 'e.g. Al-Noor Group')}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* Section 02, 03 & 04: Visas, Multiple-entry Visa & MinPax (USD) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Pilgrims & Visa Price */}
            <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-[#1d4ed8]">
                  {bi(lang, '02. عدد المعتمرين وسعر التأشيرة ($)', '02. Pilgrims Count & Visa Price (USD)')}
                </div>
                <span className="text-xs font-bold font-mono-num text-[#1d4ed8]" dir="ltr">
                  {fmtUSD(visaTotalUSD)}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{bi(lang, 'عدد المعتمرين', 'Pilgrims (Pax)')}</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    dir="ltr"
                    value={pax}
                    onChange={(e) => setPax(e.target.value)}
                    placeholder="0"
                    className={`${inputCls} font-mono-num`}
                  />
                </div>
                <div>
                  <label className={labelCls}>{bi(lang, 'سعر التأشيرة (دولار $)', 'Visa Price (USD $)')}</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 start-3 flex items-center text-xs font-bold text-slate-400">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      dir="ltr"
                      value={visaPrice}
                      onChange={(e) => setVisaPrice(e.target.value)}
                      placeholder="0.00"
                      className={`${inputCls} ps-7 font-mono-num`}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-1 flex items-center justify-between text-[11px] text-slate-600 border-t border-blue-200/70">
                <span>
                  {bi(lang, 'الحساب:', 'Formula:')} {paxNum} × {fmtUSD(visaPriceNum)}
                </span>
                <strong className="font-mono-num text-slate-900" dir="ltr">
                  {fmtUSD(visaTotalUSD)} USD
                </strong>
              </div>
            </div>

            {/* Multiple-entry Visa (Count & Price USD) */}
            <div className="p-4 rounded-xl bg-indigo-50/50 border border-indigo-200 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-indigo-800">
                  {bi(lang, '03. Multiple-entry visa (دولار $)', '03. Multiple-entry visa (USD)')}
                </div>
                <span className="text-xs font-bold font-mono-num text-indigo-700" dir="ltr">
                  {fmtUSD(multiEntryTotalUSD)}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{bi(lang, 'العدد', 'Count')}</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    dir="ltr"
                    value={multiEntryVisaCount}
                    onChange={(e) => setMultiEntryVisaCount(e.target.value)}
                    placeholder="0"
                    className={`${inputCls} font-mono-num`}
                  />
                </div>
                <div>
                  <label className={labelCls}>{bi(lang, 'السعر (دولار $)', 'Price (USD $)')}</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 start-3 flex items-center text-xs font-bold text-indigo-400">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      dir="ltr"
                      value={multiEntryVisaPrice}
                      onChange={(e) => setMultiEntryVisaPrice(e.target.value)}
                      placeholder="0.00"
                      className={`${inputCls} ps-7 font-mono-num`}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-1 flex items-center justify-between text-[11px] text-indigo-900 border-t border-indigo-200/70">
                <span>
                  {bi(lang, 'الحساب:', 'Formula:')} {multiEntryCountNum} × {fmtUSD(multiEntryPriceNum)}
                </span>
                <strong className="font-mono-num text-indigo-950" dir="ltr">
                  {fmtUSD(multiEntryTotalUSD)} USD
                </strong>
              </div>
            </div>

            {/* MinPax x Fixed Rate 26.67 USD */}
            <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-amber-900">
                  {bi(lang, '04. عدد MinPax × سعر ثابت 26.67 $', '04. MinPax Count × Fixed Rate $26.67')}
                </div>
                <span className="text-xs font-bold font-mono-num text-amber-800" dir="ltr">
                  {fmtUSD(minPaxTotalUSD)}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{bi(lang, 'عدد MinPax', 'MinPax Count')}</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    dir="ltr"
                    value={minPaxCount}
                    onChange={(e) => setMinPaxCount(e.target.value)}
                    placeholder="0"
                    className={`${inputCls} font-mono-num`}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-semibold text-slate-600">
                      {bi(lang, 'السعر الثابت ($)', 'Fixed Rate ($)')}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (!lockMinPaxRate) {
                          setMinPaxRate(String(DEFAULT_MINPAX_RATE));
                          setLockMinPaxRate(true);
                        } else {
                          setLockMinPaxRate(false);
                        }
                      }}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 hover:text-amber-950 cursor-pointer"
                    >
                      {lockMinPaxRate ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                      <span>
                        {lockMinPaxRate
                          ? bi(lang, 'تعديل السعر', 'Unlock')
                          : bi(lang, 'إرجاع 26.67', 'Reset 26.67')}
                      </span>
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute inset-y-0 start-3 flex items-center text-xs font-bold text-amber-700">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      dir="ltr"
                      disabled={lockMinPaxRate}
                      value={minPaxRate}
                      onChange={(e) => setMinPaxRate(e.target.value)}
                      className={`${inputCls} ps-7 font-mono-num font-bold disabled:bg-amber-100/70 disabled:text-amber-950`}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-1 flex items-center justify-between text-[11px] text-amber-900 border-t border-amber-200/70">
                <span>
                  {bi(lang, 'الحساب:', 'Formula:')} {minPaxCountNum} × {fmtUSD(minPaxRateNum)}
                </span>
                <strong className="font-mono-num" dir="ltr">
                  {fmtUSD(minPaxTotalUSD)} USD
                </strong>
              </div>
            </div>
          </div>

          {/* Section 05: Extra Segments (Badr, Train Station, Taif, Hudaibiyah) with USD Price Beside Each */}
          <div className="p-4 rounded-xl bg-teal-50/40 border border-teal-200 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-[#0f766e]">
                {bi(
                  lang,
                  '05. المقاطع الإضافية (بدر · محطة قطار · الطائف · حديبية) — السعر بجانب كل مقطع بالدولار',
                  '05. Extra Segments (Badr · Train Station · Taif · Hudaibiyah) — Price in USD Beside Each'
                )}
              </div>
              <span className="text-xs font-bold font-mono-num text-[#0f766e]" dir="ltr">
                {bi(lang, 'إجمالي المقاطع:', 'Segments Total:')} {fmtUSD(extraSegmentsTotalUSD)}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {extraSegments.map((seg) => (
                <div
                  key={seg.key}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white border border-slate-200 shadow-2xs"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900">{bi(lang, seg.ar, seg.en)}</div>
                    <div className="text-[11px] text-slate-400 truncate">{bi(lang, seg.hintAr, seg.hintEn)}</div>
                  </div>
                  <div className="w-40 shrink-0">
                    <div className="relative">
                      <span className="absolute inset-y-0 start-3 flex items-center text-xs font-bold text-emerald-700">
                        $
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        dir="ltr"
                        value={seg.value}
                        onChange={(e) => seg.onChange(e.target.value)}
                        placeholder="0.00"
                        className={`${inputCls} ps-7 pe-11 font-mono-num font-bold text-end`}
                      />
                      <span className="absolute inset-y-0 end-2.5 flex items-center text-[10px] font-bold text-slate-400">
                        USD
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Manual Custom Segment(s) in USD */}
            <div className="pt-3 border-t border-teal-200/80 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-slate-800">
                  {bi(
                    lang,
                    'مقطع يدوي (إدخال اسم المقطع والسعر بالدولار USD)',
                    'Manual Custom Segment (Enter Segment Name & Price in USD)'
                  )}
                </div>
                {manualSegments.length < 10 && (
                  <button
                    type="button"
                    onClick={() => setManualSegments((prev) => [...prev, { label: '', price: '' }])}
                    className="inline-flex items-center gap-1 px-2.5 h-7 rounded-lg bg-white hover:bg-teal-50 border border-teal-300 text-[#0f766e] text-[11px] font-bold transition cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{bi(lang, 'إضافة مقطع يدوي آخر', 'Add Another Manual Segment')}</span>
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {manualSegments.map((seg, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs"
                  >
                    <input
                      type="text"
                      value={seg.label}
                      onChange={(e) =>
                        setManualSegments((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, label: e.target.value } : row))
                        )
                      }
                      placeholder={bi(lang, 'اسم المقطع (مثال: توصيل إضافي / مزارات...)', 'Segment Name (e.g. Custom Route...)')}
                      className={`${inputCls} flex-1`}
                    />
                    <div className="w-full sm:w-44 shrink-0 relative">
                      <span className="absolute inset-y-0 start-3 flex items-center text-xs font-bold text-emerald-700">
                        $
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        dir="ltr"
                        value={seg.price}
                        onChange={(e) =>
                          setManualSegments((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, price: e.target.value } : row))
                          )
                        }
                        placeholder="0.00"
                        className={`${inputCls} ps-7 pe-11 font-mono-num font-bold text-end`}
                      />
                      <span className="absolute inset-y-0 end-2.5 flex items-center text-[10px] font-bold text-slate-400">
                        USD
                      </span>
                    </div>
                    {manualSegments.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setManualSegments((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className={btnSoftRedCls}
                        title={bi(lang, 'حذف المقطع', 'Remove Segment')}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Notes + Grand Total USD & SAR Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            <div className="lg:col-span-2">
              <label className={labelCls}>{tKey(lang, 'lblNotes')}</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={bi(lang, 'ملاحظات إضافية على الفاتورة (اختياري)...', 'Optional invoice notes...')}
                className={inputCls}
              />
            </div>

            <div className="space-y-2">
              <div className="p-3.5 rounded-xl bg-[#0f1e36] text-white flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] text-slate-300 font-medium">
                    {bi(lang, 'إجمالي الفاتورة بالدولار (USD)', 'Invoice Total (USD)')}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {bi(
                      lang,
                      'التأشيرات + Multiple-entry + MinPax + المقاطع الإضافية',
                      'Visas + Multiple-entry + MinPax + Extra Segments'
                    )}
                  </div>
                </div>
                <div className="text-xl font-bold font-mono-num text-emerald-400" dir="ltr">
                  {fmtUSD(grandTotalUSD)}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3">
                <div className="text-[11px] text-emerald-950 font-bold">
                  {bi(lang, 'الإجمالي بالريال', 'Total in SAR')}
                </div>
                <div className="text-lg font-bold font-mono-num text-emerald-800" dir="ltr">
                  {fmt(grandTotalSAR)} <span className="text-xs font-sans">{bi(lang, 'ر.س', 'SAR')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            {editId && (
              <button type="button" onClick={resetForm} className={btnSecondaryCls}>
                {tKey(lang, 'btnCancel')}
              </button>
            )}
            <button type="button" onClick={handlePreviewCurrent} className={btnTealCls}>
              <Printer className="w-3.5 h-3.5" />
              <span>{bi(lang, 'معاينة وطباعة الفاتورة', 'Preview & Print Invoice')}</span>
            </button>
            <button type="submit" disabled={saving} className={btnPrimaryCls}>
              {editId ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              <span>
                {saving
                  ? bi(lang, 'جاري الحفظ...', 'Saving...')
                  : editId
                    ? bi(lang, 'تحديث الفاتورة', 'Update Invoice')
                    : bi(lang, 'حفظ الفاتورة', 'Save Invoice')}
              </span>
            </button>
          </div>
        </form>
      </Panel>

      {/* Saved Invoices Table */}
      <Panel
        className={bgPrintSuppression}
        title={bi(lang, 'سجل الفواتير المحفوظة (بالدولار الأمريكي USD)', 'Saved Invoices Log (USD)')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={bi(lang, 'بحث برقم الفاتورة أو المجموعة...', 'Search invoice or group...')}
              className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:border-[#1d4ed8] w-56"
            />
            <button type="button" onClick={handleExportCsv} className={btnSecondaryCls}>
              <Download className="w-3.5 h-3.5" />
              <span>{tKey(lang, 'btnCsv')}</span>
            </button>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <th className="py-2.5 px-2 text-start font-bold">{bi(lang, 'رقم الفاتورة', 'Invoice #')}</th>
                <th className="py-2.5 px-2 text-start font-bold">{tKey(lang, 'thDate')}</th>
                <th className="py-2.5 px-2 text-start font-bold">{bi(lang, 'رقم المجموعة', 'Group #')}</th>
                <th className="py-2.5 px-2 text-start font-bold">{bi(lang, 'اسم المجموعة', 'Group Name')}</th>
                <th className="py-2.5 px-2 text-start font-bold">{bi(lang, 'المعتمرين × التأشيرة', 'Pax × Visa')}</th>
                <th className="py-2.5 px-2 text-start font-bold">Multiple-entry visa</th>
                <th className="py-2.5 px-2 text-start font-bold">{bi(lang, 'MinPax × 26.67', 'MinPax × 26.67')}</th>
                <th className="py-2.5 px-2 text-start font-bold">{bi(lang, 'المقاطع الإضافية', 'Extra Segments')}</th>
                <th className="py-2.5 px-2 text-start font-bold">{bi(lang, 'الإجمالي (USD)', 'Total (USD)')}</th>
                <th className="py-2.5 px-2 text-start font-bold no-print">{tKey(lang, 'thAction')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInvoices.length === 0 ? (
                <EmptyRow colSpan={10} lang={lang} />
              ) : (
                filteredInvoices.map((inv) => {
                  const visaSum = Number(inv.pax || 0) * Number(inv.visaPrice || 0);
                  const meCount = Number(inv.multiEntryVisaCount || 0);
                  const mePrice = Number(inv.multiEntryVisaPrice || 0);
                  const meSum = meCount * mePrice;
                  const mpRate = Number(inv.minPaxRate ?? DEFAULT_MINPAX_RATE);
                  const mpSum = Number(inv.minPaxCount || 0) * mpRate;
                  const customSegs = parseInvoiceCustomSegments(inv, lang);
                  const extraSum =
                    Number(inv.badrPrice || 0) +
                    Number(inv.trainStationPrice || 0) +
                    Number(inv.taifPrice || 0) +
                    Number(inv.hudaibiyahPrice || 0) +
                    Number(inv.customSegmentPrice || 0);

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-2 font-mono-num font-bold text-[#1d4ed8]" dir="ltr">
                        {inv.invoiceNo}
                      </td>
                      <td className="py-2.5 px-2 font-mono-num text-slate-500">{inv.date}</td>
                      <td className="py-2.5 px-2 font-mono-num font-semibold text-slate-800">{inv.groupNo}</td>
                      <td className="py-2.5 px-2 font-semibold text-slate-900">{inv.groupName}</td>
                      <td className="py-2.5 px-2 font-mono-num">
                        <div className="font-semibold text-slate-900" dir="ltr">
                          {fmtUSD(visaSum)}
                        </div>
                        <div className="text-[10px] text-slate-400" dir="ltr">
                          {inv.pax} × ${fmt(inv.visaPrice)}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 font-mono-num">
                        {meCount > 0 || mePrice > 0 ? (
                          <>
                            <div className="font-semibold text-indigo-700" dir="ltr">
                              {fmtUSD(meSum)}
                            </div>
                            <div className="text-[10px] text-slate-400" dir="ltr">
                              {meCount} × ${fmt(mePrice)}
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 font-mono-num">
                        <div className="font-semibold text-amber-800" dir="ltr">
                          {fmtUSD(mpSum)}
                        </div>
                        <div className="text-[10px] text-slate-400" dir="ltr">
                          {inv.minPaxCount} × ${fmt(mpRate)}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 font-mono-num">
                        <div className="font-semibold text-[#0f766e]" dir="ltr">
                          {fmtUSD(extraSum)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {[
                            inv.badrPrice > 0 && `${bi(lang, 'بدر', 'Badr')}: $${fmt(inv.badrPrice)}`,
                            inv.trainStationPrice > 0 && `${bi(lang, 'قطار', 'Train')}: $${fmt(inv.trainStationPrice)}`,
                            inv.taifPrice > 0 && `${bi(lang, 'طائف', 'Taif')}: $${fmt(inv.taifPrice)}`,
                            inv.hudaibiyahPrice > 0 && `${bi(lang, 'حديبية', 'Hud')}: $${fmt(inv.hudaibiyahPrice)}`,
                            ...customSegs.map((cs) => `${cs.label}: $${fmt(cs.price)}`),
                          ]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 font-mono-num">
                        <div className="font-bold text-emerald-700" dir="ltr">
                          {fmtUSD(inv.totalUSD)}
                        </div>
                        <div className="text-[10px] font-semibold text-slate-500" dir="ltr">
                          {fmt(Number(inv.totalUSD || 0) * SAR_INVOICE_RATE)} {bi(lang, 'ر.س', 'SAR')}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 no-print">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            title={bi(lang, 'طباعة الفاتورة', 'Print Invoice')}
                            onClick={() => setPreviewInv(inv)}
                            className="inline-flex items-center justify-center gap-1 px-2.5 h-7 rounded-lg bg-teal-50 hover:bg-teal-100 text-[#0f766e] text-[11px] font-semibold transition cursor-pointer"
                          >
                            <Printer className="w-3 h-3" />
                          </button>
                          <button type="button" onClick={() => handleEdit(inv)} className={btnSoftBlueCls}>
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button type="button" onClick={() => handleDelete(inv)} className={btnSoftRedCls}>
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

      {/* Formal Printable Invoice Preview Modal */}
      {previewInv && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto print:static print:inset-auto print:bg-white print:p-0 print:block">
          <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden my-auto print:shadow-none print:border-0 print:rounded-none print:max-w-none">
            {/* Modal Action Header (Hidden when printing) */}
            <div className="no-print px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#1d4ed8]" />
                <span>
                  {bi(lang, `معاينة طباعة الفاتورة: ${previewInv.invoiceNo}`, `Invoice Print Preview: ${previewInv.invoiceNo}`)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={exportingPdf}
                  onClick={() => void handleDownloadInvoicePdf()}
                  className={btnTealCls}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>
                    {exportingPdf
                      ? bi(lang, 'جاري التجهيز...', 'Generating...')
                      : bi(lang, 'حفظ PDF', 'Save PDF')}
                  </span>
                </button>
                <button type="button" onClick={() => window.print()} className={btnPrimaryCls}>
                  <Printer className="w-3.5 h-3.5" />
                  <span>{bi(lang, 'طباعة الفاتورة', 'Print Invoice')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewInv(null)}
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Formal Invoice Body */}
            <div ref={invoiceBodyRef} className="p-6 sm:p-8 space-y-6 text-slate-900 bg-white">
              {/* Company Header */}
              <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b-2 border-[#0f1e36]">
                <div className="flex items-center gap-3.5">
                  <img src="/logo.png" alt="BEST UNITED TRAVEL" className="w-16 h-16 object-contain" />
                  <div>
                    <div className="text-lg font-bold text-[#0f1e36]">BEST UNITED TRAVEL &amp; TOURISM</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {bi(lang, 'شركة بست يونايتد للسفريات والسياحة · موسم 1448 هـ', 'Umrah & Travel Services · Season 1448H')}
                    </div>
                  </div>
                </div>
                <div className="text-end">
                  <div className="text-xs uppercase tracking-wider font-bold text-[#1d4ed8]">
                    {bi(lang, 'فاتورة مجموعة (USD)', 'GROUP INVOICE (USD)')}
                  </div>
                  <div className="text-base font-bold font-mono-num text-slate-900 mt-0.5" dir="ltr">
                    {previewInv.invoiceNo}
                  </div>
                  <div className="text-xs text-slate-500 font-mono-num mt-0.5">{previewInv.date}</div>
                </div>
              </div>

              {/* Group Info Box */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <div className="text-[11px] text-slate-500 font-semibold">{bi(lang, 'رقم المجموعة', 'Group Number')}</div>
                  <div className="text-sm font-bold font-mono-num text-slate-900 mt-0.5">{previewInv.groupNo}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 font-semibold">{bi(lang, 'اسم المجموعة', 'Group Name')}</div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">{previewInv.groupName}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 font-semibold">{bi(lang, 'العملة المعتمدة', 'Invoice Currency')}</div>
                  <div className="text-sm font-bold text-emerald-700 mt-0.5">
                    {bi(lang, 'دولار أمريكي (USD $)', 'US Dollar (USD $)')}
                  </div>
                </div>
              </div>

              {/* Itemized Table */}
              <table className="w-full text-xs border-collapse border border-slate-200">
                <thead>
                  <tr className="bg-[#0f1e36] text-white">
                    <th className="py-2.5 px-3 text-start font-bold">{bi(lang, 'البند / البيان', 'Description')}</th>
                    <th className="py-2.5 px-3 text-center font-bold">{bi(lang, 'العدد', 'Qty')}</th>
                    <th className="py-2.5 px-3 text-end font-bold">{bi(lang, 'السعر (USD)', 'Unit Price (USD)')}</th>
                    <th className="py-2.5 px-3 text-end font-bold">{bi(lang, 'الإجمالي (USD)', 'Total (USD)')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="py-2.5 px-3 font-semibold">
                      {bi(lang, 'تأشيرات العمرة للمعتمرين', 'Umrah Visas')}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono-num">{previewInv.pax}</td>
                    <td className="py-2.5 px-3 text-end font-mono-num" dir="ltr">
                      {fmtUSD(previewInv.visaPrice)}
                    </td>
                    <td className="py-2.5 px-3 text-end font-mono-num font-bold" dir="ltr">
                      {fmtUSD(previewInv.pax * previewInv.visaPrice)}
                    </td>
                  </tr>
                  {(Number(previewInv.multiEntryVisaCount || 0) > 0 ||
                    Number(previewInv.multiEntryVisaPrice || 0) > 0) && (
                    <tr>
                      <td className="py-2.5 px-3 font-semibold">Multiple-entry visa</td>
                      <td className="py-2.5 px-3 text-center font-mono-num">
                        {Number(previewInv.multiEntryVisaCount || 0)}
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono-num" dir="ltr">
                        {fmtUSD(Number(previewInv.multiEntryVisaPrice || 0))}
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono-num font-bold" dir="ltr">
                        {fmtUSD(
                          Number(previewInv.multiEntryVisaCount || 0) *
                            Number(previewInv.multiEntryVisaPrice || 0)
                        )}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td className="py-2.5 px-3 font-semibold">
                      {bi(lang, 'عدد MinPax (سعر ثابت 26.67 $)', 'MinPax Fixed Fee ($26.67)')}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono-num">{previewInv.minPaxCount}</td>
                    <td className="py-2.5 px-3 text-end font-mono-num" dir="ltr">
                      {fmtUSD(previewInv.minPaxRate ?? DEFAULT_MINPAX_RATE)}
                    </td>
                    <td className="py-2.5 px-3 text-end font-mono-num font-bold" dir="ltr">
                      {fmtUSD(previewInv.minPaxCount * (previewInv.minPaxRate ?? DEFAULT_MINPAX_RATE))}
                    </td>
                  </tr>
                  {previewInv.badrPrice > 0 && (
                    <tr>
                      <td className="py-2.5 px-3 font-semibold">{bi(lang, 'مقطع إضافي: بدر', 'Extra Segment: Badr')}</td>
                      <td className="py-2.5 px-3 text-center font-mono-num">1</td>
                      <td className="py-2.5 px-3 text-end font-mono-num" dir="ltr">
                        {fmtUSD(previewInv.badrPrice)}
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono-num font-bold" dir="ltr">
                        {fmtUSD(previewInv.badrPrice)}
                      </td>
                    </tr>
                  )}
                  {previewInv.trainStationPrice > 0 && (
                    <tr>
                      <td className="py-2.5 px-3 font-semibold">
                        {bi(lang, 'مقطع إضافي: محطة قطار', 'Extra Segment: Train Station')}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono-num">1</td>
                      <td className="py-2.5 px-3 text-end font-mono-num" dir="ltr">
                        {fmtUSD(previewInv.trainStationPrice)}
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono-num font-bold" dir="ltr">
                        {fmtUSD(previewInv.trainStationPrice)}
                      </td>
                    </tr>
                  )}
                  {previewInv.taifPrice > 0 && (
                    <tr>
                      <td className="py-2.5 px-3 font-semibold">{bi(lang, 'مقطع إضافي: الطائف', 'Extra Segment: Taif')}</td>
                      <td className="py-2.5 px-3 text-center font-mono-num">1</td>
                      <td className="py-2.5 px-3 text-end font-mono-num" dir="ltr">
                        {fmtUSD(previewInv.taifPrice)}
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono-num font-bold" dir="ltr">
                        {fmtUSD(previewInv.taifPrice)}
                      </td>
                    </tr>
                  )}
                  {previewInv.hudaibiyahPrice > 0 && (
                    <tr>
                      <td className="py-2.5 px-3 font-semibold">
                        {bi(lang, 'مقطع إضافي: حديبية', 'Extra Segment: Hudaibiyah')}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono-num">1</td>
                      <td className="py-2.5 px-3 text-end font-mono-num" dir="ltr">
                        {fmtUSD(previewInv.hudaibiyahPrice)}
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono-num font-bold" dir="ltr">
                        {fmtUSD(previewInv.hudaibiyahPrice)}
                      </td>
                    </tr>
                  )}
                  {parseInvoiceCustomSegments(previewInv, lang).map((cs, idx) => (
                    <tr key={`custom-${idx}`}>
                      <td className="py-2.5 px-3 font-semibold">{cs.label}</td>
                      <td className="py-2.5 px-3 text-center font-mono-num">1</td>
                      <td className="py-2.5 px-3 text-end font-mono-num" dir="ltr">
                        {fmtUSD(cs.price)}
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono-num font-bold" dir="ltr">
                        {fmtUSD(cs.price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-emerald-50 border-t-2 border-emerald-600">
                    <td colSpan={3} className="py-3 px-3 text-sm font-bold text-[#0f1e36]">
                      {bi(lang, 'إجمالي الفاتورة بالدولار الأمريكي (USD)', 'Invoice Total (USD)')}
                    </td>
                    <td className="py-3 px-3 text-end text-base font-bold font-mono-num text-emerald-800" dir="ltr">
                      {fmtUSD(previewInv.totalUSD)}
                    </td>
                  </tr>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td colSpan={3} className="py-2.5 px-3 text-xs font-bold text-slate-800">
                      {bi(lang, 'الإجمالي بالريال', 'Total in SAR')}
                    </td>
                    <td className="py-2.5 px-3 text-end text-sm font-bold font-mono-num text-[#0f1e36]" dir="ltr">
                      {fmt(Number(previewInv.totalUSD || 0) * SAR_INVOICE_RATE)} {bi(lang, 'ر.س', 'SAR')}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {previewInv.notes && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                  <strong className="text-slate-800">{bi(lang, 'ملاحظات:', 'Notes:')} </strong>
                  {previewInv.notes}
                </div>
              )}

              {/* Official Print Attribution Footer (No System URL) */}
              <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <div className="font-bold text-slate-900">
                  {bi(lang, 'طباعة بواسطة:', 'Printed by:')}{' '}
                  <span className="text-[#1d4ed8]">{printedByLabel}</span>
                </div>
                <div className="font-mono-num text-[11px] text-slate-500" dir="ltr">
                  {today()} · {formatTime24(new Date(), false)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
