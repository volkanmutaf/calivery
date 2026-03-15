const admin = require('firebase-admin');

// Initialize with default credentials (uses GOOGLE_APPLICATION_CREDENTIALS or gcloud auth)
admin.initializeApp({
    projectId: 'calivery-963d5'
});

const db = admin.firestore();

async function createAdminProfile() {
    const userId = 'EdR9KsEH4ZSon5ekJOPLIH8R1wj1';

    const profileData = {
        role: 'admin',
        username: 'admin',
        email: 'driver@calivery.app',
        phone: null,
        photo_url: null,
        driver_base_address: '',
        driver_base_lat: 0,
        driver_base_lng: 0,
        is_active: true,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
    };

    try {
        await db.collection('profiles').doc(userId).set(profileData);
        console.log('Admin profile created successfully!');
        console.log('User ID:', userId);
        console.log('Email:', profileData.email);
        console.log('Role:', profileData.role);
    } catch (error) {
        console.error('Error creating profile:', error);
    }

    process.exit(0);
}

createAdminProfile();
