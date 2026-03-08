from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Form, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
import uuid
from datetime import datetime, date, timedelta
import jwt
import bcrypt
from bson import ObjectId
import shutil
import mimetypes

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Environment Configuration
ENVIRONMENT = os.environ.get('ENVIRONMENT', 'development').lower()
WRITE_PROTECTION = os.environ.get('WRITE_PROTECTION', 'false').lower() == 'true'
IS_PRODUCTION = ENVIRONMENT == 'production'

# Create uploads directory
UPLOADS_DIR = ROOT_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

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

# Write protection check function
def check_write_permission():
    """Check if write operations are allowed in current environment"""
    if WRITE_PROTECTION and not IS_PRODUCTION:
        raise HTTPException(
            status_code=403,
            detail=f"Write operations are disabled in {ENVIRONMENT} environment. Set WRITE_PROTECTION=false to enable."
        )

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
    ownership_start_date: Optional[datetime] = None
    ownership_end_date: Optional[datetime] = None
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
    owner_ids: List[str] = []
    owner_names: List[str] = []
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
    ownership_start_date: Optional[datetime] = None  # When ownership began

class OwnerUpdate(BaseModel):
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    phone: Optional[str] = None
    ownership_start_date: Optional[datetime] = None
    ownership_end_date: Optional[datetime] = None

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
    # Financial Metrics
    reserve_balance: float = 0.0
    total_collected: float = 0.0
    payments_this_year: float = 0.0
    expenses_this_year: float = 0.0

class OwnerDashboard(BaseModel):
    unit_id: str
    unit_display: str
    current_balance: float
    last_payment_date: Optional[str] = None
    last_payment_amount: Optional[float] = None
    recent_charges: List[dict]
    # Financial Metrics (for transparency)
    reserve_balance: float = 0.0
    total_collected: float = 0.0
    payments_this_year: float = 0.0
    expenses_this_year: float = 0.0

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
                   old_value: dict = None, new_value: dict = None, user_id: str = "system",
                   reason: str = None):
    audit = {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "action": action,
        "old_value": old_value,
        "new_value": new_value,
        "performed_by": user_id,
        "reason": reason,
        "timestamp": datetime.utcnow()
    }
    await db.audit_logs.insert_one(audit)

# Error logging function for centralized error tracking
async def log_error(
    module: str,
    error_type: str,
    error_message: str,
    user_id: str = None,
    request_path: str = None,
    request_method: str = None,
    stack_trace: str = None,
    additional_data: dict = None
):
    """Log errors to database for monitoring and debugging"""
    error_log = {
        "module": module,  # e.g., "auth", "billing", "documents"
        "error_type": error_type,  # e.g., "validation", "database", "authentication"
        "error_message": error_message,
        "user_id": user_id,
        "request_path": request_path,
        "request_method": request_method,
        "stack_trace": stack_trace,
        "additional_data": additional_data,
        "timestamp": datetime.utcnow()
    }
    try:
        await db.error_logs.insert_one(error_log)
    except Exception as e:
        # If we can't log to DB, at least print to console
        print(f"ERROR LOG FAILED: {error_log}, reason: {e}")

# API endpoint to get error logs (Admin only)
@api_router.get("/error-logs")
async def get_error_logs(
    module: str = None,
    error_type: str = None,
    start_date: str = None,
    end_date: str = None,
    limit: int = 100,
    user: dict = Depends(require_admin)
):
    """Get error logs for monitoring - Admin only"""
    query = {}
    
    if module:
        query["module"] = module
    if error_type:
        query["error_type"] = error_type
    if start_date:
        query["timestamp"] = {"$gte": datetime.fromisoformat(start_date)}
    if end_date:
        if "timestamp" in query:
            query["timestamp"]["$lte"] = datetime.fromisoformat(end_date)
        else:
            query["timestamp"] = {"$lte": datetime.fromisoformat(end_date)}
    
    logs = await db.error_logs.find(query).sort("timestamp", -1).limit(limit).to_list(None)
    
    return [
        {
            "id": str(log["_id"]),
            "module": log["module"],
            "error_type": log["error_type"],
            "error_message": log["error_message"],
            "user_id": log.get("user_id"),
            "request_path": log.get("request_path"),
            "request_method": log.get("request_method"),
            "timestamp": log["timestamp"].isoformat(),
            "additional_data": log.get("additional_data")
        }
        for log in logs
    ]

# Global exception handler middleware
@app.middleware("http")
async def error_logging_middleware(request: Request, call_next):
    try:
        response = await call_next(request)
        return response
    except Exception as e:
        # Log unhandled exceptions
        import traceback
        await log_error(
            module="global",
            error_type="unhandled_exception",
            error_message=str(e),
            request_path=str(request.url.path),
            request_method=request.method,
            stack_trace=traceback.format_exc()
        )
        raise

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

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None

@api_router.put("/auth/profile", response_model=UserResponse)
async def update_profile(profile: ProfileUpdate, user: dict = Depends(get_current_user)):
    """Update current user's own profile - allowed for all authenticated users"""
    update_data = {}
    
    if profile.name:
        update_data["name"] = profile.name
    if profile.phone:
        update_data["phone"] = profile.phone
    if profile.email and profile.email != user["email"]:
        # Check if email is already taken
        existing = await db.users.find_one({"email": profile.email})
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        update_data["email"] = profile.email
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    # Log the profile update
    old_values = {k: user.get(k) for k in update_data.keys()}
    
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": update_data}
    )
    
    # Create audit log
    await log_audit("user_profile", str(user["_id"]), "update", old_values, update_data, str(user["_id"]))
    
    # Get updated user
    updated_user = await db.users.find_one({"_id": user["_id"]})
    
    return UserResponse(
        id=str(updated_user["_id"]),
        email=updated_user["email"],
        name=updated_user["name"],
        phone=updated_user.get("phone", ""),
        role=updated_user["role"],
        unit_ids=updated_user.get("unit_ids", []),
        created_at=updated_user["created_at"]
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
        
        # Get all owner IDs and names
        owner_ids = unit.get("owner_ids", [])
        owner_names = []
        for oid in owner_ids:
            try:
                o = await db.users.find_one({"_id": ObjectId(oid)})
                if o:
                    owner_names.append(o["name"])
            except:
                pass
        
        result.append(UnitResponse(
            id=str(unit["_id"]),
            unit_id=unit["unit_id"],
            unit_type=unit["unit_type"],
            display_name=unit["display_name"],
            status=unit["status"],
            primary_owner_id=unit.get("primary_owner_id"),
            primary_owner_name=owner_name,
            owner_ids=owner_ids,
            owner_names=owner_names,
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
    
    # Get all owner IDs and names
    owner_ids = unit.get("owner_ids", [])
    owner_names = []
    for oid in owner_ids:
        try:
            o = await db.users.find_one({"_id": ObjectId(oid)})
            if o:
                owner_names.append(o["name"])
        except:
            pass
    
    return UnitResponse(
        id=str(unit["_id"]),
        unit_id=unit["unit_id"],
        unit_type=unit["unit_type"],
        display_name=unit["display_name"],
        status=unit["status"],
        primary_owner_id=unit.get("primary_owner_id"),
        primary_owner_name=owner_name,
        owner_ids=owner_ids,
        owner_names=owner_names,
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
    
    # Update unit - set primary owner and add to owner_ids array
    if assignment.role == "primary":
        await db.units.update_one(
            {"_id": ObjectId(unit_id)},
            {
                "$set": {"primary_owner_id": assignment.owner_id},
                "$addToSet": {"owner_ids": assignment.owner_id}
            }
        )
    else:
        # Joint owner - just add to owner_ids array
        await db.units.update_one(
            {"_id": ObjectId(unit_id)},
            {"$addToSet": {"owner_ids": assignment.owner_id}}
        )
    
    # Update owner's unit_ids
    if unit_id not in owner.get("unit_ids", []):
        await db.users.update_one(
            {"_id": ObjectId(assignment.owner_id)},
            {"$addToSet": {"unit_ids": unit_id}}
        )
    
    await log_audit("unit", unit_id, "assign_owner", None, {"owner_id": assignment.owner_id, "role": assignment.role}, str(user["_id"]))
    
    return {"message": "Owner assigned successfully"}

# Remove owner from unit
@api_router.delete("/units/{unit_id}/remove-owner/{owner_id}")
async def remove_owner_from_unit(unit_id: str, owner_id: str, user: dict = Depends(require_admin)):
    unit = await db.units.find_one({"_id": ObjectId(unit_id)})
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    # Remove from owner_ids array
    await db.units.update_one(
        {"_id": ObjectId(unit_id)},
        {"$pull": {"owner_ids": owner_id}}
    )
    
    # If this was the primary owner, clear primary_owner_id
    if unit.get("primary_owner_id") == owner_id:
        await db.units.update_one(
            {"_id": ObjectId(unit_id)},
            {"$set": {"primary_owner_id": None}}
        )
    
    # Remove unit from owner's unit_ids
    await db.users.update_one(
        {"_id": ObjectId(owner_id)},
        {"$pull": {"unit_ids": unit_id}}
    )
    
    await log_audit("unit", unit_id, "remove_owner", {"owner_id": owner_id}, None, str(user["_id"]))
    
    return {"message": "Owner removed from unit successfully"}

# ============== OWNER ROUTES ==============

@api_router.get("/owners", response_model=List[UserResponse])
async def get_owners(user: dict = Depends(get_current_user)):
    """Get all owners - accessible to all authenticated users for read-only viewing"""
    users = await db.users.find({"role": {"$in": ["owner", "admin", "treasurer"]}}).to_list(100)
    return [
        UserResponse(
            id=str(u["_id"]),
            email=u["email"],
            name=u["name"],
            phone=u.get("phone", ""),
            role=u["role"],
            unit_ids=u.get("unit_ids", []),
            ownership_start_date=u.get("ownership_start_date"),
            ownership_end_date=u.get("ownership_end_date"),
            created_at=u["created_at"]
        ) for u in users
    ]

@api_router.post("/owners", response_model=UserResponse)
async def create_owner(owner_data: OwnerCreate, user: dict = Depends(require_admin)):
    """Admin creates a new owner account - allows duplicate emails for families sharing one email"""
    # Note: We allow duplicate emails to support families/couples sharing a single email
    # Each owner remains a separate individual record
    
    # Generate password if not provided
    password = owner_data.password if owner_data.password else "Welcome123"
    
    # Set ownership start date - default to now if not provided
    ownership_start = owner_data.ownership_start_date if owner_data.ownership_start_date else datetime.utcnow()
    
    user_doc = {
        "email": owner_data.email,
        "password": hash_password(password),
        "name": owner_data.name,
        "phone": owner_data.phone,
        "role": "owner",
        "unit_ids": [],
        "ownership_start_date": ownership_start,
        "ownership_end_date": None,
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
        ownership_start_date=ownership_start,
        ownership_end_date=None,
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
        ownership_start_date=updated.get("ownership_start_date"),
        ownership_end_date=updated.get("ownership_end_date"),
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

class PaymentUpdate(BaseModel):
    amount: Optional[float] = None
    payment_date: Optional[str] = None
    method: Optional[str] = None
    reference: Optional[str] = None
    notes: Optional[str] = None
    reason: str  # Required for any edit

@api_router.put("/payments/{payment_id}", response_model=PaymentResponse)
async def update_payment(payment_id: str, update_data: PaymentUpdate, user: dict = Depends(require_admin)):
    """Edit a payment record - requires reason for change"""
    payment = await db.payments.find_one({"_id": ObjectId(payment_id)})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    # Store old values for audit
    old_values = {
        "amount": payment["amount"],
        "payment_date": payment["payment_date"],
        "method": payment["method"],
        "reference": payment.get("reference", ""),
        "notes": payment.get("notes", "")
    }
    
    update_dict = {}
    if update_data.amount is not None:
        # Adjust unit balance for the difference
        difference = update_data.amount - payment["amount"]
        await db.units.update_one(
            {"_id": ObjectId(payment["unit_id"])},
            {"$inc": {"current_balance": difference}}  # Positive diff means less paid
        )
        update_dict["amount"] = update_data.amount
    if update_data.payment_date is not None:
        update_dict["payment_date"] = update_data.payment_date
    if update_data.method is not None:
        update_dict["method"] = update_data.method
    if update_data.reference is not None:
        update_dict["reference"] = update_data.reference
    if update_data.notes is not None:
        update_dict["notes"] = update_data.notes
    
    update_dict["updated_at"] = datetime.utcnow()
    update_dict["updated_by"] = str(user["_id"])
    
    await db.payments.update_one(
        {"_id": ObjectId(payment_id)},
        {"$set": update_dict}
    )
    
    # Log with reason
    await log_audit("payment", payment_id, "update", old_values, update_dict, str(user["_id"]), update_data.reason)
    
    # Return updated payment
    updated = await db.payments.find_one({"_id": ObjectId(payment_id)})
    unit = await db.units.find_one({"_id": ObjectId(updated["unit_id"])})
    
    return PaymentResponse(
        id=str(updated["_id"]),
        unit_id=updated["unit_id"],
        unit_display=unit["display_name"] if unit else "Unknown",
        amount=updated["amount"],
        payment_date=updated["payment_date"],
        method=updated["method"],
        reference=updated.get("reference", ""),
        notes=updated.get("notes", ""),
        charge_id=updated.get("charge_id"),
        charge_description=None,
        category_name=None,
        recorded_by=user["name"],
        created_at=updated["created_at"]
    )

# ============== EXPENSES (OUTGOING PAYMENTS TO VENDORS) ==============

@api_router.get("/expenses", response_model=List[ExpenseResponse])
async def get_expenses(user: dict = Depends(get_current_user)):
    """Get all expenses - visible to all authenticated users for transparency"""
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

class ExpenseUpdate(BaseModel):
    vendor_name: Optional[str] = None
    amount: Optional[float] = None
    payment_date: Optional[str] = None
    description: Optional[str] = None
    method: Optional[str] = None
    reference: Optional[str] = None
    invoice_number: Optional[str] = None
    reason: str  # Required for any edit

@api_router.put("/expenses/{expense_id}", response_model=ExpenseResponse)
async def update_expense(expense_id: str, update_data: ExpenseUpdate, user: dict = Depends(require_admin)):
    """Edit an expense record - requires reason for change"""
    expense = await db.expenses.find_one({"_id": ObjectId(expense_id)})
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    # Store old values for audit
    old_values = {
        "vendor_name": expense["vendor_name"],
        "amount": expense["amount"],
        "payment_date": expense["payment_date"],
        "description": expense.get("description", ""),
        "method": expense["method"],
        "reference": expense.get("reference", ""),
        "invoice_number": expense.get("invoice_number", "")
    }
    
    update_dict = {}
    if update_data.vendor_name is not None:
        update_dict["vendor_name"] = update_data.vendor_name
    if update_data.amount is not None:
        update_dict["amount"] = update_data.amount
    if update_data.payment_date is not None:
        update_dict["payment_date"] = update_data.payment_date
    if update_data.description is not None:
        update_dict["description"] = update_data.description
    if update_data.method is not None:
        update_dict["method"] = update_data.method
    if update_data.reference is not None:
        update_dict["reference"] = update_data.reference
    if update_data.invoice_number is not None:
        update_dict["invoice_number"] = update_data.invoice_number
    
    update_dict["updated_at"] = datetime.utcnow()
    update_dict["updated_by"] = str(user["_id"])
    
    await db.expenses.update_one(
        {"_id": ObjectId(expense_id)},
        {"$set": update_dict}
    )
    
    # Log with reason
    await log_audit("expense", expense_id, "update", old_values, update_dict, str(user["_id"]), update_data.reason)
    
    # Return updated expense
    updated = await db.expenses.find_one({"_id": ObjectId(expense_id)})
    category = await db.categories.find_one({"_id": ObjectId(updated["category_id"])})
    
    return ExpenseResponse(
        id=str(updated["_id"]),
        vendor_name=updated["vendor_name"],
        category_id=updated["category_id"],
        category_name=category["name"] if category else "Unknown",
        amount=updated["amount"],
        payment_date=updated["payment_date"],
        description=updated.get("description", ""),
        method=updated["method"],
        reference=updated.get("reference", ""),
        invoice_number=updated.get("invoice_number", ""),
        recorded_by=user["name"],
        created_at=updated["created_at"]
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

async def get_financial_metrics():
    """Calculate HOA financial metrics"""
    current_year = datetime.now().year
    year_start = datetime(current_year, 1, 1)
    
    # Total payments collected (all time)
    all_payments = await db.payments.find().to_list(None)
    total_collected = sum(p.get("amount", 0) for p in all_payments)
    
    # Payments this year
    payments_this_year_docs = await db.payments.find({
        "created_at": {"$gte": year_start}
    }).to_list(None)
    payments_this_year = sum(p.get("amount", 0) for p in payments_this_year_docs)
    
    # Total expenses (all time)
    all_expenses = await db.expenses.find().to_list(None)
    total_expenses = sum(e.get("amount", 0) for e in all_expenses)
    
    # Expenses this year
    expenses_this_year_docs = await db.expenses.find({
        "created_at": {"$gte": year_start}
    }).to_list(None)
    expenses_this_year = sum(e.get("amount", 0) for e in expenses_this_year_docs)
    
    # Reserve balance = Total Collected - Total Expenses
    reserve_balance = total_collected - total_expenses
    
    return {
        "reserve_balance": reserve_balance,
        "total_collected": total_collected,
        "payments_this_year": payments_this_year,
        "expenses_this_year": expenses_this_year
    }

@api_router.get("/dashboard/admin", response_model=AdminDashboard)
async def get_admin_dashboard(user: dict = Depends(get_current_user)):
    """Get admin dashboard - available to all authenticated users for transparency"""
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
    
    # Get financial metrics
    metrics = await get_financial_metrics()
    
    return AdminDashboard(
        total_units=len(units),
        total_condos=len([u for u in units if u["unit_type"] == "condo"]),
        total_shops=len([u for u in units if u["unit_type"] == "shop"]),
        total_outstanding=total_outstanding,
        units_overdue=units_overdue,
        recent_payments=payments_list,
        allocation_status=allocation_status,
        reserve_balance=metrics["reserve_balance"],
        total_collected=metrics["total_collected"],
        payments_this_year=metrics["payments_this_year"],
        expenses_this_year=metrics["expenses_this_year"]
    )

@api_router.get("/dashboard/owner", response_model=OwnerDashboard)
async def get_owner_dashboard(user: dict = Depends(get_current_user)):
    unit_ids = user.get("unit_ids", [])
    
    # Return empty dashboard if no units assigned
    if not unit_ids:
        return OwnerDashboard(
            unit_id="",
            unit_display="No unit assigned",
            current_balance=0.0,
            last_payment_date=None,
            last_payment_amount=None,
            recent_charges=[]
        )
    
    # Get first unit (primary)
    unit = await db.units.find_one({"_id": ObjectId(unit_ids[0])})
    if not unit:
        return OwnerDashboard(
            unit_id="",
            unit_display="No unit assigned",
            current_balance=0.0,
            last_payment_date=None,
            last_payment_amount=None,
            recent_charges=[]
        )
    
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
    
    # Get financial metrics (for transparency)
    metrics = await get_financial_metrics()
    
    return OwnerDashboard(
        unit_id=unit["unit_id"],
        unit_display=unit["display_name"],
        current_balance=unit.get("current_balance", 0.0),
        last_payment_date=last_payment["payment_date"] if last_payment else None,
        last_payment_amount=last_payment["amount"] if last_payment else None,
        recent_charges=charges_list,
        reserve_balance=metrics["reserve_balance"],
        total_collected=metrics["total_collected"],
        payments_this_year=metrics["payments_this_year"],
        expenses_this_year=metrics["expenses_this_year"]
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

# ============== AUDIT LOG ROUTES ==============

class AuditLogResponse(BaseModel):
    id: str
    entity_type: str
    entity_id: str
    action: str
    old_value: Optional[dict] = None
    new_value: Optional[dict] = None
    performed_by: str
    performed_by_name: Optional[str] = None
    timestamp: datetime
    description: Optional[str] = None
    reason: Optional[str] = None

@api_router.get("/audit-logs")
async def get_audit_logs(
    entity_type: Optional[str] = None,
    action: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    unit_id: Optional[str] = None,
    limit: int = 100,
    user: dict = Depends(get_current_user)
):
    """Get audit logs with optional filters. Accessible to all authenticated users."""
    query = {}
    
    if entity_type:
        query["entity_type"] = entity_type
    
    if action:
        query["action"] = action
    
    if start_date:
        try:
            start = datetime.fromisoformat(start_date)
            query["timestamp"] = {"$gte": start}
        except:
            pass
    
    if end_date:
        try:
            end = datetime.fromisoformat(end_date)
            if "timestamp" in query:
                query["timestamp"]["$lte"] = end
            else:
                query["timestamp"] = {"$lte": end}
        except:
            pass
    
    if unit_id:
        # Filter by unit in entity_id or new_value.unit_id
        query["$or"] = [
            {"entity_id": unit_id},
            {"new_value.unit_id": unit_id}
        ]
    
    # Get logs with user info
    logs = await db.audit_logs.find(query).sort("timestamp", -1).limit(limit).to_list(limit)
    
    # Get unique user IDs to fetch names
    user_ids = set()
    for log in logs:
        if log.get("performed_by") and log["performed_by"] != "system":
            try:
                user_ids.add(ObjectId(log["performed_by"]))
            except:
                pass
    
    # Fetch user names
    user_map = {}
    if user_ids:
        users = await db.users.find({"_id": {"$in": list(user_ids)}}).to_list(None)
        user_map = {str(u["_id"]): u.get("name", "Unknown") for u in users}
    
    # Generate human-readable descriptions
    def get_description(log):
        action = log.get("action", "")
        entity = log.get("entity_type", "")
        new_val = log.get("new_value", {}) or {}
        
        if action == "create":
            if entity == "payment":
                return f"Payment of ₹{new_val.get('amount', 0):,.2f} recorded"
            elif entity == "charge":
                return f"Charge of ₹{new_val.get('amount', 0):,.2f} created"
            elif entity == "expense":
                return f"Expense of ₹{new_val.get('amount', 0):,.2f} to {new_val.get('vendor_name', 'vendor')}"
            elif entity == "adjustment":
                adj_type = new_val.get('adjustment_type', 'adjustment')
                return f"{adj_type.title()} adjustment of ₹{new_val.get('amount', 0):,.2f}"
            elif entity == "bill_input":
                return f"Annual setup created for year {new_val.get('year', '')}"
            elif entity == "unit":
                return f"Unit {new_val.get('display_name', '')} created"
            elif entity == "owner":
                return f"Owner {new_val.get('name', '')} added"
        elif action == "approve":
            return f"Annual setup approved for posting"
        elif action == "post":
            charges = new_val.get('charges_created', 0)
            return f"{charges} charges posted to unit ledgers"
        elif action == "update":
            return f"{entity.title()} updated"
        elif action == "delete":
            return f"{entity.title()} deleted"
        elif action == "assign_owner":
            return f"Owner assigned to unit"
        elif action == "execute" and entity == "system":
            return f"Year-end carry forward executed"
        
        return f"{action.title()} on {entity}"
    
    # Helper to convert MongoDB documents to JSON-safe format
    def make_json_safe(obj):
        if obj is None:
            return None
        if isinstance(obj, dict):
            return {k: make_json_safe(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [make_json_safe(item) for item in obj]
        if isinstance(obj, ObjectId):
            return str(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        return obj
    
    result = []
    for log in logs:
        result.append(AuditLogResponse(
            id=str(log["_id"]),
            entity_type=log.get("entity_type", ""),
            entity_id=str(log.get("entity_id", "")),
            action=log.get("action", ""),
            old_value=make_json_safe(log.get("old_value")),
            new_value=make_json_safe(log.get("new_value")),
            performed_by=str(log.get("performed_by", "system")),
            performed_by_name=user_map.get(str(log.get("performed_by")), "System"),
            timestamp=log.get("timestamp", datetime.utcnow()),
            description=get_description(log),
            reason=log.get("reason")
        ))
    
    return result

@api_router.get("/audit-logs/entity-types")
async def get_audit_entity_types(user: dict = Depends(get_current_user)):
    """Get list of unique entity types in audit logs"""
    types = await db.audit_logs.distinct("entity_type")
    return types

@api_router.get("/audit-logs/actions")
async def get_audit_actions(user: dict = Depends(get_current_user)):
    """Get list of unique actions in audit logs"""
    actions = await db.audit_logs.distinct("action")
    return actions

# ============== DOCUMENT MANAGEMENT ==============

# Allowed file types and max size
ALLOWED_FILE_TYPES = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.csv', '.txt']
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25MB

class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[str] = None
    description: Optional[str] = None

class FolderUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class FolderResponse(BaseModel):
    id: str
    name: str
    parent_id: Optional[str] = None
    path: str
    description: Optional[str] = None
    created_by: str
    created_at: datetime
    children_count: int = 0
    files_count: int = 0

class DocumentResponse(BaseModel):
    id: str
    filename: str
    original_filename: str
    folder_id: str
    folder_path: str
    file_size: int
    file_type: str
    mime_type: str
    description: Optional[str] = None
    uploaded_by: str
    uploaded_by_role: str
    uploaded_at: datetime
    version: int = 1
    previous_versions: List[dict] = []

class DocumentSearchResult(BaseModel):
    documents: List[DocumentResponse]
    folders: List[FolderResponse]

# Initialize default folders
DEFAULT_FOLDERS = [
    {"name": "HOA Legal & Governance", "path": "/HOA Legal & Governance"},
    {"name": "Financial Records", "path": "/Financial Records", "children": [
        {"name": "2024", "path": "/Financial Records/2024"},
        {"name": "2025", "path": "/Financial Records/2025"},
        {"name": "2026", "path": "/Financial Records/2026"},
    ]},
    {"name": "Utility Bills", "path": "/Utility Bills", "children": [
        {"name": "Water Bills", "path": "/Utility Bills/Water Bills"},
        {"name": "Electricity Bills", "path": "/Utility Bills/Electricity Bills"},
    ]},
    {"name": "Meeting Minutes", "path": "/Meeting Minutes"},
    {"name": "Maintenance & Vendor Records", "path": "/Maintenance & Vendor Records"},
    {"name": "HOA Communications", "path": "/HOA Communications"},
    {"name": "Disputes & Violations", "path": "/Disputes & Violations"},
]

async def ensure_default_folders():
    """Create default folder structure if not exists"""
    root_count = await db.folders.count_documents({"parent_id": None})
    if root_count == 0:
        for folder_data in DEFAULT_FOLDERS:
            await create_folder_recursive(folder_data, None)

async def create_folder_recursive(folder_data: dict, parent_id: Optional[str]):
    """Recursively create folders"""
    folder_doc = {
        "name": folder_data["name"],
        "parent_id": parent_id,
        "path": folder_data["path"],
        "description": None,
        "created_by": "system",
        "created_at": datetime.utcnow()
    }
    result = await db.folders.insert_one(folder_doc)
    folder_id = str(result.inserted_id)
    
    # Create children
    if "children" in folder_data:
        for child in folder_data["children"]:
            await create_folder_recursive(child, folder_id)

async def get_folder_path(folder_id: str) -> str:
    """Get full path of a folder"""
    folder = await db.folders.find_one({"_id": ObjectId(folder_id)})
    if folder:
        return folder.get("path", "/")
    return "/"

@api_router.get("/documents/folders", response_model=List[FolderResponse])
async def get_folders(parent_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Get folders - available to all authenticated users"""
    await ensure_default_folders()
    
    query = {"parent_id": parent_id}
    folders = await db.folders.find(query).sort("name", 1).to_list(100)
    
    result = []
    for f in folders:
        folder_id = str(f["_id"])
        children_count = await db.folders.count_documents({"parent_id": folder_id})
        files_count = await db.documents.count_documents({"folder_id": folder_id})
        
        result.append(FolderResponse(
            id=folder_id,
            name=f["name"],
            parent_id=f.get("parent_id"),
            path=f.get("path", "/"),
            description=f.get("description"),
            created_by=f.get("created_by", "system"),
            created_at=f.get("created_at", datetime.utcnow()),
            children_count=children_count,
            files_count=files_count
        ))
    
    return result

@api_router.get("/documents/folders/{folder_id}", response_model=FolderResponse)
async def get_folder(folder_id: str, user: dict = Depends(get_current_user)):
    """Get a specific folder"""
    folder = await db.folders.find_one({"_id": ObjectId(folder_id)})
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    children_count = await db.folders.count_documents({"parent_id": folder_id})
    files_count = await db.documents.count_documents({"folder_id": folder_id})
    
    return FolderResponse(
        id=str(folder["_id"]),
        name=folder["name"],
        parent_id=folder.get("parent_id"),
        path=folder.get("path", "/"),
        description=folder.get("description"),
        created_by=folder.get("created_by", "system"),
        created_at=folder.get("created_at", datetime.utcnow()),
        children_count=children_count,
        files_count=files_count
    )

@api_router.post("/documents/folders", response_model=FolderResponse)
async def create_folder(folder_data: FolderCreate, user: dict = Depends(require_admin)):
    """Create a new folder - Admin/Treasurer only"""
    # Determine path
    if folder_data.parent_id:
        parent = await db.folders.find_one({"_id": ObjectId(folder_data.parent_id)})
        if not parent:
            raise HTTPException(status_code=404, detail="Parent folder not found")
        path = f"{parent['path']}/{folder_data.name}"
    else:
        path = f"/{folder_data.name}"
    
    # Check if folder already exists at this path
    existing = await db.folders.find_one({"path": path})
    if existing:
        raise HTTPException(status_code=400, detail="Folder already exists at this path")
    
    folder_doc = {
        "name": folder_data.name,
        "parent_id": folder_data.parent_id,
        "path": path,
        "description": folder_data.description,
        "created_by": user["name"],
        "created_at": datetime.utcnow()
    }
    
    result = await db.folders.insert_one(folder_doc)
    
    # Log action
    await log_audit("folder", str(result.inserted_id), "create", None, {"name": folder_data.name, "path": path}, str(user["_id"]))
    
    return FolderResponse(
        id=str(result.inserted_id),
        name=folder_data.name,
        parent_id=folder_data.parent_id,
        path=path,
        description=folder_data.description,
        created_by=user["name"],
        created_at=folder_doc["created_at"],
        children_count=0,
        files_count=0
    )

@api_router.put("/documents/folders/{folder_id}", response_model=FolderResponse)
async def update_folder(folder_id: str, folder_data: FolderUpdate, user: dict = Depends(require_admin)):
    """Update a folder - Admin/Treasurer only"""
    folder = await db.folders.find_one({"_id": ObjectId(folder_id)})
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    update_dict = {}
    old_values = {}
    
    if folder_data.name and folder_data.name != folder["name"]:
        old_values["name"] = folder["name"]
        update_dict["name"] = folder_data.name
        # Update path
        old_path = folder["path"]
        if folder["parent_id"]:
            parent = await db.folders.find_one({"_id": ObjectId(folder["parent_id"])})
            new_path = f"{parent['path']}/{folder_data.name}"
        else:
            new_path = f"/{folder_data.name}"
        update_dict["path"] = new_path
        
        # Update all child folder paths
        children = await db.folders.find({"path": {"$regex": f"^{old_path}/"}}).to_list(1000)
        for child in children:
            child_new_path = child["path"].replace(old_path, new_path, 1)
            await db.folders.update_one(
                {"_id": child["_id"]},
                {"$set": {"path": child_new_path}}
            )
    
    if folder_data.description is not None:
        old_values["description"] = folder.get("description")
        update_dict["description"] = folder_data.description
    
    if update_dict:
        await db.folders.update_one(
            {"_id": ObjectId(folder_id)},
            {"$set": update_dict}
        )
        await log_audit("folder", folder_id, "update", old_values, update_dict, str(user["_id"]))
    
    updated = await db.folders.find_one({"_id": ObjectId(folder_id)})
    children_count = await db.folders.count_documents({"parent_id": folder_id})
    files_count = await db.documents.count_documents({"folder_id": folder_id})
    
    return FolderResponse(
        id=folder_id,
        name=updated["name"],
        parent_id=updated.get("parent_id"),
        path=updated.get("path", "/"),
        description=updated.get("description"),
        created_by=updated.get("created_by", "system"),
        created_at=updated.get("created_at", datetime.utcnow()),
        children_count=children_count,
        files_count=files_count
    )

@api_router.delete("/documents/folders/{folder_id}")
async def delete_folder(folder_id: str, user: dict = Depends(require_admin)):
    """Delete a folder - Admin/Treasurer only. Only empty folders can be deleted."""
    folder = await db.folders.find_one({"_id": ObjectId(folder_id)})
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    # Check if folder has children or files
    children_count = await db.folders.count_documents({"parent_id": folder_id})
    files_count = await db.documents.count_documents({"folder_id": folder_id})
    
    if children_count > 0 or files_count > 0:
        raise HTTPException(status_code=400, detail="Cannot delete folder with contents. Remove all files and subfolders first.")
    
    await db.folders.delete_one({"_id": ObjectId(folder_id)})
    await log_audit("folder", folder_id, "delete", {"name": folder["name"], "path": folder["path"]}, None, str(user["_id"]))
    
    return {"message": "Folder deleted successfully"}

@api_router.get("/documents/files", response_model=List[DocumentResponse])
async def get_files(folder_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Get files in a folder - available to all authenticated users"""
    query = {}
    if folder_id:
        query["folder_id"] = folder_id
    
    documents = await db.documents.find(query).sort("uploaded_at", -1).to_list(1000)
    
    result = []
    for doc in documents:
        folder_path = await get_folder_path(doc["folder_id"]) if doc.get("folder_id") else "/"
        result.append(DocumentResponse(
            id=str(doc["_id"]),
            filename=doc["filename"],
            original_filename=doc["original_filename"],
            folder_id=doc["folder_id"],
            folder_path=folder_path,
            file_size=doc["file_size"],
            file_type=doc["file_type"],
            mime_type=doc.get("mime_type", "application/octet-stream"),
            description=doc.get("description"),
            uploaded_by=doc["uploaded_by"],
            uploaded_by_role=doc.get("uploaded_by_role", "admin"),
            uploaded_at=doc["uploaded_at"],
            version=doc.get("version", 1),
            previous_versions=doc.get("previous_versions", [])
        ))
    
    return result

@api_router.post("/documents/files/upload")
async def upload_file(
    file: UploadFile = File(...),
    folder_id: str = Form(...),
    description: str = Form(None),
    user: dict = Depends(require_admin)
):
    """Upload a file - Admin/Treasurer only"""
    # Validate file type
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in ALLOWED_FILE_TYPES:
        raise HTTPException(status_code=400, detail=f"File type {file_ext} not allowed. Allowed types: {', '.join(ALLOWED_FILE_TYPES)}")
    
    # Check file size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size is 25MB.")
    
    # Verify folder exists
    folder = await db.folders.find_one({"_id": ObjectId(folder_id)})
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    # Check for existing file with same name (for versioning)
    existing = await db.documents.find_one({
        "folder_id": folder_id,
        "original_filename": file.filename
    })
    
    # Generate unique filename
    unique_id = str(uuid.uuid4())
    stored_filename = f"{unique_id}{file_ext}"
    file_path = UPLOADS_DIR / stored_filename
    
    # Save file
    with open(file_path, "wb") as f:
        f.write(content)
    
    mime_type, _ = mimetypes.guess_type(file.filename)
    
    if existing:
        # Version control - keep old version info
        old_versions = existing.get("previous_versions", [])
        old_versions.append({
            "filename": existing["filename"],
            "file_size": existing["file_size"],
            "uploaded_by": existing["uploaded_by"],
            "uploaded_at": existing["uploaded_at"].isoformat(),
            "version": existing.get("version", 1)
        })
        
        # Update document
        new_version = existing.get("version", 1) + 1
        await db.documents.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "filename": stored_filename,
                "file_size": len(content),
                "mime_type": mime_type or "application/octet-stream",
                "description": description or existing.get("description"),
                "uploaded_by": user["name"],
                "uploaded_by_role": user["role"],
                "uploaded_at": datetime.utcnow(),
                "version": new_version,
                "previous_versions": old_versions
            }}
        )
        
        await log_audit("document", str(existing["_id"]), "replace", 
                       {"filename": existing["original_filename"], "version": existing.get("version", 1)},
                       {"filename": file.filename, "version": new_version},
                       str(user["_id"]))
        
        return {"message": "File replaced successfully", "id": str(existing["_id"]), "version": new_version}
    else:
        # Create new document
        doc = {
            "filename": stored_filename,
            "original_filename": file.filename,
            "folder_id": folder_id,
            "file_size": len(content),
            "file_type": file_ext,
            "mime_type": mime_type or "application/octet-stream",
            "description": description,
            "uploaded_by": user["name"],
            "uploaded_by_role": user["role"],
            "uploaded_at": datetime.utcnow(),
            "version": 1,
            "previous_versions": []
        }
        
        result = await db.documents.insert_one(doc)
        
        await log_audit("document", str(result.inserted_id), "upload",
                       None,
                       {"filename": file.filename, "folder": folder["path"], "size": len(content)},
                       str(user["_id"]))
        
        return {"message": "File uploaded successfully", "id": str(result.inserted_id), "version": 1}

@api_router.get("/documents/files/{document_id}/download")
async def download_file(document_id: str, user: dict = Depends(get_current_user)):
    """Download a file - available to all authenticated users"""
    document = await db.documents.find_one({"_id": ObjectId(document_id)})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    file_path = UPLOADS_DIR / document["filename"]
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on server")
    
    return FileResponse(
        path=str(file_path),
        filename=document["original_filename"],
        media_type=document.get("mime_type", "application/octet-stream")
    )

@api_router.delete("/documents/files/{document_id}")
async def delete_file(document_id: str, user: dict = Depends(require_admin)):
    """Delete a file - Admin/Treasurer only"""
    document = await db.documents.find_one({"_id": ObjectId(document_id)})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Delete physical file
    file_path = UPLOADS_DIR / document["filename"]
    if file_path.exists():
        file_path.unlink()
    
    await db.documents.delete_one({"_id": ObjectId(document_id)})
    
    await log_audit("document", document_id, "delete",
                   {"filename": document["original_filename"], "folder_id": document["folder_id"]},
                   None,
                   str(user["_id"]))
    
    return {"message": "Document deleted successfully"}

# ============== RENAME ENDPOINTS ==============

class RenameRequest(BaseModel):
    new_name: str

@api_router.put("/documents/files/{document_id}/rename")
async def rename_file(document_id: str, request: RenameRequest, user: dict = Depends(require_admin)):
    """Rename a file - Admin only"""
    document = await db.documents.find_one({"_id": ObjectId(document_id)})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    old_name = document["original_filename"]
    new_name = request.new_name.strip()
    
    if not new_name:
        raise HTTPException(status_code=400, detail="New name cannot be empty")
    
    # Preserve the file extension if not provided in new name
    old_ext = os.path.splitext(old_name)[1]
    new_ext = os.path.splitext(new_name)[1]
    if not new_ext and old_ext:
        new_name = new_name + old_ext
    
    await db.documents.update_one(
        {"_id": ObjectId(document_id)},
        {"$set": {"original_filename": new_name}}
    )
    
    await log_audit("document", document_id, "rename",
                   {"filename": old_name},
                   {"filename": new_name},
                   str(user["_id"]))
    
    return {"message": "File renamed successfully", "new_name": new_name}

@api_router.put("/documents/folders/{folder_id}/rename")
async def rename_folder(folder_id: str, request: RenameRequest, user: dict = Depends(require_admin)):
    """Rename a folder - Admin only"""
    folder = await db.folders.find_one({"_id": ObjectId(folder_id)})
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    old_name = folder["name"]
    new_name = request.new_name.strip()
    
    if not new_name:
        raise HTTPException(status_code=400, detail="New name cannot be empty")
    
    # Check if folder with same name exists in same parent
    parent_id = folder.get("parent_id")
    existing = await db.folders.find_one({
        "name": new_name,
        "parent_id": parent_id,
        "_id": {"$ne": ObjectId(folder_id)}
    })
    if existing:
        raise HTTPException(status_code=400, detail="A folder with this name already exists")
    
    # Update folder name and path
    old_path = folder.get("path", f"/{old_name}")
    new_path = old_path.rsplit("/", 1)[0] + "/" + new_name if "/" in old_path else f"/{new_name}"
    
    await db.folders.update_one(
        {"_id": ObjectId(folder_id)},
        {"$set": {"name": new_name, "path": new_path}}
    )
    
    # Update paths of all child folders
    await db.folders.update_many(
        {"path": {"$regex": f"^{re.escape(old_path)}/"}},
        [{"$set": {"path": {"$replaceOne": {"input": "$path", "find": old_path, "replacement": new_path}}}}]
    )
    
    await log_audit("folder", folder_id, "rename",
                   {"name": old_name, "path": old_path},
                   {"name": new_name, "path": new_path},
                   str(user["_id"]))
    
    return {"message": "Folder renamed successfully", "new_name": new_name, "new_path": new_path}

@api_router.get("/documents/search", response_model=DocumentSearchResult)
async def search_documents(q: str, user: dict = Depends(get_current_user)):
    """Search documents and folders by name/keyword"""
    if len(q) < 2:
        raise HTTPException(status_code=400, detail="Search query must be at least 2 characters")
    
    # Search folders
    folder_query = {"name": {"$regex": q, "$options": "i"}}
    folders = await db.folders.find(folder_query).to_list(50)
    
    folder_results = []
    for f in folders:
        folder_id = str(f["_id"])
        children_count = await db.folders.count_documents({"parent_id": folder_id})
        files_count = await db.documents.count_documents({"folder_id": folder_id})
        folder_results.append(FolderResponse(
            id=folder_id,
            name=f["name"],
            parent_id=f.get("parent_id"),
            path=f.get("path", "/"),
            description=f.get("description"),
            created_by=f.get("created_by", "system"),
            created_at=f.get("created_at", datetime.utcnow()),
            children_count=children_count,
            files_count=files_count
        ))
    
    # Search documents
    doc_query = {"$or": [
        {"original_filename": {"$regex": q, "$options": "i"}},
        {"description": {"$regex": q, "$options": "i"}}
    ]}
    documents = await db.documents.find(doc_query).to_list(50)
    
    doc_results = []
    for doc in documents:
        folder_path = await get_folder_path(doc["folder_id"]) if doc.get("folder_id") else "/"
        doc_results.append(DocumentResponse(
            id=str(doc["_id"]),
            filename=doc["filename"],
            original_filename=doc["original_filename"],
            folder_id=doc["folder_id"],
            folder_path=folder_path,
            file_size=doc["file_size"],
            file_type=doc["file_type"],
            mime_type=doc.get("mime_type", "application/octet-stream"),
            description=doc.get("description"),
            uploaded_by=doc["uploaded_by"],
            uploaded_by_role=doc.get("uploaded_by_role", "admin"),
            uploaded_at=doc["uploaded_at"],
            version=doc.get("version", 1),
            previous_versions=doc.get("previous_versions", [])
        ))
    
    return DocumentSearchResult(documents=doc_results, folders=folder_results)

@api_router.get("/documents/breadcrumb/{folder_id}")
async def get_breadcrumb(folder_id: str, user: dict = Depends(get_current_user)):
    """Get breadcrumb path for a folder"""
    breadcrumb = []
    current_id = folder_id
    
    while current_id:
        folder = await db.folders.find_one({"_id": ObjectId(current_id)})
        if folder:
            breadcrumb.insert(0, {"id": str(folder["_id"]), "name": folder["name"]})
            current_id = folder.get("parent_id")
        else:
            break
    
    return breadcrumb

# ============== HEALTH CHECK ==============

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============== BOARD / ASSOCIATION MEMBERS MODULE ==============

class OfficeHolderCreate(BaseModel):
    role: Literal["president", "treasurer"]
    owner_id: str
    year: int
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class OfficeHolderUpdate(BaseModel):
    owner_id: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class DecisionCreate(BaseModel):
    title: str
    description: str
    decision_date: str
    participants: Optional[List[str]] = []
    document_ids: Optional[List[str]] = []  # Attached document IDs

class DecisionUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    decision_date: Optional[str] = None
    participants: Optional[List[str]] = None
    document_ids: Optional[List[str]] = None

# Get current year's leadership
@api_router.get("/board/current")
async def get_current_leadership(user: dict = Depends(get_current_user)):
    """Get current year's President and Treasurer"""
    current_year = datetime.now().year
    
    office_holders = await db.office_holders.find({"year": current_year}).to_list(None)
    
    result = {"president": None, "treasurer": None, "year": current_year}
    
    for holder in office_holders:
        owner = await db.users.find_one({"_id": ObjectId(holder["owner_id"])})
        owner_name = owner["name"] if owner else "Unknown"
        owner_email = owner["email"] if owner else ""
        
        holder_data = {
            "id": str(holder["_id"]),
            "owner_id": holder["owner_id"],
            "owner_name": owner_name,
            "owner_email": owner_email,
            "year": holder["year"],
            "start_date": holder.get("start_date", f"{current_year}-01-01"),
            "end_date": holder.get("end_date", f"{current_year}-12-31"),
            "appointed_at": holder.get("appointed_at", "").isoformat() if holder.get("appointed_at") else None
        }
        
        if holder["role"] == "president":
            result["president"] = holder_data
        elif holder["role"] == "treasurer":
            result["treasurer"] = holder_data
    
    return result

# Get committee members (derived from owners list)
@api_router.get("/board/committee")
async def get_committee_members(user: dict = Depends(get_current_user)):
    """Get all current committee members (current owners are automatically committee members)
    
    A current owner is defined as:
    - ownership_end_date is None (blank), OR
    - ownership_end_date >= current date
    """
    current_date = datetime.utcnow()
    
    # Query for current owners only
    owners = await db.users.find({
        "role": "owner",
        "$or": [
            {"ownership_end_date": None},
            {"ownership_end_date": {"$exists": False}},
            {"ownership_end_date": {"$gte": current_date}}
        ]
    }).to_list(None)
    
    members = []
    for owner in owners:
        # Get units assigned to this owner
        units = await db.units.find({"owner_ids": str(owner["_id"])}).to_list(None)
        unit_names = [u["display_name"] for u in units]
        
        members.append({
            "id": str(owner["_id"]),
            "name": owner["name"],
            "email": owner["email"],
            "phone": owner.get("phone", ""),
            "units": unit_names,
            "ownership_start_date": owner.get("ownership_start_date").isoformat() if owner.get("ownership_start_date") else None,
            "ownership_end_date": owner.get("ownership_end_date").isoformat() if owner.get("ownership_end_date") else None,
            "joined_at": owner.get("created_at", "").isoformat() if owner.get("created_at") else None
        })
    
    return members

# Get historical records
@api_router.get("/board/history")
async def get_board_history(user: dict = Depends(get_current_user)):
    """Get historical office holder records by year (2025 onwards)"""
    office_holders = await db.office_holders.find({"year": {"$gte": 2025}}).sort("year", -1).to_list(None)
    
    # Group by year
    history = {}
    for holder in office_holders:
        year = holder["year"]
        if year not in history:
            history[year] = {"year": year, "president": None, "treasurer": None}
        
        owner = await db.users.find_one({"_id": ObjectId(holder["owner_id"])})
        owner_name = owner["name"] if owner else "Unknown"
        
        holder_data = {
            "id": str(holder["_id"]),
            "owner_id": holder["owner_id"],
            "owner_name": owner_name,
            "start_date": holder.get("start_date"),
            "end_date": holder.get("end_date")
        }
        
        if holder["role"] == "president":
            history[year]["president"] = holder_data
        elif holder["role"] == "treasurer":
            history[year]["treasurer"] = holder_data
    
    # Convert to list sorted by year descending
    return list(history.values())

# Set office holder (Admin only)
@api_router.post("/board/office-holders")
async def create_office_holder(data: OfficeHolderCreate, user: dict = Depends(require_admin)):
    """Appoint a President or Treasurer for a year"""
    # Verify owner exists
    owner = await db.users.find_one({"_id": ObjectId(data.owner_id), "role": "owner"})
    if not owner:
        raise HTTPException(status_code=404, detail="Owner not found")
    
    # Validate owner is a current owner (Issue 4)
    current_date = datetime.utcnow()
    ownership_end = owner.get("ownership_end_date")
    if ownership_end and ownership_end < current_date:
        raise HTTPException(
            status_code=400, 
            detail="This owner is no longer a current owner and cannot hold an officer role. Please assign a new eligible owner."
        )
    
    # Check if role already filled for this year (Issue 5)
    existing = await db.office_holders.find_one({
        "role": data.role, 
        "year": data.year,
        "end_date": {"$gte": datetime.utcnow().isoformat()[:10]}  # Not ended yet
    })
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"{data.role.capitalize()} already appointed for {data.year}. To replace, first end the current term."
        )
    
    holder_doc = {
        "role": data.role,
        "owner_id": data.owner_id,
        "year": data.year,
        "start_date": data.start_date or f"{data.year}-01-01",
        "end_date": data.end_date or f"{data.year}-12-31",
        "appointed_at": datetime.utcnow(),
        "appointed_by": str(user["_id"])
    }
    
    result = await db.office_holders.insert_one(holder_doc)
    
    await log_audit("office_holder", str(result.inserted_id), "appoint",
                   None,
                   {"role": data.role, "owner": owner["name"], "year": data.year},
                   str(user["_id"]))
    
    return {"message": f"{data.role.capitalize()} appointed successfully", "id": str(result.inserted_id)}

# Get eligible owners for officer roles (current owners only)
@api_router.get("/board/eligible-owners")
async def get_eligible_owners(user: dict = Depends(require_admin)):
    """Get list of owners eligible for officer roles (current owners only)"""
    current_date = datetime.utcnow()
    
    # Query for current owners only
    owners = await db.users.find({
        "role": "owner",
        "$or": [
            {"ownership_end_date": None},
            {"ownership_end_date": {"$exists": False}},
            {"ownership_end_date": {"$gte": current_date}}
        ]
    }).to_list(None)
    
    return [
        {
            "id": str(o["_id"]),
            "name": o["name"],
            "email": o["email"],
            "ownership_start_date": o.get("ownership_start_date").isoformat() if o.get("ownership_start_date") else None,
            "ownership_end_date": o.get("ownership_end_date").isoformat() if o.get("ownership_end_date") else None
        }
        for o in owners
    ]

# Update office holder (Admin only)
@api_router.put("/board/office-holders/{holder_id}")
async def update_office_holder(holder_id: str, data: OfficeHolderUpdate, user: dict = Depends(require_admin)):
    """Update an office holder appointment"""
    holder = await db.office_holders.find_one({"_id": ObjectId(holder_id)})
    if not holder:
        raise HTTPException(status_code=404, detail="Office holder record not found")
    
    old_data = {"role": holder["role"], "year": holder["year"]}
    
    update_fields = {}
    if data.owner_id:
        owner = await db.users.find_one({"_id": ObjectId(data.owner_id), "role": "owner"})
        if not owner:
            raise HTTPException(status_code=404, detail="Owner not found")
        
        # Validate new owner is a current owner
        current_date = datetime.utcnow()
        ownership_end = owner.get("ownership_end_date")
        if ownership_end and ownership_end < current_date:
            raise HTTPException(
                status_code=400, 
                detail="This owner is no longer a current owner and cannot hold an officer role. Please assign a new eligible owner."
            )
        
        update_fields["owner_id"] = data.owner_id
    
    if data.start_date:
        update_fields["start_date"] = data.start_date
    if data.end_date:
        update_fields["end_date"] = data.end_date
    
    if update_fields:
        await db.office_holders.update_one({"_id": ObjectId(holder_id)}, {"$set": update_fields})
        
        await log_audit("office_holder", holder_id, "update", old_data, update_fields, str(user["_id"]))
    
    return {"message": "Office holder updated successfully"}

# End officer term and appoint new one (for mid-year replacements)
@api_router.post("/board/office-holders/{holder_id}/replace")
async def replace_office_holder(holder_id: str, new_owner_id: str, user: dict = Depends(require_admin)):
    """Replace an existing officer with a new one (ends current term and creates new)"""
    holder = await db.office_holders.find_one({"_id": ObjectId(holder_id)})
    if not holder:
        raise HTTPException(status_code=404, detail="Office holder record not found")
    
    # Validate new owner
    new_owner = await db.users.find_one({"_id": ObjectId(new_owner_id), "role": "owner"})
    if not new_owner:
        raise HTTPException(status_code=404, detail="New owner not found")
    
    # Validate new owner is current
    current_date = datetime.utcnow()
    ownership_end = new_owner.get("ownership_end_date")
    if ownership_end and ownership_end < current_date:
        raise HTTPException(
            status_code=400, 
            detail="This owner is no longer a current owner and cannot hold an officer role."
        )
    
    today = current_date.strftime("%Y-%m-%d")
    year = holder["year"]
    
    # End current holder's term (yesterday)
    yesterday = (current_date - timedelta(days=1)).strftime("%Y-%m-%d")
    await db.office_holders.update_one(
        {"_id": ObjectId(holder_id)},
        {"$set": {"end_date": yesterday}}
    )
    
    # Create new holder starting today
    new_holder_doc = {
        "role": holder["role"],
        "owner_id": new_owner_id,
        "year": year,
        "start_date": today,
        "end_date": f"{year}-12-31",
        "appointed_at": datetime.utcnow(),
        "appointed_by": str(user["_id"])
    }
    
    result = await db.office_holders.insert_one(new_holder_doc)
    
    old_owner = await db.users.find_one({"_id": ObjectId(holder["owner_id"])})
    old_owner_name = old_owner["name"] if old_owner else "Unknown"
    
    await log_audit("office_holder", str(result.inserted_id), "replace",
                   {"previous_holder": old_owner_name, "role": holder["role"]},
                   {"new_holder": new_owner["name"], "year": year},
                   str(user["_id"]))
    
    return {
        "message": f"{holder['role'].capitalize()} replaced successfully",
        "old_holder_id": holder_id,
        "new_holder_id": str(result.inserted_id)
    }

# Delete office holder (Admin only)
@api_router.delete("/board/office-holders/{holder_id}")
async def delete_office_holder(holder_id: str, user: dict = Depends(require_admin)):
    """Remove an office holder appointment"""
    holder = await db.office_holders.find_one({"_id": ObjectId(holder_id)})
    if not holder:
        raise HTTPException(status_code=404, detail="Office holder record not found")
    
    await db.office_holders.delete_one({"_id": ObjectId(holder_id)})
    
    await log_audit("office_holder", holder_id, "delete",
                   {"role": holder["role"], "year": holder["year"]},
                   None, str(user["_id"]))
    
    return {"message": "Office holder removed successfully"}

# Get all decisions
@api_router.get("/board/decisions")
async def get_decisions(user: dict = Depends(get_current_user)):
    """Get all recorded decisions and resolutions"""
    decisions = await db.decisions.find().sort("decision_date", -1).to_list(None)
    
    result = []
    for decision in decisions:
        # Get attached documents info
        doc_ids = decision.get("document_ids", [])
        documents = []
        for doc_id in doc_ids:
            doc = await db.documents.find_one({"_id": ObjectId(doc_id)})
            if doc:
                documents.append({
                    "id": str(doc["_id"]),
                    "filename": doc["original_filename"]
                })
        
        result.append({
            "id": str(decision["_id"]),
            "title": decision["title"],
            "description": decision["description"],
            "decision_date": decision["decision_date"],
            "participants": decision.get("participants", []),
            "documents": documents,
            "created_at": decision.get("created_at", "").isoformat() if decision.get("created_at") else None,
            "created_by": decision.get("created_by")
        })
    
    return result

# Create decision (Admin only)
@api_router.post("/board/decisions")
async def create_decision(data: DecisionCreate, user: dict = Depends(require_admin)):
    """Record a new decision or resolution"""
    decision_doc = {
        "title": data.title,
        "description": data.description,
        "decision_date": data.decision_date,
        "participants": data.participants or [],
        "document_ids": data.document_ids or [],
        "created_at": datetime.utcnow(),
        "created_by": str(user["_id"])
    }
    
    result = await db.decisions.insert_one(decision_doc)
    
    await log_audit("decision", str(result.inserted_id), "create",
                   None, {"title": data.title, "date": data.decision_date},
                   str(user["_id"]))
    
    return {"message": "Decision recorded successfully", "id": str(result.inserted_id)}

# Update decision (Admin only)
@api_router.put("/board/decisions/{decision_id}")
async def update_decision(decision_id: str, data: DecisionUpdate, user: dict = Depends(require_admin)):
    """Update a decision record"""
    decision = await db.decisions.find_one({"_id": ObjectId(decision_id)})
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")
    
    update_fields = {}
    if data.title is not None:
        update_fields["title"] = data.title
    if data.description is not None:
        update_fields["description"] = data.description
    if data.decision_date is not None:
        update_fields["decision_date"] = data.decision_date
    if data.participants is not None:
        update_fields["participants"] = data.participants
    if data.document_ids is not None:
        update_fields["document_ids"] = data.document_ids
    
    if update_fields:
        await db.decisions.update_one({"_id": ObjectId(decision_id)}, {"$set": update_fields})
        
        await log_audit("decision", decision_id, "update",
                       {"title": decision["title"]}, update_fields, str(user["_id"]))
    
    return {"message": "Decision updated successfully"}

# Delete decision (Admin only)
@api_router.delete("/board/decisions/{decision_id}")
async def delete_decision(decision_id: str, user: dict = Depends(require_admin)):
    """Delete a decision record"""
    decision = await db.decisions.find_one({"_id": ObjectId(decision_id)})
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")
    
    await db.decisions.delete_one({"_id": ObjectId(decision_id)})
    
    await log_audit("decision", decision_id, "delete",
                   {"title": decision["title"]}, None, str(user["_id"]))
    
    return {"message": "Decision deleted successfully"}

# Role responsibilities (static content)
@api_router.get("/board/responsibilities")
async def get_role_responsibilities(user: dict = Depends(get_current_user)):
    """Get role responsibilities for each position"""
    return {
        "president": [
            "Lead association meetings",
            "Represent the association in official matters",
            "Ensure execution of community decisions",
            "Coordinate with committee members"
        ],
        "treasurer": [
            "Maintain financial records",
            "Track association funds and expenses",
            "Present financial updates to owners",
            "Ensure financial transparency"
        ],
        "committee_member": [
            "Participate in discussions",
            "Vote on association matters",
            "Support maintenance and community decisions"
        ]
    }

# Election guidelines (static content)
@api_router.get("/board/election-guidelines")
async def get_election_guidelines(user: dict = Depends(get_current_user)):
    """Get election process and guidelines"""
    return {
        "schedule": {
            "frequency": "Once every year",
            "month": "January",
            "term_duration": "January - December of the same year"
        },
        "process": [
            "Owners nominate candidates from among the committee members",
            "Voting is conducted among owners",
            "Selected candidates assume roles of President and Treasurer",
            "The Admin records the final election result in the system"
        ],
        "rules": [
            "Only one President can exist at a time",
            "Only one Treasurer can exist at a time",
            "President and Treasurer must be selected from existing owners",
            "All owners are automatically Committee Members"
        ]
    }

# Include the router in the main app - MUST be after all routes are defined
app.include_router(api_router)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
