#!/usr/bin/env python3
"""
Backend API Test Suite for Kerala HOA Management System
Testing True-Up Report Bug Fix (Unit 2A Adjustment Reconciliation)
"""

import requests
import json
from typing import Dict, List, Optional

# Backend URL from frontend/.env
BASE_URL = "https://bug-fixes-staging.preview.emergentagent.com/api"

# Test credentials from review request
ADMIN_EMAIL = "admin@unitytowers.com"
ADMIN_PASSWORD = "admin123"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'

def print_success(msg: str):
    print(f"{Colors.GREEN}✅ {msg}{Colors.RESET}")

def print_error(msg: str):
    print(f"{Colors.RED}❌ {msg}{Colors.RESET}")

def print_warning(msg: str):
    print(f"{Colors.YELLOW}⚠️  {msg}{Colors.RESET}")

def print_info(msg: str):
    print(f"{Colors.BLUE}ℹ️  {msg}{Colors.RESET}")

class TestSession:
    def __init__(self):
        self.token: Optional[str] = None
        self.headers: Dict[str, str] = {}
        self.test_results = {
            "passed": 0,
            "failed": 0,
            "warnings": 0
        }
    
    def login(self) -> bool:
        """Authenticate and get JWT token"""
        print_info("Authenticating with admin credentials...")
        try:
            response = requests.post(
                f"{BASE_URL}/auth/login",
                json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                self.token = data.get("access_token")
                self.headers = {"Authorization": f"Bearer {self.token}"}
                print_success(f"Authentication successful (admin: {ADMIN_EMAIL})")
                return True
            else:
                print_error(f"Login failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print_error(f"Login error: {str(e)}")
            return False
    
    def test_true_up_report_reconciliation(self) -> bool:
        """
        Test 1: GET /api/reports/true-up/2026
        Verify RECONCILIATION: each unit's net_balance must equal current_balance
        Specifically confirm Unit 2A net_balance == 8530.405
        """
        print_info("\n" + "="*80)
        print_info("TEST 1: True-Up Report Reconciliation (Bug Fix Verification)")
        print_info("="*80)
        
        try:
            # Get True-Up Report for 2026
            print_info("Fetching True-Up Report for 2026...")
            report_response = requests.get(
                f"{BASE_URL}/reports/true-up/2026",
                headers=self.headers,
                timeout=10
            )
            
            if report_response.status_code != 200:
                print_error(f"True-Up Report failed: {report_response.status_code} - {report_response.text}")
                self.test_results["failed"] += 1
                return False
            
            report_data = report_response.json()
            print_success(f"True-Up Report retrieved successfully")
            
            # Get all units to compare current_balance
            print_info("Fetching all units for balance comparison...")
            units_response = requests.get(
                f"{BASE_URL}/units",
                headers=self.headers,
                timeout=10
            )
            
            if units_response.status_code != 200:
                print_error(f"Units fetch failed: {units_response.status_code} - {units_response.text}")
                self.test_results["failed"] += 1
                return False
            
            units_data = units_response.json()
            print_success(f"Units data retrieved ({len(units_data)} units)")
            
            # Create a mapping of unit_id to current_balance
            unit_balances = {}
            for unit in units_data:
                unit_balances[unit["unit_id"]] = unit["current_balance"]
            
            # Verify reconciliation for each unit
            print_info("\nReconciliation Check (net_balance vs current_balance):")
            print_info("-" * 80)
            
            all_reconciled = True
            unit_2a_found = False
            unit_2a_reconciled = False
            tolerance = 0.01
            
            for item in report_data["items"]:
                unit_id = item["unit_id"]
                net_balance = item["net_balance"]
                current_balance = unit_balances.get(unit_id)
                
                if current_balance is None:
                    print_error(f"Unit {unit_id}: No current_balance found in units data")
                    all_reconciled = False
                    continue
                
                # Check reconciliation within tolerance
                difference = abs(net_balance - current_balance)
                reconciled = difference <= tolerance
                
                # Special check for Unit 2A
                if unit_id == "2A":
                    unit_2a_found = True
                    unit_2a_reconciled = reconciled
                    
                    print_info(f"\n🎯 UNIT 2A (Bug Fix Target):")
                    print_info(f"   Display Name: {item['unit_display']}")
                    print_info(f"   Net Balance (Report): ₹{net_balance:,.2f}")
                    print_info(f"   Current Balance (Unit): ₹{current_balance:,.2f}")
                    print_info(f"   Difference: ₹{difference:,.4f}")
                    print_info(f"   Expected Net Balance: ₹8530.405")
                    
                    # Verify Unit 2A specific value
                    expected_2a_balance = 8530.405
                    if abs(net_balance - expected_2a_balance) <= tolerance:
                        print_success(f"   ✓ Unit 2A net_balance matches expected value (8530.405)")
                    else:
                        print_error(f"   ✗ Unit 2A net_balance {net_balance} != expected {expected_2a_balance}")
                        all_reconciled = False
                    
                    if reconciled:
                        print_success(f"   ✓ Unit 2A RECONCILED (adjustments now included in report)")
                    else:
                        print_error(f"   ✗ Unit 2A NOT RECONCILED (difference: ₹{difference:,.4f})")
                        all_reconciled = False
                else:
                    # Other units
                    status_icon = "✓" if reconciled else "✗"
                    status_color = Colors.GREEN if reconciled else Colors.RED
                    print(f"{status_color}{status_icon} Unit {unit_id} ({item['unit_display']}): "
                          f"Report=₹{net_balance:,.2f}, Unit=₹{current_balance:,.2f}, "
                          f"Diff=₹{difference:,.4f}{Colors.RESET}")
                    
                    if not reconciled:
                        all_reconciled = False
            
            print_info("-" * 80)
            
            # Summary
            if not unit_2a_found:
                print_error("Unit 2A not found in report!")
                self.test_results["failed"] += 1
                return False
            
            if all_reconciled and unit_2a_reconciled:
                print_success(f"\n✅ ALL 8 UNITS RECONCILED (net_balance == current_balance within ±₹{tolerance})")
                print_success("✅ Unit 2A bug fix VERIFIED: adjustments now included in True-Up Report")
                self.test_results["passed"] += 1
                return True
            else:
                print_error(f"\n❌ RECONCILIATION FAILED: Some units do not match")
                self.test_results["failed"] += 1
                return False
                
        except Exception as e:
            print_error(f"Test error: {str(e)}")
            self.test_results["failed"] += 1
            return False
    
    def test_report_totals(self) -> bool:
        """
        Test 2: Verify report totals are correct and no errors
        """
        print_info("\n" + "="*80)
        print_info("TEST 2: Report Totals Verification")
        print_info("="*80)
        
        try:
            response = requests.get(
                f"{BASE_URL}/reports/true-up/2026",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code != 200:
                print_error(f"True-Up Report failed: {response.status_code}")
                self.test_results["failed"] += 1
                return False
            
            data = response.json()
            
            # Verify required fields
            required_fields = ["year", "generated_at", "items", "total_outstanding", "total_credits"]
            missing_fields = [f for f in required_fields if f not in data]
            
            if missing_fields:
                print_error(f"Missing required fields: {missing_fields}")
                self.test_results["failed"] += 1
                return False
            
            print_success(f"Report Year: {data['year']}")
            print_success(f"Generated At: {data['generated_at']}")
            print_success(f"Total Units: {len(data['items'])}")
            print_success(f"Total Outstanding: ₹{data['total_outstanding']:,.2f}")
            print_success(f"Total Credits: ₹{data['total_credits']:,.2f}")
            
            # Verify totals calculation
            calculated_outstanding = 0
            calculated_credits = 0
            
            for item in data["items"]:
                if item["net_balance"] > 0:
                    calculated_outstanding += item["net_balance"]
                elif item["net_balance"] < 0:
                    calculated_credits += abs(item["net_balance"])
            
            outstanding_match = abs(data["total_outstanding"] - calculated_outstanding) < 0.01
            credits_match = abs(data["total_credits"] - calculated_credits) < 0.01
            
            if outstanding_match and credits_match:
                print_success("✅ Report totals calculation verified")
                self.test_results["passed"] += 1
                return True
            else:
                print_error(f"Total mismatch - Outstanding: {outstanding_match}, Credits: {credits_match}")
                self.test_results["failed"] += 1
                return False
                
        except Exception as e:
            print_error(f"Test error: {str(e)}")
            self.test_results["failed"] += 1
            return False
    
    def test_regression_endpoints(self) -> bool:
        """
        Test 3: Regression test - verify other endpoints still work
        """
        print_info("\n" + "="*80)
        print_info("TEST 3: Regression Testing (Other Endpoints)")
        print_info("="*80)
        
        endpoints = [
            ("/dashboard/admin", "Admin Dashboard"),
            ("/adjustments", "Adjustments"),
            ("/payments", "Payments"),
            ("/expenses", "Expenses"),
            ("/charges", "Charges")
        ]
        
        all_passed = True
        
        for endpoint, name in endpoints:
            try:
                response = requests.get(
                    f"{BASE_URL}{endpoint}",
                    headers=self.headers,
                    timeout=10
                )
                
                if response.status_code == 200:
                    data = response.json()
                    if endpoint == "/dashboard/admin":
                        # Verify dashboard has required fields
                        required = ["total_units", "total_outstanding"]
                        if all(f in data for f in required):
                            print_success(f"{name}: 200 OK (totals present)")
                        else:
                            print_warning(f"{name}: 200 OK but missing some totals")
                            all_passed = False
                    else:
                        # For list endpoints, just verify it's a list
                        if isinstance(data, list):
                            print_success(f"{name}: 200 OK ({len(data)} records)")
                        else:
                            print_success(f"{name}: 200 OK")
                else:
                    print_error(f"{name}: {response.status_code} - {response.text[:100]}")
                    all_passed = False
                    
            except Exception as e:
                print_error(f"{name}: Error - {str(e)}")
                all_passed = False
        
        if all_passed:
            print_success("\n✅ All regression tests passed")
            self.test_results["passed"] += 1
            return True
        else:
            print_error("\n❌ Some regression tests failed")
            self.test_results["failed"] += 1
            return False
    
    def run_all_tests(self):
        """Run all test suites"""
        print_info("\n" + "="*80)
        print_info("KERALA HOA - TRUE-UP REPORT BUG FIX VERIFICATION")
        print_info("Testing Unit 2A Adjustment Reconciliation")
        print_info("="*80)
        
        # Login first
        if not self.login():
            print_error("\n❌ Authentication failed. Cannot proceed with tests.")
            return
        
        # Run tests
        self.test_true_up_report_reconciliation()
        self.test_report_totals()
        self.test_regression_endpoints()
        
        # Print summary
        print_info("\n" + "="*80)
        print_info("TEST SUMMARY")
        print_info("="*80)
        print_success(f"Passed: {self.test_results['passed']}")
        print_error(f"Failed: {self.test_results['failed']}")
        if self.test_results['warnings'] > 0:
            print_warning(f"Warnings: {self.test_results['warnings']}")
        
        total = self.test_results['passed'] + self.test_results['failed']
        if self.test_results['failed'] == 0:
            print_success(f"\n🎉 ALL TESTS PASSED ({self.test_results['passed']}/{total})")
            print_success("✅ Bug fix verified: Unit 2A adjustments now included in True-Up Report")
        else:
            print_error(f"\n❌ SOME TESTS FAILED ({self.test_results['failed']}/{total})")

if __name__ == "__main__":
    session = TestSession()
    session.run_all_tests()
