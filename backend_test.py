#!/usr/bin/env python3
"""
Kerala HOA Management System - Backend API Testing
Tests all backend APIs including authentication, units, billing, payments, and reports
"""

import requests
import json
import sys
from datetime import datetime
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://resident-dashboard-5.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@keralahoa.com"
ADMIN_PASSWORD = "admin123"

class APITester:
    def __init__(self):
        self.session = requests.Session()
        self.auth_token = None
        self.test_results = []
        self.admin_user = None
        
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
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {details}")
        
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
            print(f"Request failed: {e}")
            raise
    
    def test_health_check(self):
        """Test health check endpoint"""
        try:
            response = self.make_request("GET", "/health")
            if response.status_code == 200:
                data = response.json()
                self.log_test("Health Check", True, f"Status: {data.get('status')}")
                return True
            else:
                self.log_test("Health Check", False, f"Status code: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Health Check", False, f"Exception: {str(e)}")
            return False
    
    def test_seed_data(self):
        """Test seed data endpoint"""
        try:
            response = self.make_request("POST", "/seed")
            if response.status_code == 200:
                data = response.json()
                self.log_test("Seed Data", True, data.get("message", ""))
                return True
            else:
                self.log_test("Seed Data", False, f"Status code: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("Seed Data", False, f"Exception: {str(e)}")
            return False
    
    def test_authentication(self):
        """Test authentication endpoints"""
        # Test login with admin credentials
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
                    self.log_test("Admin Login", True, f"Logged in as {self.admin_user['name']} ({self.admin_user['role']})")
                    
                    # Test /auth/me endpoint
                    me_response = self.make_request("GET", "/auth/me")
                    if me_response.status_code == 200:
                        me_data = me_response.json()
                        self.log_test("Get Current User", True, f"User: {me_data['name']}, Role: {me_data['role']}")
                        return True
                    else:
                        self.log_test("Get Current User", False, f"Status code: {me_response.status_code}")
                        return False
                else:
                    self.log_test("Admin Login", False, "Missing token or user data")
                    return False
            else:
                self.log_test("Admin Login", False, f"Status code: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Authentication", False, f"Exception: {str(e)}")
            return False
    
    def test_units_management(self):
        """Test unit management endpoints"""
        try:
            # Test GET /units
            response = self.make_request("GET", "/units")
            if response.status_code == 200:
                units = response.json()
                
                # Verify we have 8 units (5 condos + 3 shops)
                condos = [u for u in units if u["unit_type"] == "condo"]
                shops = [u for u in units if u["unit_type"] == "shop"]
                
                if len(units) == 8 and len(condos) == 5 and len(shops) == 3:
                    self.log_test("Get Units", True, f"Found {len(units)} units: {len(condos)} condos, {len(shops)} shops")
                    
                    # Test GET single unit
                    if units:
                        unit_id = units[0]["id"]
                        unit_response = self.make_request("GET", f"/units/{unit_id}")
                        if unit_response.status_code == 200:
                            unit_data = unit_response.json()
                            self.log_test("Get Single Unit", True, f"Unit: {unit_data['display_name']}")
                            return True, units
                        else:
                            self.log_test("Get Single Unit", False, f"Status code: {unit_response.status_code}")
                            return False, units
                else:
                    self.log_test("Get Units", False, f"Expected 8 units (5 condos, 3 shops), got {len(units)} units ({len(condos)} condos, {len(shops)} shops)")
                    return False, units
            else:
                self.log_test("Get Units", False, f"Status code: {response.status_code}")
                return False, []
                
        except Exception as e:
            self.log_test("Units Management", False, f"Exception: {str(e)}")
            return False, []
    
    def test_billing_workflow(self):
        """Test complete billing workflow"""
        try:
            # Step 1: Create annual setup for 2026 with W=50000, E=100000
            setup_data = {
                "year": 2026,
                "water_total": 50000.0,
                "electricity_total": 100000.0,
                "notes": "Test annual setup for 2026"
            }
            
            response = self.make_request("POST", "/billing/annual-setup", setup_data)
            
            if response.status_code == 200:
                setup = response.json()
                setup_id = setup["id"]
                
                # Verify formula calculations
                expected_condo = 25500.0  # W/5 + 0.40E/5 + 0.60E/8 = 10000 + 8000 + 7500 = 25500
                expected_shop = 7500.0    # 0.60E/8 = 0.60*100000/8 = 7500
                
                if (abs(setup["condo_annual_share"] - expected_condo) < 0.01 and 
                    abs(setup["shop_annual_share"] - expected_shop) < 0.01):
                    self.log_test("Annual Setup Creation", True, 
                                f"Formula correct: Condo={setup['condo_annual_share']}, Shop={setup['shop_annual_share']}")
                    
                    # Step 2: Approve the setup
                    approve_response = self.make_request("POST", f"/billing/annual-setup/{setup_id}/approve")
                    if approve_response.status_code == 200:
                        self.log_test("Annual Setup Approval", True, "Setup approved successfully")
                        
                        # Step 3: Post charges to units
                        post_response = self.make_request("POST", f"/billing/annual-setup/{setup_id}/post")
                        if post_response.status_code == 200:
                            post_data = post_response.json()
                            charges_created = post_data.get("charges_created", 0)
                            
                            if charges_created == 8:  # Should create 8 charges (one per unit)
                                self.log_test("Post Annual Charges", True, f"Created {charges_created} charges")
                                return True, setup_id
                            else:
                                self.log_test("Post Annual Charges", False, f"Expected 8 charges, got {charges_created}")
                                return False, setup_id
                        else:
                            self.log_test("Post Annual Charges", False, f"Status code: {post_response.status_code}")
                            return False, setup_id
                    else:
                        self.log_test("Annual Setup Approval", False, f"Status code: {approve_response.status_code}")
                        return False, setup_id
                else:
                    self.log_test("Annual Setup Creation", False, 
                                f"Formula incorrect: Expected Condo=25500, Shop=7500, Got Condo={setup['condo_annual_share']}, Shop={setup['shop_annual_share']}")
                    return False, setup_id
            elif response.status_code == 400:
                # Setup might already exist, try to get existing setups
                get_response = self.make_request("GET", "/billing/annual-setup")
                if get_response.status_code == 200:
                    setups = get_response.json()
                    setup_2026 = next((s for s in setups if s["year"] == 2026), None)
                    if setup_2026:
                        self.log_test("Annual Setup Creation", True, "2026 setup already exists, using existing")
                        return True, setup_2026["id"]
                
                self.log_test("Annual Setup Creation", False, f"Status code: {response.status_code}, Response: {response.text}")
                return False, None
            else:
                self.log_test("Annual Setup Creation", False, f"Status code: {response.status_code}")
                return False, None
                
        except Exception as e:
            self.log_test("Billing Workflow", False, f"Exception: {str(e)}")
            return False, None
    
    def test_payments(self, units):
        """Test payment recording"""
        if not units:
            self.log_test("Payment Testing", False, "No units available for testing")
            return False
            
        try:
            # Record a payment for the first condo unit
            condo_unit = next((u for u in units if u["unit_type"] == "condo"), None)
            if not condo_unit:
                self.log_test("Payment Testing", False, "No condo unit found")
                return False
            
            payment_data = {
                "unit_id": condo_unit["id"],
                "amount": 10000.0,
                "payment_date": "2026-01-15",
                "method": "upi",
                "reference": "UPI123456789",
                "notes": "Test payment for unit " + condo_unit["unit_id"]
            }
            
            response = self.make_request("POST", "/payments", payment_data)
            
            if response.status_code == 200:
                payment = response.json()
                self.log_test("Payment Recording", True, 
                            f"Recorded ₹{payment['amount']} for {payment['unit_display']}")
                
                # Verify payment appears in GET /payments
                get_response = self.make_request("GET", "/payments")
                if get_response.status_code == 200:
                    payments = get_response.json()
                    test_payment = next((p for p in payments if p["id"] == payment["id"]), None)
                    if test_payment:
                        self.log_test("Payment Retrieval", True, "Payment found in payments list")
                        return True
                    else:
                        self.log_test("Payment Retrieval", False, "Payment not found in payments list")
                        return False
                else:
                    self.log_test("Payment Retrieval", False, f"Status code: {get_response.status_code}")
                    return False
            else:
                self.log_test("Payment Recording", False, f"Status code: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Payment Testing", False, f"Exception: {str(e)}")
            return False
    
    def test_reports(self):
        """Test reports endpoints"""
        try:
            # Test true-up report for 2026
            response = self.make_request("GET", "/reports/true-up/2026")
            
            if response.status_code == 200:
                report = response.json()
                
                if "items" in report and "year" in report:
                    items_count = len(report["items"])
                    total_outstanding = report.get("total_outstanding", 0)
                    
                    self.log_test("True-Up Report", True, 
                                f"Generated report for {report['year']} with {items_count} units, Outstanding: ₹{total_outstanding}")
                    return True
                else:
                    self.log_test("True-Up Report", False, "Invalid report structure")
                    return False
            else:
                self.log_test("True-Up Report", False, f"Status code: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Reports Testing", False, f"Exception: {str(e)}")
            return False
    
    def test_dashboard(self):
        """Test dashboard endpoints"""
        try:
            # Test admin dashboard
            response = self.make_request("GET", "/dashboard/admin")
            
            if response.status_code == 200:
                dashboard = response.json()
                
                required_fields = ["total_units", "total_condos", "total_shops", "total_outstanding", "allocation_status"]
                missing_fields = [field for field in required_fields if field not in dashboard]
                
                if not missing_fields:
                    self.log_test("Admin Dashboard", True, 
                                f"Units: {dashboard['total_units']} ({dashboard['total_condos']} condos, {dashboard['total_shops']} shops), Outstanding: ₹{dashboard['total_outstanding']}")
                    return True
                else:
                    self.log_test("Admin Dashboard", False, f"Missing fields: {missing_fields}")
                    return False
            else:
                self.log_test("Admin Dashboard", False, f"Status code: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Dashboard Testing", False, f"Exception: {str(e)}")
            return False
    
    def test_charges(self):
        """Test charges endpoints"""
        try:
            response = self.make_request("GET", "/charges")
            
            if response.status_code == 200:
                charges = response.json()
                self.log_test("Get Charges", True, f"Retrieved {len(charges)} charges")
                return True
            else:
                self.log_test("Get Charges", False, f"Status code: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Charges Testing", False, f"Exception: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all backend API tests"""
        print("🚀 Starting Kerala HOA Backend API Tests")
        print(f"📍 Testing against: {BASE_URL}")
        print("=" * 60)
        
        # Test sequence
        tests_passed = 0
        total_tests = 0
        
        # 1. Health check
        if self.test_health_check():
            tests_passed += 1
        total_tests += 1
        
        # 2. Seed data
        if self.test_seed_data():
            tests_passed += 1
        total_tests += 1
        
        # 3. Authentication
        if self.test_authentication():
            tests_passed += 1
        total_tests += 1
        
        # 4. Units management
        units_success, units = self.test_units_management()
        if units_success:
            tests_passed += 1
        total_tests += 1
        
        # 5. Billing workflow
        billing_success, setup_id = self.test_billing_workflow()
        if billing_success:
            tests_passed += 1
        total_tests += 1
        
        # 6. Payments
        if self.test_payments(units):
            tests_passed += 1
        total_tests += 1
        
        # 7. Charges
        if self.test_charges():
            tests_passed += 1
        total_tests += 1
        
        # 8. Reports
        if self.test_reports():
            tests_passed += 1
        total_tests += 1
        
        # 9. Dashboard
        if self.test_dashboard():
            tests_passed += 1
        total_tests += 1
        
        # Summary
        print("\n" + "=" * 60)
        print(f"🏁 Test Summary: {tests_passed}/{total_tests} tests passed")
        
        if tests_passed == total_tests:
            print("🎉 All tests passed! Backend APIs are working correctly.")
            return True
        else:
            print(f"⚠️  {total_tests - tests_passed} tests failed. Check the details above.")
            return False
    
    def get_failed_tests(self):
        """Get list of failed tests"""
        return [test for test in self.test_results if not test["success"]]

def main():
    """Main test runner"""
    tester = APITester()
    
    try:
        success = tester.run_all_tests()
        
        # Print failed tests details
        failed_tests = tester.get_failed_tests()
        if failed_tests:
            print("\n❌ Failed Tests Details:")
            for test in failed_tests:
                print(f"  - {test['test']}: {test['details']}")
        
        return 0 if success else 1
        
    except KeyboardInterrupt:
        print("\n⏹️  Tests interrupted by user")
        return 1
    except Exception as e:
        print(f"\n💥 Unexpected error: {str(e)}")
        return 1

if __name__ == "__main__":
    sys.exit(main())