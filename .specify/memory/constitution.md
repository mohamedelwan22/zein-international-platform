<!-- Sync Impact Report
Version change: unfilled scaffold (no version) -> 1.0.0 (initial ratification)

Bump rationale: this is the first governed version of the Spec-Kit constitution.
All 12 principles from the approved docs/CONSTITUTION.md are preserved with their
substance intact (no removals, no redefinitions), and new principle/section
material is added, so the correct starting point is 1.0.0 (initial adoption)
rather than a MAJOR/PATCH bump from a prior governed version.

Modified principles (docs/CONSTITUTION.md title -> constitution title; wording
tightened to MUST/SHOULD testable form, substance preserved):
  1. Requirements Before Implementation -> I. Requirements Before Implementation
  2. MVP Discipline -> II. MVP Discipline
  3. Data Is Governed -> III. Data Is Governed
  4. Structured CMS, Not an Unrestricted Page Builder -> IV. same title
  5. Security and Least Privilege -> V. same title
  6. Bilingual From the Foundation -> VI. same title
  7. Public Experience Is Discovery-First -> VII. same title
  8. Reusable Domain Model -> VIII. same title
  9. Quality Is Part of Done -> IX. same title (expanded with PR section 49)
  10. Progressive Complexity -> X. same title
  11. Source of Truth Hierarchy -> XI. same title (principle/facts authority split)
  12. Traceability -> XII. same title (clarify pre-check order added)

Added principles:
  XIII. Design System & Brand Fidelity
  XIV. Skills-Guided Development

Added sections:
  Non-Functional Standards
  Development Workflow & Quality Gates

Removed sections:
  None. Only unresolved template placeholders and example comments were removed;
  no approved project content was dropped.

Conflicts/ambiguities preserved in the text rather than silently resolved:
  - Constitution authority vs the 5-level information hierarchy (Principle XI)
  - English company-name variants pending client confirmation (Principle III)
  - "50 years of success" marketing claim requiring approval (Principle III)
  - Asset path conventions vs actual repository locations (Principle XIII)
  - Referenced product-vision PDF absent from the repository (Principle XI)

Follow-up TODOs: none blocking.
  Note: docs/CONSTITUTION.md records no adoption date; 2026-10-07 is recorded as
  this file's ratification date. Update it if the project tracks an earlier date.
  Note: the repository folder is named "zein-platform" while approved documents
  use "Zain". No rename is implied or performed by this constitution.
-->

# Zain International Trading Platform Constitution

## Core Principles

### I. Requirements Before Implementation

No feature MUST be implemented before its behavior, scope, actors, permissions,
data needs, and acceptance criteria are sufficiently defined.

When requirements are ambiguous, the agent MUST:

- identify the ambiguity;
- preserve the unresolved decision instead of guessing;
- ask for clarification when it blocks correctness;
- never invent company-specific facts.

Before asking any clarification question, check, in order:
`docs/PROJECT_REQUIREMENTS.md`, `docs/SPECKIT_PROJECT_CONTEXT.md`, and the
original concept proposal.

Rationale: AI agents otherwise fill gaps with plausible-looking but unapproved
behavior and content.

### II. MVP Discipline

The MVP is a B2B corporate website, digital product catalog (brands, products,
suppliers, clients, locations), lead-generation system (inquiries, partnership
requests), structured CMS, and Admin Dashboard with RBAC.

MVP MUST NOT include:

- consumer checkout;
- online payment;
- public pricing;
- account-specific pricing;
- account-specific stock;
- customer portal or customer accounts;
- B2B ordering or quotations;
- full CRM or sales pipeline;
- ERP integrations;
- any account-specific services.

Future capabilities MUST NOT silently enter MVP scope. They require explicit
approval before being specified, planned, or implemented.

Rationale: the exclusions above are approved boundaries in
`docs/PROJECT_REQUIREMENTS.md` sections 47-48; the catalog is informational and
lead-generation focused.

### III. Data Is Governed

Company information is business-owned data. Never invent or publish as factual:

- company statistics, numerical claims, market-share claims;
- historical dates or milestones;
- locations, branches, cities;
- brands, suppliers, clients;
- distribution coverage or distribution statistics;
- capability claims, certifications, awards.

Only information present in the supplied company profiles
(`docs/English Profile.pdf`, `docs/pre 7.pdf`) as transcribed in
`docs/PROJECT_REQUIREMENTS.md` may be used as company content. Illustrative
information from the product concept remains placeholder data until the company
validates it.

Specific standing rules:

- The "50 years of success" wording is a supplied marketing claim and MUST NOT
  be calculated or rendered as a factual counter without final approval.
- The canonical English company name (source variants: "Zain International
  Trading" and "Zain International Trade Agency"), the canonical Arabic name,
  and the English tagline MUST NOT be decided by the implementation; they await
  client confirmation.
- Confirmed-only facts: established 1394 AH; Saudi Arabia, Jeddah, Aziziyah
  District, 23337 King Fahd Road; phones 0126747594/0126747595;
  ahmed@zainagency.com; Zainagency.com; distribution throughout Saudi Arabia
  and across borders.

Public records MUST support visibility and publication control: only verified
locations are published; supplier and client records require disclosure
approval; confidential client information MUST NEVER be exposed.

Rationale: publishing unverified claims creates legal and commercial risk for a
real trading company.

### IV. Structured CMS, Not an Unrestricted Page Builder

Routine business content MUST be editable by authorized staff without
source-code changes.

The CMS MUST manage structured fields and predefined sections only: home hero,
statistics, company content, mission, vision, values, sustainability,
innovation, brands, products, suppliers, categories, contact details, and other
approved sections.

Approved marketing copy MUST be stored as bilingual CMS content, not hardcoded
in UI components.

Do not build an unrestricted visual page builder unless it is explicitly added
to approved scope.

Rationale: staff autonomy without structure keeps the product maintainable and
the content governed.

### V. Security and Least Privilege

Admin capabilities MUST be protected by authentication and authorization.

Required controls:

- role-based access control with the documented starting roles: Super Admin,
  Content Manager, Product Manager, Sales/Business;
- protected admin routes;
- server-side authorization on every privileged operation (hiding UI is not
  enforcement);
- secure password handling and hashing;
- validated and sanitized input;
- secure file uploads with validation and authorization;
- rate limiting where appropriate;
- audit/activity logging for meaningful sensitive actions.

Audit logging MUST cover: login, create, update, delete/archive,
publish/unpublish, visibility change, permission change, user changes, and
sensitive attachment access.

Users MUST receive the minimum permissions required for their role.

Rationale: the platform stores business data and lead information behind a
public front door.

### VI. Bilingual From the Foundation

Arabic and English are first-class product requirements.

The architecture MUST support:

- localized content fields;
- RTL layouts;
- Arabic typography as a first-class design requirement;
- localized validation and system messages;
- language-aware metadata and localized SEO;
- readable mixed Arabic/Latin content.

Localization MUST NOT be added as a last-minute layer.

Rationale: retrofitting RTL and localized content after UI completion is a
rewrite, not a feature.

### VII. Public Experience Is Discovery-First

The public website MUST help B2B visitors understand, discover, evaluate, and
enquire.

Primary path:

Company -> Brands -> Products -> Business Inquiry

Partner path: Partnership -> Partnership Form -> Admin Queue.

The catalog is informational in MVP and MUST NOT imply pricing, stock,
checkout, ordering, ratings, reviews, or e-commerce badges unless such
functionality is explicitly implemented and approved.

The site MUST read as an established trading and distribution company, not a
generic online store or SaaS product.

### VIII. Reusable Domain Model

Core entities MUST be modeled explicitly and reused across public and admin
experiences:

Users, Roles, Permissions, Brands, Products, Suppliers, Clients, Categories
(brand/product/supplier), Locations, Pages, Sections, Media, SEO, Inquiries,
Partnership Requests, Settings, Activity Logs.

Categories MUST be dynamic: create, edit, delete/archive, reorder,
activate/deactivate, localize Arabic/English names, assign products.

Business data MUST NOT be duplicated in unrelated UI structures, and
brand/product relationships MUST NOT be hardcoded in frontend components.

Exact cardinalities MUST be validated during architecture planning.

### IX. Quality Is Part of Done

A feature is not complete merely because the happy path works.

Every relevant feature MUST include:

- functional behavior and data/API behavior;
- validation;
- loading, empty, error, and success states with feedback;
- permission enforcement;
- responsive behavior;
- Arabic/English behavior where relevant;
- accessibility basics (see Non-Functional Standards);
- no sensitive information exposure;
- public SEO where relevant;
- tests or appropriate verification;
- a passing build.

Rationale: this is the Definition of Done from
`docs/PROJECT_REQUIREMENTS.md` section 49, restated as an enforceable gate.

### X. Progressive Complexity

Build the simplest architecture that satisfies the approved requirement.

Do not implement future CRM, ordering, ERP, or customer-account complexity
before it is required.

At the same time, avoid architectural choices that make the approved future
roadmap unnecessarily difficult.

Technical stack choices are recommendations only and MUST be finalized during
`/plan`, not before.

### XI. Source of Truth Hierarchy

Two authorities are in force, and they do not compete:

1. Governing principles: this constitution is non-negotiable across all Spec-Kit
   phases (specification, clarification, planning, task generation,
   implementation, testing, review, convergence). When a spec, plan, or task set
   conflicts with a principle, the artifact is adjusted - never the principle.

2. Project information, in order of precedence:

   1. Approved project requirements
   2. Approved Spec-Kit specification
   3. Approved clarification decisions
   4. Approved technical plan
   5. Existing implementation constraints

The original concept proposal is the product-vision source. The design source
of truth is `docs/DESIGN_SYSTEM.md` (governed by Principle XIII).

If two sources conflict, do not silently choose one: flag the conflict for
resolution and preserve the higher-precedence source in the meantime.

The product-vision PDF `B2B_Distribution_Import_Platform_Proposal.pdf` cited by
`docs/SPECKIT_WORKFLOW.md` is not present in this repository. Its content MUST
NOT be invented or paraphrased from memory; request the file when a decision
depends on it.

Rationale: the approved information hierarchy lists sources of fact but not
principle authority; Spec-Kit commands require the constitution to be
non-negotiable, so the two concerns are stated separately rather than resolved
silently.

### XII. Traceability

Every implemented feature MUST be traceable to:

- a requirement;
- a user story or scenario;
- acceptance criteria;
- implementation tasks.

Do not implement unexplained product behavior.

Required chain:

Company Profile PDFs -> Product Concept -> PROJECT_REQUIREMENTS.md -> /specify
-> /clarify -> /plan -> /tasks -> /implement -> /verify

### XIII. Design System & Brand Fidelity

`docs/DESIGN_SYSTEM.md` is the design, UI/UX, and visual source of truth and
MUST be applied together with this constitution.

Rules:

- Use the approved assets: the company logo and the hero image. Resolve their
  actual repository paths by inspection (currently `docs/logo.png` and
  `docs/hero.png`; the documented convention is `/public/logo.*`). Never
  recreate, redesign, regenerate, recolor, distort, or filter approved assets;
  preserve clear space. Hero text, navigation, and buttons MUST remain real
  HTML/components and MUST NOT be baked into the hero image.
- Build on the approved palette, typography, spacing, radius, and design
  tokens. Extend an existing token system instead of creating a duplicate one.
  Use one consistent icon language and reuse existing components before
  creating one-off components.
- Preserve the approved direction: premium Saudi corporate identity,
  international trading, personal care, trusted distribution, cinematic luxury
  (luxury / corporate / editorial / cinematic / modern / trustworthy). Avoid
  generic SaaS styling, generic e-commerce styling, neon colors, excessive
  gradients, excessive glassmorphism, noisy animation, and decorative clutter.
- Keep the documented tone split: the public site is luxury/cinematic/editorial;
  the Admin Dashboard is clean/functional/structured; both share the same
  colors, typography, spacing, radii, and icon language.
- No design drift: every new component MUST answer the DESIGN_SYSTEM checklist
  (brand palette, typography hierarchy, spacing system, radius system, icon
  language, premium/corporate feel, Arabic/English support, fit with the Zain
  story) and the design acceptance criteria in DESIGN_SYSTEM section 44.

Scope boundary: the visual direction constrains aesthetic outcomes only. It
MUST NOT be used to impose arbitrary implementation constraints - specific
frameworks, libraries, or architecture are decided at `/plan` under Principle X.
Prefer existing project dependencies (for example, use Framer Motion only if
it is already installed) over introducing alternatives.

Rationale: the brand identity and premium Saudi B2B positioning are approved
project assets, while the technical route remains a planning decision.

### XIV. Skills-Guided Development

Relevant Skills MUST be considered throughout the development lifecycle.

- Before relevant work, inspect the actually available Skills (via
  `skills-lock.json`, `.agents/skills`, and the environment skill list). Never
  assume a Skill exists.
- Use only Skills relevant to the task; do not blindly apply every Skill.
- For UI/UX and frontend-related rules, specifically inspect and use
  `frontend-design` and `ui-ux-pro-max`.
- Also relevant when applicable: `responsive-design` and `web-design-guidelines`
  for layout, accessibility, and UI review; `vercel-react-best-practices` and
  `typescript-advanced-types` if a React/Next.js + TypeScript stack is adopted
  at `/plan`; `browser-automation` for rendered-page verification; `find-skills`
  to discover missing capabilities.
- Follow the skill-first workflow: Inspect Skills -> Inspect existing design
  system -> Inspect existing components -> Inspect existing assets -> Implement
  -> Verify against `DESIGN_SYSTEM.md`.
- Reuse existing components, tokens, utilities, and libraries. Do not install
  duplicate dependencies when an existing Skill or project dependency already
  solves the need.

Skills are development guidance. Project documentation and this constitution
take precedence when guidance conflicts, and Skill output MUST NOT be persisted
as unverified project fact.

Rationale: `docs/DESIGN_SYSTEM.md` section 40 mandates environment-based Skills
usage; this principle makes it enforceable across all phases.

## Non-Functional Standards

These requirements apply to the public website and the Admin Dashboard unless
scoped out explicitly in an approved specification.

### Accessibility

- Semantic HTML, keyboard navigation, visible focus states, accessible labels,
  image alt text, and screen-reader-friendly navigation.
- Contrast of at least 4.5:1 for body text; no important information conveyed
  only through color.
- Reduced-motion support (`prefers-reduced-motion`) and touch-friendly controls
  with targets of at least 44 by 44 pixels.

### Responsive Design

- Support desktop, laptop, tablet, and mobile viewports for both the public
  site and the Admin Dashboard.
- No horizontal overflow at any supported size.
- Recompose grids, navigation, hero, and image placement per breakpoint instead
  of shrinking desktop layouts.
- Mobile priorities, in order: readability, CTA visibility, image quality,
  simple navigation, touch usability.

### Performance

- Optimized images (WebP/AVIF where supported, responsive image sizes), lazy
  loading below the fold, pagination, caching where appropriate, database
  indexes, efficient API requests, CDN/media optimization, and SEO-friendly
  URLs.
- Prevent layout shifts; prioritize the hero asset; keep animation restrained;
  optimize fonts; avoid unnecessary blocking resources.

### SEO

- Every public page MUST have a meta title, meta description, slug, Open Graph
  image, and canonical URL.
- Dynamic SEO MUST cover brands, products, suppliers, and CMS pages.
- Arabic and English metadata MUST both be supported, alongside localized
  system messages.

### Media Management

- The media library MUST support upload, preview, replace, archive/delete,
  reuse, validation, and authorization for logos, brand logos and covers,
  product images, company imagery, and documents.
- Asset priority: approved project asset, then approved brand asset, then
  existing project Skill/library, and a new asset only if necessary.

### Structured Content

- Content MUST be modeled as structured fields and predefined sections
  (Principle IV). Approved marketing copy lives in the CMS, never hardcoded in
  components.

## Development Workflow & Quality Gates

### Stage Gates

- **Constitution check**: this constitution is loaded at `/specify`,
  `/clarify`, `/plan`, `/tasks`, and `/implement`, and re-checked by
  `/analyze` and `/converge`. A constitution violation is CRITICAL and MUST be
  remediated by adjusting the artifact - never by diluting or ignoring the
  principle.
- **`/specify`**: no implementation. The specification MUST identify actors,
  user journeys, functional and non-functional requirements, domain entities,
  permissions, acceptance criteria, and unresolved decisions, and MUST contain:
  user story, business context, scope, functional requirements, data
  requirements, permission requirements, validation, error/empty/loading
  states, localization behavior, accessibility behavior, acceptance scenarios,
  edge cases, dependencies, and out-of-scope behavior.
- **`/clarify`**: check `PROJECT_REQUIREMENTS.md`, `SPECKIT_PROJECT_CONTEXT.md`,
  and the original concept proposal first; ask only what those sources cannot
  resolve; never ask about information marked as a future phase; never convert
  placeholder facts into confirmed facts.
- **`/plan`**: preserve the MVP boundary; identify dependencies; separate
  frontend, backend, and data concerns; identify security-sensitive work;
  include a schema migration strategy and a verification strategy; avoid
  unnecessary infrastructure complexity; finalize the technical stack here;
  fill the plan's Constitution Check section.
- **`/tasks`**: tasks MUST be independently understandable, traceable to
  requirements, ordered by dependency, small enough to verify, and explicit
  about files/modules and database/API/UI boundaries.
- **`/implement`**: implement only approved tasks. Before changing
  architecture, check the requirements, this constitution, and the existing
  project structure; avoid rebuilding existing architecture unnecessarily.
  After implementation, run the relevant checks and verify acceptance
  criteria, permissions, Arabic/English behavior, responsive behavior, and
  error/empty/loading states.
- **`/verify` and pre-production**: run the final verification list - public
  website, admin authentication, RBAC, brands, products, suppliers, client
  visibility, verified-before-publication locations, CMS, media validation,
  SEO, search, inquiries, partnership requests, activity logs, Arabic RTL,
  English, mobile, desktop, security checks, passing build, and no placeholder
  company facts published.

### Skills Usage Per Phase

- Specification and analysis: use `find-skills` to locate relevant guidance;
  UI Skills are not required for non-visual work.
- Design and UI work: `frontend-design`, `ui-ux-pro-max`, `responsive-design`,
  and `web-design-guidelines`, following the skill-first workflow in
  Principle XIV.
- Implementation: `vercel-react-best-practices` and
  `typescript-advanced-types` once the corresponding stack is adopted.
- Verification: `browser-automation` or equivalent for rendered-page checks,
  plus review against the design acceptance criteria in DESIGN_SYSTEM
  section 44.
- Skip Skills that are irrelevant to the task; never assume availability.

### Testing and Verification

- Every feature MUST include tests or appropriate automated/manual verification
  proportional to its risk.
- Security-sensitive work (authentication, RBAC, uploads, public data
  exposure) MUST have explicit verification.
- The build MUST pass before a feature is considered done.

### Quality Gates

1. **Spec gate**: specification completeness per the `/specify` checklist and
   constitution compliance before clarification closes.
2. **Plan gate**: Constitution Check filled, MVP boundary preserved,
   dependencies, security-sensitive work, migration and verification strategies
   identified.
3. **Task gate**: every task traceable to a requirement and independently
   verifiable.
4. **Implementation gate**: Principle IX Definition of Done plus the
   Non-Functional Standards.
5. **Review gate**: `/analyze` and `/converge` treat constitution conflicts as
   CRITICAL; UI review includes design-system consistency against
   `docs/DESIGN_SYSTEM.md`.
6. **Pre-production gate**: the final verification list plus the required
   client confirmations before production - canonical Arabic and English
   company names, final English tagline, logo asset and extension, brand list,
   product catalog, supplier list, public client list, locations and coverage,
   exact "years of success" statistic, social media links, working hours,
   privacy/legal content, final contact routing, map provider, and
   hosting/infrastructure.

## Governance

**Authority**: this constitution is the governing constraint for the entire
Spec-Kit lifecycle - specification, clarification, planning, task generation,
implementation, testing, review, and convergence. `docs/CONSTITUTION.md`
remains an approved source: this file consolidates and operationalizes it and
MUST NOT weaken or contradict it. Where another project document introduces
additional intentional and compatible rules, they are incorporated here or by
reference. Conflicting documents are flagged under Principle XI and never
silently resolved.

**Amendment procedure**: amendments happen only through `/speckit.constitution`
with explicit, documented approval. Each amendment MUST update the version line
and include a Sync Impact Report. Any change that expands MVP scope, changes
security boundaries, changes public data exposure, or introduces transactional
functionality MUST be explicitly approved before implementation.

**Versioning policy**: semantic versioning - MAJOR for backward-incompatible
governance changes, principle removals, or redefinitions; MINOR for a new
principle or section or materially expanded guidance; PATCH for clarifications,
wording, typo fixes, and other non-semantic refinements.

**Compliance review**: every Spec-Kit phase MUST load this constitution.
`/analyze` and `/converge` MUST treat constitution violations as CRITICAL.
Review checkpoints MUST verify the Definition of Done, the Non-Functional
Standards, and the design acceptance criteria. Unresolved conflicts and
pending client confirmations MUST be tracked as open items rather than decided
by the agent.

**Runtime guidance**: use the Skills identified in Principle XIV and the phase
expectations in the Development Workflow section; project documentation remains
authoritative over Skill output.

**Version**: 1.0.0 | **Ratified**: 2026-10-07 | **Last Amended**: 2026-10-07
