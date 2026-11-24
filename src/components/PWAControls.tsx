import React, { useState } from 'react';
import { Download, ExternalLink, Laptop, WifiOff, X } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { bi } from '../i18n/translations';
import { Lang } from '../types/accounting';

interface PWAInstallButtonProps {
  lang: Lang;
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ lang, className = '' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const isEmbedded = typeof window !== 'undefined' && window.self !== window.top;
  const currentAppUrl = typeof window !== 'undefined' ? window.location.href : '/';

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuide(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        title={bi(lang, 'تثبيت النظام على الجهاز للعمل أوفلاين', 'Install app for offline access')}
        className={`inline-flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-semibold transition cursor-pointer whitespace-nowrap ${className}`}
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>{bi(lang, 'تثبيت أوفلاين', 'Install Offline')}</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                  <Laptop className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {isIOS
                      ? bi(lang, 'تثبيت على iPhone / iPad', 'Install on iPhone / iPad')
                      : bi(lang, 'تثبيت النظام للفتح أوفلاين', 'Install App for Offline Use')}
                  </h3>
                  <p className="text-xs text-slate-500">BEST UNITED Accounting 1448</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="space-y-2 text-xs text-slate-700 leading-relaxed list-decimal list-inside bg-slate-50 border border-slate-200 rounded-xl p-4">
                <li>
                  {bi(
                    lang,
                    'اضغط على زر المشاركة (Share) في شريط متصفح Safari بالأسفل.',
                    'Tap the Share button in the Safari toolbar.'
                  )}
                </li>
                <li>
                  {bi(
                    lang,
                    'مرّر للأسفل واختر «إضافة إلى الشاشة الرئيسية» (Add to Home Screen).',
                    'Scroll down and tap "Add to Home Screen".'
                  )}
                </li>
                <li>
                  {bi(
                    lang,
                    'بعدها يمكنك فتح النظام من الشاشة الرئيسية والعمل بدون إنترنت.',
                    'You can then launch the app from your Home Screen even offline.'
                  )}
                </li>
              </ol>
            ) : (
              <div className="space-y-3 text-xs text-slate-700 leading-relaxed">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                  <p className="font-semibold text-slate-900">
                    {bi(lang, 'خطوات التثبيت على الكمبيوتر أو الأندرويد:', 'Steps on Desktop Chrome / Edge or Android:')}
                  </p>
                  <ol className="space-y-1.5 list-decimal list-inside">
                    {isEmbedded && (
                      <li>
                        {bi(
                          lang,
                          'افتح النظام في نافذة Chrome مستقلة بالضغط على «فتح في Chrome» أدناه.',
                          'First open the app in a standalone Chrome tab using "Open in Chrome" below.'
                        )}
                      </li>
                    )}
                    <li>
                      {bi(
                        lang,
                        'اضغط على أيقونة التثبيت في شريط العنوان أو قائمة المتصفح (⋮) ثم اختر «تثبيت BEST UNITED».',
                        'Click the Install icon in the address bar or browser menu (⋮) and choose "Install BEST UNITED".'
                      )}
                    </li>
                    <li>
                      {bi(
                        lang,
                        'سيتم حفظ جميع البيانات والملفات تلقائياً للعمل وفتح النظام أوفلاين ومزامنة التعديلات فور عودة الإنترنت.',
                        'App assets and your cached data are saved locally so you can work offline and auto-sync when online.'
                      )}
                    </li>
                  </ol>
                </div>

                {isEmbedded && (
                  <a
                    href={currentAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full h-10 rounded-xl bg-[#1d4ed8] hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-2 transition"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>{bi(lang, 'فتح في Chrome للتثبيت المباشر', 'Open in Chrome to Install')}</span>
                  </a>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition cursor-pointer"
            >
              {bi(lang, 'إغلاق', 'Close')}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC<{ lang: Lang }> = ({ lang }) => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="no-print fixed bottom-4 start-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg border border-amber-400/50"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>
        {bi(
          lang,
          'وضع الأوفلاين — يتم العمل على البيانات المحفوظة محلياً وستتم المزامنة تلقائياً عند توفر الإنترنت',
          'Offline Mode — Working on cached local data, auto-syncing when online'
        )}
      </span>
    </div>
  );
};
