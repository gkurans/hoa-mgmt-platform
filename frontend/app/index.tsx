import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import LoadingSpinner from '../src/components/LoadingSpinner';

export default function Index() {
  const { isLoading, isAuthenticated, loadStoredAuth } = useAuthStore();
  const hasNavigated = useRef(false);

  useEffect(() => {
    // Always reload auth state when this component mounts
    loadStoredAuth();
  }, []);

  useEffect(() => {
    // Prevent double navigation
    if (!isLoading && !hasNavigated.current) {
      hasNavigated.current = true;
      if (isAuthenticated) {
        router.replace('/(tabs)/dashboard');
      } else {
        router.replace('/(auth)/login');
      }
    }
  }, [isLoading, isAuthenticated]);

  return (
    <View style={styles.container}>
      <LoadingSpinner message="Loading..." />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
});
