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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getUnits, getOwners, assignOwner, createUnit, updateUnit, createOwner, updateOwner, removeOwnerFromUnit } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
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
  owner_ids: string[];
  owner_names: string[];
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
  const { user, isAdmin } = useAuthStore();
  const isAdminUser = isAdmin;
  const [units, setUnits] = useState<Unit[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showOwnerModal, setShowOwnerModal] = useState(false);
  const [showEditOwnerModal, setShowEditOwnerModal] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
  const [activeTab, setActiveTab] = useState<'units' | 'owners'>('units');
  
  // Check if user owns a specific unit
  const userOwnsUnit = (unit: Unit) => {
    if (!user) return false;
    return user.unit_ids?.includes(unit.id);
  };

  // Check if current user is the owner being viewed
  const isCurrentUserOwner = (owner: Owner) => {
    if (!user) return false;
    return owner.email === user.email;
  };
  
  const [newUnit, setNewUnit] = useState({
    unit_id: '',
    unit_type: 'condo',
    display_name: '',
  });

  const [editUnit, setEditUnit] = useState({
    unit_id: '',
    display_name: '',
    status: 'owned',
  });

  const [newOwner, setNewOwner] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
  });

  const [editOwner, setEditOwner] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
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

  const handleAssignOwner = async (ownerId: string, role: string = 'primary') => {
    if (!selectedUnit) return;
    try {
      await assignOwner(selectedUnit.id, ownerId, role);
      Alert.alert('Success', 'Owner assigned successfully');
      setShowAssignModal(false);
      fetchData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to assign owner');
    }
  };

  const handleRemoveOwner = async (unitId: string, ownerId: string, ownerName: string) => {
    Alert.alert(
      'Remove Owner',
      `Are you sure you want to remove ${ownerName} from this unit?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeOwnerFromUnit(unitId, ownerId);
              Alert.alert('Success', 'Owner removed from unit');
              fetchData();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to remove owner');
            }
          },
        },
      ]
    );
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

  const handleEditUnit = async () => {
    if (!selectedUnit) return;
    try {
      await updateUnit(selectedUnit.id, {
        unit_id: editUnit.unit_id,
        display_name: editUnit.display_name,
        status: editUnit.status,
      });
      Alert.alert('Success', 'Unit updated successfully');
      setShowEditModal(false);
      fetchData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update unit');
    }
  };

  const handleCreateOwner = async () => {
    if (!newOwner.name || !newOwner.email) {
      Alert.alert('Error', 'Please enter name and email');
      return;
    }
    try {
      await createOwner(newOwner);
      Alert.alert('Success', `Owner created successfully!\nDefault password: ${newOwner.password || 'Welcome123'}`);
      setShowOwnerModal(false);
      setNewOwner({ name: '', email: '', phone: '', password: '' });
      fetchData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create owner');
    }
  };

  const handleEditOwner = async () => {
    if (!selectedOwner) return;
    if (!editOwner.name || !editOwner.email) {
      Alert.alert('Error', 'Name and email are required');
      return;
    }
    try {
      const updateData: any = {
        name: editOwner.name,
        email: editOwner.email,
        phone: editOwner.phone || undefined,
      };
      await updateOwner(selectedOwner.id, updateData);
      Alert.alert('Success', 'Owner updated successfully');
      setShowEditOwnerModal(false);
      setSelectedOwner(null);
      fetchData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update owner');
    }
  };

  const openEditOwnerModal = (owner: Owner) => {
    setSelectedOwner(owner);
    setEditOwner({
      name: owner.name,
      email: owner.email,
      phone: owner.phone || '',
      password: '',
    });
    setShowEditOwnerModal(true);
  };

  const openAddOwnerModal = () => {
    // Reset the form to blank values
    setNewOwner({ name: '', email: '', phone: '', password: '' });
    setShowOwnerModal(true);
  };

  const openEditModal = (unit: Unit) => {
    setSelectedUnit(unit);
    setEditUnit({
      unit_id: unit.unit_id,
      display_name: unit.display_name,
      status: unit.status,
    });
    setShowEditModal(true);
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  };

  if (loading) {
    return <LoadingSpinner message="Loading..." />;
  }

  const condos = units.filter(u => u.unit_type === 'condo');
  const shops = units.filter(u => u.unit_type === 'shop');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Management</Text>
        {isAdminUser && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => activeTab === 'units' ? setShowCreateModal(true) : openAddOwnerModal()}
          >
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'units' && styles.tabActive]}
          onPress={() => setActiveTab('units')}
        >
          <Ionicons name="business" size={20} color={activeTab === 'units' ? '#fff' : '#64748b'} />
          <Text style={[styles.tabText, activeTab === 'units' && styles.tabTextActive]}>Units</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'owners' && styles.tabActive]}
          onPress={() => setActiveTab('owners')}
        >
          <Ionicons name="people" size={20} color={activeTab === 'owners' ? '#fff' : '#64748b'} />
          <Text style={[styles.tabText, activeTab === 'owners' && styles.tabTextActive]}>Owners</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {activeTab === 'units' ? (
          <>
            {/* Condo Units */}
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
                      {/* Edit Owner Button - only show if owner is assigned and user is admin */}
                      {isAdminUser && unit.primary_owner_id && (
                        <TouchableOpacity
                          style={styles.editOwnerSmallButton}
                          onPress={() => {
                            const owner = owners.find(o => o.id === unit.primary_owner_id);
                            if (owner) openEditOwnerModal(owner);
                          }}
                        >
                          <Ionicons name="create-outline" size={14} color="#2563eb" />
                        </TouchableOpacity>
                      )}
                    </View>
                    {/* Show edit/assign buttons only for admins OR for owners of this unit */}
                    {(isAdminUser || userOwnsUnit(unit)) && (
                      <View style={styles.actionButtons}>
                        <TouchableOpacity
                          style={styles.editButton}
                          onPress={() => openEditModal(unit)}
                        >
                          <Ionicons name="pencil" size={16} color="#2563eb" />
                        </TouchableOpacity>
                        {isAdminUser && (
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
                        )}
                      </View>
                    )}
                  </View>
                </Card>
              ))}
            </View>

            {/* Shop Units */}
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
                      {/* Edit Owner Button - only show if owner is assigned and user is admin */}
                      {isAdminUser && unit.primary_owner_id && (
                        <TouchableOpacity
                          style={styles.editOwnerSmallButton}
                          onPress={() => {
                            const owner = owners.find(o => o.id === unit.primary_owner_id);
                            if (owner) openEditOwnerModal(owner);
                          }}
                        >
                          <Ionicons name="create-outline" size={14} color="#2563eb" />
                        </TouchableOpacity>
                      )}
                    </View>
                    {/* Show edit/assign buttons only for admins OR for owners of this unit */}
                    {(isAdminUser || userOwnsUnit(unit)) && (
                      <View style={styles.actionButtons}>
                        <TouchableOpacity
                          style={styles.editButton}
                          onPress={() => openEditModal(unit)}
                        >
                          <Ionicons name="pencil" size={16} color="#2563eb" />
                        </TouchableOpacity>
                        {isAdminUser && (
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
                        )}
                      </View>
                    )}
                  </View>
                </Card>
              ))}
            </View>
          </>
        ) : (
          /* Owners List */
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="people" size={24} color="#2563eb" />
              <Text style={styles.sectionTitle}>All Owners ({owners.length})</Text>
            </View>
            {owners.map(owner => (
              <Card key={owner.id} style={styles.ownerCard}>
                <View style={styles.ownerCardHeader}>
                  <View style={styles.ownerAvatar}>
                    <Ionicons name="person" size={24} color="#2563eb" />
                  </View>
                  <View style={styles.ownerInfo}>
                    <Text style={styles.ownerCardName}>{owner.name}</Text>
                    <Text style={styles.ownerEmail}>{owner.email}</Text>
                    {owner.phone && <Text style={styles.ownerPhone}>{owner.phone}</Text>}
                  </View>
                  {isAdminUser && owner.role !== 'admin' && (
                    <TouchableOpacity
                      style={styles.editOwnerButton}
                      onPress={() => openEditOwnerModal(owner)}
                    >
                      <Ionicons name="pencil" size={18} color="#2563eb" />
                    </TouchableOpacity>
                  )}
                  <View style={[
                    styles.roleBadge,
                    { backgroundColor: owner.role === 'admin' ? '#dbeafe' : '#f0fdf4' }
                  ]}>
                    <Text style={[
                      styles.roleText,
                      { color: owner.role === 'admin' ? '#2563eb' : '#16a34a' }
                    ]}>
                      {owner.role.toUpperCase()}
                    </Text>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )}
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
              {owners.filter(o => o.role === 'owner').map(owner => (
                <TouchableOpacity
                  key={owner.id}
                  style={styles.ownerItem}
                  onPress={() => handleAssignOwner(owner.id)}
                >
                  <View style={styles.ownerItemAvatar}>
                    <Ionicons name="person" size={24} color="#2563eb" />
                  </View>
                  <View style={styles.ownerItemDetails}>
                    <Text style={styles.ownerItemName}>{owner.name}</Text>
                    <Text style={styles.ownerItemEmail}>{owner.email}</Text>
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
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
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
              placeholder="e.g., 101 or Shop-A"
            />
            <Input
              label="Display Name"
              value={newUnit.display_name}
              onChangeText={(text) => setNewUnit({ ...newUnit, display_name: text })}
              placeholder="e.g., Flat 101 or Ground Floor Shop"
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
                  Condo/Flat
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
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Unit Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditModal(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Unit</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Input
              label="Unit ID"
              value={editUnit.unit_id}
              onChangeText={(text) => setEditUnit({ ...editUnit, unit_id: text })}
              placeholder="e.g., 101 or Shop-A"
            />
            <Input
              label="Display Name"
              value={editUnit.display_name}
              onChangeText={(text) => setEditUnit({ ...editUnit, display_name: text })}
              placeholder="e.g., Flat 101 - Mr. Kumar"
            />
            <Text style={styles.typeLabel}>Status</Text>
            <View style={styles.statusButtons}>
              {['owned', 'rented', 'vacant'].map(status => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.statusButton,
                    editUnit.status === status && styles.statusButtonActive
                  ]}
                  onPress={() => setEditUnit({ ...editUnit, status })}
                >
                  <Text style={[
                    styles.statusButtonText,
                    editUnit.status === status && styles.statusButtonTextActive
                  ]}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Button
              title="Save Changes"
              onPress={handleEditUnit}
              style={styles.createButton}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Create Owner Modal */}
      <Modal
        visible={showOwnerModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowOwnerModal(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Owner</Text>
              <TouchableOpacity onPress={() => setShowOwnerModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Input
              label="Full Name *"
              value={newOwner.name}
              onChangeText={(text) => setNewOwner({ ...newOwner, name: text })}
              placeholder="e.g., John Smith"
              autoComplete="off"
            />
            <Input
              label="Email *"
              value={newOwner.email}
              onChangeText={(text) => setNewOwner({ ...newOwner, email: text })}
              placeholder="e.g., john@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="off"
            />
            <Input
              label="Phone Number"
              value={newOwner.phone}
              onChangeText={(text) => setNewOwner({ ...newOwner, phone: text })}
              placeholder="e.g., +91 9876543210"
              keyboardType="phone-pad"
              autoComplete="off"
            />
            <Input
              label="Password (default: Welcome123)"
              value={newOwner.password}
              onChangeText={(text) => setNewOwner({ ...newOwner, password: text })}
              placeholder="Leave empty for default"
              secureTextEntry
              autoComplete="new-password"
            />
            <Button
              title="Create Owner"
              onPress={handleCreateOwner}
              style={styles.createButton}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Owner Modal */}
      <Modal
        visible={showEditOwnerModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditOwnerModal(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Owner</Text>
              <TouchableOpacity onPress={() => setShowEditOwnerModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Input
              label="Full Name *"
              value={editOwner.name}
              onChangeText={(text) => setEditOwner({ ...editOwner, name: text })}
              placeholder="e.g., John Smith"
            />
            <Input
              label="Email *"
              value={editOwner.email}
              onChangeText={(text) => setEditOwner({ ...editOwner, email: text })}
              placeholder="e.g., john@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Input
              label="Phone Number"
              value={editOwner.phone}
              onChangeText={(text) => setEditOwner({ ...editOwner, phone: text })}
              placeholder="e.g., +91 9876543210"
              keyboardType="phone-pad"
            />
            <Button
              title="Save Changes"
              onPress={handleEditOwner}
              style={styles.createButton}
            />
          </View>
        </KeyboardAvoidingView>
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
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
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
    flex: 1,
  },
  ownerName: {
    fontSize: 14,
    color: '#64748b',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
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
  ownerCard: {
    marginBottom: 12,
  },
  ownerCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ownerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  ownerCardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  ownerEmail: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  ownerPhone: {
    fontSize: 14,
    color: '#64748b',
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roleText: {
    fontSize: 11,
    fontWeight: '700',
  },
  editOwnerButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  editOwnerSmallButton: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
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
    maxHeight: '85%',
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
  ownerItemAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerItemDetails: {
    flex: 1,
    marginLeft: 12,
  },
  ownerItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  ownerItemEmail: {
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
  statusButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  statusButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  statusButtonActive: {
    backgroundColor: '#2563eb',
  },
  statusButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  statusButtonTextActive: {
    color: '#fff',
  },
  createButton: {
    marginTop: 8,
  },
});
