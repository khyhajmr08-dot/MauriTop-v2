import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export interface UserProfile {
  uid: string;
  name?: string;
  displayName?: string;
  email?: string;
  phoneNumber?: string;
  phone?: string;
  photoURL?: string;
  avatarUrl?: string;
  role?: 'admin' | 'user' | string;
  blocked?: boolean;
  isVerified?: boolean;
  reviewStatus?: string;
  loyaltyPoints?: number;
  points?: number;
  referralsCount?: number;
  referralCount?: number;
  referralEarnings?: number;
  fcmToken?: string;
  notificationsEnabled?: boolean;
  createdAt?: any;
  updatedAt?: any;
  [key: string]: any;
}

export interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  error?: string | null;
  logout: () => Promise<void>;
  signOut: () => Promise<void>;
}

const ADMIN_EMAILS = ['khyhajmr08@gmail.com'];
const ADMIN_UIDS = ['PqXqqCgdC1eYPz4HKHHLtDRejPD3'];

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  error: null,
  logout: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = null;
        }

        setUser(firebaseUser);

        if (!firebaseUser) {
          setProfile(null);
          setLoading(false);
          return;
        }

        const userDocRef = doc(db, 'users', firebaseUser.uid);

        // Subscribe to real-time updates for user profile
        unsubscribeProfile = onSnapshot(
          userDocRef,
          (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data() as UserProfile;
              const isTrustedOwner = ADMIN_UIDS.includes(firebaseUser.uid) || (
                Boolean(firebaseUser.emailVerified && firebaseUser.email) &&
                ADMIN_EMAILS.includes(firebaseUser.email!.toLowerCase().trim())
              );
              // Keep the UI compatible with legacy role checks while deriving owner status
              // from Firebase Auth identity, not from the mutable Firestore role field.
              setProfile({ ...data, role: isTrustedOwner ? 'admin' : 'user' });
            } else {
              // Create default profile if not exists
              const isDefaultAdmin = (firebaseUser.emailVerified && firebaseUser.email &&
                ADMIN_EMAILS.includes(firebaseUser.email.toLowerCase().trim())) ||
                ADMIN_UIDS.includes(firebaseUser.uid);

              const defaultProfile: UserProfile = {
                uid: firebaseUser.uid,
                name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
                email: firebaseUser.email || '',
                photoURL: firebaseUser.photoURL || '',
                role: isDefaultAdmin ? 'admin' : 'user',
                blocked: false,
                referralsCount: 0,
                referralEarnings: 0,
                loyaltyPoints: 0,
                reviewStatus: 'Active',
                isVerified: false,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              };

              // Never persist administrator privileges in a client-writable profile.
              setDoc(userDocRef, { ...defaultProfile, role: 'user' }, { merge: true }).catch((err) => {
                console.warn('[Auth] Failed to initialize user document:', err);
              });

              setProfile(defaultProfile);
            }
            setLoading(false);
          },
          async (snapshotError) => {
            console.warn('[Auth] Realtime profile listener error, attempting one-time fetch:', snapshotError);
            try {
              const snap = await getDoc(userDocRef);
              if (snap.exists()) {
                setProfile(snap.data() as UserProfile);
              } else {
                setProfile({
                  uid: firebaseUser.uid,
                  name: firebaseUser.displayName || 'User',
                  email: firebaseUser.email || '',
                  role: (ADMIN_UIDS.includes(firebaseUser.uid) || (firebaseUser.emailVerified && ADMIN_EMAILS.includes(firebaseUser.email?.toLowerCase().trim() || ''))) ? 'admin' : 'user',
                  blocked: false,
                });
              }
            } catch (fallbackError: any) {
              console.error('[Auth] Profile fallback error:', fallbackError);
              setError(fallbackError?.message || 'Failed to fetch user profile');
            } finally {
              setLoading(false);
            }
          }
        );
      },
      (authError) => {
        console.error('[Auth] onAuthStateChanged error:', authError);
        setError(authError.message);
        setLoading(false);
      }
    );

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, []);

  const isAdmin = useMemo(() => {
    if (!user) return false;
    const emailMatch = user.emailVerified && user.email ? ADMIN_EMAILS.includes(user.email.toLowerCase().trim()) : false;
    const uidMatch = ADMIN_UIDS.includes(user.uid);
    // Authorization is based on the trusted owner allowlist only. A mutable
    // Firestore profile role must never grant admin access. Granular staff
    // permissions require a separately secured permission system.
    return Boolean(emailMatch || uidMatch);
  }, [user]);

  const handleSignOut = async () => {
    await auth.signOut();
  };

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      isAdmin,
      error,
      logout: handleSignOut,
      signOut: handleSignOut,
    }),
    [user, profile, loading, isAdmin, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export { AuthContext };
