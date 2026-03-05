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

// Categories
export const getCategories = () => api.get('/categories');
export const createCategory = (data: any) => api.post('/categories', data);

// Annual Setup
export const getAnnualSetups = () => api.get('/billing/annual-setup');
export const createAnnualSetup = (data: any) => api.post('/billing/annual-setup', data);
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

// Reports
export const getTrueUpReport = (year: number) => api.get(`/reports/true-up/${year}`);
export const carryForward = (year: number) => api.post(`/reports/carry-forward/${year}`);

// Dashboard
export const getAdminDashboard = () => api.get('/dashboard/admin');
export const getOwnerDashboard = () => api.get('/dashboard/owner');

// Ledger
export const getUnitLedger = (unitId: string, year?: number) =>
  api.get(`/ledger/${unitId}`, { params: year ? { year } : {} });

// Seed
export const seedData = () => api.post('/seed');

export default api;
