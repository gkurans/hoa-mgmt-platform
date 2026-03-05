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
import { getUnits, getOwners, assignOwner, createUnit } from '../../src/services/api';
import Card from '../../src/components/Card';
import Button from '../../src/components/Button';
import Input from '../../src/components/Input';
import LoadingSpinner from '../../src/components/LoadingSpinner';

interface Unit {
  id: string;
  unit_id: string;
  unit_type: string;
  display_name: string;
  status: string;
  primary_owner_id: string | null;
  primary_owner_name: string | null;
  opening_balance: number;
  current_balance: number;
}

interface Owner {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
}

export default function UnitsScreen() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUnit, setNewUnit] = useState({
    unit_id: '',
    unit_type: 'condo',
    display_name: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const [unitsRes, ownersRes] = await Promise.all([getUnits(), getOwners()]);
      setUnits(unitsRes.data);
      setOwners(ownersRes.data);
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

  const handleAssignOwner = async (ownerId: string) => {
    if (!selectedUnit) return;
    try {
      await assignOwner(selectedUnit.id, ownerId);
      Alert.alert('Success', 'Owner assigned successfully');
      setShowAssignModal(false);
      fetchData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to assign owner');
    }
  };

  const handleCreateUnit = async () => {
    if (!newUnit.unit_id || !newUnit.display_name) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    try {
      await createUnit(newUnit);
      Alert.alert('Success', 'Unit created successfully');
      setShowCreateModal(false);
      setNewUnit({ unit_id: '', unit_type: 'condo', display_name: '' });
      fetchData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create unit');
    }
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  };

  if (loading) {
    return <LoadingSpinner message="Loading units..." />;
  }

  const condos = units.filter(u => u.unit_type === 'condo');
  const shops = units.filter(u => u.unit_type === 'shop');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Units Management</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowCreateModal(true)}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="home" size={24} color="#2563eb" />
            <Text style={styles.sectionTitle}>Condo Units ({condos.length})</Text>
          </View>
          {condos.map(unit => (
            <Card key={unit.id} style={styles.unitCard}>
              <View style={styles.unitHeader}>
                <View style={styles.unitInfo}>
                  <Text style={styles.unitId}>{unit.unit_id}</Text>
                  <Text style={styles.unitName}>{unit.display_name}</Text>
                </View>
                <View style={[
                  styles.balanceBadge,
                  { backgroundColor: unit.current_balance > 0 ? '#fef2f2' : '#f0fdf4' }
                ]}>
                  <Text style={[
                    styles.balanceText,
                    { color: unit.current_balance > 0 ? '#dc2626' : '#16a34a' }
                  ]}>
                    {formatCurrency(unit.current_balance)}
                  </Text>
                </View>
              </View>
              <View style={styles.unitDetails}>
                <View style={styles.ownerRow}>
                  <Ionicons name="person" size={16} color="#64748b" />
                  <Text style={styles.ownerName}>
                    {unit.primary_owner_name || 'Not assigned'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.assignButton}
                  onPress={() => {
                    setSelectedUnit(unit);
                    setShowAssignModal(true);
                  }}
                >
                  <Text style={styles.assignButtonText}>
                    {unit.primary_owner_name ? 'Change' : 'Assign'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Card>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="storefront" size={24} color="#059669" />
            <Text style={styles.sectionTitle}>Shop Units ({shops.length})</Text>
          </View>
          {shops.map(unit => (
            <Card key={unit.id} style={styles.unitCard}>
              <View style={styles.unitHeader}>
                <View style={styles.unitInfo}>
                  <Text style={styles.unitId}>{unit.unit_id}</Text>
                  <Text style={styles.unitName}>{unit.display_name}</Text>
                </View>
                <View style={[
                  styles.balanceBadge,
                  { backgroundColor: unit.current_balance > 0 ? '#fef2f2' : '#f0fdf4' }
                ]}>
                  <Text style={[
                    styles.balanceText,
                    { color: unit.current_balance > 0 ? '#dc2626' : '#16a34a' }
                  ]}>
                    {formatCurrency(unit.current_balance)}
                  </Text>
                </View>
              </View>
              <View style={styles.unitDetails}>
                <View style={styles.ownerRow}>
                  <Ionicons name="person" size={16} color="#64748b" />
                  <Text style={styles.ownerName}>
                    {unit.primary_owner_name || 'Not assigned'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.assignButton}
                  onPress={() => {
                    setSelectedUnit(unit);
                    setShowAssignModal(true);
                  }}
                >
                  <Text style={styles.assignButtonText}>
                    {unit.primary_owner_name ? 'Change' : 'Assign'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Card>
          ))}
        </View>
      </ScrollView>

      {/* Assign Owner Modal */}
      <Modal
        visible={showAssignModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAssignModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Assign Owner</Text>
              <TouchableOpacity onPress={() => setShowAssignModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Select an owner for {selectedUnit?.display_name}
            </Text>
            <ScrollView style={styles.ownerList}>
              {owners.map(owner => (
                <TouchableOpacity
                  key={owner.id}
                  style={styles.ownerItem}
                  onPress={() => handleAssignOwner(owner.id)}
                >
                  <View style={styles.ownerAvatar}>
                    <Ionicons name="person" size={24} color="#2563eb" />
                  </View>
                  <View style={styles.ownerDetails}>
                    <Text style={styles.ownerItemName}>{owner.name}</Text>
                    <Text style={styles.ownerEmail}>{owner.email}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Create Unit Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Unit</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Input
              label="Unit ID"
              value={newUnit.unit_id}
              onChangeText={(text) => setNewUnit({ ...newUnit, unit_id: text })}
              placeholder="e.g., C6 or S4"
            />
            <Input
              label="Display Name"
              value={newUnit.display_name}
              onChangeText={(text) => setNewUnit({ ...newUnit, display_name: text })}
              placeholder="e.g., Condo Unit 6"
            />
            <Text style={styles.typeLabel}>Unit Type</Text>
            <View style={styles.typeButtons}>
              <TouchableOpacity
                style={[
                  styles.typeButton,
                  newUnit.unit_type === 'condo' && styles.typeButtonActive
                ]}
                onPress={() => setNewUnit({ ...newUnit, unit_type: 'condo' })}
              >
                <Ionicons
                  name="home"
                  size={20}
                  color={newUnit.unit_type === 'condo' ? '#fff' : '#64748b'}
                />
                <Text style={[
                  styles.typeButtonText,
                  newUnit.unit_type === 'condo' && styles.typeButtonTextActive
                ]}>
                  Condo
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.typeButton,
                  newUnit.unit_type === 'shop' && styles.typeButtonActive
                ]}
                onPress={() => setNewUnit({ ...newUnit, unit_type: 'shop' })}
              >
                <Ionicons
                  name="storefront"
                  size={20}
                  color={newUnit.unit_type === 'shop' ? '#fff' : '#64748b'}
                />
                <Text style={[
                  styles.typeButtonText,
                  newUnit.unit_type === 'shop' && styles.typeButtonTextActive
                ]}>
                  Shop
                </Text>
              </TouchableOpacity>
            </View>
            <Button
              title="Create Unit"
              onPress={handleCreateUnit}
              style={styles.createButton}
            />
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  unitCard: {
    marginBottom: 12,
  },
  unitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  unitInfo: {
    flex: 1,
  },
  unitId: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  unitName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 4,
  },
  balanceBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  balanceText: {
    fontSize: 14,
    fontWeight: '600',
  },
  unitDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ownerName: {
    fontSize: 14,
    color: '#64748b',
  },
  assignButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
  },
  assignButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
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
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 16,
  },
  ownerList: {
    maxHeight: 300,
  },
  ownerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    marginBottom: 8,
  },
  ownerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerDetails: {
    flex: 1,
    marginLeft: 12,
  },
  ownerItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  ownerEmail: {
    fontSize: 14,
    color: '#64748b',
  },
  typeLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  typeButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  typeButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  typeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  typeButtonTextActive: {
    color: '#fff',
  },
  createButton: {
    marginTop: 8,
  },
});
