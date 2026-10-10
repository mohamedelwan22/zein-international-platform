# Zain International Trading — Design System & UI/UX Specification

## Purpose

This file is the **design source of truth** for the Zain International Trading platform and should be used by Spec-Kit and the implementation agent alongside:

- `CONSTITUTION.md`
- `PROJECT_REQUIREMENTS.md`
- `SPECKIT_PROJECT_CONTEXT.md`
- `SPECKIT_WORKFLOW.md`

The visual goal is:

> **Premium Saudi corporate identity + international trading + personal care + trusted distribution + cinematic luxury.**

The website must feel like an established international trading/distribution company, not a generic SaaS product or consumer e-commerce template.

---

## 1. Brand Direction

The design language is derived from the supplied ZAIN logo.

Core visual characteristics:

- Deep green
- Leaf green
- Lime
- White
- Dark charcoal/black
- Restrained champagne gold
- Organic leaf/flowing forms
- Strong horizontal movement
- Saudi + international visual storytelling

The design should communicate:

- Saudi heritage
- International reach
- Trust
- Corporate strength
- Premium quality
- Personal-care expertise
- Global brands
- Professional distribution
- Long-term partnerships
- Innovation
- Sustainability

Visual keywords:

**Luxury / Corporate / Editorial / Cinematic / Modern / Trustworthy**

Avoid:
- generic SaaS styling;
- generic e-commerce styling;
- excessive glassmorphism;
- neon colors;
- excessive gradients;
- excessive rounded cards;
- noisy animation;
- random decorative elements.

---

## 2. Logo

The approved logo is supplied by the user.

Expected project asset:

```text
/public/logo.*
```

The exact extension depends on the supplied file.

Rules:

- Do not recreate the logo.
- Do not redesign it.
- Do not distort it.
- Do not change its proportions.
- Do not apply arbitrary filters.
- Preserve clear space.
- Use the supplied asset everywhere the brand logo is required.

Use it in:

- Header
- Footer
- Appropriate admin branding
- Favicon/app metadata if an approved version is available
- SEO/social preview assets when approved

---

## 3. Hero Asset

The approved hero image is supplied as:

```text
hero
```

The user will keep it in the project's `docs`/asset location.

The implementation agent MUST inspect the repository and use the actual resolved path.

Do not replace the approved hero image.

Do not generate another hero unless explicitly requested.

The hero image represents:

- Saudi environment
- International trade
- Distribution
- Logistics
- Warehouse operations
- Global connectivity
- Personal-care products
- Premium corporate positioning

The image is a background/visual asset.

Hero text, navigation, buttons, and other UI MUST remain real HTML/components and must not be baked into the image.

---

## 4. Hero Composition

Use the hero as a cinematic full-width composition.

Desktop structure:

```text
NAVIGATION
────────────────────────────────────────────

EYEBROW

LARGE EDITORIAL HEADLINE
Supporting description

PRIMARY CTA   SECONDARY CTA

                         LOGISTICS / WAREHOUSE
                         GLOBAL TRADE
                         SAUDI VISUALS
                         PRODUCT VISUALS
```

Keep the left side readable for text.

Do not place important text over the strongest photographic subjects.

Recommended hero:
- full bleed;
- 720px+ desktop visual height;
- approximately 80–90vh on large screens when appropriate;
- responsive crop on mobile;
- stronger overlay on mobile.

---

## 5. Hero Overlay

Use a controlled overlay to create a text-safe area.

Preferred direction:

```text
LEFT: deep green / dark
CENTER: transparent to subtle
RIGHT: subtle dark/green
```

Example:

```css
background:
  linear-gradient(
    90deg,
    rgba(6, 43, 27, 0.94),
    rgba(6, 43, 27, 0.52),
    rgba(6, 43, 27, 0.04)
  );
```

Do not destroy the photography with an opaque overlay.

---

## 6. Color Palette

### Primary Deep Green

```css
--zain-green-950: #062B1B;
--zain-green-900: #083A24;
--zain-green-800: #0B4A2D;
--zain-green-700: #14653A;
```

Use for:
- hero overlays;
- navigation;
- footer;
- dark sections;
- major CTA surfaces;
- premium panels.

### Leaf Green

```css
--zain-leaf-600: #2F8F46;
--zain-leaf-500: #4FAF3A;
```

Use for:
- accents;
- active states;
- icons;
- decorative details.

### Lime

```css
--zain-lime-500: #B6D82A;
--zain-lime-400: #C9E54A;
```

Use very sparingly.

The lime should reference the leaf in the logo, not dominate the website.

### Champagne Gold

```css
--zain-gold-500: #C9A45C;
--zain-gold-400: #D9B66F;
--zain-gold-300: #E8D29A;
```

Gold is a luxury accent only.

Use for:
- small highlights;
- selected states;
- premium CTA details;
- eyebrow labels;
- decorative lines.

Do not make the interface gold-heavy.

### Warm Cream

```css
--zain-cream-50: #F7F4EC;
--zain-cream-100: #EEE9DC;
```

Use for editorial/light sections.

### Dark Neutral

```css
--zain-black: #07110D;
--zain-charcoal: #111814;
```

### White

```css
--zain-white: #FFFFFF;
```

---

## 7. Color Balance

Directional visual balance:

```text
Deep Green / Dark       45%
Cream / Warm White      30%
White                   15%
Leaf / Lime Green        7%
Gold                     3%
```

This is a design direction, not a hard mathematical constraint.

---

## 8. Typography

Use two complementary families:

### Display

A premium editorial serif or high-contrast display font.

Use for:
- hero;
- major section titles;
- company story;
- heritage/history moments.

### UI / Body

A clean modern sans-serif.

Use for:
- navigation;
- buttons;
- body;
- product information;
- forms;
- admin dashboard.

Arabic typography must be treated as a first-class design requirement.

If the project already contains approved font/design skills or font configuration, **use the existing project setup instead of introducing unnecessary alternatives.**

---

## 9. Typography Scale

Suggested responsive targets:

```text
Hero:
clamp(3rem, 7vw, 7.5rem)

Display:
clamp(2.5rem, 5vw, 5rem)

H1:
clamp(2.25rem, 4vw, 4rem)

H2:
clamp(1.75rem, 3vw, 3rem)

H3:
clamp(1.25rem, 2vw, 2rem)

Body Large:
1.125rem–1.35rem

Body:
1rem–1.125rem

Meta:
0.75rem–0.875rem
```

Adapt to the project's actual typography system.

---

## 10. Spacing

Use a consistent spacing scale:

```text
4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 80 / 96 / 128 / 160
```

Premium design requires generous whitespace.

Prefer whitespace over visual clutter.

---

## 11. Layout

Recommended container:

```css
max-width: 1440px;
margin-inline: auto;
padding-inline: clamp(1rem, 4vw, 5rem);
```

Do not stretch long text across the full viewport.

Use strong grid alignment.

---

## 12. Radius

Suggested:

```text
sm  10px
md  16px
lg  24px
xl  32px
2xl 40px
```

Use larger radius for:
- hero cards;
- feature cards;
- product imagery;
- large content panels.

Use smaller radius for:
- buttons;
- inputs;
- admin UI.

Pills are reserved for:
- tags;
- filters;
- status;
- compact badges.

---

## 13. Navigation

Navigation should be:

- minimal;
- premium;
- transparent/overlay on hero;
- sticky after scroll;
- accessible;
- responsive.

Suggested:

```text
Home
About
Brands
Products
Suppliers
Sustainability
Contact
```

Utility:

```text
Search
EN / عربي
Get in Touch
```

When overlaying the hero, use subtle translucent dark treatment.

On scroll, transition to a solid premium surface.

---

## 14. Buttons

Primary CTA:

```text
Explore Our Brands
```

Secondary:

```text
View Products
```

Possible storytelling CTA:

```text
Watch Our Story
```

Button style:
- premium;
- compact;
- strong typography;
- subtle arrow;
- refined hover;
- accessible focus.

Avoid giant SaaS-style buttons.

---

## 15. Motion

Motion should feel:

**cinematic, restrained, expensive**

Use:
- fade-up;
- image reveal;
- clip/mask reveal;
- subtle scale;
- small translate;
- staggered cards;
- navigation transitions.

Prefer small movement:

```text
0 → 24px
```

instead of exaggerated motion.

If Framer Motion is already installed, use it for the main premium interactions.

Respect `prefers-reduced-motion`.

---

## 16. Section Rhythm

Do not make every section white.

Recommended rhythm:

```text
Dark Hero
↓
Light / Cream
↓
Dark Story
↓
Light Catalog
↓
Dark Brands
↓
Editorial Sustainability
↓
Light Geographic Presence
↓
Dark Partnership CTA
↓
Dark Footer
```

The actual order may follow the approved product requirements, but the visual rhythm should remain varied.

---

## 17. Company Story

Use an editorial split:

```text
IMAGE                STORY
                     eyebrow
                     large heading
                     paragraph
                     1394 H
                     CTA
```

The 1394 H founding reference is approved company information.

Do not invent additional historical milestones.

---

## 18. Brands

Brands should feel curated rather than like a noisy logo wall.

Use:
- warm cream background;
- deep green typography;
- generous whitespace;
- clean brand logos;
- subtle hover.

Example:

```text
┌────────────────────┐
│                    │
│       LOGO         │
│                    │
│     CATEGORY       │
│                    │
│     Explore →      │
└────────────────────┘
```

Initial source brands include:

- Japlo
- Angel Stone & Natur
- Jasper
- R&R
- TITANIA
- El Shorouk

Do not hardcode brand data into components.

---

## 19. Product Cards

Structure:

```text
IMAGE
Brand
Product Name
Category
Short information
View Product →
```

Prioritize photography.

Never invent:
- prices;
- ratings;
- stock;
- reviews;
- ecommerce badges.

---

## 20. Product Categories

Initial categories:

- Personal Care & Cosmetic Accessories
- Baby Supplies
- Sports Corsets & Belts
- Compresses & Quick Treatment
- Additional Personal-Care Products

Category data must remain dynamic and editable by Admin.

---

## 21. Statistics

Statistics should feel like corporate proof points.

Possible content:

```text
1394 H
Since

Global Brands
Trusted Partners

Wide Distribution
Across Saudi Arabia
```

Only verified numbers may be shown.

The supplied company material includes a “50 years of success” marketing claim; do not automatically calculate or publish it as a current factual counter without approval.

---

## 22. Values

Seven supplied values:

```text
Quality
Sustainability
Transparency
Commitment
Collaboration
Innovation
Customer Care
```

Use:
- refined icon;
- small label;
- strong title;
- short description;
- subtle hover.

---

## 23. Sustainability

Visual language:

- natural materials;
- leaves;
- warm light;
- cream;
- deep green;
- restrained gold.

Do not add unsupported:
- certifications;
- measurements;
- emissions statistics;
- environmental awards.

---

## 24. Innovation

Use:
- deep green;
- premium product close-ups;
- subtle global/trade lines;
- refined technical details;
- restrained motion.

Core idea:

```text
Tradition
+
Quality
+
Innovation
```

---

## 25. Geographic Presence

Use a premium Saudi map.

Show:

```text
Saudi Arabia
↓
Distribution Coverage
↓
Verified Locations
```

The source confirms Jeddah as the listed company address and distribution throughout the Kingdom and across borders.

Do not invent branch locations.

---

## 26. Partnership CTA

Suggested direction:

```text
Partner With Zain

Connecting trusted brands,
quality products and growing markets.
```

CTA:

```text
Explore Partnership Opportunities
```

Use:
- deep green;
- gold detail;
- premium business imagery;
- subtle global-network motif.

---

## 27. Contact

Approved source contact:

```text
Jeddah, Aziziyah District
23337 King Fahd Road

0126747594
0126747595

ahmed@zainagency.com

Zainagency.com
```

Contact information must remain editable through CMS/settings.

---

## 28. Footer

Dark premium footer.

Include:
- logo;
- company statement;
- navigation;
- brands;
- products;
- suppliers;
- sustainability;
- contact;
- social links;
- copyright.

Use subtle borders and generous spacing.

---

## 29. Forms

Forms should feel premium and trustworthy.

Use:
- large comfortable controls;
- clear labels;
- strong focus states;
- minimal borders;
- deep-green focus;
- accessible errors;
- clear success feedback.

---

## 30. Search

Search should feel elegant.

Desktop:
- navigation trigger;
- large overlay/modal.

Mobile:
- full-width search.

Results:

```text
Products
Brands
Suppliers
Categories
```

---

## 31. Admin Dashboard

The Admin Dashboard must use the same brand identity but prioritize:

- clarity;
- productivity;
- information density;
- accessibility;
- fast scanning.

Public website:
**luxury / cinematic / editorial**

Admin:
**clean / functional / structured**

Shared:
- colors;
- typography;
- spacing;
- radii;
- icon language.

---

## 32. Responsive Design

### Desktop

Prioritize:
- large photography;
- editorial compositions;
- wide grids;
- generous whitespace.

### Tablet

Recompose:
- grids;
- navigation;
- hero;
- image placement.

### Mobile

Priorities:

1. readability;
2. CTA visibility;
3. image quality;
4. simple navigation;
5. touch usability.

Do not simply shrink desktop layouts.

---

## 33. Mobile Hero

Use:

```text
Logo
Menu

Eyebrow
Headline
Description

Primary CTA
Secondary CTA
```

Use a stronger overlay.

Use a deliberate crop rather than blindly centering the image.

---

## 34. Accessibility

Minimum:

- semantic HTML;
- keyboard navigation;
- visible focus;
- sufficient contrast;
- alt text;
- accessible buttons;
- accessible forms;
- reduced-motion support;
- screen-reader-friendly navigation;
- no important information conveyed only through color.

---

## 35. Performance

Premium visuals must remain performant.

Use:
- WebP/AVIF where supported;
- responsive image sizes;
- lazy loading below the fold;
- preload hero only when justified;
- optimized fonts;
- GPU-friendly transforms;
- limited animation;
- layout-shift prevention.

The hero is a high-priority asset and should be optimized appropriately.

---

## 36. Design Tokens

Use reusable CSS/design tokens.

Example:

```css
:root {
  --color-brand-950: #062B1B;
  --color-brand-900: #083A24;
  --color-brand-800: #0B4A2D;
  --color-brand-700: #14653A;

  --color-leaf-600: #2F8F46;
  --color-leaf-500: #4FAF3A;
  --color-lime-500: #B6D82A;

  --color-gold-500: #C9A45C;
  --color-gold-400: #D9B66F;

  --color-cream-50: #F7F4EC;
  --color-cream-100: #EEE9DC;

  --color-black: #07110D;
  --color-white: #FFFFFF;
}
```

If the existing project already has design tokens, extend them instead of creating a duplicate token system.

---

## 37. Component System

Build reusable components such as:

```text
Navbar
Hero
Button
SectionHeading
Container
ImageReveal
BrandCard
ProductCard
CategoryCard
SupplierCard
ClientLogo
StatCard
ValueCard
Timeline
MapSection
CTASection
Footer
SearchOverlay
Modal
FormField
Badge
```

Admin:

```text
AdminSidebar
AdminHeader
StatWidget
DataTable
FilterBar
SearchInput
FormSection
MediaUploader
RichTextField
ConfirmDialog
EmptyState
ErrorState
LoadingState
Toast
Pagination
```

Do not create unnecessary one-off components.

---

## 38. Icons

Use one consistent icon language.

Preferred:
- thin;
- geometric;
- refined;
- professional.

Do not mix random icon families.

If an icon skill/library already exists in the project, use it.

---

## 39. Image Direction

Photography should be:

- cinematic;
- warm;
- premium;
- authentic;
- commercial;
- high resolution.

Themes:

### Corporate
Warehouse, distribution, logistics, Saudi architecture.

### Products
Personal care, beauty accessories, baby supplies, support products.

### Partnership
Professional business collaboration.

### Sustainability
Natural materials, leaves, clean environments.

Avoid:
- cheap stock photography;
- generic office-team photos;
- random technology imagery;
- unrelated luxury imagery.

---

# 40. Skills — Mandatory Usage

The project will use the **skills already installed/available in the project environment**.

During implementation the AI agent MUST:

1. Inspect the actual available project skills before major UI work.
2. Identify relevant skills for:
   - UI/UX
   - design systems
   - frontend
   - responsive design
   - accessibility
   - motion/animation
   - image handling
   - typography
   - React/Next.js
   - Tailwind CSS
3. Read and follow relevant skill instructions.
4. Reuse existing project conventions.
5. Reuse existing components, utilities and tokens where possible.
6. Avoid installing duplicate libraries when an existing skill/project dependency already solves the need.
7. Never assume a particular skill exists; inspect the real environment first.

### Skill-first workflow

```text
Inspect Skills
      ↓
Inspect Existing Design System
      ↓
Inspect Existing Components
      ↓
Inspect Existing Assets
      ↓
Implement
      ↓
Verify Against DESIGN_SYSTEM.md
```

---

## 41. Existing Assets First

Before generating/downloading anything new, inspect:

```text
/public
/docs
/src/assets
```

and any other project asset directories.

Priority:

```text
Approved Project Asset
        ↓
Approved Brand Asset
        ↓
Existing Project Skill/Library
        ↓
New Asset only if necessary
```

The existing `logo` and `hero` assets are approved and should be reused.

---

## 42. No Design Drift

Every new component should answer:

- Does it use the brand palette?
- Does it use the typography hierarchy?
- Does it use the spacing system?
- Does it use the radius system?
- Does it use the icon language?
- Does it feel premium/corporate?
- Does it support Arabic/English?
- Does it fit the Zain story?

If not, revise it.

---

## 43. Visual Quality Bar

The final result should feel like a high-end corporate website.

Required quality:

- excellent typography;
- strong photography;
- consistent spacing;
- refined motion;
- responsive behavior;
- restrained visual effects;
- no visual clutter;
- no cheap gradients;
- no generic public-dashboard look;
- no random button styles;
- no excessive rounded cards;
- no unnecessary glassmorphism.

---

## 44. Design Acceptance Criteria

### Brand
- Approved logo used.
- Palette is consistent.
- No conflicting colors.

### Typography
- Clear hierarchy.
- Arabic readable.
- English readable.
- Mixed-language content stable.

### Layout
- Desktop works.
- Tablet works.
- Mobile works.
- No horizontal overflow.

### Interaction
- Hover states.
- Focus states.
- Loading states.
- Empty states.
- Error states.
- Success states.

### Motion
- Smooth.
- Purposeful.
- Reduced-motion aware.
- Does not damage performance.

### Accessibility
- Keyboard accessible.
- Labels available.
- Contrast acceptable.
- Semantic structure.

### Performance
- Images optimized.
- Hero prioritized.
- Animation restrained.
- No unnecessary blocking resources.

---

## 45. Implementation Checklist

### Before implementation

- [ ] Inspect project skills
- [ ] Inspect existing components
- [ ] Inspect existing tokens
- [ ] Inspect logo
- [ ] Inspect hero
- [ ] Inspect assets
- [ ] Confirm fonts
- [ ] Confirm i18n
- [ ] Confirm RTL

### During implementation

- [ ] Build/extend tokens
- [ ] Typography
- [ ] Buttons
- [ ] Container
- [ ] Navigation
- [ ] Hero
- [ ] Section primitives
- [ ] Cards
- [ ] Responsive layouts
- [ ] Motion
- [ ] Accessibility
- [ ] RTL

### After implementation

- [ ] Desktop review
- [ ] Tablet review
- [ ] Mobile review
- [ ] Arabic review
- [ ] English review
- [ ] Performance review
- [ ] Accessibility review
- [ ] Visual consistency review
- [ ] No horizontal overflow
- [ ] No broken images
- [ ] No logo replacement
- [ ] Hero asset is the approved `hero`

---

# 46. Final Design Statement

The digital identity should translate:

```text
Saudi Heritage
      +
International Reach
      +
Premium Personal Care
      +
Trusted Distribution
      +
Modern Technology
      +
Sustainable Growth
```

into a sophisticated digital experience.

The goal is:

> **A premium Saudi corporate trading platform with the confidence, polish and visual storytelling of an established international brand.**
