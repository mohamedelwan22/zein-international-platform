# Public API (anonymous, rate-limited)

**Feature**: 001-zain-b2b-platform | **Companion**: `README.md` (conventions), `plan.md`, `spec.md`.

Three endpoints serve the public site. Public *pages* are rendered by server components from the database (no HTTP from server to server); these endpoints cover forms and search.

---

## `POST /api/inquiries` — create inquiry lead

**Access**: anonymous · **Rate**: 5/10 min/IP+email · **Spec**: FR-016, FR-017, FR-019, SC-003 · **Consent required** (Clarification 2).

Request (`application/json`):

```json
{
  "type": "product",
  "name": "Aisha Rahman",
  "company": "Gulf Build Co.",
  "email": "aisha@example.com",
  "phone": "+966501234567",
  "subject": "Packaging inquiry",
  "message": "Please share certified packaging options.",
  "consentAccepted": true,
  "locale": "en",
  "productId": "…", "brandId": "…", "supplierId": null
}
```

- `type` required — one of `product` | `brand` | `supplier` | `distribution` | `partnership` | `general` (FR-016).
- `name`, `email`, `message` required (length caps per validation model); `subject` required, length-capped (FR-016). At least one of `email`/`phone` required.
- `consentAccepted` **must be `true`** else `400 VALIDATION_FAILED`; the live privacy notice is linked in the form (content from Settings — Open Item 6).
- `productId`/`brandId`/`supplierId` optional, captured from source-page context; must reference a published entity or be omitted.
- `locale` default `en`.

Responses:

- `201` → `{ "id": "…", "status": "new", "createdAt": "…" }` — minimalist; no notification is sent (Clarification 1).
- `400` validation (incl. consent false), `413` oversized, `429 RATE_LIMITED`.

**Side effects**: row insert + `RateLimitCounter`; status defaults `new` (Clarification 3). No activity-log write (anonymous submit).

---

## `POST /api/partnerships` — create partnership request

**Access**: anonymous · **Rate**: 5/10 min/IP+email · **Spec**: FR-018, FR-019, SC-003 · **Consent required**.

Multipart (`form-data`) when a document is attached, else JSON:

```json
{
  "name": "Omar Al-Farsi",
  "company": "Al-Farsi Logistics",
  "email": "omar@example.com",
  "phone": "+971501234567",
  "message": "Proposing regional distribution partnership.",
  "businessType": "logistics",
  "consentAccepted": true,
  "locale": "ar"
}
```

Plus optional `attachment` file: pdf/doc/docx, ≤20 MB, magic-byte sniffed (FR-033). Other fields as in Inquiry; partnership-context extra fields (`businessType`, capacity/capabilities, country, website, product category) optional per FR-018.

Responses: `201` → `{ "id": "…", "status": "new", "createdAt": "…" }`; same error set as inquiry, plus `415` (rejected MIME/magic bytes), `413` (size), `400` (consent false / fields). Attachment access by staff is an auditable event (FR-035).

---

## `GET /api/search` — catalog search

**Access**: anonymous · **Rate**: 30/min/IP · **Spec**: FR-015, SC-006, spec confidentiality edge case.

Query:

```
GET /api/search?q=cement&type=product&locale=en&page=1&pageSize=20
```

- `q` required, min 2 chars (else `400`).
- `type` optional: `product|brand|supplier|category` (default all four).
- `locale` optional (default `en`) selects localized titles/descriptions and slug matching.
- Returns **published-only** rows (Client excluded unless `disclosureApproved`); no price/stock fields exist.

Response `200`:

```json
{
  "items": [
    {
      "id": "…", "type": "product", "entityType": "product",
      "title": "Empty Cement Blocks",
      "slug": "/en/cement-blocks",
      "summary": "…",
      "imageUrl": "…", "brandName": "Bestway"
    }
  ],
  "categoryFacets": [ { "kind": "product", "id": "…", "label": "Building Materials", "count": 12 } ],
  "total": 42, "page": 1, "pageSize": 20
}
```

`items` is a merged result set across requested types (one SQL query with `tsvector('simple')` + `pg_trgm`). Empty `q`→ result set yields `200` with empty `items` (spec SC-006 empty state). Errors: `400`, `429`, `500`.

---

*Traceability: inquiry FR-016/FR-017/SC-003, partnership FR-018/SC-003, search FR-015/SC-006, consent Clarification 2, shared pipeline Clarification 3, no notifications Clarification 1 — see `spec.md`.*