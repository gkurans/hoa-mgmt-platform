import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Card from '../../src/components/Card';

export default function DocumentsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Documents</Text>
        <Text style={styles.subtitle}>HOA documents and records</Text>
      </View>

      <View style={styles.content}>
        <Card style={styles.comingSoonCard}>
          <View style={styles.iconContainer}>
            <Ionicons name="folder-open" size={64} color="#94a3b8" />
          </View>
          <Text style={styles.comingSoonTitle}>Coming Soon</Text>
          <Text style={styles.comingSoonText}>
            Document management features are currently under development.
          </Text>
          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#2563eb" />
              <Text style={styles.featureText}>HOA Policies & Guidelines</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#2563eb" />
              <Text style={styles.featureText}>Meeting Minutes</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#2563eb" />
              <Text style={styles.featureText}>Financial Statements</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#2563eb" />
              <Text style={styles.featureText}>Unit Documents</Text>
            </View>
          </View>
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  content: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  comingSoonCard: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  comingSoonTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  comingSoonText: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  featureList: {
    alignSelf: 'stretch',
    paddingHorizontal: 24,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  featureText: {
    fontSize: 15,
    color: '#1e293b',
    fontWeight: '500',
  },
});
