import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getTrueUpReport, carryForward } from '../../src/services/api';
import Card from '../../src/components/Card';
import Button from '../../src/components/Button';
import LoadingSpinner from '../../src/components/LoadingSpinner';

interface TrueUpItem {
  unit_id: string;
  unit_display: string;
  unit_type: string;
  opening_balance: number;
  total_assessed: number;
  total_paid: number;
  net_balance: number;
  status: string;
}

interface TrueUpReport {
  year: number;
  generated_at: string;
  items: TrueUpItem[];
  total_outstanding: number;
  total_credits: number;
}

export default function ReportsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [report, setReport] = useState<TrueUpReport | null>(null);

  const years = [2024, 2025, 2026, 2027];

  const fetchReport = useCallback(async () => {
    try {
      const response = await getTrueUpReport(selectedYear);
      setReport(response.data);
    } catch (error) {
      console.error('Error fetching report:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedYear]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchReport();
  };

  const handleCarryForward = () => {
    Alert.alert(
      'Carry Forward Balances',
      `This will carry forward all balances from ${selectedYear} to ${selectedYear + 1}. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Carry Forward',
          onPress: async () => {
            try {
              await carryForward(selectedYear);
              Alert.alert('Success', 'Balances carried forward successfully');
              fetchReport();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to carry forward');
            }
          },
        },
      ]
    );
  };

  const formatCurrency = (amount: number) => {
    return `₹${Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'settled': return { bg: '#dcfce7', text: '#16a34a' };
      case 'credit': return { bg: '#dbeafe', text: '#2563eb' };
      case 'due': return { bg: '#fef2f2', text: '#dc2626' };
      default: return { bg: '#f1f5f9', text: '#64748b' };
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading report..." />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Year-End True-Up Report</Text>
      </View>

      <View style={styles.yearSelector}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {years.map(year => (
            <TouchableOpacity
              key={year}
              style={[
                styles.yearButton,
                selectedYear === year && styles.yearButtonActive
              ]}
              onPress={() => {
                setSelectedYear(year);
                setLoading(true);
              }}
            >
              <Text style={[
                styles.yearButtonText,
                selectedYear === year && styles.yearButtonTextActive
              ]}>
                {year}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {report && (
          <>
            <View style={styles.summaryCards}>
              <Card style={[styles.summaryCard, { backgroundColor: '#fef2f2' }]}>
                <Ionicons name="trending-down" size={28} color="#dc2626" />
                <Text style={styles.summaryLabel}>Total Outstanding</Text>
                <Text style={[styles.summaryValue, { color: '#dc2626' }]}>
                  {formatCurrency(report.total_outstanding)}
                </Text>
              </Card>
              <Card style={[styles.summaryCard, { backgroundColor: '#dbeafe' }]}>
                <Ionicons name="trending-up" size={28} color="#2563eb" />
                <Text style={styles.summaryLabel}>Total Credits</Text>
                <Text style={[styles.summaryValue, { color: '#2563eb' }]}>
                  {formatCurrency(report.total_credits)}
                </Text>
              </Card>
            </View>

            <Button
              title="Carry Forward Balances"
              onPress={handleCarryForward}
              variant="secondary"
              style={styles.carryForwardButton}
            />

            <Text style={styles.sectionTitle}>Unit Details</Text>

            {report.items.map(item => {
              const statusColors = getStatusColor(item.status);
              return (
                <Card key={item.unit_id} style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemUnitId}>{item.unit_id}</Text>
                      <Text style={styles.itemUnitName}>{item.unit_display}</Text>
                      <View style={[
                        styles.typeBadge,
                        { backgroundColor: item.unit_type === 'condo' ? '#dbeafe' : '#dcfce7' }
                      ]}>
                        <Text style={[
                          styles.typeText,
                          { color: item.unit_type === 'condo' ? '#2563eb' : '#16a34a' }
                        ]}>
                          {item.unit_type.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusColors.bg }]}>
                      <Text style={[styles.statusText, { color: statusColors.text }]}>
                        {item.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.itemDetails}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Opening Balance</Text>
                      <Text style={styles.detailValue}>{formatCurrency(item.opening_balance)}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Total Assessed</Text>
                      <Text style={[styles.detailValue, { color: '#dc2626' }]}>
                        +{formatCurrency(item.total_assessed)}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Total Paid</Text>
                      <Text style={[styles.detailValue, { color: '#16a34a' }]}>
                        -{formatCurrency(item.total_paid)}
                      </Text>
                    </View>
                    <View style={[styles.detailRow, styles.netRow]}>
                      <Text style={styles.netLabel}>Net Balance</Text>
                      <Text style={[
                        styles.netValue,
                        { color: item.net_balance > 0 ? '#dc2626' : item.net_balance < 0 ? '#2563eb' : '#16a34a' }
                      ]}>
                        {item.net_balance >= 0 ? '' : '-'}{formatCurrency(item.net_balance)}
                      </Text>
                    </View>
                  </View>
                </Card>
              );
            })}
          </>
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
  yearSelector: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  yearButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    marginRight: 12,
  },
  yearButtonActive: {
    backgroundColor: '#2563eb',
  },
  yearButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  yearButtonTextActive: {
    color: '#fff',
  },
  scrollContent: {
    padding: 16,
  },
  summaryCards: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 20,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 8,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  carryForwardButton: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 16,
  },
  itemCard: {
    marginBottom: 16,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  itemInfo: {
    flex: 1,
  },
  itemUnitId: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  itemUnitName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 2,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  typeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  itemDetails: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  netRow: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    marginTop: 8,
    paddingTop: 12,
  },
  netLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  netValue: {
    fontSize: 18,
    fontWeight: '700',
  },
});
