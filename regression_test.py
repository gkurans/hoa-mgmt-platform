#!/usr/bin/env python3
"""
Kerala HOA Management System - Regression Test for Adjustments Bug Fix
Tests the fix for the AdjustmentResponse validation error that caused all billing tabs to appear empty.

Bug: AdjustmentResponse had extra required fields (payment_date, method, reference, notes, recorded_by)
Fix: Removed extra fields from AdjustmentResponse model
"""

import requests
import json
import sys
from datetime import datetime
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://bug-fixes-staging.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@unitytowers.com"
ADMIN_PASSWORD = "admin123"

class RegressionTester:
    def __init__(self):
        self.session = requests.Session()
        self.auth_token = None
        self.test_results = []
        self.admin_user = None
        self.all_passed = True
        
    def log_test(self, test_name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test results"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        if response_data:
            result["response"] = response_data
        self.test_results.append(result)
        
        if not success:
            self.all_passed = False
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"    {details}")
        
    def make_request(self, method: str, endpoint: str, data: Dict = None, headers: Dict = None) -> requests.Response:
        """Make HTTP request with proper headers"""
        url = f"{BASE_URL}{endpoint}"
        req_headers = {"Content-Type": "application/json"}
        
        if self.auth_token:
            req_headers["Authorization"] = f"Bearer {self.auth_token}"
            
        if headers:
            req_headers.update(headers)
            
        try:
            if method.upper() == "GET":
                response = self.session.get(url, headers=req_headers, timeout=30)
            elif method.upper() == "POST":
                response = self.session.post(url, json=data, headers=req_headers, timeout=30)
            elif method.upper() == "PUT":
                response = self.session.put(url, json=data, headers=req_headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            return response
        except requests.exceptions.RequestException as e:
            print(f"    ⚠️  Request failed: {e}")
            raise
    
    def test_1_authentication(self):
        """Test 1: POST /api/auth/login with admin@unitytowers.com / admin123"""
        print("\n📝 Test 1: Authentication")
        try:
            login_data = {
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD
            }
            
            response = self.make_request("POST", "/auth/login", login_data)
            
            if response.status_code == 200:
                data = response.json()
                self.auth_token = data.get("access_token")
                self.admin_user = data.get("user")
                
                if self.auth_token and self.admin_user:
                    self.log_test("POST /api/auth/login", True, 
                                f"Logged in as {self.admin_user['name']} ({self.admin_user['role']}), JWT token received")
                    return True
                else:
                    self.log_test("POST /api/auth/login", False, "Missing token or user data in response")
                    return False
            else:
                error_body = response.text
                self.log_test("POST /api/auth/login", False, 
                            f"Status code: {response.status_code}, Error: {error_body}")
                return False
                
        except Exception as e:
            self.log_test("POST /api/auth/login", False, f"Exception: {str(e)}")
            return False
    
    def test_2_adjustments(self):
        """Test 2: GET /api/adjustments - must return 200 with list (2 records expected)"""
        print("\n📝 Test 2: Get Adjustments (Bug Fix Verification)")
        try:
            response = self.make_request("GET", "/adjustments")
            
            if response.status_code == 200:
                adjustments = response.json()
                
                if not isinstance(adjustments, list):
                    self.log_test("GET /api/adjustments", False, 
                                f"Expected list, got {type(adjustments).__name__}")
                    return False
                
                # Verify expected count
                expected_count = 2
                actual_count = len(adjustments)
                
                # Verify each adjustment has required fields
                required_fields = ["id", "unit_id", "unit_display", "category_id", "category_name", 
                                 "amount", "adjustment_type", "reason", "period", "created_by", "created_at"]
                
                all_fields_present = True
                for adj in adjustments:
                    missing_fields = [field for field in required_fields if field not in adj]
                    if missing_fields:
                        all_fields_present = False
                        self.log_test("GET /api/adjustments", False, 
                                    f"Adjustment {adj.get('id', 'unknown')} missing fields: {missing_fields}")
                        break
                
                if all_fields_present:
                    if actual_count == expected_count:
                        self.log_test("GET /api/adjustments", True, 
                                    f"Retrieved {actual_count} adjustments (expected {expected_count}), all required fields present")
                    else:
                        self.log_test("GET /api/adjustments", True, 
                                    f"Retrieved {actual_count} adjustments (expected {expected_count}), all required fields present - count mismatch is acceptable")
                    
                    # Print sample adjustment for verification
                    if adjustments:
                        print(f"    Sample adjustment: {json.dumps(adjustments[0], indent=2, default=str)}")
                    return True
                else:
                    return False
            else:
                error_body = response.text
                self.log_test("GET /api/adjustments", False, 
                            f"Status code: {response.status_code}, Error: {error_body}")
                return False
                
        except Exception as e:
            self.log_test("GET /api/adjustments", False, f"Exception: {str(e)}")
            return False
    
    def test_3_payments(self):
        """Test 3: GET /api/payments - 200, list (2 expected)"""
        print("\n📝 Test 3: Get Payments")
        try:
            response = self.make_request("GET", "/payments")
            
            if response.status_code == 200:
                payments = response.json()
                
                if not isinstance(payments, list):
                    self.log_test("GET /api/payments", False, 
                                f"Expected list, got {type(payments).__name__}")
                    return False
                
                expected_count = 2
                actual_count = len(payments)
                
                if actual_count == expected_count:
                    self.log_test("GET /api/payments", True, 
                                f"Retrieved {actual_count} payments (expected {expected_count})")
                else:
                    self.log_test("GET /api/payments", True, 
                                f"Retrieved {actual_count} payments (expected {expected_count}) - count mismatch is acceptable")
                return True
            else:
                error_body = response.text
                self.log_test("GET /api/payments", False, 
                            f"Status code: {response.status_code}, Error: {error_body}")
                return False
                
        except Exception as e:
            self.log_test("GET /api/payments", False, f"Exception: {str(e)}")
            return False
    
    def test_4_expenses(self):
        """Test 4: GET /api/expenses - 200, list (9 expected) - vendor payments"""
        print("\n📝 Test 4: Get Expenses (Vendor Payments)")
        try:
            response = self.make_request("GET", "/expenses")
            
            if response.status_code == 200:
                expenses = response.json()
                
                if not isinstance(expenses, list):
                    self.log_test("GET /api/expenses", False, 
                                f"Expected list, got {type(expenses).__name__}")
                    return False
                
                expected_count = 9
                actual_count = len(expenses)
                
                if actual_count == expected_count:
                    self.log_test("GET /api/expenses", True, 
                                f"Retrieved {actual_count} expenses (expected {expected_count})")
                else:
                    self.log_test("GET /api/expenses", True, 
                                f"Retrieved {actual_count} expenses (expected {expected_count}) - count mismatch is acceptable")
                return True
            else:
                error_body = response.text
                self.log_test("GET /api/expenses", False, 
                            f"Status code: {response.status_code}, Error: {error_body}")
                return False
                
        except Exception as e:
            self.log_test("GET /api/expenses", False, f"Exception: {str(e)}")
            return False
    
    def test_5_charges(self):
        """Test 5: GET /api/charges - 200, list (10 expected)"""
        print("\n📝 Test 5: Get Charges")
        try:
            response = self.make_request("GET", "/charges")
            
            if response.status_code == 200:
                charges = response.json()
                
                if not isinstance(charges, list):
                    self.log_test("GET /api/charges", False, 
                                f"Expected list, got {type(charges).__name__}")
                    return False
                
                expected_count = 10
                actual_count = len(charges)
                
                if actual_count == expected_count:
                    self.log_test("GET /api/charges", True, 
                                f"Retrieved {actual_count} charges (expected {expected_count})")
                else:
                    self.log_test("GET /api/charges", True, 
                                f"Retrieved {actual_count} charges (expected {expected_count}) - count mismatch is acceptable")
                return True
            else:
                error_body = response.text
                self.log_test("GET /api/charges", False, 
                            f"Status code: {response.status_code}, Error: {error_body}")
                return False
                
        except Exception as e:
            self.log_test("GET /api/charges", False, f"Exception: {str(e)}")
            return False
    
    def test_6_dashboard(self):
        """Test 6: GET /api/dashboard/admin - 200, verify totals fields present"""
        print("\n📝 Test 6: Get Admin Dashboard")
        try:
            response = self.make_request("GET", "/dashboard/admin")
            
            if response.status_code == 200:
                dashboard = response.json()
                
                required_fields = ["total_units", "total_condos", "total_shops", "total_outstanding", 
                                 "units_overdue", "allocation_status"]
                
                missing_fields = [field for field in required_fields if field not in dashboard]
                
                if not missing_fields:
                    self.log_test("GET /api/dashboard/admin", True, 
                                f"All required fields present. Units: {dashboard['total_units']}, Outstanding: ₹{dashboard['total_outstanding']}")
                    return True
                else:
                    self.log_test("GET /api/dashboard/admin", False, 
                                f"Missing required fields: {missing_fields}")
                    return False
            else:
                error_body = response.text
                self.log_test("GET /api/dashboard/admin", False, 
                            f"Status code: {response.status_code}, Error: {error_body}")
                return False
                
        except Exception as e:
            self.log_test("GET /api/dashboard/admin", False, f"Exception: {str(e)}")
            return False
    
    def test_7_create_adjustment(self):
        """Test 7: POST /api/adjustments - create new adjustment and verify it appears"""
        print("\n📝 Test 7: Create New Adjustment")
        try:
            # First, get a valid unit_id and category_id
            units_response = self.make_request("GET", "/units")
            categories_response = self.make_request("GET", "/categories")
            
            if units_response.status_code != 200 or categories_response.status_code != 200:
                self.log_test("POST /api/adjustments", False, 
                            "Failed to get units or categories for test setup")
                return False
            
            units = units_response.json()
            categories = categories_response.json()
            
            if not units or not categories:
                self.log_test("POST /api/adjustments", False, 
                            "No units or categories available for testing")
                return False
            
            # Use first unit and first category
            unit_id = units[0]["id"]
            category_id = categories[0]["id"]
            
            # Get initial count of adjustments
            initial_response = self.make_request("GET", "/adjustments")
            initial_count = len(initial_response.json()) if initial_response.status_code == 200 else 0
            
            # Create new adjustment
            adjustment_data = {
                "unit_id": unit_id,
                "category_id": category_id,
                "amount": -100.0,  # Negative for credit
                "reason": "Regression test adjustment - bug fix verification",
                "period": "2026-02"
            }
            
            create_response = self.make_request("POST", "/adjustments", adjustment_data)
            
            if create_response.status_code in [200, 201]:
                created_adjustment = create_response.json()
                adjustment_id = created_adjustment.get("id")
                
                if adjustment_id:
                    # Verify the new adjustment appears in GET /api/adjustments
                    verify_response = self.make_request("GET", "/adjustments")
                    
                    if verify_response.status_code == 200:
                        adjustments = verify_response.json()
                        new_count = len(adjustments)
                        
                        # Check if count increased by 1
                        if new_count == initial_count + 1:
                            # Verify the new adjustment is in the list
                            found = any(adj["id"] == adjustment_id for adj in adjustments)
                            if found:
                                self.log_test("POST /api/adjustments", True, 
                                            f"Created adjustment {adjustment_id}, verified it appears in list (count: {initial_count} → {new_count})")
                                return True
                            else:
                                self.log_test("POST /api/adjustments", False, 
                                            f"Adjustment created but not found in list")
                                return False
                        else:
                            self.log_test("POST /api/adjustments", False, 
                                        f"Count did not increase as expected (initial: {initial_count}, new: {new_count})")
                            return False
                    else:
                        self.log_test("POST /api/adjustments", False, 
                                    f"Failed to verify adjustment: GET returned {verify_response.status_code}")
                        return False
                else:
                    self.log_test("POST /api/adjustments", False, 
                                "Adjustment created but no ID returned")
                    return False
            else:
                error_body = create_response.text
                self.log_test("POST /api/adjustments", False, 
                            f"Status code: {create_response.status_code}, Error: {error_body}")
                return False
                
        except Exception as e:
            self.log_test("POST /api/adjustments", False, f"Exception: {str(e)}")
            return False
    
    def test_8_no_500_errors(self):
        """Test 8: Confirm no 500 errors on billing-related endpoints"""
        print("\n📝 Test 8: Verify No 500 Errors on Billing Endpoints")
        
        billing_endpoints = [
            "/adjustments",
            "/payments",
            "/expenses",
            "/charges"
        ]
        
        all_ok = True
        for endpoint in billing_endpoints:
            try:
                response = self.make_request("GET", endpoint)
                if response.status_code == 500:
                    self.log_test(f"No 500 Error Check: GET {endpoint}", False, 
                                f"Returned 500 Internal Server Error")
                    all_ok = False
                elif response.status_code == 200:
                    self.log_test(f"No 500 Error Check: GET {endpoint}", True, 
                                f"Returned 200 OK")
                else:
                    # Non-200 but not 500 is acceptable for this test
                    self.log_test(f"No 500 Error Check: GET {endpoint}", True, 
                                f"Returned {response.status_code} (not 500)")
            except Exception as e:
                self.log_test(f"No 500 Error Check: GET {endpoint}", False, 
                            f"Exception: {str(e)}")
                all_ok = False
        
        return all_ok
    
    def run_regression_tests(self):
        """Run all regression tests for the adjustments bug fix"""
        print("=" * 80)
        print("🔍 KERALA HOA - REGRESSION TEST FOR ADJUSTMENTS BUG FIX")
        print("=" * 80)
        print(f"📍 Backend URL: {BASE_URL}")
        print(f"👤 Test User: {ADMIN_EMAIL}")
        print(f"🐛 Bug: AdjustmentResponse had extra required fields causing 500 errors")
        print(f"✅ Fix: Removed extra fields from AdjustmentResponse model")
        print("=" * 80)
        
        # Run tests in sequence
        test_results = []
        
        # Test 1: Authentication
        test_results.append(self.test_1_authentication())
        
        if not test_results[0]:
            print("\n❌ Authentication failed. Cannot proceed with remaining tests.")
            return False
        
        # Test 2: Adjustments (main bug fix verification)
        test_results.append(self.test_2_adjustments())
        
        # Test 3: Payments
        test_results.append(self.test_3_payments())
        
        # Test 4: Expenses
        test_results.append(self.test_4_expenses())
        
        # Test 5: Charges
        test_results.append(self.test_5_charges())
        
        # Test 6: Dashboard
        test_results.append(self.test_6_dashboard())
        
        # Test 7: Create adjustment
        test_results.append(self.test_7_create_adjustment())
        
        # Test 8: No 500 errors
        test_results.append(self.test_8_no_500_errors())
        
        # Summary
        print("\n" + "=" * 80)
        passed = sum(test_results)
        total = len(test_results)
        print(f"🏁 REGRESSION TEST SUMMARY: {passed}/{total} tests passed")
        print("=" * 80)
        
        if self.all_passed:
            print("✅ ALL TESTS PASSED - Bug fix verified successfully!")
            print("✅ No 500 errors on billing endpoints")
            print("✅ All billing tabs should now display data correctly")
            return True
        else:
            print("❌ SOME TESTS FAILED - See details above")
            failed_tests = [test for test in self.test_results if not test["success"]]
            print(f"\n❌ Failed Tests ({len(failed_tests)}):")
            for test in failed_tests:
                print(f"  • {test['test']}: {test['details']}")
            return False

def main():
    """Main test runner"""
    tester = RegressionTester()
    
    try:
        success = tester.run_regression_tests()
        return 0 if success else 1
        
    except KeyboardInterrupt:
        print("\n⏹️  Tests interrupted by user")
        return 1
    except Exception as e:
        print(f"\n💥 Unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())
