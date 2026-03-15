/**
 * One-time setup script: Create superadmin@calivery.app user in Firebase Auth
 * 
 * Run with: npx ts-node setup-superadmin.ts
 * 
 * This only needs to be run ONCE to bootstrap the super admin user.
 * After that, the admin panel auth-context will auto-create the profile.
 */

import * as admin from 'firebase-admin';

// Initialize with default credentials (if using emulator or service account)
admin.initializeApp();

const SUPER_ADMIN_EMAIL = 'superadmin@calivery.app';
const SUPER_ADMIN_PASSWORD = 'Admin123!'; // Change after first login

async function setupSuperAdmin() {
    try {
        // Check if user already exists
        let userRecord: admin.auth.UserRecord;
        try {
            userRecord = await admin.auth().getUserByEmail(SUPER_ADMIN_EMAIL);
            console.log('Super admin user already exists:', userRecord.uid);
        } catch {
            // Create the user
            userRecord = await admin.auth().createUser({
                email: SUPER_ADMIN_EMAIL,
                password: SUPER_ADMIN_PASSWORD,
                displayName: 'SuperAdmin',
            });
            console.log('Created super admin user:', userRecord.uid);
        }

        // Set custom claims
        await admin.auth().setCustomUserClaims(userRecord.uid, {
            role: 'super_admin',
            tenant_id: 'default',
        });
        console.log('Set custom claims: role=super_admin, tenant_id=default');

        // Create/update Firestore profile
        const db = admin.firestore();
        await db.collection('profiles').doc(userRecord.uid).set({
            role: 'super_admin',
            username: 'SuperAdmin',
            email: SUPER_ADMIN_EMAIL,
            phone: null,
            photo_url: null,
            driver_base_address: '',
            driver_base_lat: 0,
            driver_base_lng: 0,
            is_active: true,
            tenant_id: 'default',
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        console.log('Created/updated Firestore profile for super admin');

        console.log('\n✅ Super admin setup complete!');
        console.log(`   Email: ${SUPER_ADMIN_EMAIL}`);
        console.log(`   Password: ${SUPER_ADMIN_PASSWORD}`);
        console.log('   ⚠️  Change the password after first login!\n');

        process.exit(0);
    } catch (error) {
        console.error('Error setting up super admin:', error);
        process.exit(1);
    }
}

setupSuperAdmin();
