import axios, { AxiosError } from 'axios';
import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

// Enhanced Retry configuration for server wake-up
const MAX_RETRIES = 6; // More retries for sleeping server
const INITIAL_RETRY_DELAY = 3000; // 3 seconds initial
const MAX_RETRY_DELAY = 15000; // 15 seconds max
const WAKE_UP_TIMEOUT = 60000; // 60 seconds total wake-up timeout

// Helper to delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Calculate exponential backoff delay
const getRetryDelay = (retryCount: number): number => {
  const exponentialDelay = INITIAL_RETRY_DELAY * Math.pow(1.5, retryCount);
  return Math.min(exponentialDelay, MAX_RETRY_DELAY);
};

// Server status tracking with events
type ServerStatus = 'ready' | 'waking' | 'error';
let currentServerStatus: ServerStatus = 'ready';
let serverStatusListeners: ((status: ServerStatus, message?: string) => void)[] = [];
let wakeUpStartTime: number | null = null;

export const getServerStatus = (): ServerStatus => currentServerStatus;

export const setServerStatus = (status: ServerStatus, message?: string) => {
  currentServerStatus = status;
  if (status === 'waking' && !wakeUpStartTime) {
    wakeUpStartTime = Date.now();
  } else if (status === 'ready') {
    wakeUpStartTime = null;
  }
  serverStatusListeners.forEach(listener => listener(status, message));
};

export const onServerStatusChange = (callback: (status: ServerStatus, message?: string) => void) => {
  serverStatusListeners.push(callback);
  // Immediately notify of current status
  callback(currentServerStatus);
  return () => {
    serverStatusListeners = serverStatusListeners.filter(l => l !== callback);
  };
};

// Legacy exports for backward compatibility
export const notifyServerWakeUp = () => setServerStatus('waking', 'Server is starting up...');
export const notifyServerReady = () => setServerStatus('ready');
export const isServerWaking = () => currentServerStatus === 'waking';

// Health check function to wake server
export const checkServerHealth = async (): Promise<boolean> => {
  try {
    const response = await axios.get(`${API_URL}/api/health`, { timeout: 10000 });
    return response.status === 200;
  } catch {
    return false;
  }
};

// Proactive server wake-up function
export const wakeUpServer = async (): Promise<boolean> => {
  setServerStatus('waking', 'Connecting to server...');
  
  const startTime = Date.now();
  let attempt = 0;
  
  while (Date.now() - startTime < WAKE_UP_TIMEOUT) {
    attempt++;
    const message = attempt === 1 
      ? 'Connecting to server...' 
      : `Server is waking up... (attempt ${attempt})`;
    setServerStatus('waking', message);
    
    const isHealthy = await checkServerHealth();
    if (isHealthy) {
      setServerStatus('ready');
      return true;
    }
    
    // Wait before next attempt with exponential backoff
    const waitTime = getRetryDelay(attempt);
    await delay(waitTime);
  }
  
  setServerStatus('error', 'Server is taking too long to respond');
  return false;
};

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout
});

// Request interceptor - add auth token
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle errors with intelligent retry logic
api.interceptors.response.use(
  (response) => {
    setServerStatus('ready');
    return response;
  },
  async (error: AxiosError) => {
    const config = error.config as any;
    
    // Initialize retry count
    if (!config._retryCount) {
      config._retryCount = 0;
      config._startTime = Date.now();
    }
    
    // Check if this looks like a server sleep issue
    const isServerSleepError = (
      !error.response || // Network error (server not responding)
      error.response.status === 502 || // Bad Gateway
      error.response.status === 503 || // Service Unavailable
      error.response.status === 504 || // Gateway Timeout
      error.code === 'ECONNABORTED' || // Timeout
      error.code === 'ERR_NETWORK' || // Network error
      error.code === 'ECONNREFUSED' // Connection refused
    );
    
    // Check if we should retry (within time limit and retry count)
    const timeElapsed = Date.now() - config._startTime;
    const shouldRetry = (
      isServerSleepError &&
      config._retryCount < MAX_RETRIES &&
      timeElapsed < WAKE_UP_TIMEOUT
    );
    
    if (shouldRetry) {
      config._retryCount++;
      
      // Update status for user feedback
      const message = config._retryCount === 1
        ? 'Server is starting up, please wait...'
        : `Reconnecting to server... (attempt ${config._retryCount}/${MAX_RETRIES})`;
      setServerStatus('waking', message);
      
      console.log(`[API Retry] Attempt ${config._retryCount}/${MAX_RETRIES} - ${message}`);
      
      // Wait with exponential backoff
      const waitTime = getRetryDelay(config._retryCount);
      await delay(waitTime);
      
      // Retry the request
      return api(config);
    }
    
    // If we exhausted retries, update status
    if (isServerSleepError) {
      setServerStatus('error', 'Unable to connect to server. Please try again later.');
    } else {
      setServerStatus('ready'); // Other errors don't affect server status
    }
    
    return Promise.reject(error);
  }
);

// Units
export const getUnits = () => api.get('/units');
export const getUnit = (id: string) => api.get(`/units/${id}`);
export const createUnit = (data: any) => api.post('/units', data);
export const updateUnit = (id: string, data: any) => api.put(`/units/${id}`, data);
export const assignOwner = (unitId: string, ownerId: string, role: string = 'primary') =>
  api.post(`/units/${unitId}/assign-owner`, { owner_id: ownerId, role: role });
export const removeOwnerFromUnit = (unitId: string, ownerId: string) =>
  api.delete(`/units/${unitId}/remove-owner/${ownerId}`);

// Owners
export const getOwners = () => api.get('/owners');
export const createOwner = (data: any) => api.post('/owners', data);
export const updateOwner = (id: string, data: any) => api.put(`/owners/${id}`, data);
export const deleteOwner = (id: string) => api.delete(`/owners/${id}`);
export const resetOwnerPassword = (id: string) => api.post(`/owners/${id}/reset-password`);

// Categories
export const getCategories = () => api.get('/categories');
export const createCategory = (data: any) => api.post('/categories', data);

// Annual Setup
export const getAnnualSetups = () => api.get('/billing/annual-setup');
export const createAnnualSetup = (data: any) => api.post('/billing/annual-setup', data);
export const updateAnnualSetup = (id: string, data: any) => api.put(`/billing/annual-setup/${id}`, data);
export const deleteAnnualSetup = (id: string) => api.delete(`/billing/annual-setup/${id}`);
export const approveSetup = (id: string) => api.post(`/billing/annual-setup/${id}/approve`);
export const postCharges = (id: string, monthlySplit: boolean = false) =>
  api.post(`/billing/annual-setup/${id}/post?monthly_split=${monthlySplit}`);

// Charges
export const getCharges = (unitId?: string) =>
  api.get('/charges', { params: unitId ? { unit_id: unitId } : {} });
export const createCharge = (data: any) => api.post('/charges', data);

// Payments
export const getPayments = (unitId?: string) =>
  api.get('/payments', { params: unitId ? { unit_id: unitId } : {} });
export const createPayment = (data: any) => api.post('/payments', data);
export const updatePayment = (paymentId: string, data: {
  amount?: number;
  payment_date?: string;
  method?: string;
  reference?: string;
  notes?: string;
  reason: string; // Required for audit
}) => api.put(`/payments/${paymentId}`, data);

// Expenses (Outgoing payments to vendors)
export const getExpenses = () => api.get('/expenses');
export const createExpense = (data: any) => api.post('/expenses', data);
export const updateExpense = (expenseId: string, data: {
  vendor_name?: string;
  amount?: number;
  payment_date?: string;
  description?: string;
  method?: string;
  reference?: string;
  invoice_number?: string;
  reason: string; // Required for audit
}) => api.put(`/expenses/${expenseId}`, data);

// Adjustments (Post-posting corrections)
export const getAdjustments = (unitId?: string) =>
  api.get('/adjustments', { params: unitId ? { unit_id: unitId } : {} });
export const createAdjustment = (data: any) => api.post('/adjustments', data);

// Reports
export const getTrueUpReport = (year: number) => api.get(`/reports/true-up/${year}`);
export const carryForward = (year: number) => api.post(`/reports/carry-forward/${year}`);

// Dashboard
export const getAdminDashboard = () => api.get('/dashboard/admin');
export const getOwnerDashboard = () => api.get('/dashboard/owner');

// Profile
export const updateProfile = (data: { name?: string; phone?: string; email?: string }) => 
  api.put('/auth/profile', data);

// Audit Logs
export const getAuditLogs = (params?: {
  entity_type?: string;
  action?: string;
  start_date?: string;
  end_date?: string;
  unit_id?: string;
  limit?: number;
}) => api.get('/audit-logs', { params });
export const getAuditEntityTypes = () => api.get('/audit-logs/entity-types');
export const getAuditActions = () => api.get('/audit-logs/actions');

// Document Management
export const getFolders = (parentId?: string) => 
  api.get('/documents/folders', { params: parentId ? { parent_id: parentId } : {} });
export const getFolder = (folderId: string) => api.get(`/documents/folders/${folderId}`);
export const createFolder = (data: { name: string; parent_id?: string; description?: string }) =>
  api.post('/documents/folders', data);
export const updateFolder = (folderId: string, data: { name?: string; description?: string }) =>
  api.put(`/documents/folders/${folderId}`, data);
export const deleteFolder = (folderId: string) => api.delete(`/documents/folders/${folderId}`);
export const renameFolder = (folderId: string, newName: string) =>
  api.put(`/documents/folders/${folderId}/rename`, { new_name: newName });

export const getFiles = (folderId?: string) => 
  api.get('/documents/files', { params: folderId ? { folder_id: folderId } : {} });
export const uploadFile = (formData: FormData) => {
  // Platform-specific handling for FormData uploads
  const config: any = {
    transformRequest: (data: any) => data, // Prevent axios from transforming FormData
  };
  
  if (Platform.OS === 'web') {
    // On web, don't set Content-Type - let browser set it with boundary
    config.headers = { 'Content-Type': undefined };
  } else {
    // On native (iOS/Android), explicitly set multipart/form-data
    config.headers = { 'Content-Type': 'multipart/form-data' };
  }
  
  return api.post('/documents/files/upload', formData, config);
};
export const downloadFile = (documentId: string) =>
  api.get(`/documents/files/${documentId}/download`, { responseType: 'blob' });
export const deleteFile = (documentId: string) => api.delete(`/documents/files/${documentId}`);
export const renameFile = (documentId: string, newName: string) =>
  api.put(`/documents/files/${documentId}/rename`, { new_name: newName });

export const searchDocuments = (query: string) => api.get('/documents/search', { params: { q: query } });
export const getBreadcrumb = (folderId: string) => api.get(`/documents/breadcrumb/${folderId}`);

// Ledger
export const getUnitLedger = (unitId: string, year?: number) =>
  api.get(`/ledger/${unitId}`, { params: year ? { year } : {} });

// Board / Association Members
export const getCurrentLeadership = () => api.get('/board/current');
export const getCommitteeMembers = () => api.get('/board/committee');
export const getBoardHistory = () => api.get('/board/history');
export const getRoleResponsibilities = () => api.get('/board/responsibilities');
export const getElectionGuidelines = () => api.get('/board/election-guidelines');
export const getDecisions = () => api.get('/board/decisions');

export const createOfficeHolder = (data: {
  role: 'president' | 'treasurer';
  owner_id: string;
  year: number;
  start_date?: string;
  end_date?: string;
}) => api.post('/board/office-holders', data);

export const updateOfficeHolder = (holderId: string, data: {
  owner_id?: string;
  start_date?: string;
  end_date?: string;
}) => api.put(`/board/office-holders/${holderId}`, data);

export const deleteOfficeHolder = (holderId: string) => api.delete(`/board/office-holders/${holderId}`);

export const createDecision = (data: {
  title: string;
  description: string;
  decision_date: string;
  participants?: string[];
  document_ids?: string[];
}) => api.post('/board/decisions', data);

export const updateDecision = (decisionId: string, data: {
  title?: string;
  description?: string;
  decision_date?: string;
  participants?: string[];
  document_ids?: string[];
}) => api.put(`/board/decisions/${decisionId}`, data);

export const deleteDecision = (decisionId: string) => api.delete(`/board/decisions/${decisionId}`);

// Seed
export const seedData = () => api.post('/seed');

// System Status & Backup
export const getSystemStatus = () => api.get('/system/status');
export const createBackup = () => api.post('/admin/backup');
export const downloadBackup = () => api.get('/admin/backup/download', { responseType: 'blob' });
export const getBackupHistory = (limit: number = 10) => api.get('/admin/backup/history', { params: { limit } });

export default api;
