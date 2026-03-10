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
  getDecisions,
  createOfficeHolder,
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

type SectionType = 'leadership' | 'committee' | 'roles' | 'elections' | 'history' | 'decisions';

// Static content for roles and responsibilities
const ROLE_RESPONSIBILITIES = {
  president: {
    title: 'President',
    icon: 'star',
    color: '#f59e0b',
    bgColor: '#fef3c7',
    responsibilities: [
      'Lead association meetings',
      'Represent the association in official matters',
      'Ensure execution of community decisions',
      'Coordinate with committee members',
    ],
  },
  treasurer: {
    title: 'Treasurer',
    icon: 'cash',
    color: '#16a34a',
    bgColor: '#dcfce7',
    responsibilities: [
      'Maintain financial records',
      'Track association funds and expenses',
      'Present financial updates to owners',
      'Ensure financial transparency',
    ],
  },
  committee: {
    title: 'Committee Member',
    icon: 'people',
    color: '#2563eb',
    bgColor: '#eff6ff',
    responsibilities: [
      'Participate in discussions',
      'Vote on association matters',
      'Support maintenance and community decisions',
    ],
  },
};

const ELECTION_GUIDELINES = {
  schedule: {
    frequency: 'Once every year',
    month: 'January',
    term_duration: 'January – December of the same year',
  },
  process: [
    'Owners nominate candidates from among the committee members',
    'Voting is conducted among owners',
    'Selected candidates assume roles of President and Treasurer',
    'The Admin records the final election result in the system',
  ],
  rules: [
    'Only one President can exist at a time',
    'Only one Treasurer can exist at a time',
    'President and Treasurer must be selected from existing owners',
    'All owners are automatically Committee Members',
  ],
};

export default function BoardScreen() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionType>('leadership');
  
  // Data
  const [currentLeadership, setCurrentLeadership] = useState<{ president: Leader | null; treasurer: Leader | null; year: number }>({ president: null, treasurer: null, year: new Date().getFullYear() });
  const [committeeMembers, setCommitteeMembers] = useState<CommitteeMember[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  
  // Modals
  const [showAppointModal, setShowAppointModal] = useState(false);
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
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
    // Don't fetch if user is not logged in
    if (!user) {
      setLoading(false);
      return;
    }
    
    try {
      const [leadershipRes, committeeRes, historyRes, decisionsRes, ownersRes] = await Promise.all([
        getCurrentLeadership(),
        getCommitteeMembers(),
        getBoardHistory(),
        getDecisions(),
        getOwners(),
      ]);
      
      setCurrentLeadership(leadershipRes.data);
      setCommitteeMembers(committeeRes.data);
      setHistory(historyRes.data);
      setDecisions(decisionsRes.data);
      setOwners(ownersRes.data);
    } catch (error) {
      console.error('Error fetching board data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

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

  const sections: { key: SectionType; label: string; icon: string }[] = [
    { key: 'leadership', label: 'Leadership', icon: 'people' },
    { key: 'committee', label: 'Committee', icon: 'person-add' },
    { key: 'roles', label: 'Roles', icon: 'briefcase' },
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

  const renderAddButton = () => {
    if (!isAdmin) return null;
    
    if (activeSection === 'leadership' && (!currentLeadership.president || !currentLeadership.treasurer)) {
      return (
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAppointModal(true)}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      );
    }
    
    if (activeSection === 'decisions') {
      return (
        <TouchableOpacity style={styles.addButton} onPress={() => setShowDecisionModal(true)}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      );
    }
    
    return null;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Association Board</Text>
        {renderAddButton()}
      </View>

      {/* Section Navigation - Two rows for better visibility */}
      <View style={styles.sectionNavContainer}>
        <View style={styles.sectionNavRow}>
          {sections.slice(0, 3).map(section => (
            <TouchableOpacity
              key={section.key}
              style={[styles.sectionTab, activeSection === section.key && styles.sectionTabActive]}
              onPress={() => setActiveSection(section.key)}
            >
              <Ionicons
                name={section.icon as any}
                size={18}
                color={activeSection === section.key ? '#fff' : '#64748b'}
              />
              <Text style={[styles.sectionTabText, activeSection === section.key && styles.sectionTabTextActive]}>
                {section.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.sectionNavRow}>
          {sections.slice(3).map(section => (
            <TouchableOpacity
              key={section.key}
              style={[styles.sectionTab, activeSection === section.key && styles.sectionTabActive]}
              onPress={() => setActiveSection(section.key)}
            >
              <Ionicons
                name={section.icon as any}
                size={18}
                color={activeSection === section.key ? '#fff' : '#64748b'}
              />
              <Text style={[styles.sectionTabText, activeSection === section.key && styles.sectionTabTextActive]}>
                {section.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* LEADERSHIP SECTION */}
        {activeSection === 'leadership' && (
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
              <TouchableOpacity style={styles.appointButton} onPress={() => setShowAppointModal(true)}>
                <Ionicons name="add-circle" size={20} color="#fff" />
                <Text style={styles.appointButtonText}>
                  Appoint {!currentLeadership.president && 'President'}{!currentLeadership.president && !currentLeadership.treasurer && ' or '}{!currentLeadership.treasurer && 'Treasurer'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* COMMITTEE SECTION */}
        {activeSection === 'committee' && (
          <View>
            <Text style={styles.sectionTitle}>Committee Members</Text>
            <Text style={styles.sectionSubtitle}>All owners are automatically committee members</Text>
            
            {committeeMembers.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Ionicons name="people" size={48} color="#94a3b8" />
                <Text style={styles.emptyText}>No committee members yet</Text>
                <Text style={styles.emptyHint}>Add owners to the system to populate committee</Text>
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
                    {member.phone && <Text style={styles.memberPhone}>{member.phone}</Text>}
                    {member.units.length > 0 && (
                      <Text style={styles.memberUnits}>Units: {member.units.join(', ')}</Text>
                    )}
                  </View>
                </Card>
              ))
            )}
          </View>
        )}

        {/* ROLES & RESPONSIBILITIES SECTION */}
        {activeSection === 'roles' && (
          <View>
            <Text style={styles.sectionTitle}>Roles & Responsibilities</Text>
            <Text style={styles.sectionSubtitle}>Duties and expectations for each role</Text>
            
            {/* President */}
            <Card style={styles.roleCard}>
              <View style={styles.roleCardHeader}>
                <View style={[styles.roleIconLarge, { backgroundColor: ROLE_RESPONSIBILITIES.president.bgColor }]}>
                  <Ionicons name={ROLE_RESPONSIBILITIES.president.icon as any} size={28} color={ROLE_RESPONSIBILITIES.president.color} />
                </View>
                <Text style={styles.roleCardTitle}>{ROLE_RESPONSIBILITIES.president.title}</Text>
              </View>
              <View style={styles.roleCardContent}>
                {ROLE_RESPONSIBILITIES.president.responsibilities.map((item, index) => (
                  <View key={index} style={styles.responsibilityItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                    <Text style={styles.responsibilityText}>{item}</Text>
                  </View>
                ))}
              </View>
            </Card>

            {/* Treasurer */}
            <Card style={styles.roleCard}>
              <View style={styles.roleCardHeader}>
                <View style={[styles.roleIconLarge, { backgroundColor: ROLE_RESPONSIBILITIES.treasurer.bgColor }]}>
                  <Ionicons name={ROLE_RESPONSIBILITIES.treasurer.icon as any} size={28} color={ROLE_RESPONSIBILITIES.treasurer.color} />
                </View>
                <Text style={styles.roleCardTitle}>{ROLE_RESPONSIBILITIES.treasurer.title}</Text>
              </View>
              <View style={styles.roleCardContent}>
                {ROLE_RESPONSIBILITIES.treasurer.responsibilities.map((item, index) => (
                  <View key={index} style={styles.responsibilityItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                    <Text style={styles.responsibilityText}>{item}</Text>
                  </View>
                ))}
              </View>
            </Card>

            {/* Committee Member */}
            <Card style={styles.roleCard}>
              <View style={styles.roleCardHeader}>
                <View style={[styles.roleIconLarge, { backgroundColor: ROLE_RESPONSIBILITIES.committee.bgColor }]}>
                  <Ionicons name={ROLE_RESPONSIBILITIES.committee.icon as any} size={28} color={ROLE_RESPONSIBILITIES.committee.color} />
                </View>
                <Text style={styles.roleCardTitle}>{ROLE_RESPONSIBILITIES.committee.title}</Text>
              </View>
              <View style={styles.roleCardContent}>
                {ROLE_RESPONSIBILITIES.committee.responsibilities.map((item, index) => (
                  <View key={index} style={styles.responsibilityItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                    <Text style={styles.responsibilityText}>{item}</Text>
                  </View>
                ))}
              </View>
            </Card>
          </View>
        )}

        {/* ELECTIONS SECTION */}
        {activeSection === 'elections' && (
          <View>
            <Text style={styles.sectionTitle}>Election Guidelines</Text>
            <Text style={styles.sectionSubtitle}>Process and rules for board elections</Text>
            
            {/* Schedule */}
            <Card style={styles.guidelineCard}>
              <View style={styles.guidelineHeader}>
                <Ionicons name="calendar" size={24} color="#2563eb" />
                <Text style={styles.guidelineTitle}>Election Schedule</Text>
              </View>
              <View style={styles.guidelineContent}>
                <View style={styles.scheduleItem}>
                  <Text style={styles.scheduleLabel}>Frequency:</Text>
                  <Text style={styles.scheduleValue}>{ELECTION_GUIDELINES.schedule.frequency}</Text>
                </View>
                <View style={styles.scheduleItem}>
                  <Text style={styles.scheduleLabel}>Month:</Text>
                  <Text style={styles.scheduleValue}>{ELECTION_GUIDELINES.schedule.month}</Text>
                </View>
                <View style={styles.scheduleItem}>
                  <Text style={styles.scheduleLabel}>Term Duration:</Text>
                  <Text style={styles.scheduleValue}>{ELECTION_GUIDELINES.schedule.term_duration}</Text>
                </View>
              </View>
            </Card>

            {/* Process */}
            <Card style={styles.guidelineCard}>
              <View style={styles.guidelineHeader}>
                <Ionicons name="list" size={24} color="#f59e0b" />
                <Text style={styles.guidelineTitle}>Election Process</Text>
              </View>
              <View style={styles.guidelineContent}>
                {ELECTION_GUIDELINES.process.map((step, index) => (
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
                <Text style={styles.guidelineTitle}>Election Rules</Text>
              </View>
              <View style={styles.guidelineContent}>
                {ELECTION_GUIDELINES.rules.map((rule, index) => (
                  <View key={index} style={styles.ruleItem}>
                    <Ionicons name="checkmark" size={18} color="#16a34a" />
                    <Text style={styles.ruleText}>{rule}</Text>
                  </View>
                ))}
              </View>
            </Card>
          </View>
        )}

        {/* HISTORY SECTION */}
        {activeSection === 'history' && (
          <View>
            <Text style={styles.sectionTitle}>Historical Records</Text>
            <Text style={styles.sectionSubtitle}>Office holders from 2025 onwards</Text>
            
            {history.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Ionicons name="time" size={48} color="#94a3b8" />
                <Text style={styles.emptyText}>No historical records yet</Text>
                <Text style={styles.emptyHint}>Records will appear after office holders are appointed</Text>
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

            {/* Show current year if not in history */}
            {history.length === 0 && (
              <View style={styles.infoBox}>
                <Ionicons name="information-circle" size={20} color="#2563eb" />
                <Text style={styles.infoText}>
                  Appoint President and Treasurer in the Leadership section to create historical records.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* DECISIONS SECTION */}
        {activeSection === 'decisions' && (
          <View>
            <Text style={styles.sectionTitle}>Decisions & Resolutions</Text>
            <Text style={styles.sectionSubtitle}>Official decisions made by the association</Text>
            
            {isAdmin && (
              <TouchableOpacity style={styles.addDecisionButton} onPress={() => setShowDecisionModal(true)}>
                <Ionicons name="add-circle" size={20} color="#fff" />
                <Text style={styles.addDecisionButtonText}>Record New Decision</Text>
              </TouchableOpacity>
            )}
            
            {decisions.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Ionicons name="document-text" size={48} color="#94a3b8" />
                <Text style={styles.emptyText}>No decisions recorded yet</Text>
                {isAdmin && (
                  <Text style={styles.emptyHint}>Tap "Record New Decision" to add one</Text>
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
                  <View style={styles.decisionMeta}>
                    <Ionicons name="calendar" size={14} color="#64748b" />
                    <Text style={styles.decisionDate}>{decision.decision_date}</Text>
                  </View>
                  <Text style={styles.decisionDescription}>{decision.description}</Text>
                  {decision.participants.length > 0 && (
                    <View style={styles.decisionParticipants}>
                      <Ionicons name="people" size={14} color="#64748b" />
                      <Text style={styles.decisionParticipantsText}>{decision.participants.join(', ')}</Text>
                    </View>
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
  sectionNavContainer: {
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  sectionNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  sectionTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    gap: 4,
  },
  sectionTabActive: {
    backgroundColor: '#2563eb',
  },
  sectionTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  sectionTabTextActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
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
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  appointButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 8,
  },
  appointButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
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
  memberPhone: {
    fontSize: 13,
    color: '#94a3b8',
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
    textAlign: 'center',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#eff6ff',
    padding: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1e40af',
    lineHeight: 20,
  },
  roleCard: {
    marginBottom: 16,
  },
  roleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  roleIconLarge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleCardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  roleCardContent: {
    paddingLeft: 4,
  },
  responsibilityItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  responsibilityText: {
    flex: 1,
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
  },
  guidelineCard: {
    marginBottom: 16,
  },
  guidelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  guidelineTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  guidelineContent: {
    paddingLeft: 4,
  },
  scheduleItem: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  scheduleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#475569',
    width: 120,
  },
  scheduleValue: {
    flex: 1,
    fontSize: 15,
    color: '#1e293b',
  },
  processStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
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
    gap: 10,
    marginBottom: 10,
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
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  historyYearText: {
    fontSize: 20,
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
    marginBottom: 6,
  },
  historyRoleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    width: 80,
  },
  historyName: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '500',
  },
  addDecisionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 16,
  },
  addDecisionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
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
    marginRight: 12,
  },
  decisionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    marginBottom: 10,
  },
  decisionDate: {
    fontSize: 13,
    color: '#64748b',
  },
  decisionDescription: {
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
  },
  decisionParticipants: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  decisionParticipantsText: {
    fontSize: 13,
    color: '#64748b',
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
