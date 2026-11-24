import React, { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Mail, Send, ShieldAlert, X } from 'lucide-react';
import { Lang } from '../types/accounting';
import { bi } from '../i18n/translations';
import {
  buildGmailComposeHref,
  buildMailtoHref,
  hasGmailAccessToken,
  sendGmailMessage,
} from '../services/gmailService';
import { btnPrimaryCls, btnSecondaryCls, btnSoftBlueCls, inputCls, labelCls } from './AccountingUI';

export interface InviteEmailDraft {
  recipientName: string;
  to: string;
  subject: string;
  body: string;
  lockRecipient?: boolean;
}

interface SendInviteEmailModalProps {
  lang: Lang;
  draft: InviteEmailDraft | null;
  onClose: () => void;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

export const SendInviteEmailModal: React.FC<SendInviteEmailModalProps> = ({
  lang,
  draft,
  onClose,
  onToast,
}) => {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (draft) {
      setTo(draft.to);
      setSubject(draft.subject);
      setBody(draft.body);
      setCopied(false);
      setErrorMsg(null);
      setSending(false);
    }
  }, [draft]);

  if (!draft) return null;

  const gmailConnected = hasGmailAccessToken();

  const handleCopy = async () => {
    const fullText = `${subject}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      onToast(bi(lang, 'تم نسخ رسالة الدعوة للحافظة', 'Invitation message copied to clipboard'));
    } catch {
      onToast(bi(lang, 'تعذر النسخ التلقائي، انسخ النص من الصندوق', 'Copy manually from the box'), 'info');
    }
  };

  const handleConfirmAndSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTo = to.trim();
    if (!cleanTo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanTo)) {
      setErrorMsg(bi(lang, 'يرجى إدخال بريد إلكتروني صحيح للموظف المستلم.', 'Please enter a valid recipient email.'));
      return;
    }
    if (!subject.trim() || !body.trim()) {
      setErrorMsg(bi(lang, 'يرجى التأكد من وجود عنوان ونص للرسالة.', 'Please provide both subject and message body.'));
      return;
    }

    setSending(true);
    setErrorMsg(null);
    try {
      await sendGmailMessage({
        to: cleanTo,
        subject: subject.trim(),
        body,
      });
      onToast(
        bi(
          lang,
          `تم إرسال رسالة الدعوة بنجاح عبر Gmail إلى ${cleanTo}`,
          `Invitation email sent via Gmail to ${cleanTo}`
        )
      );
      onClose();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      const msg = (err as { message?: string })?.message || '';
      if (code === 'auth/popup-blocked') {
        setErrorMsg(
          bi(
            lang,
            'قام المتصفح بحظر نافذة الموافقة على Gmail. يرجى السماح بالنوافذ المنبثقة ثم المحاولة مجدداً، أو استخدام زر «فتح مسودة Gmail» أدناه.',
            'Browser blocked the Gmail authorization popup. Allow popups or use "Open Gmail Compose" below.'
          )
        );
      } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setErrorMsg(
          bi(lang, 'تم إغلاق نافذة الموافقة على Gmail قبل الإكمال.', 'Gmail authorization window was closed before completing.')
        );
      } else if (msg === 'GMAIL_NO_ACCESS_TOKEN') {
        setErrorMsg(
          bi(
            lang,
            'لم يتم منح صلاحية إرسال الرسائل عبر Gmail. يرجى الموافقة على صلاحية الإرسال عند تسجيل الدخول، أو استخدام «فتح مسودة Gmail».',
            'Gmail send permission was not granted. Please grant permission or use "Open Gmail Compose".'
          )
        );
      } else {
        setErrorMsg(
          bi(
            lang,
            `تعذر الإرسال عبر Gmail: ${msg || code || 'خطأ غير متوقع'}. يمكنك استخدام «نسخ الرسالة» أو «فتح مسودة Gmail».`,
            `Could not send via Gmail: ${msg || code || 'Unexpected error'}. You can copy or open Gmail compose below.`
          )
        );
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[2px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#1d4ed8] flex items-center justify-center">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {bi(lang, 'تأكيد إرسال دعوة فتح النظام عبر Gmail', 'Confirm & Send System Invite via Gmail')}
              </h3>
              <p className="text-[11px] text-slate-500">
                {bi(lang, `الموظف: ${draft.recipientName}`, `Recipient: ${draft.recipientName}`)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleConfirmAndSend(e)} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-[11px] text-amber-950 flex items-start gap-2 leading-relaxed">
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span>
              {bi(
                lang,
                'تأكيد الإرسال: عند الضغط على زر الإرسال أدناه، سيتم إرسال هذه الرسالة فعلياً من حساب Gmail الخاص بك إلى بريد الموظف المحدد.',
                'Send Confirmation: Clicking send below will send this email from your Gmail account to the recipient shown.'
              )}
            </span>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 leading-relaxed">
              {errorMsg}
            </div>
          )}

          <div>
            <label className={labelCls}>{bi(lang, 'إرسال إلى (بريد الموظف) *', 'Send To (Employee Email) *')}</label>
            <input
              type="email"
              required
              dir="ltr"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="employee@gmail.com"
              className={`${inputCls} font-mono-num`}
            />
          </div>

          <div>
            <label className={labelCls}>{bi(lang, 'عنوان الرسالة (Subject) *', 'Email Subject *')}</label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>{bi(lang, 'نص الرسالة والرابط *', 'Message Content & Link *')}</label>
            <textarea
              required
              rows={9}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-xs leading-relaxed focus:outline-none focus:border-[#1d4ed8] focus:ring-2 focus:ring-blue-500/15 transition"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" onClick={() => void handleCopy()} className={btnSoftBlueCls}>
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? bi(lang, 'تم النسخ', 'Copied') : bi(lang, 'نسخ الرسالة', 'Copy Message')}</span>
            </button>

            {to.trim() && (
              <>
                <a
                  href={buildGmailComposeHref(to, subject, body)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={btnSecondaryCls}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{bi(lang, 'فتح مسودة Gmail', 'Open Gmail Compose')}</span>
                </a>
                <a href={buildMailtoHref(to, subject, body)} className={btnSecondaryCls}>
                  <Mail className="w-3.5 h-3.5" />
                  <span>{bi(lang, 'تطبيق البريد', 'Mail App')}</span>
                </a>
              </>
            )}
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button type="button" disabled={sending} onClick={onClose} className={btnSecondaryCls}>
              {bi(lang, 'إلغاء', 'Cancel')}
            </button>
            <button type="submit" disabled={sending} className={btnPrimaryCls}>
              <Send className="w-3.5 h-3.5" />
              <span>
                {sending
                  ? bi(lang, 'جاري الإرسال عبر Gmail...', 'Sending via Gmail...')
                  : gmailConnected
                    ? bi(lang, 'تأكيد وإرسال عبر Gmail', 'Confirm & Send via Gmail')
                    : bi(lang, 'ربط Gmail وتأكيد الإرسال', 'Connect Gmail & Send')}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
