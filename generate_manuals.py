#!/usr/bin/env python3
"""
Generate PDF User Manuals for Unity Towers HOA Management System
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, black, white
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, ListFlowable, ListItem
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from datetime import datetime

# Colors
PRIMARY_BLUE = HexColor('#2563eb')
DARK_BLUE = HexColor('#1e40af')
LIGHT_BLUE = HexColor('#eff6ff')
GRAY = HexColor('#64748b')
DARK_GRAY = HexColor('#1e293b')
GREEN = HexColor('#16a34a')
AMBER = HexColor('#f59e0b')

def create_styles():
    styles = getSampleStyleSheet()
    
    # Title style
    styles.add(ParagraphStyle(
        name='MainTitle',
        parent=styles['Title'],
        fontSize=28,
        textColor=PRIMARY_BLUE,
        spaceAfter=30,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    ))
    
    # Subtitle
    styles.add(ParagraphStyle(
        name='Subtitle',
        parent=styles['Normal'],
        fontSize=14,
        textColor=GRAY,
        spaceAfter=20,
        alignment=TA_CENTER
    ))
    
    # Chapter title
    styles.add(ParagraphStyle(
        name='ChapterTitle',
        parent=styles['Heading1'],
        fontSize=20,
        textColor=DARK_BLUE,
        spaceBefore=20,
        spaceAfter=15,
        fontName='Helvetica-Bold'
    ))
    
    # Section title
    styles.add(ParagraphStyle(
        name='SectionTitle',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=PRIMARY_BLUE,
        spaceBefore=15,
        spaceAfter=10,
        fontName='Helvetica-Bold'
    ))
    
    # Body text
    styles.add(ParagraphStyle(
        name='CustomBody',
        parent=styles['Normal'],
        fontSize=11,
        textColor=DARK_GRAY,
        spaceAfter=8,
        alignment=TA_JUSTIFY,
        leading=14
    ))
    
    # Bullet point
    styles.add(ParagraphStyle(
        name='BulletText',
        parent=styles['Normal'],
        fontSize=11,
        textColor=DARK_GRAY,
        leftIndent=20,
        spaceAfter=5,
        leading=14
    ))
    
    # Note/Tip style
    styles.add(ParagraphStyle(
        name='Note',
        parent=styles['Normal'],
        fontSize=10,
        textColor=GRAY,
        leftIndent=15,
        rightIndent=15,
        spaceBefore=10,
        spaceAfter=10,
        backColor=LIGHT_BLUE,
        borderPadding=10
    ))
    
    # Step style
    styles.add(ParagraphStyle(
        name='Step',
        parent=styles['Normal'],
        fontSize=11,
        textColor=DARK_GRAY,
        leftIndent=30,
        spaceAfter=8,
        leading=14
    ))
    
    return styles

def create_owner_manual():
    """Generate Owner User Manual PDF"""
    doc = SimpleDocTemplate(
        "/app/uploads/Unity_Towers_Owner_Manual.pdf",
        pagesize=letter,
        rightMargin=72,
        leftMargin=72,
        topMargin=72,
        bottomMargin=72
    )
    
    styles = create_styles()
    story = []
    
    # ===== COVER PAGE =====
    story.append(Spacer(1, 2*inch))
    story.append(Paragraph("Unity Towers", styles['MainTitle']))
    story.append(Paragraph("HOA Management System", styles['MainTitle']))
    story.append(Spacer(1, 0.5*inch))
    story.append(Paragraph("Owner User Manual", styles['Subtitle']))
    story.append(Spacer(1, 0.3*inch))
    story.append(Paragraph(f"Version 1.0 | {datetime.now().strftime('%B %Y')}", styles['Subtitle']))
    story.append(PageBreak())
    
    # ===== TABLE OF CONTENTS =====
    story.append(Paragraph("Table of Contents", styles['ChapterTitle']))
    story.append(Spacer(1, 0.2*inch))
    
    toc_data = [
        ["1.", "Welcome & Introduction", "3"],
        ["2.", "Getting Started", "4"],
        ["3.", "Dashboard Overview", "5"],
        ["4.", "Viewing Your Units", "6"],
        ["5.", "Billing & Payments", "7"],
        ["6.", "Activity Log", "8"],
        ["7.", "Documents", "9"],
        ["8.", "Profile Management", "10"],
        ["9.", "FAQ & Support", "11"],
    ]
    
    toc_table = Table(toc_data, colWidths=[0.5*inch, 4*inch, 0.5*inch])
    toc_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('TEXTCOLOR', (0, 0), (-1, -1), DARK_GRAY),
        ('ALIGN', (2, 0), (2, -1), 'RIGHT'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(toc_table)
    story.append(PageBreak())
    
    # ===== CHAPTER 1: WELCOME =====
    story.append(Paragraph("1. Welcome & Introduction", styles['ChapterTitle']))
    story.append(Paragraph(
        "Welcome to Unity Towers Property Association Management System! This application helps you stay "
        "connected with your property association, view your unit information, track charges and payments, "
        "access important documents, and stay informed about association activities.",
        styles['CustomBody']
    ))
    story.append(Spacer(1, 0.2*inch))
    
    story.append(Paragraph("What You Can Do as an Owner:", styles['SectionTitle']))
    bullets = [
        "• View your assigned unit(s) and property details",
        "• Track your charges, payments, and account balance",
        "• View the association's financial overview",
        "• Access and download HOA documents",
        "• Review activity logs and association updates",
        "• Update your contact information",
    ]
    for bullet in bullets:
        story.append(Paragraph(bullet, styles['BulletText']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph(
        "💡 Tip: As an owner, you have read-only access to most features. For any changes to unit "
        "assignments or financial records, please contact your HOA Administrator.",
        styles['Note']
    ))
    story.append(PageBreak())
    
    # ===== CHAPTER 2: GETTING STARTED =====
    story.append(Paragraph("2. Getting Started", styles['ChapterTitle']))
    
    story.append(Paragraph("Creating Your Account", styles['SectionTitle']))
    story.append(Paragraph(
        "If you don't have an account yet, you can register through the app:",
        styles['CustomBody']
    ))
    steps = [
        "1. Open the Unity Towers app or visit the web portal",
        "2. Click on 'Sign Up' at the bottom of the login screen",
        "3. Enter your Full Name, Email Address, Phone Number, and create a Password",
        "4. Click 'Create Account'",
        "5. Your account will be created with 'Owner' role",
    ]
    for step in steps:
        story.append(Paragraph(step, styles['Step']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("Logging In", styles['SectionTitle']))
    steps = [
        "1. Open the Unity Towers app",
        "2. Enter your registered Email Address",
        "3. Enter your Password",
        "4. Tap 'Sign In'",
        "5. You'll be directed to your Dashboard",
    ]
    for step in steps:
        story.append(Paragraph(step, styles['Step']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph(
        "💡 If you forget your password, contact your HOA Administrator for a password reset.",
        styles['Note']
    ))
    story.append(PageBreak())
    
    # ===== CHAPTER 3: DASHBOARD =====
    story.append(Paragraph("3. Dashboard Overview", styles['ChapterTitle']))
    story.append(Paragraph(
        "The Dashboard is your home screen, providing a quick overview of the property association's "
        "financial status and key metrics.",
        styles['CustomBody']
    ))
    
    story.append(Paragraph("Dashboard Metrics:", styles['SectionTitle']))
    metrics = [
        "• Total Units: Number of units in the property",
        "• Condos: Number of condominium units",
        "• Shops: Number of commercial shop units",
        "• Total Outstanding: Total amount pending across all units",
        "• Overdue: Number of accounts with overdue payments",
        "• Reserve Balance: Association's reserve fund balance",
        "• Total Collected: Total payments received",
        "• Payments This Year: Payments received in current year",
        "• Expenses This Year: Total expenses for current year",
    ]
    for metric in metrics:
        story.append(Paragraph(metric, styles['BulletText']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("Recent Activity:", styles['SectionTitle']))
    story.append(Paragraph(
        "The dashboard also shows recent payment activity, helping you stay informed about association finances.",
        styles['CustomBody']
    ))
    story.append(PageBreak())
    
    # ===== CHAPTER 4: UNITS =====
    story.append(Paragraph("4. Viewing Your Units", styles['ChapterTitle']))
    story.append(Paragraph(
        "The Units tab displays all property units. As an owner, you can view unit information but cannot "
        "make changes.",
        styles['CustomBody']
    ))
    
    story.append(Paragraph("Unit Information:", styles['SectionTitle']))
    bullets = [
        "• Unit Name/Number (e.g., C1, S1)",
        "• Unit Type (Condo or Shop)",
        "• Current Balance",
        "• Assigned Owner (if any)",
    ]
    for bullet in bullets:
        story.append(Paragraph(bullet, styles['BulletText']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("Understanding Balances:", styles['SectionTitle']))
    story.append(Paragraph(
        "• Positive Balance: Amount owed to the association",
        styles['BulletText']
    ))
    story.append(Paragraph(
        "• Negative Balance (Credit): Overpayment or credit on account",
        styles['BulletText']
    ))
    story.append(PageBreak())
    
    # ===== CHAPTER 5: BILLING =====
    story.append(Paragraph("5. Billing & Payments", styles['ChapterTitle']))
    story.append(Paragraph(
        "The Billing tab shows the association's allocation formula, annual charges, and payment records.",
        styles['CustomBody']
    ))
    
    story.append(Paragraph("Annual Allocation Formula:", styles['SectionTitle']))
    story.append(Paragraph(
        "Unity Towers uses a specific formula to calculate annual maintenance charges:",
        styles['CustomBody']
    ))
    story.append(Paragraph("• Condo: W/5 + 0.40×E/5 + 0.60×E/8", styles['BulletText']))
    story.append(Paragraph("• Shop: 0.60×E/8", styles['BulletText']))
    story.append(Paragraph("Where W = Water charges, E = Electricity charges", styles['BulletText']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("Viewing Your Charges:", styles['SectionTitle']))
    story.append(Paragraph(
        "You can see annual setup information including water and electricity totals, and how charges "
        "are calculated for each unit type.",
        styles['CustomBody']
    ))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("Payment Methods:", styles['SectionTitle']))
    story.append(Paragraph(
        "To make payments, please contact your HOA Administrator or use the designated payment channels "
        "provided by your association.",
        styles['CustomBody']
    ))
    story.append(PageBreak())
    
    # ===== CHAPTER 6: ACTIVITY =====
    story.append(Paragraph("6. Activity Log", styles['ChapterTitle']))
    story.append(Paragraph(
        "The Activity tab provides a complete audit trail of all association activities and changes.",
        styles['CustomBody']
    ))
    
    story.append(Paragraph("What's Logged:", styles['SectionTitle']))
    bullets = [
        "• Payment recordings",
        "• Charge postings",
        "• Unit assignments",
        "• Document uploads",
        "• Profile updates",
        "• All financial changes with old/new values",
    ]
    for bullet in bullets:
        story.append(Paragraph(bullet, styles['BulletText']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("Filtering Activities:", styles['SectionTitle']))
    story.append(Paragraph(
        "Use the date filters to view activities within a specific time range. This helps you track "
        "changes and maintain transparency.",
        styles['CustomBody']
    ))
    story.append(PageBreak())
    
    # ===== CHAPTER 7: DOCUMENTS =====
    story.append(Paragraph("7. Documents", styles['ChapterTitle']))
    story.append(Paragraph(
        "The Documents tab provides access to all HOA documents organized in folders.",
        styles['CustomBody']
    ))
    
    story.append(Paragraph("Document Categories:", styles['SectionTitle']))
    bullets = [
        "• HOA Legal & Governance - Bylaws, rules, regulations",
        "• Financial Records - Budgets, statements, audits",
        "• Utility Bills - Water and electricity records",
        "• Meeting Minutes - Board meeting records",
        "• Maintenance & Vendor Records - Service contracts",
        "• HOA Communications - Newsletters, notices",
        "• Disputes & Violations - Resolution records",
    ]
    for bullet in bullets:
        story.append(Paragraph(bullet, styles['BulletText']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("Browsing & Downloading:", styles['SectionTitle']))
    steps = [
        "1. Tap on a folder to open it",
        "2. Navigate through subfolders using breadcrumbs",
        "3. Tap on a file to view its details",
        "4. Click 'Download' to save the file",
        "5. Use the search bar to find specific documents",
    ]
    for step in steps:
        story.append(Paragraph(step, styles['Step']))
    story.append(PageBreak())
    
    # ===== CHAPTER 8: PROFILE =====
    story.append(Paragraph("8. Profile Management", styles['ChapterTitle']))
    story.append(Paragraph(
        "The Profile tab allows you to view and update your personal information.",
        styles['CustomBody']
    ))
    
    story.append(Paragraph("Updating Your Information:", styles['SectionTitle']))
    steps = [
        "1. Go to the Profile tab",
        "2. Tap 'Edit Profile'",
        "3. Update your Name, Phone, or Email",
        "4. Tap 'Save Changes'",
    ]
    for step in steps:
        story.append(Paragraph(step, styles['Step']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("Logging Out:", styles['SectionTitle']))
    story.append(Paragraph(
        "Tap the 'Logout' button at the bottom of the Profile screen. Confirm when prompted.",
        styles['CustomBody']
    ))
    story.append(PageBreak())
    
    # ===== CHAPTER 9: FAQ =====
    story.append(Paragraph("9. FAQ & Support", styles['ChapterTitle']))
    
    faqs = [
        ("Q: How do I make a payment?", 
         "A: Contact your HOA Administrator for payment instructions. The app displays your balance but payments are processed externally."),
        ("Q: Why can't I edit unit information?",
         "A: As an owner, you have read-only access. Contact your Administrator for any changes."),
        ("Q: How do I get assigned to my unit?",
         "A: Your HOA Administrator will assign you to your unit. Contact them with your ownership details."),
        ("Q: Can I upload documents?",
         "A: Document uploads are restricted to Administrators. Contact them if you need to submit documents."),
        ("Q: Who do I contact for support?",
         "A: Reach out to your HOA Administrator for any questions or issues."),
    ]
    
    for q, a in faqs:
        story.append(Paragraph(q, styles['SectionTitle']))
        story.append(Paragraph(a, styles['CustomBody']))
        story.append(Spacer(1, 0.1*inch))
    
    story.append(Spacer(1, 0.5*inch))
    story.append(Paragraph(
        "Thank you for using Unity Towers HOA Management System!",
        styles['Subtitle']
    ))
    
    # Build PDF
    doc.build(story)
    print("✅ Owner Manual created: /app/uploads/Unity_Towers_Owner_Manual.pdf")


def create_admin_manual():
    """Generate Admin User Manual PDF"""
    doc = SimpleDocTemplate(
        "/app/uploads/Unity_Towers_Admin_Manual.pdf",
        pagesize=letter,
        rightMargin=72,
        leftMargin=72,
        topMargin=72,
        bottomMargin=72
    )
    
    styles = create_styles()
    story = []
    
    # ===== COVER PAGE =====
    story.append(Spacer(1, 2*inch))
    story.append(Paragraph("Unity Towers", styles['MainTitle']))
    story.append(Paragraph("HOA Management System", styles['MainTitle']))
    story.append(Spacer(1, 0.5*inch))
    story.append(Paragraph("Administrator Manual", styles['Subtitle']))
    story.append(Spacer(1, 0.3*inch))
    story.append(Paragraph(f"Version 1.0 | {datetime.now().strftime('%B %Y')}", styles['Subtitle']))
    story.append(PageBreak())
    
    # ===== TABLE OF CONTENTS =====
    story.append(Paragraph("Table of Contents", styles['ChapterTitle']))
    story.append(Spacer(1, 0.2*inch))
    
    toc_data = [
        ["1.", "Introduction & Initial Setup", "3"],
        ["2.", "Dashboard Overview", "4"],
        ["3.", "Unit Management", "5"],
        ["4.", "Owner Management", "7"],
        ["5.", "Billing & Annual Allocation", "8"],
        ["6.", "Recording Payments", "10"],
        ["7.", "Managing Expenses", "11"],
        ["8.", "Reports & Year-End", "12"],
        ["9.", "Document Management", "13"],
        ["10.", "Audit Log & Compliance", "15"],
        ["11.", "Profile & System Admin", "16"],
    ]
    
    toc_table = Table(toc_data, colWidths=[0.5*inch, 4*inch, 0.5*inch])
    toc_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('TEXTCOLOR', (0, 0), (-1, -1), DARK_GRAY),
        ('ALIGN', (2, 0), (2, -1), 'RIGHT'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(toc_table)
    story.append(PageBreak())
    
    # ===== CHAPTER 1: INTRODUCTION =====
    story.append(Paragraph("1. Introduction & Initial Setup", styles['ChapterTitle']))
    story.append(Paragraph(
        "Welcome to the Unity Towers HOA Management System Administrator Guide. As an administrator, "
        "you have full access to manage units, owners, billing, documents, and all financial operations.",
        styles['CustomBody']
    ))
    
    story.append(Paragraph("Administrator Capabilities:", styles['SectionTitle']))
    bullets = [
        "• Manage all property units and assignments",
        "• Create and manage owner accounts",
        "• Set up annual allocations and post charges",
        "• Record payments and manage expenses",
        "• Upload and organize documents",
        "• Generate year-end reports",
        "• View complete audit trails",
    ]
    for bullet in bullets:
        story.append(Paragraph(bullet, styles['BulletText']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("Initial Login:", styles['SectionTitle']))
    story.append(Paragraph("Default Admin Credentials:", styles['CustomBody']))
    story.append(Paragraph("• Email: admin@unitytowers.com", styles['BulletText']))
    story.append(Paragraph("• Password: admin123", styles['BulletText']))
    story.append(Paragraph(
        "⚠️ Important: Change the default password immediately after first login for security.",
        styles['Note']
    ))
    story.append(PageBreak())
    
    # ===== CHAPTER 2: DASHBOARD =====
    story.append(Paragraph("2. Dashboard Overview", styles['ChapterTitle']))
    story.append(Paragraph(
        "The Dashboard provides a comprehensive overview of your property association's status.",
        styles['CustomBody']
    ))
    
    story.append(Paragraph("Key Metrics:", styles['SectionTitle']))
    metrics_data = [
        ["Metric", "Description"],
        ["Total Units", "Total number of units in the property"],
        ["Condos / Shops", "Breakdown by unit type"],
        ["Total Outstanding", "Sum of all unpaid balances"],
        ["Overdue", "Number of accounts past due"],
        ["Reserve Balance", "Current reserve fund amount"],
        ["Total Collected", "All-time payment collection"],
        ["Payments This Year", "Current year collections"],
        ["Expenses This Year", "Current year expenditures"],
    ]
    
    metrics_table = Table(metrics_data, colWidths=[2*inch, 4*inch])
    metrics_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), PRIMARY_BLUE),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 0.5, GRAY),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(metrics_table)
    story.append(PageBreak())
    
    # ===== CHAPTER 3: UNIT MANAGEMENT =====
    story.append(Paragraph("3. Unit Management", styles['ChapterTitle']))
    story.append(Paragraph(
        "The Units tab allows you to view and manage all property units.",
        styles['CustomBody']
    ))
    
    story.append(Paragraph("Viewing Units:", styles['SectionTitle']))
    story.append(Paragraph(
        "Units are organized by type (Condos and Shops). Each unit card shows:",
        styles['CustomBody']
    ))
    bullets = [
        "• Unit identifier (e.g., C1, S1)",
        "• Current balance",
        "• Assigned owner (if any)",
        "• Assignment button",
    ]
    for bullet in bullets:
        story.append(Paragraph(bullet, styles['BulletText']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("Assigning an Owner to a Unit:", styles['SectionTitle']))
    steps = [
        "1. Navigate to the Units tab",
        "2. Find the unit you want to assign",
        "3. Tap the 'Assign' button on the unit card",
        "4. Select an owner from the dropdown list",
        "5. Confirm the assignment",
        "6. The owner will now see this unit in their account",
    ]
    for step in steps:
        story.append(Paragraph(step, styles['Step']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph(
        "💡 Tip: Owners must be registered in the system before they can be assigned to units. "
        "Create owner accounts first if needed.",
        styles['Note']
    ))
    story.append(PageBreak())
    
    # ===== CHAPTER 4: OWNER MANAGEMENT =====
    story.append(Paragraph("4. Owner Management", styles['ChapterTitle']))
    story.append(Paragraph(
        "Owners can self-register through the app, or you can manage them through the system.",
        styles['CustomBody']
    ))
    
    story.append(Paragraph("Owner Self-Registration:", styles['SectionTitle']))
    story.append(Paragraph(
        "Owners can create their own accounts by clicking 'Sign Up' on the login screen. "
        "They will automatically be assigned the 'owner' role.",
        styles['CustomBody']
    ))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("Owner Permissions:", styles['SectionTitle']))
    bullets = [
        "• View all units and their information (read-only)",
        "• View billing information and payment history",
        "• View activity logs",
        "• Browse and download documents",
        "• Edit their own profile information",
    ]
    for bullet in bullets:
        story.append(Paragraph(bullet, styles['BulletText']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph(
        "⚠️ Security: Owners cannot edit financial records, unit assignments, or upload documents. "
        "All sensitive operations require admin privileges.",
        styles['Note']
    ))
    story.append(PageBreak())
    
    # ===== CHAPTER 5: BILLING =====
    story.append(Paragraph("5. Billing & Annual Allocation", styles['ChapterTitle']))
    story.append(Paragraph(
        "The Billing tab is where you manage annual charges and the allocation formula.",
        styles['CustomBody']
    ))
    
    story.append(Paragraph("Unity Towers Allocation Formula:", styles['SectionTitle']))
    story.append(Paragraph("The system uses the Kerala HOA formula:", styles['CustomBody']))
    story.append(Spacer(1, 0.1*inch))
    
    formula_data = [
        ["Unit Type", "Formula"],
        ["Condo", "W/5 + (0.40 × E/5) + (0.60 × E/8)"],
        ["Shop", "0.60 × E/8"],
    ]
    formula_table = Table(formula_data, colWidths=[1.5*inch, 4*inch])
    formula_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), PRIMARY_BLUE),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('GRID', (0, 0), (-1, -1), 0.5, GRAY),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
    ]))
    story.append(formula_table)
    story.append(Paragraph("Where W = Total Water charges, E = Total Electricity charges", styles['BulletText']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("Creating Annual Allocation:", styles['SectionTitle']))
    steps = [
        "1. Go to Billing tab → Annual Allocation section",
        "2. Click 'Create New Setup' (if no setup exists)",
        "3. Enter the Year (e.g., 2026)",
        "4. Enter Total Water Charges (W)",
        "5. Enter Total Electricity Charges (E)",
        "6. The system auto-calculates per-unit charges",
        "7. Review the calculated amounts",
    ]
    for step in steps:
        story.append(Paragraph(step, styles['Step']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("Approving & Posting Charges:", styles['SectionTitle']))
    steps = [
        "1. Review the annual setup details",
        "2. Click 'Approve' to lock the setup",
        "3. After approval, click 'Post Charges'",
        "4. Choose single annual charge or monthly split",
        "5. Confirm posting - charges are created for all units",
        "6. Unit balances are automatically updated",
    ]
    for step in steps:
        story.append(Paragraph(step, styles['Step']))
    
    story.append(Paragraph(
        "⚠️ Important: Once charges are posted, they cannot be undone. Review carefully before posting.",
        styles['Note']
    ))
    story.append(PageBreak())
    
    # ===== CHAPTER 6: PAYMENTS =====
    story.append(Paragraph("6. Recording Payments", styles['ChapterTitle']))
    story.append(Paragraph(
        "Record payments received from unit owners to update their account balances.",
        styles['CustomBody']
    ))
    
    story.append(Paragraph("Recording a Payment:", styles['SectionTitle']))
    steps = [
        "1. Go to Billing tab → Record Payment section",
        "2. Select the unit from the list",
        "3. Enter the payment amount",
        "4. Select payment method (Cash, Check, Bank Transfer, Online)",
        "5. Add any reference number or notes",
        "6. Click 'Record Payment'",
        "7. The unit's balance is automatically updated",
    ]
    for step in steps:
        story.append(Paragraph(step, styles['Step']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("Payment Methods:", styles['SectionTitle']))
    bullets = [
        "• Cash - Physical cash payment",
        "• Check - Bank check payment",
        "• Bank Transfer - Direct bank transfer",
        "• Online - Digital payment platforms",
    ]
    for bullet in bullets:
        story.append(Paragraph(bullet, styles['BulletText']))
    
    story.append(Paragraph(
        "💡 All payments are logged in the audit trail with timestamp, amount, and who recorded them.",
        styles['Note']
    ))
    story.append(PageBreak())
    
    # ===== CHAPTER 7: EXPENSES =====
    story.append(Paragraph("7. Managing Expenses", styles['ChapterTitle']))
    story.append(Paragraph(
        "Track association expenses and outgoing payments to vendors.",
        styles['CustomBody']
    ))
    
    story.append(Paragraph("Recording an Expense:", styles['SectionTitle']))
    steps = [
        "1. Go to Billing tab → Expenses section",
        "2. Click 'Add Expense'",
        "3. Enter description (e.g., 'Elevator Maintenance')",
        "4. Enter amount",
        "5. Select category (Maintenance, Utilities, etc.)",
        "6. Add vendor name if applicable",
        "7. Click 'Save'",
    ]
    for step in steps:
        story.append(Paragraph(step, styles['Step']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("Expense Categories:", styles['SectionTitle']))
    bullets = [
        "• Maintenance - Building repairs, cleaning",
        "• Utilities - Common area electricity, water",
        "• Insurance - Property insurance premiums",
        "• Management - Administrative costs",
        "• Reserve - Contributions to reserve fund",
        "• Other - Miscellaneous expenses",
    ]
    for bullet in bullets:
        story.append(Paragraph(bullet, styles['BulletText']))
    story.append(PageBreak())
    
    # ===== CHAPTER 8: REPORTS =====
    story.append(Paragraph("8. Reports & Year-End", styles['ChapterTitle']))
    story.append(Paragraph(
        "Generate comprehensive reports for financial review and year-end closing.",
        styles['CustomBody']
    ))
    
    story.append(Paragraph("Year-End True-Up Report:", styles['SectionTitle']))
    story.append(Paragraph(
        "This report shows each unit's financial status for the selected year:",
        styles['CustomBody']
    ))
    bullets = [
        "• Opening Balance - Balance at start of year",
        "• Total Assessed - Charges posted during year",
        "• Total Paid - Payments received during year",
        "• Net Balance - Current outstanding amount",
        "• Status - DUE or CREDIT",
    ]
    for bullet in bullets:
        story.append(Paragraph(bullet, styles['BulletText']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("Generating Reports:", styles['SectionTitle']))
    steps = [
        "1. Go to Reports tab",
        "2. Select the year from the dropdown",
        "3. View the summary cards (Total Outstanding, Total Credits)",
        "4. Review individual unit details",
        "5. Use 'Carry Forward' to move balances to next year",
    ]
    for step in steps:
        story.append(Paragraph(step, styles['Step']))
    
    story.append(Paragraph(
        "💡 Run year-end reports before the fiscal year ends to identify outstanding balances "
        "and follow up with owners.",
        styles['Note']
    ))
    story.append(PageBreak())
    
    # ===== CHAPTER 9: DOCUMENTS =====
    story.append(Paragraph("9. Document Management", styles['ChapterTitle']))
    story.append(Paragraph(
        "Organize and store all HOA documents for easy access by administrators and owners.",
        styles['CustomBody']
    ))
    
    story.append(Paragraph("Default Folder Structure:", styles['SectionTitle']))
    bullets = [
        "• HOA Legal & Governance - Bylaws, CC&Rs, rules",
        "• Financial Records - Budgets, audits, statements",
        "  └── Yearly subfolders (2024, 2025, 2026...)",
        "• Utility Bills - Water, electricity records",
        "  └── Water, Electricity subfolders",
        "• Meeting Minutes - Board meeting records",
        "• Maintenance & Vendor Records - Contracts, invoices",
        "• HOA Communications - Newsletters, notices",
        "• Disputes & Violations - Resolution records",
    ]
    for bullet in bullets:
        story.append(Paragraph(bullet, styles['BulletText']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("Uploading Documents:", styles['SectionTitle']))
    steps = [
        "1. Navigate to the target folder",
        "2. Click the cloud upload button (top right)",
        "3. Add a description (optional)",
        "4. Click 'Select File'",
        "5. Choose a file from your device",
        "6. File uploads and appears in the list",
    ]
    for step in steps:
        story.append(Paragraph(step, styles['Step']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("Creating Folders:", styles['SectionTitle']))
    steps = [
        "1. Navigate to the parent folder",
        "2. Click the folder icon (top right)",
        "3. Enter folder name and description",
        "4. Click 'Create'",
    ]
    for step in steps:
        story.append(Paragraph(step, styles['Step']))
    
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph("Supported File Types:", styles['SectionTitle']))
    story.append(Paragraph(
        "PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, CSV, TXT (Max 25MB per file)",
        styles['CustomBody']
    ))
    story.append(PageBreak())
    
    # ===== CHAPTER 10: AUDIT LOG =====
    story.append(Paragraph("10. Audit Log & Compliance", styles['ChapterTitle']))
    story.append(Paragraph(
        "The Activity tab provides a complete audit trail for transparency and compliance.",
        styles['CustomBody']
    ))
    
    story.append(Paragraph("What's Tracked:", styles['SectionTitle']))
    bullets = [
        "• All payment recordings (amount, unit, who recorded)",
        "• Charge postings and adjustments",
        "• Unit owner assignments",
        "• Document uploads and deletions",
        "• Profile updates",
        "• Login/logout events",
        "• All changes include old and new values",
    ]
    for bullet in bullets:
        story.append(Paragraph(bullet, styles['BulletText']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("Using Filters:", styles['SectionTitle']))
    story.append(Paragraph(
        "Filter the audit log by date range to find specific activities. This is useful for:",
        styles['CustomBody']
    ))
    bullets = [
        "• Monthly financial reviews",
        "• Investigating discrepancies",
        "• Preparing for audits",
        "• Tracking specific user activities",
    ]
    for bullet in bullets:
        story.append(Paragraph(bullet, styles['BulletText']))
    
    story.append(Paragraph(
        "⚠️ Audit logs cannot be deleted or modified. This ensures data integrity and compliance.",
        styles['Note']
    ))
    story.append(PageBreak())
    
    # ===== CHAPTER 11: SYSTEM ADMIN =====
    story.append(Paragraph("11. Profile & System Administration", styles['ChapterTitle']))
    
    story.append(Paragraph("Managing Your Profile:", styles['SectionTitle']))
    steps = [
        "1. Go to Profile tab",
        "2. Tap 'Edit Profile'",
        "3. Update name, phone, or email",
        "4. Save changes",
    ]
    for step in steps:
        story.append(Paragraph(step, styles['Step']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("Security Best Practices:", styles['SectionTitle']))
    bullets = [
        "• Change default passwords immediately",
        "• Use strong, unique passwords",
        "• Log out when not using the system",
        "• Regularly review the audit log",
        "• Keep owner contact information updated",
    ]
    for bullet in bullets:
        story.append(Paragraph(bullet, styles['BulletText']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("Regular Maintenance Tasks:", styles['SectionTitle']))
    bullets = [
        "• Monthly: Review outstanding balances, follow up on overdue accounts",
        "• Quarterly: Review expense reports, update reserve calculations",
        "• Annually: Run year-end reports, carry forward balances, archive documents",
        "• As needed: Update owner information, post charges, record payments",
    ]
    for bullet in bullets:
        story.append(Paragraph(bullet, styles['BulletText']))
    
    story.append(Spacer(1, 0.5*inch))
    story.append(Paragraph(
        "Thank you for using Unity Towers HOA Management System!",
        styles['Subtitle']
    ))
    story.append(Paragraph(
        "For technical support, contact your system administrator.",
        styles['Subtitle']
    ))
    
    # Build PDF
    doc.build(story)
    print("✅ Admin Manual created: /app/uploads/Unity_Towers_Admin_Manual.pdf")


if __name__ == "__main__":
    import os
    os.makedirs("/app/uploads", exist_ok=True)
    
    print("Generating User Manuals...")
    create_owner_manual()
    create_admin_manual()
    print("\n✅ All manuals generated successfully!")
