import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected application error',
    };
  }

  render() {
    if (this.state.hasError) {
      const isAr = document.documentElement.lang !== 'en';
      return (
        <div className="min-h-screen bg-[#f6f8fb] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 shadow-sm text-center">
            <img src="/logo.png" alt="BEST UNITED" className="w-14 h-14 mx-auto mb-4 object-contain" />
            <h2 className="text-lg font-bold text-slate-900 mb-2">
              {isAr ? 'حدث خطأ غير متوقع في النظام' : 'An unexpected error occurred'}
            </h2>
            <p className="text-sm text-slate-600 mb-5 leading-relaxed">
              {isAr
                ? 'يرجى إعادة تحميل الصفحة للمتابعة. إذا استمرت المشكلة تأكد من صلاحيات الاتصال والحساب.'
                : 'Please reload the page to continue. If the issue persists, verify your connection and session.'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-lg bg-[#1d4ed8] text-white text-sm font-semibold hover:brightness-95 cursor-pointer"
            >
              {isAr ? 'إعادة تحميل النظام' : 'Reload System'}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
