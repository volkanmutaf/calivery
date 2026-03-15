import { httpsCallable } from 'firebase/functions';
import { collection, addDoc, serverTimestamp, query, where, getDocs, deleteDoc, writeBatch } from 'firebase/firestore';
import { firebaseDb, firebaseFunctions } from '@/lib/firebase';
import { OrderStatus } from '@/types';

// Orange County, CA Addresses with Coordinates
const OC_ADDRESSES = [
    { address: "Disneyland Resort, 1313 Disneyland Dr, Anaheim, CA 92802", lat: 33.8125, lng: -117.9190 },
    { address: "Knott's Berry Farm, 8039 Beach Blvd, Buena Park, CA 90620", lat: 33.8443, lng: -118.0004 },
    { address: "South Coast Plaza, 3333 Bristol St, Costa Mesa, CA 92626", lat: 33.6901, lng: -117.8869 },
    { address: "Angel Stadium, 2000 Gene Autry Way, Anaheim, CA 92806", lat: 33.8003, lng: -117.8827 },
    { address: "Huntington Beach Pier, Main St & PCH, Huntington Beach, CA 92648", lat: 33.6551, lng: -118.0042 },
    { address: "Mission San Juan Capistrano, 26801 Ortega Hwy, San Juan Capistrano, CA 92675", lat: 33.5017, lng: -117.6626 },
    { address: "UCI, Irvine, CA 92697", lat: 33.6457, lng: -117.8427 },
    { address: "Honda Center, 2695 E Katella Ave, Anaheim, CA 92806", lat: 33.8078, lng: -117.8765 },
    { address: "Balboa Island, Newport Beach, CA 92662", lat: 33.6074, lng: -117.8887 },
    { address: "Crystal Cove State Park, 8471 N Coast Hwy, Laguna Beach, CA 92651", lat: 33.5706, lng: -117.8109 },
    { address: "Irvine Spectrum Center, 670 Spectrum Center Dr, Irvine, CA 92618", lat: 33.6509, lng: -117.7441 },
    { address: "Fashion Island, 401 Newport Center Dr, Newport Beach, CA 92660", lat: 33.6154, lng: -117.8757 },
    { address: "Dana Point Harbor, 34624 Golden Lantern St, Dana Point, CA 92629", lat: 33.4596, lng: -117.6976 },
    { address: "Orange County Great Park, 8000 Great Park Blvd, Irvine, CA 92618", lat: 33.6763, lng: -117.7456 },
    { address: "Fullerton College, 321 E Chapman Ave, Fullerton, CA 92832", lat: 33.8741, lng: -117.9189 },
];

const RESTAURANTS = [
    "In-N-Out Burger", "The Habit Burger Grill", "Taco Bell", "Wahoo's Fish Taco",
    "El Pollo Loco", "Ruby's Diner", "Lazy Dog Restaurant & Bar", "BJ's Restaurant & Brewhouse",
    "Yard House", "California Pizza Kitchen", "Sharky's Woodfired Mexican Grill",
    "Mendocino Farms", "Sidecar Doughnuts", "Porto's Bakery", "Urth Caffé"
];

function getRandomItem<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomDate(start: Date, end: Date) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

export async function generateMockData(onProgress: (msg: string) => void, tenantId: string = "default") {
    onProgress('Starting mock data generation...');

    // 1. Generate 10 Drivers
    for (let i = 1; i <= 10; i++) {
        onProgress(`Creating driver ${i}/10...`);
        await addMockDriver(tenantId);
    }

    // 2. Generate 30 Orders
    onProgress('Generating 30 orders...');
    for (let i = 1; i <= 30; i++) {
        await addMockOrder(tenantId, i);
    }

    onProgress('Mock data generation complete!');
}

export async function addMockDriver(tenantId: string = "default") {
    const createUser = httpsCallable(firebaseFunctions, 'createUser');
    const i = Math.floor(Math.random() * 10000); // Random suffix to avoid collision if called multiple times
    const address = getRandomItem(OC_ADDRESSES);

    try {
        await createUser({
            email: `driver_${Date.now()}_${i}@mock.com`,
            password: 'password123',
            username: `MockDriver_${Date.now()}_${i}`,
            role: 'driver',
            phone: `+1555010${(i % 10000).toString().padStart(4, '0')}`,
            driver_base_address: address.address,
            driver_base_lat: address.lat,
            driver_base_lng: address.lng,
            is_active: true,
            tenant_id: tenantId,
        });
    } catch (e) {
        console.warn(`Cloud function 'createUser' failed, falling back to direct Firestore write.`, e);
        try {
            const profilesCollection = collection(firebaseDb, 'profiles');
            await addDoc(profilesCollection, {
                role: 'driver',
                username: `MockDriver_${Date.now()}_${i}`,
                email: `driver_${Date.now()}_${i}@mock.com`,
                phone: `+1555010${(i % 10000).toString().padStart(4, '0')}`,
                photo_url: null,
                driver_base_address: address.address,
                driver_base_lat: address.lat,
                driver_base_lng: address.lng,
                is_active: true,
                tenant_id: tenantId,
                created_at: serverTimestamp(),
                updated_at: serverTimestamp(),
            });
        } catch (fallbackError) {
            console.error(`Failed to create fallback driver`, fallbackError);
        }
    }
}

export async function addMockOrder(tenantId: string = "default", indexOverride?: number) {
    const ordersCollection = collection(firebaseDb, 'orders');

    // Always use today's date so orders appear in Assignments page
    const today = new Date();
    // Format date as yyyy-MM-dd in local timezone (same as Assignments page)
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const scheduledDateStr = `${year}-${month}-${day}`;

    const i = indexOverride || Math.floor(Math.random() * 1000);

    // Random pick up and drop off
    const pickup = getRandomItem(OC_ADDRESSES);
    let dropoff = getRandomItem(OC_ADDRESSES);
    while (dropoff === pickup) dropoff = getRandomItem(OC_ADDRESSES);

    const restaurant = getRandomItem(RESTAURANTS);

    // All orders are created as 'new' (unassigned) for the assignments page
    const status: OrderStatus = 'new';

    // Deadlines: 10 AM to 12 PM
    // Random minute 0-59, Random hour 10 or 11
    const hour = Math.floor(Math.random() * 2) + 10; // 10 or 11
    const minute = Math.floor(Math.random() * 60);
    const pickupTime = new Date(today);
    pickupTime.setHours(hour, minute, 0, 0);

    // Dropoff 30-60 mins after pickup
    const deliveryDurationMins = 30 + Math.floor(Math.random() * 30);
    const dropoffTime = new Date(pickupTime.getTime() + deliveryDurationMins * 60000);

    const orderData = {
        order_code: `CAL-${Date.now().toString().slice(-6)}-${i}`,
        source: 'manual',
        restaurant_name: restaurant,
        pickup_address: pickup.address,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        dropoff_address: dropoff.address,
        dropoff_lat: dropoff.lat,
        dropoff_lng: dropoff.lng,
        payout_amount: 50.00,
        scheduled_date: scheduledDateStr,
        time_window_start: pickupTime as any,
        time_window_end: dropoffTime as any,
        status: status,
        assigned_driver_id: null,
        route_group_id: null,
        created_by: 'system_mock',
        tenant_id: tenantId,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        last_event_time: serverTimestamp(),
    };

    await addDoc(ordersCollection, orderData);
}

// Add 3 mock orders at once for the assignments page
export async function addBatchMockOrders(tenantId: string = "default") {
    const promises = [];
    for (let i = 0; i < 3; i++) {
        promises.push(addMockOrder(tenantId, Date.now() + i));
    }
    await Promise.all(promises);
}

// Boston Addresses for specific requirement
const BOSTON_ADDRESSES = [
    { address: "Faneuil Hall Marketplace, 4 S Market St, Boston, MA 02109", lat: 42.3600, lng: -71.0560 },
    { address: "Fenway Park, 4 Jersey St, Boston, MA 02215", lat: 42.3467, lng: -71.0972 },
    { address: "Boston Common, 139 Tremont St, Boston, MA 02111", lat: 42.3549, lng: -71.0655 },
    { address: "New England Aquarium, 1 Central Wharf, Boston, MA 02110", lat: 42.3591, lng: -71.0496 },
    { address: "Museum of Fine Arts, 465 Huntington Ave, Boston, MA 02115", lat: 42.3394, lng: -71.0940 },
    { address: "TD Garden, 100 Legends Way, Boston, MA 02114", lat: 42.3662, lng: -71.0621 }
];

export async function addBostonMockOrders(tenantId: string = "default") {
    const ordersCollection = collection(firebaseDb, 'orders');
    const today = new Date();
    // Format date as yyyy-MM-dd
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const scheduledDateStr = `${year}-${month}-${day}`;

    // Fixed Time Window: 10:30 AM - 1:00 PM (13:00)
    const startHour = 10;
    const startMinute = 30;
    const endHour = 13;
    const endMinute = 0;

    const promises = [];

    // Create 3 orders
    for (let i = 0; i < 3; i++) {
        // Random pickup/dropoff from Boston list
        const pickup = getRandomItem(BOSTON_ADDRESSES);
        let dropoff = getRandomItem(BOSTON_ADDRESSES);
        while (dropoff === pickup) dropoff = getRandomItem(BOSTON_ADDRESSES);
        const restaurant = getRandomItem(RESTAURANTS);

        // Calculate times
        const pickupTime = new Date(today);
        pickupTime.setHours(startHour, startMinute, 0, 0);

        const dropoffTime = new Date(today);
        dropoffTime.setHours(endHour, endMinute, 0, 0);

        const orderData = {
            order_code: `BOS-${Date.now().toString().slice(-6)}-${i}`,
            source: 'manual',
            restaurant_name: restaurant,
            pickup_address: pickup.address,
            pickup_lat: pickup.lat,
            pickup_lng: pickup.lng,
            dropoff_address: dropoff.address,
            dropoff_lat: dropoff.lat,
            dropoff_lng: dropoff.lng,
            payout_amount: 50.00, // Fixed price
            scheduled_date: scheduledDateStr,
            time_window_start: pickupTime as any, // Cast to any to satisfy TS validation in mock data
            time_window_end: dropoffTime as any,
            status: 'new',
            assigned_driver_id: null,
            route_group_id: null,
            created_by: 'system_mock', // So they can be wiped
            tenant_id: tenantId,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp(),
            last_event_time: serverTimestamp(),
            admin_notes: 'Boston Special Order (+3)'
        };

        promises.push(addDoc(ordersCollection, orderData));
    }

    await Promise.all(promises);
}

export async function addBostonMockDriver(tenantId: string = "default") {
    const createUser = httpsCallable(firebaseFunctions, 'createUser');
    const i = Math.floor(Math.random() * 10000);
    const address = getRandomItem(BOSTON_ADDRESSES);

    try {
        await createUser({
            email: `boston_driver_${Date.now()}_${i}@mock.com`,
            password: 'password123',
            username: `MockDriver_Boston_${Date.now()}_${i}`,
            role: 'driver',
            phone: `+1555020${(i % 10000).toString().padStart(4, '0')}`,
            driver_base_address: address.address,
            driver_base_lat: address.lat,
            driver_base_lng: address.lng,
            is_active: true,
            tenant_id: tenantId,
        });
    } catch (e) {
        console.warn(`Cloud function 'createUser' failed, falling back to direct Firestore write.`, e);
        try {
            const profilesCollection = collection(firebaseDb, 'profiles');
            await addDoc(profilesCollection, {
                role: 'driver',
                username: `MockDriver_Boston_${Date.now()}_${i}`,
                email: `boston_driver_${Date.now()}_${i}@mock.com`,
                phone: `+1555020${(i % 10000).toString().padStart(4, '0')}`,
                photo_url: null,
                driver_base_address: address.address,
                driver_base_lat: address.lat,
                driver_base_lng: address.lng,
                is_active: true,
                tenant_id: tenantId,
                created_at: serverTimestamp(),
                updated_at: serverTimestamp(),
            });
        } catch (fallbackError) {
            console.error(`Failed to create fallback driver`, fallbackError);
        }
    }
}

export async function addBatchBostonDrivers(tenantId: string = "default") {
    const promises = [];
    for (let i = 0; i < 3; i++) {
        promises.push(addBostonMockDriver(tenantId));
    }
    await Promise.all(promises);
}




export async function clearMockData(onProgress: (msg: string) => void, tenantId: string = "default") {
    onProgress('Starting mock data cleanup...');

    try {
        // 1. Delete Mock Orders (created_by == 'system_mock')
        onProgress('Identifying mock orders...');
        let ordersQuery = query(
            collection(firebaseDb, 'orders'),
            where('created_by', '==', 'system_mock')
        );
        if (tenantId && tenantId !== 'default') {
            ordersQuery = query(ordersQuery, where('tenant_id', '==', tenantId));
        }

        const ordersSnap = await getDocs(ordersQuery);

        if (ordersSnap.empty) {
            onProgress('No mock orders found.');
        } else {
            onProgress(`Deleting ${ordersSnap.size} mock orders...`);
            const batch = writeBatch(firebaseDb);
            let operationCount = 0;

            for (const doc of ordersSnap.docs) {
                batch.delete(doc.ref);
                operationCount++;
                // Commit batches of 500
                if (operationCount >= 500) {
                    await batch.commit();
                    operationCount = 0;
                }
            }
            if (operationCount > 0) {
                await batch.commit();
            }
        }

        // 2. Delete Mock Drivers (username starts with 'MockDriver_')
        onProgress('Identifying mock drivers...');
        // Note: Firestore doesn't support startsWith directly, so usage of >= and < is standard.
        // We look for usernames >= 'MockDriver_' and < 'MockDriver_~' ('~' is a high ascii char)
        let driversQuery = query(
            collection(firebaseDb, 'profiles'),
            where('username', '>=', 'MockDriver_'),
            where('username', '<=', 'MockDriver_\uf8ff')
        );
        if (tenantId && tenantId !== 'default') {
            driversQuery = query(driversQuery, where('tenant_id', '==', tenantId));
        }
        const driversSnap = await getDocs(driversQuery);

        if (driversSnap.empty) {
            onProgress('No mock drivers found.');
        } else {
            onProgress(`Deleting ${driversSnap.size} mock drivers...`);
            const batch = writeBatch(firebaseDb);
            let operationCount = 0;

            for (const doc of driversSnap.docs) {
                batch.delete(doc.ref);
                operationCount++;
                if (operationCount >= 500) {
                    await batch.commit();
                    operationCount = 0;
                }
            }
            if (operationCount > 0) {
                await batch.commit();
            }
        }

        onProgress('Mock data cleanup complete!');
    } catch (error) {
        console.error('Error clearing mock data:', error);
        throw error;
    }
}
