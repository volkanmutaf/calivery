'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { firebaseAuth, firebaseDb } from '@/lib/firebase';
import { Profile, UserRole } from '@/types';


interface AuthContextType {
    user: User | null;
    profile: Profile | null;
    role: UserRole | null;
    tenantId: string | null;
    loading: boolean;
    error: string | null;
    signIn: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [role, setRole] = useState<UserRole | null>(null);
    const [tenantId, setTenantId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
            setUser(user);

            if (user) {
                try {
                    let isAdmin = false;
                    // Internal @calivery.app emails are always admin-level
                    if (user.email && user.email.endsWith('@calivery.app')) {
                        isAdmin = true;
                    } else {
                        try {
                            // Check 'admins' collection for elevated privileges
                            const adminDocRef = doc(firebaseDb, 'admins', user.uid);
                            const adminDoc = await getDoc(adminDocRef);
                            isAdmin = adminDoc.exists();
                        } catch (adminCheckErr) {
                            console.warn('Admin check failed (ignoring):', adminCheckErr);
                            isAdmin = false;
                        }
                    }

                    const profileDoc = await getDoc(doc(firebaseDb, 'profiles', user.uid));
                    if (profileDoc.exists()) {
                        const profileData = profileDoc.data() as Profile;
                        setProfile(profileData);
                        // If profile has super_admin, respect it; if in admins collection enforce admin; otherwise use profile role
                        if (profileData.role === 'super_admin') {
                            setRole('super_admin');
                        } else {
                            setRole(isAdmin ? 'admin' : profileData.role);
                        }

                        // Read tenant_id from custom claims
                        try {
                            const tokenResult = await user.getIdTokenResult();
                            setTenantId((tokenResult.claims.tenant_id as string) || 'default');
                        } catch (claimErr) {
                            console.warn('Could not read tenant claims:', claimErr);
                            setTenantId('default');
                        }
                    } else {
                        // AUTO-CREATE PROFILE FOR ADMIN (SETUP HELPER)
                        if (user.email === 'superadmin@calivery.app') {
                            console.log('Profile missing for super admin email, auto-creating...');
                            const newProfile: Profile = {
                                role: 'super_admin',
                                username: 'SuperAdmin',
                                email: user.email,
                                phone: null,
                                photo_url: null,
                                driver_base_address: '',
                                driver_base_lat: 0,
                                driver_base_lng: 0,
                                is_active: true,
                                tenant_id: 'default',
                                created_at: new Date(),
                                updated_at: new Date()
                            };

                            await setDoc(doc(firebaseDb, 'profiles', user.uid), {
                                ...newProfile,
                                created_at: serverTimestamp(),
                                updated_at: serverTimestamp()
                            });

                            setProfile(newProfile);
                            setRole('super_admin');
                            setTenantId('default');
                            console.log('Super admin profile created automatically.');
                        } else if (user.email === 'driver@calivery.app' || user.email === 'admin@calivery.app' || isAdmin) {
                            console.log('Profile missing for admin email, auto-creating...');
                            const newProfile: Profile = {
                                role: 'admin',
                                username: 'Admin',
                                email: user.email,
                                phone: null,
                                photo_url: null,
                                driver_base_address: '',
                                driver_base_lat: 0,
                                driver_base_lng: 0,
                                is_active: true,
                                created_at: new Date(),
                                updated_at: new Date()
                            };

                            await setDoc(doc(firebaseDb, 'profiles', user.uid), {
                                ...newProfile,
                                created_at: serverTimestamp(),
                                updated_at: serverTimestamp()
                            });

                            setProfile(newProfile);
                            setRole('admin');
                            console.log('Admin profile created automatically.');
                        } else {
                            setProfile(null);
                            setRole(null);
                        }
                    }
                } catch (err) {
                    console.error('Error fetching profile:', err);
                    setError('Failed to load user profile');
                } finally {
                    setLoading(false);
                }
            } else {
                setProfile(null);
                setRole(null);
                setTenantId(null);
                setLoading(false);
            }
        });

        return () => unsubscribe();
    }, []);

    const signIn = async (email: string, password: string) => {
        setError(null);
        setLoading(true);
        try {
            await signInWithEmailAndPassword(firebaseAuth, email, password);
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to sign in';
            setError(errorMessage);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const logout = async () => {
        try {
            await signOut(firebaseAuth);
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to sign out';
            setError(errorMessage);
        }
    };

    return (
        <AuthContext.Provider value={{ user, profile, role, tenantId, loading, error, signIn, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
