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

export type AdminPermissionKey = 'viewOrders' | 'processOrders' | 'manageServices' | 'managePromotions' | 'managePaymentMethods' | 'manageWithdrawals' | 'manageKyc' | 'viewAnalytics' | 'manageSEO' | 'sendNotifications' | 'manageSettings';
export type AdminPermissions = Partial<Record<AdminPermissionKey, boolean>>;

export interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isOwnerAdmin: boolean;
  adminPermissions: AdminPermissions;
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
  isOwnerAdmin: false,
  adminPermissions: {},
  error: null,
  logout: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adminMember, setAdminMember] = useState<{ active?: boolean; permissions?: AdminPermissions } | null>(null);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;
    let unsubscribeAdminMember: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = null;
        }
        if (unsubscribeAdminMember) {
          unsubscribeAdminMember();
          unsubscribeAdminMember = null;
        }

        setUser(firebaseUser);
        // Clear previous account's permissions immediately during account switching.
        setAdminMember(null);

        if (!firebaseUser) {
          if (unsubscribeAdminMember) { unsubscribeAdminMember(); unsubscribeAdminMember = null; }
          setAdminMember(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const adminMemberRef = doc(db, 'adminMembers', firebaseUser.uid);
        unsubscribeAdminMember = onSnapshot(adminMemberRef, (memberSnap) => {
          if (memberSnap.exists()) {
            const data = memberSnap.data();
            setAdminMember({ active: data.active === true, permissions: (data.permissions || {}) as AdminPermissions });
          } else {
            setAdminMember(null);
          }
        }, (memberError) => {
          console.warn('[Auth] Admin membership lookup failed:', memberError.code || memberError.message);
          setAdminMember(null);
        });

        // Subscribe to real-time updates for user profile
        unsubscribeProfile = onSnapshot(
          userDocRef,
          (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data() as UserProfile;
              setProfile(data);
            } else {
              // Create default profile if not exists
              const isDefaultAdmin = 
                (firebaseUser.email && ADMIN_EMAILS.includes(firebaseUser.email.toLowerCase().trim())) ||
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
                reviewStatus: 'Not Submitted',
                isVerified: false,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              };

              setDoc(userDocRef, defaultProfile, { merge: true }).catch((err) => {
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
                  role: ADMIN_EMAILS.includes(firebaseUser.email?.toLowerCase().trim() || '') ? 'admin' : 'user',
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
      if (unsubscribeAdminMember) {
        unsubscribeAdminMember();
      }
    };
  }, []);

  const isOwnerAdmin = useMemo(() => {
    if (!user) return false;
    const emailMatch = user.email ? ADMIN_EMAILS.includes(user.email.toLowerCase().trim()) : false;
    return Boolean(emailMatch || ADMIN_UIDS.includes(user.uid));
  }, [user]);

  // A user profile's editable `role: admin` field is deliberately NOT trusted.
  // Staff access comes only from the owner-managed adminMembers document.
  const isAdmin = Boolean(isOwnerAdmin || (adminMember?.active === true));
  const adminPermissions = useMemo<AdminPermissions>(() => isOwnerAdmin
    ? { viewOrders: true, processOrders: true, manageServices: true, managePromotions: true, managePaymentMethods: true, manageWithdrawals: true, manageKyc: true, viewAnalytics: true, manageSEO: true, sendNotifications: true, manageSettings: true }
    : (adminMember?.active === true ? (adminMember.permissions || {}) : {}), [isOwnerAdmin, adminMember]);

  const handleSignOut = async () => {
    await auth.signOut();
  };

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      isAdmin,
      isOwnerAdmin,
      adminPermissions,
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
