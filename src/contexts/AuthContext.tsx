import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  OperationType,
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  normalizeUsername,
  runOfflineAwareWrite,
  staffAccountEmail,
} from '../firebase';
import {
  ALL_PAGE_IDS,
  LANG_STORAGE_KEY,
  Lang,
  PageId,
  StaffAccount,
  UserProfile,
  WorkspaceInvite,
  clampStr,
} from '../types/accounting';
import { clearGmailAccessToken } from '../services/gmailService';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  staffAccount: StaffAccount | null;
  sharedInvite: WorkspaceInvite | null;
  workspaceId: string | null;
  isWorkspaceOwner: boolean;
  allowedPages: PageId[];
  authReady: boolean;
  profileReady: boolean;
  signingIn: boolean;
  authError: string | null;
  authNeedsConsoleEnable: boolean;
  lang: Lang;
  toggleLang: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithUsernamePassword: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfileRate: (rate: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const OFFLINE_SESSION_KEY = 'best_united_offline_session_v1';

interface CachedOfflineSession {
  uid: string;
  profile: UserProfile;
  staffAccount: StaffAccount | null;
  sharedInvite: WorkspaceInvite | null;
  workspaceId: string;
  isWorkspaceOwner: boolean;
  allowedPages: PageId[];
}

function saveCachedOfflineSession(session: CachedOfflineSession): void {
  try {
    localStorage.setItem(OFFLINE_SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore storage quota errors
  }
}

function loadCachedOfflineSession(uid: string): CachedOfflineSession | null {
  try {
    const raw = localStorage.getItem(OFFLINE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedOfflineSession;
    if (!parsed || parsed.uid !== uid || !parsed.workspaceId || !parsed.profile) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearCachedOfflineSession(): void {
  try {
    localStorage.removeItem(OFFLINE_SESSION_KEY);
  } catch {
    // ignore storage errors
  }
}

function isOfflineFirestoreErr(err: unknown): boolean {
  const code = String((err as { code?: string })?.code || '').toLowerCase();
  const msg = String((err as { message?: string })?.message || err || '').toLowerCase();
  return (
    code === 'unavailable' ||
    code === 'failed-precondition' ||
    msg.includes('offline') ||
    msg.includes('unavailable') ||
    msg.includes('network')
  );
}

function getInitialLang(): Lang {
  try {
    return localStorage.getItem(LANG_STORAGE_KEY) === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [staffAccount, setStaffAccount] = useState<StaffAccount | null>(null);
  const [sharedInvite, setSharedInvite] = useState<WorkspaceInvite | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [isWorkspaceOwner, setIsWorkspaceOwner] = useState(false);
  const [allowedPages, setAllowedPages] = useState<PageId[]>(ALL_PAGE_IDS);

  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNeedsConsoleEnable, setAuthNeedsConsoleEnable] = useState(false);
  const [lang, setLang] = useState<Lang>(getInitialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title =
      lang === 'ar'
        ? 'BEST UNITED | نظام حسابات التأشيرات والنقل'
        : 'BEST UNITED | Visa & Transport Accounting';
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // ignore storage errors
    }
  }, [lang]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);

      if (!firebaseUser) {
        clearGmailAccessToken();
        setProfile(null);
        setStaffAccount(null);
        setSharedInvite(null);
        setWorkspaceId(null);
        setIsWorkspaceOwner(false);
        setAllowedPages(ALL_PAGE_IDS);
        setProfileReady(false);
        return;
      }

      setProfileReady(false);

      const applyOfflineFallback = (): boolean => {
        const cached = loadCachedOfflineSession(firebaseUser.uid);
        if (!cached) return false;
        setStaffAccount(cached.staffAccount);
        setSharedInvite(cached.sharedInvite);
        setWorkspaceId(cached.workspaceId);
        setIsWorkspaceOwner(cached.isWorkspaceOwner);
        setAllowedPages(cached.allowedPages?.length ? cached.allowedPages : ['dashboard']);
        setProfile(cached.profile);
        setAuthError(null);
        setAuthNeedsConsoleEnable(false);
        setProfileReady(true);
        return true;
      };

      if (typeof navigator !== 'undefined' && !navigator.onLine && applyOfflineFallback()) {
        return;
      }

      const isGoogleVerified =
        firebaseUser.emailVerified &&
        firebaseUser.providerData.some((p) => p.providerId === 'google.com');
      const isPasswordProvider =
        !isGoogleVerified &&
        firebaseUser.providerData.some((p) => p.providerId === 'password');

      if (isPasswordProvider) {
        const staffPath = `staffAccounts/${firebaseUser.uid}`;
        try {
          let staffSnap;
          try {
            staffSnap = await getDocFromServer(doc(db, 'staffAccounts', firebaseUser.uid));
          } catch (serverErr) {
            if (isOfflineFirestoreErr(serverErr)) {
              staffSnap = await getDoc(doc(db, 'staffAccounts', firebaseUser.uid));
            } else {
              throw serverErr;
            }
          }
          if (!staffSnap.exists()) {
            setAuthError(
              getInitialLang() === 'ar'
                ? 'لم يتم ربط حساب الموظف بأي شركة أو تم حذفه من قِبل الإدارة. يجب على صاحب الحساب إنشاء وربط اليوزر والباسورد من داخل النظام (الموظفون والرواتب ← حسابات الدخول والصلاحيات).'
                : 'Employee account is not linked to a company workspace or was removed. The workspace owner must create & link this username and password inside the app (Employees & Payroll -> Login Accounts).'
            );
            await signOut(auth);
            return;
          }
          const st = staffSnap.data() as StaffAccount;
          if (!st.active) {
            setAuthError(
              getInitialLang() === 'ar'
                ? 'تم إيقاف حساب الموظف من قِبل مدير النظام.'
                : 'Your employee account has been deactivated by the administrator.'
            );
            await signOut(auth);
            return;
          }

          const wsRef = doc(db, 'users', st.workspaceId);
          const wsSnap = await getDoc(wsRef);
          const wsData = wsSnap.exists() ? wsSnap.data() : {};

          const pages =
            st.role === 'admin'
              ? ALL_PAGE_IDS.filter((p) => p !== 'settings')
              : (st.permissions || ['dashboard']).filter((p): p is PageId => ALL_PAGE_IDS.includes(p));

          const resolvedPages = pages.length > 0 ? pages : (['dashboard'] as PageId[]);
          const resolvedProfile: UserProfile = {
            uid: st.workspaceId,
            displayName: clampStr(st.displayName || st.username, 120),
            photoURL: '',
            rate: Number(wsData.rate) > 0 ? Number(wsData.rate) : 3.75,
            lang: getInitialLang(),
          };
          setStaffAccount(st);
          setSharedInvite(null);
          setWorkspaceId(st.workspaceId);
          setIsWorkspaceOwner(false);
          setAllowedPages(resolvedPages);
          setProfile(resolvedProfile);
          saveCachedOfflineSession({
            uid: firebaseUser.uid,
            profile: resolvedProfile,
            staffAccount: st,
            sharedInvite: null,
            workspaceId: st.workspaceId,
            isWorkspaceOwner: false,
            allowedPages: resolvedPages,
          });
          setAuthError(null);
          setAuthNeedsConsoleEnable(false);
          setProfileReady(true);
        } catch (err) {
          if (isOfflineFirestoreErr(err) && applyOfflineFallback()) {
            return;
          }
          handleFirestoreError(err, OperationType.GET, staffPath);
        }
        return;
      }

      // Check if this verified Google account is invited to share an Owner's workspace
      const normalizedEmail = (firebaseUser.email || '').trim().toLowerCase();
      if (firebaseUser.emailVerified && normalizedEmail) {
        try {
          const invSnap = await getDocs(
            query(collection(db, 'workspaceInvites'), where('email', '==', normalizedEmail))
          );
          if (!invSnap.empty) {
            const allInvites = invSnap.docs.map((d) => d.data() as WorkspaceInvite);
            const activeInvite = allInvites.find((x) => x.active && x.workspaceId !== firebaseUser.uid);

            if (activeInvite) {
              const memberPath = `users/${activeInvite.workspaceId}/googleMembers/${firebaseUser.uid}`;
              const memberRef = doc(db, 'users', activeInvite.workspaceId, 'googleMembers', firebaseUser.uid);
              const memberSnap = await getDoc(memberRef);
              const targetDisplayName = clampStr(
                activeInvite.displayName || firebaseUser.displayName || normalizedEmail,
                120
              );

              if (!memberSnap.exists()) {
                await setDoc(memberRef, {
                  uid: firebaseUser.uid,
                  workspaceId: activeInvite.workspaceId,
                  inviteId: activeInvite.id,
                  email: normalizedEmail,
                  displayName: targetDisplayName,
                  role: activeInvite.role,
                  active: true,
                  permissions: activeInvite.permissions,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
              } else {
                const cur = memberSnap.data();
                const permsChanged =
                  JSON.stringify(cur.permissions || []) !== JSON.stringify(activeInvite.permissions || []);
                if (
                  cur.inviteId !== activeInvite.id ||
                  cur.role !== activeInvite.role ||
                  cur.active !== true ||
                  cur.displayName !== targetDisplayName ||
                  permsChanged
                ) {
                  await updateDoc(memberRef, {
                    inviteId: activeInvite.id,
                    displayName: targetDisplayName,
                    role: activeInvite.role,
                    active: true,
                    permissions: activeInvite.permissions,
                    updatedAt: serverTimestamp(),
                  });
                }
              }

              const wsSnap = await getDoc(doc(db, 'users', activeInvite.workspaceId));
              const wsData = wsSnap.exists() ? wsSnap.data() : {};
              const pages =
                activeInvite.role === 'admin'
                  ? ALL_PAGE_IDS.filter((p) => p !== 'settings')
                  : (activeInvite.permissions || ['dashboard']).filter((p): p is PageId =>
                      ALL_PAGE_IDS.includes(p)
                    );

              const resolvedPages = pages.length > 0 ? pages : (['dashboard'] as PageId[]);
              const resolvedProfile: UserProfile = {
                uid: activeInvite.workspaceId,
                displayName: clampStr(firebaseUser.displayName || targetDisplayName, 120),
                photoURL: clampStr(firebaseUser.photoURL || '', 500),
                rate: Number(wsData.rate) > 0 ? Number(wsData.rate) : 3.75,
                lang: getInitialLang(),
              };

              setStaffAccount(null);
              setSharedInvite(activeInvite);
              setWorkspaceId(activeInvite.workspaceId);
              setIsWorkspaceOwner(false);
              setAllowedPages(resolvedPages);
              setProfile(resolvedProfile);
              saveCachedOfflineSession({
                uid: firebaseUser.uid,
                profile: resolvedProfile,
                staffAccount: null,
                sharedInvite: activeInvite,
                workspaceId: activeInvite.workspaceId,
                isWorkspaceOwner: false,
                allowedPages: resolvedPages,
              });
              setAuthError(null);
              setAuthNeedsConsoleEnable(false);
              setProfileReady(true);
              void memberPath;
              return;
            }

            // Invite exists for this email but is suspended
            const anySuspended = allInvites.some((x) => !x.active && x.workspaceId !== firebaseUser.uid);
            if (anySuspended) {
              setAuthError(
                getInitialLang() === 'ar'
                  ? 'تم إيقاف صلاحية مشاركة مساحة العمل لهذا البريد الإلكتروني من قِبل مالك النظام.'
                  : 'Shared workspace access for this email has been suspended by the owner.'
              );
              await signOut(auth);
              return;
            }
          }
        } catch (err) {
          if (isOfflineFirestoreErr(err) && applyOfflineFallback()) {
            return;
          }
          handleFirestoreError(err, OperationType.LIST, 'workspaceInvites');
        }
      }

      // Workspace Owner (Google Login)
      const userDocPath = `users/${firebaseUser.uid}`;
      const privateDocPath = `users/${firebaseUser.uid}/private/info`;

      try {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const privateRef = doc(db, 'users', firebaseUser.uid, 'private', 'info');
        const snap = await getDoc(userRef);

        let ownerProfile: UserProfile;
        if (!snap.exists()) {
          const initialLang = getInitialLang();
          const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            displayName: clampStr(firebaseUser.displayName || 'BEST UNITED Owner', 120),
            photoURL: clampStr(firebaseUser.photoURL || '', 500),
            rate: 3.75,
            lang: initialLang,
          };

          const batch = writeBatch(db);
          batch.set(userRef, {
            ...newProfile,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          batch.set(privateRef, {
            uid: firebaseUser.uid,
            email: clampStr(firebaseUser.email || 'owner@bestunited.local', 200),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await batch.commit();

          ownerProfile = newProfile;
          setProfile(newProfile);
          setLang(initialLang);
        } else {
          const data = snap.data();
          const loadedProfile: UserProfile = {
            uid: firebaseUser.uid,
            displayName: clampStr(data.displayName || firebaseUser.displayName || '', 120),
            photoURL: clampStr(data.photoURL || firebaseUser.photoURL || '', 500),
            rate: Number(data.rate) > 0 ? Number(data.rate) : 3.75,
            lang: data.lang === 'en' ? 'en' : 'ar',
          };
          ownerProfile = loadedProfile;
          setProfile(loadedProfile);
          setLang(loadedProfile.lang);

          try {
            const pSnap = await getDoc(privateRef);
            if (!pSnap.exists()) {
              const b = writeBatch(db);
              b.set(privateRef, {
                uid: firebaseUser.uid,
                email: clampStr(firebaseUser.email || 'owner@bestunited.local', 200),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
              await b.commit();
            }
          } catch (err) {
            if (!isOfflineFirestoreErr(err)) {
              handleFirestoreError(err, OperationType.WRITE, privateDocPath);
            }
          }
        }

        setStaffAccount(null);
        setSharedInvite(null);
        setWorkspaceId(firebaseUser.uid);
        setIsWorkspaceOwner(true);
        setAllowedPages(ALL_PAGE_IDS);
        saveCachedOfflineSession({
          uid: firebaseUser.uid,
          profile: ownerProfile,
          staffAccount: null,
          sharedInvite: null,
          workspaceId: firebaseUser.uid,
          isWorkspaceOwner: true,
          allowedPages: ALL_PAGE_IDS,
        });
        setAuthError(null);
        setAuthNeedsConsoleEnable(false);
        setProfileReady(true);
      } catch (err) {
        if (isOfflineFirestoreErr(err) && applyOfflineFallback()) {
          return;
        }
        handleFirestoreError(err, OperationType.GET, userDocPath);
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setAuthError(
        lang === 'ar'
          ? 'أنت غير متصل بالإنترنت حالياً. يتطلب تسجيل الدخول لأول مرة اتصالاً بالإنترنت، وبعدها يفتح النظام أوفلاين تلقائياً.'
          : 'You are currently offline. Initial sign-in requires internet access, after which the app opens automatically offline.'
      );
      return;
    }
    setSigningIn(true);
    setAuthError(null);
    setAuthNeedsConsoleEnable(false);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-blocked') {
        if (window.self === window.top) {
          try {
            await signInWithRedirect(auth, googleProvider);
            return;
          } catch {
            // fall through to message
          }
        }
        setAuthError(
          lang === 'ar'
            ? 'قام المتصفح بحظر نافذة تسجيل الدخول، يرجى السماح بالنوافذ المنبثقة ثم المحاولة مرة أخرى.'
            : 'Popup was blocked by browser. Please allow popups and try again.'
        );
      } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        const insideFrame = typeof window !== 'undefined' && window.self !== window.top;
        setAuthError(
          lang === 'ar'
            ? insideFrame
              ? 'تم إغلاق نافذة تسجيل الدخول قبل الإتمام (قد يقيّد المتصفح النوافذ المنبثقة داخل إطار المعاينة). اضغط «فتح في متصفح Chrome بنافذة مستقلة» أدناه ثم سجّل الدخول بحساب Google.'
              : 'تم إغلاق نافذة تسجيل الدخول قبل إتمام اختيار حساب Google. اضغط زر الدخول مرة أخرى وأكمل اختيار الحساب دون إغلاق النافذة.'
            : insideFrame
              ? 'Sign-in popup was closed before completing (embedded preview frames can block Google popups). Click "Open in Standalone Chrome Tab" below and sign in there.'
              : 'Sign-in window was closed before completing. Click Sign In again and finish selecting your Google account.'
        );
      } else if (code === 'auth/unauthorized-domain') {
        setAuthError(
          lang === 'ar'
            ? `النطاق الحالي غير مصرح به في Firebase Auth (${window.location.hostname}).`
            : `Current domain is not authorized in Firebase Auth (${window.location.hostname}).`
        );
      } else {
        setAuthError(
          lang === 'ar'
            ? `تعذر إتمام تسجيل الدخول${code ? ` (${code})` : ''}. يرجى المحاولة مرة أخرى.`
            : `Unable to sign in${code ? ` (${code})` : ''}. Please try again.`
        );
      }
    } finally {
      setSigningIn(false);
    }
  }, [lang]);

  const signInWithUsernamePassword = useCallback(
    async (username: string, password: string) => {
      const cleaned = normalizeUsername(username);
      if (!cleaned && !username.includes('@')) {
        setAuthError(
          lang === 'ar'
            ? 'يرجى إدخال اسم المستخدم بحروف إنجليزية صحيحة'
            : 'Please enter a valid username (letters/numbers)'
        );
        return;
      }
      if (!password || password.length < 6) {
        setAuthError(
          lang === 'ar'
            ? 'كلمة المرور يجب ألا تقل عن 6 أحرف'
            : 'Password must be at least 6 characters'
        );
        return;
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setAuthError(
          lang === 'ar'
            ? 'أنت غير متصل بالإنترنت حالياً. يتطلب تسجيل الدخول لأول مرة اتصالاً بالإنترنت، وبعدها يفتح النظام أوفلاين تلقائياً.'
            : 'You are currently offline. Initial sign-in requires internet access, after which the app opens automatically offline.'
        );
        return;
      }

      setSigningIn(true);
      setAuthError(null);
      setAuthNeedsConsoleEnable(false);
      try {
        await signInWithEmailAndPassword(auth, staffAccountEmail(username), password);
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code || '';
        if (code === 'auth/operation-not-allowed') {
          setAuthNeedsConsoleEnable(true);
          setAuthError(
            lang === 'ar'
              ? 'يجب تفعيل خيار (Email/Password) من لوحة تحكم Firebase Auth لتشغيل دخول الموظفين.'
              : 'Email/Password sign-in provider must be enabled in Firebase Authentication Console.'
          );
        } else if (
          code === 'auth/invalid-credential' ||
          code === 'auth/user-not-found' ||
          code === 'auth/wrong-password'
        ) {
          setAuthError(
            lang === 'ar'
              ? 'اسم المستخدم أو كلمة المرور غير صحيحة.'
              : 'Invalid username or password.'
          );
        } else if (code === 'auth/too-many-requests') {
          setAuthError(
            lang === 'ar'
              ? 'محاولات دخول متكررة، يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.'
              : 'Too many attempts. Please wait a moment and try again.'
          );
        } else if (code === 'auth/user-disabled') {
          setAuthError(
            lang === 'ar'
              ? 'تم تعطيل هذا الحساب.'
              : 'This account has been disabled.'
          );
        } else {
          setAuthError(
            lang === 'ar'
              ? `تعذر تسجيل الدخول${code ? ` (${code})` : ''}.`
              : `Sign-in failed${code ? ` (${code})` : ''}.`
          );
        }
      } finally {
        setSigningIn(false);
      }
    },
    [lang]
  );

  const logout = useCallback(async () => {
    setAuthError(null);
    clearGmailAccessToken();
    clearCachedOfflineSession();
    await signOut(auth);
  }, []);

  const toggleLang = useCallback(() => {
    setLang((prev) => {
      const next: Lang = prev === 'ar' ? 'en' : 'ar';
      if (user && profileReady && isWorkspaceOwner) {
        const userRef = doc(db, 'users', user.uid);
        void runOfflineAwareWrite(
          updateDoc(userRef, {
            lang: next,
            updatedAt: serverTimestamp(),
          }),
          OperationType.UPDATE,
          `users/${user.uid}`
        );
      }
      return next;
    });
  }, [user, profileReady, isWorkspaceOwner]);

  const updateProfileRate = useCallback(
    async (rate: number) => {
      if (!user || !isWorkspaceOwner) return;
      const cleanRate = Number(rate);
      if (!(cleanRate > 0 && cleanRate <= 1000)) return;
      const path = `users/${user.uid}`;
      await runOfflineAwareWrite(
        updateDoc(doc(db, 'users', user.uid), {
          rate: cleanRate,
          updatedAt: serverTimestamp(),
        }),
        OperationType.UPDATE,
        path
      );
      setProfile((prev) => {
        const updated = prev ? { ...prev, rate: cleanRate } : prev;
        if (updated) {
          const cur = loadCachedOfflineSession(user.uid);
          if (cur) saveCachedOfflineSession({ ...cur, profile: updated });
        }
        return updated;
      });
    },
    [user, isWorkspaceOwner]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        staffAccount,
        sharedInvite,
        workspaceId,
        isWorkspaceOwner,
        allowedPages,
        authReady,
        profileReady,
        signingIn,
        authError,
        authNeedsConsoleEnable,
        lang,
        toggleLang,
        signInWithGoogle,
        signInWithUsernamePassword,
        logout,
        updateProfileRate,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
