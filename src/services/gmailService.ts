import { GoogleAuthProvider, reauthenticateWithPopup, signInWithPopup } from 'firebase/auth';
import { auth } from '../firebase';
import { Lang } from '../types/accounting';

export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

// In-memory cache ONLY (never stored in localStorage/sessionStorage)
let cachedGmailAccessToken: string | null = null;

export function hasGmailAccessToken(): boolean {
  return Boolean(cachedGmailAccessToken);
}

export function clearGmailAccessToken(): void {
  cachedGmailAccessToken = null;
}

export function getSharedAppUrl(): string {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  if (origin.includes('ais-dev-')) {
    return origin.replace('ais-dev-', 'ais-pre-');
  }
  return origin;
}

function buildGmailProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  for (const scope of GMAIL_SCOPES) {
    provider.addScope(scope);
  }
  const params: Record<string, string> = {
    prompt: 'consent select_account',
  };
  if (auth.currentUser?.email) {
    params.login_hint = auth.currentUser.email;
  }
  provider.setCustomParameters(params);
  return provider;
}

export async function connectGmailSendAccess(): Promise<string> {
  const provider = buildGmailProvider();
  const currentUser = auth.currentUser;

  const isGoogleUser = Boolean(
    currentUser && currentUser.providerData.some((p) => p.providerId === 'google.com')
  );

  const result =
    currentUser && isGoogleUser
      ? await reauthenticateWithPopup(currentUser, provider)
      : await signInWithPopup(auth, provider);

  const credential = GoogleAuthProvider.credentialFromResult(result);
  const token = credential?.accessToken;
  if (!token) {
    throw new Error('GMAIL_NO_ACCESS_TOKEN');
  }
  cachedGmailAccessToken = token;
  return token;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return uint8ToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function encodeMimeWord(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return `=?UTF-8?B?${uint8ToBase64(bytes)}?=`;
}

function wrapBase64(b64: string): string {
  return b64.replace(/(.{76})/g, '$1\r\n');
}

function buildRawRfc2822Email(to: string, subject: string, body: string): string {
  const bodyBytes = new TextEncoder().encode(body);
  const bodyB64 = wrapBase64(uint8ToBase64(bodyBytes));
  const mime = [
    `To: ${to}`,
    `Subject: ${encodeMimeWord(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    bodyB64,
  ].join('\r\n');

  return toBase64Url(mime);
}

export async function sendGmailMessage(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  const toClean = params.to.trim();
  if (!toClean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toClean)) {
    throw new Error('INVALID_RECIPIENT_EMAIL');
  }

  let token = cachedGmailAccessToken;
  if (!token) {
    token = await connectGmailSendAccess();
  }

  const raw = buildRawRfc2822Email(toClean, params.subject.trim(), params.body);

  const postMessage = async (accessToken: string) =>
    fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });

  let res = await postMessage(token);

  if (res.status === 401 || res.status === 403) {
    clearGmailAccessToken();
    token = await connectGmailSendAccess();
    res = await postMessage(token);
  }

  if (!res.ok) {
    let errDetail = '';
    try {
      const errJson = (await res.json()) as { error?: { message?: string } };
      errDetail = errJson?.error?.message || '';
    } catch {
      // ignore json parse error
    }
    throw new Error(errDetail || `GMAIL_API_ERROR_${res.status}`);
  }
}

export function buildGoogleInviteEmailContent(
  lang: Lang,
  opts: {
    displayName: string;
    email: string;
    roleLabel: string;
    appUrl?: string;
  }
): { subject: string; body: string } {
  const url = opts.appUrl || getSharedAppUrl();
  if (lang === 'ar') {
    return {
      subject: 'دعوة للدخول إلى نظام الحسابات والعمليات - BEST UNITED',
      body: [
        `مرحباً ${opts.displayName}،`,
        '',
        'تمت مشاركة نظام الحسابات والعمليات الخاص بشركة BEST UNITED TRAVEL معك.',
        `الصلاحية الممنوحة: ${opts.roleLabel}`,
        `البريد المصرّح به: ${opts.email}`,
        '',
        'لفتح النظام والعمل على نفس البيانات:',
        `1. افتح الرابط التالي من جهازك: ${url}`,
        '2. اضغط على زر «فتح السستم بحساب Google (نفس البيانات)».',
        `3. سجّل الدخول باستخدام بريدك الإلكتروني: ${opts.email}`,
        '',
        'مع التحية،',
        'إدارة النظام',
      ].join('\n'),
    };
  }
  return {
    subject: 'Invitation to BEST UNITED Accounting & Operations System',
    body: [
      `Hello ${opts.displayName},`,
      '',
      'You have been granted access to the BEST UNITED TRAVEL shared company workspace.',
      `Assigned Role: ${opts.roleLabel}`,
      `Authorized Google Email: ${opts.email}`,
      '',
      'How to sign in:',
      `1. Open this link from any device: ${url}`,
      '2. Click "Open System with Google (Same Data)".',
      `3. Sign in using your Google account: ${opts.email}`,
      '',
      'Best regards,',
      'Workspace Administration',
    ].join('\n'),
  };
}

export function buildStaffAccountEmailContent(
  lang: Lang,
  opts: {
    displayName: string;
    username: string;
    password?: string;
    roleLabel: string;
    appUrl?: string;
  }
): { subject: string; body: string } {
  const url = opts.appUrl || getSharedAppUrl();
  if (lang === 'ar') {
    const lines = [
      `مرحباً ${opts.displayName}،`,
      '',
      'تم إنشاء حساب دخول لك في نظام الحسابات والعمليات الخاص بشركة BEST UNITED TRAVEL.',
      `الصلاحية الممنوحة: ${opts.roleLabel}`,
      '',
      'بيانات تسجيل الدخول:',
      `• رابط النظام: ${url}`,
      `• اسم المستخدم (Username): ${opts.username}`,
    ];
    if (opts.password) {
      lines.push(`• كلمة المرور (Password): ${opts.password}`);
    } else {
      lines.push('• كلمة المرور: كلمة المرور المحددة لك من قِبل الإدارة');
    }
    lines.push(
      '',
      'عند فتح الرابط اختر تبويب «دخول الموظفين» وأدخل اسم المستخدم وكلمة المرور.',
      '',
      'مع التحية،',
      'إدارة النظام'
    );
    return {
      subject: 'بيانات الدخول إلى نظام BEST UNITED',
      body: lines.join('\n'),
    };
  }

  const lines = [
    `Hello ${opts.displayName},`,
    '',
    'Your employee account for the BEST UNITED TRAVEL system is ready.',
    `Assigned Role: ${opts.roleLabel}`,
    '',
    'Login Details:',
    `• System URL: ${url}`,
    `• Username: ${opts.username}`,
  ];
  if (opts.password) {
    lines.push(`• Password: ${opts.password}`);
  } else {
    lines.push('• Password: Use the password assigned by your administrator');
  }
  lines.push(
    '',
    'Open the link, stay on the "Employee Login" tab, and enter your username and password.',
    '',
    'Best regards,',
    'Workspace Administration'
  );
  return {
    subject: 'Your BEST UNITED System Login Details',
    body: lines.join('\n'),
  };
}

export function buildMailtoHref(to: string, subject: string, body: string): string {
  const cleanTo = encodeURIComponent(to.trim());
  const cleanSub = encodeURIComponent(subject);
  const cleanBody = encodeURIComponent(body);
  return `mailto:${cleanTo}?subject=${cleanSub}&body=${cleanBody}`;
}

export function buildGmailComposeHref(to: string, subject: string, body: string): string {
  const params = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to: to.trim(),
    su: subject,
    body,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}
