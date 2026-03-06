import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Units
export const getUnits = () => api.get('/units');
export const getUnit = (id: string) => api.get(`/units/${id}`);
export const createUnit = (data: any) => api.post('/units', data);
export const updateUnit = (id: string, data: any) => api.put(`/units/${id}`, data);
export const assignOwner = (unitId: string, ownerId: string) =>
  api.post(`/units/${unitId}/assign-owner`, { owner_id: ownerId, role: 'primary' });

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

export const getFiles = (folderId?: string) => 
  api.get('/documents/files', { params: folderId ? { folder_id: folderId } : {} });
export const uploadFile = (formData: FormData) =>
  api.post('/documents/files/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    transformRequest: (data) => data, // Prevent axios from transforming FormData
  });
export const downloadFile = (documentId: string) =>
  api.get(`/documents/files/${documentId}/download`, { responseType: 'blob' });
export const deleteFile = (documentId: string) => api.delete(`/documents/files/${documentId}`);

export const searchDocuments = (query: string) => api.get('/documents/search', { params: { q: query } });
export const getBreadcrumb = (folderId: string) => api.get(`/documents/breadcrumb/${folderId}`);

// Ledger
export const getUnitLedger = (unitId: string, year?: number) =>
  api.get(`/ledger/${unitId}`, { params: year ? { year } : {} });

// Seed
export const seedData = () => api.post('/seed');

export default api;
