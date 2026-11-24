import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, Info, X } from 'lucide-react';
import { Lang } from '../types/accounting';
import { bi } from '../i18n/translations';
import { normalizeTime24 } from '../utils/calculations';

export interface ToastState {
  id: number;
  message: string;
  tone?: 'success' | 'error' | 'info';
}

export interface ConfirmConfig {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

export const ToastBanner: React.FC<{ toast: ToastState | null; onClose: () => void }> = ({ toast, onClose }) => {
  if (!toast) return null;
  const toneCls =
    toast.tone === 'error'
      ? 'bg-red-700 text-white border-red-800'
      : toast.tone === 'info'
        ? 'bg-[#0f1e36] text-white border-slate-700'
        : 'bg-[#0f766e] text-white border-teal-800';
  const Icon = toast.tone === 'error' ? AlertTriangle : toast.tone === 'info' ? Info : CheckCircle2;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`no-print fixed bottom-5 left-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-lg text-sm font-semibold max-w-md ${toneCls}`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button
        type="button"
        onClick={onClose}
        className="opacity-80 hover:opacity-100 p-0.5 rounded cursor-pointer"
        aria-label="Close"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export const ConfirmModal: React.FC<{
  config: ConfirmConfig | null;
  lang: Lang;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ config, lang, busy, onCancel, onConfirm }) => {
  if (!config) return null;
  return (
    <div
      className="no-print fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[2px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                config.danger ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-[#1d4ed8]'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">{config.title}</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 text-sm text-slate-600 leading-relaxed">{config.message}</div>

        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer whitespace-nowrap"
          >
            {bi(lang, 'إلغاء', 'Cancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`px-4 py-2 rounded-xl text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap disabled:opacity-60 ${
              config.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1d4ed8] hover:bg-blue-700'
            }`}
          >
            {busy ? bi(lang, 'جاري التنفيذ...', 'Working...') : config.confirmLabel || bi(lang, 'تأكيد', 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};

export const Panel: React.FC<{
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, actions, children, className = '' }) => (
  <div className={`bg-white border border-slate-200 rounded-2xl print-panel ${className}`}>
    {(title || actions) && (
      <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        {title && <div className="text-sm font-bold text-slate-900 flex items-center gap-2">{title}</div>}
        {actions && <div className="flex flex-wrap items-center gap-2 no-print">{actions}</div>}
      </div>
    )}
    <div className="p-5">{children}</div>
  </div>
);

export const KpiCard: React.FC<{
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: 'slate' | 'blue' | 'teal' | 'amber' | 'red' | 'emerald';
}> = ({ label, value, sub, tone = 'slate' }) => {
  const accentMap: Record<string, string> = {
    slate: 'border-t-slate-400',
    blue: 'border-t-[#1d4ed8]',
    teal: 'border-t-[#0f766e]',
    amber: 'border-t-amber-500',
    red: 'border-t-red-600',
    emerald: 'border-t-emerald-600',
  };
  const valColor: Record<string, string> = {
    slate: 'text-slate-900',
    blue: 'text-[#1d4ed8]',
    teal: 'text-[#0f766e]',
    amber: 'text-amber-700',
    red: 'text-red-700',
    emerald: 'text-emerald-700',
  };

  return (
    <div className={`bg-white border border-slate-200 border-t-[3px] ${accentMap[tone]} rounded-2xl p-4`}>
      <div className="text-xs font-medium text-slate-500 leading-snug">{label}</div>
      <div className={`text-xl font-bold mt-2 font-mono-num ${valColor[tone]}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-1.5 font-mono-num">{sub}</div>}
    </div>
  );
};

export const EmptyRow: React.FC<{ colSpan: number; lang: Lang; label?: string }> = ({ colSpan, lang, label }) => (
  <tr>
    <td colSpan={colSpan} className="py-10 px-4 text-center text-xs text-slate-400">
      {label || bi(lang, 'لا توجد بيانات مسجلة حتى الآن', 'No records found')}
    </td>
  </tr>
);

export const inputCls =
  'w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-slate-900 text-xs focus:outline-none focus:border-[#1d4ed8] focus:ring-2 focus:ring-blue-500/15 transition';

export const labelCls = 'block text-[11px] font-semibold text-slate-600 mb-1.5';

export const btnPrimaryCls =
  'inline-flex items-center justify-center gap-1.5 px-4 h-9 rounded-xl bg-[#1d4ed8] hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap';

export const btnTealCls =
  'inline-flex items-center justify-center gap-1.5 px-4 h-9 rounded-xl bg-[#0f766e] hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap';

export const btnSecondaryCls =
  'inline-flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer whitespace-nowrap';

export const btnDangerCls =
  'inline-flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap';

export const btnSoftRedCls =
  'inline-flex items-center justify-center gap-1 px-2.5 h-7 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-[11px] font-semibold transition cursor-pointer whitespace-nowrap';

export const btnSoftBlueCls =
  'inline-flex items-center justify-center gap-1 px-2.5 h-7 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1d4ed8] text-[11px] font-semibold transition cursor-pointer whitespace-nowrap';

const HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES_60 = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export const Time24Input: React.FC<{
  value: string;
  onChange: (val: string) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}> = ({ value, onChange, className = '', disabled = false, required = false }) => {
  const normalized = normalizeTime24(value);
  const parts = normalized.match(/^(\d{2}):(\d{2})$/);
  const hh = parts ? parts[1] : '';
  const mm = parts ? parts[2] : '';

  const handleHourChange = (nextH: string) => {
    if (!nextH) {
      onChange('');
      return;
    }
    onChange(`${nextH}:${mm || '00'}`);
  };

  const handleMinChange = (nextM: string) => {
    if (!nextM) {
      onChange('');
      return;
    }
    onChange(`${hh || '00'}:${nextM}`);
  };

  return (
    <div
      dir="ltr"
      className={`w-full h-9 px-2 rounded-lg border border-slate-200 bg-white text-slate-900 text-xs font-mono-num flex items-center justify-between gap-1 focus-within:border-[#1d4ed8] focus-within:ring-2 focus-within:ring-blue-500/15 transition ${
        disabled ? 'opacity-60 pointer-events-none bg-slate-50' : ''
      } ${className}`}
      title="24-Hour Time (00:00 - 23:59)"
    >
      <div className="flex items-center gap-0.5 min-w-0 flex-1">
        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-0.5" />
        <select
          aria-label="Hour (00-23)"
          value={hh}
          required={required}
          disabled={disabled}
          onChange={(e) => handleHourChange(e.target.value)}
          className="bg-transparent text-xs font-mono-num font-semibold text-slate-900 focus:outline-none cursor-pointer py-1 px-0.5"
        >
          <option value="">--</option>
          {HOURS_24.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span className="text-slate-400 font-bold select-none">:</span>
        <select
          aria-label="Minute (00-59)"
          value={mm}
          required={required}
          disabled={disabled}
          onChange={(e) => handleMinChange(e.target.value)}
          className="bg-transparent text-xs font-mono-num font-semibold text-slate-900 focus:outline-none cursor-pointer py-1 px-0.5"
        >
          <option value="">--</option>
          {MINUTES_60.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      {!required && (hh || mm) && !disabled && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-pointer shrink-0"
          aria-label="Clear time"
          tabIndex={-1}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};
