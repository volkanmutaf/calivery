import * as admin from 'firebase-admin';
import { DriverCandidate, Order, RouteStep } from './types';
declare const ALGORITHM_VERSION = "v2.0-cluster-2opt";
/**
 * Calculate haversine distance between two points in km
 */
export declare function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number;
/**
 * Get the current ISO week's Monday date string
 */
export declare function getWeekStartDate(date?: Date): string;
/**
 * Find and rank candidate drivers for an order using fairness algorithm
 */
export declare function findBestDriverForOrder(db: admin.firestore.Firestore, order: Order, candidateLimit?: number): Promise<DriverCandidate | null>;
/**
 * Generate optimized route steps for a driver with multiple orders
 * Uses cluster-aware nearest-neighbor + 2-opt optimization
 * Constraint: dropoff cannot appear before its corresponding pickup
 */
export declare function generateRouteSteps(driverBaseLat: number, driverBaseLng: number, orders: Order[]): RouteStep[];
export { ALGORITHM_VERSION };
//# sourceMappingURL=routing.d.ts.map