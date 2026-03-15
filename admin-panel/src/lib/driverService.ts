import {
    collection,
    doc,
    getDocs,
    getDoc,
    updateDoc,
    setDoc,
    query,
    where,
    orderBy,
    Timestamp,
    DocumentData
} from 'firebase/firestore';
import { firebaseDb } from './firebase';

export interface Driver {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address: string;
    profile_photo_url?: string;
    pending_photo_url?: string;
    rejection_reason?: string;
    created_at: Date;
    is_active: boolean;
    // Computed/Derived
    working_days: number;
    // No longer available in profiles:
    jobs_accepted_total: number;
    deliveries_completed_total: number;
}

const mapProfileToDriver = (docSnap: DocumentData): Driver => {
    const data = docSnap.data();
    const createdAt = data.created_at instanceof Timestamp ? data.created_at.toDate() :
        (data.created_at ? new Date(data.created_at) : new Date());

    // Compute working days
    const now = new Date();
    const days = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

    // Split username into first/last name
    const fullName = data.username || 'Driver';
    const splitName = fullName.split(' ');
    const firstName = splitName[0];
    const lastName = splitName.slice(1).join(' ') || '';

    return {
        id: docSnap.id,
        first_name: firstName,
        last_name: lastName,
        email: data.email || '',
        phone: data.phone || '',
        address: data.driver_base_address || '', // Map from driver_base_address
        profile_photo_url: data.photo_url || null, // Map from photo_url
        pending_photo_url: data.pending_photo_url || null,
        rejection_reason: data.rejection_reason || null,
        created_at: createdAt,
        is_active: data.is_active ?? true,
        jobs_accepted_total: 0, // Not available in profiles
        deliveries_completed_total: 0, // Not available in profiles
        working_days: Math.max(0, days)
    };
};

export const DriverService = {
    /**
     * Get all drivers from 'profiles' collection (role == 'driver')
     */
    getAllDrivers: async (filters?: { activeOnly?: boolean; tenantId?: string }): Promise<Driver[]> => {
        let q = query(
            collection(firebaseDb, 'profiles'),
            where('role', '==', 'driver')
        );

        if (filters?.activeOnly) {
            q = query(q, where('is_active', '==', true));
        }

        if (filters?.tenantId && filters.tenantId !== 'default') {
            q = query(q, where('tenant_id', '==', filters.tenantId));
        }

        const snapshot = await getDocs(q);
        return snapshot.docs.map(mapProfileToDriver);
    },

    getDriver: async (id: string): Promise<Driver | null> => {
        const docRef = doc(firebaseDb, 'profiles', id);
        const snapshot = await getDoc(docRef);

        if (snapshot.exists() && snapshot.data().role === 'driver') {
            return mapProfileToDriver(snapshot);
        }
        return null;
    },

    updateDriver: async (id: string, data: Partial<Driver>): Promise<void> => {
        const docRef = doc(firebaseDb, 'profiles', id);

        const updates: any = {};

        // Map Driver fields back to Profile fields
        if (data.first_name || data.last_name) {
            // We need to fetch current name to merge if only one is updated, 
            // but for now let's assume we update username if either changes. 
            // Better strategy: just update what's passed.
            // If we are given partials, constructing full username is checking existing...
            // For simplicity in this refactor, we usually update specific fields.
            // But 'username' is the single field.
            // Let's assume the UI sends full username or we skip username update for partials 
            // unless strictly needed. 
            // Note: Admin panel likely updates profile via this service. 
            // If data has first_name/last_name we should try to construct username.
            // But we need the OTHER part of the name.
            // For safety, let's fetch current profile if we need to reconstruct username.
            if (data.first_name !== undefined || data.last_name !== undefined) {
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    const current = snap.data();
                    const currentFull = current.username || '';
                    const [curFirst, ...curLast] = currentFull.split(' ');
                    const newFirst = data.first_name ?? curFirst;
                    const newLast = data.last_name ?? curLast.join(' ');
                    updates.username = `${newFirst} ${newLast}`.trim();
                }
            }
        }

        if (data.email !== undefined) updates.email = data.email;
        if (data.phone !== undefined) updates.phone = data.phone;
        if (data.address !== undefined) updates.driver_base_address = data.address;
        if (data.profile_photo_url !== undefined) updates.photo_url = data.profile_photo_url;
        if (data.is_active !== undefined) updates.is_active = data.is_active;

        if (Object.keys(updates).length > 0) {
            updates.updated_at = Timestamp.now();
            await updateDoc(docRef, updates);
        }
    },

    toggleStatus: async (id: string, isActive: boolean): Promise<void> => {
        const docRef = doc(firebaseDb, 'profiles', id);
        await updateDoc(docRef, {
            is_active: isActive,
            updated_at: Timestamp.now()
        });
    },

    approvePhoto: async (id: string, photoUrl: string): Promise<void> => {
        const docRef = doc(firebaseDb, 'profiles', id);
        await updateDoc(docRef, {
            photo_url: photoUrl,
            pending_photo_url: null, // explicitly clear pending
            updated_at: Timestamp.now()
        });
    },

    rejectPhoto: async (id: string, reason?: string): Promise<void> => {
        const docRef = doc(firebaseDb, 'profiles', id);
        const updates: any = {
            pending_photo_url: null, // explicitly clear pending
            updated_at: Timestamp.now()
        };
        if (reason) {
            updates.rejection_reason = reason;
        }
        await updateDoc(docRef, updates);
    }
};
