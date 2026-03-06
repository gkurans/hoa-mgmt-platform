import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: string;
  unit_ids: string[];
  created_at: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, phone: string) => Promise<void>;
  logout: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
  isAdmin: boolean;
  resetLoading: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,
  isAdmin: false,

  login: async (email: string, password: string) => {
    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        email,
        password,
      });
      const { access_token, user } = response.data;
      await AsyncStorage.setItem('token', access_token);
      await AsyncStorage.setItem('user', JSON.stringify(user));
      const adminRole = user?.role === 'admin' || user?.role === 'treasurer';
      set({ 
        user, 
        token: access_token, 
        isAuthenticated: true, 
        isAdmin: adminRole,
        isLoading: false 
      });
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Login failed');
    }
  },

  register: async (name: string, email: string, password: string, phone: string) => {
    try {
      const response = await axios.post(`${API_URL}/api/auth/register`, {
        name,
        email,
        password,
        phone,
        role: 'owner',
      });
      const { access_token, user } = response.data;
      await AsyncStorage.setItem('token', access_token);
      await AsyncStorage.setItem('user', JSON.stringify(user));
      const adminRole = user?.role === 'admin' || user?.role === 'treasurer';
      set({ 
        user, 
        token: access_token, 
        isAuthenticated: true, 
        isAdmin: adminRole,
        isLoading: false 
      });
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Registration failed');
    }
  },

  logout: async () => {
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('user');
    // Reset all state including isLoading to allow fresh login
    set({ 
      user: null, 
      token: null, 
      isAuthenticated: false, 
      isAdmin: false,
      isLoading: false 
    });
  },

  loadStoredAuth: async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const userStr = await AsyncStorage.getItem('user');
      if (token && userStr) {
        const user = JSON.parse(userStr);
        const adminRole = user?.role === 'admin' || user?.role === 'treasurer';
        set({ 
          user, 
          token, 
          isAuthenticated: true, 
          isAdmin: adminRole,
          isLoading: false 
        });
      } else {
        set({ isLoading: false, isAuthenticated: false, isAdmin: false });
      }
    } catch {
      set({ isLoading: false, isAuthenticated: false, isAdmin: false });
    }
  },

  resetLoading: () => {
    set({ isLoading: false });
  },
}));
