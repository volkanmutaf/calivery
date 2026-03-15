import { CreateOrderRequest, AutoAssignRequest, ManualAssignRequest, PublishRouteGroupRequest, DriverCompleteStepRequest, CreateUserRequest, UpdateUserRequest, DeleteUserRequest, GetUserByUsernameRequest, DeleteOrderRequest, AdminCompleteOrderRequest } from './types';
import { SetTenantClaimsRequest, CreateTenantRequest, UpdateTenantConfigRequest } from './types';
/**
 * Create a new order (Admin only)
 */
export declare const createOrder: import("firebase-functions/v2/https").CallableFunction<CreateOrderRequest, any>;
/**
 * Auto-assign orders to drivers using fairness algorithm (Admin only)
 * Supports preview_only mode for showing preview before confirming
 */
export declare const autoAssignOrders: import("firebase-functions/v2/https").CallableFunction<AutoAssignRequest, any>;
/**
 * Manually assign specific orders to a specific driver (Admin only)
 * This allows admins to override the auto-assignment and select exactly which
 * orders go to which driver. The routing algorithm still generates optimal
 * pickup/dropoff sequence based on driver location.
 * Supports preview_only mode for showing preview before confirming.
 */
export declare const manualAssignOrders: import("firebase-functions/v2/https").CallableFunction<ManualAssignRequest, any>;
/**
 * Publish a route group to the driver (Admin only)
 */
export declare const publishRouteGroup: import("firebase-functions/v2/https").CallableFunction<PublishRouteGroupRequest, any>;
/**
 * Driver completes a route step (pickup or delivery)
 */
export declare const driverCompleteStep: import("firebase-functions/v2/https").CallableFunction<DriverCompleteStepRequest, any>;
/**
 * Recalculate weekly earnings for all drivers (scheduled daily)
 */
export declare const recalculateEarnings: import("firebase-functions/v2/scheduler").ScheduleFunction;
/**
 * Manual trigger to recalculate earnings (Admin only)
 */
export declare const triggerEarningsRecalculation: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
}>>;
/**
 * Create a new user (Admin only)
 * Creates Firebase Auth user and Firestore profile
 */
export declare const createUser: import("firebase-functions/v2/https").CallableFunction<CreateUserRequest, any>;
/**
 * Update an existing user (Admin only)
 */
export declare const updateUser: import("firebase-functions/v2/https").CallableFunction<UpdateUserRequest, any>;
/**
 * Delete a user (Admin only)
 * Deletes both Firebase Auth user and Firestore profile
 */
export declare const deleteUser: import("firebase-functions/v2/https").CallableFunction<DeleteUserRequest, any>;
/**
 * Get user email by username (for username login)
 * This is a public function - does not require auth
 */
export declare const getUserByUsername: import("firebase-functions/v2/https").CallableFunction<GetUserByUsernameRequest, any>;
/**
 * Delete an order (Admin only)
 * Also removes associated route steps to prevent driver app errors
 */
export declare const deleteOrder: import("firebase-functions/v2/https").CallableFunction<DeleteOrderRequest, any>;
/**
 * Force complete an order (Admin only)
 * Marks order as delivered and completes all associated steps
 */
export declare const adminCompleteOrder: import("firebase-functions/v2/https").CallableFunction<AdminCompleteOrderRequest, any>;
/**
 * Set tenant_id and role as custom claims on a Firebase Auth user
 * Super admin only
 */
export declare const setTenantClaims: import("firebase-functions/v2/https").CallableFunction<SetTenantClaimsRequest, any>;
/**
 * Create a new tenant with default configuration
 * Super admin only
 */
export declare const createTenant: import("firebase-functions/v2/https").CallableFunction<CreateTenantRequest, any>;
/**
 * Update tenant configuration (features and limits)
 * Super admin only
 */
export declare const updateTenantConfig: import("firebase-functions/v2/https").CallableFunction<UpdateTenantConfigRequest, any>;
/**
 * Create a user and assign them to a tenant with a role
 * Creates Firebase Auth user + sets custom claims + creates Firestore profile
 * Super admin only
 */
export declare const createTenantAdmin: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    uid: string;
}>>;
/**
 * Update tenant status (active, suspended, inactive)
 * Super admin only
 */
export declare const updateTenantStatus: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
}>>;
/**
 * Delete a tenant and its config
 * Super admin only
 */
export declare const deleteTenant: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
}>>;
/**
 * One-off migration function to set missing tenant_id to 'default'
 * Super admin only
 */
export declare const migrateTenantData: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    profiles_updated: number;
    orders_updated: number;
}>>;
export * from './notifications';
//# sourceMappingURL=index.d.ts.map