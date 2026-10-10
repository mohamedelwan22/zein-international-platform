# B2B Distribution & Import Platform — Constitution

## Purpose

This constitution defines the engineering and product principles that govern the implementation of the B2B Distribution & Import Platform.

It is intended to be used by Spec-Kit as a persistent project rule set.

---

## Principle 1 — Requirements Before Implementation

No feature should be implemented before its behavior, scope, actors, permissions, data needs, and acceptance criteria are sufficiently defined.

When requirements are ambiguous:
- identify the ambiguity;
- preserve the unresolved decision;
- ask for clarification when it blocks correctness;
- never invent company-specific facts.

---

## Principle 2 — MVP Discipline

The MVP is a B2B corporate website, digital product catalog, lead-generation system, CMS, and Admin Dashboard.

MVP does NOT include:
- consumer checkout;
- online payment;
- public pricing;
- account-specific pricing;
- account-specific stock;
- customer portal;
- B2B ordering;
- full CRM;
- ERP integrations.

Future capabilities must not silently enter MVP scope.

---

## Principle 3 — Data Is Governed

Company information is business-owned data.

Never invent or publish as factual:
- company statistics;
- historical dates;
- locations;
- brands;
- suppliers;
- clients;
- distribution coverage;
- capability claims.

Illustrative information from the product concept remains placeholder data until the company validates it.

Public records must support appropriate visibility and publication control.

---

## Principle 4 — Structured CMS, Not an Unrestricted Page Builder

Routine business content must be editable by authorized staff without source-code changes.

The CMS should manage structured fields and predefined sections.

Do not build an unrestricted visual page builder unless explicitly added to approved scope.

---

## Principle 5 — Security and Least Privilege

Admin capabilities must be protected by authentication and authorization.

Use:
- role-based access control;
- protected routes;
- server-side authorization;
- secure password handling;
- validated input;
- secure file uploads;
- rate limiting where appropriate;
- audit logging for meaningful sensitive actions.

Users should receive the minimum permissions required for their role.

---

## Principle 6 — Bilingual From the Foundation

Arabic and English are first-class product requirements.

The architecture must support:
- localized content fields;
- RTL layouts;
- localized validation and system messages;
- language-aware metadata;
- readable mixed Arabic/Latin content.

Localization must not be added as a last-minute layer.

---

## Principle 7 — Public Experience Is Discovery-First

The public website is designed to help B2B visitors understand, discover, evaluate, and enquire.

The primary path is:

Company → Brands → Products → Business Inquiry

The catalog is informational in MVP and must not imply pricing, stock, checkout, or ordering unless explicitly implemented.

---

## Principle 8 — Reusable Domain Model

Core entities must be modeled explicitly and reused across public and admin experiences.

Core domains include:
- Brands
- Products
- Suppliers
- Clients
- Categories
- Locations
- Pages
- Sections
- Media
- SEO
- Inquiries
- Partnership Requests
- Users
- Roles
- Permissions
- Activity Logs

Avoid duplicating business data in unrelated UI structures.

---

## Principle 9 — Quality Is Part of Done

A feature is not complete merely because the happy path works.

Relevant features must include:
- validation;
- loading state;
- empty state;
- error state;
- success feedback;
- permission enforcement;
- responsive behavior;
- Arabic/English behavior;
- accessibility basics;
- tests or appropriate verification.

---

## Principle 10 — Progressive Complexity

Build the simplest architecture that satisfies the approved requirement.

Do not implement future CRM, ordering, ERP, or customer-account complexity before it is required.

At the same time, avoid architectural choices that make the approved future roadmap unnecessarily difficult.

---

## Principle 11 — Source of Truth Hierarchy

Use this order when resolving project information:

1. Approved project requirements
2. Approved Spec-Kit specification
3. Approved clarification decisions
4. Approved technical plan
5. Existing implementation constraints

The original concept proposal is the product-vision source.

If two sources conflict, do not silently choose one. Flag the conflict for resolution.

---

## Principle 12 — Traceability

Every implemented feature should be traceable to:
- a requirement;
- a user story or scenario;
- acceptance criteria;
- implementation tasks.

Do not implement unexplained product behavior.

---

## Governance

Any change that expands MVP scope, changes security boundaries, changes public data exposure, or introduces transactional functionality should be explicitly approved before implementation.

