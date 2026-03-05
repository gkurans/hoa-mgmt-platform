import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getAnnualSetups,
  createAnnualSetup,
  approveSetup,
  postCharges,
  getUnits,
  getCategories,
  createPayment,
} from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
import Card from '../../src/components/Card';
import Button from '../../src/components/Button';
import Input from '../../src/components/Input';
import LoadingSpinner from '../../src/components/LoadingSpinner';

interface AnnualSetup {
  id: string;
  year: number;
  water_total: number;
  electricity_total: number;
  condo_annual_share: number;
  shop_annual_share: number;
  status: string;
  notes: string;
  entered_by: string;
}

interface Unit {
  id: string;
  unit_id: string;
  display_name: string;
  current_balance: number;
}

export default function BillingScreen() {
  const { isAdmin } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [setups, setSetups] = useState<AnnualSetup[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [activeTab, setActiveTab] = useState<'allocation' | 'payments'>('allocation');

  const [newSetup, setNewSetup] = useState({
    year: new Date().getFullYear(),
    water_total: '',
    electricity_total: '',
    notes: '',
  });

  const [newPayment, setNewPayment] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    method: 'upi',
    reference: '',
    notes: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const [setupsRes, unitsRes] = await Promise.all([
        getAnnualSetups(),
        getUnits(),
      ]);
      setSetups(setupsRes.data);
      setUnits(unitsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleCreateSetup = async () => {
    if (!newSetup.water_total || !newSetup.electricity_total) {
      Alert.alert('Error', 'Please enter Water and Electricity totals');
      return;
    }
    try {
      await createAnnualSetup({
        year: newSetup.year,
        water_total: parseFloat(newSetup.water_total),
        electricity_total: parseFloat(newSetup.electricity_total),
        notes: newSetup.notes,
      });
      Alert.alert('Success', 'Annual setup created');
      setShowSetupModal(false);
      setNewSetup({ year: new Date().getFullYear(), water_total: '', electricity_total: '', notes: '' });
      fetchData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create setup');
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await approveSetup(id);
      Alert.alert('Success', 'Setup approved');
      fetchData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to approve');
    }
  };

  const handlePost = async (id: string) => {
    Alert.alert(
      'Post Charges',
      'This will create charges for all units. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Post',
          onPress: async () => {
            try {
              const result = await postCharges(id, false);
              Alert.alert('Success', result.data.message);
              fetchData();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to post');
            }
          },
        },
      ]
    );
  };

  const handleRecordPayment = async () => {
    if (!selectedUnit || !newPayment.amount) {
      Alert.alert('Error', 'Please enter payment amount');
      return;
    }
    try {
      await createPayment({
        unit_id: selectedUnit.id,
        amount: parseFloat(newPayment.amount),
        payment_date: newPayment.payment_date,
        method: newPayment.method,
        reference: newPayment.reference,
        notes: newPayment.notes,
      });
      Alert.alert('Success', 'Payment recorded');
      setShowPaymentModal(false);
      setNewPayment({ amount: '', payment_date: new Date().toISOString().split('T')[0], method: 'upi', reference: '', notes: '' });
      fetchData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to record payment');
    }
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  };

  if (loading) {
    return <LoadingSpinner message="Loading billing..." />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Billing</Text>
      </View>

      {isAdmin() && (
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'allocation' && styles.tabActive]}
            onPress={() => setActiveTab('allocation')}
          >
            <Text style={[styles.tabText, activeTab === 'allocation' && styles.tabTextActive]}>
              Annual Allocation
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'payments' && styles.tabActive]}
            onPress={() => setActiveTab('payments')}
          >
            <Text style={[styles.tabText, activeTab === 'payments' && styles.tabTextActive]}>
              Record Payment
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {activeTab === 'allocation' && isAdmin() ? (
          <View>
            <Button
              title="New Annual Setup"
              onPress={() => setShowSetupModal(true)}
              style={styles.newButton}
            />

            <View style={styles.formulaCard}>
              <Text style={styles.formulaTitle}>Kerala HOA Allocation Formula</Text>
              <View style={styles.formulaBox}>
                <Text style={styles.formulaLabel}>Condo Share =</Text>
                <Text style={styles.formulaText}>W/5 + 0.40E/5 + 0.60E/8</Text>
              </View>
              <View style={styles.formulaBox}>
                <Text style={styles.formulaLabel}>Shop Share =</Text>
                <Text style={styles.formulaText}>0.60E/8</Text>
              </View>
              <Text style={styles.formulaNote}>
                W = Water Total, E = Electricity Total
              </Text>
            </View>

            <Text style={styles.sectionTitle}>Annual Setups</Text>
            {setups.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Ionicons name="document-text" size={48} color="#94a3b8" />
                <Text style={styles.emptyText}>No annual setups yet</Text>
              </Card>
            ) : (
              setups.map(setup => (
                <Card key={setup.id} style={styles.setupCard}>
                  <View style={styles.setupHeader}>
                    <Text style={styles.setupYear}>{setup.year}</Text>
                    <View style={[
                      styles.statusBadge,
                      {
                        backgroundColor:
                          setup.status === 'posted' ? '#dcfce7' :
                          setup.status === 'approved' ? '#dbeafe' : '#fef3c7'
                      }
                    ]}>
                      <Text style={[
                        styles.statusText,
                        {
                          color:
                            setup.status === 'posted' ? '#16a34a' :
                            setup.status === 'approved' ? '#2563eb' : '#d97706'
                        }
                      ]}>
                        {setup.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.setupDetails}>
                    <View style={styles.setupRow}>
                      <Text style={styles.setupLabel}>Water Total (W):</Text>
                      <Text style={styles.setupValue}>{formatCurrency(setup.water_total)}</Text>
                    </View>
                    <View style={styles.setupRow}>
                      <Text style={styles.setupLabel}>Electricity Total (E):</Text>
                      <Text style={styles.setupValue}>{formatCurrency(setup.electricity_total)}</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.setupRow}>
                      <Text style={styles.shareLabel}>Condo Annual Share:</Text>
                      <Text style={styles.shareValue}>{formatCurrency(setup.condo_annual_share)}</Text>
                    </View>
                    <View style={styles.setupRow}>
                      <Text style={styles.shareLabel}>Shop Annual Share:</Text>
                      <Text style={styles.shareValue}>{formatCurrency(setup.shop_annual_share)}</Text>
                    </View>
                  </View>
                  {setup.status === 'draft' && (
                    <View style={styles.setupActions}>
                      <Button
                        title="Approve"
                        onPress={() => handleApprove(setup.id)}
                        variant="secondary"
                        size="small"
                        style={styles.actionButton}
                      />
                    </View>
                  )}
                  {setup.status === 'approved' && (
                    <View style={styles.setupActions}>
                      <Button
                        title="Post Charges"
                        onPress={() => handlePost(setup.id)}
                        variant="success"
                        size="small"
                        style={styles.actionButton}
                      />
                    </View>
                  )}
                </Card>
              ))
            )}
          </View>
        ) : (
          <View>
            <Text style={styles.sectionTitle}>Select Unit to Record Payment</Text>
            {units.map(unit => (
              <TouchableOpacity
                key={unit.id}
                onPress={() => {
                  setSelectedUnit(unit);
                  setShowPaymentModal(true);
                }}
              >
                <Card style={styles.unitPaymentCard}>
                  <View style={styles.unitPaymentInfo}>
                    <Text style={styles.unitPaymentId}>{unit.unit_id}</Text>
                    <Text style={styles.unitPaymentName}>{unit.display_name}</Text>
                  </View>
                  <View style={styles.unitPaymentRight}>
                    <Text style={[
                      styles.unitPaymentBalance,
                      { color: unit.current_balance > 0 ? '#dc2626' : '#16a34a' }
                    ]}>
                      {formatCurrency(unit.current_balance)}
                    </Text>
                    <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Create Setup Modal */}
      <Modal
        visible={showSetupModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSetupModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Annual Setup</Text>
              <TouchableOpacity onPress={() => setShowSetupModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Input
              label="Year"
              value={newSetup.year.toString()}
              onChangeText={(text) => setNewSetup({ ...newSetup, year: parseInt(text) || new Date().getFullYear() })}
              keyboardType="number-pad"
            />
            <Input
              label="Prior Year Water Total (W)"
              value={newSetup.water_total}
              onChangeText={(text) => setNewSetup({ ...newSetup, water_total: text })}
              placeholder="e.g., 50000"
              keyboardType="decimal-pad"
            />
            <Input
              label="Prior Year Electricity Total (E)"
              value={newSetup.electricity_total}
              onChangeText={(text) => setNewSetup({ ...newSetup, electricity_total: text })}
              placeholder="e.g., 100000"
              keyboardType="decimal-pad"
            />
            <Input
              label="Notes (Optional)"
              value={newSetup.notes}
              onChangeText={(text) => setNewSetup({ ...newSetup, notes: text })}
              placeholder="Any notes..."
              multiline
            />
            <Button title="Calculate & Create" onPress={handleCreateSetup} />
          </View>
        </View>
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        visible={showPaymentModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Record Payment</Text>
              <TouchableOpacity onPress={() => setShowPaymentModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            {selectedUnit && (
              <View style={styles.selectedUnitInfo}>
                <Text style={styles.selectedUnitName}>{selectedUnit.display_name}</Text>
                <Text style={styles.selectedUnitBalance}>
                  Balance: {formatCurrency(selectedUnit.current_balance)}
                </Text>
              </View>
            )}
            <Input
              label="Amount (₹)"
              value={newPayment.amount}
              onChangeText={(text) => setNewPayment({ ...newPayment, amount: text })}
              placeholder="Enter amount"
              keyboardType="decimal-pad"
            />
            <Input
              label="Payment Date"
              value={newPayment.payment_date}
              onChangeText={(text) => setNewPayment({ ...newPayment, payment_date: text })}
              placeholder="YYYY-MM-DD"
            />
            <Text style={styles.methodLabel}>Payment Method</Text>
            <View style={styles.methodButtons}>
              {['upi', 'bank_transfer', 'cash', 'cheque'].map(method => (
                <TouchableOpacity
                  key={method}
                  style={[
                    styles.methodButton,
                    newPayment.method === method && styles.methodButtonActive
                  ]}
                  onPress={() => setNewPayment({ ...newPayment, method })}
                >
                  <Text style={[
                    styles.methodButtonText,
                    newPayment.method === method && styles.methodButtonTextActive
                  ]}>
                    {method.replace('_', ' ').toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Input
              label="Reference/Transaction ID"
              value={newPayment.reference}
              onChangeText={(text) => setNewPayment({ ...newPayment, reference: text })}
              placeholder="Transaction reference"
            />
            <Button title="Record Payment" onPress={handleRecordPayment} />
          </View>
        </View>
      </Modal>
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
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    marginHorizontal: 4,
    backgroundColor: '#f1f5f9',
  },
  tabActive: {
    backgroundColor: '#2563eb',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#fff',
  },
  scrollContent: {
    padding: 16,
  },
  newButton: {
    marginBottom: 16,
  },
  formulaCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  formulaTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e40af',
    marginBottom: 12,
  },
  formulaBox: {
    marginBottom: 8,
  },
  formulaLabel: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '600',
  },
  formulaText: {
    fontSize: 16,
    color: '#1e3a8a',
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  formulaNote: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 8,
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 16,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    color: '#64748b',
    marginTop: 16,
  },
  setupCard: {
    marginBottom: 16,
  },
  setupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  setupYear: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
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
  setupDetails: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
  },
  setupRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  setupLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  setupValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 12,
  },
  shareLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  shareValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2563eb',
  },
  setupActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    gap: 8,
  },
  actionButton: {
    minWidth: 120,
  },
  unitPaymentCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  unitPaymentInfo: {
    flex: 1,
  },
  unitPaymentId: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  unitPaymentName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 2,
  },
  unitPaymentRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unitPaymentBalance: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  selectedUnitInfo: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  selectedUnitName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  selectedUnitBalance: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  methodLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  methodButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  methodButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  methodButtonActive: {
    backgroundColor: '#2563eb',
  },
  methodButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  methodButtonTextActive: {
    color: '#fff',
  },
});
