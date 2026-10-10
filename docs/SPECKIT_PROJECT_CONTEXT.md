# Zain International Trading — Spec-Kit Project Context

## Project Identity

Build a premium bilingual B2B platform for:

**Arabic:** وكالة زين للتجارة العالمية / زين للتجارة العالمية

**English source variants:** Zain International Trading / Zain International Trade Agency

**Tagline:** أصالة سعودية بجودة عالمية

The supplied English company profile contains both English naming variants. Do not silently invent a legal-name decision; use the approved canonical name once confirmed.

---

## Company Facts From Supplied Profile

- Established in 1394 AH.
- Saudi company/institution focused on trade and personal care.
- Imports high-quality personal-care, beauty, cosmetic, and related health supplies.
- Seeks to expand and diversify its product collection.
- Works with partners and brands.
- States distribution throughout Saudi Arabia and across borders.
- Listed address: Saudi Arabia, Jeddah, Aziziyah District, 23337 King Fahd Road.
- Phone: 0126747594 / 0126747595.
- Email: ahmed@zainagency.com.
- Website: Zainagency.com.

The profile describes the company as an established Saudi brand with international-quality positioning.

---

## Company Values

The supplied profile defines seven values:

1. Quality
2. Sustainability
3. Transparency
4. Commitment
5. Collaboration
6. Innovation
7. Customer Care

---

## Product Areas

Initial categories from the supplied profile:

- Personal care and cosmetic accessories
- Baby supplies
- Sports corsets and belts
- Compresses and quick treatment
- Additional personal-care products

---

## Brands Mentioned in the Supplied Profile

- Japlo
- Angel Stone & Natur
- Jasper
- R&R
- TITANIA
- El Shorouk

These are source-provided initial brands.

The Admin must still manage them dynamically.

---

## Logo Requirement

The user will place the platform/company logo in the project using the asset name:

```text
logo
```

Expected implementation convention:

```text
/public/logo.*
```

Do not generate a replacement logo.

Use the logo across the public platform wherever appropriate.

---

## Product Boundary

This is primarily:

**Corporate Website + B2B Catalog + Brand Directory + Supplier/Partner Directory + Lead Generation + CMS + Admin Dashboard**

MVP is NOT:
- consumer e-commerce;
- checkout;
- online payment;
- public pricing;
- customer portal;
- B2B ordering;
- full CRM;
- ERP.

---

## Main Public Journey

Visitor
→ Home
→ Company
→ Brands
→ Brand Detail
→ Products
→ Product Detail
→ Inquiry

Partner
→ Partnership
→ Partnership Form
→ Admin Queue

---

## Main Admin Domains

- Dashboard
- Brands
- Products
- Categories
- Suppliers
- Clients
- Locations
- CMS
- Media
- SEO
- Inquiries
- Partnership Requests
- Users
- Roles
- Permissions
- Activity Logs

---

## CMS Boundary

Structured CMS only.

Admin can update predefined:
- Hero
- Statistics
- Company content
- Mission
- Vision
- Values
- Sustainability
- Innovation
- Brands
- Products
- Suppliers
- Contact details
- Selected sections

Do not create an unrestricted page builder unless explicitly requested later.

---

## Data Governance

Never invent company facts.

The following require confirmation before production if not explicitly present in the source:
- new branches;
- new locations;
- additional brands;
- additional suppliers;
- additional clients;
- certifications;
- awards;
- market statistics;
- unsupported numerical claims.

The company profile's "50 years of success" presentation should be treated as a supplied marketing claim that requires final approval before being used as a dynamic factual statistic.

---

## Localization

Arabic + English are first-class requirements.

Arabic:
- RTL
- Arabic typography
- localized fields
- localized messages
- localized SEO
- correct mixed Arabic/Latin display

---

## Recommended Technical Direction

Evaluate:
- Next.js or React
- TypeScript
- Tailwind CSS
- Framer Motion
- Node.js
- Express or NestJS
- PostgreSQL
- Prisma
- S3-compatible storage or Supabase Storage
- Google Maps or Mapbox
- Secure authentication
- VPS/cloud deployment

Do not lock the stack until `/plan`.

---

## Quality

Every feature should include:
- validation;
- loading;
- empty;
- error;
- success;
- permissions;
- responsive behavior;
- accessibility;
- localization;
- security;
- SEO where relevant;
- verification.

---

## Spec-Kit Rule

Use this context together with `PROJECT_REQUIREMENTS.md` and the project constitution.

The first `/specify` should create a clear, testable product specification.

Do not implement during initial specification.

If information is missing:
- identify it;
- do not guess;
- clarify only when it blocks a correct decision.

---

## Suggested Feature Sequence

1. Foundation
2. Design system
3. Database/API foundation
4. Authentication/RBAC
5. i18n
6. Media/storage
7. Home
8. About
9. Brands
10. Products
11. Suppliers
12. Clients
13. Locations
14. Contact
15. Partnership
16. Search
17. Admin
18. CMS
19. Media
20. SEO
21. Inquiries
22. Partnership management
23. Users/Roles
24. Activity logs
25. Security
26. Performance
27. QA
28. Production
