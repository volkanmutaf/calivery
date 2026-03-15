import * as admin from 'firebase-admin';
import { DriverCandidate, RouteNode, TaskType, Order, Profile, EarningsWeekly, RouteStep } from './types';

const ALGORITHM_VERSION = 'v2.0-cluster-2opt';

// Weights for assignment scoring
const DISTANCE_WEIGHT = 0.55;
const NEED_WEIGHT = 0.35;
const WORKLOAD_WEIGHT = 0.10;

// Route optimization parameters
const DROPOFF_DISTANCE_PENALTY = 1.4; // Penalize dropoff distance to prefer clustering pickups
const NEARBY_DROPOFF_THRESHOLD_KM = 5; // If dropoff is within this range, no penalty
const TWO_OPT_MAX_ITERATIONS = 100; // Max 2-opt improvement passes

/**
 * Calculate haversine distance between two points in km
 */
export function haversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
): number {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(deg: number): number {
    return deg * (Math.PI / 180);
}

/**
 * Normalize a value to 0-1 range
 */
function normalize(value: number, min: number, max: number): number {
    if (max === min) return 0.5;
    return (value - min) / (max - min);
}

/**
 * Get the current ISO week's Monday date string
 */
export function getWeekStartDate(date: Date = new Date()): string {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().split('T')[0];
}

/**
 * Get driver's weekly earnings from the past 7 days
 */
async function getDriverWeeklyEarnings(
    db: admin.firestore.Firestore,
    driverId: string
): Promise<number> {
    const weekStart = getWeekStartDate();
    const docId = `${driverId}_${weekStart}`;
    const doc = await db.collection('earnings_weekly').doc(docId).get();

    if (!doc.exists) {
        return 0;
    }

    return (doc.data() as EarningsWeekly).total_earnings || 0;
}

/**
 * Get driver's current active step count
 */
async function getDriverActiveSteps(
    db: admin.firestore.Firestore,
    driverId: string
): Promise<number> {
    const routeGroupsSnap = await db
        .collection('route_groups')
        .where('driver_id', '==', driverId)
        .where('status', '==', 'active')
        .get();

    let count = 0;
    for (const doc of routeGroupsSnap.docs) {
        const stepsSnap = await doc.ref
            .collection('steps')
            .where('status', '==', 'pending')
            .get();
        count += stepsSnap.size;
    }

    return count;
}

/**
 * Find and rank candidate drivers for an order using fairness algorithm
 */
export async function findBestDriverForOrder(
    db: admin.firestore.Firestore,
    order: Order,
    candidateLimit: number = 5
): Promise<DriverCandidate | null> {
    // Get all active drivers
    const driversSnap = await db
        .collection('profiles')
        .where('role', '==', 'driver')
        .where('is_active', '==', true)
        .get();

    if (driversSnap.empty) {
        return null;
    }

    // Calculate metrics for each driver
    const candidates: DriverCandidate[] = [];

    for (const doc of driversSnap.docs) {
        const profile = doc.data() as Profile;
        const driverId = doc.id;

        const distance = haversineDistance(
            profile.driver_base_lat,
            profile.driver_base_lng,
            order.pickup_lat,
            order.pickup_lng
        );

        const weeklyEarnings = await getDriverWeeklyEarnings(db, driverId);
        const activeSteps = await getDriverActiveSteps(db, driverId);

        candidates.push({
            uid: driverId,
            username: profile.username,
            base_lat: profile.driver_base_lat,
            base_lng: profile.driver_base_lng,
            weekly_earnings: weeklyEarnings,
            active_steps_count: activeSteps,
            distance_to_pickup: distance,
            distance_score: 0,
            need_score: 0,
            workload_score: 0,
            combined_score: 0,
        });
    }

    // Sort by distance and take top N
    candidates.sort((a, b) => a.distance_to_pickup - b.distance_to_pickup);
    const topCandidates = candidates.slice(0, candidateLimit);

    if (topCandidates.length === 0) {
        return null;
    }

    // Calculate normalized scores
    const minDist = Math.min(...topCandidates.map(c => c.distance_to_pickup));
    const maxDist = Math.max(...topCandidates.map(c => c.distance_to_pickup));
    const minEarnings = Math.min(...topCandidates.map(c => c.weekly_earnings));
    const maxEarnings = Math.max(...topCandidates.map(c => c.weekly_earnings));
    const minWorkload = Math.min(...topCandidates.map(c => c.active_steps_count));
    const maxWorkload = Math.max(...topCandidates.map(c => c.active_steps_count));

    for (const candidate of topCandidates) {
        // Distance: closer is better (invert)
        candidate.distance_score = 1 - normalize(candidate.distance_to_pickup, minDist, maxDist);

        // Need: lower earnings = higher need (invert)
        candidate.need_score = 1 - normalize(candidate.weekly_earnings, minEarnings, maxEarnings);

        // Workload: lower is better (invert)
        candidate.workload_score = normalize(candidate.active_steps_count, minWorkload, maxWorkload);

        // Combined score
        candidate.combined_score =
            DISTANCE_WEIGHT * candidate.distance_score +
            NEED_WEIGHT * candidate.need_score +
            WORKLOAD_WEIGHT * (1 - candidate.workload_score);
    }

    // Sort by combined score (highest first)
    topCandidates.sort((a, b) => b.combined_score - a.combined_score);

    return topCandidates[0];
}

/**
 * Generate optimized route steps for a driver with multiple orders
 * Uses cluster-aware nearest-neighbor + 2-opt optimization
 * Constraint: dropoff cannot appear before its corresponding pickup
 */
export function generateRouteSteps(
    driverBaseLat: number,
    driverBaseLng: number,
    orders: Order[]
): RouteStep[] {
    // Create nodes for all pickups and dropoffs
    const pickupNodes: RouteNode[] = orders.map(order => ({
        order_id: order.order_code.replace('CAL-', ''),
        task_type: 'pickup' as TaskType,
        address: order.pickup_address,
        lat: order.pickup_lat,
        lng: order.pickup_lng,
        photo_type: 'pickup' as const,
    }));

    const dropoffNodes: Map<string, RouteNode> = new Map();
    orders.forEach(order => {
        const orderId = order.order_code.replace('CAL-', '');
        dropoffNodes.set(orderId, {
            order_id: orderId,
            task_type: 'dropoff' as TaskType,
            address: order.dropoff_address,
            lat: order.dropoff_lat,
            lng: order.dropoff_lng,
            photo_type: 'delivery' as const,
        });
    });

    // ── Phase 1: Cluster-Aware Nearest Neighbor ──
    // Starts with all pickups available. After a pickup, its dropoff joins the pool
    // but with a distance penalty to encourage doing nearby pickups first.
    const route: RouteNode[] = [];
    const available: RouteNode[] = [...pickupNodes];
    const completedPickups: Set<string> = new Set();

    let currentLat = driverBaseLat;
    let currentLng = driverBaseLng;

    while (available.length > 0) {
        let bestIdx = 0;
        let bestScore = Infinity;

        for (let i = 0; i < available.length; i++) {
            const node = available[i];
            let dist = haversineDistance(currentLat, currentLng, node.lat, node.lng);

            // Apply penalty to dropoffs to prefer clustering pickups first
            // Exception: if the dropoff is very close, don't penalize
            if (node.task_type === 'dropoff' && dist > NEARBY_DROPOFF_THRESHOLD_KM) {
                dist *= DROPOFF_DISTANCE_PENALTY;
            }

            if (dist < bestScore) {
                bestScore = dist;
                bestIdx = i;
            }
        }

        const next = available.splice(bestIdx, 1)[0];
        route.push(next);

        currentLat = next.lat;
        currentLng = next.lng;

        // If this was a pickup, unlock its dropoff
        if (next.task_type === 'pickup') {
            completedPickups.add(next.order_id);
            const dropoff = dropoffNodes.get(next.order_id);
            if (dropoff) {
                available.push(dropoff);
            }
        }
    }

    // ── Phase 2: 2-opt Optimization ──
    // Try reversing segments of the route to find shorter paths.
    // Only accept changes that maintain pickup-before-dropoff constraints.
    let improved = true;
    let iterations = 0;

    while (improved && iterations < TWO_OPT_MAX_ITERATIONS) {
        improved = false;
        iterations++;

        for (let i = 0; i < route.length - 2; i++) {
            for (let j = i + 2; j < route.length; j++) {
                // Try reversing segment [i+1 .. j]
                const newRoute = twoOptSwap(route, i, j);

                if (!isRouteValid(newRoute)) continue;

                const oldDist = calculateTotalDistance(route, driverBaseLat, driverBaseLng);
                const newDist = calculateTotalDistance(newRoute, driverBaseLat, driverBaseLng);

                if (newDist < oldDist - 0.01) { // Small threshold to avoid floating point noise
                    // Accept the improvement
                    route.length = 0;
                    route.push(...newRoute);
                    improved = true;
                    break; // Restart outer loop
                }
            }
            if (improved) break;
        }
    }

    console.log(`Route optimization: ${iterations} 2-opt iterations, ${route.length} stops`);

    // Convert to RouteStep format
    return route.map((node, index) => ({
        sequence_index: index,
        order_id: node.order_id,
        task_type: node.task_type,
        address: node.address,
        lat: node.lat,
        lng: node.lng,
        status: 'pending' as const,
        required_photo_type: node.photo_type,
        completed_at: null,
    }));
}

/**
 * 2-opt swap: reverse the segment of route between indices i+1 and j (inclusive)
 */
function twoOptSwap(route: RouteNode[], i: number, j: number): RouteNode[] {
    const newRoute: RouteNode[] = [];
    // Keep route[0..i] as-is
    for (let k = 0; k <= i; k++) {
        newRoute.push(route[k]);
    }
    // Reverse route[i+1..j]
    for (let k = j; k >= i + 1; k--) {
        newRoute.push(route[k]);
    }
    // Keep route[j+1..end] as-is
    for (let k = j + 1; k < route.length; k++) {
        newRoute.push(route[k]);
    }
    return newRoute;
}

/**
 * Validate that all pickups come before their corresponding dropoffs
 */
function isRouteValid(route: RouteNode[]): boolean {
    const pickedUp = new Set<string>();
    for (const node of route) {
        if (node.task_type === 'pickup') {
            pickedUp.add(node.order_id);
        } else if (node.task_type === 'dropoff') {
            if (!pickedUp.has(node.order_id)) {
                return false; // Dropoff before pickup — invalid
            }
        }
    }
    return true;
}

/**
 * Calculate total route distance from start point through all nodes
 */
function calculateTotalDistance(route: RouteNode[], startLat: number, startLng: number): number {
    let total = 0;
    let prevLat = startLat;
    let prevLng = startLng;

    for (const node of route) {
        total += haversineDistance(prevLat, prevLng, node.lat, node.lng);
        prevLat = node.lat;
        prevLng = node.lng;
    }

    return total;
}

export { ALGORITHM_VERSION };
