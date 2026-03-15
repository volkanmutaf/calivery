// Seed Data Script for Calivery
// Run this in Firebase Console > Firestore > Start Collection or via Admin SDK

/*
Collections to create:
1. profiles - User profiles (admins and drivers)
2. orders - Delivery orders
3. route_groups - Driver route groups (auto-generated)
4. earnings_weekly - Driver earnings (auto-calculated)
5. counters - Order sequence counter
6. stats_daily - Daily stats (auto-calculated)

Subcollections:
- orders/{orderId}/events - Audit log events
- orders/{orderId}/photos - Step photos
- route_groups/{groupId}/steps - Route steps
*/

// ============================================
// STEP 1: Create Admin User
// ============================================
// First, create a user in Firebase Authentication Console:
// Email: admin@calivery.com
// Password: YourSecurePassword123!
// 
// Then get the UID and create this document:

const adminProfile = {
    // Document ID: Use the UID from Firebase Auth
    role: "admin",
    email: "admin@calivery.com",
    username: "Admin",
    is_active: true,
    created_at: new Date(),
    // These fields are optional for admin but required for drivers:
    driver_base_lat: null,
    driver_base_lng: null,
    phone: "+1234567890"
};

// ============================================
// STEP 2: Create Sample Driver Users
// ============================================
// Create users in Firebase Auth first, then add profiles:

const driver1Profile = {
    // Document ID: Use the UID from Firebase Auth
    role: "driver",
    email: "driver1@calivery.com",
    username: "Ahmet Yilmaz",
    is_active: true,
    created_at: new Date(),
    driver_base_lat: 34.0522, // Los Angeles
    driver_base_lng: -118.2437,
    phone: "+1234567891"
};

const driver2Profile = {
    // Document ID: Use the UID from Firebase Auth
    role: "driver",
    email: "driver2@calivery.com",
    username: "Mehmet Demir",
    is_active: true,
    created_at: new Date(),
    driver_base_lat: 34.0122, // Near LA
    driver_base_lng: -118.4937,
    phone: "+1234567892"
};

// ============================================
// STEP 3: Create Order Counter
// ============================================
// Collection: counters
// Document ID: orders

const orderCounter = {
    value: 0,
    updated_at: new Date()
};

// ============================================
// STEP 4: Sample Orders (Optional - for testing)
// ============================================
// These will be created via Admin Panel but here's the structure:

const sampleOrder = {
    order_code: "CAL-000001",
    source: "manual",
    restaurant_name: "Bella Italia Restaurant",
    pickup_address: "123 Restaurant Ave, Los Angeles, CA 90001",
    pickup_lat: 34.0522,
    pickup_lng: -118.2437,
    dropoff_address: "456 Customer St, Beverly Hills, CA 90210",
    dropoff_lat: 34.0736,
    dropoff_lng: -118.4004,
    payout_amount: 25.00,
    scheduled_date: "2026-02-04", // YYYY-MM-DD format
    time_window_start: null,
    time_window_end: null,
    status: "new", // new | assigned | in_progress | delivered | cancelled
    assigned_driver_id: null,
    route_group_id: null,
    created_by: "ADMIN_UID_HERE",
    created_at: new Date(),
    updated_at: new Date(),
    last_event_time: new Date()
};

// ============================================
// Firebase Console Quick Setup Commands
// ============================================
/*
In Firebase Console (https://console.firebase.google.com/project/calivery-963d5):

1. Create Database:
   - Firestore Database > Create database
   - Start in production mode
   - Location: us-central1

2. Enable Authentication:
   - Authentication > Sign-in method
   - Enable Email/Password

3. Create Users:
   - Authentication > Add user
   - admin@calivery.com / password
   - driver1@calivery.com / password
   - driver2@calivery.com / password

4. Create Profiles Collection:
   - Copy the UIDs from Authentication
   - Firestore > Start collection: "profiles"
   - Create documents with UID as document ID

5. Create Counters Collection:
   - Start collection: "counters"
   - Add document with ID "orders"
   - Add field: value = 0

6. Deploy Rules & Indexes:
   cd firebase
   firebase login
   firebase deploy --only firestore:rules,firestore:indexes,storage

7. Deploy Functions:
   cd firebase/functions
   npm install
   npm run build
   cd ..
   firebase deploy --only functions
*/

console.log("Seed data structure defined. Create these in Firebase Console.");
