# B2B Distribution & Import Platform — Spec-Kit Workflow

## Purpose

This document defines how to use the project requirements with Spec-Kit.

---

## Source Documents

### Product Vision

`B2B_Distribution_Import_Platform_Proposal.pdf`

Defines:
- product vision;
- public experience;
- admin concept;
- MVP direction;
- future roadmap;
- discovery checklist.

### Requirements

`PROJECT_REQUIREMENTS.md`

Defines:
- functional requirements;
- non-functional requirements;
- domain entities;
- roles;
- permissions;
- acceptance principles;
- MVP boundaries;
- implementation guardrails.

### Context

`SPECKIT_PROJECT_CONTEXT.md`

Provides compact context for AI agents and Spec-Kit commands.

### Constitution

`CONSTITUTION.md`

Defines project principles that must remain true during specification, planning, and implementation.

---

# Recommended Spec-Kit Flow

## Step 1 — Constitution

Place the constitution in the project's Spec-Kit constitution location if your installed Spec-Kit version uses one, commonly:

`.specify/memory/constitution.md`

Do not duplicate contradictory project principles elsewhere.

---

## Step 2 — Project Requirements

Keep:

`PROJECT_REQUIREMENTS.md`

as the main requirements source.

The document can live under:

`docs/PROJECT_REQUIREMENTS.md`

or another project documentation directory.

---

## Step 3 — Project Context

Keep:

`SPECKIT_PROJECT_CONTEXT.md`

near the requirements.

Use it as the compact context supplied to AI agents.

---

## Step 4 — Initial Specify

Use the following product statement as the basis for the first specification:

> Build a premium bilingual B2B distribution and import platform for a Saudi-market distribution company. The platform combines a corporate website, structured brand/product/supplier catalog, B2B enquiry and partnership flows, and a role-based Admin Dashboard with CMS capabilities. The MVP is informational and lead-generation focused, with no consumer checkout, public pricing, or online payment. All public business information must be governed, editable by authorized staff, and structured for future B2B customer accounts, quotations, ordering, CRM, and ERP integrations.

The initial specification should identify:
- actors;
- user journeys;
- functional requirements;
- non-functional requirements;
- domain entities;
- permissions;
- acceptance criteria;
- unresolved decisions.

Do not implement during this stage.

---

# Feature Decomposition

Do not force the whole product into one giant feature specification.

Recommended decomposition:

## Foundation
1. Project foundation
2. Design system
3. Database foundation
4. API foundation
5. Authentication
6. RBAC
7. i18n
8. Media/storage

## Public Website
9. Home
10. About
11. Brands
12. Brand details
13. Products
14. Product details
15. Suppliers
16. Supplier details
17. Clients
18. Locations/map
19. Contact
20. Partnership
21. Search

## Admin
22. Dashboard
23. Categories
24. Brand management
25. Product management
26. Supplier management
27. Client management
28. Location management
29. CMS pages
30. Home section management
31. Media library
32. SEO
33. Inquiries
34. Partnership requests
35. Users
36. Roles/permissions
37. Activity logs

## Quality
38. Security hardening
39. Performance
40. Accessibility
41. Arabic/RTL QA
42. SEO QA
43. Responsive QA
44. Production deployment
45. Backup/recovery

---

# Specification Rules

Every feature specification should contain:

- User story
- Business context
- Scope
- Functional requirements
- Data requirements
- Permission requirements
- Validation
- Error/empty/loading states
- Localization behavior
- Accessibility behavior
- Acceptance scenarios
- Edge cases
- Dependencies
- Out-of-scope behavior

---

# Clarification Rules

Before asking questions, check:
1. PROJECT_REQUIREMENTS.md
2. SPECKIT_PROJECT_CONTEXT.md
3. Original concept proposal

Only ask questions that cannot be resolved from those sources.

Do not ask about information that is explicitly marked as a future phase.

Do not convert placeholder facts into confirmed facts.

---

# Planning Rules

The plan should:
- preserve the MVP boundary;
- identify dependencies;
- separate frontend/backend/data concerns;
- identify security-sensitive work;
- include migration strategy for schema changes;
- include verification strategy;
- avoid unnecessary infrastructure complexity.

---

# Task Rules

Tasks should be:
- independently understandable;
- traceable to requirements;
- ordered by dependency;
- small enough to verify;
- explicit about files/modules when known;
- explicit about database/API/UI boundaries.

---

# Implementation Rules

Implement only approved tasks.

Before changing architecture:
- check the requirements;
- check the constitution;
- check existing project structure;
- avoid rebuilding existing architecture unnecessarily.

After implementation:
- run the relevant checks;
- verify acceptance criteria;
- verify Arabic/English behavior;
- verify permissions;
- verify responsive behavior;
- verify error/empty/loading states.

---

# Final Verification

Before production, verify:

- Public website works
- Admin authentication works
- RBAC works
- Brands work
- Products work
- Suppliers work
- Clients visibility works
- Locations are verified before publication
- CMS works
- Media validation works
- SEO works
- Search works
- Inquiries work
- Partnership requests work
- Activity logs work where required
- Arabic RTL works
- English works
- Mobile works
- Desktop works
- Security checks pass
- Build passes
- No placeholder company facts are published
