import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getAuditLogs, getUnits } from '../../src/services/api';
import Card from '../../src/components/Card';
import LoadingSpinner from '../../src/components/LoadingSpinner';

interface AuditLog {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  old_value: any;
  new_value: any;
  performed_by: string;
  performed_by_name: string;
  timestamp: string;
  description: string;
}

interface Unit {
  id: string;
  unit_id: string;
  display_name: string;
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  payment: 'Payment',
  charge: 'Charge',
  expense: 'Expense',
  adjustment: 'Adjustment',
  bill_input: 'Annual Setup',
  unit: 'Unit',
  owner: 'Owner',
  system: 'System',
};

const ACTION_LABELS: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  approve: 'Approved',
  post: 'Posted',
  assign_owner: 'Owner Assigned',
  execute: 'Executed',
};

const getIconForType = (type: string): string => {
  switch (type) {
    case 'payment': return 'card';
    case 'charge': return 'receipt';
    case 'expense': return 'cash';
    case 'adjustment': return 'swap-horizontal';
    case 'bill_input': return 'calculator';
    case 'unit': return 'business';
    case 'owner': return 'person';
    case 'system': return 'cog';
    default: return 'document';
  }
};

const getColorForAction = (action: string): string => {
  switch (action) {
    case 'create': return '#16a34a';
    case 'delete': return '#dc2626';
    case 'approve': return '#2563eb';
    case 'post': return '#7c3aed';
    case 'update': return '#d97706';
    default: return '#64748b';
  }
};

export default function ActivityScreen() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filters
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedEntityType, setSelectedEntityType] = useState<string>('');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [activeFilters, setActiveFilters] = useState<{entityType: string; unitId: string}>({
    entityType: '',
    unitId: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const params: any = { limit: 100 };
      if (activeFilters.entityType) params.entity_type = activeFilters.entityType;
      if (activeFilters.unitId) params.unit_id = activeFilters.unitId;
      
      const [logsRes, unitsRes] = await Promise.all([
        getAuditLogs(params),
        getUnits(),
      ]);
      setLogs(logsRes.data);
      setUnits(unitsRes.data);
    } catch (error) {
      console.error('Error fetching activity logs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFilters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  const applyFilters = () => {
    setActiveFilters({
      entityType: selectedEntityType,
      unitId: selectedUnitId,
    });
    setShowFilterModal(false);
  };

  const clearFilters = () => {
    setSelectedEntityType('');
    setSelectedUnitId('');
    setActiveFilters({ entityType: '', unitId: '' });
    setShowFilterModal(false);
  };

  const hasActiveFilters = activeFilters.entityType || activeFilters.unitId;

  if (loading) {
    return <LoadingSpinner message="Loading activity..." />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Activity Log</Text>
          <TouchableOpacity
            style={[styles.filterButton, hasActiveFilters && styles.filterButtonActive]}
            onPress={() => setShowFilterModal(true)}
          >
            <Ionicons
              name="filter"
              size={20}
              color={hasActiveFilters ? '#fff' : '#2563eb'}
            />
            {hasActiveFilters && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>
                  {(activeFilters.entityType ? 1 : 0) + (activeFilters.unitId ? 1 : 0)}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>All financial transactions and changes</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {logs.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Ionicons name="document-text-outline" size={48} color="#94a3b8" />
            <Text style={styles.emptyText}>No activity logs found</Text>
            <Text style={styles.emptySubtext}>
              {hasActiveFilters ? 'Try adjusting your filters' : 'Activity will appear here as actions are performed'}
            </Text>
          </Card>
        ) : (
          logs.map((log, index) => (
            <Card key={log.id} style={styles.logCard}>
              <View style={styles.logHeader}>
                <View style={[styles.logIcon, { backgroundColor: `${getColorForAction(log.action)}15` }]}>
                  <Ionicons
                    name={getIconForType(log.entity_type) as any}
                    size={20}
                    color={getColorForAction(log.action)}
                  />
                </View>
                <View style={styles.logInfo}>
                  <Text style={styles.logDescription}>{log.description}</Text>
                  <View style={styles.logMeta}>
                    <View style={[styles.actionBadge, { backgroundColor: `${getColorForAction(log.action)}15` }]}>
                      <Text style={[styles.actionText, { color: getColorForAction(log.action) }]}>
                        {ACTION_LABELS[log.action] || log.action}
                      </Text>
                    </View>
                    <Text style={styles.logType}>
                      {ENTITY_TYPE_LABELS[log.entity_type] || log.entity_type}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.logFooter}>
                <View style={styles.userInfo}>
                  <Ionicons name="person-circle-outline" size={16} color="#64748b" />
                  <Text style={styles.userName}>{log.performed_by_name}</Text>
                </View>
                <Text style={styles.timestamp}>{formatTimestamp(log.timestamp)}</Text>
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      {/* Filter Modal */}
      <Modal
        visible={showFilterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter Activity</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.filterLabel}>Transaction Type</Text>
              <View style={styles.filterOptions}>
                <TouchableOpacity
                  style={[styles.filterOption, selectedEntityType === '' && styles.filterOptionActive]}
                  onPress={() => setSelectedEntityType('')}
                >
                  <Text style={[styles.filterOptionText, selectedEntityType === '' && styles.filterOptionTextActive]}>
                    All Types
                  </Text>
                </TouchableOpacity>
                {Object.entries(ENTITY_TYPE_LABELS).map(([value, label]) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.filterOption, selectedEntityType === value && styles.filterOptionActive]}
                    onPress={() => setSelectedEntityType(value)}
                  >
                    <Text style={[styles.filterOptionText, selectedEntityType === value && styles.filterOptionTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.filterLabel}>Unit</Text>
              <View style={styles.filterOptions}>
                <TouchableOpacity
                  style={[styles.filterOption, selectedUnitId === '' && styles.filterOptionActive]}
                  onPress={() => setSelectedUnitId('')}
                >
                  <Text style={[styles.filterOptionText, selectedUnitId === '' && styles.filterOptionTextActive]}>
                    All Units
                  </Text>
                </TouchableOpacity>
                {units.map((unit) => (
                  <TouchableOpacity
                    key={unit.id}
                    style={[styles.filterOption, selectedUnitId === unit.id && styles.filterOptionActive]}
                    onPress={() => setSelectedUnitId(unit.id)}
                  >
                    <Text style={[styles.filterOptionText, selectedUnitId === unit.id && styles.filterOptionTextActive]}>
                      {unit.display_name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable style={styles.clearButton} onPress={clearFilters}>
                <Text style={styles.clearButtonText}>Clear Filters</Text>
              </Pressable>
              <Pressable style={styles.applyButton} onPress={applyFilters}>
                <Text style={styles.applyButtonText}>Apply Filters</Text>
              </Pressable>
            </View>
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
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
  },
  filterButtonActive: {
    backgroundColor: '#2563eb',
  },
  filterBadge: {
    marginLeft: 4,
    backgroundColor: '#fff',
    borderRadius: 10,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563eb',
  },
  scrollContent: {
    padding: 16,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 24,
  },
  logCard: {
    marginBottom: 12,
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  logIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  logInfo: {
    flex: 1,
  },
  logDescription: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1e293b',
    lineHeight: 20,
  },
  logMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  actionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  actionText: {
    fontSize: 11,
    fontWeight: '600',
  },
  logType: {
    fontSize: 12,
    color: '#64748b',
  },
  logFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  userName: {
    fontSize: 13,
    color: '#64748b',
  },
  timestamp: {
    fontSize: 12,
    color: '#94a3b8',
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
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  modalBody: {
    padding: 20,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 12,
    marginTop: 8,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  filterOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterOptionActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  filterOptionText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
  },
  filterOptionTextActive: {
    color: '#fff',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  clearButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  applyButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
