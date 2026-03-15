import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { User, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { firebaseAuth, firebaseDb } from './firebase';
import { Profile } from '../types';

// Generate a unique session ID (simple UUID v4 alternative)
function generateSessionId(): string {
    return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

interface AuthContextType {
    user: User | null;
    profile: Profile | null;
    tenantId: string | null;
    loading: boolean;
    error: string | null;
    signIn: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const { t } = useTranslation();
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [tenantId, setTenantId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Track this device's session ID
    const sessionIdRef = useRef<string | null>(null);
    // Guard to prevent multiple forced sign-out alerts
    const isForceSigningOutRef = useRef(false);

    useEffect(() => {
        let unsubscribeProfile: (() => void) | null = null;
        console.log('[AuthContext] Setting up auth listener');

        // Safety timeout: stop loading after 5 seconds if firebase hangs
        const timeout = setTimeout(() => {
            console.log('[AuthContext] Auth listener timed out, forcing loading=false');
            setLoading((prev) => {
                if (prev) return false;
                return prev;
            });
        }, 5000);

        const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
            clearTimeout(timeout); // Clear timeout if we get a response
            console.log('[AuthContext] Auth state changed:', user ? 'User logged in' : 'User logged out', user?.uid);
            setUser(user);

            if (user) {
                console.log('[AuthContext] Subscribing to profile...');
                // Read tenant_id from custom claims
                try {
                    const tokenResult = await user.getIdTokenResult();
                    setTenantId((tokenResult.claims.tenant_id as string) || 'default');
                } catch (claimErr) {
                    console.warn('[AuthContext] Could not read tenant claims:', claimErr);
                    setTenantId('default');
                }
                // Clean up previous listener if exists
                if (unsubscribeProfile) {
                    unsubscribeProfile();
                }

                // Subscribe to profile changes
                unsubscribeProfile = onSnapshot(doc(firebaseDb, 'profiles', user.uid),
                    async (docSnapshot) => {
                        console.log('[AuthContext] Profile snapshot received. Exists:', docSnapshot.exists());
                        if (docSnapshot.exists()) {
                            const profileData = docSnapshot.data() as Profile;

                            // Check suspension status
                            if (profileData.is_active === false) {
                                console.log('[AuthContext] User is suspended');
                                // Only alert if we were previously logged in or just loaded
                                Alert.alert(
                                    t('common.error_title'),
                                    t('auth.account_suspended'),
                                    [{ text: 'OK' }]
                                );
                                setError('auth/account-suspended');
                                await signOut(firebaseAuth);
                                setUser(null);
                                setProfile(null);
                                return;
                            }

                            // Check single-device session enforcement
                            if (
                                sessionIdRef.current &&
                                profileData.active_session_id &&
                                profileData.active_session_id !== sessionIdRef.current &&
                                !isForceSigningOutRef.current
                            ) {
                                console.log('[AuthContext] Session invalidated — another device logged in');
                                isForceSigningOutRef.current = true;
                                Alert.alert(
                                    t('common.error_title'),
                                    t('auth.forced_signout'),
                                    [{ text: 'OK' }]
                                );
                                sessionIdRef.current = null;
                                await signOut(firebaseAuth);
                                setUser(null);
                                setProfile(null);
                                isForceSigningOutRef.current = false;
                                return;
                            }

                            console.log('[AuthContext] Profile updated');
                            setProfile(profileData);
                        } else {
                            console.warn('Profile not found for user:', user.uid);
                            setProfile(null);
                        }
                    },
                    (err) => {
                        console.error('Error fetching profile:', err);
                    }
                );
            } else {
                if (unsubscribeProfile) {
                    unsubscribeProfile();
                    unsubscribeProfile = null;
                }
                setProfile(null);
                setTenantId(null);
            }
            console.log('[AuthContext] Loading set to false');
            setLoading(false);
        });

        return () => {
            unsubscribe();
            if (unsubscribeProfile) unsubscribeProfile();
            clearTimeout(timeout);
        };
    }, []);

    const signIn = async (email: string, password: string) => {
        setError(null);
        setLoading(true);
        try {
            const userCredential = await signInWithEmailAndPassword(firebaseAuth, email, password);

            // Check suspension status immediately
            const profileDoc = await getDoc(doc(firebaseDb, 'profiles', userCredential.user.uid));
            if (profileDoc.exists()) {
                const profileData = profileDoc.data() as Profile;
                if (profileData.is_active === false) {
                    await signOut(firebaseAuth);
                    throw { code: 'auth/account-suspended' };
                }
            }

            // Register this device's session
            const newSessionId = generateSessionId();
            sessionIdRef.current = newSessionId;
            console.log('[AuthContext] Registering session:', newSessionId);

            await updateDoc(doc(firebaseDb, 'profiles', userCredential.user.uid), {
                active_session_id: newSessionId,
            });
        } catch (err: any) {
            setError(err.message || 'Failed to sign in');
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const logout = async () => {
        try {
            // Clear session ID on explicit logout
            if (user) {
                try {
                    await updateDoc(doc(firebaseDb, 'profiles', user.uid), {
                        active_session_id: null,
                    });
                } catch (e) {
                    console.warn('[AuthContext] Could not clear session on logout:', e);
                }
            }
            sessionIdRef.current = null;
            await signOut(firebaseAuth);
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <AuthContext.Provider value={{ user, profile, tenantId, loading, error, signIn, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) throw new Error('useAuth must be used within AuthProvider');
    return context;
}
