/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginScreen } from './components/LoginScreen';
import { AccountingSystem } from './components/AccountingSystem';
import { OfflineIndicator } from './components/PWAControls';
import { bi } from './i18n/translations';

const AuthGate: React.FC = () => {
  const { user, authReady, profileReady, lang } = useAuth();

  if (!authReady || (user && !profileReady)) {
    return (
      <div className="min-h-screen bg-[#f6f8fb] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#0f1e36] p-2.5 flex items-center justify-center mb-4">
          <img src="/logo.png" alt="BEST UNITED" className="w-full h-full object-contain" />
        </div>
        <div className="w-8 h-8 rounded-full border-[3px] border-slate-200 border-t-[#1d4ed8] animate-spin mb-3" />
        <p className="text-sm font-semibold text-slate-700">
          {bi(lang, 'جاري التحقق من جلسة الدخول...', 'Verifying your session...')}
        </p>
        <OfflineIndicator lang={lang} />
      </div>
    );
  }

  return (
    <>
      {!user ? <LoginScreen /> : <AccountingSystem />}
      <OfflineIndicator lang={lang} />
    </>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ErrorBoundary>
  );
}
