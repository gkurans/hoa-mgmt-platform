import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import { getAdminDashboard, getOwnerDashboard } from '../../src/services/api';
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
}

interface OwnerData {
  unit_id: string;
  unit_display: string;
  current_balance: number;
  last_payment_date: string | null;
  last_payment_amount: number | null;
  recent_charges: any[];
}

export default function DashboardScreen() {
  const { user, isAdmin } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [adminData, setAdminData] = useState<AdminData | null>(null);
  const [ownerData, setOwnerData] = useState<OwnerData | null>(null);

  const fetchData = useCallback(async () => {
    try {
      if (isAdmin) {
        const response = await getAdminDashboard();
        setAdminData(response.data);
      } else {
        const response = await getOwnerDashboard();
        setOwnerData(response.data);
      }
    } catch (error) {
      console.error('Dashboard error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
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
        <View style={styles.header}>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.userName}>{user?.name}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{user?.role.toUpperCase()}</Text>
          </View>
        </View>

        {isAdmin() && adminData ? (
          <View style={styles.content}>
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
        ) : ownerData ? (
          <View style={styles.content}>
            <Card style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>Current Balance</Text>
              <Text style={[
                styles.balanceValue,
                { color: ownerData.current_balance > 0 ? '#dc2626' : '#16a34a' }
              ]}>
                {formatCurrency(ownerData.current_balance)}
              </Text>
              <Text style={styles.unitName}>{ownerData.unit_display}</Text>
            </Card>

            {ownerData.last_payment_date && (
              <Card style={styles.section}>
                <Text style={styles.sectionTitle}>Last Payment</Text>
                <View style={styles.lastPaymentRow}>
                  <Text style={styles.lastPaymentAmount}>
                    {formatCurrency(ownerData.last_payment_amount || 0)}
                  </Text>
                  <Text style={styles.lastPaymentDate}>
                    {ownerData.last_payment_date}
                  </Text>
                </View>
              </Card>
            )}

            {ownerData.recent_charges.length > 0 && (
              <Card style={styles.section}>
                <Text style={styles.sectionTitle}>Recent Charges</Text>
                {ownerData.recent_charges.map((charge, index) => (
                  <View key={index} style={styles.chargeItem}>
                    <View style={styles.chargeInfo}>
                      <Text style={styles.chargeCategory}>{charge.category}</Text>
                      <Text style={styles.chargePeriod}>{charge.period}</Text>
                    </View>
                    <View style={styles.chargeRight}>
                      <Text style={styles.chargeAmount}>
                        {formatCurrency(charge.amount)}
                      </Text>
                      <View style={[
                        styles.chargeStatus,
                        { backgroundColor: charge.status === 'paid' ? '#dcfce7' : '#fef3c7' }
                      ]}>
                        <Text style={[
                          styles.chargeStatusText,
                          { color: charge.status === 'paid' ? '#16a34a' : '#d97706' }
                        ]}>
                          {charge.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>
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
});
