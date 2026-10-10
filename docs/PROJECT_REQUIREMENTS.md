# Zain International Trading — Platform Requirements

## 1. Document Purpose

This document is the implementation-oriented requirements baseline for the Zain International Trading digital platform.

It is intended to be used with Spec-Kit as the primary requirements source after the approved company profile and product concept.

### Source material

The company information in this document is derived from the supplied bilingual company profile PDFs:

- `English Profile.pdf`
- `pre 7.pdf`

The company profile states that the organization was established in **1394 AH**, operates in trade and personal care/cosmetics, imports high-quality products, works with brands and partners, and distributes products across Saudi Arabia and across borders. The English profile describes the company as "Zain International Trading" / "Zain International Trade Agency"; the Arabic profile uses "وكالة زين للتجارة العالمية" / "زين للتجارة العالمية". The supplied source documents use both English naming variants, so implementation should preserve the approved final corporate naming once the client confirms the canonical legal/display form.

---

# 2. Product Definition

Build a premium bilingual B2B corporate platform for **Zain International Trading / وكالة زين للتجارة العالمية**.

The platform represents a Saudi trading and distribution business focused on:

- Personal care
- Beauty and cosmetic accessories
- Baby supplies
- Sports corsets and belts
- Compresses and quick-treatment products
- Related personal-care products

The company profile states that the organization was established in **1394 AH** and seeks to import high-quality international health, cosmetic, and personal-care supplies for the local market. It also describes a broad partner and agent supply network and distribution across Saudi Arabia and across borders.

The platform is not primarily a consumer e-commerce store in MVP.

It is:

> **Corporate Website + B2B Product Catalog + Brands Directory + Supplier/Partner Directory + Lead Generation + CMS + Admin Dashboard**

---

# 3. Brand & Identity Requirements

## 3.1 Company Name

Arabic source:
- وكالة زين للتجارة العالمية
- زين للتجارة العالمية

English source:
- Zain International Trading
- Zain International Trade Agency

Because the supplied English PDF contains both forms, the final canonical English display/legal name MUST be confirmed by the company before production.

## 3.2 Tagline

Arabic:

> أصالة سعودية بجودة عالمية

English source wording:

> Saudi Authenticity international quality

The exact English capitalization/wording should be finalized during content approval.

## 3.3 Logo

The platform MUST use the supplied company/platform logo.

For implementation, the project will contain a logo asset named:

```text
logo
```

The implementation must support the actual extension provided by the project, for example:

```text
/public/logo.svg
/public/logo.png
```

Do not recreate or replace the logo with a generated mark.

Use the logo consistently in:
- Header
- Footer
- Admin branding where appropriate
- Authentication pages where appropriate
- Favicon/app metadata if approved
- Social/SEO preview assets if an approved version exists

---

# 4. Verified Company Information

The supplied company profile states:

### Establishment
- Established in 1394 AH.
- The English cover presents "Since 1394 H".

### Location
Saudi Arabia, Jeddah, Aziziyah District

### Address
23337 King Fahd Road

### Phone
0126747594
0126747595

### Email
ahmed@zainagency.com

### Website
Zainagency.com

### Business
Trade, import, distribution, personal care, beauty and cosmetic products/accessories.

### Geographic presence
The profile states that products are distributed throughout the Kingdom and across borders through an extensive network of partners and agents.

These values may be used as company-profile content because they are explicitly present in the supplied company documents.

---

# 5. Company Story

The supplied profile describes Zain International Trading as a Saudi institution in trade and personal care.

The company was established by specialists in trade and personal care with the goal of providing high-quality personal-care and cosmetic supplies to customers locally and around the world while emphasizing Saudi identity.

The company states that it has expanded and diversified its products and services over time and seeks to represent Saudi Arabia positively through quality products and distinctive service.

The profile also states that the company contributes to strengthening local industries in health supplies and cosmetics and seeks continuous development.

The exact approved marketing copy should be stored as bilingual CMS content rather than hardcoded in UI components.

---

# 6. Business Positioning

The platform should communicate:

- Saudi authenticity
- International quality
- Long operating history
- Personal-care expertise
- Product diversity
- Brand partnerships
- Supplier relationships
- Quality
- Customer service
- Innovation
- Sustainability
- B2B capability
- Distribution reach

The site must feel like an established trading and distribution company rather than a generic online store.

---

# 7. Product Categories

The supplied company profile explicitly presents these product areas:

## 7.1 Personal Care & Cosmetic Accessories

Innovative personal-care products and tools with an emphasis on quality.

## 7.2 Baby Supplies

Includes:
- Feeding bottles
- Baby supplies
- Sleeping supplies
- Bathing supplies

## 7.3 Sports Corsets & Belts

Products providing support and comfort during exercise.

## 7.4 Compresses & Quick Treatment

Selected hygienic and therapeutic compresses for pain relief and stress relief.

## 7.5 Additional Personal-Care Products

The profile states that the agency can offer a wider variety of personal-care products according to customer needs.

These categories should be modeled as configurable categories in the Admin Dashboard so the company can add, edit, hide, reorder, or extend them later.

---

# 8. Brands

The supplied profile states that Zain is an exclusive agent for trusted brands such as:

- Japlo
- Angel Stone & Natur
- Jasper
- R&R
- TITANIA
- El Shorouk

The profile associates these brands with product areas such as:
- Mother and baby
- Baby accessories
- Belts and braces
- Healthcare products and supplies
- Personal care and beauty
- Egyptian fiber / traditional Egyptian craftsmanship

IMPORTANT:

Brand names and descriptions from the company profile should be treated as approved source content for the initial platform content, but the Admin must be able to maintain them dynamically.

Do not hardcode brand/product relationships in frontend components.

---

# 9. Public Website

Required public experience:

1. Home
2. About
3. Our Story
4. Our History
5. Mission
6. Vision
7. Values
8. Sustainability
9. Innovation
10. Brands
11. Brand Details
12. Products
13. Product Details
14. Suppliers / Partners
15. Supplier Details
16. Clients
17. Geographic Presence
18. Contact
19. Partnership / Business Inquiry
20. Search

The exact route structure can be finalized during Spec-Kit planning.

---

# 10. Home Page

## Hero

The hero must communicate the company's core positioning.

Use the approved brand identity and the company tagline.

Suggested content structure:

- Company logo
- Primary headline
- Supporting statement
- Primary CTA
- Secondary CTA
- Premium visual
- Brand/product imagery where appropriate

The hero content must be editable from the CMS.

## Statistics

The homepage can support dynamic company statistics such as:
- Years of success
- Number of brands
- Number of products
- Number of business clients
- Geographic coverage

Only verified company statistics may be displayed.

The company profile visually mentions "50 years of success" on the final page while the cover uses the 1394 AH founding reference. Because the exact intended current-year calculation and wording should be confirmed, the "50 years" figure should be treated as a company-provided marketing claim requiring final approval before being rendered as a dynamic factual counter.

## Company Preview

Show:
- Short story
- Experience
- Personal-care specialization
- Link to About

## Product Categories

Feature the approved categories.

## Brands

Feature selected brands.

## Geographic Presence

Show Saudi distribution reach.

## Mission/Vision

Show concise approved versions.

## CTA

Drive business visitors to:
- Contact
- Product enquiry
- Partnership request

---

# 11. About / Company Profile

The About experience should include:

### Our Story
Use the supplied company narrative.

### Our History
Show the journey beginning in 1394 AH.

### Profile
Explain:
- Personal-care and cosmetics specialization
- Product quality
- Diverse product portfolio
- Partnerships with strong brands
- Customer satisfaction
- R&D and technology
- Long-term growth

### Journey Towards Excellence
Use the supplied positioning around continuous improvement, high-quality products, and exceptional service.

---

# 12. Mission

The supplied profile states that the company's mission centers on:

- Pride in service
- Customer satisfaction
- Importing high-quality products
- Continuous improvement and development
- Trust and mutual respect
- Bringing unique international cosmetic products
- Enhancing customer beauty and confidence

This must be represented as editable bilingual CMS content.

---

# 13. Vision

The supplied profile's vision is to become a main and reliable partner in personal care and cosmetology and to be the first/preferred choice for customers seeking high-quality cosmetic products and personal-care supplies.

This must be represented as editable bilingual CMS content.

---

# 14. Values

The company profile explicitly identifies seven values:

1. Quality
2. Sustainability
3. Transparency
4. Commitment
5. Collaboration
6. Innovation
7. Customer Care

Each value should support:
- Title
- Arabic title
- English title
- Description
- Optional icon
- Optional image
- Sort order
- Visibility

---

# 15. Sustainability

The company profile states that it:
- Cares about the environment
- Adheres to sustainable manufacturing practices
- Aligns this effort with Saudi Vision 2030
- Uses environmentally friendly components
- Seeks a balance between customer needs and environmental responsibility

This content should be presented as a dedicated section/page and managed through CMS.

Do not add unsupported sustainability certifications or quantitative claims.

---

# 16. Innovation

The company profile states a commitment to innovation and continuous development and a goal of providing new and innovative products for the modern market.

The website should have a configurable Innovation section.

---

# 17. Geographic Presence

The company profile states:

> Products are distributed throughout the Kingdom and across borders.

It also states that the company has an extensive supply network of partners and agents.

The website should provide an interactive geographic-presence experience.

The map should support:
- Saudi Arabia coverage
- Verified locations
- Branches if provided
- Distribution centers if provided
- Service/coverage areas if provided

Do not invent branch addresses or city-level offices.

The supplied corporate profile only confirms Jeddah as the company address.

---

# 18. Brands Directory

Brands page must support:

- Brand grid
- Logo
- Name
- Country
- Category
- Short description
- Featured status
- View details

Admin must manage all fields.

---

# 19. Brand Details

Each brand page should support:

- Logo
- Cover image
- Brand name
- Country
- Category
- About
- History
- Distribution information
- Products
- Related products
- Inquiry CTA

The page should be bilingual.

---

# 20. Product Catalog

The platform should provide a B2B catalog.

Users can:
- Browse products
- Search
- Filter by brand
- Filter by category
- Filter by country
- Open product details

The catalog is not a checkout system in MVP.

---

# 21. Product Details

Each product can include:

- Product name
- Arabic name
- English name
- Brand
- Category
- Country of origin
- Product images
- Short description
- Full description
- Specifications
- Related products
- Related brand
- Inquiry CTA

Optional:
- SKU
- Product reference
- Downloadable brochure/document

Public price, stock, and checkout are not part of MVP unless separately approved.

---

# 22. Supplier / Partner Directory

The company profile emphasizes relationships with partners and suppliers.

The platform should support a supplier/partner directory.

Supplier fields:
- Name
- Arabic name
- English name
- Country
- Logo
- Cover
- Description
- History
- Categories
- Products
- Website
- Contact information
- Visibility
- Disclosure approval

---

# 23. Clients

The company serves corporate clients in Saudi Arabia and aims to provide a comprehensive solution for companies and organizations regardless of size or field.

The platform can present approved client/partner logos or categories.

Client records must support:
- Company name
- Logo
- Industry
- Location
- Description
- Website
- Public visibility
- Disclosure approval

Never expose confidential client information.

---

# 24. B2B Inquiry

The platform must convert business visitors into qualified enquiries.

Inquiry types:
- Product
- Brand
- Supplier
- Distribution
- Partnership
- General

Fields:
- Name
- Company
- Email
- Phone
- Subject
- Message

Optional contextual fields:
- Product
- Brand
- Supplier
- Source page

Admin statuses:
- New
- Contacted
- In Progress
- Closed

---

# 25. Partnership Request

Provide a dedicated B2B partnership form.

Fields:
- Company name
- Contact person
- Email
- Phone
- Country
- Business type
- Website
- Product category
- Message
- Attachment

Admin must be able to review and manage requests.

---

# 26. Contact

Use the company profile contact information:

**Saudi Arabia — Jeddah — Aziziyah District**

**23337 King Fahd Road**

**0126747594**

**0126747595**

**ahmed@zainagency.com**

**Zainagency.com**

The final public contact details must remain editable through CMS/settings.

---

# 27. Admin Dashboard

The Admin Dashboard is the operational control center.

Dashboard overview:
- Brands
- Products
- Suppliers
- Clients
- Categories
- Locations
- Inquiries
- Partnership requests
- Content
- Media
- Recent activity

---

# 28. Brand Management

Admin can:
- Create
- Edit
- Archive/delete
- Activate/deactivate
- Upload logo
- Upload cover
- Manage descriptions
- Manage country
- Manage category
- Manage website
- Manage social links
- Assign products
- Preview
- Publish

---

# 29. Product Management

Admin can:
- Create
- Edit
- Archive/delete
- Activate/deactivate
- Upload product images
- Assign brand
- Assign category
- Add descriptions
- Add specifications
- Add country
- Add SKU/reference if required
- Preview
- Publish

---

# 30. Supplier Management

Admin can:
- Create
- Edit
- Archive/delete
- Manage logo
- Manage cover
- Manage country
- Manage description
- Manage history
- Manage products
- Manage categories
- Manage contact information
- Control public disclosure

---

# 31. Client Management

Admin can:
- Create
- Edit
- Archive/delete
- Manage logo
- Manage industry
- Manage location
- Manage description
- Manage website
- Control visibility
- Control disclosure approval

---

# 32. Category Management

Categories must be dynamic.

Admin can:
- Create
- Edit
- Delete/archive
- Reorder
- Activate/deactivate
- Localize Arabic/English names
- Assign products

Initial categories come from the company profile, but the company can add more.

---

# 33. Location Management

Admin can:
- Add location
- Edit location
- Remove/archive location
- Set coordinates
- Set address
- Set location type
- Set coverage description
- Mark verified
- Publish/unpublish

Only verified/approved locations should appear publicly.

---

# 34. CMS

The CMS must allow authorized staff to edit:

### Home
- Hero
- CTA
- Statistics
- About preview
- Featured brands
- Featured products
- Categories
- Sustainability
- Innovation
- Geographic presence
- Mission
- Vision
- Final CTA

### About
- Story
- History
- Profile
- Journey
- Mission
- Vision
- Values
- Sustainability
- Innovation

### Contact
- Phone
- Email
- Address
- Working hours
- Map
- Social links

The CMS is structured, not an unrestricted visual page builder.

---

# 35. Media Library

Support:
- Logo
- Brand logos
- Brand covers
- Product images
- Company imagery
- Documents

Required:
- Upload
- Preview
- Replace
- Archive/delete
- Reuse
- Validation
- Authorization

The project must expect the platform logo asset under a path similar to:

```text
/public/logo.*
```

The exact extension depends on the supplied project asset.

---

# 36. SEO

Public pages need:
- Meta title
- Meta description
- Slug
- Open Graph image
- Canonical URL

Dynamic SEO:
- Brand
- Product
- Supplier
- CMS pages

Arabic and English metadata should be supported.

---

# 37. Search

Global search should support:
- Products
- Brands
- Suppliers
- Categories

Results must distinguish entity types.

---

# 38. Authentication & RBAC

Suggested roles:

### Super Admin
Full control.

### Content Manager
Pages, CMS, media, SEO.

### Product Manager
Brands, products, categories.

### Sales / Business
Clients, inquiries, partnership requests.

All permissions must be enforced server-side.

---

# 39. Activity Logs

Track meaningful administrative operations:
- Login
- Create
- Update
- Delete/archive
- Publish/unpublish
- Visibility change
- Permission change
- User changes
- Sensitive attachment access

---

# 40. Localization

Required:
- Arabic
- English

Arabic must support:
- RTL
- Correct typography
- Localized content
- Localized validation
- Localized system messages
- Language-specific metadata

---

# 41. Responsive Design

Support:
- Desktop
- Laptop
- Tablet
- Mobile

The public site and Admin Dashboard must remain usable on relevant screen sizes.

---

# 42. Accessibility

Relevant requirements:
- Semantic HTML
- Keyboard navigation
- Focus states
- Accessible labels
- Image alt text
- Contrast
- Reduced-motion consideration
- Touch-friendly controls

---

# 43. Security

Required baseline:
- Secure authentication
- Password hashing
- Server-side authorization
- RBAC
- Input validation
- Input sanitization
- Secure uploads
- Rate limiting where appropriate
- Protected admin routes
- Audit logging

---

# 44. Performance

Use:
- Optimized images
- Lazy loading
- Pagination
- Caching where appropriate
- Database indexes
- Efficient API requests
- CDN/media optimization
- SEO-friendly URLs

---

# 45. Technical Direction

Recommended stack to evaluate:

### Frontend
- Next.js or React
- TypeScript
- Tailwind CSS
- Framer Motion

### Backend
- Node.js
- Express or NestJS
- REST API

### Database
- PostgreSQL

### ORM
- Prisma

### Storage
- S3-compatible storage or Supabase Storage

### Maps
- Google Maps or Mapbox

### Authentication
- Secure session/JWT strategy

### Deployment
- VPS/cloud

Technical choices are recommendations and should be finalized during Spec-Kit planning.

---

# 46. Core Data Model

Entities:

- Users
- Roles
- Permissions
- Brands
- Brand Categories
- Products
- Product Categories
- Suppliers
- Supplier Categories
- Clients
- Locations
- Inquiries
- Partnership Requests
- Pages
- Sections
- Media
- SEO
- Settings
- Activity Logs

Relationships:

```text
Brand
 └── Products

Supplier
 └── Products

Product
 ├── Brand
 └── Category

Page
 ├── Sections
 ├── Media
 └── SEO

Inquiry
 ├── Product (optional)
 ├── Brand (optional)
 └── Supplier (optional)
```

Exact cardinalities must be validated during architecture planning.

---

# 47. MVP

## Public

- Home
- About
- Story/History
- Mission/Vision/Values
- Sustainability
- Innovation
- Brands
- Brand Details
- Products
- Product Details
- Suppliers
- Supplier Details
- Clients
- Geographic Presence
- Contact
- Partnership
- Search
- Arabic/English

## Admin

- Authentication
- Dashboard
- Brands CRUD
- Products CRUD
- Categories CRUD
- Suppliers CRUD
- Clients CRUD
- Locations CRUD
- CMS
- Media
- SEO
- Inquiries
- Partnership Requests
- Basic RBAC
- Activity Logs

---

# 48. Future Scope

Future phases may include:

- Customer portal
- Customer accounts
- Quotations
- B2B ordering
- CRM
- Sales pipeline
- ERP integrations
- Account-specific services
- Additional integrations

These must remain outside MVP unless separately approved.

---

# 49. Definition of Done

A feature is complete only when:

- Functional behavior works
- Data/API behavior works
- Permissions are enforced
- Validation exists
- Loading state exists
- Empty state exists
- Error state exists
- Success feedback exists where needed
- Responsive behavior works
- Arabic/English behavior works where relevant
- Accessibility basics are addressed
- No sensitive information is exposed
- Public SEO is handled where relevant
- Verification/tests exist
- Build passes

---

# 50. Content Governance

The supplied company profile is the source for the initial company content.

Do not invent:
- Additional branches
- Additional cities
- Additional brands
- Additional suppliers
- Additional clients
- Certifications
- Awards
- Numerical claims
- Market-share claims
- Distribution statistics

unless the company provides them.

The supplied profile confirms Jeddah as the listed corporate address and states distribution throughout Saudi Arabia and across borders, but it does not provide a complete list of branches or city-by-city facilities.

---

# 51. Required Client Confirmation Before Production

Confirm:
- Canonical English company name
- Canonical Arabic company name
- Final tagline in English
- Logo asset and file extension
- Final brand list
- Final product catalog
- Final supplier list
- Final public client list
- Final locations/coverage
- Exact "years of success" statistic
- Social media links
- Working hours
- Privacy/legal content
- Final contact routing
- Map provider
- Hosting/infrastructure

---

# 52. Spec-Kit Traceability

Implementation flow:

```text
Company Profile PDFs
        ↓
Product Concept
        ↓
PROJECT_REQUIREMENTS.md
        ↓
/specify
        ↓
/clarify
        ↓
/plan
        ↓
/tasks
        ↓
/implement
        ↓
/verify
```

Every feature should map back to requirements and acceptance criteria.
