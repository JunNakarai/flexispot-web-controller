import type { Unsubscribe } from 'firebase/auth';
import {
    GoogleAuthProvider,
    getAuth,
    onAuthStateChanged,
    signInWithPopup,
    signOut,
    type User
} from 'firebase/auth';
import { initializeApp, getApp, getApps } from 'firebase/app';
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';
import type { AuthUser, PersistedUserDataSnapshot } from '../types';
import { normalizeSnapshot } from '../state/storage';

const FIREBASE_CONFIG = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const GOOGLE_PROVIDER = new GoogleAuthProvider();

export function isFirebaseConfigured(): boolean {
    return Boolean(
        FIREBASE_CONFIG.apiKey
        && FIREBASE_CONFIG.authDomain
        && FIREBASE_CONFIG.projectId
        && FIREBASE_CONFIG.appId
    );
}

export function observeAuthState(
    callback: (user: AuthUser | null) => void,
    onError: (message: string) => void
): Unsubscribe {
    if (!isFirebaseConfigured()) {
        callback(null);
        return () => undefined;
    }

    try {
        const auth = getAuth(getFirebaseApp());
        return onAuthStateChanged(auth, (user) => {
            callback(user ? mapUser(user) : null);
        }, (error) => {
            onError(toMessage(error));
        });
    } catch (error) {
        onError(toMessage(error));
        callback(null);
        return () => undefined;
    }
}

export async function signInWithGoogleAccount(): Promise<AuthUser> {
    const auth = getAuth(getFirebaseApp());
    const credential = await signInWithPopup(auth, GOOGLE_PROVIDER);
    return mapUser(credential.user);
}

export async function signOutCurrentUser(): Promise<void> {
    const auth = getAuth(getFirebaseApp());
    await signOut(auth);
}

export async function loadUserSnapshot(userId: string): Promise<PersistedUserDataSnapshot | null> {
    const firestore = getFirestore(getFirebaseApp());
    const snapshot = await getDoc(doc(firestore, 'users', userId, 'appData', 'default'));

    if (!snapshot.exists()) {
        return null;
    }

    const data = snapshot.data() as Partial<PersistedUserDataSnapshot> | undefined;
    if (!data) {
        return null;
    }

    return normalizeSnapshot({
        version: 1,
        updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
        presets: Array.isArray(data.presets) ? data.presets : [],
        settings: (data.settings ?? {}) as PersistedUserDataSnapshot['settings'],
        heightHistory: (data.heightHistory ?? {}) as PersistedUserDataSnapshot['heightHistory'],
        meta: (data.meta ?? {}) as PersistedUserDataSnapshot['meta']
    });
}

export async function saveUserSnapshot(userId: string, snapshot: PersistedUserDataSnapshot): Promise<void> {
    const firestore = getFirestore(getFirebaseApp());
    const normalized = normalizeSnapshot(snapshot);

    await setDoc(doc(firestore, 'users', userId, 'appData', 'default'), {
        ...normalized,
        serverUpdatedAt: serverTimestamp()
    }, { merge: true });
}

function getFirebaseApp() {
    if (!isFirebaseConfigured()) {
        throw new Error('Firebase environment variables are missing.');
    }

    return getApps().length > 0
        ? getApp()
        : initializeApp(FIREBASE_CONFIG);
}

function mapUser(user: User): AuthUser {
    return {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email
    };
}

function toMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Firebase operation failed';
}
