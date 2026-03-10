import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import { getAdminDashboard, getOwnerDashboard, getSystemStatus, createBackup } from '../../src/services/api';
import Card from '../../src/components/Card';
import LoadingSpinner from '../../src/components/LoadingSpinner';

interface AdminData {
  total_units: number;
  total_condos: number;
  total_shops: number;
  total_outstanding: number;
  units_overdue: number;
  recent_payments: any[];
  allocation_status: string;
  // Financial Metrics
  reserve_balance: number;
  total_collected: number;
  payments_this_year: number;
  expenses_this_year: number;
}

interface OwnerData {
  unit_id: string;
  unit_display: string;
  current_balance: number;
  last_payment_date: string | null;
  last_payment_amount: number | null;
  recent_charges: any[];
  // Financial Metrics (for transparency)
  reserve_balance: number;
  total_collected: number;
  payments_this_year: number;
  expenses_this_year: number;
}

interface SystemStatus {
  environment: string;
  is_production: boolean;
  write_protection: boolean;
}

export default function DashboardScreen() {
  const { user, isAdmin } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [adminData, setAdminData] = useState<AdminData | null>(null);
  const [ownerData, setOwnerData] = useState<OwnerData | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);

  const fetchData = useCallback(async () => {
    // Don't fetch if user is not logged in
    if (!user) {
      setLoading(false);
      return;
    }
    
    try {
      // Fetch system status first
      try {
        const statusResponse = await getSystemStatus();
        setSystemStatus(statusResponse.data);
      } catch (e) {
        // System status is optional
      }
      
      // Fetch admin dashboard for all users (now accessible to everyone for transparency)
      const response = await getAdminDashboard();
      setAdminData(response.data);
      
      // Also fetch owner-specific data if user is an owner with assigned units
      if (!isAdmin && user?.unit_ids?.length) {
        try {
          const ownerResponse = await getOwnerDashboard();
          setOwnerData(ownerResponse.data);
        } catch (e) {
          // Owner dashboard is optional, don't fail if it errors
        }
      }
    } catch (error) {
      console.error('Dashboard error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin, user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleBackup = async () => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Create a backup of all HOA data?');
      if (!confirmed) return;
    } else {
      return new Promise((resolve) => {
        Alert.alert(
          'Create Backup',
          'This will create a backup of all HOA data. Continue?',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Create Backup', onPress: () => resolve(true) },
          ]
        );
      }).then(async (confirmed) => {
        if (!confirmed) return;
        await performBackup();
      });
    }
    await performBackup();
  };

  const performBackup = async () => {
    setBackupLoading(true);
    try {
      const response = await createBackup();
      const backupData = response.data;
      
      // Create downloadable file
      if (Platform.OS === 'web') {
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `hoa_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        alert('Backup created and downloaded successfully!');
      } else {
        Alert.alert('Success', 'Backup created successfully! Check your downloads.');
      }
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Failed to create backup';
      if (Platform.OS === 'web') {
        alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setBackupLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  };

  if (loading) {
    return <LoadingSpinner message="Loading dashboard..." />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Environment Badge */}
        {systemStatus && (
          <View style={[
            styles.envBadge,
            { backgroundColor: systemStatus.is_production ? '#dcfce7' : '#fef3c7' }
          ]}>
            <Ionicons 
              name={systemStatus.is_production ? "shield-checkmark" : "warning"} 
              size={16} 
              color={systemStatus.is_production ? '#16a34a' : '#d97706'} 
            />
            <Text style={[
              styles.envBadgeText,
              { color: systemStatus.is_production ? '#16a34a' : '#d97706' }
            ]}>
              {systemStatus.environment.toUpperCase()}
              {systemStatus.write_protection && !systemStatus.is_production && ' (READ-ONLY)'}
            </Text>
          </View>
        )}

        <View style={styles.header}>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.userName}>{user?.name}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{user?.role.toUpperCase()}</Text>
          </View>
        </View>

        {/* Admin Actions - Backup Button */}
        {isAdmin && (
          <Card style={styles.adminActionsCard}>
            <Text style={styles.adminActionsTitle}>Admin Actions</Text>
            <View style={styles.adminActionsRow}>
              <TouchableOpacity 
                style={styles.backupButton}
                onPress={handleBackup}
                disabled={backupLoading}
              >
                <Ionicons 
                  name={backupLoading ? "hourglass" : "cloud-download"} 
                  size={20} 
                  color="#fff" 
                />
                <Text style={styles.backupButtonText}>
                  {backupLoading ? 'Creating...' : 'Create Backup'}
                </Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}

        {/* Show admin dashboard view for ALL users (read-only for owners) */}
        {adminData ? (
          <View style={styles.content}>
            {/* Show role-specific notice for non-admins */}
            {!isAdmin && (
              <Card style={styles.infoNotice}>
                <View style={styles.infoNoticeContent}>
                  <Ionicons name="information-circle" size={20} color="#2563eb" />
                  <Text style={styles.infoNoticeText}>
                    Viewing HOA overview (read-only access)
                  </Text>
                </View>
              </Card>
            )}
            
            <View style={styles.statsGrid}>
              <Card style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: '#dbeafe' }]}>
                  <Ionicons name="business" size={24} color="#2563eb" />
                </View>
                <Text style={styles.statValue}>{adminData.total_units}</Text>
                <Text style={styles.statLabel}>Total Units</Text>
              </Card>

              <Card style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: '#fef3c7' }]}>
                  <Ionicons name="warning" size={24} color="#d97706" />
                </View>
                <Text style={styles.statValue}>{adminData.units_overdue}</Text>
                <Text style={styles.statLabel}>Overdue</Text>
              </Card>
            </View>

            <Card style={styles.outstandingCard}>
              <View style={styles.outstandingHeader}>
                <Ionicons name="wallet" size={28} color="#dc2626" />
                <Text style={styles.outstandingLabel}>Total Outstanding</Text>
              </View>
              <Text style={styles.outstandingValue}>
                {formatCurrency(adminData.total_outstanding)}
              </Text>
            </Card>

            {/* Financial Metrics Section */}
            <Text style={styles.financialSectionTitle}>HOA Financial Overview</Text>
            <View style={styles.financialGrid}>
              <Card style={styles.financialCard}>
                <View style={[styles.financialIcon, { backgroundColor: '#dcfce7' }]}>
                  <Ionicons name="shield-checkmark" size={20} color="#16a34a" />
                </View>
                <Text style={styles.financialValue}>
                  {formatCurrency(adminData.reserve_balance || 0)}
                </Text>
                <Text style={styles.financialLabel}>Reserve Balance</Text>
              </Card>
              <Card style={styles.financialCard}>
                <View style={[styles.financialIcon, { backgroundColor: '#dbeafe' }]}>
                  <Ionicons name="trending-up" size={20} color="#2563eb" />
                </View>
                <Text style={styles.financialValue}>
                  {formatCurrency(adminData.total_collected || 0)}
                </Text>
                <Text style={styles.financialLabel}>Total Collected</Text>
              </Card>
              <Card style={styles.financialCard}>
                <View style={[styles.financialIcon, { backgroundColor: '#fef3c7' }]}>
                  <Ionicons name="card" size={20} color="#d97706" />
                </View>
                <Text style={styles.financialValue}>
                  {formatCurrency(adminData.payments_this_year || 0)}
                </Text>
                <Text style={styles.financialLabel}>Payments This Year</Text>
              </Card>
              <Card style={styles.financialCard}>
                <View style={[styles.financialIcon, { backgroundColor: '#fecaca' }]}>
                  <Ionicons name="cash" size={20} color="#dc2626" />
                </View>
                <Text style={styles.financialValue}>
                  {formatCurrency(adminData.expenses_this_year || 0)}
                </Text>
                <Text style={styles.financialLabel}>Vendor Payments</Text>
              </Card>
            </View>

            <View style={styles.unitTypes}>
              <Card style={styles.unitTypeCard}>
                <Ionicons name="home" size={24} color="#2563eb" />
                <Text style={styles.unitTypeValue}>{adminData.total_condos}</Text>
                <Text style={styles.unitTypeLabel}>Condos</Text>
              </Card>
              <Card style={styles.unitTypeCard}>
                <Ionicons name="storefront" size={24} color="#059669" />
                <Text style={styles.unitTypeValue}>{adminData.total_shops}</Text>
                <Text style={styles.unitTypeLabel}>Shops</Text>
              </Card>
            </View>

            <Card style={styles.section}>
              <Text style={styles.sectionTitle}>Allocation Status</Text>
              <View style={styles.statusRow}>
                <View style={[
                  styles.statusBadge,
                  { backgroundColor: adminData.allocation_status === 'posted' ? '#dcfce7' : '#fef3c7' }
                ]}>
                  <Text style={[
                    styles.statusText,
                    { color: adminData.allocation_status === 'posted' ? '#16a34a' : '#d97706' }
                  ]}>
                    {adminData.allocation_status.toUpperCase()}
                  </Text>
                </View>
              </View>
            </Card>

            {adminData.recent_payments.length > 0 && (
              <Card style={styles.section}>
                <Text style={styles.sectionTitle}>Recent Payments</Text>
                {adminData.recent_payments.map((payment, index) => (
                  <View key={index} style={styles.paymentItem}>
                    <View style={styles.paymentInfo}>
                      <Text style={styles.paymentUnit}>{payment.unit}</Text>
                      <Text style={styles.paymentDate}>{payment.date}</Text>
                    </View>
                    <Text style={styles.paymentAmount}>
                      {formatCurrency(payment.amount)}
                    </Text>
                  </View>
                ))}
              </Card>
            )}
          </View>
        ) : (
          <Card style={styles.noDataCard}>
            <Ionicons name="alert-circle" size={48} color="#94a3b8" />
            <Text style={styles.noDataText}>No unit assigned</Text>
            <Text style={styles.noDataSubtext}>
              Please contact the administrator to assign a unit to your account.
            </Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  greeting: {
    fontSize: 16,
    color: '#64748b',
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 4,
  },
  roleBadge: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  roleText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1e293b',
  },
  statLabel: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  outstandingCard: {
    marginBottom: 16,
    backgroundColor: '#fef2f2',
  },
  outstandingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  outstandingLabel: {
    fontSize: 16,
    color: '#991b1b',
    fontWeight: '500',
  },
  outstandingValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#dc2626',
    marginTop: 8,
  },
  unitTypes: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  unitTypeCard: {
    flex: 1,
    alignItems: 'center',
  },
  unitTypeValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 8,
  },
  unitTypeLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  paymentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  paymentInfo: {
    flex: 1,
  },
  paymentUnit: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1e293b',
  },
  paymentDate: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  paymentAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#16a34a',
  },
  balanceCard: {
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 24,
  },
  balanceLabel: {
    fontSize: 16,
    color: '#64748b',
  },
  balanceValue: {
    fontSize: 40,
    fontWeight: '700',
    marginTop: 8,
  },
  unitName: {
    fontSize: 18,
    fontWeight: '500',
    color: '#1e293b',
    marginTop: 8,
  },
  lastPaymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastPaymentAmount: {
    fontSize: 20,
    fontWeight: '600',
    color: '#16a34a',
  },
  lastPaymentDate: {
    fontSize: 16,
    color: '#64748b',
  },
  chargeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  chargeInfo: {
    flex: 1,
  },
  chargeCategory: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1e293b',
  },
  chargePeriod: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  chargeRight: {
    alignItems: 'flex-end',
  },
  chargeAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  chargeStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 4,
  },
  chargeStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  noDataCard: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  noDataText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 16,
  },
  noDataSubtext: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 24,
  },
  financialSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 8,
    marginBottom: 12,
  },
  financialGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  financialCard: {
    width: '47%',
    alignItems: 'center',
    paddingVertical: 16,
  },
  financialIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  financialValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  financialLabel: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
  },
  infoNotice: {
    marginBottom: 16,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  infoNoticeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoNoticeText: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '500',
  },
  envBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  envBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  adminActionsCard: {
    marginBottom: 16,
    padding: 16,
  },
  adminActionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 12,
  },
  adminActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  backupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  backupButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
