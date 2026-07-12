#!/usr/bin/env python3
"""
Backend API Testing for Kerala HOA Management System
Testing the reworked accounting model for True-Up Report
"""

import requests
import json
from typing import Dict, List, Any

# Configuration
BASE_URL = "https://bug-fixes-staging.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@unitytowers.com"
ADMIN_PASSWORD = "admin123"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'

def print_test(message: str):
    print(f"\n{Colors.BLUE}{'='*80}{Colors.RESET}")
    print(f"{Colors.BLUE}{message}{Colors.RESET}")
    print(f"{Colors.BLUE}{'='*80}{Colors.RESET}")

def print_pass(message: str):
    print(f"{Colors.GREEN}✅ PASS: {message}{Colors.RESET}")

def print_fail(message: str):
    print(f"{Colors.RED}❌ FAIL: {message}{Colors.RESET}")

def print_info(message: str):
    print(f"{Colors.YELLOW}ℹ️  INFO: {message}{Colors.RESET}")

class TestRunner:
    def __init__(self):
        self.token = None
        self.passed = 0
        self.failed = 0
        self.test_results = []
    
    def login(self) -> bool:
        """Authenticate and get JWT token"""
        print_test("TEST 0: Authentication")
        try:
            response = requests.post(
                f"{BASE_URL}/auth/login",
                json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
            )
            
            if response.status_code == 200:
                data = response.json()
                self.token = data.get("access_token")
                print_pass(f"Login successful with {ADMIN_EMAIL}")
                print_info(f"Token received: {self.token[:20]}...")
                return True
            else:
                print_fail(f"Login failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print_fail(f"Login error: {str(e)}")
            return False
    
    def get_headers(self) -> Dict[str, str]:
        """Get authorization headers"""
        return {"Authorization": f"Bearer {self.token}"}
    
    def test_1_true_up_2026_reconciliation(self) -> bool:
        """
        TEST 1: GET /api/reports/true-up/2026
        - Should return 200
        - For every item, net_balance must equal unit's current_balance (within 0.01)
        - Confirm Unit 2A net_balance == 8530.405
        """
        print_test("TEST 1: True-Up 2026 Reconciliation")
        
        try:
            # Get True-Up Report for 2026
            response = requests.get(
                f"{BASE_URL}/reports/true-up/2026",
                headers=self.get_headers()
            )
            
            if response.status_code != 200:
                print_fail(f"True-Up 2026 request failed: {response.status_code} - {response.text}")
                self.test_results.append(("TEST 1", False, f"Status code {response.status_code}"))
                return False
            
            true_up_data = response.json()
            print_pass("True-Up 2026 report retrieved successfully")
            print_info(f"Report generated at: {true_up_data.get('generated_at')}")
            print_info(f"Total items: {len(true_up_data.get('items', []))}")
            
            # Get all units to compare current_balance
            units_response = requests.get(
                f"{BASE_URL}/units",
                headers=self.get_headers()
            )
            
            if units_response.status_code != 200:
                print_fail(f"Units request failed: {units_response.status_code}")
                self.test_results.append(("TEST 1", False, "Failed to get units"))
                return False
            
            units = units_response.json()
            units_dict = {unit['id']: unit for unit in units}
            
            print_info(f"Retrieved {len(units)} units for comparison")
            
            # Check reconciliation for all units
            all_reconciled = True
            unit_2a_found = False
            unit_2a_net_balance = None
            
            for item in true_up_data['items']:
                # Find matching unit by unit_id (e.g., "2A", "2B")
                matching_unit = None
                for unit in units:
                    if unit['unit_id'] == item['unit_id']:
                        matching_unit = unit
                        break
                
                if not matching_unit:
                    print_fail(f"Unit {item['unit_id']} not found in units list")
                    all_reconciled = False
                    continue
                
                net_balance = item['net_balance']
                current_balance = matching_unit['current_balance']
                difference = abs(net_balance - current_balance)
                
                if difference > 0.01:
                    print_fail(f"Unit {item['unit_id']}: net_balance={net_balance:.3f}, current_balance={current_balance:.3f}, diff={difference:.4f}")
                    all_reconciled = False
                else:
                    print_pass(f"Unit {item['unit_id']}: net_balance={net_balance:.3f} == current_balance={current_balance:.3f} (diff={difference:.4f})")
                
                # Check Unit 2A specifically
                if item['unit_id'] == '2A':
                    unit_2a_found = True
                    unit_2a_net_balance = net_balance
                    expected_2a = 8530.405
                    if abs(net_balance - expected_2a) < 0.01:
                        print_pass(f"Unit 2A net_balance = {net_balance:.3f} (expected {expected_2a})")
                    else:
                        print_fail(f"Unit 2A net_balance = {net_balance:.3f} (expected {expected_2a})")
                        all_reconciled = False
            
            if not unit_2a_found:
                print_fail("Unit 2A not found in True-Up report")
                all_reconciled = False
            
            if all_reconciled:
                print_pass("TEST 1: All units reconciled perfectly")
                self.test_results.append(("TEST 1", True, "All units reconciled, Unit 2A = 8530.405"))
                return True
            else:
                print_fail("TEST 1: Reconciliation failed for one or more units")
                self.test_results.append(("TEST 1", False, "Reconciliation mismatch"))
                return False
                
        except Exception as e:
            print_fail(f"TEST 1 error: {str(e)}")
            self.test_results.append(("TEST 1", False, str(e)))
            return False
    
    def test_2_true_up_2025_empty(self) -> bool:
        """
        TEST 2: GET /api/reports/true-up/2025
        - Should return 200
        - All items must have opening_balance==0, total_assessed==0, total_paid==0, net_balance==0
        - (no data existed before 2026)
        """
        print_test("TEST 2: True-Up 2025 (Empty Year)")
        
        try:
            response = requests.get(
                f"{BASE_URL}/reports/true-up/2025",
                headers=self.get_headers()
            )
            
            if response.status_code != 200:
                print_fail(f"True-Up 2025 request failed: {response.status_code} - {response.text}")
                self.test_results.append(("TEST 2", False, f"Status code {response.status_code}"))
                return False
            
            true_up_data = response.json()
            print_pass("True-Up 2025 report retrieved successfully")
            print_info(f"Total items: {len(true_up_data.get('items', []))}")
            
            all_zero = True
            for item in true_up_data['items']:
                opening = item['opening_balance']
                assessed = item['total_assessed']
                paid = item['total_paid']
                net = item['net_balance']
                
                if opening != 0 or assessed != 0 or paid != 0 or net != 0:
                    print_fail(f"Unit {item['unit_id']}: opening={opening}, assessed={assessed}, paid={paid}, net={net} (expected all 0)")
                    all_zero = False
                else:
                    print_pass(f"Unit {item['unit_id']}: All values are 0 (correct)")
            
            if all_zero:
                print_pass("TEST 2: All 2025 balances are zero (no prior data)")
                self.test_results.append(("TEST 2", True, "All 2025 balances zero"))
                return True
            else:
                print_fail("TEST 2: Some 2025 balances are non-zero")
                self.test_results.append(("TEST 2", False, "Non-zero balances in 2025"))
                return False
                
        except Exception as e:
            print_fail(f"TEST 2 error: {str(e)}")
            self.test_results.append(("TEST 2", False, str(e)))
            return False
    
    def test_3_true_up_2027_carry_forward(self) -> bool:
        """
        TEST 3: GET /api/reports/true-up/2027
        - Should return 200
        - For every item, opening_balance must equal that unit's 2026 net_balance
        - total_assessed==0, total_paid==0
        - net_balance == 2026 closing (same as opening)
        - This proves automatic carry-forward Opening(N)=Closing(N-1)
        """
        print_test("TEST 3: True-Up 2027 (Automatic Carry-Forward)")
        
        try:
            # Get 2026 report first
            response_2026 = requests.get(
                f"{BASE_URL}/reports/true-up/2026",
                headers=self.get_headers()
            )
            
            if response_2026.status_code != 200:
                print_fail(f"True-Up 2026 request failed: {response_2026.status_code}")
                self.test_results.append(("TEST 3", False, "Failed to get 2026 report"))
                return False
            
            data_2026 = response_2026.json()
            closing_2026 = {item['unit_id']: item['net_balance'] for item in data_2026['items']}
            print_info(f"Retrieved 2026 closing balances for {len(closing_2026)} units")
            
            # Get 2027 report
            response_2027 = requests.get(
                f"{BASE_URL}/reports/true-up/2027",
                headers=self.get_headers()
            )
            
            if response_2027.status_code != 200:
                print_fail(f"True-Up 2027 request failed: {response_2027.status_code}")
                self.test_results.append(("TEST 3", False, f"Status code {response_2027.status_code}"))
                return False
            
            data_2027 = response_2027.json()
            print_pass("True-Up 2027 report retrieved successfully")
            print_info(f"Total items: {len(data_2027.get('items', []))}")
            
            all_correct = True
            for item in data_2027['items']:
                unit_id = item['unit_id']
                opening_2027 = item['opening_balance']
                assessed = item['total_assessed']
                paid = item['total_paid']
                net = item['net_balance']
                
                expected_opening = closing_2026.get(unit_id, 0)
                
                # Check opening = 2026 closing
                if abs(opening_2027 - expected_opening) > 0.01:
                    print_fail(f"Unit {unit_id}: opening_2027={opening_2027:.3f}, expected={expected_opening:.3f} (2026 closing)")
                    all_correct = False
                else:
                    print_pass(f"Unit {unit_id}: opening_2027={opening_2027:.3f} == 2026_closing={expected_opening:.3f}")
                
                # Check assessed and paid are 0
                if assessed != 0:
                    print_fail(f"Unit {unit_id}: total_assessed={assessed} (expected 0)")
                    all_correct = False
                
                if paid != 0:
                    print_fail(f"Unit {unit_id}: total_paid={paid} (expected 0)")
                    all_correct = False
                
                # Check net = opening (since no activity)
                if abs(net - opening_2027) > 0.01:
                    print_fail(f"Unit {unit_id}: net_balance={net:.3f}, opening={opening_2027:.3f} (should be equal)")
                    all_correct = False
            
            if all_correct:
                print_pass("TEST 3: Automatic carry-forward verified (Opening(2027) = Closing(2026))")
                self.test_results.append(("TEST 3", True, "Automatic carry-forward working"))
                return True
            else:
                print_fail("TEST 3: Carry-forward verification failed")
                self.test_results.append(("TEST 3", False, "Carry-forward mismatch"))
                return False
                
        except Exception as e:
            print_fail(f"TEST 3 error: {str(e)}")
            self.test_results.append(("TEST 3", False, str(e)))
            return False
    
    def test_4_carry_forward_noop(self) -> bool:
        """
        TEST 4: POST /api/reports/carry-forward/2026
        - Should return 200 with automatic:true
        - Then GET /api/units and confirm current_balance and opening_balance UNCHANGED
        - This proves it is a non-destructive no-op
        """
        print_test("TEST 4: Carry-Forward No-Op Verification")
        
        try:
            # Get units before carry-forward
            units_before = requests.get(
                f"{BASE_URL}/units",
                headers=self.get_headers()
            )
            
            if units_before.status_code != 200:
                print_fail(f"Failed to get units before: {units_before.status_code}")
                self.test_results.append(("TEST 4", False, "Failed to get units before"))
                return False
            
            units_before_data = units_before.json()
            balances_before = {
                unit['unit_id']: {
                    'current_balance': unit['current_balance'],
                    'opening_balance': unit['opening_balance']
                }
                for unit in units_before_data
            }
            
            print_info(f"Captured balances for {len(balances_before)} units before carry-forward")
            
            # Call carry-forward endpoint
            response = requests.post(
                f"{BASE_URL}/reports/carry-forward/2026",
                headers=self.get_headers()
            )
            
            if response.status_code != 200:
                print_fail(f"Carry-forward request failed: {response.status_code} - {response.text}")
                self.test_results.append(("TEST 4", False, f"Status code {response.status_code}"))
                return False
            
            carry_forward_data = response.json()
            print_pass("Carry-forward endpoint returned 200")
            print_info(f"Response: {json.dumps(carry_forward_data, indent=2)}")
            
            # Check for automatic:true
            if not carry_forward_data.get('automatic'):
                print_fail("Response does not contain 'automatic: true'")
                self.test_results.append(("TEST 4", False, "Missing automatic:true"))
                return False
            
            print_pass("Response contains 'automatic: true'")
            
            # Get units after carry-forward
            units_after = requests.get(
                f"{BASE_URL}/units",
                headers=self.get_headers()
            )
            
            if units_after.status_code != 200:
                print_fail(f"Failed to get units after: {units_after.status_code}")
                self.test_results.append(("TEST 4", False, "Failed to get units after"))
                return False
            
            units_after_data = units_after.json()
            
            # Compare balances
            all_unchanged = True
            for unit in units_after_data:
                unit_id = unit['unit_id']
                before = balances_before.get(unit_id)
                
                if not before:
                    print_fail(f"Unit {unit_id} not found in before snapshot")
                    all_unchanged = False
                    continue
                
                current_diff = abs(unit['current_balance'] - before['current_balance'])
                opening_diff = abs(unit['opening_balance'] - before['opening_balance'])
                
                if current_diff > 0.001 or opening_diff > 0.001:
                    print_fail(f"Unit {unit_id}: Balances CHANGED! current: {before['current_balance']:.3f} -> {unit['current_balance']:.3f}, opening: {before['opening_balance']:.3f} -> {unit['opening_balance']:.3f}")
                    all_unchanged = False
                else:
                    print_pass(f"Unit {unit_id}: Balances UNCHANGED (current={unit['current_balance']:.3f}, opening={unit['opening_balance']:.3f})")
            
            # Specifically check Unit 2A
            unit_2a_after = next((u for u in units_after_data if u['unit_id'] == '2A'), None)
            if unit_2a_after:
                if abs(unit_2a_after['current_balance'] - 8530.405) < 0.01:
                    print_pass(f"Unit 2A current_balance still {unit_2a_after['current_balance']:.3f} (expected 8530.405)")
                else:
                    print_fail(f"Unit 2A current_balance changed to {unit_2a_after['current_balance']:.3f} (expected 8530.405)")
                    all_unchanged = False
                
                if unit_2a_after['opening_balance'] == 0:
                    print_pass(f"Unit 2A opening_balance still 0")
                else:
                    print_fail(f"Unit 2A opening_balance changed to {unit_2a_after['opening_balance']}")
                    all_unchanged = False
            
            if all_unchanged:
                print_pass("TEST 4: Carry-forward is a safe no-op (no balances changed)")
                self.test_results.append(("TEST 4", True, "No-op verified, no balances changed"))
                return True
            else:
                print_fail("TEST 4: Carry-forward modified balances (should be no-op)")
                self.test_results.append(("TEST 4", False, "Balances were modified"))
                return False
                
        except Exception as e:
            print_fail(f"TEST 4 error: {str(e)}")
            self.test_results.append(("TEST 4", False, str(e)))
            return False
    
    def test_5_regression(self) -> bool:
        """
        TEST 5: Regression tests
        - GET /api/dashboard/admin -> 200
        - GET /api/adjustments -> 200
        - GET /api/payments -> 200
        - GET /api/expenses -> 200
        - GET /api/charges -> 200
        """
        print_test("TEST 5: Regression Tests")
        
        endpoints = [
            "/dashboard/admin",
            "/adjustments",
            "/payments",
            "/expenses",
            "/charges"
        ]
        
        all_passed = True
        
        for endpoint in endpoints:
            try:
                response = requests.get(
                    f"{BASE_URL}{endpoint}",
                    headers=self.get_headers()
                )
                
                if response.status_code == 200:
                    data = response.json()
                    if isinstance(data, list):
                        print_pass(f"GET {endpoint} -> 200 ({len(data)} records)")
                    else:
                        print_pass(f"GET {endpoint} -> 200 (data returned)")
                else:
                    print_fail(f"GET {endpoint} -> {response.status_code}")
                    all_passed = False
            except Exception as e:
                print_fail(f"GET {endpoint} error: {str(e)}")
                all_passed = False
        
        if all_passed:
            print_pass("TEST 5: All regression tests passed")
            self.test_results.append(("TEST 5", True, "All endpoints return 200"))
            return True
        else:
            print_fail("TEST 5: Some regression tests failed")
            self.test_results.append(("TEST 5", False, "Some endpoints failed"))
            return False
    
    def run_all_tests(self):
        """Run all tests in sequence"""
        print(f"\n{Colors.BLUE}{'='*80}{Colors.RESET}")
        print(f"{Colors.BLUE}Kerala HOA True-Up Report Accounting Model Tests{Colors.RESET}")
        print(f"{Colors.BLUE}{'='*80}{Colors.RESET}")
        
        # Login first
        if not self.login():
            print_fail("Authentication failed. Cannot proceed with tests.")
            return
        
        # Run all tests
        tests = [
            self.test_1_true_up_2026_reconciliation,
            self.test_2_true_up_2025_empty,
            self.test_3_true_up_2027_carry_forward,
            self.test_4_carry_forward_noop,
            self.test_5_regression
        ]
        
        for test in tests:
            result = test()
            if result:
                self.passed += 1
            else:
                self.failed += 1
        
        # Print summary
        print(f"\n{Colors.BLUE}{'='*80}{Colors.RESET}")
        print(f"{Colors.BLUE}TEST SUMMARY{Colors.RESET}")
        print(f"{Colors.BLUE}{'='*80}{Colors.RESET}")
        
        for test_name, passed, message in self.test_results:
            status = f"{Colors.GREEN}✅ PASS{Colors.RESET}" if passed else f"{Colors.RED}❌ FAIL{Colors.RESET}"
            print(f"{status} - {test_name}: {message}")
        
        print(f"\n{Colors.BLUE}Total: {self.passed + self.failed} tests{Colors.RESET}")
        print(f"{Colors.GREEN}Passed: {self.passed}{Colors.RESET}")
        print(f"{Colors.RED}Failed: {self.failed}{Colors.RESET}")
        
        if self.failed == 0:
            print(f"\n{Colors.GREEN}{'='*80}{Colors.RESET}")
            print(f"{Colors.GREEN}🎉 ALL TESTS PASSED! 🎉{Colors.RESET}")
            print(f"{Colors.GREEN}{'='*80}{Colors.RESET}")
        else:
            print(f"\n{Colors.RED}{'='*80}{Colors.RESET}")
            print(f"{Colors.RED}⚠️  SOME TESTS FAILED ⚠️{Colors.RESET}")
            print(f"{Colors.RED}{'='*80}{Colors.RESET}")

if __name__ == "__main__":
    runner = TestRunner()
    runner.run_all_tests()
