import React, { useState } from 'react';
import {
  AlertTriangle,
  Bus,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Globe,
  ShieldCheck,
  UserCheck,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { bi, tKey } from '../i18n/translations';
import { normalizeUsername } from '../firebase';
import { PWAInstallButton } from './PWAControls';

const FIREBASE_AUTH_PROVIDERS_URL =
  'https://console.firebase.google.com/project/coral-iridium-q3flw/authentication/providers';

export const LoginScreen: React.FC = () => {
  const {
    lang,
    toggleLang,
    signInWithGoogle,
    signInWithUsernamePassword,
    signingIn,
    authError,
    authNeedsConsoleEnable,
  } = useAuth();
  const isAr = lang === 'ar';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  const isEmbedded = typeof window !== 'undefined' && window.self !== window.top;
  const currentAppUrl = typeof window !== 'undefined' ? window.location.href : '/';

  const handleStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await signInWithUsernamePassword(username, password);
  };

  const modules = [
    {
      icon: FileSpreadsheet,
      title: isAr ? 'حسابات التأشيرات واستيراد Excel' : 'Visa Accounting & Excel Import',
      desc: isAr
        ? 'تسعير بالريال والدولار ومقارنة الربحية المباشرة'
        : 'SAR/USD pricing with real-time margin tracking',
    },
    {
      icon: Bus,
      title: isAr ? 'عمليات النقل والدورة التشغيلية' : 'Transport & 5-Stage Cycle Operations',
      desc: isAr
        ? 'ربط مباشر مع المجموعات وترحيل تلقائي لكشوف الحساب'
        : 'Group-linked trips synced automatically to ledgers',
    },
    {
      icon: Wallet,
      title: isAr ? 'الخزنة والسيولة والرواتب' : 'Treasury, Liquidity & Payroll',
      desc: isAr
        ? 'توحيد السندات والخزنة والبنك والعهد ومسيرات الموظفين'
        : 'Unified cashbox, bank, custody, vouchers & payroll',
    },
  ];

  const normalizedPreview = normalizeUsername(username);

  const googleLogoSvg = (
    <svg className="w-5 h-5 bg-white rounded-full p-0.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );

  return (
    <div className="min-h-screen bg-[#f6f8fb] flex flex-col">
      {/* Top utility header */}
      <header className="w-full px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 p-1 flex items-center justify-center shrink-0">
            <img src="/logo.png" alt="BEST UNITED TRAVEL" className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="font-bold text-slate-900 text-sm tracking-wide">BEST UNITED TRAVEL</div>
            <div className="text-xs text-slate-500">
              {isAr ? 'نظام الحسابات المتكامل · 1448' : 'Integrated Accounting Suite · 1448'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={signingIn}
            onClick={() => void signInWithGoogle()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#1d4ed8] hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap"
          >
            {googleLogoSvg}
            <span>{signingIn ? tKey(lang, 'signingIn') : tKey(lang, 'openGoogleSystem')}</span>
          </button>

          <PWAInstallButton lang={lang} className="!h-8 !rounded-lg" />

          {isEmbedded && (
            <a
              href={currentAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{tKey(lang, 'openExternalTab')}</span>
            </a>
          )}

          <button
            type="button"
            onClick={toggleLang}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer whitespace-nowrap"
          >
            <Globe className="w-4 h-4" />
            <span>{isAr ? 'English' : 'العربية'}</span>
          </button>
        </div>
      </header>

      {/* Main split workspace gate */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          {/* Brand & System Overview Panel */}
          <div className="lg:col-span-7 bg-[#0f1e36] text-white p-7 sm:p-10 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-4 pb-6 border-b border-white/10">
                <div className="w-18 h-18 rounded-2xl bg-white p-1.5 flex items-center justify-center shrink-0">
                  <img src="/logo.png" alt="BEST UNITED TRAVEL" className="w-full h-full object-contain" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight">BEST UNITED TRAVEL</h1>
                  <p className="text-xs sm:text-sm text-slate-300 mt-1">{tKey(lang, 'signInSubtitle')}</p>
                </div>
              </div>

              <div className="mt-7 space-y-4">
                {modules.map((m, idx) => {
                  const Icon = m.icon;
                  return (
                    <div
                      key={idx}
                      className="flex items-start gap-3.5 p-3.5 rounded-xl bg-white/5 border border-white/10"
                    >
                      <div className="w-9 h-9 rounded-lg bg-[#1d4ed8]/30 border border-blue-400/25 flex items-center justify-center shrink-0 text-blue-300">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">{m.title}</div>
                        <div className="text-xs text-slate-300 mt-0.5 leading-relaxed">{m.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-8 pt-5 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
              <span>{isAr ? 'الموسم المالي والتشغيلي 1448 هـ' : 'Operational & Fiscal Season 1448H'}</span>
              <span className="font-mono-num">SAR / USD · FX 3.75</span>
            </div>
          </div>

          {/* Login Action Panel */}
          <div className="lg:col-span-5 p-7 sm:p-9 flex flex-col justify-center bg-white">
            <div className="mb-4 flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 p-1.5 flex items-center justify-center shrink-0">
                <img src="/logo.png" alt="BEST UNITED TRAVEL" className="w-full h-full object-contain" />
              </div>
              <div>
                <div className="text-xs font-bold text-[#1d4ed8] uppercase tracking-wider">BEST UNITED</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {isAr ? 'بوابة الدخول الآمنة' : 'Secure Access Portal'}
                </div>
              </div>
            </div>

            <h2 className="text-xl font-bold text-slate-900">{tKey(lang, 'signInTitle')}</h2>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">{tKey(lang, 'signInDesc')}</p>

            {authError && (
              <div className="mt-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium leading-relaxed space-y-2">
                <div>{authError}</div>
                {authNeedsConsoleEnable && (
                  <a
                    href={FIREBASE_AUTH_PROVIDERS_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 font-bold text-[#1d4ed8] underline"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>
                      {bi(
                        lang,
                        'افتح Firebase Console لتفعيل Email/Password',
                        'Open Firebase Console to enable Email/Password'
                      )}
                    </span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}

            {/* Direct Google Owner Access Button (Same Cloud Data) */}
            <div className="mt-5 space-y-2.5">
              <button
                type="button"
                disabled={signingIn}
                onClick={() => void signInWithGoogle()}
                className="w-full h-11 px-4 rounded-xl bg-[#1d4ed8] hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2.5 transition cursor-pointer shadow-sm"
              >
                {googleLogoSvg}
                <span>{signingIn ? tKey(lang, 'signingIn') : tKey(lang, 'openGoogleSystem')}</span>
              </button>

              {isEmbedded && (
                <a
                  href={currentAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-10 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 font-semibold text-xs flex items-center justify-center gap-2 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-[#1d4ed8]" />
                  <span>{tKey(lang, 'openExternalTab')}</span>
                </a>
              )}
            </div>

            {/* Divider */}
            <div className="my-5 flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-[11px] font-bold text-slate-400">
                {bi(lang, 'أو دخول الموظفين', 'OR EMPLOYEE SIGN IN')}
              </span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            {/* Employee Username & Password Form */}
            <form onSubmit={handleStaffSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {tKey(lang, 'lblUsername')}
                </label>
                <input
                  type="text"
                  required
                  autoComplete="username"
                  dir="ltr"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. ahmed"
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-sm font-mono-num text-slate-900 focus:outline-none focus:border-[#1d4ed8]"
                />
                {normalizedPreview && (
                  <div className="mt-1 text-[11px] text-slate-400 font-mono-num" dir="ltr">
                    @{normalizedPreview}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {tKey(lang, 'lblPassword')}
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="current-password"
                    dir="ltr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full h-10 px-3.5 pe-10 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-sm font-mono-num text-slate-900 focus:outline-none focus:border-[#1d4ed8]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((s) => !s)}
                    className="absolute inset-y-0 end-0 px-3 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={signingIn}
                className="w-full h-11 px-5 rounded-xl bg-[#0f1e36] hover:bg-slate-800 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2 transition cursor-pointer shadow-sm"
              >
                <UserCheck className="w-4 h-4" />
                <span>{signingIn ? tKey(lang, 'signingIn') : tKey(lang, 'btnSignInStaff')}</span>
              </button>
            </form>

            <div className="mt-5 p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2.5 text-[11px] text-slate-600 leading-relaxed">
              <ShieldCheck className="w-4 h-4 text-[#0f766e] shrink-0 mt-0.5" />
              <span>{tKey(lang, 'signInSecurityNote')}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
