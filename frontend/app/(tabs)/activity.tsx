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
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getAuditLogs, getUnits } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
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
  reason?: string;
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
  user_profile: 'Profile',
  system: 'System',
  document: 'Document',
  folder: 'Folder',
};

const ACTION_LABELS: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  approve: 'Approved',
  post: 'Posted',
  assign_owner: 'Owner Assigned',
  execute: 'Executed',
  upload: 'Uploaded',
  move: 'Moved',
  replace: 'Replaced',
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
    case 'user_profile': return 'person-circle';
    case 'system': return 'cog';
    case 'document': return 'document';
    case 'folder': return 'folder';
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
    case 'upload': return '#16a34a';
    default: return '#64748b';
  }
};

const DATE_RANGE_OPTIONS = [
  { label: 'All Time', value: '' },
  { label: 'Today', value: 'today' },
  { label: 'Last 7 Days', value: '7days' },
  { label: 'Last 30 Days', value: '30days' },
  { label: 'This Month', value: 'month' },
  { label: 'This Year', value: 'year' },
];

export default function ActivityScreen() {
  const { user } = useAuthStore();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  
  // Filters
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedEntityType, setSelectedEntityType] = useState<string>('');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [selectedDateRange, setSelectedDateRange] = useState<string>('');
  const [activeFilters, setActiveFilters] = useState<{
    entityType: string;
    unitId: string;
    dateRange: string;
  }>({
    entityType: '',
    unitId: '',
    dateRange: '',
  });

  const getDateRangeParams = (range: string) => {
    const now = new Date();
    let start_date = '';
    
    switch (range) {
      case 'today':
        start_date = new Date(now.setHours(0, 0, 0, 0)).toISOString();
        break;
      case '7days':
        start_date = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case '30days':
        start_date = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case 'month':
        start_date = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        break;
      case 'year':
        start_date = new Date(now.getFullYear(), 0, 1).toISOString();
        break;
    }
    
    return start_date;
  };

  const fetchData = useCallback(async () => {
    // Don't fetch if user is not logged in
    if (!user) {
      setLoading(false);
      return;
    }
    
    try {
      const params: any = { limit: 200 };
      if (activeFilters.entityType) params.entity_type = activeFilters.entityType;
      if (activeFilters.unitId) params.unit_id = activeFilters.unitId;
      if (activeFilters.dateRange) {
        params.start_date = getDateRangeParams(activeFilters.dateRange);
      }
      
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
  }, [activeFilters, user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatRelativeTime = (timestamp: string) => {
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
      dateRange: selectedDateRange,
    });
    setShowFilterModal(false);
  };

  const clearFilters = () => {
    setSelectedEntityType('');
    setSelectedUnitId('');
    setSelectedDateRange('');
    setActiveFilters({ entityType: '', unitId: '', dateRange: '' });
    setShowFilterModal(false);
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (activeFilters.entityType) count++;
    if (activeFilters.unitId) count++;
    if (activeFilters.dateRange) count++;
    return count;
  };

  const hasActiveFilters = getActiveFilterCount() > 0;

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'object') {
      // Format as readable key-value pairs
      return Object.entries(value)
        .filter(([k, v]) => v !== null && v !== undefined && k !== '_id')
        .map(([k, v]) => `${k}: ${typeof v === 'number' ? `₹${v.toLocaleString()}` : v}`)
        .join(', ');
    }
    if (typeof value === 'number') return `₹${value.toLocaleString()}`;
    return String(value);
  };

  const toggleExpand = (logId: string) => {
    setExpandedLog(expandedLog === logId ? null : logId);
  };

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
                <Text style={styles.filterBadgeText}>{getActiveFilterCount()}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>Complete audit trail of all transactions and changes</Text>
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
          logs.map((log) => (
            <Card key={log.id} style={styles.logCard}>
              <TouchableOpacity onPress={() => toggleExpand(log.id)} activeOpacity={0.7}>
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
                  <Ionicons
                    name={expandedLog === log.id ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color="#94a3b8"
                  />
                </View>
              </TouchableOpacity>
              
              {/* Expanded Details */}
              {expandedLog === log.id && (
                <View style={styles.expandedContent}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Date & Time</Text>
                    <Text style={styles.detailValue}>{formatTimestamp(log.timestamp)}</Text>
                  </View>
                  
                  {log.old_value && Object.keys(log.old_value).length > 0 && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Previous Value</Text>
                      <Text style={[styles.detailValue, styles.oldValue]}>{formatValue(log.old_value)}</Text>
                    </View>
                  )}
                  
                  {log.new_value && Object.keys(log.new_value).length > 0 && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>New Value</Text>
                      <Text style={[styles.detailValue, styles.newValue]}>{formatValue(log.new_value)}</Text>
                    </View>
                  )}
                  
                  {log.reason && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Reason for Change</Text>
                      <Text style={[styles.detailValue, styles.reasonValue]}>{log.reason}</Text>
                    </View>
                  )}
                </View>
              )}
              
              <View style={styles.logFooter}>
                <View style={styles.userInfo}>
                  <Ionicons name="person-circle-outline" size={16} color="#64748b" />
                  <Text style={styles.userName}>{log.performed_by_name}</Text>
                </View>
                <Text style={styles.timestamp}>{formatRelativeTime(log.timestamp)}</Text>
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
              {/* Date Range Filter */}
              <Text style={styles.filterLabel}>Date Range</Text>
              <View style={styles.filterOptions}>
                {DATE_RANGE_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.filterOption, selectedDateRange === option.value && styles.filterOptionActive]}
                    onPress={() => setSelectedDateRange(option.value)}
                  >
                    <Text style={[styles.filterOptionText, selectedDateRange === option.value && styles.filterOptionTextActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Transaction Type Filter */}
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

              {/* Unit Filter */}
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
  expandedContent: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  detailRow: {
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    color: '#1e293b',
    lineHeight: 20,
  },
  oldValue: {
    color: '#dc2626',
    backgroundColor: '#fef2f2',
    padding: 8,
    borderRadius: 6,
  },
  newValue: {
    color: '#16a34a',
    backgroundColor: '#f0fdf4',
    padding: 8,
    borderRadius: 6,
  },
  reasonValue: {
    color: '#2563eb',
    backgroundColor: '#eff6ff',
    padding: 8,
    borderRadius: 6,
    fontStyle: 'italic',
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
