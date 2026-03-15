import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { firebaseDb, firebaseAuth } from './firebase';
import { Tenant, TenantConfig, FeatureFlags, TenantLimits } from '../types';

// Default feature flags — all enabled for backward compatibility
const DEFAULT_FEATURES: FeatureFlags = {
    driver_tracking: true,
    payouts: true,
    reports: true,
    sms_notifications: true,
    analytics: true,
    auto_assign: true,
};

const DEFAULT_LIMITS: TenantLimits = {
    max_drivers: 100,
    max_dispatchers: 10,
};

const DEFAULT_TENANT_CONFIG: TenantConfig = {
    features: DEFAULT_FEATURES,
    limits: DEFAULT_LIMITS,
};

interface TenantContextType {
    tenantId: string | null;
    tenant: Tenant | null;
    tenantConfig: TenantConfig;
    featureFlags: FeatureFlags;
    tenantLimits: TenantLimits;
    isFeatureEnabled: (featureName: string) => boolean;
    loading: boolean;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
    const [tenantId, setTenantId] = useState<string | null>(null);
    const [tenant, setTenant] = useState<Tenant | null>(null);
    const [tenantConfig, setTenantConfig] = useState<TenantConfig>(DEFAULT_TENANT_CONFIG);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadTenantData = async () => {
            try {
                const user = firebaseAuth.currentUser;
                if (!user) {
                    setLoading(false);
                    return;
                }

                // Read tenant_id from custom claims
                const tokenResult = await user.getIdTokenResult();
                const claimTenantId = (tokenResult.claims.tenant_id as string) || 'default';
                setTenantId(claimTenantId);

                // Load tenant document
                try {
                    const tenantDoc = await getDoc(doc(firebaseDb, 'tenants', claimTenantId));
                    if (tenantDoc.exists()) {
                        setTenant({ id: tenantDoc.id, ...tenantDoc.data() } as Tenant);
                    }
                } catch (err) {
                    console.warn('[TenantContext] Could not load tenant document:', err);
                }

                // Load tenant config
                try {
                    const configDoc = await getDoc(
                        doc(firebaseDb, 'tenants', claimTenantId, 'config', 'settings')
                    );
                    if (configDoc.exists()) {
                        const configData = configDoc.data() as TenantConfig;
                        setTenantConfig({
                            features: { ...DEFAULT_FEATURES, ...configData.features },
                            limits: { ...DEFAULT_LIMITS, ...configData.limits },
                        });
                    }
                } catch (err) {
                    console.warn('[TenantContext] Could not load tenant config:', err);
                }
            } catch (err) {
                console.error('[TenantContext] Error loading tenant data:', err);
            } finally {
                setLoading(false);
            }
        };

        const unsubscribe = firebaseAuth.onAuthStateChanged((user) => {
            if (user) {
                loadTenantData();
            } else {
                setTenantId(null);
                setTenant(null);
                setTenantConfig(DEFAULT_TENANT_CONFIG);
                setLoading(false);
            }
        });

        return () => unsubscribe();
    }, []);

    const isFeatureEnabled = (featureName: string): boolean => {
        return tenantConfig.features[featureName] ?? true;
    };

    return (
        <TenantContext.Provider
            value={{
                tenantId,
                tenant,
                tenantConfig,
                featureFlags: tenantConfig.features,
                tenantLimits: tenantConfig.limits,
                isFeatureEnabled,
                loading,
            }}
        >
            {children}
        </TenantContext.Provider>
    );
}

export function useTenant() {
    const context = useContext(TenantContext);
    if (context === undefined) {
        throw new Error('useTenant must be used within a TenantProvider');
    }
    return context;
}
