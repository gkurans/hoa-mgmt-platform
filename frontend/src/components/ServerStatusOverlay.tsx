import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { onServerStatusChange, wakeUpServer, checkServerHealth } from '../services/api';

type ServerStatus = 'ready' | 'waking' | 'error';

interface ServerStatusOverlayProps {
  children: React.ReactNode;
}

export default function ServerStatusOverlay({ children }: ServerStatusOverlayProps) {
  const [status, setStatus] = useState<ServerStatus>('ready');
  const [message, setMessage] = useState<string>('');
  const [retrying, setRetrying] = useState(false);
  const spinValue = useState(new Animated.Value(0))[0];

  useEffect(() => {
    // Subscribe to server status changes
    const unsubscribe = onServerStatusChange((newStatus, newMessage) => {
      setStatus(newStatus);
      setMessage(newMessage || '');
    });

    // Initial health check when app loads
    const initialCheck = async () => {
      const isHealthy = await checkServerHealth();
      if (!isHealthy) {
        // Server might be sleeping, try to wake it
        wakeUpServer();
      }
    };
    
    initialCheck();

    return unsubscribe;
  }, []);

  // Spinning animation for loading icon
  useEffect(() => {
    if (status === 'waking') {
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1500,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spinValue.setValue(0);
    }
  }, [status, spinValue]);

  const handleRetry = async () => {
    setRetrying(true);
    const success = await wakeUpServer();
    setRetrying(false);
    if (!success) {
      setMessage('Still unable to connect. Please check your internet connection.');
    }
  };

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Don't show overlay when server is ready
  if (status === 'ready') {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <Modal
        visible={status !== 'ready'}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.overlay}>
          <View style={styles.content}>
            {status === 'waking' ? (
              <>
                <Animated.View style={{ transform: [{ rotate: spin }] }}>
                  <Ionicons name="sync" size={48} color="#2563eb" />
                </Animated.View>
                <Text style={styles.title}>Connecting to Server</Text>
                <Text style={styles.message}>{message || 'Please wait...'}</Text>
                <View style={styles.progressContainer}>
                  <ActivityIndicator size="small" color="#2563eb" />
                  <Text style={styles.progressText}>This may take up to 30 seconds</Text>
                </View>
              </>
            ) : (
              <>
                <Ionicons name="cloud-offline" size={48} color="#dc2626" />
                <Text style={styles.title}>Connection Issue</Text>
                <Text style={styles.message}>{message || 'Unable to connect to server'}</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={handleRetry}
                  disabled={retrying}
                >
                  {retrying ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="refresh" size={20} color="#fff" />
                      <Text style={styles.retryButtonText}>Retry Connection</Text>
                    </>
                  )}
                </TouchableOpacity>
                <Text style={styles.helpText}>
                  If this persists, please check your internet connection or try again later.
                </Text>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    maxWidth: 350,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  progressText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 8,
    minWidth: 180,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  helpText: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
});
