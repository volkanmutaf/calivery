import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
    CreateOrderRequest,
    CreateOrderResponse,
    AutoAssignRequest,
    AutoAssignResponse,
    ManualAssignRequest,
    PublishRouteGroupRequest,
    DriverCompleteStepRequest,
    DriverCompleteStepResponse,
    Order,
    OrderEvent,
    OrderPhoto,
    Profile,
    RouteGroup,
    RouteStep,
    EarningsWeekly,
    CreateUserRequest,
    CreateUserResponse,
    UpdateUserRequest,
    UpdateUserResponse,
    DeleteUserRequest,
    DeleteUserResponse,
    GetUserByUsernameRequest,
    GetUserByUsernameResponse,
    DeleteOrderRequest,
    DeleteOrderResponse,
    AdminCompleteOrderRequest,
    AdminCompleteOrderResponse,
} from './types';
import {
    SetTenantClaimsRequest,
    CreateTenantRequest,
    UpdateTenantConfigRequest,
    Tenant,
} from './types';
import {
    generateRouteSteps,
    getWeekStartDate,
    haversineDistance,
    ALGORITHM_VERSION,
} from './routing';

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// ============================================
// Helper Functions
// ============================================

/**
 * Get user role from profile
 */
async function getUserRole(uid: string): Promise<string | null> {
    const doc = await db.collection('profiles').doc(uid).get();
    if (!doc.exists) return null;
    return (doc.data() as Profile).role;
}

/**
 * Verify user is an admin
 */
async function verifyAdmin(uid: string | undefined): Promise<void> {
    if (!uid) {
        throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    const role = await getUserRole(uid);
    if (role !== 'admin' && role !== 'super_admin' && role !== 'tenant_admin') {
        throw new HttpsError('permission-denied', 'Admin access required');
    }
}

/**
 * Verify user is a super admin (cross-tenant management)
 */
async function verifySuperAdmin(uid: string | undefined): Promise<void> {
    if (!uid) {
        throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    const role = await getUserRole(uid);
    if (role !== 'super_admin' && role !== 'admin') {
        throw new HttpsError('permission-denied', 'Super admin access required');
    }
}

/**
 * Get tenant_id from request auth token custom claims
 */
function getTenantId(auth: { uid: string; token: Record<string, unknown> } | undefined): string {
    if (!auth) return 'default';
    return (auth.token?.tenant_id as string) || 'default';
}

/**
 * Verify user is a driver
 */
async function verifyDriver(uid: string | undefined): Promise<void> {
    if (!uid) {
        throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    const role = await getUserRole(uid);
    if (role !== 'driver') {
        throw new HttpsError('permission-denied', 'Driver access required');
    }
}

/**
 * Generate next order code (CAL-000001, CAL-000002, etc.)
 */
async function generateOrderCode(): Promise<string> {
    const counterRef = db.collection('counters').doc('orders');

    const result = await db.runTransaction(async (transaction: FirebaseFirestore.Transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let nextValue = 1;

        if (counterDoc.exists) {
            nextValue = (counterDoc.data()?.value || 0) + 1;
        }

        transaction.set(counterRef, {
            value: nextValue,
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
        });

        return nextValue;
    });

    return `CAL-${result.toString().padStart(6, '0')}`;
}

/**
 * Write an order event (audit log)
 */
async function writeOrderEvent(
    orderId: string,
    eventType: OrderEvent['event_type'],
    actorRole: OrderEvent['actor_role'],
    actorId: string,
    metadata: Record<string, unknown> = {}
): Promise<void> {
    const eventRef = db.collection('orders').doc(orderId).collection('events').doc();
    const now = admin.firestore.Timestamp.now();

    await eventRef.set({
        event_type: eventType,
        actor_role: actorRole,
        actor_id: actorId,
        event_time: now,
        metadata,
    } as OrderEvent);

    // Update last_event_time on order
    await db.collection('orders').doc(orderId).update({
        last_event_time: now,
        updated_at: now,
    });
}

/**
 * Geocode an address (MVP: return mock coordinates for California)
 * In production, use Google Maps Geocoding API
 */
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number }> {
    // MVP: Return approximate Orange County coordinates with some variation
    // In production, integrate with Google Maps Geocoding API
    const baseLat = 33.7175; // Orange County center
    const baseLng = -117.8311;

    // Add variation based on address hash
    const hash = address.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const latVariation = ((hash % 100) - 50) / 100; // -0.5 to +0.5
    const lngVariation = (((hash * 7) % 100) - 50) / 100;

    return {
        lat: baseLat + latVariation,
        lng: baseLng + lngVariation,
    };
}

// ============================================
// Cloud Functions
// ============================================

/**
 * Create a new order (Admin only)
 */
export const createOrder = onCall<CreateOrderRequest>(
    { region: 'us-central1', cors: true },
    async (request): Promise<CreateOrderResponse> => {
        await verifyAdmin(request.auth?.uid);

        const data = request.data;

        // Validate required fields
        if (!data.restaurant_name || !data.pickup_address || !data.dropoff_address ||
            !data.payout_amount || !data.scheduled_date) {
            throw new HttpsError('invalid-argument', 'Missing required fields');
        }

        // Geocode addresses
        const pickupCoords = await geocodeAddress(data.pickup_address);
        const dropoffCoords = await geocodeAddress(data.dropoff_address);

        // Generate order code
        const orderCode = await generateOrderCode();

        // Create order document
        const orderRef = db.collection('orders').doc();
        const now = admin.firestore.Timestamp.now();

        const order: Order = {
            order_code: orderCode,
            source: 'manual',
            restaurant_name: data.restaurant_name,
            pickup_address: data.pickup_address,
            pickup_lat: pickupCoords.lat,
            pickup_lng: pickupCoords.lng,
            dropoff_address: data.dropoff_address,
            dropoff_lat: dropoffCoords.lat,
            dropoff_lng: dropoffCoords.lng,
            payout_amount: data.payout_amount,
            scheduled_date: data.scheduled_date,
            time_window_start: data.time_window_start
                ? admin.firestore.Timestamp.fromDate(new Date(data.time_window_start))
                : null,
            time_window_end: data.time_window_end
                ? admin.firestore.Timestamp.fromDate(new Date(data.time_window_end))
                : null,
            status: 'new',
            assigned_driver_id: null,
            route_group_id: null,
            tenant_id: getTenantId(request.auth),
            created_by: request.auth!.uid,
            created_at: now,
            updated_at: now,
            last_event_time: now,
        };

        await orderRef.set(order);

        // Write audit event
        await writeOrderEvent(
            orderRef.id,
            'order_created',
            'admin',
            request.auth!.uid,
            { order_code: orderCode }
        );

        return {
            order_id: orderRef.id,
            order_code: orderCode,
        };
    }
);

/**
 * Auto-assign orders to drivers using fairness algorithm (Admin only)
 * Supports preview_only mode for showing preview before confirming
 */
export const autoAssignOrders = onCall<AutoAssignRequest>(
    { region: 'us-central1', cors: true },
    async (request): Promise<AutoAssignResponse> => {
        try {
            await verifyAdmin(request.auth?.uid);

            const data = request.data;
            const maxOrdersPerDriver = data.max_orders_per_driver || 3;
            const previewOnly = data.preview_only ?? false;
            const tenantId = getTenantId(request.auth);

            console.log(`AutoAssign started. Max: ${maxOrdersPerDriver}, Date: ${data.scheduled_date}, PreviewOnly: ${previewOnly}, Tenant: ${tenantId}`);

            // Get unassigned orders for the date
            let ordersQuery = db.collection('orders')
                .where('scheduled_date', '==', data.scheduled_date)
                .where('status', '==', 'new');

            if (tenantId && tenantId !== 'default') {
                ordersQuery = ordersQuery.where('tenant_id', '==', tenantId);
            }

            const ordersSnap = await ordersQuery.get();

            if (ordersSnap.empty) {
                console.log('No new orders found for date.');
                return { route_groups: [] };
            }

            // Filter to specific orders if provided
            let orders = ordersSnap.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => ({
                id: doc.id,
                ...(doc.data() as Order),
            }));

            if (data.order_ids && data.order_ids.length > 0) {
                orders = orders.filter(o => data.order_ids!.includes(o.id));
            }

            console.log(`Processing ${orders.length} orders for assignment.`);

            // Get active drivers
            let driversQuery = db.collection('profiles')
                .where('role', '==', 'driver')
                .where('is_active', '==', true);

            if (tenantId && tenantId !== 'default') {
                driversQuery = driversQuery.where('tenant_id', '==', tenantId);
            }

            const driversSnap = await driversQuery.get();

            if (driversSnap.empty) {
                console.warn('No active drivers found.');
                throw new HttpsError('failed-precondition', 'No active drivers available');
            }

            let drivers = driversSnap.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => ({
                id: doc.id,
                ...(doc.data() as Profile),
            }));

            // IMPORTANT: Filter to only selected drivers if provided
            if (data.driver_ids && data.driver_ids.length > 0) {
                drivers = drivers.filter(d => data.driver_ids!.includes(d.id));
            }

            console.log(`Found ${drivers.length} candidate drivers.`);

            if (drivers.length === 0) {
                throw new HttpsError('failed-precondition', 'No selected drivers available');
            }

            // Fair round-robin assignment: distribute orders evenly across drivers
            const driverAssignments: Map<string, Array<{ id: string } & Order>> = new Map();
            drivers.forEach(d => driverAssignments.set(d.id, []));

            // Sort orders by some criteria (e.g., pickup time) for consistency
            orders.sort((a, b) => {
                const timeA = a.time_window_start ? (a.time_window_start as any).toDate?.().getTime() || 0 : 0;
                const timeB = b.time_window_start ? (b.time_window_start as any).toDate?.().getTime() || 0 : 0;
                return timeA - timeB;
            });

            // Round-robin assignment respecting max orders per driver
            let driverIndex = 0;
            const driverIds = Array.from(driverAssignments.keys());

            for (const order of orders) {
                // Find next driver that can accept more orders
                let attempts = 0;
                while (attempts < drivers.length) {
                    const currentDriverId = driverIds[driverIndex];
                    const currentAssignments = driverAssignments.get(currentDriverId) || [];

                    if (currentAssignments.length < maxOrdersPerDriver) {
                        currentAssignments.push(order);
                        driverAssignments.set(currentDriverId, currentAssignments);
                        console.log(`Assigned order ${order.order_code} to driver ${currentDriverId}`);
                        break;
                    }

                    // Move to next driver
                    driverIndex = (driverIndex + 1) % driverIds.length;
                    attempts++;
                }

                // Move to next driver for round-robin fairness
                driverIndex = (driverIndex + 1) % driverIds.length;
            }

            // Create route groups for each driver with assignments
            const routeGroups: AutoAssignResponse['route_groups'] = [];

            for (const [driverId, assignedOrders] of driverAssignments) {
                if (assignedOrders.length === 0) continue;

                const driver = drivers.find(d => d.id === driverId)!;
                console.log(`Creating route for driver ${driver.username} with ${assignedOrders.length} orders.`);

                // Generate optimized route steps
                let steps: RouteStep[];
                try {
                    steps = generateRouteSteps(
                        driver.driver_base_lat,
                        driver.driver_base_lng,
                        assignedOrders as Order[]
                    );
                } catch (routeError) {
                    console.error(`Error generating route steps for driver ${driverId}:`, routeError);
                    continue;
                }

                // Calculate total distance
                let totalDistance = 0;
                if (steps.length > 0) {
                    totalDistance = haversineDistance(
                        driver.driver_base_lat,
                        driver.driver_base_lng,
                        steps[0].lat,
                        steps[0].lng
                    );
                    for (let i = 1; i < steps.length; i++) {
                        totalDistance += haversineDistance(
                            steps[i - 1].lat,
                            steps[i - 1].lng,
                            steps[i].lat,
                            steps[i].lng
                        );
                    }
                }

                // Calculate detailed metrics
                const totalDistanceMiles = Math.round((totalDistance * 0.621371) * 10) / 10;
                const averageSpeedKmh = 30; // ~18 mph
                const serviceTimePerStopMins = 5;
                const travelTimeMins = (totalDistance / averageSpeedKmh) * 60;
                const totalDurationMins = Math.round(travelTimeMins + (steps.length * serviceTimePerStopMins));

                // Generate Google Maps URL
                const origin = `${driver.driver_base_lat},${driver.driver_base_lng}`;
                const destination = `${steps[steps.length - 1].lat},${steps[steps.length - 1].lng}`;
                const waypoints = steps.slice(0, -1).map(s => `${s.lat},${s.lng}`).join('|');
                const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints ? `&waypoints=${waypoints}` : ''}&travelmode=driving`;

                // Map step order_ids and calculate estimated times
                const stepDocs: Array<{ sequence_index: number; order_id: string; task_type: 'pickup' | 'dropoff'; address: string; lat: number; lng: number; estimated_time: string }> = [];
                let cumulativeTimeMins = 0;
                let prevLat = driver.driver_base_lat;
                let prevLng = driver.driver_base_lng;

                const startTime = new Date(); // In real scenario, use start of shift

                for (const step of steps) {
                    const distToStep = haversineDistance(prevLat, prevLng, step.lat, step.lng);
                    const timeToStep = (distToStep / averageSpeedKmh) * 60;
                    cumulativeTimeMins += timeToStep + serviceTimePerStopMins;

                    const arrivalTime = new Date(startTime.getTime() + cumulativeTimeMins * 60000);
                    const timeStr = arrivalTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

                    let originalOrder = assignedOrders.find(o => o.id === step.order_id);
                    if (!originalOrder) {
                        originalOrder = assignedOrders.find(o => o.order_code.includes(step.order_id));
                    }
                    const actualOrderId = originalOrder ? originalOrder.id : step.order_id;

                    stepDocs.push({
                        sequence_index: step.sequence_index,
                        order_id: actualOrderId,
                        task_type: step.task_type as 'pickup' | 'dropoff',
                        address: step.address,
                        lat: step.lat,
                        lng: step.lng,
                        estimated_time: timeStr,
                    });

                    prevLat = step.lat;
                    prevLng = step.lng;
                }

                if (previewOnly) {
                    // Preview mode: don't write to DB, just return preview data
                    const previewId = `preview_${Date.now()}_${driverId}`;
                    routeGroups.push({
                        route_group_id: previewId,
                        driver_id: driverId,
                        driver_username: driver.username,
                        orders: assignedOrders.map(o => o.id),
                        total_distance_miles: totalDistanceMiles,
                        total_duration_mins: totalDurationMins,
                        google_maps_url: googleMapsUrl,
                        steps: stepDocs,
                        fairness_score: Math.round(totalDistance * 10) / 10,
                    });
                } else {
                    // Write to database
                    const routeGroupRef = db.collection('route_groups').doc();
                    const now = admin.firestore.Timestamp.now();

                    const routeGroup: RouteGroup = {
                        driver_id: driverId,
                        scheduled_date: data.scheduled_date,
                        status: 'active',
                        algorithm_version: ALGORITHM_VERSION,
                        generated_at: now,
                        published_at: null,
                        summary: {
                            distance_estimate: Math.round(totalDistance * 10) / 10,
                            fairness_notes: `Assigned ${assignedOrders.length} orders based on proximity and weekly earnings balance`,
                            order_count: assignedOrders.length,
                        },
                    };

                    await routeGroupRef.set(routeGroup);

                    // Create step documents and update orders
                    const batch = db.batch();

                    for (const step of steps) {
                        const stepRef = routeGroupRef.collection('steps').doc();
                        let originalOrder = assignedOrders.find(o => o.id === step.order_id);
                        if (!originalOrder) {
                            originalOrder = assignedOrders.find(o => o.order_code.includes(step.order_id));
                        }
                        const actualOrderId = originalOrder ? originalOrder.id : step.order_id;

                        batch.set(stepRef, {
                            ...step,
                            order_id: actualOrderId,
                        });
                    }

                    // Update orders with assignment
                    for (const order of assignedOrders) {
                        const orderRef = db.collection('orders').doc(order.id);
                        batch.update(orderRef, {
                            status: 'assigned',
                            assigned_driver_id: driverId,
                            route_group_id: routeGroupRef.id,
                            updated_at: now,
                        });
                    }

                    await batch.commit();

                    // Write audit events
                    for (const order of assignedOrders) {
                        await writeOrderEvent(
                            order.id,
                            'assigned',
                            'system',
                            'system',
                            {
                                driver_id: driverId,
                                driver_username: driver.username,
                                route_group_id: routeGroupRef.id,
                                algorithm_version: ALGORITHM_VERSION,
                            }
                        );
                    }

                    routeGroups.push({
                        route_group_id: routeGroupRef.id,
                        driver_id: driverId,
                        driver_username: driver.username,
                        orders: assignedOrders.map(o => o.id),
                        total_distance_miles: totalDistanceMiles,
                        total_duration_mins: totalDurationMins,
                        google_maps_url: googleMapsUrl,
                        steps: stepDocs,
                        fairness_score: Math.round(totalDistance * 10) / 10,
                    });
                }
            }

            return { route_groups: routeGroups };

        } catch (error) {
            console.error('CRITICAL ERROR in autoAssignOrders:', error);
            if (error instanceof HttpsError) {
                throw error;
            }
            throw new HttpsError('internal', `Assignment failed: ${(error as Error).message}`);
        }
    }
);

/**
 * Manually assign specific orders to a specific driver (Admin only)
 * This allows admins to override the auto-assignment and select exactly which
 * orders go to which driver. The routing algorithm still generates optimal
 * pickup/dropoff sequence based on driver location.
 * Supports preview_only mode for showing preview before confirming.
 */
export const manualAssignOrders = onCall<ManualAssignRequest>(
    { region: 'us-central1', cors: true },
    async (request): Promise<AutoAssignResponse> => {
        try {
            await verifyAdmin(request.auth?.uid);

            const { scheduled_date, order_ids, driver_id, preview_only } = request.data;
            const isPreviewOnly = preview_only ?? false;
            const tenantId = getTenantId(request.auth);

            // Validate required fields
            if (!scheduled_date || !order_ids || order_ids.length === 0 || !driver_id) {
                throw new HttpsError('invalid-argument', 'Missing required fields: scheduled_date, order_ids, driver_id');
            }

            console.log(`ManualAssign started. Driver: ${driver_id}, Orders: ${order_ids.length}, PreviewOnly: ${isPreviewOnly}, Tenant: ${tenantId}`);

            // Fetch the driver profile
            const driverDoc = await db.collection('profiles').doc(driver_id).get();
            if (!driverDoc.exists) {
                throw new HttpsError('not-found', 'Driver not found');
            }

            const driver = driverDoc.data() as Profile;
            if (driver.role !== 'driver') {
                throw new HttpsError('invalid-argument', 'Selected user is not a driver');
            }
            if (tenantId && tenantId !== 'default' && driver.tenant_id !== tenantId) {
                throw new HttpsError('permission-denied', `Driver does not belong to tenant ${tenantId}`);
            }

            // Fetch the specified orders
            const orders: Array<{ id: string } & Order> = [];
            for (const orderId of order_ids) {
                const orderDoc = await db.collection('orders').doc(orderId).get();
                if (!orderDoc.exists) {
                    throw new HttpsError('not-found', `Order ${orderId} not found`);
                }

                const orderData = orderDoc.data() as Order;
                if (orderData.status !== 'new') {
                    throw new HttpsError('failed-precondition', `Order ${orderId} is already assigned or completed`);
                }
                if (tenantId && tenantId !== 'default' && orderData.tenant_id !== tenantId) {
                    throw new HttpsError('permission-denied', `Order ${orderId} does not belong to tenant ${tenantId}`);
                }

                orders.push({ id: orderId, ...orderData });
            }

            console.log(`Found ${orders.length} valid orders to assign to ${driver.username}`);

            // Generate optimized route steps using the same algorithm
            const steps: RouteStep[] = generateRouteSteps(
                driver.driver_base_lat,
                driver.driver_base_lng,
                orders as Order[]
            );

            // Calculate total distance
            let totalDistance = 0;
            if (steps.length > 0) {
                totalDistance = haversineDistance(
                    driver.driver_base_lat,
                    driver.driver_base_lng,
                    steps[0].lat,
                    steps[0].lng
                );
                for (let i = 1; i < steps.length; i++) {
                    totalDistance += haversineDistance(
                        steps[i - 1].lat,
                        steps[i - 1].lng,
                        steps[i].lat,
                        steps[i].lng
                    );
                }
            }

            // Calculate detailed metrics
            const totalDistanceMiles = Math.round((totalDistance * 0.621371) * 10) / 10;
            const averageSpeedKmh = 30; // ~18 mph
            const serviceTimePerStopMins = 5;
            const travelTimeMins = (totalDistance / averageSpeedKmh) * 60;
            const totalDurationMins = Math.round(travelTimeMins + (steps.length * serviceTimePerStopMins));

            // Generate Google Maps URL
            const origin = `${driver.driver_base_lat},${driver.driver_base_lng}`;
            const destination = `${steps[steps.length - 1].lat},${steps[steps.length - 1].lng}`;
            const waypoints = steps.slice(0, -1).map(s => `${s.lat},${s.lng}`).join('|');
            const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints ? `&waypoints=${waypoints}` : ''}&travelmode=driving`;

            // Map step order_ids and calculate estimated times
            const stepDocs: Array<{ sequence_index: number; order_id: string; task_type: 'pickup' | 'dropoff'; address: string; lat: number; lng: number; estimated_time: string }> = [];
            let cumulativeTimeMins = 0;
            let prevLat = driver.driver_base_lat;
            let prevLng = driver.driver_base_lng;

            const startTime = new Date();

            for (const step of steps) {
                const distToStep = haversineDistance(prevLat, prevLng, step.lat, step.lng);
                const timeToStep = (distToStep / averageSpeedKmh) * 60;
                cumulativeTimeMins += timeToStep + serviceTimePerStopMins;

                const arrivalTime = new Date(startTime.getTime() + cumulativeTimeMins * 60000);
                const timeStr = arrivalTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

                let originalOrder = orders.find(o => o.id === step.order_id);
                if (!originalOrder) {
                    originalOrder = orders.find(o => o.order_code.includes(step.order_id));
                }
                const actualOrderId = originalOrder ? originalOrder.id : step.order_id;

                stepDocs.push({
                    sequence_index: step.sequence_index,
                    order_id: actualOrderId,
                    task_type: step.task_type as 'pickup' | 'dropoff',
                    address: step.address,
                    lat: step.lat,
                    lng: step.lng,
                    estimated_time: timeStr,
                });

                prevLat = step.lat;
                prevLng = step.lng;
            }

            if (isPreviewOnly) {
                // Preview mode: don't write to DB, just return preview data
                const previewId = `preview_manual_${Date.now()}_${driver_id}`;
                console.log(`ManualAssign preview completed. Preview ID: ${previewId}`);

                return {
                    route_groups: [{
                        route_group_id: previewId,
                        driver_id: driver_id,
                        driver_username: driver.username,
                        orders: orders.map(o => o.id),
                        total_distance_miles: totalDistanceMiles,
                        total_duration_mins: totalDurationMins,
                        google_maps_url: googleMapsUrl,
                        steps: stepDocs,
                        fairness_score: Math.round(totalDistance * 10) / 10,
                    }]
                };
            }

            // Write to database
            const routeGroupRef = db.collection('route_groups').doc();
            const now = admin.firestore.Timestamp.now();

            const routeGroup: RouteGroup = {
                driver_id: driver_id,
                scheduled_date: scheduled_date,
                status: 'active',
                algorithm_version: ALGORITHM_VERSION + '-manual',
                generated_at: now,
                published_at: null,
                summary: {
                    distance_estimate: Math.round(totalDistance * 10) / 10,
                    fairness_notes: `Manually assigned ${orders.length} orders by admin`,
                    order_count: orders.length,
                },
            };

            await routeGroupRef.set(routeGroup);

            // Create step documents and update orders
            const batch = db.batch();

            for (const step of steps) {
                const stepRef = routeGroupRef.collection('steps').doc();
                let originalOrder = orders.find(o => o.id === step.order_id);
                if (!originalOrder) {
                    originalOrder = orders.find(o => o.order_code.includes(step.order_id));
                }
                const actualOrderId = originalOrder ? originalOrder.id : step.order_id;

                batch.set(stepRef, {
                    ...step,
                    order_id: actualOrderId,
                });
            }

            // Update orders with assignment
            for (const order of orders) {
                const orderRef = db.collection('orders').doc(order.id);
                batch.update(orderRef, {
                    status: 'assigned',
                    assigned_driver_id: driver_id,
                    route_group_id: routeGroupRef.id,
                    updated_at: now,
                });
            }

            await batch.commit();

            // Write audit events
            for (const order of orders) {
                await writeOrderEvent(
                    order.id,
                    'assigned',
                    'admin',
                    request.auth!.uid,
                    {
                        driver_id: driver_id,
                        driver_username: driver.username,
                        route_group_id: routeGroupRef.id,
                        algorithm_version: ALGORITHM_VERSION + '-manual',
                        assignment_type: 'manual',
                    }
                );
            }

            console.log(`ManualAssign completed. Route group: ${routeGroupRef.id}`);

            return {
                route_groups: [{
                    route_group_id: routeGroupRef.id,
                    driver_id: driver_id,
                    driver_username: driver.username,
                    orders: orders.map(o => o.id),
                    total_distance_miles: totalDistanceMiles,
                    total_duration_mins: totalDurationMins,
                    google_maps_url: googleMapsUrl,
                    steps: stepDocs,
                    fairness_score: Math.round(totalDistance * 10) / 10,
                }],
            };

        } catch (error) {
            console.error('CRITICAL ERROR in manualAssignOrders:', error);
            if (error instanceof HttpsError) {
                throw error;
            }
            throw new HttpsError('internal', `Manual assignment failed: ${(error as Error).message}`);
        }
    }
);

/**
 * Publish a route group to the driver (Admin only)
 */
export const publishRouteGroup = onCall<PublishRouteGroupRequest>(
    { region: 'us-central1', cors: true },
    async (request): Promise<{ success: boolean }> => {
        await verifyAdmin(request.auth?.uid);

        const { route_group_id } = request.data;

        const routeGroupRef = db.collection('route_groups').doc(route_group_id);
        const routeGroupDoc = await routeGroupRef.get();

        if (!routeGroupDoc.exists) {
            throw new HttpsError('not-found', 'Route group not found');
        }

        const now = admin.firestore.Timestamp.now();

        // Update route group
        await routeGroupRef.update({
            published_at: now,
        });

        // Get all orders in this route group and write events
        const stepsSnap = await routeGroupRef.collection('steps').get();
        const orderIds = new Set<string>();

        stepsSnap.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
            const step = doc.data() as RouteStep;
            orderIds.add(step.order_id);
        });

        for (const orderId of orderIds) {
            await writeOrderEvent(
                orderId,
                'system_route_generated',
                'system',
                'system',
                {
                    route_group_id,
                    published_by: request.auth!.uid,
                }
            );
        }

        // TODO: Send FCM notification to driver

        return { success: true };
    }
);

/**
 * Driver completes a route step (pickup or delivery)
 */
export const driverCompleteStep = onCall<DriverCompleteStepRequest>(
    { region: 'us-central1', cors: true },
    async (request): Promise<DriverCompleteStepResponse> => {
        try {
            await verifyDriver(request.auth?.uid);

            const driverId = request.auth!.uid;
            const { route_group_id, step_id, photo_storage_path } = request.data;

            // Verify route group belongs to this driver
            const routeGroupRef = db.collection('route_groups').doc(route_group_id);
            const routeGroupDoc = await routeGroupRef.get();

            if (!routeGroupDoc.exists) {
                throw new HttpsError('not-found', 'Route group not found');
            }

            const routeGroup = routeGroupDoc.data() as RouteGroup;

            if (routeGroup.driver_id !== driverId) {
                throw new HttpsError('permission-denied', 'This route is not assigned to you');
            }

            // Get the step
            const stepRef = routeGroupRef.collection('steps').doc(step_id);
            const stepDoc = await stepRef.get();

            if (!stepDoc.exists) {
                throw new HttpsError('not-found', 'Step not found');
            }

            const step = stepDoc.data() as RouteStep;

            // Verify this is the current step (lowest pending sequence_index)
            const pendingStepsSnap = await routeGroupRef.collection('steps')
                .where('status', '==', 'pending')
                .orderBy('sequence_index', 'asc')
                .limit(1)
                .get();

            if (pendingStepsSnap.empty || pendingStepsSnap.docs[0].id !== step_id) {
                throw new HttpsError('failed-precondition', 'This is not the current step');
            }

            // Verify photo was uploaded (Optional now)
            // if (step.task_type === 'dropoff' && !photo_storage_path) {
            //     throw new HttpsError('invalid-argument', 'Photo is required for delivery');
            // }

            const now = admin.firestore.Timestamp.now();

            // Save photo metadata only if photo exists
            if (photo_storage_path) {
                const photoRef = db.collection('orders').doc(step.order_id).collection('photos').doc();
                const photoData: OrderPhoto = {
                    photo_type: step.required_photo_type,
                    storage_path: photo_storage_path,
                    uploaded_by: driverId,
                    uploaded_at: now,
                    order_id: step.order_id,
                    step_id: step_id,
                };
                await photoRef.set(photoData);

                // Write photo audit event
                const photoEventType = step.task_type === 'pickup' ? 'pickup_photo_uploaded' : 'delivery_photo_uploaded';
                await writeOrderEvent(step.order_id, photoEventType, 'driver', driverId, { photo_path: photo_storage_path });
            }

            // Update step status
            await stepRef.update({
                status: 'completed',
                completed_at: now,
            });

            const completionEventType = step.task_type === 'pickup' ? 'picked_up' : 'delivered';
            await writeOrderEvent(step.order_id, completionEventType, 'driver', driverId, { step_id });

            // If this was a delivery, update order status
            if (step.task_type === 'dropoff') {
                await db.collection('orders').doc(step.order_id).update({
                    status: 'delivered',
                    updated_at: now,
                });
            } else {
                // If pickup, set order to in_progress
                await db.collection('orders').doc(step.order_id).update({
                    status: 'in_progress',
                    updated_at: now,
                });
            }

            // Check if there are more steps
            const remainingStepsSnap = await routeGroupRef.collection('steps')
                .where('status', '==', 'pending')
                .orderBy('sequence_index', 'asc')
                .limit(1)
                .get();

            const routeCompleted = remainingStepsSnap.empty;
            let nextStepId: string | null = null;

            if (!routeCompleted) {
                nextStepId = remainingStepsSnap.docs[0].id;
            } else {
                // Mark route group as completed
                await routeGroupRef.update({
                    status: 'completed',
                });
            }

            return {
                success: true,
                next_step_id: nextStepId,
                route_completed: routeCompleted,
            };
        } catch (error) {
            console.error('Error in driverCompleteStep:', error);
            if (error instanceof HttpsError) {
                throw error;
            }
            throw new HttpsError('internal', `Failed to complete step: ${(error as Error).message}`);
        }
    }
);

/**
 * Recalculate weekly earnings for all drivers (scheduled daily)
 */
export const recalculateEarnings = onSchedule(
    { schedule: '0 2 * * *', region: 'us-central1' }, // 2 AM daily
    async () => {
        const weekStart = getWeekStartDate();
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const weekEndStr = weekEnd.toISOString().split('T')[0];

        // Get all drivers
        const driversSnap = await db.collection('profiles')
            .where('role', '==', 'driver')
            .get();

        for (const driverDoc of driversSnap.docs) {
            const driverId = driverDoc.id;
            const driverData = driverDoc.data() as Profile;

            // Get completed orders for this driver this week
            const ordersSnap = await db.collection('orders')
                .where('assigned_driver_id', '==', driverId)
                .where('status', '==', 'delivered')
                .where('scheduled_date', '>=', weekStart)
                .where('scheduled_date', '<=', weekEndStr)
                .get();

            let totalEarnings = 0;
            let orderCount = 0;

            ordersSnap.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
                const order = doc.data() as Order;
                totalEarnings += order.payout_amount;
                orderCount++;
            });

            // Update or create earnings document
            const earningsDocId = `${driverId}_${weekStart}`;
            const earningsRef = db.collection('earnings_weekly').doc(earningsDocId);

            const earningsData: EarningsWeekly = {
                driver_id: driverId,
                tenant_id: driverData.tenant_id || 'default',
                week_start_date: weekStart,
                week_end_date: weekEndStr,
                total_earnings: totalEarnings,
                order_count: orderCount,
                last_calculated_at: admin.firestore.Timestamp.now(),
            };

            await earningsRef.set(earningsData);
        }
    }
);

/**
 * Manual trigger to recalculate earnings (Admin only)
 */
export const triggerEarningsRecalculation = onCall(
    { region: 'us-central1', cors: true },
    async (request): Promise<{ success: boolean }> => {
        await verifyAdmin(request.auth?.uid);
        const callerTenantId = getTenantId(request.auth);

        // Same logic as scheduled function
        const weekStart = getWeekStartDate();
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const weekEndStr = weekEnd.toISOString().split('T')[0];

        let driversQuery = db.collection('profiles').where('role', '==', 'driver');
        if (callerTenantId !== 'default') {
            driversQuery = driversQuery.where('tenant_id', '==', callerTenantId);
        }

        const driversSnap = await driversQuery.get();

        for (const driverDoc of driversSnap.docs) {
            const driverId = driverDoc.id;
            const driverData = driverDoc.data() as Profile;

            const ordersSnap = await db.collection('orders')
                .where('assigned_driver_id', '==', driverId)
                .where('status', '==', 'delivered')
                .where('scheduled_date', '>=', weekStart)
                .where('scheduled_date', '<=', weekEndStr)
                .get();

            let totalEarnings = 0;
            let orderCount = 0;

            ordersSnap.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
                const order = doc.data() as Order;
                totalEarnings += order.payout_amount;
                orderCount++;
            });

            const earningsDocId = `${driverId}_${weekStart}`;
            const earningsRef = db.collection('earnings_weekly').doc(earningsDocId);

            await earningsRef.set({
                driver_id: driverId,
                tenant_id: driverData.tenant_id || 'default',
                week_start_date: weekStart,
                week_end_date: weekEndStr,
                total_earnings: totalEarnings,
                order_count: orderCount,
                last_calculated_at: admin.firestore.Timestamp.now(),
            } as EarningsWeekly);
        }

        return { success: true };
    }
);

// ============================================
// User Management Functions (Admin only)
// ============================================

/**
 * Create a new user (Admin only)
 * Creates Firebase Auth user and Firestore profile
 */
export const createUser = onCall<CreateUserRequest>(
    { region: 'us-central1', cors: true },
    async (request): Promise<CreateUserResponse> => {
        await verifyAdmin(request.auth?.uid);

        const data = request.data;
        const callerTenantId = getTenantId(request.auth);

        // Determine the target tenant ID
        // - Super admins ('default' tenant) can assign to any tenant
        // - Tenant admins can only assign to their own tenant
        let targetTenantId = callerTenantId;
        if (callerTenantId === 'default' && data.tenant_id) {
            targetTenantId = data.tenant_id;
        } else if (callerTenantId !== 'default' && data.tenant_id && data.tenant_id !== callerTenantId) {
            throw new HttpsError('permission-denied', 'Cannot create user outside of your tenant');
        }

        // Validate required fields
        if (!data.email || !data.password || !data.username || !data.role) {
            throw new HttpsError('invalid-argument', 'Missing required fields: email, password, username, role');
        }

        // Check if username already exists
        const existingUser = await db.collection('profiles')
            .where('username', '==', data.username)
            .limit(1)
            .get();

        if (!existingUser.empty) {
            throw new HttpsError('already-exists', 'Username already taken');
        }

        try {
            // Create Firebase Auth user
            const userRecord = await admin.auth().createUser({
                email: data.email,
                password: data.password,
                displayName: data.username,
            });

            // Set custom claims (role and tenant)
            await admin.auth().setCustomUserClaims(userRecord.uid, {
                role: data.role,
                tenant_id: targetTenantId
            });

            const now = admin.firestore.Timestamp.now();

            // Create Firestore profile
            const profile: Profile = {
                role: data.role,
                username: data.username,
                email: data.email,
                phone: data.phone || null,
                photo_url: null,
                driver_base_address: data.driver_base_address || '',
                driver_base_lat: data.driver_base_lat || 0,
                driver_base_lng: data.driver_base_lng || 0,
                is_active: data.is_active !== false, // Default true
                tenant_id: targetTenantId,
                created_at: now,
                updated_at: now,
            };

            await db.collection('profiles').doc(userRecord.uid).set(profile);

            return { uid: userRecord.uid, success: true };
        } catch (error: unknown) {
            const err = error as { code?: string; message?: string };
            if (err.code === 'auth/email-already-exists') {
                throw new HttpsError('already-exists', 'Email already in use');
            }
            throw new HttpsError('internal', err.message || 'Failed to create user');
        }
    }
);

/**
 * Update an existing user (Admin only)
 */
export const updateUser = onCall<UpdateUserRequest>(
    { region: 'us-central1', cors: true },
    async (request): Promise<UpdateUserResponse> => {
        await verifyAdmin(request.auth?.uid);

        const { uid, ...updates } = request.data;
        const callerTenantId = getTenantId(request.auth);

        if (!uid) {
            throw new HttpsError('invalid-argument', 'User ID is required');
        }

        // Check if profile exists
        const profileRef = db.collection('profiles').doc(uid);
        const profileDoc = await profileRef.get();

        if (!profileDoc.exists) {
            throw new HttpsError('not-found', 'User not found');
        }

        const profileData = profileDoc.data() as Profile;
        if (callerTenantId !== 'default' && profileData.tenant_id !== callerTenantId) {
            throw new HttpsError('permission-denied', 'Cannot update user outside of your tenant');
        }

        try {
            // Update Firebase Auth if email or password changed
            if (updates.email || updates.password) {
                const authUpdate: admin.auth.UpdateRequest = {};
                if (updates.email) authUpdate.email = updates.email;
                if (updates.password) authUpdate.password = updates.password;
                if (updates.username) authUpdate.displayName = updates.username;
                await admin.auth().updateUser(uid, authUpdate);
            }

            // Update Firestore profile
            const profileUpdate: Partial<Profile> & { updated_at: FirebaseFirestore.Timestamp } = {
                updated_at: admin.firestore.Timestamp.now(),
            };

            if (updates.username !== undefined) profileUpdate.username = updates.username;
            if (updates.email !== undefined) profileUpdate.email = updates.email;
            if (updates.phone !== undefined) profileUpdate.phone = updates.phone;
            if (updates.role !== undefined) profileUpdate.role = updates.role;
            if (updates.is_active !== undefined) profileUpdate.is_active = updates.is_active;
            if (updates.driver_base_address !== undefined) profileUpdate.driver_base_address = updates.driver_base_address;
            if (updates.driver_base_lat !== undefined) profileUpdate.driver_base_lat = updates.driver_base_lat;
            if (updates.driver_base_lng !== undefined) profileUpdate.driver_base_lng = updates.driver_base_lng;

            await profileRef.update(profileUpdate);

            // Optionally update claims if role changed
            if (updates.role !== undefined) {
                await admin.auth().setCustomUserClaims(uid, {
                    role: updates.role,
                    tenant_id: profileData.tenant_id
                });
            }

            return { success: true };
        } catch (error: unknown) {
            const err = error as { message?: string };
            throw new HttpsError('internal', err.message || 'Failed to update user');
        }
    }
);

/**
 * Delete a user (Admin only)
 * Deletes both Firebase Auth user and Firestore profile
 */
export const deleteUser = onCall<DeleteUserRequest>(
    { region: 'us-central1', cors: true },
    async (request): Promise<DeleteUserResponse> => {
        await verifyAdmin(request.auth?.uid);

        const { uid } = request.data;
        const callerTenantId = getTenantId(request.auth);

        if (!uid) {
            throw new HttpsError('invalid-argument', 'User ID is required');
        }

        // Prevent self-deletion
        if (uid === request.auth?.uid) {
            throw new HttpsError('failed-precondition', 'Cannot delete your own account');
        }

        // Fetch profile to check tenant
        const profileRef = db.collection('profiles').doc(uid);
        const profileDoc = await profileRef.get();

        if (profileDoc.exists) {
            const profileData = profileDoc.data() as Profile;
            if (callerTenantId !== 'default' && profileData.tenant_id !== callerTenantId) {
                throw new HttpsError('permission-denied', 'Cannot delete user outside of your tenant');
            }
        } else if (callerTenantId !== 'default') {
            throw new HttpsError('not-found', 'User profile not found');
        }

        try {
            // Delete Firebase Auth user
            await admin.auth().deleteUser(uid);

            // Delete Firestore profile
            await db.collection('profiles').doc(uid).delete();

            return { success: true };
        } catch (error: unknown) {
            const err = error as { code?: string; message?: string };
            if (err.code === 'auth/user-not-found') {
                // Still try to delete profile
                await db.collection('profiles').doc(uid).delete();
                return { success: true };
            }
            throw new HttpsError('internal', err.message || 'Failed to delete user');
        }
    }
);

/**
 * Get user email by username (for username login)
 * This is a public function - does not require auth
 */
export const getUserByUsername = onCall<GetUserByUsernameRequest>(
    { region: 'us-central1', cors: true },
    async (request): Promise<GetUserByUsernameResponse> => {
        const { username } = request.data;

        if (!username) {
            throw new HttpsError('invalid-argument', 'Username is required');
        }

        const snapshot = await db.collection('profiles')
            .where('username', '==', username)
            .where('is_active', '==', true)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return { email: null, found: false };
        }

        const profile = snapshot.docs[0].data() as Profile;
        return { email: profile.email, found: true };
    }
);

/**
 * Delete an order (Admin only)
 * Also removes associated route steps to prevent driver app errors
 */
export const deleteOrder = onCall<DeleteOrderRequest>(
    { region: 'us-central1', cors: true },
    async (request): Promise<DeleteOrderResponse> => {
        await verifyAdmin(request.auth?.uid);

        const { order_id } = request.data;
        const callerTenantId = getTenantId(request.auth);

        if (!order_id) {
            throw new HttpsError('invalid-argument', 'Order ID is required');
        }

        const orderRef = db.collection('orders').doc(order_id);
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
            throw new HttpsError('not-found', 'Order not found');
        }

        const orderData = orderDoc.data() as Order;

        if (callerTenantId !== 'default' && orderData.tenant_id !== callerTenantId) {
            throw new HttpsError('permission-denied', 'Cannot access order outside of your tenant');
        }

        // If assigned to a route group, delete associated steps
        if (orderData.route_group_id) {
            const routeGroupRef = db.collection('route_groups').doc(orderData.route_group_id);
            const stepsSnap = await routeGroupRef.collection('steps')
                .where('order_id', '==', order_id)
                .get();

            const batch = db.batch();
            stepsSnap.forEach((doc) => {
                batch.delete(doc.ref);
            });
            await batch.commit();
        }

        // Delete the order itself
        await orderRef.delete();

        return { success: true };
    }
);

/**
 * Force complete an order (Admin only)
 * Marks order as delivered and completes all associated steps
 */
export const adminCompleteOrder = onCall<AdminCompleteOrderRequest>(
    { region: 'us-central1', cors: true },
    async (request): Promise<AdminCompleteOrderResponse> => {
        await verifyAdmin(request.auth?.uid);

        const { order_id } = request.data;
        const callerTenantId = getTenantId(request.auth);

        if (!order_id) {
            throw new HttpsError('invalid-argument', 'Order ID is required');
        }

        const orderRef = db.collection('orders').doc(order_id);
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
            throw new HttpsError('not-found', 'Order not found');
        }

        const now = admin.firestore.Timestamp.now();
        const orderData = orderDoc.data() as Order;

        if (callerTenantId !== 'default' && orderData.tenant_id !== callerTenantId) {
            throw new HttpsError('permission-denied', 'Cannot access order outside of your tenant');
        }

        // Update order status
        await orderRef.update({
            status: 'delivered',
            updated_at: now,
        });

        // If assigned to a route group, mark steps as completed
        if (orderData.route_group_id) {
            const routeGroupRef = db.collection('route_groups').doc(orderData.route_group_id);
            const stepsSnap = await routeGroupRef.collection('steps')
                .where('order_id', '==', order_id)
                .get();

            const batch = db.batch();
            stepsSnap.forEach((doc) => {
                batch.update(doc.ref, {
                    status: 'completed',
                    completed_at: now,
                });
            });
            await batch.commit();

            // Check if route group is now fully completed
            const pendingStepsSnap = await routeGroupRef.collection('steps')
                .where('status', '==', 'pending')
                .limit(1)
                .get();

            if (pendingStepsSnap.empty) {
                await routeGroupRef.update({
                    status: 'completed',
                });
            }
        }

        // Write audit event
        await writeOrderEvent(
            order_id,
            'delivered',
            'admin',
            request.auth!.uid,
            { method: 'force_complete' }
        );

        return { success: true };
    }
);

// ============================================
// Tenant Management Functions (Super Admin only)
// ============================================

/**
 * Set tenant_id and role as custom claims on a Firebase Auth user
 * Super admin only
 */
export const setTenantClaims = onCall<SetTenantClaimsRequest>(
    { region: 'us-central1', cors: true },
    async (request): Promise<{ success: boolean }> => {
        await verifySuperAdmin(request.auth?.uid);

        const { uid, tenant_id, role } = request.data;

        if (!uid || !tenant_id || !role) {
            throw new HttpsError('invalid-argument', 'Missing required fields: uid, tenant_id, role');
        }

        // Set custom claims
        await admin.auth().setCustomUserClaims(uid, {
            tenant_id,
            role,
        });

        // Also update the profile document with tenant_id
        const profileRef = db.collection('profiles').doc(uid);
        const profileDoc = await profileRef.get();
        if (profileDoc.exists) {
            await profileRef.update({
                tenant_id,
                role,
                updated_at: admin.firestore.Timestamp.now(),
            });
        }

        return { success: true };
    }
);

/**
 * Create a new tenant with default configuration
 * Super admin only
 */
export const createTenant = onCall<CreateTenantRequest>(
    { region: 'us-central1', cors: true },
    async (request): Promise<{ success: boolean; tenant_id: string }> => {
        await verifySuperAdmin(request.auth?.uid);

        const data = request.data;

        if (!data.tenant_id || !data.name || !data.brand_name) {
            throw new HttpsError('invalid-argument', 'Missing required fields: tenant_id, name, brand_name');
        }

        // Check if tenant already exists
        const existingTenant = await db.collection('tenants').doc(data.tenant_id).get();
        if (existingTenant.exists) {
            throw new HttpsError('already-exists', 'Tenant with this ID already exists');
        }

        const now = admin.firestore.Timestamp.now();

        // Create tenant document
        const tenant: Tenant = {
            name: data.name,
            brand_name: data.brand_name,
            logo_url: data.logo_url || '',
            primary_color: data.primary_color || '#F59E0B',
            secondary_color: data.secondary_color || '#10B981',
            status: 'active',
            created_at: now,
        };

        await db.collection('tenants').doc(data.tenant_id).set(tenant);

        // Create default config
        const defaultConfig = {
            features: {
                driver_tracking: true,
                payouts: true,
                reports: true,
                sms_notifications: false,
                analytics: false,
                auto_assign: false,
            },
            limits: {
                max_drivers: 100,
                max_dispatchers: 10,
            },
        };

        await db.collection('tenants').doc(data.tenant_id)
            .collection('config').doc('settings').set(defaultConfig);

        return { success: true, tenant_id: data.tenant_id };
    }
);

/**
 * Update tenant configuration (features and limits)
 * Super admin only
 */
export const updateTenantConfig = onCall<UpdateTenantConfigRequest>(
    { region: 'us-central1', cors: true },
    async (request): Promise<{ success: boolean }> => {
        await verifySuperAdmin(request.auth?.uid);

        const { tenant_id, features, limits } = request.data;

        if (!tenant_id) {
            throw new HttpsError('invalid-argument', 'tenant_id is required');
        }

        // Verify tenant exists
        const tenantDoc = await db.collection('tenants').doc(tenant_id).get();
        if (!tenantDoc.exists) {
            throw new HttpsError('not-found', 'Tenant not found');
        }

        const configRef = db.collection('tenants').doc(tenant_id)
            .collection('config').doc('settings');

        const configDoc = await configRef.get();
        const currentConfig = configDoc.exists ? configDoc.data() || {} : {};

        const updatedConfig: Record<string, unknown> = {};

        if (features) {
            updatedConfig.features = {
                ...(currentConfig.features || {}),
                ...features,
            };
        }

        if (limits) {
            updatedConfig.limits = {
                ...(currentConfig.limits || {}),
                ...limits,
            };
        }

        await configRef.set(updatedConfig, { merge: true });

        return { success: true };
    }
);

/**
 * Create a user and assign them to a tenant with a role
 * Creates Firebase Auth user + sets custom claims + creates Firestore profile
 * Super admin only
 */
export const createTenantAdmin = onCall(
    { region: 'us-central1', cors: true },
    async (request): Promise<{ success: boolean; uid: string }> => {
        await verifySuperAdmin(request.auth?.uid);

        const { email, password, username, tenant_id, role } = request.data as {
            email: string;
            password: string;
            username: string;
            tenant_id: string;
            role: string;
        };

        // Validate inputs
        if (!email || !password || !username || !tenant_id || !role) {
            throw new HttpsError('invalid-argument', 'Missing required fields: email, password, username, tenant_id, role');
        }

        if (!['tenant_admin', 'dispatcher', 'driver'].includes(role)) {
            throw new HttpsError('invalid-argument', 'Invalid role. Must be tenant_admin, dispatcher, or driver');
        }

        if (password.length < 6) {
            throw new HttpsError('invalid-argument', 'Password must be at least 6 characters');
        }

        // Verify tenant exists
        const tenantDoc = await db.collection('tenants').doc(tenant_id).get();
        if (!tenantDoc.exists) {
            throw new HttpsError('not-found', `Tenant '${tenant_id}' not found`);
        }

        // Check if email already exists
        try {
            await admin.auth().getUserByEmail(email);
            throw new HttpsError('already-exists', 'A user with this email already exists');
        } catch (error: unknown) {
            const authError = error as { code?: string };
            if (authError.code !== 'auth/user-not-found') {
                throw error; // Re-throw if it's not a "not found" error
            }
        }

        // Check if username already taken
        const usernameSnap = await db.collection('profiles')
            .where('username', '==', username).limit(1).get();
        if (!usernameSnap.empty) {
            throw new HttpsError('already-exists', 'A user with this username already exists');
        }

        // 1. Create Firebase Auth user
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: username,
        });

        // 2. Set custom claims
        await admin.auth().setCustomUserClaims(userRecord.uid, {
            role,
            tenant_id,
        });

        // 3. Create Firestore profile
        const now = admin.firestore.Timestamp.now();
        await db.collection('profiles').doc(userRecord.uid).set({
            role,
            username,
            email,
            phone: null,
            photo_url: null,
            driver_base_address: '',
            driver_base_lat: 0,
            driver_base_lng: 0,
            is_active: true,
            tenant_id,
            created_at: now,
            updated_at: now,
        });

        return { success: true, uid: userRecord.uid };
    }
);

/**
 * Update tenant status (active, suspended, inactive)
 * Super admin only
 */
export const updateTenantStatus = onCall(
    { region: 'us-central1', cors: true },
    async (request): Promise<{ success: boolean }> => {
        await verifySuperAdmin(request.auth?.uid);

        const { tenant_id, status } = request.data as { tenant_id: string; status: string };

        if (!tenant_id || !status) {
            throw new HttpsError('invalid-argument', 'tenant_id and status are required');
        }

        if (!['active', 'suspended', 'inactive'].includes(status)) {
            throw new HttpsError('invalid-argument', 'Invalid status. Must be active, suspended, or inactive');
        }

        const tenantRef = db.collection('tenants').doc(tenant_id);
        const tenantDoc = await tenantRef.get();

        if (!tenantDoc.exists) {
            throw new HttpsError('not-found', 'Tenant not found');
        }

        await tenantRef.update({
            status,
            updated_at: admin.firestore.Timestamp.now()
        });

        return { success: true };
    }
);

/**
 * Delete a tenant and its config
 * Super admin only
 */
export const deleteTenant = onCall(
    { region: 'us-central1', cors: true },
    async (request): Promise<{ success: boolean }> => {
        await verifySuperAdmin(request.auth?.uid);

        const { tenant_id } = request.data as { tenant_id: string };

        if (!tenant_id) {
            throw new HttpsError('invalid-argument', 'tenant_id is required');
        }

        const tenantRef = db.collection('tenants').doc(tenant_id);
        const tenantDoc = await tenantRef.get();

        if (!tenantDoc.exists) {
            throw new HttpsError('not-found', 'Tenant not found');
        }

        // Delete config subcollection document entirely
        await tenantRef.collection('config').doc('settings').delete();

        // Delete the tenant itself
        await tenantRef.delete();

        return { success: true };
    }
);


/**
 * One-off migration function to set missing tenant_id to 'default'
 * Super admin only
 */
export const migrateTenantData = onCall(
    { region: 'us-central1', cors: true },
    async (request): Promise<{ success: boolean; profiles_updated: number; orders_updated: number }> => {
        await verifySuperAdmin(request.auth?.uid);

        let profilesUpdated = 0;
        let ordersUpdated = 0;

        // 1. Migrate Profiles
        const profilesSnap = await db.collection('profiles').get();
        const profileBatch = db.batch();
        let profileBatchCount = 0;

        for (const doc of profilesSnap.docs) {
            const data = doc.data();
            if (!data.tenant_id) {
                profileBatch.update(doc.ref, { tenant_id: 'default' });
                profilesUpdated++;
                profileBatchCount++;
                if (profileBatchCount === 500) {
                    await profileBatch.commit();
                    profileBatchCount = 0;
                }
            }
        }
        if (profileBatchCount > 0) await profileBatch.commit();

        // 2. Migrate Orders
        const ordersSnap = await db.collection('orders').get();
        const orderBatch = db.batch();
        let orderBatchCount = 0;

        for (const doc of ordersSnap.docs) {
            const data = doc.data();
            if (!data.tenant_id) {
                orderBatch.update(doc.ref, { tenant_id: 'default' });
                ordersUpdated++;
                orderBatchCount++;
                if (orderBatchCount === 500) {
                    await orderBatch.commit();
                    orderBatchCount = 0;
                }
            }
        }
        if (orderBatchCount > 0) await orderBatch.commit();

        console.log(`Migration complete. Profiles: ${profilesUpdated}, Orders: ${ordersUpdated}`);
        return { success: true, profiles_updated: profilesUpdated, orders_updated: ordersUpdated };
    }
);

export * from './notifications';

