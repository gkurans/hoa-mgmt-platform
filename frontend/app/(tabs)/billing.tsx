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
  Platform,
  Pressable,
  KeyboardAvoidingView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getAnnualSetups,
  createAnnualSetup,
  updateAnnualSetup,
  deleteAnnualSetup,
  approveSetup,
  postCharges,
  getUnits,
  getCategories,
  getCharges,
  createPayment,
  getPayments,
  updatePayment,
  createExpense,
  getExpenses,
  updateExpense,
  createAdjustment,
  getAdjustments,
  updateCategory,
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

interface Category {
  id: string;
  name: string;
  description: string;
}

interface Charge {
  id: string;
  unit_id: string;
  category_name: string;
  amount: number;
  description: string;
  status: string;
  period: string;
}

interface Expense {
  id: string;
  vendor_name: string;
  category_name: string;
  amount: number;
  payment_date: string;
  description: string;
  method: string;
  invoice_number: string;
}

interface Payment {
  id: string;
  unit_id: string;
  unit_display: string;
  amount: number;
  payment_date: string;
  method: string;
  reference: string;
  notes: string;
  recorded_by: string;
  created_at: string;
}

interface Adjustment {
  id: string;
  unit_display: string;
  category_name: string;
  amount: number;
  adjustment_type: string;
  reason: string;
  period: string;
  created_at: string;
}

export default function BillingScreen() {
  const { user } = useAuthStore();
  const isAdminUser = user?.role === 'admin' || user?.role === 'treasurer';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [setups, setSetups] = useState<AnnualSetup[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  
  const [activeTab, setActiveTab] = useState<'allocation' | 'payments' | 'expenses' | 'adjustments'>('allocation');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Modals
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showEditSetupModal, setShowEditSetupModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showEditPaymentModal, setShowEditPaymentModal] = useState(false);
  const [showEditExpenseModal, setShowEditExpenseModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false);
  
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [selectedSetup, setSelectedSetup] = useState<AnnualSetup | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [resultMessage, setResultMessage] = useState({ title: '', message: '', isError: false });
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  
  // Category edit form
  const [editCategoryForm, setEditCategoryForm] = useState({
    name: '',
    description: '',
  });
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  // Form states
  const [newSetup, setNewSetup] = useState({
    year: new Date().getFullYear(),
    water_total: '',
    electricity_total: '',
    notes: '',
  });

  const [editSetup, setEditSetup] = useState({
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
    category_id: '',
  });

  const [newExpense, setNewExpense] = useState({
    vendor_name: '',
    category_id: '',
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    description: '',
    method: 'bank_transfer',
    reference: '',
    invoice_number: '',
  });

  const [newAdjustment, setNewAdjustment] = useState({
    unit_id: '',
    category_id: '',
    amount: '',
    adjustment_type: 'debit',
    reason: '',
    period: '',
  });

  // Edit form states (with mandatory reason)
  const [editPaymentForm, setEditPaymentForm] = useState({
    amount: '',
    payment_date: '',
    method: '',
    reference: '',
    notes: '',
    reason: '', // Required for audit
  });

  const [editExpenseForm, setEditExpenseForm] = useState({
    vendor_name: '',
    amount: '',
    payment_date: '',
    description: '',
    method: '',
    reference: '',
    invoice_number: '',
    reason: '', // Required for audit
  });

  const showMessage = (title: string, message: string, isError: boolean = false) => {
    if (Platform.OS === 'web') {
      setResultMessage({ title, message, isError });
      setShowResultModal(true);
    } else {
      Alert.alert(title, message);
    }
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    if (Platform.OS === 'web') {
      setConfirmAction({ title, message, onConfirm });
      setShowConfirmModal(true);
    } else {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: onConfirm },
      ]);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const [setupsRes, unitsRes, categoriesRes, expensesRes, adjustmentsRes, paymentsRes] = await Promise.all([
        getAnnualSetups(),
        getUnits(),
        getCategories(),
        isAdminUser ? getExpenses() : Promise.resolve({ data: [] }),
        isAdminUser ? getAdjustments() : Promise.resolve({ data: [] }),
        isAdminUser ? getPayments() : Promise.resolve({ data: [] }),
      ]);
      setSetups(setupsRes.data);
      setUnits(unitsRes.data);
      setCategories(categoriesRes.data);
      setExpenses(expensesRes.data);
      setAdjustments(adjustmentsRes.data);
      setPayments(paymentsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdminUser]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Annual Setup handlers
  const handleCreateSetup = async () => {
    if (!newSetup.water_total || !newSetup.electricity_total) {
      showMessage('Error', 'Please enter Water and Electricity totals', true);
      return;
    }
    setIsSubmitting(true);
    try {
      await createAnnualSetup({
        year: newSetup.year,
        water_total: parseFloat(newSetup.water_total),
        electricity_total: parseFloat(newSetup.electricity_total),
        notes: newSetup.notes,
      });
      setShowSetupModal(false);
      setNewSetup({ year: new Date().getFullYear(), water_total: '', electricity_total: '', notes: '' });
      showMessage('Success', 'Annual setup created successfully!');
      fetchData();
    } catch (error: any) {
      showMessage('Error', error.response?.data?.detail || 'Failed to create setup', true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditSetupModal = (setup: AnnualSetup) => {
    setSelectedSetup(setup);
    setEditSetup({
      water_total: setup.water_total.toString(),
      electricity_total: setup.electricity_total.toString(),
      notes: setup.notes || '',
    });
    setShowEditSetupModal(true);
  };

  const handleEditSetup = async () => {
    if (!selectedSetup || !editSetup.water_total || !editSetup.electricity_total) {
      showMessage('Error', 'Please enter Water and Electricity totals', true);
      return;
    }
    setIsSubmitting(true);
    try {
      await updateAnnualSetup(selectedSetup.id, {
        water_total: parseFloat(editSetup.water_total),
        electricity_total: parseFloat(editSetup.electricity_total),
        notes: editSetup.notes,
      });
      setShowEditSetupModal(false);
      showMessage('Success', 'Annual setup updated successfully!');
      fetchData();
    } catch (error: any) {
      showMessage('Error', error.response?.data?.detail || 'Failed to update setup', true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSetup = (setup: AnnualSetup) => {
    showConfirm(
      'Delete Setup',
      `Are you sure you want to delete the ${setup.year} annual setup?`,
      async () => {
        setIsSubmitting(true);
        try {
          await deleteAnnualSetup(setup.id);
          showMessage('Success', `Annual setup for ${setup.year} deleted successfully!`);
          fetchData();
        } catch (error: any) {
          showMessage('Error', error.response?.data?.detail || 'Failed to delete setup', true);
        } finally {
          setIsSubmitting(false);
        }
      }
    );
  };

  const handleApprove = async (id: string) => {
    setIsSubmitting(true);
    try {
      await approveSetup(id);
      showMessage('Success', 'Setup approved successfully!');
      fetchData();
    } catch (error: any) {
      showMessage('Error', error.response?.data?.detail || 'Failed to approve', true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePost = async (id: string) => {
    showConfirm(
      'Post Charges',
      'This will create charges for all units. Continue?',
      async () => {
        setIsSubmitting(true);
        try {
          const result = await postCharges(id, false);
          showMessage('Success', result.data.message);
          fetchData();
        } catch (error: any) {
          showMessage('Error', error.response?.data?.detail || 'Failed to post', true);
        } finally {
          setIsSubmitting(false);
        }
      }
    );
  };

  // Payment handler
  const handleRecordPayment = async () => {
    if (!selectedUnit || !newPayment.amount) {
      showMessage('Error', 'Please select a unit and enter payment amount', true);
      return;
    }
    if (!newPayment.category_id) {
      showMessage('Error', 'Please select which category this payment is for', true);
      return;
    }
    setIsSubmitting(true);
    try {
      await createPayment({
        unit_id: selectedUnit.id,
        amount: parseFloat(newPayment.amount),
        payment_date: newPayment.payment_date,
        method: newPayment.method,
        reference: newPayment.reference,
        notes: newPayment.notes,
        category_id: newPayment.category_id,
      });
      setShowPaymentModal(false);
      setNewPayment({ amount: '', payment_date: new Date().toISOString().split('T')[0], method: 'upi', reference: '', notes: '', category_id: '' });
      showMessage('Success', 'Payment recorded successfully!');
      fetchData();
    } catch (error: any) {
      showMessage('Error', error.response?.data?.detail || 'Failed to record payment', true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Expense handler
  const handleRecordExpense = async () => {
    if (!newExpense.vendor_name || !newExpense.amount || !newExpense.category_id) {
      showMessage('Error', 'Please fill vendor name, category, and amount', true);
      return;
    }
    
    // Validate description is provided when "Other" category is selected
    const selectedCategory = categories.find(c => c.id === newExpense.category_id);
    if (selectedCategory?.name?.toLowerCase() === 'other' && !newExpense.description.trim()) {
      showMessage('Error', 'Please provide a description for "Other" category expenses', true);
      return;
    }
    
    setIsSubmitting(true);
    try {
      await createExpense({
        vendor_name: newExpense.vendor_name,
        category_id: newExpense.category_id,
        amount: parseFloat(newExpense.amount),
        payment_date: newExpense.payment_date,
        description: newExpense.description,
        method: newExpense.method,
        reference: newExpense.reference,
        invoice_number: newExpense.invoice_number,
      });
      setShowExpenseModal(false);
      setNewExpense({ vendor_name: '', category_id: '', amount: '', payment_date: new Date().toISOString().split('T')[0], description: '', method: 'bank_transfer', reference: '', invoice_number: '' });
      showMessage('Success', 'Expense recorded successfully!');
      fetchData();
    } catch (error: any) {
      showMessage('Error', error.response?.data?.detail || 'Failed to record expense', true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Adjustment handler
  const handleCreateAdjustment = async () => {
    if (!newAdjustment.unit_id || !newAdjustment.amount || !newAdjustment.category_id || !newAdjustment.reason) {
      showMessage('Error', 'Please fill all required fields', true);
      return;
    }
    setIsSubmitting(true);
    try {
      const amount = parseFloat(newAdjustment.amount);
      const finalAmount = newAdjustment.adjustment_type === 'credit' ? -Math.abs(amount) : Math.abs(amount);
      
      await createAdjustment({
        unit_id: newAdjustment.unit_id,
        category_id: newAdjustment.category_id,
        amount: finalAmount,
        reason: newAdjustment.reason,
        period: newAdjustment.period,
      });
      setShowAdjustmentModal(false);
      setNewAdjustment({ unit_id: '', category_id: '', amount: '', adjustment_type: 'debit', reason: '', period: '' });
      showMessage('Success', `${newAdjustment.adjustment_type === 'credit' ? 'Credit' : 'Debit'} adjustment created successfully!`);
      fetchData();
    } catch (error: any) {
      showMessage('Error', error.response?.data?.detail || 'Failed to create adjustment', true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open edit payment modal
  const openEditPaymentModal = (payment: Payment) => {
    setSelectedPayment(payment);
    setEditPaymentForm({
      amount: payment.amount.toString(),
      payment_date: payment.payment_date,
      method: payment.method,
      reference: payment.reference || '',
      notes: payment.notes || '',
      reason: '',
    });
    setShowEditPaymentModal(true);
  };

  // Edit payment handler
  const handleEditPayment = async () => {
    if (!selectedPayment) return;
    if (!editPaymentForm.reason.trim()) {
      showMessage('Error', 'Reason for edit is required for audit compliance', true);
      return;
    }
    setIsSubmitting(true);
    try {
      await updatePayment(selectedPayment.id, {
        amount: editPaymentForm.amount ? parseFloat(editPaymentForm.amount) : undefined,
        payment_date: editPaymentForm.payment_date || undefined,
        method: editPaymentForm.method || undefined,
        reference: editPaymentForm.reference || undefined,
        notes: editPaymentForm.notes || undefined,
        reason: editPaymentForm.reason,
      });
      setShowEditPaymentModal(false);
      setSelectedPayment(null);
      showMessage('Success', 'Payment updated successfully!');
      fetchData();
    } catch (error: any) {
      showMessage('Error', error.response?.data?.detail || 'Failed to update payment', true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open edit expense modal
  const openEditExpenseModal = (expense: Expense) => {
    setSelectedExpense(expense);
    setEditExpenseForm({
      vendor_name: expense.vendor_name,
      amount: expense.amount.toString(),
      payment_date: expense.payment_date,
      description: expense.description || '',
      method: expense.method,
      reference: '',
      invoice_number: expense.invoice_number || '',
      reason: '',
    });
    setShowEditExpenseModal(true);
  };

  // Edit expense handler
  const handleEditExpense = async () => {
    if (!selectedExpense) return;
    if (!editExpenseForm.reason.trim()) {
      showMessage('Error', 'Reason for edit is required for audit compliance', true);
      return;
    }
    setIsSubmitting(true);
    try {
      await updateExpense(selectedExpense.id, {
        vendor_name: editExpenseForm.vendor_name || undefined,
        amount: editExpenseForm.amount ? parseFloat(editExpenseForm.amount) : undefined,
        payment_date: editExpenseForm.payment_date || undefined,
        description: editExpenseForm.description || undefined,
        method: editExpenseForm.method || undefined,
        reference: editExpenseForm.reference || undefined,
        invoice_number: editExpenseForm.invoice_number || undefined,
        reason: editExpenseForm.reason,
      });
      setShowEditExpenseModal(false);
      setSelectedExpense(null);
      showMessage('Success', 'Expense updated successfully!');
      fetchData();
    } catch (error: any) {
      showMessage('Error', error.response?.data?.detail || 'Failed to update expense', true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `₹${Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  };

  if (loading) {
    return <LoadingSpinner message="Loading billing..." />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Billing & Finance</Text>
      </View>

      {isAdminUser && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsContainer}>
          <View style={styles.tabs}>
            {[
              { key: 'allocation', label: 'Allocation', icon: 'calculator' },
              { key: 'payments', label: 'Payments', icon: 'card' },
              { key: 'expenses', label: 'Expenses', icon: 'cash' },
              { key: 'adjustments', label: 'Adjustments', icon: 'swap-horizontal' },
            ].map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                onPress={() => setActiveTab(tab.key as any)}
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
          </View>
        </ScrollView>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* ALLOCATION TAB */}
        {activeTab === 'allocation' && isAdminUser && (
          <View>
            <Button
              title="New Annual Setup"
              onPress={() => setShowSetupModal(true)}
              style={styles.newButton}
            />

            <Card style={styles.formulaCard}>
              <Text style={styles.formulaTitle}>Unity Towers Allocation Formula</Text>
              <View style={styles.formulaBox}>
                <Text style={styles.formulaLabel}>Condo Share =</Text>
                <Text style={styles.formulaText}>W/5 + 0.40E/5 + 0.60E/8</Text>
              </View>
              <View style={styles.formulaBox}>
                <Text style={styles.formulaLabel}>Shop Share =</Text>
                <Text style={styles.formulaText}>0.60E/8</Text>
              </View>
            </Card>

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
                  {setup.status !== 'posted' && (
                    <View style={styles.setupActions}>
                      <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => openEditSetupModal(setup)}
                      >
                        <Ionicons name="pencil" size={18} color="#2563eb" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.iconButton, styles.deleteButton]}
                        onPress={() => handleDeleteSetup(setup)}
                      >
                        <Ionicons name="trash" size={18} color="#dc2626" />
                      </TouchableOpacity>
                      {setup.status === 'draft' && (
                        <Button
                          title="Approve"
                          onPress={() => handleApprove(setup.id)}
                          variant="success"
                          size="small"
                          style={styles.actionButton}
                          loading={isSubmitting}
                        />
                      )}
                      {setup.status === 'approved' && (
                        <Button
                          title="Post Charges"
                          onPress={() => handlePost(setup.id)}
                          variant="primary"
                          size="small"
                          style={styles.actionButton}
                          loading={isSubmitting}
                        />
                      )}
                    </View>
                  )}
                  {setup.status === 'posted' && (
                    <View style={styles.postedNote}>
                      <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                      <Text style={styles.postedNoteText}>Charges posted to all units</Text>
                    </View>
                  )}
                </Card>
              ))
            )}
          </View>
        )}

        {/* PAYMENTS TAB */}
        {activeTab === 'payments' && (
          <View>
            <Text style={styles.sectionTitle}>Record Owner Payment</Text>
            <Text style={styles.sectionSubtitle}>Select a unit to record their payment</Text>
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

            {/* Payment History */}
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Payment History</Text>
            <Text style={styles.sectionSubtitle}>Click edit to modify a payment (requires reason)</Text>
            {payments.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Ionicons name="card" size={48} color="#94a3b8" />
                <Text style={styles.emptyText}>No payments recorded yet</Text>
              </Card>
            ) : (
              payments.map(payment => (
                <Card key={payment.id} style={styles.expenseCard}>
                  <View style={styles.expenseHeader}>
                    <View style={styles.expenseInfo}>
                      <Text style={styles.expenseVendor}>{payment.unit_display}</Text>
                      <Text style={styles.expenseCategory}>{payment.method.replace('_', ' ').toUpperCase()}</Text>
                    </View>
                    <Text style={[styles.expenseAmount, { color: '#16a34a' }]}>
                      {formatCurrency(payment.amount)}
                    </Text>
                  </View>
                  <View style={styles.expenseDetails}>
                    <View style={styles.expenseDetailRow}>
                      <Ionicons name="calendar" size={14} color="#64748b" />
                      <Text style={styles.expenseDetailText}>{payment.payment_date}</Text>
                    </View>
                    {payment.reference && (
                      <View style={styles.expenseDetailRow}>
                        <Ionicons name="document" size={14} color="#64748b" />
                        <Text style={styles.expenseDetailText}>Ref: {payment.reference}</Text>
                      </View>
                    )}
                    <View style={styles.expenseDetailRow}>
                      <Ionicons name="person" size={14} color="#64748b" />
                      <Text style={styles.expenseDetailText}>{payment.recorded_by}</Text>
                    </View>
                  </View>
                  {payment.notes && (
                    <Text style={styles.expenseDescription}>{payment.notes}</Text>
                  )}
                  {isAdminUser && (
                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={() => openEditPaymentModal(payment)}
                    >
                      <Ionicons name="pencil" size={16} color="#2563eb" />
                      <Text style={styles.editButtonText}>Edit</Text>
                    </TouchableOpacity>
                  )}
                </Card>
              ))
            )}
          </View>
        )}

        {/* EXPENSES TAB */}
        {activeTab === 'expenses' && isAdminUser && (
          <View>
            <Button
              title="Record Expense / Vendor Payment"
              onPress={() => setShowExpenseModal(true)}
              style={styles.newButton}
            />

            <Text style={styles.sectionTitle}>Expense History</Text>
            {expenses.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Ionicons name="receipt" size={48} color="#94a3b8" />
                <Text style={styles.emptyText}>No expenses recorded yet</Text>
                <Text style={styles.emptySubtext}>Track payments to vendors, utilities, security, etc.</Text>
              </Card>
            ) : (
              expenses.map(expense => (
                <Card key={expense.id} style={styles.expenseCard}>
                  <View style={styles.expenseHeader}>
                    <View style={styles.expenseInfo}>
                      <Text style={styles.expenseVendor}>{expense.vendor_name}</Text>
                      <Text style={styles.expenseCategory}>{expense.category_name}</Text>
                    </View>
                    <Text style={styles.expenseAmount}>{formatCurrency(expense.amount)}</Text>
                  </View>
                  <View style={styles.expenseDetails}>
                    <View style={styles.expenseDetailRow}>
                      <Ionicons name="calendar" size={14} color="#64748b" />
                      <Text style={styles.expenseDetailText}>{expense.payment_date}</Text>
                    </View>
                    {expense.invoice_number && (
                      <View style={styles.expenseDetailRow}>
                        <Ionicons name="document" size={14} color="#64748b" />
                        <Text style={styles.expenseDetailText}>Inv: {expense.invoice_number}</Text>
                      </View>
                    )}
                    <View style={styles.expenseDetailRow}>
                      <Ionicons name="card" size={14} color="#64748b" />
                      <Text style={styles.expenseDetailText}>{expense.method.replace('_', ' ').toUpperCase()}</Text>
                    </View>
                  </View>
                  {expense.description && (
                    <Text style={styles.expenseDescription}>{expense.description}</Text>
                  )}
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => openEditExpenseModal(expense)}
                  >
                    <Ionicons name="pencil" size={16} color="#2563eb" />
                    <Text style={styles.editButtonText}>Edit</Text>
                  </TouchableOpacity>
                </Card>
              ))
            )}
          </View>
        )}

        {/* ADJUSTMENTS TAB */}
        {activeTab === 'adjustments' && isAdminUser && (
          <View>
            <Button
              title="Create Adjustment (Credit/Debit)"
              onPress={() => setShowAdjustmentModal(true)}
              style={styles.newButton}
            />

            <Card style={styles.infoCard}>
              <Ionicons name="information-circle" size={24} color="#2563eb" />
              <View style={styles.infoContent}>
                <Text style={styles.infoTitle}>When to use Adjustments?</Text>
                <Text style={styles.infoText}>• Credit: Reduce balance (overpayment, correction)</Text>
                <Text style={styles.infoText}>• Debit: Add charge (missed charge, penalty)</Text>
              </View>
            </Card>

            <Text style={styles.sectionTitle}>Adjustment History</Text>
            {adjustments.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Ionicons name="swap-horizontal" size={48} color="#94a3b8" />
                <Text style={styles.emptyText}>No adjustments yet</Text>
              </Card>
            ) : (
              adjustments.map(adj => (
                <Card key={adj.id} style={styles.adjustmentCard}>
                  <View style={styles.adjustmentHeader}>
                    <View style={styles.adjustmentInfo}>
                      <Text style={styles.adjustmentUnit}>{adj.unit_display}</Text>
                      <Text style={styles.adjustmentCategory}>{adj.category_name}</Text>
                    </View>
                    <View style={[
                      styles.adjustmentBadge,
                      { backgroundColor: adj.adjustment_type === 'credit' ? '#dcfce7' : '#fef2f2' }
                    ]}>
                      <Text style={[
                        styles.adjustmentBadgeText,
                        { color: adj.adjustment_type === 'credit' ? '#16a34a' : '#dc2626' }
                      ]}>
                        {adj.adjustment_type === 'credit' ? '-' : '+'}{formatCurrency(adj.amount)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.adjustmentReason}>{adj.reason}</Text>
                  {adj.period && <Text style={styles.adjustmentPeriod}>Period: {adj.period}</Text>}
                </Card>
              ))
            )}
          </View>
        )}

        {/* READ-ONLY VIEW FOR NON-ADMIN USERS */}
        {!isAdminUser && (
          <View>
            <Card style={styles.infoCard}>
              <Ionicons name="information-circle" size={48} color="#2563eb" />
              <Text style={styles.infoCardTitle}>Billing Overview</Text>
              <Text style={styles.infoCardText}>
                View your unit's billing information and transaction history.
                For questions about charges or payments, please contact the administrator.
              </Text>
            </Card>

            <Text style={styles.sectionTitle}>Your Charges</Text>
            {charges.filter(c => {
              const userUnitIds = user?.unit_ids || [];
              return userUnitIds.some(uid => c.unit_id === uid);
            }).length === 0 ? (
              <Card style={styles.emptyCard}>
                <Ionicons name="receipt-outline" size={48} color="#94a3b8" />
                <Text style={styles.emptyText}>No charges found for your units</Text>
              </Card>
            ) : (
              charges.filter(c => {
                const userUnitIds = user?.unit_ids || [];
                return userUnitIds.some(uid => c.unit_id === uid);
              }).map(charge => (
                <Card key={charge.id} style={styles.chargeCard}>
                  <View style={styles.chargeHeader}>
                    <View>
                      <Text style={styles.chargeCategory}>{charge.category_name}</Text>
                      <Text style={styles.chargePeriod}>{charge.period}</Text>
                    </View>
                    <Text style={styles.chargeAmount}>{formatCurrency(charge.amount)}</Text>
                  </View>
                  <View style={[
                    styles.statusBadge,
                    { backgroundColor: charge.status === 'paid' ? '#dcfce7' : '#fef3c7' }
                  ]}>
                    <Text style={[
                      styles.statusText,
                      { color: charge.status === 'paid' ? '#16a34a' : '#d97706' }
                    ]}>
                      {charge.status.toUpperCase()}
                    </Text>
                  </View>
                </Card>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* CREATE ANNUAL SETUP MODAL */}
      <Modal
        visible={showSetupModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSetupModal(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
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
              label="Prior Year Water Total (W) in ₹"
              value={newSetup.water_total}
              onChangeText={(text) => setNewSetup({ ...newSetup, water_total: text })}
              placeholder="e.g., 50000"
              keyboardType="decimal-pad"
            />
            <Input
              label="Prior Year Electricity Total (E) in ₹"
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
            <Button 
              title="Calculate & Create" 
              onPress={handleCreateSetup} 
              loading={isSubmitting}
              disabled={isSubmitting}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* EDIT ANNUAL SETUP MODAL */}
      <Modal
        visible={showEditSetupModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditSetupModal(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Annual Setup - {selectedSetup?.year}</Text>
              <TouchableOpacity onPress={() => setShowEditSetupModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Input
              label="Water Total (W) in ₹"
              value={editSetup.water_total}
              onChangeText={(text) => setEditSetup({ ...editSetup, water_total: text })}
              placeholder="e.g., 50000"
              keyboardType="decimal-pad"
            />
            <Input
              label="Electricity Total (E) in ₹"
              value={editSetup.electricity_total}
              onChangeText={(text) => setEditSetup({ ...editSetup, electricity_total: text })}
              placeholder="e.g., 100000"
              keyboardType="decimal-pad"
            />
            <Input
              label="Notes (Optional)"
              value={editSetup.notes}
              onChangeText={(text) => setEditSetup({ ...editSetup, notes: text })}
              placeholder="Any notes..."
              multiline
            />
            <Button 
              title="Save Changes" 
              onPress={handleEditSetup} 
              loading={isSubmitting}
              disabled={isSubmitting}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* RECORD PAYMENT MODAL */}
      <Modal
        visible={showPaymentModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <ScrollView>
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
                    Outstanding: {formatCurrency(selectedUnit.current_balance)}
                  </Text>
                </View>
              )}
              
              <Text style={styles.fieldLabel}>Payment For (Category) *</Text>
              <View style={styles.categoryGrid}>
                {categories.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.categoryButton,
                      newPayment.category_id === cat.id && styles.categoryButtonActive
                    ]}
                    onPress={() => setNewPayment({ ...newPayment, category_id: cat.id })}
                  >
                    <Text style={[
                      styles.categoryButtonText,
                      newPayment.category_id === cat.id && styles.categoryButtonTextActive
                    ]}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              <Input
                label="Amount (₹) *"
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
              <Text style={styles.fieldLabel}>Payment Method</Text>
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
              <Input
                label="Notes"
                value={newPayment.notes}
                onChangeText={(text) => setNewPayment({ ...newPayment, notes: text })}
                placeholder="e.g., Feb 2025 utilities"
                multiline
              />
              <Button 
                title="Record Payment" 
                onPress={handleRecordPayment} 
                loading={isSubmitting}
                disabled={isSubmitting}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* RECORD EXPENSE MODAL */}
      <Modal
        visible={showExpenseModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowExpenseModal(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <ScrollView>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Record Expense</Text>
                <TouchableOpacity onPress={() => setShowExpenseModal(false)}>
                  <Ionicons name="close" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>
              
              <Input
                label="Vendor/Payee Name *"
                value={newExpense.vendor_name}
                onChangeText={(text) => setNewExpense({ ...newExpense, vendor_name: text })}
                placeholder="e.g., KSEB, Security Co., Plumber"
              />
              
              <Text style={styles.fieldLabel}>Expense Category *</Text>
              <View style={styles.categoryGrid}>
                {categories.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.categoryButton,
                      newExpense.category_id === cat.id && styles.categoryButtonActive
                    ]}
                    onPress={() => setNewExpense({ ...newExpense, category_id: cat.id })}
                  >
                    <Text style={[
                      styles.categoryButtonText,
                      newExpense.category_id === cat.id && styles.categoryButtonTextActive
                    ]}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              <Input
                label="Amount (₹) *"
                value={newExpense.amount}
                onChangeText={(text) => setNewExpense({ ...newExpense, amount: text })}
                placeholder="Enter amount"
                keyboardType="decimal-pad"
              />
              <Input
                label="Payment Date"
                value={newExpense.payment_date}
                onChangeText={(text) => setNewExpense({ ...newExpense, payment_date: text })}
                placeholder="YYYY-MM-DD"
              />
              <Input
                label="Invoice Number"
                value={newExpense.invoice_number}
                onChangeText={(text) => setNewExpense({ ...newExpense, invoice_number: text })}
                placeholder="e.g., INV-2025-001"
              />
              <Text style={styles.fieldLabel}>Payment Method</Text>
              <View style={styles.methodButtons}>
                {['upi', 'bank_transfer', 'cash', 'cheque'].map(method => (
                  <TouchableOpacity
                    key={method}
                    style={[
                      styles.methodButton,
                      newExpense.method === method && styles.methodButtonActive
                    ]}
                    onPress={() => setNewExpense({ ...newExpense, method })}
                  >
                    <Text style={[
                      styles.methodButtonText,
                      newExpense.method === method && styles.methodButtonTextActive
                    ]}>
                      {method.replace('_', ' ').toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Input
                label="Reference/Transaction ID"
                value={newExpense.reference}
                onChangeText={(text) => setNewExpense({ ...newExpense, reference: text })}
                placeholder="Transaction reference"
              />
              
              {/* Description field - Required for "Other" category */}
              {(() => {
                const selectedCategory = categories.find(c => c.id === newExpense.category_id);
                const isOtherCategory = selectedCategory?.name?.toLowerCase() === 'other';
                return (
                  <View style={isOtherCategory ? styles.highlightedField : undefined}>
                    {isOtherCategory && (
                      <View style={styles.otherCategoryNotice}>
                        <Ionicons name="information-circle" size={16} color="#d97706" />
                        <Text style={styles.otherCategoryNoticeText}>
                          Please describe what this expense is for
                        </Text>
                      </View>
                    )}
                    <Input
                      label={isOtherCategory ? "Description *" : "Description"}
                      value={newExpense.description}
                      onChangeText={(text) => setNewExpense({ ...newExpense, description: text })}
                      placeholder={isOtherCategory ? "Required: What was this expense for?" : "What was this payment for?"}
                      multiline
                    />
                  </View>
                );
              })()}
              
              <Button 
                title="Record Expense" 
                onPress={handleRecordExpense} 
                loading={isSubmitting}
                disabled={isSubmitting}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* CREATE ADJUSTMENT MODAL */}
      <Modal
        visible={showAdjustmentModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAdjustmentModal(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <ScrollView>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Create Adjustment</Text>
                <TouchableOpacity onPress={() => setShowAdjustmentModal(false)}>
                  <Ionicons name="close" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>
              
              <Text style={styles.fieldLabel}>Adjustment Type *</Text>
              <View style={styles.typeToggle}>
                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    newAdjustment.adjustment_type === 'credit' && styles.typeCreditActive
                  ]}
                  onPress={() => setNewAdjustment({ ...newAdjustment, adjustment_type: 'credit' })}
                >
                  <Ionicons name="remove-circle" size={20} color={newAdjustment.adjustment_type === 'credit' ? '#fff' : '#16a34a'} />
                  <Text style={[
                    styles.typeButtonText,
                    newAdjustment.adjustment_type === 'credit' && styles.typeButtonTextActive
                  ]}>
                    Credit (Reduce)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    newAdjustment.adjustment_type === 'debit' && styles.typeDebitActive
                  ]}
                  onPress={() => setNewAdjustment({ ...newAdjustment, adjustment_type: 'debit' })}
                >
                  <Ionicons name="add-circle" size={20} color={newAdjustment.adjustment_type === 'debit' ? '#fff' : '#dc2626'} />
                  <Text style={[
                    styles.typeButtonText,
                    newAdjustment.adjustment_type === 'debit' && styles.typeButtonTextActive
                  ]}>
                    Debit (Add)
                  </Text>
                </TouchableOpacity>
              </View>
              
              <Text style={styles.fieldLabel}>Select Unit *</Text>
              <View style={styles.unitGrid}>
                {units.map(unit => (
                  <TouchableOpacity
                    key={unit.id}
                    style={[
                      styles.unitSelectButton,
                      newAdjustment.unit_id === unit.id && styles.unitSelectButtonActive
                    ]}
                    onPress={() => setNewAdjustment({ ...newAdjustment, unit_id: unit.id })}
                  >
                    <Text style={[
                      styles.unitSelectText,
                      newAdjustment.unit_id === unit.id && styles.unitSelectTextActive
                    ]}>
                      {unit.unit_id}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              <Text style={styles.fieldLabel}>Category *</Text>
              <View style={styles.categoryGrid}>
                {categories.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.categoryButton,
                      newAdjustment.category_id === cat.id && styles.categoryButtonActive
                    ]}
                    onPress={() => setNewAdjustment({ ...newAdjustment, category_id: cat.id })}
                  >
                    <Text style={[
                      styles.categoryButtonText,
                      newAdjustment.category_id === cat.id && styles.categoryButtonTextActive
                    ]}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              <Input
                label="Amount (₹) *"
                value={newAdjustment.amount}
                onChangeText={(text) => setNewAdjustment({ ...newAdjustment, amount: text })}
                placeholder="Enter amount"
                keyboardType="decimal-pad"
              />
              <Input
                label="Reason *"
                value={newAdjustment.reason}
                onChangeText={(text) => setNewAdjustment({ ...newAdjustment, reason: text })}
                placeholder="e.g., Overpayment correction, Late fee waiver"
                multiline
              />
              <Input
                label="Period (Optional)"
                value={newAdjustment.period}
                onChangeText={(text) => setNewAdjustment({ ...newAdjustment, period: text })}
                placeholder="e.g., 2025-01, Q1 2025"
              />
              <Button 
                title={`Create ${newAdjustment.adjustment_type === 'credit' ? 'Credit' : 'Debit'} Adjustment`}
                onPress={handleCreateAdjustment} 
                loading={isSubmitting}
                disabled={isSubmitting}
                variant={newAdjustment.adjustment_type === 'credit' ? 'success' : 'danger'}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* RESULT MODAL */}
      <Modal
        visible={showResultModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowResultModal(false)}
      >
        <View style={styles.resultModalOverlay}>
          <View style={styles.resultModalContent}>
            <Ionicons 
              name={resultMessage.isError ? "alert-circle" : "checkmark-circle"} 
              size={48} 
              color={resultMessage.isError ? "#dc2626" : "#16a34a"} 
            />
            <Text style={styles.resultModalTitle}>{resultMessage.title}</Text>
            <Text style={styles.resultModalMessage}>{resultMessage.message}</Text>
            <Pressable 
              style={[styles.resultModalButton, { backgroundColor: resultMessage.isError ? '#dc2626' : '#16a34a' }]}
              onPress={() => setShowResultModal(false)}
            >
              <Text style={styles.resultModalButtonText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* CONFIRM MODAL */}
      <Modal
        visible={showConfirmModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.resultModalOverlay}>
          <View style={styles.resultModalContent}>
            <Ionicons name="help-circle" size={48} color="#d97706" />
            <Text style={styles.resultModalTitle}>{confirmAction?.title}</Text>
            <Text style={styles.resultModalMessage}>{confirmAction?.message}</Text>
            <View style={styles.confirmButtons}>
              <Pressable 
                style={styles.cancelConfirmButton}
                onPress={() => setShowConfirmModal(false)}
              >
                <Text style={styles.cancelConfirmButtonText}>Cancel</Text>
              </Pressable>
              <Pressable 
                style={styles.confirmConfirmButton}
                onPress={() => {
                  setShowConfirmModal(false);
                  confirmAction?.onConfirm();
                }}
              >
                <Text style={styles.confirmConfirmButtonText}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* EDIT PAYMENT MODAL */}
      <Modal
        visible={showEditPaymentModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowEditPaymentModal(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <ScrollView>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Payment</Text>
                <TouchableOpacity onPress={() => setShowEditPaymentModal(false)}>
                  <Ionicons name="close" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>
              
              {selectedPayment && (
                <View style={styles.selectedUnitInfo}>
                  <Text style={styles.selectedUnitName}>{selectedPayment.unit_display}</Text>
                  <Text style={styles.selectedUnitBalance}>
                    Original: {formatCurrency(selectedPayment.amount)}
                  </Text>
                </View>
              )}
              
              <View style={styles.auditWarning}>
                <Ionicons name="shield-checkmark" size={20} color="#d97706" />
                <Text style={styles.auditWarningText}>
                  All edits are logged in the audit trail. A reason is required.
                </Text>
              </View>
              
              <Input
                label="Amount (₹)"
                value={editPaymentForm.amount}
                onChangeText={(text) => setEditPaymentForm({ ...editPaymentForm, amount: text })}
                placeholder="Enter new amount"
                keyboardType="decimal-pad"
              />
              <Input
                label="Payment Date"
                value={editPaymentForm.payment_date}
                onChangeText={(text) => setEditPaymentForm({ ...editPaymentForm, payment_date: text })}
                placeholder="YYYY-MM-DD"
              />
              <Text style={styles.fieldLabel}>Payment Method</Text>
              <View style={styles.methodButtons}>
                {['upi', 'bank_transfer', 'cash', 'cheque'].map(method => (
                  <TouchableOpacity
                    key={method}
                    style={[
                      styles.methodButton,
                      editPaymentForm.method === method && styles.methodButtonActive
                    ]}
                    onPress={() => setEditPaymentForm({ ...editPaymentForm, method })}
                  >
                    <Text style={[
                      styles.methodButtonText,
                      editPaymentForm.method === method && styles.methodButtonTextActive
                    ]}>
                      {method.replace('_', ' ').toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Input
                label="Reference Number"
                value={editPaymentForm.reference}
                onChangeText={(text) => setEditPaymentForm({ ...editPaymentForm, reference: text })}
                placeholder="Optional"
              />
              <Input
                label="Notes"
                value={editPaymentForm.notes}
                onChangeText={(text) => setEditPaymentForm({ ...editPaymentForm, notes: text })}
                placeholder="Optional"
              />
              
              <View style={styles.reasonSection}>
                <Text style={styles.reasonLabel}>Reason for Edit *</Text>
                <TextInput
                  style={styles.reasonInput}
                  value={editPaymentForm.reason}
                  onChangeText={(text) => setEditPaymentForm({ ...editPaymentForm, reason: text })}
                  placeholder="Enter reason for this edit (required for audit)"
                  multiline
                  numberOfLines={3}
                  placeholderTextColor="#94a3b8"
                />
              </View>
              
              <Button
                title={isSubmitting ? "Saving..." : "Save Changes"}
                onPress={handleEditPayment}
                loading={isSubmitting}
                disabled={isSubmitting || !editPaymentForm.reason.trim()}
                style={{ marginTop: 16 }}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* EDIT EXPENSE MODAL */}
      <Modal
        visible={showEditExpenseModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowEditExpenseModal(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <ScrollView>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Expense</Text>
                <TouchableOpacity onPress={() => setShowEditExpenseModal(false)}>
                  <Ionicons name="close" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>
              
              {selectedExpense && (
                <View style={styles.selectedUnitInfo}>
                  <Text style={styles.selectedUnitName}>{selectedExpense.vendor_name}</Text>
                  <Text style={styles.selectedUnitBalance}>
                    Original: {formatCurrency(selectedExpense.amount)}
                  </Text>
                </View>
              )}
              
              <View style={styles.auditWarning}>
                <Ionicons name="shield-checkmark" size={20} color="#d97706" />
                <Text style={styles.auditWarningText}>
                  All edits are logged in the audit trail. A reason is required.
                </Text>
              </View>
              
              <Input
                label="Vendor Name"
                value={editExpenseForm.vendor_name}
                onChangeText={(text) => setEditExpenseForm({ ...editExpenseForm, vendor_name: text })}
                placeholder="Enter vendor name"
              />
              <Input
                label="Amount (₹)"
                value={editExpenseForm.amount}
                onChangeText={(text) => setEditExpenseForm({ ...editExpenseForm, amount: text })}
                placeholder="Enter new amount"
                keyboardType="decimal-pad"
              />
              <Input
                label="Payment Date"
                value={editExpenseForm.payment_date}
                onChangeText={(text) => setEditExpenseForm({ ...editExpenseForm, payment_date: text })}
                placeholder="YYYY-MM-DD"
              />
              <Input
                label="Description"
                value={editExpenseForm.description}
                onChangeText={(text) => setEditExpenseForm({ ...editExpenseForm, description: text })}
                placeholder="Enter description"
              />
              <Text style={styles.fieldLabel}>Payment Method</Text>
              <View style={styles.methodButtons}>
                {['upi', 'bank_transfer', 'cash', 'cheque'].map(method => (
                  <TouchableOpacity
                    key={method}
                    style={[
                      styles.methodButton,
                      editExpenseForm.method === method && styles.methodButtonActive
                    ]}
                    onPress={() => setEditExpenseForm({ ...editExpenseForm, method })}
                  >
                    <Text style={[
                      styles.methodButtonText,
                      editExpenseForm.method === method && styles.methodButtonTextActive
                    ]}>
                      {method.replace('_', ' ').toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Input
                label="Invoice Number"
                value={editExpenseForm.invoice_number}
                onChangeText={(text) => setEditExpenseForm({ ...editExpenseForm, invoice_number: text })}
                placeholder="Optional"
              />
              
              <View style={styles.reasonSection}>
                <Text style={styles.reasonLabel}>Reason for Edit *</Text>
                <TextInput
                  style={styles.reasonInput}
                  value={editExpenseForm.reason}
                  onChangeText={(text) => setEditExpenseForm({ ...editExpenseForm, reason: text })}
                  placeholder="Enter reason for this edit (required for audit)"
                  multiline
                  numberOfLines={3}
                  placeholderTextColor="#94a3b8"
                />
              </View>
              
              <Button
                title={isSubmitting ? "Saving..." : "Save Changes"}
                onPress={handleEditExpense}
                loading={isSubmitting}
                disabled={isSubmitting || !editExpenseForm.reason.trim()}
                style={{ marginTop: 16 }}
              />
            </View>
          </ScrollView>
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
  tabsContainer: {
    backgroundColor: '#fff',
    minHeight: 56,
    maxHeight: 70,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 6,
    alignItems: 'center',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    minWidth: 90,
    justifyContent: 'center',
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
  scrollContent: {
    padding: 16,
  },
  newButton: {
    marginBottom: 16,
  },
  formulaCard: {
    backgroundColor: '#eff6ff',
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 16,
    marginTop: -8,
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
  emptySubtext: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
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
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    backgroundColor: '#fef2f2',
  },
  actionButton: {
    minWidth: 100,
  },
  postedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  postedNoteText: {
    fontSize: 14,
    color: '#16a34a',
    fontWeight: '500',
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
  expenseCard: {
    marginBottom: 12,
  },
  expenseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  expenseInfo: {
    flex: 1,
  },
  expenseVendor: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  expenseCategory: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  expenseAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#dc2626',
  },
  expenseDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  expenseDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  expenseDetailText: {
    fontSize: 13,
    color: '#64748b',
  },
  expenseDescription: {
    fontSize: 14,
    color: '#475569',
    marginTop: 12,
    fontStyle: 'italic',
  },
  adjustmentCard: {
    marginBottom: 12,
  },
  adjustmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  adjustmentInfo: {
    flex: 1,
  },
  adjustmentUnit: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  adjustmentCategory: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  adjustmentBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  adjustmentBadgeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  adjustmentReason: {
    fontSize: 14,
    color: '#475569',
    marginTop: 12,
  },
  adjustmentPeriod: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#eff6ff',
    marginBottom: 24,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#3b82f6',
    marginBottom: 4,
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
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  categoryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  categoryButtonActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#2563eb',
  },
  categoryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  categoryButtonTextActive: {
    color: '#2563eb',
  },
  methodButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  methodButton: {
    paddingHorizontal: 14,
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
  typeToggle: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  typeCreditActive: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  typeDebitActive: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  typeButtonTextActive: {
    color: '#fff',
  },
  unitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  unitSelectButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  unitSelectButtonActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#2563eb',
  },
  unitSelectText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  unitSelectTextActive: {
    color: '#2563eb',
  },
  resultModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultModalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '85%',
    maxWidth: 340,
    alignItems: 'center',
  },
  resultModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 16,
    marginBottom: 8,
  },
  resultModalMessage: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 24,
  },
  resultModalButton: {
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 12,
  },
  resultModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelConfirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  cancelConfirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  confirmConfirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
  },
  confirmConfirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  infoCard: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 16,
  },
  infoCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 12,
    marginBottom: 8,
  },
  infoCardText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  chargeCard: {
    marginBottom: 12,
  },
  chargeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  chargeCategory: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  chargePeriod: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  chargeAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2563eb',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 12,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    alignSelf: 'flex-start',
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  auditWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fef3c7',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  auditWarningText: {
    flex: 1,
    fontSize: 13,
    color: '#92400e',
    lineHeight: 18,
  },
  reasonSection: {
    marginTop: 16,
  },
  reasonLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dc2626',
    marginBottom: 8,
  },
  reasonInput: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#dc2626',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#1e293b',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  highlightedField: {
    backgroundColor: '#fffbeb',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fcd34d',
    marginVertical: 8,
  },
  otherCategoryNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  otherCategoryNoticeText: {
    fontSize: 13,
    color: '#d97706',
    fontWeight: '500',
  },
});
