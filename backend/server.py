from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
import uuid
from datetime import datetime, date
import jwt
import bcrypt
from bson import ObjectId

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'hoa_kerala')]

# JWT Configuration
SECRET_KEY = os.environ.get('JWT_SECRET', 'kerala-hoa-secret-key-2025')
ALGORITHM = "HS256"

# Create the main app
app = FastAPI(title="Kerala HOA Management System")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Security
security = HTTPBearer()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============== MODELS ==============

class PyObjectId(str):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate
    
    @classmethod
    def validate(cls, v, info=None):
        if isinstance(v, ObjectId):
            return str(v)
        if isinstance(v, str):
            return v
        raise ValueError("Invalid ObjectId")

# Auth Models
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    phone: str = ""
    role: Literal["admin", "treasurer", "owner", "auditor"] = "owner"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    phone: str
    role: str
    unit_ids: List[str] = []
    created_at: datetime

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# Unit Models
class UnitCreate(BaseModel):
    unit_id: str  # C1-C5, S1-S3
    unit_type: Literal["condo", "shop"]
    display_name: str
    status: Literal["owned", "vacant", "rented"] = "owned"

class UnitResponse(BaseModel):
    id: str
    unit_id: str
    unit_type: str
    display_name: str
    status: str
    primary_owner_id: Optional[str] = None
    primary_owner_name: Optional[str] = None
    opening_balance: float = 0.0
    current_balance: float = 0.0
    created_at: datetime

class UnitUpdate(BaseModel):
    unit_id: Optional[str] = None
    display_name: Optional[str] = None
    status: Optional[str] = None
    primary_owner_id: Optional[str] = None
    opening_balance: Optional[float] = None

# Owner Management Models
class OwnerCreate(BaseModel):
    email: EmailStr
    name: str
    phone: str = ""
    password: str = ""  # If empty, generate a random one

class OwnerUpdate(BaseModel):
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    phone: Optional[str] = None

# Owner Assignment
class OwnerAssignment(BaseModel):
    owner_id: str
    role: Literal["primary", "joint"] = "primary"

# Category Models
class CategoryCreate(BaseModel):
    name: str
    description: str = ""
    recurring: bool = True
    frequency: Literal["monthly", "quarterly", "annual", "one-time"] = "monthly"
    applies_to: Literal["condos", "shops", "all"] = "all"

class CategoryResponse(BaseModel):
    id: str
    name: str
    description: str
    recurring: bool
    frequency: str
    applies_to: str
    created_at: datetime

# Billing Input Models
class BillInputYearCreate(BaseModel):
    year: int
    water_total: float  # W - Prior Year Total Water Bill
    electricity_total: float  # E - Prior Year Total Electricity Bill
    notes: str = ""

class BillInputYearResponse(BaseModel):
    id: str
    year: int
    water_total: float
    electricity_total: float
    condo_annual_share: float
    shop_annual_share: float
    status: str  # draft, approved, posted
    notes: str
    entered_by: str
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    created_at: datetime

# Charge Models
class ChargeCreate(BaseModel):
    unit_id: str
    category_id: str
    amount: float
    description: str = ""
    due_date: Optional[str] = None  # YYYY-MM-DD
    period: str = ""  # e.g., "2025-01", "2025 Annual"

class ChargeResponse(BaseModel):
    id: str
    unit_id: str
    unit_display: str
    category_id: str
    category_name: str
    amount: float
    description: str
    due_date: Optional[str] = None
    period: str
    source: str  # manual, annual_formula
    status: str  # pending, paid, partial, overdue
    created_at: datetime

# Payment Models
class PaymentCreate(BaseModel):
    unit_id: str
    amount: float
    payment_date: str  # YYYY-MM-DD
    method: Literal["upi", "bank_transfer", "cash", "cheque"] = "upi"
    reference: str = ""
    notes: str = ""
    charge_id: Optional[str] = None  # Link to specific charge
    category_id: Optional[str] = None  # Or link to category

class PaymentResponse(BaseModel):
    id: str
    unit_id: str
    unit_display: str
    amount: float
    payment_date: str
    method: str
    reference: str
    notes: str
    charge_id: Optional[str] = None
    charge_description: Optional[str] = None
    category_name: Optional[str] = None
    recorded_by: str
    created_at: datetime

# Expense (Outgoing Payment to Vendors) Models
class ExpenseCreate(BaseModel):
    vendor_name: str
    category_id: str
    amount: float
    payment_date: str  # YYYY-MM-DD
    description: str = ""
    method: Literal["upi", "bank_transfer", "cash", "cheque"] = "bank_transfer"
    reference: str = ""
    invoice_number: str = ""

class ExpenseResponse(BaseModel):
    id: str
    vendor_name: str
    category_id: str
    category_name: str
    amount: float
    payment_date: str
    description: str
    method: str
    reference: str
    invoice_number: str
    recorded_by: str
    created_at: datetime

# Adjustment Model (for post-posting corrections)
class AdjustmentCreate(BaseModel):
    unit_id: str
    category_id: str
    amount: float  # Positive for debit (add charge), Negative for credit
    reason: str
    period: str = ""

class AdjustmentResponse(BaseModel):
    id: str
    unit_id: str
    unit_display: str
    category_id: str
    category_name: str
    amount: float
    adjustment_type: str  # credit or debit
    reason: str
    period: str
    created_by: str
    created_at: datetime
    payment_date: str
    method: str
    reference: str
    notes: str
    recorded_by: str
    created_at: datetime

# Report Models
class TrueUpReportItem(BaseModel):
    unit_id: str
    unit_display: str
    unit_type: str
    opening_balance: float
    total_assessed: float
    total_paid: float
    net_balance: float
    status: str  # settled, due, credit

class TrueUpReport(BaseModel):
    year: int
    generated_at: datetime
    items: List[TrueUpReportItem]
    total_outstanding: float
    total_credits: float

# Dashboard Models
class AdminDashboard(BaseModel):
    total_units: int
    total_condos: int
    total_shops: int
    total_outstanding: float
    units_overdue: int
    recent_payments: List[dict]
    allocation_status: str

class OwnerDashboard(BaseModel):
    unit_id: str
    unit_display: str
    current_balance: float
    last_payment_date: Optional[str] = None
    last_payment_amount: Optional[float] = None
    recent_charges: List[dict]

# Audit Log
class AuditLog(BaseModel):
    id: str
    entity_type: str
    entity_id: str
    action: str
    old_value: Optional[dict] = None
    new_value: Optional[dict] = None
    performed_by: str
    timestamp: datetime

# ============== AUTH HELPERS ==============

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.utcnow().timestamp() + 86400 * 7  # 7 days
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def require_admin(user: dict = Depends(get_current_user)):
    if user.get("role") not in ["admin", "treasurer"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# ============== AUDIT LOGGING ==============

async def log_audit(entity_type: str, entity_id: str, action: str, 
                   old_value: dict = None, new_value: dict = None, user_id: str = "system"):
    audit = {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "action": action,
        "old_value": old_value,
        "new_value": new_value,
        "performed_by": user_id,
        "timestamp": datetime.utcnow()
    }
    await db.audit_logs.insert_one(audit)

# ============== AUTH ROUTES ==============

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Check if user exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user_doc = {
        "email": user_data.email,
        "password": hash_password(user_data.password),
        "name": user_data.name,
        "phone": user_data.phone,
        "role": user_data.role,
        "unit_ids": [],
        "created_at": datetime.utcnow()
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    
    token = create_token(user_id, user_data.email, user_data.role)
    
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user_id,
            email=user_data.email,
            name=user_data.name,
            phone=user_data.phone,
            role=user_data.role,
            unit_ids=[],
            created_at=user_doc["created_at"]
        )
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    user_id = str(user["_id"])
    token = create_token(user_id, user["email"], user["role"])
    
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user_id,
            email=user["email"],
            name=user["name"],
            phone=user.get("phone", ""),
            role=user["role"],
            unit_ids=user.get("unit_ids", []),
            created_at=user["created_at"]
        )
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(
        id=str(user["_id"]),
        email=user["email"],
        name=user["name"],
        phone=user.get("phone", ""),
        role=user["role"],
        unit_ids=user.get("unit_ids", []),
        created_at=user["created_at"]
    )

# ============== UNIT ROUTES ==============

@api_router.get("/units", response_model=List[UnitResponse])
async def get_units(user: dict = Depends(get_current_user)):
    units = await db.units.find().to_list(100)
    result = []
    for unit in units:
        # Get owner name if assigned
        owner_name = None
        if unit.get("primary_owner_id"):
            owner = await db.users.find_one({"_id": ObjectId(unit["primary_owner_id"])})
            if owner:
                owner_name = owner["name"]
        
        result.append(UnitResponse(
            id=str(unit["_id"]),
            unit_id=unit["unit_id"],
            unit_type=unit["unit_type"],
            display_name=unit["display_name"],
            status=unit["status"],
            primary_owner_id=unit.get("primary_owner_id"),
            primary_owner_name=owner_name,
            opening_balance=unit.get("opening_balance", 0.0),
            current_balance=unit.get("current_balance", 0.0),
            created_at=unit["created_at"]
        ))
    return result

@api_router.get("/units/{unit_id}", response_model=UnitResponse)
async def get_unit(unit_id: str, user: dict = Depends(get_current_user)):
    unit = await db.units.find_one({"_id": ObjectId(unit_id)})
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    owner_name = None
    if unit.get("primary_owner_id"):
        owner = await db.users.find_one({"_id": ObjectId(unit["primary_owner_id"])})
        if owner:
            owner_name = owner["name"]
    
    return UnitResponse(
        id=str(unit["_id"]),
        unit_id=unit["unit_id"],
        unit_type=unit["unit_type"],
        display_name=unit["display_name"],
        status=unit["status"],
        primary_owner_id=unit.get("primary_owner_id"),
        primary_owner_name=owner_name,
        opening_balance=unit.get("opening_balance", 0.0),
        current_balance=unit.get("current_balance", 0.0),
        created_at=unit["created_at"]
    )

@api_router.post("/units", response_model=UnitResponse)
async def create_unit(unit_data: UnitCreate, user: dict = Depends(require_admin)):
    # Check if unit_id exists
    existing = await db.units.find_one({"unit_id": unit_data.unit_id})
    if existing:
        raise HTTPException(status_code=400, detail="Unit ID already exists")
    
    unit_doc = {
        "unit_id": unit_data.unit_id,
        "unit_type": unit_data.unit_type,
        "display_name": unit_data.display_name,
        "status": unit_data.status,
        "primary_owner_id": None,
        "opening_balance": 0.0,
        "current_balance": 0.0,
        "created_at": datetime.utcnow()
    }
    result = await db.units.insert_one(unit_doc)
    
    await log_audit("unit", str(result.inserted_id), "create", None, unit_doc, str(user["_id"]))
    
    return UnitResponse(
        id=str(result.inserted_id),
        **{k: v for k, v in unit_doc.items() if k != "_id"},
        primary_owner_name=None
    )

@api_router.put("/units/{unit_id}", response_model=UnitResponse)
async def update_unit(unit_id: str, update_data: UnitUpdate, user: dict = Depends(require_admin)):
    unit = await db.units.find_one({"_id": ObjectId(unit_id)})
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
    if update_dict:
        await db.units.update_one({"_id": ObjectId(unit_id)}, {"$set": update_dict})
        await log_audit("unit", unit_id, "update", dict(unit), update_dict, str(user["_id"]))
    
    updated = await db.units.find_one({"_id": ObjectId(unit_id)})
    owner_name = None
    if updated.get("primary_owner_id"):
        owner = await db.users.find_one({"_id": ObjectId(updated["primary_owner_id"])})
        if owner:
            owner_name = owner["name"]
    
    return UnitResponse(
        id=str(updated["_id"]),
        unit_id=updated["unit_id"],
        unit_type=updated["unit_type"],
        display_name=updated["display_name"],
        status=updated["status"],
        primary_owner_id=updated.get("primary_owner_id"),
        primary_owner_name=owner_name,
        opening_balance=updated.get("opening_balance", 0.0),
        current_balance=updated.get("current_balance", 0.0),
        created_at=updated["created_at"]
    )

@api_router.post("/units/{unit_id}/assign-owner")
async def assign_owner(unit_id: str, assignment: OwnerAssignment, user: dict = Depends(require_admin)):
    unit = await db.units.find_one({"_id": ObjectId(unit_id)})
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    owner = await db.users.find_one({"_id": ObjectId(assignment.owner_id)})
    if not owner:
        raise HTTPException(status_code=404, detail="Owner not found")
    
    # Update unit
    if assignment.role == "primary":
        await db.units.update_one(
            {"_id": ObjectId(unit_id)},
            {"$set": {"primary_owner_id": assignment.owner_id}}
        )
    
    # Update owner's unit_ids
    if unit_id not in owner.get("unit_ids", []):
        await db.users.update_one(
            {"_id": ObjectId(assignment.owner_id)},
            {"$addToSet": {"unit_ids": unit_id}}
        )
    
    await log_audit("unit", unit_id, "assign_owner", None, {"owner_id": assignment.owner_id}, str(user["_id"]))
    
    return {"message": "Owner assigned successfully"}

# ============== OWNER ROUTES ==============

@api_router.get("/owners", response_model=List[UserResponse])
async def get_owners(user: dict = Depends(require_admin)):
    users = await db.users.find({"role": {"$in": ["owner", "admin", "treasurer"]}}).to_list(100)
    return [
        UserResponse(
            id=str(u["_id"]),
            email=u["email"],
            name=u["name"],
            phone=u.get("phone", ""),
            role=u["role"],
            unit_ids=u.get("unit_ids", []),
            created_at=u["created_at"]
        ) for u in users
    ]

@api_router.post("/owners", response_model=UserResponse)
async def create_owner(owner_data: OwnerCreate, user: dict = Depends(require_admin)):
    """Admin creates a new owner account"""
    # Check if email exists
    existing = await db.users.find_one({"email": owner_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Generate password if not provided
    password = owner_data.password if owner_data.password else "Welcome123"
    
    user_doc = {
        "email": owner_data.email,
        "password": hash_password(password),
        "name": owner_data.name,
        "phone": owner_data.phone,
        "role": "owner",
        "unit_ids": [],
        "created_at": datetime.utcnow()
    }
    result = await db.users.insert_one(user_doc)
    
    await log_audit("owner", str(result.inserted_id), "create", None, {"email": owner_data.email, "name": owner_data.name}, str(user["_id"]))
    
    return UserResponse(
        id=str(result.inserted_id),
        email=owner_data.email,
        name=owner_data.name,
        phone=owner_data.phone,
        role="owner",
        unit_ids=[],
        created_at=user_doc["created_at"]
    )

@api_router.put("/owners/{owner_id}", response_model=UserResponse)
async def update_owner(owner_id: str, update_data: OwnerUpdate, user: dict = Depends(require_admin)):
    """Admin updates an owner's details"""
    owner = await db.users.find_one({"_id": ObjectId(owner_id)})
    if not owner:
        raise HTTPException(status_code=404, detail="Owner not found")
    
    update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
    if update_dict:
        await db.users.update_one({"_id": ObjectId(owner_id)}, {"$set": update_dict})
        await log_audit("owner", owner_id, "update", {"name": owner["name"]}, update_dict, str(user["_id"]))
    
    updated = await db.users.find_one({"_id": ObjectId(owner_id)})
    return UserResponse(
        id=str(updated["_id"]),
        email=updated["email"],
        name=updated["name"],
        phone=updated.get("phone", ""),
        role=updated["role"],
        unit_ids=updated.get("unit_ids", []),
        created_at=updated["created_at"]
    )

@api_router.delete("/owners/{owner_id}")
async def delete_owner(owner_id: str, user: dict = Depends(require_admin)):
    """Admin deletes an owner account"""
    owner = await db.users.find_one({"_id": ObjectId(owner_id)})
    if not owner:
        raise HTTPException(status_code=404, detail="Owner not found")
    
    if owner["role"] == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete admin account")
    
    # Remove owner from any units
    await db.units.update_many(
        {"primary_owner_id": owner_id},
        {"$set": {"primary_owner_id": None}}
    )
    
    await db.users.delete_one({"_id": ObjectId(owner_id)})
    await log_audit("owner", owner_id, "delete", {"email": owner["email"]}, None, str(user["_id"]))
    
    return {"message": "Owner deleted successfully"}

@api_router.post("/owners/{owner_id}/reset-password")
async def reset_owner_password(owner_id: str, user: dict = Depends(require_admin)):
    """Admin resets owner's password to default"""
    owner = await db.users.find_one({"_id": ObjectId(owner_id)})
    if not owner:
        raise HTTPException(status_code=404, detail="Owner not found")
    
    new_password = "Welcome123"
    await db.users.update_one(
        {"_id": ObjectId(owner_id)},
        {"$set": {"password": hash_password(new_password)}}
    )
    
    return {"message": f"Password reset to: {new_password}"}

# ============== CATEGORY ROUTES ==============

@api_router.get("/categories", response_model=List[CategoryResponse])
async def get_categories(user: dict = Depends(get_current_user)):
    categories = await db.categories.find().to_list(100)
    return [
        CategoryResponse(
            id=str(c["_id"]),
            name=c["name"],
            description=c.get("description", ""),
            recurring=c["recurring"],
            frequency=c["frequency"],
            applies_to=c["applies_to"],
            created_at=c["created_at"]
        ) for c in categories
    ]

@api_router.post("/categories", response_model=CategoryResponse)
async def create_category(cat_data: CategoryCreate, user: dict = Depends(require_admin)):
    cat_doc = {
        **cat_data.dict(),
        "created_at": datetime.utcnow()
    }
    result = await db.categories.insert_one(cat_doc)
    
    return CategoryResponse(
        id=str(result.inserted_id),
        **cat_data.dict(),
        created_at=cat_doc["created_at"]
    )

# ============== BILLING & ALLOCATION ROUTES ==============

@api_router.post("/billing/annual-setup", response_model=BillInputYearResponse)
async def create_annual_setup(bill_data: BillInputYearCreate, user: dict = Depends(require_admin)):
    """Enter prior year Water (W) and Electricity (E) totals and calculate annual shares"""
    
    # Check if year already exists
    existing = await db.bill_inputs.find_one({"year": bill_data.year})
    if existing:
        raise HTTPException(status_code=400, detail=f"Annual setup for {bill_data.year} already exists")
    
    W = bill_data.water_total
    E = bill_data.electricity_total
    
    # Calculate shares using Kerala HOA formula
    # Condo Share = W/5 + 0.40E/5 + 0.60E/8
    condo_annual = (W / 5) + (0.40 * E / 5) + (0.60 * E / 8)
    
    # Shop Share = 0.60E/8
    shop_annual = 0.60 * E / 8
    
    bill_doc = {
        "year": bill_data.year,
        "water_total": W,
        "electricity_total": E,
        "condo_annual_share": round(condo_annual, 2),
        "shop_annual_share": round(shop_annual, 2),
        "status": "draft",
        "notes": bill_data.notes,
        "entered_by": str(user["_id"]),
        "approved_by": None,
        "approved_at": None,
        "created_at": datetime.utcnow()
    }
    
    result = await db.bill_inputs.insert_one(bill_doc)
    
    await log_audit("bill_input", str(result.inserted_id), "create", None, bill_doc, str(user["_id"]))
    
    return BillInputYearResponse(
        id=str(result.inserted_id),
        **{k: v for k, v in bill_doc.items() if k not in ["_id", "entered_by"]},
        entered_by=user["name"]
    )

@api_router.get("/billing/annual-setup", response_model=List[BillInputYearResponse])
async def get_annual_setups(user: dict = Depends(get_current_user)):
    setups = await db.bill_inputs.find().sort("year", -1).to_list(100)
    result = []
    for s in setups:
        entered_by_user = await db.users.find_one({"_id": ObjectId(s["entered_by"])})
        result.append(BillInputYearResponse(
            id=str(s["_id"]),
            year=s["year"],
            water_total=s["water_total"],
            electricity_total=s["electricity_total"],
            condo_annual_share=s["condo_annual_share"],
            shop_annual_share=s["shop_annual_share"],
            status=s["status"],
            notes=s.get("notes", ""),
            entered_by=entered_by_user["name"] if entered_by_user else "Unknown",
            approved_by=s.get("approved_by"),
            approved_at=s.get("approved_at"),
            created_at=s["created_at"]
        ))
    return result

@api_router.post("/billing/annual-setup/{setup_id}/approve")
async def approve_annual_setup(setup_id: str, user: dict = Depends(require_admin)):
    """Approve the annual setup"""
    setup = await db.bill_inputs.find_one({"_id": ObjectId(setup_id)})
    if not setup:
        raise HTTPException(status_code=404, detail="Setup not found")
    
    if setup["status"] != "draft":
        raise HTTPException(status_code=400, detail="Setup is not in draft status")
    
    await db.bill_inputs.update_one(
        {"_id": ObjectId(setup_id)},
        {"$set": {
            "status": "approved",
            "approved_by": user["name"],
            "approved_at": datetime.utcnow()
        }}
    )
    
    await log_audit("bill_input", setup_id, "approve", None, {"status": "approved"}, str(user["_id"]))
    
    return {"message": "Annual setup approved successfully"}

class BillInputYearUpdate(BaseModel):
    water_total: Optional[float] = None
    electricity_total: Optional[float] = None
    notes: Optional[str] = None

@api_router.put("/billing/annual-setup/{setup_id}", response_model=BillInputYearResponse)
async def update_annual_setup(setup_id: str, update_data: BillInputYearUpdate, user: dict = Depends(require_admin)):
    """Update an annual setup (only if not posted)"""
    setup = await db.bill_inputs.find_one({"_id": ObjectId(setup_id)})
    if not setup:
        raise HTTPException(status_code=404, detail="Setup not found")
    
    if setup["status"] == "posted":
        raise HTTPException(status_code=400, detail="Cannot edit a posted setup")
    
    update_dict = {}
    W = update_data.water_total if update_data.water_total is not None else setup["water_total"]
    E = update_data.electricity_total if update_data.electricity_total is not None else setup["electricity_total"]
    
    if update_data.water_total is not None or update_data.electricity_total is not None:
        # Recalculate shares
        condo_annual = (W / 5) + (0.40 * E / 5) + (0.60 * E / 8)
        shop_annual = 0.60 * E / 8
        
        update_dict["water_total"] = W
        update_dict["electricity_total"] = E
        update_dict["condo_annual_share"] = round(condo_annual, 2)
        update_dict["shop_annual_share"] = round(shop_annual, 2)
        # Reset to draft if amounts changed
        update_dict["status"] = "draft"
        update_dict["approved_by"] = None
        update_dict["approved_at"] = None
    
    if update_data.notes is not None:
        update_dict["notes"] = update_data.notes
    
    if update_dict:
        await db.bill_inputs.update_one({"_id": ObjectId(setup_id)}, {"$set": update_dict})
        await log_audit("bill_input", setup_id, "update", dict(setup), update_dict, str(user["_id"]))
    
    updated = await db.bill_inputs.find_one({"_id": ObjectId(setup_id)})
    entered_by_user = await db.users.find_one({"_id": ObjectId(updated["entered_by"])})
    
    return BillInputYearResponse(
        id=str(updated["_id"]),
        year=updated["year"],
        water_total=updated["water_total"],
        electricity_total=updated["electricity_total"],
        condo_annual_share=updated["condo_annual_share"],
        shop_annual_share=updated["shop_annual_share"],
        status=updated["status"],
        notes=updated.get("notes", ""),
        entered_by=entered_by_user["name"] if entered_by_user else "Unknown",
        approved_by=updated.get("approved_by"),
        approved_at=updated.get("approved_at"),
        created_at=updated["created_at"]
    )

@api_router.delete("/billing/annual-setup/{setup_id}")
async def delete_annual_setup(setup_id: str, user: dict = Depends(require_admin)):
    """Delete an annual setup (only if not posted)"""
    setup = await db.bill_inputs.find_one({"_id": ObjectId(setup_id)})
    if not setup:
        raise HTTPException(status_code=404, detail="Setup not found")
    
    if setup["status"] == "posted":
        raise HTTPException(status_code=400, detail="Cannot delete a posted setup")
    
    await db.bill_inputs.delete_one({"_id": ObjectId(setup_id)})
    await log_audit("bill_input", setup_id, "delete", {"year": setup["year"]}, None, str(user["_id"]))
    
    return {"message": f"Annual setup for {setup['year']} deleted successfully"}

@api_router.post("/billing/annual-setup/{setup_id}/post")
async def post_annual_charges(setup_id: str, monthly_split: bool = False, user: dict = Depends(require_admin)):
    """Post annual charges to all unit ledgers"""
    setup = await db.bill_inputs.find_one({"_id": ObjectId(setup_id)})
    if not setup:
        raise HTTPException(status_code=404, detail="Setup not found")
    
    if setup["status"] not in ["approved", "draft"]:
        raise HTTPException(status_code=400, detail="Setup must be approved first")
    
    # Get all units
    units = await db.units.find().to_list(100)
    
    # Get or create utility categories
    water_cat = await db.categories.find_one({"name": "Water Utility"})
    if not water_cat:
        result = await db.categories.insert_one({
            "name": "Water Utility",
            "description": "Annual water utility allocation",
            "recurring": True,
            "frequency": "annual",
            "applies_to": "condos",
            "created_at": datetime.utcnow()
        })
        water_cat = await db.categories.find_one({"_id": result.inserted_id})
    
    elec_cat = await db.categories.find_one({"name": "Electricity Utility"})
    if not elec_cat:
        result = await db.categories.insert_one({
            "name": "Electricity Utility",
            "description": "Annual electricity utility allocation",
            "recurring": True,
            "frequency": "annual",
            "applies_to": "all",
            "created_at": datetime.utcnow()
        })
        elec_cat = await db.categories.find_one({"_id": result.inserted_id})
    
    year = setup["year"]
    charges_created = 0
    
    for unit in units:
        if unit["unit_type"] == "condo":
            annual_amount = setup["condo_annual_share"]
        else:
            annual_amount = setup["shop_annual_share"]
        
        if monthly_split:
            # Create 12 monthly charges
            monthly_amount = round(annual_amount / 12, 2)
            for month in range(1, 13):
                charge_doc = {
                    "unit_id": str(unit["_id"]),
                    "category_id": str(elec_cat["_id"]),
                    "amount": monthly_amount,
                    "description": f"Utility charge for {year}-{month:02d}",
                    "due_date": f"{year}-{month:02d}-15",
                    "period": f"{year}-{month:02d}",
                    "source": "annual_formula",
                    "status": "pending",
                    "created_at": datetime.utcnow()
                }
                await db.charges.insert_one(charge_doc)
                charges_created += 1
        else:
            # Create single annual charge
            charge_doc = {
                "unit_id": str(unit["_id"]),
                "category_id": str(elec_cat["_id"]),
                "amount": annual_amount,
                "description": f"Annual utility allocation for {year}",
                "due_date": f"{year}-01-31",
                "period": f"{year} Annual",
                "source": "annual_formula",
                "status": "pending",
                "created_at": datetime.utcnow()
            }
            await db.charges.insert_one(charge_doc)
            charges_created += 1
        
        # Update unit balance
        await db.units.update_one(
            {"_id": unit["_id"]},
            {"$inc": {"current_balance": annual_amount}}
        )
    
    # Update setup status
    await db.bill_inputs.update_one(
        {"_id": ObjectId(setup_id)},
        {"$set": {"status": "posted"}}
    )
    
    await log_audit("bill_input", setup_id, "post", None, {"charges_created": charges_created}, str(user["_id"]))
    
    return {"message": f"Posted {charges_created} charges to unit ledgers", "charges_created": charges_created}

# ============== CHARGES ROUTES ==============

@api_router.get("/charges", response_model=List[ChargeResponse])
async def get_charges(unit_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {}
    
    # If owner, only show their unit's charges
    if user["role"] == "owner":
        user_units = user.get("unit_ids", [])
        if unit_id and unit_id not in user_units:
            raise HTTPException(status_code=403, detail="Access denied")
        query["unit_id"] = {"$in": user_units}
    elif unit_id:
        query["unit_id"] = unit_id
    
    charges = await db.charges.find(query).sort("created_at", -1).to_list(1000)
    result = []
    
    for c in charges:
        unit = await db.units.find_one({"_id": ObjectId(c["unit_id"])})
        category = await db.categories.find_one({"_id": ObjectId(c["category_id"])})
        
        result.append(ChargeResponse(
            id=str(c["_id"]),
            unit_id=c["unit_id"],
            unit_display=unit["display_name"] if unit else "Unknown",
            category_id=c["category_id"],
            category_name=category["name"] if category else "Unknown",
            amount=c["amount"],
            description=c.get("description", ""),
            due_date=c.get("due_date"),
            period=c.get("period", ""),
            source=c.get("source", "manual"),
            status=c.get("status", "pending"),
            created_at=c["created_at"]
        ))
    
    return result

@api_router.post("/charges", response_model=ChargeResponse)
async def create_charge(charge_data: ChargeCreate, user: dict = Depends(require_admin)):
    unit = await db.units.find_one({"_id": ObjectId(charge_data.unit_id)})
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    category = await db.categories.find_one({"_id": ObjectId(charge_data.category_id)})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    charge_doc = {
        "unit_id": charge_data.unit_id,
        "category_id": charge_data.category_id,
        "amount": charge_data.amount,
        "description": charge_data.description,
        "due_date": charge_data.due_date,
        "period": charge_data.period,
        "source": "manual",
        "status": "pending",
        "created_at": datetime.utcnow()
    }
    
    result = await db.charges.insert_one(charge_doc)
    
    # Update unit balance
    await db.units.update_one(
        {"_id": ObjectId(charge_data.unit_id)},
        {"$inc": {"current_balance": charge_data.amount}}
    )
    
    await log_audit("charge", str(result.inserted_id), "create", None, charge_doc, str(user["_id"]))
    
    return ChargeResponse(
        id=str(result.inserted_id),
        unit_id=charge_data.unit_id,
        unit_display=unit["display_name"],
        category_id=charge_data.category_id,
        category_name=category["name"],
        amount=charge_data.amount,
        description=charge_data.description,
        due_date=charge_data.due_date,
        period=charge_data.period,
        source="manual",
        status="pending",
        created_at=charge_doc["created_at"]
    )

# ============== PAYMENTS ROUTES ==============

@api_router.get("/payments", response_model=List[PaymentResponse])
async def get_payments(unit_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {}
    
    if user["role"] == "owner":
        user_units = user.get("unit_ids", [])
        if unit_id and unit_id not in user_units:
            raise HTTPException(status_code=403, detail="Access denied")
        query["unit_id"] = {"$in": user_units}
    elif unit_id:
        query["unit_id"] = unit_id
    
    payments = await db.payments.find(query).sort("created_at", -1).to_list(1000)
    result = []
    
    for p in payments:
        unit = await db.units.find_one({"_id": ObjectId(p["unit_id"])})
        recorded_by = await db.users.find_one({"_id": ObjectId(p["recorded_by"])})
        
        # Get charge and category info if linked
        charge_description = None
        category_name = None
        if p.get("charge_id"):
            charge = await db.charges.find_one({"_id": ObjectId(p["charge_id"])})
            if charge:
                charge_description = charge.get("description", "")
                cat = await db.categories.find_one({"_id": ObjectId(charge["category_id"])})
                if cat:
                    category_name = cat["name"]
        elif p.get("category_id"):
            cat = await db.categories.find_one({"_id": ObjectId(p["category_id"])})
            if cat:
                category_name = cat["name"]
        
        result.append(PaymentResponse(
            id=str(p["_id"]),
            unit_id=p["unit_id"],
            unit_display=unit["display_name"] if unit else "Unknown",
            amount=p["amount"],
            payment_date=p["payment_date"],
            method=p["method"],
            reference=p.get("reference", ""),
            notes=p.get("notes", ""),
            charge_id=p.get("charge_id"),
            charge_description=charge_description,
            category_name=category_name,
            recorded_by=recorded_by["name"] if recorded_by else "Unknown",
            created_at=p["created_at"]
        ))
    
    return result

@api_router.post("/payments", response_model=PaymentResponse)
async def create_payment(payment_data: PaymentCreate, user: dict = Depends(require_admin)):
    unit = await db.units.find_one({"_id": ObjectId(payment_data.unit_id)})
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    # Verify charge if provided
    charge_description = None
    category_name = None
    if payment_data.charge_id:
        charge = await db.charges.find_one({"_id": ObjectId(payment_data.charge_id)})
        if charge:
            charge_description = charge.get("description", "")
            cat = await db.categories.find_one({"_id": ObjectId(charge["category_id"])})
            if cat:
                category_name = cat["name"]
    elif payment_data.category_id:
        cat = await db.categories.find_one({"_id": ObjectId(payment_data.category_id)})
        if cat:
            category_name = cat["name"]
    
    payment_doc = {
        "unit_id": payment_data.unit_id,
        "amount": payment_data.amount,
        "payment_date": payment_data.payment_date,
        "method": payment_data.method,
        "reference": payment_data.reference,
        "notes": payment_data.notes,
        "charge_id": payment_data.charge_id,
        "category_id": payment_data.category_id,
        "recorded_by": str(user["_id"]),
        "created_at": datetime.utcnow()
    }
    
    result = await db.payments.insert_one(payment_doc)
    
    # Update unit balance (reduce)
    await db.units.update_one(
        {"_id": ObjectId(payment_data.unit_id)},
        {"$inc": {"current_balance": -payment_data.amount}}
    )
    
    # If linked to specific charge, update that charge
    if payment_data.charge_id:
        charge = await db.charges.find_one({"_id": ObjectId(payment_data.charge_id)})
        if charge and charge["amount"] <= payment_data.amount:
            await db.charges.update_one({"_id": ObjectId(payment_data.charge_id)}, {"$set": {"status": "paid"}})
        elif charge:
            await db.charges.update_one({"_id": ObjectId(payment_data.charge_id)}, {"$set": {"status": "partial"}})
    else:
        # Mark oldest pending charges as paid
        pending_charges = await db.charges.find({
            "unit_id": payment_data.unit_id,
            "status": "pending"
        }).sort("created_at", 1).to_list(100)
        
        remaining = payment_data.amount
        for charge in pending_charges:
            if remaining <= 0:
                break
            if remaining >= charge["amount"]:
                await db.charges.update_one({"_id": charge["_id"]}, {"$set": {"status": "paid"}})
                remaining -= charge["amount"]
            else:
                await db.charges.update_one({"_id": charge["_id"]}, {"$set": {"status": "partial"}})
                remaining = 0
    
    await log_audit("payment", str(result.inserted_id), "create", None, payment_doc, str(user["_id"]))
    
    return PaymentResponse(
        id=str(result.inserted_id),
        unit_id=payment_data.unit_id,
        unit_display=unit["display_name"],
        amount=payment_data.amount,
        payment_date=payment_data.payment_date,
        method=payment_data.method,
        reference=payment_data.reference,
        notes=payment_data.notes,
        charge_id=payment_data.charge_id,
        charge_description=charge_description,
        category_name=category_name,
        recorded_by=user["name"],
        created_at=payment_doc["created_at"]
    )

# ============== EXPENSES (OUTGOING PAYMENTS TO VENDORS) ==============

@api_router.get("/expenses", response_model=List[ExpenseResponse])
async def get_expenses(user: dict = Depends(require_admin)):
    expenses = await db.expenses.find().sort("created_at", -1).to_list(1000)
    result = []
    
    for e in expenses:
        category = await db.categories.find_one({"_id": ObjectId(e["category_id"])})
        recorded_by = await db.users.find_one({"_id": ObjectId(e["recorded_by"])})
        
        result.append(ExpenseResponse(
            id=str(e["_id"]),
            vendor_name=e["vendor_name"],
            category_id=e["category_id"],
            category_name=category["name"] if category else "Unknown",
            amount=e["amount"],
            payment_date=e["payment_date"],
            description=e.get("description", ""),
            method=e["method"],
            reference=e.get("reference", ""),
            invoice_number=e.get("invoice_number", ""),
            recorded_by=recorded_by["name"] if recorded_by else "Unknown",
            created_at=e["created_at"]
        ))
    
    return result

@api_router.post("/expenses", response_model=ExpenseResponse)
async def create_expense(expense_data: ExpenseCreate, user: dict = Depends(require_admin)):
    """Record an outgoing payment to a vendor"""
    category = await db.categories.find_one({"_id": ObjectId(expense_data.category_id)})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    expense_doc = {
        "vendor_name": expense_data.vendor_name,
        "category_id": expense_data.category_id,
        "amount": expense_data.amount,
        "payment_date": expense_data.payment_date,
        "description": expense_data.description,
        "method": expense_data.method,
        "reference": expense_data.reference,
        "invoice_number": expense_data.invoice_number,
        "recorded_by": str(user["_id"]),
        "created_at": datetime.utcnow()
    }
    
    result = await db.expenses.insert_one(expense_doc)
    
    await log_audit("expense", str(result.inserted_id), "create", None, expense_doc, str(user["_id"]))
    
    return ExpenseResponse(
        id=str(result.inserted_id),
        vendor_name=expense_data.vendor_name,
        category_id=expense_data.category_id,
        category_name=category["name"],
        amount=expense_data.amount,
        payment_date=expense_data.payment_date,
        description=expense_data.description,
        method=expense_data.method,
        reference=expense_data.reference,
        invoice_number=expense_data.invoice_number,
        recorded_by=user["name"],
        created_at=expense_doc["created_at"]
    )

# ============== ADJUSTMENTS (POST-POSTING CORRECTIONS) ==============

@api_router.get("/adjustments", response_model=List[AdjustmentResponse])
async def get_adjustments(unit_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {}
    if unit_id:
        query["unit_id"] = unit_id
    
    adjustments = await db.adjustments.find(query).sort("created_at", -1).to_list(1000)
    result = []
    
    for a in adjustments:
        unit = await db.units.find_one({"_id": ObjectId(a["unit_id"])})
        category = await db.categories.find_one({"_id": ObjectId(a["category_id"])})
        created_by = await db.users.find_one({"_id": ObjectId(a["created_by"])})
        
        result.append(AdjustmentResponse(
            id=str(a["_id"]),
            unit_id=a["unit_id"],
            unit_display=unit["display_name"] if unit else "Unknown",
            category_id=a["category_id"],
            category_name=category["name"] if category else "Unknown",
            amount=a["amount"],
            adjustment_type="credit" if a["amount"] < 0 else "debit",
            reason=a["reason"],
            period=a.get("period", ""),
            created_by=created_by["name"] if created_by else "Unknown",
            created_at=a["created_at"]
        ))
    
    return result

@api_router.post("/adjustments", response_model=AdjustmentResponse)
async def create_adjustment(adjustment_data: AdjustmentCreate, user: dict = Depends(require_admin)):
    """Create an adjustment (credit or debit) for a unit after charges are posted"""
    unit = await db.units.find_one({"_id": ObjectId(adjustment_data.unit_id)})
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    category = await db.categories.find_one({"_id": ObjectId(adjustment_data.category_id)})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    adjustment_doc = {
        "unit_id": adjustment_data.unit_id,
        "category_id": adjustment_data.category_id,
        "amount": adjustment_data.amount,
        "reason": adjustment_data.reason,
        "period": adjustment_data.period,
        "created_by": str(user["_id"]),
        "created_at": datetime.utcnow()
    }
    
    result = await db.adjustments.insert_one(adjustment_doc)
    
    # Update unit balance (positive amount = add to balance, negative = reduce)
    await db.units.update_one(
        {"_id": ObjectId(adjustment_data.unit_id)},
        {"$inc": {"current_balance": adjustment_data.amount}}
    )
    
    # Create a corresponding charge record for audit trail
    charge_doc = {
        "unit_id": adjustment_data.unit_id,
        "category_id": adjustment_data.category_id,
        "amount": adjustment_data.amount,
        "description": f"Adjustment: {adjustment_data.reason}",
        "period": adjustment_data.period,
        "source": "adjustment",
        "status": "adjustment",
        "created_at": datetime.utcnow()
    }
    await db.charges.insert_one(charge_doc)
    
    await log_audit("adjustment", str(result.inserted_id), "create", None, adjustment_doc, str(user["_id"]))
    
    return AdjustmentResponse(
        id=str(result.inserted_id),
        unit_id=adjustment_data.unit_id,
        unit_display=unit["display_name"],
        category_id=adjustment_data.category_id,
        category_name=category["name"],
        amount=adjustment_data.amount,
        adjustment_type="credit" if adjustment_data.amount < 0 else "debit",
        reason=adjustment_data.reason,
        period=adjustment_data.period,
        created_by=user["name"],
        created_at=adjustment_doc["created_at"]
    )

# ============== REPORTS ROUTES ==============

@api_router.get("/reports/true-up/{year}", response_model=TrueUpReport)
async def get_true_up_report(year: int, user: dict = Depends(get_current_user)):
    """Generate year-end true-up report"""
    units = await db.units.find().to_list(100)
    items = []
    total_outstanding = 0
    total_credits = 0
    
    for unit in units:
        unit_id = str(unit["_id"])
        
        # Get all charges for this unit for the year
        charges = await db.charges.find({
            "unit_id": unit_id,
            "period": {"$regex": f"^{year}"}
        }).to_list(1000)
        
        total_assessed = sum(c["amount"] for c in charges)
        
        # Get all payments for this unit for the year
        payments = await db.payments.find({
            "unit_id": unit_id,
            "payment_date": {"$regex": f"^{year}"}
        }).to_list(1000)
        
        total_paid = sum(p["amount"] for p in payments)
        
        opening_balance = unit.get("opening_balance", 0.0)
        net_balance = opening_balance + total_assessed - total_paid
        
        if net_balance > 0:
            status = "due"
            total_outstanding += net_balance
        elif net_balance < 0:
            status = "credit"
            total_credits += abs(net_balance)
        else:
            status = "settled"
        
        items.append(TrueUpReportItem(
            unit_id=unit["unit_id"],
            unit_display=unit["display_name"],
            unit_type=unit["unit_type"],
            opening_balance=opening_balance,
            total_assessed=total_assessed,
            total_paid=total_paid,
            net_balance=net_balance,
            status=status
        ))
    
    return TrueUpReport(
        year=year,
        generated_at=datetime.utcnow(),
        items=items,
        total_outstanding=total_outstanding,
        total_credits=total_credits
    )

@api_router.post("/reports/carry-forward/{year}")
async def carry_forward_balances(year: int, user: dict = Depends(require_admin)):
    """Carry forward balances to next year"""
    units = await db.units.find().to_list(100)
    updated = 0
    
    for unit in units:
        current_balance = unit.get("current_balance", 0.0)
        
        # Set current balance as next year's opening balance
        await db.units.update_one(
            {"_id": unit["_id"]},
            {"$set": {
                "opening_balance": current_balance,
                "current_balance": current_balance
            }}
        )
        updated += 1
    
    await log_audit("system", "carry_forward", "execute", None, {"year": year, "units": updated}, str(user["_id"]))
    
    return {"message": f"Carried forward balances for {updated} units to {year + 1}"}

# ============== DASHBOARD ROUTES ==============

@api_router.get("/dashboard/admin", response_model=AdminDashboard)
async def get_admin_dashboard(user: dict = Depends(require_admin)):
    units = await db.units.find().to_list(100)
    
    total_outstanding = sum(u.get("current_balance", 0) for u in units if u.get("current_balance", 0) > 0)
    units_overdue = len([u for u in units if u.get("current_balance", 0) > 0])
    
    # Get recent payments
    recent_payments = await db.payments.find().sort("created_at", -1).limit(5).to_list(5)
    payments_list = []
    for p in recent_payments:
        unit = await db.units.find_one({"_id": ObjectId(p["unit_id"])})
        payments_list.append({
            "unit": unit["display_name"] if unit else "Unknown",
            "amount": p["amount"],
            "date": p["payment_date"],
            "method": p["method"]
        })
    
    # Check allocation status
    current_year = datetime.now().year
    setup = await db.bill_inputs.find_one({"year": current_year})
    allocation_status = setup["status"] if setup else "not_started"
    
    return AdminDashboard(
        total_units=len(units),
        total_condos=len([u for u in units if u["unit_type"] == "condo"]),
        total_shops=len([u for u in units if u["unit_type"] == "shop"]),
        total_outstanding=total_outstanding,
        units_overdue=units_overdue,
        recent_payments=payments_list,
        allocation_status=allocation_status
    )

@api_router.get("/dashboard/owner", response_model=OwnerDashboard)
async def get_owner_dashboard(user: dict = Depends(get_current_user)):
    unit_ids = user.get("unit_ids", [])
    if not unit_ids:
        raise HTTPException(status_code=404, detail="No unit assigned to this owner")
    
    # Get first unit (primary)
    unit = await db.units.find_one({"_id": ObjectId(unit_ids[0])})
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    # Get last payment
    last_payment = await db.payments.find_one(
        {"unit_id": unit_ids[0]},
        sort=[("created_at", -1)]
    )
    
    # Get recent charges
    recent_charges = await db.charges.find({"unit_id": unit_ids[0]}).sort("created_at", -1).limit(5).to_list(5)
    charges_list = []
    for c in recent_charges:
        category = await db.categories.find_one({"_id": ObjectId(c["category_id"])})
        charges_list.append({
            "category": category["name"] if category else "Unknown",
            "amount": c["amount"],
            "period": c.get("period", ""),
            "status": c.get("status", "pending")
        })
    
    return OwnerDashboard(
        unit_id=unit["unit_id"],
        unit_display=unit["display_name"],
        current_balance=unit.get("current_balance", 0.0),
        last_payment_date=last_payment["payment_date"] if last_payment else None,
        last_payment_amount=last_payment["amount"] if last_payment else None,
        recent_charges=charges_list
    )

# ============== UNIT LEDGER ==============

@api_router.get("/ledger/{unit_id}")
async def get_unit_ledger(unit_id: str, year: Optional[int] = None, user: dict = Depends(get_current_user)):
    """Get detailed ledger for a unit"""
    # Check access
    if user["role"] == "owner" and unit_id not in user.get("unit_ids", []):
        raise HTTPException(status_code=403, detail="Access denied")
    
    unit = await db.units.find_one({"_id": ObjectId(unit_id)})
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    query = {"unit_id": unit_id}
    if year:
        query["$or"] = [
            {"period": {"$regex": f"^{year}"}},
            {"due_date": {"$regex": f"^{year}"}}
        ]
    
    charges = await db.charges.find(query).sort("created_at", 1).to_list(1000)
    
    payment_query = {"unit_id": unit_id}
    if year:
        payment_query["payment_date"] = {"$regex": f"^{year}"}
    
    payments = await db.payments.find(payment_query).sort("created_at", 1).to_list(1000)
    
    # Build ledger entries
    entries = []
    running_balance = unit.get("opening_balance", 0.0)
    
    for c in charges:
        category = await db.categories.find_one({"_id": ObjectId(c["category_id"])})
        running_balance += c["amount"]
        entries.append({
            "type": "charge",
            "date": c.get("due_date") or c["created_at"].strftime("%Y-%m-%d"),
            "description": c.get("description") or (category["name"] if category else "Charge"),
            "debit": c["amount"],
            "credit": 0,
            "balance": running_balance,
            "period": c.get("period", "")
        })
    
    for p in payments:
        running_balance -= p["amount"]
        entries.append({
            "type": "payment",
            "date": p["payment_date"],
            "description": f"Payment via {p['method']} - {p.get('reference', '')}",
            "debit": 0,
            "credit": p["amount"],
            "balance": running_balance,
            "period": ""
        })
    
    # Sort by date
    entries.sort(key=lambda x: x["date"])
    
    return {
        "unit_id": unit["unit_id"],
        "unit_display": unit["display_name"],
        "opening_balance": unit.get("opening_balance", 0.0),
        "current_balance": unit.get("current_balance", 0.0),
        "entries": entries
    }

# ============== SEED DATA ==============

@api_router.post("/seed")
async def seed_data():
    """Seed initial data - 8 units (5 condos, 3 shops) and default categories"""
    
    # Check if already seeded
    existing = await db.units.find_one()
    if existing:
        return {"message": "Data already seeded"}
    
    # Create default categories
    categories = [
        {"name": "Water Utility", "description": "Water utility charges", "recurring": True, "frequency": "annual", "applies_to": "condos"},
        {"name": "Electricity Utility", "description": "Electricity utility charges", "recurring": True, "frequency": "annual", "applies_to": "all"},
        {"name": "Common Maintenance", "description": "Common area maintenance fees", "recurring": True, "frequency": "monthly", "applies_to": "all"},
        {"name": "Repairs & Capital", "description": "Repairs and sinking fund", "recurring": False, "frequency": "one-time", "applies_to": "all"},
        {"name": "Security", "description": "Security charges", "recurring": True, "frequency": "monthly", "applies_to": "all"},
        {"name": "Late Fees", "description": "Late payment penalties", "recurring": False, "frequency": "one-time", "applies_to": "all"},
    ]
    
    for cat in categories:
        cat["created_at"] = datetime.utcnow()
    
    await db.categories.insert_many(categories)
    
    # Create 8 units
    units = [
        {"unit_id": "C1", "unit_type": "condo", "display_name": "Condo Unit 1", "status": "owned"},
        {"unit_id": "C2", "unit_type": "condo", "display_name": "Condo Unit 2", "status": "owned"},
        {"unit_id": "C3", "unit_type": "condo", "display_name": "Condo Unit 3", "status": "owned"},
        {"unit_id": "C4", "unit_type": "condo", "display_name": "Condo Unit 4", "status": "owned"},
        {"unit_id": "C5", "unit_type": "condo", "display_name": "Condo Unit 5", "status": "owned"},
        {"unit_id": "S1", "unit_type": "shop", "display_name": "Shop Unit 1", "status": "owned"},
        {"unit_id": "S2", "unit_type": "shop", "display_name": "Shop Unit 2", "status": "owned"},
        {"unit_id": "S3", "unit_type": "shop", "display_name": "Shop Unit 3", "status": "owned"},
    ]
    
    for unit in units:
        unit["primary_owner_id"] = None
        unit["opening_balance"] = 0.0
        unit["current_balance"] = 0.0
        unit["created_at"] = datetime.utcnow()
    
    await db.units.insert_many(units)
    
    # Create admin user
    admin_doc = {
        "email": "admin@keralahoa.com",
        "password": hash_password("admin123"),
        "name": "HOA Administrator",
        "phone": "+91 9876543210",
        "role": "admin",
        "unit_ids": [],
        "created_at": datetime.utcnow()
    }
    await db.users.insert_one(admin_doc)
    
    return {"message": "Seeded 8 units, 6 categories, and admin user successfully"}

# ============== HEALTH CHECK ==============

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
