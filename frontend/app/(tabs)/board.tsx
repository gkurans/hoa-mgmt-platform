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
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useAuthStore } from '../../src/store/authStore';
import {
  getCurrentLeadership,
  getCommitteeMembers,
  getBoardHistory,
  getRoleResponsibilities,
  getElectionGuidelines,
  getDecisions,
  createOfficeHolder,
  updateOfficeHolder,
  deleteOfficeHolder,
  createDecision,
  deleteDecision,
  getOwners,
} from '../../src/services/api';

// Custom Card component
const Card = ({ children, style }: { children: React.ReactNode; style?: any }) => (
  <View style={[styles.card, style]}>{children}</View>
);

interface Leader {
  id: string;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  year: number;
  start_date: string;
  end_date: string;
}

interface CommitteeMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  units: string[];
}

interface HistoryRecord {
  year: number;
  president: Leader | null;
  treasurer: Leader | null;
}

interface Decision {
  id: string;
  title: string;
  description: string;
  decision_date: string;
  participants: string[];
  documents: { id: string; filename: string }[];
  created_at: string;
}

interface Owner {
  id: string;
  name: string;
  email: string;
}

type TabType = 'leadership' | 'committee' | 'responsibilities' | 'elections' | 'history' | 'decisions';

export default function BoardScreen() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('leadership');
  
  // Data
  const [currentLeadership, setCurrentLeadership] = useState<{ president: Leader | null; treasurer: Leader | null; year: number }>({ president: null, treasurer: null, year: new Date().getFullYear() });
  const [committeeMembers, setCommitteeMembers] = useState<CommitteeMember[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [responsibilities, setResponsibilities] = useState<any>({});
  const [electionGuidelines, setElectionGuidelines] = useState<any>({});
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  
  // Modals
  const [showAppointModal, setShowAppointModal] = useState(false);
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [appointRole, setAppointRole] = useState<'president' | 'treasurer'>('president');
  
  // Forms
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [appointYear, setAppointYear] = useState(new Date().getFullYear());
  const [newDecision, setNewDecision] = useState({
    title: '',
    description: '',
    decision_date: new Date().toISOString().split('T')[0],
    participants: '',
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [leadershipRes, committeeRes, historyRes, responsibilitiesRes, guidelinesRes, decisionsRes, ownersRes] = await Promise.all([
        getCurrentLeadership(),
        getCommitteeMembers(),
        getBoardHistory(),
        getRoleResponsibilities(),
        getElectionGuidelines(),
        getDecisions(),
        getOwners(),
      ]);
      
      setCurrentLeadership(leadershipRes.data);
      setCommitteeMembers(committeeRes.data);
      setHistory(historyRes.data);
      setResponsibilities(responsibilitiesRes.data);
      setElectionGuidelines(guidelinesRes.data);
      setDecisions(decisionsRes.data);
      setOwners(ownersRes.data);
    } catch (error) {
      console.error('Error fetching board data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const handleAppointOfficeHolder = async () => {
    if (!selectedOwnerId) {
      Alert.alert('Error', 'Please select an owner');
      return;
    }
    
    setIsSubmitting(true);
    try {
      await createOfficeHolder({
        role: appointRole,
        owner_id: selectedOwnerId,
        year: appointYear,
      });
      
      setShowAppointModal(false);
      setSelectedOwnerId('');
      Alert.alert('Success', `${appointRole.charAt(0).toUpperCase() + appointRole.slice(1)} appointed successfully`);
      fetchData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to appoint office holder');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveOfficeHolder = (holder: Leader, role: string) => {
    Alert.alert(
      'Remove Office Holder',
      `Are you sure you want to remove ${holder.owner_name} as ${role}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteOfficeHolder(holder.id);
              Alert.alert('Success', 'Office holder removed');
              fetchData();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to remove office holder');
            }
          },
        },
      ]
    );
  };

  const handleCreateDecision = async () => {
    if (!newDecision.title || !newDecision.description) {
      Alert.alert('Error', 'Please fill in title and description');
      return;
    }
    
    setIsSubmitting(true);
    try {
      await createDecision({
        title: newDecision.title,
        description: newDecision.description,
        decision_date: newDecision.decision_date,
        participants: newDecision.participants ? newDecision.participants.split(',').map(p => p.trim()) : [],
      });
      
      setShowDecisionModal(false);
      setNewDecision({ title: '', description: '', decision_date: new Date().toISOString().split('T')[0], participants: '' });
      Alert.alert('Success', 'Decision recorded successfully');
      fetchData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to record decision');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDecision = (decision: Decision) => {
    Alert.alert(
      'Delete Decision',
      `Are you sure you want to delete "${decision.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDecision(decision.id);
              Alert.alert('Success', 'Decision deleted');
              fetchData();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to delete decision');
            }
          },
        },
      ]
    );
  };

  const tabs: { key: TabType; label: string; icon: string }[] = [
    { key: 'leadership', label: 'Leadership', icon: 'people' },
    { key: 'committee', label: 'Committee', icon: 'person-add' },
    { key: 'responsibilities', label: 'Roles', icon: 'briefcase' },
    { key: 'elections', label: 'Elections', icon: 'checkbox' },
    { key: 'history', label: 'History', icon: 'time' },
    { key: 'decisions', label: 'Decisions', icon: 'document-text' },
  ];

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading board information...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Association Board</Text>
        {isAdmin && activeTab === 'leadership' && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowAppointModal(true)}
          >
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        )}
        {isAdmin && activeTab === 'decisions' && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowDecisionModal(true)}
          >
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Tab Navigation */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabContainer}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons
              name={tab.icon as any}
              size={18}
              color={activeTab === tab.key ? '#fff' : '#64748b'}
            />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Content */}
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* LEADERSHIP TAB */}
        {activeTab === 'leadership' && (
          <View>
            <Text style={styles.sectionTitle}>Current Leadership ({currentLeadership.year})</Text>
            
            {/* President */}
            <Card style={styles.leaderCard}>
              <View style={styles.leaderHeader}>
                <View style={[styles.roleIcon, { backgroundColor: '#fef3c7' }]}>
                  <Ionicons name="star" size={24} color="#f59e0b" />
                </View>
                <View style={styles.roleInfo}>
                  <Text style={styles.roleTitle}>President</Text>
                  {currentLeadership.president ? (
                    <>
                      <Text style={styles.leaderName}>{currentLeadership.president.owner_name}</Text>
                      <Text style={styles.leaderEmail}>{currentLeadership.president.owner_email}</Text>
                    </>
                  ) : (
                    <Text style={styles.vacantText}>Position Vacant</Text>
                  )}
                </View>
                {isAdmin && currentLeadership.president && (
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveOfficeHolder(currentLeadership.president!, 'President')}
                  >
                    <Ionicons name="close-circle" size={24} color="#dc2626" />
                  </TouchableOpacity>
                )}
              </View>
            </Card>

            {/* Treasurer */}
            <Card style={styles.leaderCard}>
              <View style={styles.leaderHeader}>
                <View style={[styles.roleIcon, { backgroundColor: '#dcfce7' }]}>
                  <Ionicons name="cash" size={24} color="#16a34a" />
                </View>
                <View style={styles.roleInfo}>
                  <Text style={styles.roleTitle}>Treasurer</Text>
                  {currentLeadership.treasurer ? (
                    <>
                      <Text style={styles.leaderName}>{currentLeadership.treasurer.owner_name}</Text>
                      <Text style={styles.leaderEmail}>{currentLeadership.treasurer.owner_email}</Text>
                    </>
                  ) : (
                    <Text style={styles.vacantText}>Position Vacant</Text>
                  )}
                </View>
                {isAdmin && currentLeadership.treasurer && (
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveOfficeHolder(currentLeadership.treasurer!, 'Treasurer')}
                  >
                    <Ionicons name="close-circle" size={24} color="#dc2626" />
                  </TouchableOpacity>
                )}
              </View>
            </Card>

            {isAdmin && (!currentLeadership.president || !currentLeadership.treasurer) && (
              <Text style={styles.hintText}>
                Tap the + button to appoint {!currentLeadership.president && 'President'}{!currentLeadership.president && !currentLeadership.treasurer && ' or '}{!currentLeadership.treasurer && 'Treasurer'}
              </Text>
            )}
          </View>
        )}

        {/* COMMITTEE TAB */}
        {activeTab === 'committee' && (
          <View>
            <Text style={styles.sectionTitle}>Committee Members</Text>
            <Text style={styles.sectionSubtitle}>All owners are automatically committee members</Text>
            
            {committeeMembers.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Ionicons name="people" size={48} color="#94a3b8" />
                <Text style={styles.emptyText}>No committee members yet</Text>
              </Card>
            ) : (
              committeeMembers.map(member => (
                <Card key={member.id} style={styles.memberCard}>
                  <View style={styles.memberIcon}>
                    <Ionicons name="person" size={20} color="#2563eb" />
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{member.name}</Text>
                    <Text style={styles.memberEmail}>{member.email}</Text>
                    {member.units.length > 0 && (
                      <Text style={styles.memberUnits}>Units: {member.units.join(', ')}</Text>
                    )}
                  </View>
                </Card>
              ))
            )}
          </View>
        )}

        {/* RESPONSIBILITIES TAB */}
        {activeTab === 'responsibilities' && (
          <View>
            <Text style={styles.sectionTitle}>Role Responsibilities</Text>
            
            {/* President */}
            <Card style={styles.responsibilityCard}>
              <View style={styles.responsibilityHeader}>
                <Ionicons name="star" size={24} color="#f59e0b" />
                <Text style={styles.responsibilityTitle}>President</Text>
              </View>
              {responsibilities.president?.map((item: string, index: number) => (
                <View key={index} style={styles.responsibilityItem}>
                  <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                  <Text style={styles.responsibilityText}>{item}</Text>
                </View>
              ))}
            </Card>

            {/* Treasurer */}
            <Card style={styles.responsibilityCard}>
              <View style={styles.responsibilityHeader}>
                <Ionicons name="cash" size={24} color="#16a34a" />
                <Text style={styles.responsibilityTitle}>Treasurer</Text>
              </View>
              {responsibilities.treasurer?.map((item: string, index: number) => (
                <View key={index} style={styles.responsibilityItem}>
                  <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                  <Text style={styles.responsibilityText}>{item}</Text>
                </View>
              ))}
            </Card>

            {/* Committee Member */}
            <Card style={styles.responsibilityCard}>
              <View style={styles.responsibilityHeader}>
                <Ionicons name="people" size={24} color="#2563eb" />
                <Text style={styles.responsibilityTitle}>Committee Member</Text>
              </View>
              {responsibilities.committee_member?.map((item: string, index: number) => (
                <View key={index} style={styles.responsibilityItem}>
                  <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                  <Text style={styles.responsibilityText}>{item}</Text>
                </View>
              ))}
            </Card>
          </View>
        )}

        {/* ELECTIONS TAB */}
        {activeTab === 'elections' && (
          <View>
            <Text style={styles.sectionTitle}>Election Guidelines</Text>
            
            {/* Schedule */}
            <Card style={styles.guidelineCard}>
              <View style={styles.guidelineHeader}>
                <Ionicons name="calendar" size={24} color="#2563eb" />
                <Text style={styles.guidelineTitle}>Election Schedule</Text>
              </View>
              <View style={styles.guidelineContent}>
                <Text style={styles.guidelineItem}>• Frequency: {electionGuidelines.schedule?.frequency}</Text>
                <Text style={styles.guidelineItem}>• Month: {electionGuidelines.schedule?.month}</Text>
                <Text style={styles.guidelineItem}>• Term: {electionGuidelines.schedule?.term_duration}</Text>
              </View>
            </Card>

            {/* Process */}
            <Card style={styles.guidelineCard}>
              <View style={styles.guidelineHeader}>
                <Ionicons name="list" size={24} color="#f59e0b" />
                <Text style={styles.guidelineTitle}>Election Process</Text>
              </View>
              <View style={styles.guidelineContent}>
                {electionGuidelines.process?.map((step: string, index: number) => (
                  <View key={index} style={styles.processStep}>
                    <View style={styles.stepNumber}>
                      <Text style={styles.stepNumberText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.stepText}>{step}</Text>
                  </View>
                ))}
              </View>
            </Card>

            {/* Rules */}
            <Card style={styles.guidelineCard}>
              <View style={styles.guidelineHeader}>
                <Ionicons name="shield-checkmark" size={24} color="#16a34a" />
                <Text style={styles.guidelineTitle}>Rules</Text>
              </View>
              <View style={styles.guidelineContent}>
                {electionGuidelines.rules?.map((rule: string, index: number) => (
                  <View key={index} style={styles.ruleItem}>
                    <Ionicons name="checkmark" size={18} color="#16a34a" />
                    <Text style={styles.ruleText}>{rule}</Text>
                  </View>
                ))}
              </View>
            </Card>
          </View>
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <View>
            <Text style={styles.sectionTitle}>Historical Records</Text>
            <Text style={styles.sectionSubtitle}>Office holders from 2025 onwards</Text>
            
            {history.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Ionicons name="time" size={48} color="#94a3b8" />
                <Text style={styles.emptyText}>No historical records yet</Text>
              </Card>
            ) : (
              history.map(record => (
                <Card key={record.year} style={styles.historyCard}>
                  <View style={styles.historyYear}>
                    <Text style={styles.historyYearText}>{record.year}</Text>
                  </View>
                  <View style={styles.historyContent}>
                    <View style={styles.historyRole}>
                      <Ionicons name="star" size={16} color="#f59e0b" />
                      <Text style={styles.historyRoleLabel}>President:</Text>
                      <Text style={styles.historyName}>
                        {record.president?.owner_name || 'Not appointed'}
                      </Text>
                    </View>
                    <View style={styles.historyRole}>
                      <Ionicons name="cash" size={16} color="#16a34a" />
                      <Text style={styles.historyRoleLabel}>Treasurer:</Text>
                      <Text style={styles.historyName}>
                        {record.treasurer?.owner_name || 'Not appointed'}
                      </Text>
                    </View>
                  </View>
                </Card>
              ))
            )}
          </View>
        )}

        {/* DECISIONS TAB */}
        {activeTab === 'decisions' && (
          <View>
            <Text style={styles.sectionTitle}>Decisions & Resolutions</Text>
            <Text style={styles.sectionSubtitle}>Official decisions made by the association</Text>
            
            {decisions.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Ionicons name="document-text" size={48} color="#94a3b8" />
                <Text style={styles.emptyText}>No decisions recorded yet</Text>
                {isAdmin && (
                  <Text style={styles.emptyHint}>Tap + to record a new decision</Text>
                )}
              </Card>
            ) : (
              decisions.map(decision => (
                <Card key={decision.id} style={styles.decisionCard}>
                  <View style={styles.decisionHeader}>
                    <Text style={styles.decisionTitle}>{decision.title}</Text>
                    {isAdmin && (
                      <TouchableOpacity onPress={() => handleDeleteDecision(decision)}>
                        <Ionicons name="trash" size={20} color="#dc2626" />
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.decisionDate}>
                    <Ionicons name="calendar" size={14} color="#64748b" /> {decision.decision_date}
                  </Text>
                  <Text style={styles.decisionDescription}>{decision.description}</Text>
                  {decision.participants.length > 0 && (
                    <Text style={styles.decisionParticipants}>
                      <Ionicons name="people" size={14} color="#64748b" /> {decision.participants.join(', ')}
                    </Text>
                  )}
                  {decision.documents.length > 0 && (
                    <View style={styles.decisionDocs}>
                      <Ionicons name="attach" size={14} color="#2563eb" />
                      <Text style={styles.decisionDocsText}>
                        {decision.documents.map(d => d.filename).join(', ')}
                      </Text>
                    </View>
                  )}
                </Card>
              ))
            )}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* APPOINT MODAL */}
      <Modal
        visible={showAppointModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowAppointModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Appoint Office Holder</Text>
              <TouchableOpacity onPress={() => setShowAppointModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Role</Text>
            <View style={styles.roleSelector}>
              <TouchableOpacity
                style={[styles.roleSelectorButton, appointRole === 'president' && styles.roleSelectorActive]}
                onPress={() => setAppointRole('president')}
              >
                <Ionicons name="star" size={18} color={appointRole === 'president' ? '#fff' : '#64748b'} />
                <Text style={[styles.roleSelectorText, appointRole === 'president' && styles.roleSelectorTextActive]}>
                  President
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleSelectorButton, appointRole === 'treasurer' && styles.roleSelectorActive]}
                onPress={() => setAppointRole('treasurer')}
              >
                <Ionicons name="cash" size={18} color={appointRole === 'treasurer' ? '#fff' : '#64748b'} />
                <Text style={[styles.roleSelectorText, appointRole === 'treasurer' && styles.roleSelectorTextActive]}>
                  Treasurer
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Year</Text>
            <TextInput
              style={styles.input}
              value={appointYear.toString()}
              onChangeText={(text) => setAppointYear(parseInt(text) || new Date().getFullYear())}
              keyboardType="number-pad"
            />

            <Text style={styles.inputLabel}>Select Owner</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedOwnerId}
                onValueChange={(value) => setSelectedOwnerId(value)}
                style={styles.picker}
              >
                <Picker.Item label="Select an owner..." value="" />
                {owners.map(owner => (
                  <Picker.Item key={owner.id} label={`${owner.name} (${owner.email})`} value={owner.id} />
                ))}
              </Picker>
            </View>

            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowAppointModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
                onPress={handleAppointOfficeHolder}
                disabled={isSubmitting}
              >
                <Text style={styles.submitButtonText}>{isSubmitting ? 'Appointing...' : 'Appoint'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* DECISION MODAL */}
      <Modal
        visible={showDecisionModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowDecisionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <ScrollView>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Record Decision</Text>
                <TouchableOpacity onPress={() => setShowDecisionModal(false)}>
                  <Ionicons name="close" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Title *</Text>
              <TextInput
                style={styles.input}
                value={newDecision.title}
                onChangeText={(text) => setNewDecision({ ...newDecision, title: text })}
                placeholder="e.g., Annual Budget Approval"
              />

              <Text style={styles.inputLabel}>Date</Text>
              <TextInput
                style={styles.input}
                value={newDecision.decision_date}
                onChangeText={(text) => setNewDecision({ ...newDecision, decision_date: text })}
                placeholder="YYYY-MM-DD"
              />

              <Text style={styles.inputLabel}>Description *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={newDecision.description}
                onChangeText={(text) => setNewDecision({ ...newDecision, description: text })}
                placeholder="Describe the decision or resolution..."
                multiline
                numberOfLines={4}
              />

              <Text style={styles.inputLabel}>Participants (comma-separated)</Text>
              <TextInput
                style={styles.input}
                value={newDecision.participants}
                onChangeText={(text) => setNewDecision({ ...newDecision, participants: text })}
                placeholder="e.g., John, Mary, David"
              />

              <View style={styles.modalButtons}>
                <Pressable
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => setShowDecisionModal(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalButton, styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
                  onPress={handleCreateDecision}
                  disabled={isSubmitting}
                >
                  <Text style={styles.submitButtonText}>{isSubmitting ? 'Recording...' : 'Record'}</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
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
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
  },
  addButton: {
    backgroundColor: '#2563eb',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContainer: {
    backgroundColor: '#fff',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    gap: 6,
  },
  tabActive: {
    backgroundColor: '#2563eb',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  leaderCard: {
    marginBottom: 12,
  },
  leaderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roleIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  roleInfo: {
    flex: 1,
  },
  roleTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  leaderName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 2,
  },
  leaderEmail: {
    fontSize: 14,
    color: '#64748b',
  },
  vacantText: {
    fontSize: 16,
    color: '#dc2626',
    fontStyle: 'italic',
    marginTop: 4,
  },
  removeButton: {
    padding: 4,
  },
  hintText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  memberEmail: {
    fontSize: 14,
    color: '#64748b',
  },
  memberUnits: {
    fontSize: 13,
    color: '#2563eb',
    marginTop: 2,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#64748b',
    marginTop: 12,
  },
  emptyHint: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },
  responsibilityCard: {
    marginBottom: 12,
  },
  responsibilityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  responsibilityTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  responsibilityItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  responsibilityText: {
    flex: 1,
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
  },
  guidelineCard: {
    marginBottom: 12,
  },
  guidelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  guidelineTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  guidelineContent: {
    paddingLeft: 4,
  },
  guidelineItem: {
    fontSize: 15,
    color: '#475569',
    marginBottom: 6,
    lineHeight: 22,
  },
  processStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  ruleText: {
    flex: 1,
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyYear: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  historyYearText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  historyContent: {
    flex: 1,
  },
  historyRole: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  historyRoleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  historyName: {
    fontSize: 14,
    color: '#1e293b',
  },
  decisionCard: {
    marginBottom: 12,
  },
  decisionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  decisionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },
  decisionDate: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
    marginBottom: 8,
  },
  decisionDescription: {
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
  },
  decisionParticipants: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 8,
  },
  decisionDocs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  decisionDocsText: {
    fontSize: 13,
    color: '#2563eb',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#1e293b',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  roleSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  roleSelectorButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  roleSelectorActive: {
    backgroundColor: '#2563eb',
  },
  roleSelectorText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748b',
  },
  roleSelectorTextActive: {
    color: '#fff',
  },
  pickerContainer: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f1f5f9',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  submitButton: {
    backgroundColor: '#2563eb',
  },
  submitButtonDisabled: {
    backgroundColor: '#93c5fd',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
