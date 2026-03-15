import { doc, updateDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { firebaseDb } from './firebase';

export interface Driver {
    id: string;
    username: string;
    email: string;
    phone: string;
    driver_base_address: string;
    photo_url?: string | null;
    pending_photo_url?: string | null;
    rejection_reason?: string | null;
    created_at: Date;
    is_active: boolean;
    is_on_duty: boolean;
}

export const DriverService = {
    /**
     * Subscribe to a driver's profile data in real-time
     * Reads from 'profiles' collection (single source of truth)
     */
    subscribeToDriver: (uid: string, onUpdate: (driver: Driver | null) => void, onError: (error: Error) => void) => {
        const docRef = doc(firebaseDb, 'profiles', uid);

        return onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                // Convert Firestore Timestamp to Date
                const createdAt = data.created_at instanceof Timestamp ? data.created_at.toDate() : new Date();

                const driver: Driver = {
                    id: docSnap.id,
                    username: data.username || '',
                    email: data.email || '',
                    phone: data.phone || '',
                    driver_base_address: data.driver_base_address || '',
                    photo_url: data.photo_url,
                    pending_photo_url: data.pending_photo_url,
                    rejection_reason: data.rejection_reason,
                    created_at: createdAt,
                    is_active: data.is_active ?? true,
                    is_on_duty: data.is_on_duty ?? false,
                };
                onUpdate(driver);
            } else {
                onUpdate(null);
            }
        }, onError);
    },

    /**
     * Update driver phone number
     * Only allowed if driver is active (enforced by rules and UI)
     */
    updatePhone: async (uid: string, newPhone: string): Promise<void> => {
        const docRef = doc(firebaseDb, 'profiles', uid);
        await updateDoc(docRef, { phone: newPhone });
    }
};
