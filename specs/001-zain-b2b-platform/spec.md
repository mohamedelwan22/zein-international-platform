# Feature Specification: Zain International Trading B2B Distribution & Import Platform (MVP)

**Feature Branch**: `001-zain-b2b-platform`

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "Create the initial project specification for the Zain International Trading B2B Distribution & Import Platform — the complete approved MVP: public bilingual corporate website (Arabic/English, RTL), company/about content, brands, products, suppliers, clients, locations/geographic presence, contact, business inquiries, partnership requests, search/discovery, structured CMS, Admin Dashboard, authentication/RBAC, media management, SEO, activity/audit logging, accessibility, responsive behavior, performance, security, and quality/verification — governed by the project constitution, with `docs/PROJECT_REQUIREMENTS.md` as the primary requirements baseline, no invented company facts, exact MVP boundaries preserved, and the technology stack left undecided for `/speckit.plan`."

**Governing documents**: `.specify/memory/constitution.md` (non-negotiable), `docs/PROJECT_REQUIREMENTS.md` (primary requirements baseline), `docs/SPECKIT_PROJECT_CONTEXT.md`, `docs/SPECKIT_WORKFLOW.md`, `docs/DESIGN_SYSTEM.md` (design source of truth), `docs/README.md`.

---

## Clarifications

### Session 2026-10-07

- Q: Should submissions to the business inquiry and partnership forms also notify staff outside the Admin Dashboard, or is the in-dashboard queue enough for the MVP? → A: Admin queue only — no outbound notifications in MVP.
- Q: Should the business inquiry and partnership forms require an explicit privacy/consent acknowledgment from the submitter before the form can be sent? → A: Required consent checkbox linked to the approved privacy notice, on both forms.
- Q: What status lifecycle should partnership requests follow in the admin queue? → A: Same lifecycle as inquiries — New → Contacted → In Progress → Closed.
- Q: How should backup/recovery be captured in the MVP specification, given it is listed as an approved Quality scope item but currently absent from the spec? → A: Pre-launch gate — scheduled backups plus documented restore verification before production.
- Q: Should the MVP include any visitor/traffic analytics to measure how well the platform converts visitors into inquiries and partnership requests? → A: No analytics in MVP — lead performance is measured via the inquiry and partnership counts already in the dashboard.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Discover the company on a bilingual public website (Priority: P1)

As a B2B visitor, I want to learn about Zain International Trading in my own language — Arabic with right-to-left layout or English — so that I can evaluate the company as a potential supplier, brand partner, or distributor.

**Why this priority**: The corporate website is the foundation of the MVP and the entry point of the approved journey (Company → Brands → Products → Business Inquiry). Every other public story depends on it.

**Independent Test**: Load the public Home and About experiences in Arabic and English using only approved company-profile content, with no admin data entry required beyond initial approved content.

**Acceptance Scenarios**:

1. **Given** a visitor opens the public website, **When** they switch language between English and Arabic, **Then** navigation, headings, body copy, buttons, and system messages display in the selected language, and Arabic renders right-to-left.
2. **Given** Arabic right-to-left mode, **When** mixed Arabic/Latin content is displayed (brand names, phone numbers, addresses), **Then** both scripts remain readable with no overlap, mirroring artifacts, or horizontal overflow.
3. **Given** a visitor opens the About experience, **When** they view Our Story, Our History, Mission, Vision, Values, Sustainability, and Innovation, **Then** each section shows the approved bilingual content supplied through the CMS, including the 1394 AH founding reference, and no unapproved historical milestones or statistics appear.
4. **Given** a desktop, laptop, tablet, or mobile viewport, **When** the visitor browses any public page, **Then** the layout recomposes for that viewport with no horizontal scrolling and all calls to action remain reachable.

---

### User Story 2 - Discover brands and products (Priority: P1)

As a B2B visitor, I want to browse a curated directory of brands and an informational product catalog — filtered by brand, category, and country — so that I can identify products relevant to my business and move toward an inquiry.

**Why this priority**: The digital product catalog is the core B2B value of the platform and the middle of the approved discovery path.

**Independent Test**: Browse the brands directory and product catalog, open a brand and a product detail page, apply and clear filters, and reach the inquiry call to action using only approved initial catalog content.

**Acceptance Scenarios**:

1. **Given** the visitor opens the Brands directory, **When** the page loads, **Then** approved brand records display logo, name, country, category, short description, and featured status in a curated premium presentation, and selecting a brand opens its detail page with logo, cover, about, history, distribution information, related products, and an inquiry call to action.
2. **Given** the visitor opens the product catalog, **When** they filter by brand, category, and country (individually or combined), **Then** only matching approved products are listed, filters can be cleared, and results update without losing the visitor's language selection.
3. **Given** the visitor opens a product detail page, **When** it renders, **Then** it shows the bilingual product name, brand, category, country of origin, images, short and full descriptions, specifications, related products, related brand, and an inquiry call to action — and shows no price, stock, cart, checkout, ordering, rating, review, or e-commerce badge of any kind.
4. **Given** a brand, product, or category record is inactive, archived, or not approved for public visibility, **When** the visitor browses or searches, **Then** it is not displayed anywhere on the public site.

---

### User Story 3 - Sign in securely to the Admin Dashboard with a role (Priority: P1)

As an administrative user, I want to sign in and see only the features my role allows, so that the business can manage its platform without exposing data or actions to the wrong people.

**Why this priority**: Every admin story depends on this security boundary; without it, content, leads, and business data are unprotected.

**Independent Test**: Sign in with accounts for each documented role and verify each role reaches only its permitted areas, and that forbidden actions are refused even when attempted directly.

**Acceptance Scenarios**:

1. **Given** valid credentials, **When** a staff member signs in, **Then** they reach the Admin Dashboard and see only the modules permitted for their role (Super Admin: everything; Content Manager: pages, CMS, media, SEO; Product Manager: brands, products, categories; Sales/Business: clients, inquiries, partnership requests).
2. **Given** a user without a permission, **When** they attempt that privileged action by any means, **Then** the action is refused by the system, no data changes, and feedback explains access is denied.
3. **Given** a signed-in user whose session expires or who signs out, **When** they attempt to reach an admin page, **Then** they are required to authenticate again before any admin content is shown.
4. **Given** repeated failed sign-in attempts, **When** the attempt limit is reached, **Then** further attempts are temporarily blocked and the event is recorded, with localized feedback shown to the user.

---

### User Story 4 - Submit a business inquiry and manage it as staff (Priority: P1)

As a B2B visitor, I want to send a business inquiry about a product, brand, supplier, distribution, or partnership so that the company can contact me. As sales/business staff, I want to track these inquiries through statuses so that no lead is lost.

**Why this priority**: Lead generation is a core MVP pillar; the platform's stated purpose is converting business visitors into qualified inquiries.

**Independent Test**: Submit an inquiry from a product page as a visitor, then locate it in the admin queue, progress it through statuses, and confirm the record retains its contextual links.

**Acceptance Scenarios**:

1. **Given** the inquiry form with type, name, company, email, phone, subject, message fields and the required consent acknowledgment linked to the privacy notice, **When** a visitor submits valid data, **Then** confirmation feedback is shown in the active language, the record is stored with status "New", and any contextual link (product, brand, supplier, source page) is retained.
2. **Given** required fields are missing or invalid (for example, malformed email or phone) or the consent acknowledgment is not given, **When** the visitor submits, **Then** localized inline feedback identifies the missing or invalid inputs, and no partial record is created.
3. **Given** a stored inquiry, **When** authorized Sales/Business or Super Admin staff open the inquiries list, **Then** they can view details, filter by status, and move status New → Contacted → In Progress → Closed, with each change recorded in activity history.
4. **Given** inquiry submission is attempted repeatedly in a short period, **When** the abuse threshold is reached, **Then** the submission is rate-limited and legitimate visitors still receive clear feedback.

---

### User Story 5 - Submit a partnership request with attachment (Priority: P2)

As a prospective business partner, I want to submit a dedicated B2B partnership request — including a document attachment — so that the company can evaluate cooperation. As staff, I want to review these requests in a queue.

**Why this priority**: A distinct high-value lead channel that reuses the form, media, and queue foundations from earlier stories.

**Independent Test**: Submit a complete partnership request with an allowed attachment, then locate and open it in the admin queue as authorized staff.

**Acceptance Scenarios**:

1. **Given** the partnership form (company name, contact person, email, phone, country, business type, website, product category, message, attachment) with the required consent acknowledgment linked to the privacy notice, **When** a prospect submits valid data with an acceptable file, **Then** success feedback is shown and the request appears in the admin queue with status "New".
2. **Given** an attachment of a disallowed type or excessive size, **When** the prospect submits, **Then** a localized error explains the file requirement, and the rest of the entered data is preserved for correction.
3. **Given** authorized staff open a partnership request, **When** they access the attachment, **Then** the access is recorded in the activity log, and the request can be moved through statuses New → Contacted → In Progress → Closed.

---

### User Story 6 - Edit structured content without code changes (Priority: P2)

As authorized content staff, I want to edit predefined structured sections of the public site in both Arabic and English so that business content stays current without engineering involvement.

**Why this priority**: The structured CMS is an MVP pillar, but it builds on the authenticated roles and the public experiences it edits.

**Independent Test**: As a Content Manager, edit the homepage hero, a statistic, the mission text, and contact details in both languages and confirm the public site reflects the changes.

**Acceptance Scenarios**:

1. **Given** a Content Manager in the CMS, **When** they edit predefined fields for Home (hero, calls to action, statistics, about preview, featured brands/products, categories, sustainability, innovation, geographic presence, mission, vision, final call to action), About (story, history, profile, journey, mission, vision, values, sustainability, innovation), or Contact (phone, email, address, working hours, map, social links), **Then** both the Arabic and English variants are stored separately and previewable.
2. **Given** edited content saved with preview, **When** it is not yet published, **Then** the public site continues to show the previously published version until publish is confirmed.
3. **Given** any CMS user, **When** they inspect the CMS, **Then** only structured fields and predefined sections are editable — there is no free-form page builder, no arbitrary layout creation, and no option to inject unrestricted markup.
4. **Given** marketing copy edited by staff, **When** it is saved, **Then** it is stored as bilingual CMS content and rendered from content, never hardcoded in the interface.

---

### User Story 7 - Manage catalog and directory entities from the Admin Dashboard (Priority: P2)

As administrative users, I want to create, edit, archive, activate/deactivate, preview, and publish brands, products, categories, suppliers, clients, and locations — with bilingual fields and visibility controls — so that the public site always reflects approved, current data.

**Why this priority**: The public catalog and directories are only sustainable if staff can maintain them; this story delivers the operational CRUD surface of the MVP.

**Independent Test**: As each manager role, perform the full lifecycle (create → preview → publish → edit → deactivate → archive) on each entity type and verify the public effect and permission boundaries.

**Acceptance Scenarios**:

1. **Given** a Product Manager, **When** they create a brand with logo, cover, bilingual descriptions, country, category, website, and social links, assign products, preview it, and publish it, **Then** it becomes publicly visible with all entered fields, and the change is activity-logged.
2. **Given** a Content/Product Manager working with categories, **When** they create, edit, reorder, activate/deactivate, localize Arabic/English names, or assign products, **Then** category changes take effect immediately across navigation, catalog filters, and product assignments — categories remain fully dynamic after launch.
3. **Given** a Sales/Business or Super Admin user managing suppliers and clients, **When** they set public disclosure approval or visibility, **Then** only approved records appear publicly, and confidential client details are never exposed in any public response.
4. **Given** a location record, **When** staff set coordinates, address, type, coverage description, and mark it verified, **Then** only verified and published locations appear on the public geographic-presence experience; unverified or unpublished locations never render publicly.
5. **Given** any entity, **When** staff archive or delete it, **Then** it disappears from public browsing and lists per its state, the action is confirmed before execution, and it is recorded in the activity log.

---

### User Story 8 - Explore suppliers, clients, and geographic presence (Priority: P2)

As a B2B visitor, I want to view the supplier/partner directory, approved client references, and the company's geographic presence so that I can judge the company's network and reach.

**Why this priority**: These approved public experiences complete the company's credibility story but depend on admin-managed records and disclosure approvals.

**Independent Test**: Open suppliers, clients, and geographic-presence pages and verify only approved, verified records appear, with detail pages rendering for suppliers.

**Acceptance Scenarios**:

1. **Given** the suppliers directory, **When** a visitor opens it and selects a supplier, **Then** they see name (bilingual), country, logo, cover, description, history, categories, products, website, and contact information — only for suppliers approved for disclosure.
2. **Given** approved client records, **When** the visitor views the clients page, **Then** only approved public client logos/categories/descriptions appear and no confidential client information is exposed.
3. **Given** the geographic-presence experience, **When** the visitor opens it, **Then** it presents Saudi Arabia coverage with the confirmed Jeddah corporate address and any verified locations supplied by staff — with no invented branches, cities, or offices.
4. **Given** no verified locations beyond Jeddah, **When** the page renders, **Then** it still presents approved coverage wording ("distributed throughout the Kingdom and across borders") without fabricating map points.

---

### User Story 9 - Find anything through global search (Priority: P3)

As a B2B visitor, I want one search that spans products, brands, suppliers, and categories and clearly labels result types, so that I can find what I need quickly.

**Why this priority**: Search accelerates discovery but the directories already provide browse/filter paths.

**Independent Test**: Run representative queries for a product, a brand, a supplier, and a category in both languages and confirm typed, labeled results — plus a clear empty state.

**Acceptance Scenarios**:

1. **Given** the search overlay or page, **When** a visitor enters a query, **Then** results from products, brands, suppliers, and categories are returned together with each result visibly labeled by entity type.
2. **Given** a query with no matches, **When** results are requested, **Then** a localized empty state suggests next steps instead of a blank screen.
3. **Given** Arabic or English query text, **When** searching, **Then** each language finds matching approved records in the active language, and selecting a result opens its detail page.

---

### User Story 10 - Manage SEO metadata for public pages and entities (Priority: P3)

As content and management staff, I want to define meta title, meta description, slug, Open Graph image, and canonical URL per public page and per brand, product, supplier, and CMS page — in both languages — so that the site is discoverable correctly.

**Why this priority**: SEO multiplies the value of published content but does not block core journeys.

**Independent Test**: Set distinct Arabic and English metadata on a CMS page and a brand, publish, and verify each public page presents its own metadata and canonical address.

**Acceptance Scenarios**:

1. **Given** a public page or dynamic entity, **When** staff edit its SEO fields in Arabic and English, **Then** each language version presents its own title, description, and canonical reference to visitors and crawlers.
2. **Given** an entity without custom metadata, **When** it is published, **Then** a sensible localized default derived from its approved content is presented rather than an empty or broken result.
3. **Given** a slug change, **When** it is saved, **Then** the previous address continues to lead visitors to the correct content.

---

### User Story 11 - Review platform activity from the dashboard (Priority: P3)

As a Super Admin, I want an overview dashboard and an activity log of meaningful administrative operations, so that I can supervise platform usage and detect unusual changes.

**Why this priority**: Oversight matters for a business platform but follows the existence of admin actions to log.

**Independent Test**: Perform representative admin actions across modules and confirm the overview reflects counts/recent activity and each action appears in the log with actor, time, and action type.

**Acceptance Scenarios**:

1. **Given** an authorized admin on the dashboard, **When** the overview loads, **Then** it shows entity areas (brands, products, suppliers, clients, categories, locations, inquiries, partnership requests, content, media) with counts or entry points and recent activity.
2. **Given** administrative actions, **When** they occur, **Then** login, create, update, delete/archive, publish/unpublish, visibility change, permission change, user changes, and sensitive attachment access are each recorded with actor, action, target, and timestamp.
3. **Given** a user without log permissions, **When** they attempt to view activity logs, **Then** access is denied.

---

### User Story 12 - Manage users, roles, and the media library (Priority: P2)

As a Super Admin, I want to manage staff accounts and their roles, and manage a shared media library, so that access stays current and images/documents are handled consistently.

**Why this priority**: Operational hygiene that supports all other admin work; depends on authentication existing.

**Independent Test**: Create a user, assign a role, upload/replace/archive a media item, and use it in a brand record; revoke a role and verify access changes immediately.

**Acceptance Scenarios**:

1. **Given** a Super Admin, **When** they create or edit a user and assign one of the four documented roles, **Then** the user can sign in and effective permissions match the role immediately, and the change is activity-logged.
2. **Given** the media library, **When** authorized staff upload a logo, brand logo, brand cover, product image, company image, or document, **Then** the file is validated (type, size), previewable, replaceable, archivable/deletable, and reusable across records, with unauthorized users unable to upload.
3. **Given** the approved project assets (logo and hero), **When** any part of the site needs them, **Then** the supplied asset is reused from its actual repository location and is never regenerated, recreated, recolored, or distorted.
4. **Given** a role change or user removal, **When** it takes effect, **Then** the affected user loses the previous access at their next action, and both the permission change and the user change are logged.

---

### Edge Cases

- Empty catalog or directory: a visitor opens Brands/Products/Suppliers/Clients with zero approved records → localized empty state with navigation onward, never a broken or blank page.
- Missing translation: a localized field has no Arabic or English value → the active-language view falls back to the available approved variant (or hides the optional element) without layout breakage; flagged for staff.
- Unverified location: staff create a location but never mark it verified → it must not appear publicly under any circumstance.
- Unapproved statistics: homepage statistics contain unverified values (including the "50 years of success" claim) → the value is not rendered as a factual counter until approved (see Open Items).
- Attachment failures: oversized, wrong-type, or interrupted uploads → localized error, entered partnership data preserved, no partial record.
- Rate limiting and abuse: repeated inquiry/partnership submissions or failed sign-ins → temporary block with clear localized feedback; legitimate use resumes afterwards.
- Session expiry mid-edit: an admin's session expires while editing → re-authentication is required and unsaved draft content is not silently published.
- Publish safety: previewed-but-unpublished content → public visitors continue seeing the previously published version.
- Archived referenced records: a brand or category used by published products is archived → public product pages do not render broken references (affected records are hidden or clearly handled per plan).
- Confidential data: client records marked not approved for disclosure → absent from all public output, including search and metadata.
- Mixed-script rendering: Arabic text containing Latin brand names/numbers → correct direction handling, no overlap or overflow in either language.
- Missing approved asset: logo or hero file is absent from the repository → the affected surface falls back to approved text branding and the gap is reported; no generated replacement is created.
- Slug collision: two public pages request the same address → the system prevents publishing a duplicate rather than silently overriding.
- Concurrent edits: two staff edit the same record → last save does not silently destroy the other's changes without warning (conflict handling approach defined at planning).

---

## Requirements *(mandatory)*

### Functional Requirements

**Bilingual & localization**

- **FR-001**: The system MUST provide Arabic and English across every public page and every Admin Dashboard screen, with a visible language switch that preserves the user's current location.
- **FR-002**: The system MUST render Arabic layouts right-to-left, including navigation, forms, tables, overlays, and mixed Arabic/Latin content, with no overflow or mirroring defects.
- **FR-003**: All validation messages, system messages, empty/error/success feedback, and user-facing notifications MUST be localized in the active language.
- **FR-004**: Content fields that carry business meaning (page content, entity names/descriptions, category names, statistics labels) MUST be stored and presented per language.

**Public website & discovery**

- **FR-005**: The public site MUST provide: Home; About with Our Story, Our History, Profile, and Journey Towards Excellence; Mission; Vision; Values (the seven approved values); Sustainability; Innovation; Brands and Brand Details; Products and Product Details; Suppliers and Supplier Details; Clients; Geographic Presence; Contact; Partnership; and Search. Exact route structure is finalized during planning.
- **FR-006**: The homepage MUST present a CMS-editable hero (logo, primary headline, supporting statement, primary and secondary calls to action, premium visual), a company preview, approved product categories, featured brands, geographic presence, concise approved Mission/Vision, and closing calls to action to Contact, product inquiry, and partnership.
- **FR-007**: Homepage statistics MUST display only verified company values; unapproved claims (including the "50 years of success" wording) MUST NOT be rendered as factual counters (see Open Items).
- **FR-008**: The Brands directory MUST show logo, name, country, category, short description, and featured status; brand detail pages MUST show logo, cover, name, country, category, about, history, distribution information, products/related products, and an inquiry call to action — all bilingual and admin-managed.
- **FR-009**: The product catalog MUST support browsing, search, and filtering by brand, category, and country, with product detail pages showing bilingual name, brand, category, country of origin, images, short description, full description, specifications, related products, related brand, an inquiry call to action, and optional SKU/product reference/brochure where provided.
- **FR-010**: The catalog MUST remain informational: public price, stock, cart, checkout, payment, ordering, ratings, reviews, and e-commerce badges MUST NOT appear.
- **FR-011**: The supplier/partner directory MUST show name (bilingual), country, logo, cover, description, history, categories, products, website, contact information, visibility, and disclosure approval, and MUST publish only suppliers approved for disclosure.
- **FR-012**: The clients experience MUST show only approved public client records (company name, logo, industry, location, description, website) and MUST NEVER expose confidential client information.
- **FR-013**: The geographic-presence experience MUST present Saudi Arabia coverage using only verified locations; the confirmed corporate address is Jeddah, Aziziyah District, 23337 King Fahd Road; no branches, cities, or offices may be invented.
- **FR-014**: The contact experience MUST present the approved contact details (Jeddah, Aziziyah District, 23337 King Fahd Road; phones 0126747594 and 0126747595; ahmed@zainagency.com; Zainagency.com) and MUST keep them editable through CMS/settings.
- **FR-015**: Global search MUST cover products, brands, suppliers, and categories, MUST distinguish entity types in results, MUST work in both languages, and MUST provide a localized empty state.

**Lead generation**

- **FR-016**: The business inquiry flow MUST support inquiry types (product, brand, supplier, distribution, partnership, general), fields (name, company, email, phone, subject, message), optional contextual fields (product, brand, supplier, source page), validation with localized errors, and success feedback, plus a required consent acknowledgment linked to the approved privacy notice before submission (Clarifications, 2026-10-07).
- **FR-017**: Stored inquiries MUST carry the statuses New, Contacted, In Progress, and Closed, manageable by authorized staff; all follow-up MUST happen through the dashboard queue, and no outbound notification is part of the MVP (Clarifications, 2026-10-07).
- **FR-018**: The partnership request flow MUST support company name, contact person, email, phone, country, business type, website, product category, message, and attachment, with validation, localized errors, success feedback, the same required consent acknowledgment linked to the approved privacy notice, and authorized staff review/management in the admin queue using the same statuses as inquiries (New, Contacted, In Progress, Closed, Clarifications, 2026-10-07) — with no outbound notification in the MVP.
- **FR-019**: Public submission endpoints (inquiry, partnership) MUST be rate-limited against abuse while keeping legitimate submission possible.

**Admin: authentication, authorization, oversight**

- **FR-020**: The Admin Dashboard MUST require authentication, provide sign-in/sign-out, handle passwords in a non-recoverable secure form, and protect every admin route and admin data response from unauthenticated access.
- **FR-021**: The system MUST implement role-based access control with the four documented roles: Super Admin (full control), Content Manager (pages, CMS, media, SEO), Product Manager (brands, products, categories), Sales/Business (clients, inquiries, partnership requests), granting minimum necessary permissions.
- **FR-022**: Authorization MUST be enforced by the system on every privileged operation regardless of interface visibility; hiding controls is not enforcement, and denied attempts MUST NOT alter data.
- **FR-023**: The dashboard overview MUST provide entry points and counts/summary for brands, products, suppliers, clients, categories, locations, inquiries, partnership requests, content, and media, plus recent activity.
- **FR-024**: Staff user management (create/edit users, assign roles, change permissions, deactivate users) MUST be available to Super Admin, MUST take effect immediately, and MUST be activity-logged.

**Admin: entity management**

- **FR-025**: Brand management MUST support create, edit, archive/delete, activate/deactivate, logo and cover upload, bilingual descriptions, country, category, website, social links, product assignment, preview, and publish.
- **FR-026**: Product management MUST support create, edit, archive/delete, activate/deactivate, image upload, brand and category assignment, bilingual descriptions, specifications, country, optional SKU/reference and brochure, preview, and publish.
- **FR-027**: Category management MUST be fully dynamic: create, edit, delete/archive, reorder, activate/deactivate, bilingual name localization, and product assignment, with initial categories seeded from the approved profile and extendable by the company.
- **FR-028**: Supplier management MUST support create, edit, archive/delete, logo, cover, country, bilingual description, history, products, categories, contact information, and public disclosure control.
- **FR-029**: Client management MUST support create, edit, archive/delete, logo, industry, location, description, website, public visibility, and disclosure approval control.
- **FR-030**: Location management MUST support add, edit, remove/archive, coordinates, address, location type, coverage description, verified marking, and publish/unpublish, with only verified AND published locations shown publicly.
- **FR-031**: Preview MUST show staff exactly what the public will see before publish, and unpublished changes MUST NOT affect the public site.

**Admin: CMS, media, SEO, logging**

- **FR-032**: The CMS MUST expose only structured fields and predefined sections for Home, About, and Contact (hero, calls to action, statistics, about preview, featured brands/products, categories, sustainability, innovation, geographic presence, mission, vision, values, story, history, profile, journey, phone, email, address, working hours, map, social links) and MUST NOT provide an unrestricted visual page builder or arbitrary markup injection.
- **FR-033**: The media library MUST support upload, preview, replace, archive/delete, reuse, validation (type and size), and authorization for logos, brand logos, brand covers, product images, company imagery, and documents; approved project assets (logo, hero) MUST be reused from their actual repository locations and never regenerated or altered.
- **FR-034**: SEO management MUST allow editing meta title, meta description, slug, Open Graph image, and canonical URL per public page and per brand, product, supplier, and CMS page, in Arabic and English, with safe handling of slug changes.
- **FR-035**: Activity logging MUST record login, create, update, delete/archive, publish/unpublish, visibility change, permission change, user changes, and sensitive attachment access, each with actor, action, target, and timestamp, viewable only by authorized roles.
- **FR-036**: The system MUST prevent publication of duplicate public slugs.

**Content governance & quality**

- **FR-037**: The system MUST NOT generate or publish invented company facts; the supplied company profile content is the sole source for initial company data, and any brand, supplier, client, location, statistic, certification, or claim not present in approved sources MUST be withheld pending confirmation.
- **FR-038**: Business copy MUST be editable as bilingual CMS content and MUST NOT be hardcoded in interface components; brand/product/category relationships MUST be data-driven, not hardcoded in components.
- **FR-039**: Every public and admin experience MUST implement validation, loading, empty, error, and success states with localized feedback.

**Cross-cutting non-functional requirements**

- **FR-040**: Accessibility MUST include semantic structure, keyboard navigation, visible focus, accessible labels, image alternative text, contrast meeting at least 4.5:1 for body text, reduced-motion support, touch targets of at least 44×44 pixels, screen-reader-friendly navigation, and no information conveyed by color alone.
- **FR-041**: Responsive behavior MUST cover desktop, laptop, tablet, and mobile for the public site and the Admin Dashboard, with no horizontal overflow, recomposed (not shrunken) mobile layouts, and mobile priorities of readability, call-to-action visibility, image quality, simple navigation, and touch usability.
- **FR-042**: Performance MUST include optimized and appropriately sized images, lazy loading below the fold, pagination for long lists, caching where appropriate, efficient data retrieval, efficient media delivery, prevention of layout shifts, prioritized hero asset, restrained animation, and fast, search-friendly addresses.
- **FR-043**: Public SEO MUST include meta title, meta description, slug, Open Graph image, and canonical URL per public page, dynamic equivalents for brands, products, suppliers, and CMS pages, and Arabic and English metadata.
- **FR-044**: Security MUST include secure authentication, secure password storage, input validation and sanitization, secure file uploads, rate limiting where appropriate, protected admin routes, least-privilege access, and audit logging as specified above.
- **FR-045**: Every feature MUST be delivered with tests or appropriate verification covering its acceptance scenarios, and the system MUST pass its automated checks before release.
- **FR-046**: Before production launch, scheduled backups covering content, data, and media MUST be in place, and a documented restore verification MUST be demonstrated successfully as a pre-production quality gate (workflow Quality features #44-45; Clarifications, 2026-10-07).

### Key Entities *(include if feature involves data)*

- **User**: A staff member who signs in; has one role; is the actor for activity records.
- **Role / Permission**: Role defines the permitted modules and operations (Super Admin, Content Manager, Product Manager, Sales/Business); permissions are assigned, changed, and logged.
- **Brand**: Marketed brand the company represents; bilingual name/description, country, category, logo, cover, website, social links, featured flag, visibility/activation state, history/about/distribution text; has products.
- **Product**: Catalog item; bilingual name, short/full description, specifications, country of origin, images, optional SKU/reference/brochure; belongs to a brand and a category; may be linked to a supplier.
- **Supplier / Partner**: Represented supplier; bilingual name/description, country, logo, cover, history, categories, products, website, contact information, disclosure approval; may have products.
- **Client**: Corporate client reference; company name, logo, industry, location, description, website, public visibility, disclosure approval flag.
- **Category**: Dynamic classification (initial: personal care & cosmetic accessories, baby supplies, sports corsets & belts, compresses & quick treatment, additional personal-care products) for brands/products/suppliers; bilingual names, order, activation.
- **Location**: Geographic record; address, coordinates, type, coverage description, verified flag, publish state; the confirmed corporate address is Jeddah.
- **Page / Section**: CMS-managed structured content units for Home, About, and Contact in both languages, with publication state.
- **Media**: Uploaded asset (logo, brand logo, cover, product image, company image, document) with validation state, archive state, and usage references.
- **SEO**: Per-page/per-entity metadata set (title, description, slug, Open Graph image, canonical) per language.
- **Inquiry**: Lead record; type, contact fields, message, optional contextual links (product/brand/supplier, source page), status, timestamps.
- **Partnership Request**: Partner application; company/contact/business fields, message, attachment, statuses New → Contacted → In Progress → Closed (same lifecycle as Business Inquiry).
- **Settings**: Editable contact details, social links, working hours, and other platform-level configuration.
- **Activity Log**: Append-only record of administrative actions (actor, action, target, timestamp).

### Traceability

| Requirements source | User stories | FRs |
|---|---|---|
| PR §9-11, 12-16 (public site, home, about, mission, vision, values, sustainability, innovation) | US1, US6 | FR-001 to FR-007, FR-032, FR-038 |
| PR §18-21 (brands, brand details, catalog, product details) | US2, US7 | FR-008 to FR-010, FR-025 to FR-027, FR-031 |
| PR §22-23 (suppliers, clients) | US7, US8 | FR-011, FR-012, FR-028, FR-029 |
| PR §17, 33 (geographic presence, locations) | US7, US8 | FR-013, FR-030 |
| PR §24 (business inquiry) | US4 | FR-016, FR-017, FR-019 |
| PR §25 (partnership request) | US5 | FR-018, FR-019 |
| PR §26 (contact) | US1, US6 | FR-014, FR-032 |
| PR §37 (search) | US9 | FR-015 |
| PR §34 (CMS) | US6 | FR-032, FR-038 |
| PR §27-32 (admin dashboard, brand/product/supplier/client/category management) | US7 | FR-023, FR-025 to FR-031 |
| PR §35 (media library) | US12 | FR-033 |
| PR §36 (SEO) | US10 | FR-034, FR-043 |
| PR §38 (authentication & RBAC) | US3, US12 | FR-020 to FR-022, FR-024 |
| PR §39 (activity logs) | US11 | FR-035 |
| PR §40 (localization) | US1-US12 | FR-001 to FR-004 |
| PR §41 (responsive) | US1-US12 | FR-041 |
| PR §42 (accessibility) | US1-US12 | FR-040 |
| PR §43 (security) | US3, US12 | FR-019, FR-020 to FR-022, FR-044 |
| PR §44 (performance) | US1, US2 | FR-042 |
| PR §47 (MVP scope), §48 (future scope excluded) | All | FR-010, FR-037, Out of Scope |
| PR §49 (definition of done), §52 (traceability) | All | FR-039, FR-045, Success Criteria |
| Workflow Quality #44-45 (production deployment, backup/recovery) | All | FR-046 |
| DESIGN_SYSTEM §1-46 (brand, design, skills) | US1, US2, US8 | FR-033 (approved assets), Success Criteria |
| Constitution Principles I-XIV | All | All FRs |

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A visitor can switch between English and Arabic in one action, and 100% of public pages and admin screens render fully in the selected language with correct right-to-left layout for Arabic.
- **SC-002**: A visitor starting at the homepage reaches a product detail page in 3 or fewer interactions (home → catalog → detail) and can initiate an inquiry from that page.
- **SC-003**: A visitor completes a valid business inquiry in under 3 minutes, and a submitted partnership request with attachment completes in under 5 minutes, both with clear success confirmation.
- **SC-004**: 100% of privileged admin operations attempted without the required permission are refused by the system with no data change, verified across all four roles.
- **SC-005**: A Content Manager can update the homepage hero, a statistic, the mission text, and contact details in both languages and see the published result live within 5 minutes, without any engineering involvement or code change.
- **SC-006**: Search results across products, brands, suppliers, and categories appear without noticeable delay (perceived within 1 second), correctly labeled by entity type, with a localized empty state for zero results.
- **SC-007**: 100% of public pages are fully keyboard navigable with visible focus, have alternative text on informative images, meet 4.5:1 body-text contrast, and respect reduced-motion preferences — verified before release.
- **SC-008**: All primary public journeys (company discovery, catalog discovery, inquiry, partnership) and all admin tasks complete successfully on desktop, laptop, tablet, and mobile viewports with zero horizontal scrolling.
- **SC-009**: Public pages become usable in under 3 seconds on a typical mobile connection, with no visible layout shifts during load and media delivered in efficiently sized variants.
- **SC-010**: Zero placeholder or unapproved company facts are published at release (verified by content audit against approved sources); 100% of published public content traces to CMS or approved profile content.
- **SC-011**: 100% of public pages and public entities expose correct Arabic and English metadata (title, description, canonical) appropriate to their language version.
- **SC-012**: 100% of the specified sensitive administrative actions appear in the activity log with actor, action, target, and timestamp during acceptance testing.
- **SC-013**: At least 90% of acceptance-test participants (staff personas) successfully create and publish a bilingual brand with images on their first attempt without assistance.
- **SC-014**: 100% of acceptance scenarios defined in this specification pass before release, and the system passes its automated checks at release time.
- **SC-015**: Before production launch, backups on a documented schedule cover published content, data, and media, and one full restore from backup is completed and verified in a recorded drill.

---

## Out of Scope (MVP Exclusions)

The following are excluded by the approved MVP boundary and MUST NOT appear unless separately approved:

- Consumer checkout, online payment, and any transactional functionality.
- Public pricing, account-specific pricing, account-specific stock.
- Customer portal, customer accounts, quotations, B2B ordering.
- Full CRM and sales pipeline.
- ERP integrations or any third-party business-system integration.
- Account-specific services and additional future integrations.
- An unrestricted visual page builder in the CMS.
- Outbound notification channels (such as email or SMS) for inquiries or partnership requests; lead follow-up happens in the Admin Dashboard queue (Clarifications, 2026-10-07).
- Visitor/traffic analytics or any tracking tool or built-in traffic statistics; lead performance is measured through the inquiry and partnership counts already shown in the dashboard (Clarifications, 2026-10-07).
- Any functionality requiring facts, statistics, certifications, locations, brands, suppliers, or clients not present in approved sources.

Future phases (per PR §48) remain outside MVP: customer portal, customer accounts, quotations, B2B ordering, CRM, sales pipeline, ERP integrations, account-specific services, additional integrations.

---

## Assumptions

- The technology stack, routing framework, data platform, hosting, and map provider are deliberately undecided here; they are decided during `/speckit.plan` (Constitution Principle X, PR §45).
- Initial company, brand, product, supplier, client, and category content is entered through the Admin Dashboard/CMS from the approved company profile by staff; final lists await client confirmation (PR §51).
- The English display name "Zain International Trading" is used as a working default in English surfaces pending confirmation of the canonical legal/display form; the Arabic approved forms are used as supplied (PR §3.1).
- The approved logo and hero assets exist in the repository (currently under `docs/`); the implementation resolves their actual paths during foundation work and reuses them without alteration (DESIGN_SYSTEM §41).
- Inquiry and partnership follow-up happens exclusively through the admin queue; outbound notification channels are explicitly out of MVP scope (Clarifications, 2026-10-07).
- Data retention follows ordinary business practice: lead records are retained while relevant to follow-up and can be archived by authorized staff; no special regulatory regime is assumed unless confirmed.
- Authentication strength (for example, password rules, multi-factor options) is chosen at planning under the security baseline of FR-044; standard secure web practices apply.
- "Exact route structure can be finalized during Spec-Kit planning" (PR §9); this specification defines experiences, not addresses.
- Unresolved decisions are preserved in Open Items rather than guessed; they are handled during `/speckit.clarify`.
- Only Jeddah is a confirmed physical location; broader presence is expressed only as approved coverage wording until verified locations are supplied.

---

## Open Items for Clarification (`/speckit.clarify`)

Client-confirmation items preserved from PR §51 and related documents — NOT resolved in this specification:

1. Canonical English company name ("Zain International Trading" vs "Zain International Trade Agency") and canonical Arabic name.
2. Final English tagline wording and capitalization for "Saudi Authenticity international quality".
3. Approval of the "50 years of success" claim and the exact "years of success" statistic for homepage counters (PR §10).
4. Final brand list, product catalog, supplier list, and public client list for initial content.
5. Final locations/coverage and any additional verified locations beyond the confirmed Jeddah address.
6. Social media links, working hours, and privacy/legal content — privacy content is now a blocking launch dependency for both lead forms (Clarifications, 2026-10-07).
7. Final contact routing, map provider, hosting/infrastructure decisions (plan-stage inputs).
8. Approved final logo asset/file and approved hero asset confirmation.
9. Missing product-vision source `B2B_Distribution_Import_Platform_Proposal.pdf` referenced by `docs/SPECKIT_WORKFLOW.md` — restore it or confirm it is superseded by `docs/PROJECT_REQUIREMENTS.md`.
