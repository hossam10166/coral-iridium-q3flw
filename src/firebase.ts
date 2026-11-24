import { getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(
  app,
  {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  },
  firebaseConfig.firestoreDatabaseId
);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const STAFF_EMAIL_DOMAIN = 'staff.bestunited.local';

export function normalizeUsername(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._\-]/g, '');
}

export function staffAccountEmail(usernameOrEmail: string): string {
  const trimmed = String(usernameOrEmail || '').trim().toLowerCase();
  if (trimmed.includes('@')) return trimmed;
  return `${normalizeUsername(trimmed)}@${STAFF_EMAIL_DOMAIN}`;
}

export async function createStaffAuthUser(username: string, password: string): Promise<string> {
  const secApp =
    getApps().find((a) => a.name === 'EmployeeCreator') ||
    initializeApp(firebaseConfig, 'EmployeeCreator');
  const secAuth = getAuth(secApp);
  const email = staffAccountEmail(username);
  try {
    const cred = await createUserWithEmailAndPassword(secAuth, email, password);
    const uid = cred.user.uid;
    await firebaseSignOut(secAuth);
    return uid;
  } catch (err) {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/email-already-in-use') {
      try {
        const existingCred = await signInWithEmailAndPassword(secAuth, email, password);
        const uid = existingCred.user.uid;
        await firebaseSignOut(secAuth);
        return uid;
      } catch (signInErr) {
        const signInCode = (signInErr as { code?: string })?.code || '';
        try {
          await firebaseSignOut(secAuth);
        } catch {
          // ignore cleanup errors
        }
        if (
          signInCode === 'auth/wrong-password' ||
          signInCode === 'auth/invalid-credential'
        ) {
          throw new Error('USERNAME_TAKEN_DIFFERENT_PASSWORD');
        }
        throw signInErr;
      }
    }
    try {
      await firebaseSignOut(secAuth);
    } catch {
      // ignore cleanup errors
    }
    throw err;
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function runOfflineAwareWrite<T>(
  writePromise: Promise<T>,
  operationType: OperationType,
  path: string | null
): Promise<T | undefined> {
  try {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return await Promise.race([
        writePromise,
        new Promise<undefined>((resolve) => window.setTimeout(() => resolve(undefined), 180)),
      ]);
    }
    return await writePromise;
  } catch (err) {
    handleFirestoreError(err, operationType, path);
  }
}

async function testConnection() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();
