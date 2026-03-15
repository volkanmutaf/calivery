// Firestore Document Types for Calivery

export type UserRole = 'admin' | 'driver' | 'tenant_admin' | 'super_admin';

export type OrderStatus = 'new' | 'assigned' | 'in_progress' | 'delivered' | 'cancelled';

export type OrderSource = 'manual' | 'ezcater_future';

export type RouteGroupStatus = 'active' | 'completed' | 'cancelled';

export type StepStatus = 'pending' | 'completed';

export type TaskType = 'pickup' | 'dropoff';

export type PhotoType = 'pickup' | 'delivery';

export type EventType =
    | 'order_created'
    | 'assigned'
    | 'system_route_generated'
    | 'pickup_photo_uploaded'
    | 'picked_up'
    | 'delivery_photo_uploaded'
    | 'delivered'
    | 'reassigned'
    | 'cancelled';

export type ActorRole = 'admin' | 'driver' | 'system';

// Profile document
export interface Profile {
    role: UserRole;
    username: string;
    email: string | null;
    phone: string | null;
    photo_url: string | null;
    driver_base_address: string;
    driver_base_lat: number;
    driver_base_lng: number;
    is_active: boolean;
    tenant_id?: string;
    created_at: FirebaseFirestore.Timestamp;
    updated_at: FirebaseFirestore.Timestamp;
}

// Order document
export interface Order {
    order_code: string;
    source: OrderSource;
    restaurant_name: string;
    pickup_address: string;
    pickup_lat: number;
    pickup_lng: number;
    dropoff_address: string;
    dropoff_lat: number;
    dropoff_lng: number;
    payout_amount: number;
    scheduled_date: string; // "YYYY-MM-DD"
    time_window_start: FirebaseFirestore.Timestamp | null;
    time_window_end: FirebaseFirestore.Timestamp | null;
    status: OrderStatus;
    assigned_driver_id: string | null;
    route_group_id: string | null;
    tenant_id?: string;
    created_by: string;
    created_at: FirebaseFirestore.Timestamp;
    updated_at: FirebaseFirestore.Timestamp;
    last_event_time: FirebaseFirestore.Timestamp;
}

// Order event (audit log)
export interface OrderEvent {
    event_type: EventType;
    actor_role: ActorRole;
    actor_id: string;
    event_time: FirebaseFirestore.Timestamp;
    metadata: Record<string, unknown>;
}

// Order photo metadata
export interface OrderPhoto {
    photo_type: PhotoType;
    storage_path: string;
    uploaded_by: string;
    uploaded_at: FirebaseFirestore.Timestamp;
    order_id: string;
    step_id: string | null;
}

// Route group document
export interface RouteGroup {
    driver_id: string;
    scheduled_date: string;
    status: RouteGroupStatus;
    algorithm_version: string;
    generated_at: FirebaseFirestore.Timestamp;
    published_at: FirebaseFirestore.Timestamp | null;
    tenant_id?: string;
    summary: {
        distance_estimate: number;
        fairness_notes: string;
        order_count: number;
    };
}

// Route step document
export interface RouteStep {
    sequence_index: number;
    order_id: string;
    task_type: TaskType;
    address: string;
    lat: number;
    lng: number;
    status: StepStatus;
    required_photo_type: PhotoType;
    completed_at: FirebaseFirestore.Timestamp | null;
}

// Weekly earnings document
export interface EarningsWeekly {
    driver_id: string;
    week_start_date: string;
    week_end_date: string;
    total_earnings: number;
    order_count: number;
    tenant_id?: string;
    last_calculated_at: FirebaseFirestore.Timestamp;
}

// Daily stats document
export interface StatsDaily {
    driver_id: string;
    date: string;
    completed_orders: number;
    avg_minutes_per_order: number;
    on_time_rate: number | null;
}

// Counter document (for order_code generation)
export interface Counter {
    value: number;
    updated_at: FirebaseFirestore.Timestamp;
}

// ============================================
// Request/Response types for Cloud Functions
// ============================================

export interface CreateOrderRequest {
    restaurant_name: string;
    pickup_address: string;
    dropoff_address: string;
    payout_amount: number;
    scheduled_date: string;
    time_window_start?: string; // ISO string
    time_window_end?: string; // ISO string
}

export interface CreateOrderResponse {
    order_id: string;
    order_code: string;
}

export interface AutoAssignRequest {
    scheduled_date: string;
    order_ids?: string[]; // Specific orders, or all unassigned for date
    driver_ids?: string[]; // Specific drivers, or all active
    max_orders_per_driver: number;
    preview_only?: boolean; // If true, don't write to DB, just return preview
}

export interface AutoAssignResponse {
    route_groups: Array<{
        route_group_id: string;
        driver_id: string;
        driver_username: string;
        orders: string[];
        total_distance_miles: number;
        total_duration_mins: number;
        google_maps_url: string;
        steps: Array<{
            sequence_index: number;
            order_id: string;
            task_type: TaskType;
            address: string;
            lat: number;
            lng: number;
            estimated_time: string; // ISO string or HH:mm
        }>;
        fairness_score: number;
    }>;
}

// Manual assignment request - assigns specific orders to a specific driver
export interface ManualAssignRequest {
    scheduled_date: string;
    order_ids: string[];
    driver_id: string;
    preview_only?: boolean;
}

export interface PublishRouteGroupRequest {
    route_group_id: string;
}

export interface DriverCompleteStepRequest {
    route_group_id: string;
    step_id: string;
    photo_storage_path: string;
}

export interface DriverCompleteStepResponse {
    success: boolean;
    next_step_id: string | null;
    route_completed: boolean;
}

// ============================================
// Internal types for routing algorithm
// ============================================

export interface DriverCandidate {
    uid: string;
    username: string;
    base_lat: number;
    base_lng: number;
    weekly_earnings: number;
    active_steps_count: number;
    distance_to_pickup: number;
    distance_score: number;
    need_score: number;
    workload_score: number;
    combined_score: number;
}

export interface RouteNode {
    order_id: string;
    task_type: TaskType;
    address: string;
    lat: number;
    lng: number;
    photo_type: PhotoType;
}

// ============================================
// User Management Request/Response types
// ============================================

export interface CreateUserRequest {
    email: string;
    password: string;
    username: string;
    role: UserRole;
    tenant_id?: string;
    phone?: string;
    driver_base_address?: string;
    driver_base_lat?: number;
    driver_base_lng?: number;
    is_active?: boolean;
}

export interface CreateUserResponse {
    uid: string;
    success: boolean;
}

export interface UpdateUserRequest {
    uid: string;
    username?: string;
    email?: string;
    password?: string; // Optional - only if changing password
    phone?: string;
    role?: UserRole;
    is_active?: boolean;
    driver_base_address?: string;
    driver_base_lat?: number;
    driver_base_lng?: number;
}

export interface UpdateUserResponse {
    success: boolean;
}

export interface DeleteUserRequest {
    uid: string;
}

export interface DeleteUserResponse {
    success: boolean;
}

export interface GetUserByUsernameRequest {
    username: string;
}

export interface GetUserByUsernameResponse {
    email: string | null;
    found: boolean;
}

export interface DeleteOrderRequest {
    order_id: string;
}

export interface DeleteOrderResponse {
    success: boolean;
}

export interface AdminCompleteOrderRequest {
    order_id: string;
}

export interface AdminCompleteOrderResponse {
    success: boolean;
}

// ============================================
// Tenant & Feature Flag Types
// ============================================

export interface Tenant {
    name: string;
    brand_name: string;
    logo_url: string;
    primary_color: string;
    secondary_color: string;
    status: 'active' | 'suspended' | 'inactive';
    created_at: FirebaseFirestore.Timestamp;
}

export interface FeatureFlags {
    driver_tracking: boolean;
    payouts: boolean;
    reports: boolean;
    sms_notifications: boolean;
    analytics: boolean;
    auto_assign: boolean;
    [key: string]: boolean;
}

export interface TenantLimits {
    max_drivers: number;
    max_dispatchers: number;
}

export interface TenantConfig {
    features: FeatureFlags;
    limits: TenantLimits;
}

// ============================================
// Tenant Management Request/Response types
// ============================================

export interface SetTenantClaimsRequest {
    uid: string;
    tenant_id: string;
    role: UserRole;
}

export interface CreateTenantRequest {
    tenant_id: string; // Custom ID for the tenant
    name: string;
    brand_name: string;
    logo_url?: string;
    primary_color?: string;
    secondary_color?: string;
}

export interface UpdateTenantConfigRequest {
    tenant_id: string;
    features?: Partial<FeatureFlags>;
    limits?: Partial<TenantLimits>;
}

// ============================================
// Notification Request/Response types
// ============================================

export interface SendManualNotificationRequest {
    tenant_id: string;
    title: string;
    body: string;
    target_type: 'all_drivers' | 'specific_driver';
    target_driver_id?: string;
    sender_user_id: string;
}

export interface SendManualNotificationResponse {
    success: boolean;
    total_targeted: number;
    total_success: number;
    total_failed: number;
}

