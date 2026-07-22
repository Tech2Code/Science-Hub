# Implementation Plan: Feature Access Control

## Overview

Implement a granular, section-level access control system for Science Hub's financial dashboard sections. The system adds a `SectionPermission` Prisma model, embeds permissions in the JWT token, enforces server-side route protection, filters navigation and dashboard widgets client-side, and provides an admin UI for managing per-user section permissions.

## Tasks

- [x] 1. Database layer and shared constants
  - [x] 1.1 Add SectionPermission model to Prisma schema
    - Add the `SectionPermission` model with fields: id, userId, section, enabled, createdAt, updatedAt
    - Add composite unique constraint `@@unique([userId, section])` and `@@index([userId])`
    - Add `onDelete: Cascade` on the user relation
    - Add `sectionPermissions SectionPermission[]` relation to the `User` model
    - Run `prisma migrate dev` to generate and apply migration
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 1.2 Create shared section constants and types
    - Create `src/lib/sections.ts` with `PROTECTED_SECTIONS` const array, `ProtectedSection` type, `ROUTE_SECTION_MAP`, `SECTION_LABELS`, and `DASHBOARD_WIDGET_SECTIONS`
    - _Requirements: 8.2_

- [x] 2. Auth integration — embed permissions in JWT and session
  - [x] 2.1 Extend next-auth type declarations
    - Update `src/types/next-auth.d.ts` to add `sections: string[]` to the Session user interface
    - _Requirements: 9.1, 9.2_

  - [x] 2.2 Modify JWT callback to load and embed section permissions
    - In the `jwt` callback's initial login block (`if (user)`), query `SectionPermission` records with `enabled: true` and set `token.sections`
    - In the periodic DB re-check block, also reload section permissions and update `token.sections`
    - If the permission query fails during initial login, return `null` from authorize to deny login
    - _Requirements: 9.1, 9.3, 9.4_

  - [x] 2.3 Modify session callback to expose sections
    - In the `session` callback, copy `token.sections` to `session.user.sections`, defaulting to `[]` if undefined
    - _Requirements: 9.2, 9.5_

- [x] 3. Server-side access control helper
  - [x] 3.1 Add `requireSectionAccess()` to apiAuth.ts
    - Export a new `requireSectionAccess(section: ProtectedSection)` function
    - Admin role: always allow (bypass check)
    - Staff role: always deny with 403
    - Other roles: check if section exists in `session.user.sections`; deny with 403 if missing
    - Handle undefined/malformed sections array by treating as empty (deny all)
    - _Requirements: 1.1, 1.2, 2.1, 3.1, 7.1, 7.2, 7.5, 9.5_

  - [ ]* 3.2 Write property tests for access control logic
    - **Property 1: Admin bypass** — generate admin users × all sections → always allow
    - **Property 2: Staff hard deny** — generate staff users × all sections → always deny
    - **Property 3: Grantable user access equals enabled set** — generate users with random section subsets → access matches set membership
    - **Property 6: Defensive deny on malformed session** — generate malformed sections values → always deny
    - **Validates: Requirements 1.1, 1.3, 2.1, 2.2, 2.5, 3.1, 3.2, 9.5**

- [x] 4. Checkpoint - Verify core access logic
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Navigation filtering in DashboardShell
  - [x] 5.1 Add `sectionRequired` field to NavItem and populate for protected routes
    - Extend the `NavItem` interface with `sectionRequired?: ProtectedSection`
    - Add `sectionRequired` values to: Sales Overview (`sales_overview`), Purchase Overview (`purchase_overview`), Payments Received (`payments_received`), Payments Made (`payments_made`), Sales Reports (`reports_sales`), Purchase Reports (`reports_purchases`)
    - Update the filtering logic: admin sees all; staff sees none of the section-gated items; grantable users see only items matching their `session.user.sections`
    - _Requirements: 1.3, 2.2, 3.2, 4.2, 5.2_

  - [ ]* 5.2 Write unit tests for navigation filtering logic
    - Test admin sees all nav items
    - Test staff sees no protected nav items
    - Test grantable user sees only granted sections
    - Test grantable user with no permissions sees no protected items
    - _Requirements: 1.3, 2.2, 3.2, 4.2, 5.2_

- [x] 6. Dashboard widget conditional rendering
  - [x] 6.1 Modify dashboard page to conditionally render Sales and Purchases widgets
    - Compute `canSeeSales` and `canSeePurchases` booleans based on role and session sections
    - Wrap Sales KPIs + Recent Invoices in `{canSeeSales && (...)}`
    - Wrap Purchases KPIs + Recent Bills in `{canSeePurchases && (...)}`
    - Admin: show all; Staff: hide all; Grantable: show based on permissions
    - _Requirements: 1.4, 2.3, 3.3, 4.3, 4.4, 5.3, 5.4_

- [x] 7. Permission management API
  - [x] 7.1 Create GET endpoint at `/api/admin/permissions`
    - Require admin role via `requireAdmin()`
    - Query all users whose role is neither "admin" nor "staff"
    - For each user, include their section permission records
    - Return list of grantable users with their current permissions
    - _Requirements: 6.2, 6.4_

  - [x] 7.2 Create POST endpoint at `/api/admin/permissions`
    - Require admin role via `requireAdmin()`
    - Validate request body: `userId`, `section` (must be in `PROTECTED_SECTIONS`), `enabled` (boolean)
    - Validate target user exists and is not admin or staff (return 403 if so)
    - Upsert `SectionPermission` with composite unique `[userId, section]`
    - Return success response with the updated permission record
    - _Requirements: 4.1, 4.5, 5.1, 6.5, 2.4_

  - [ ]* 7.3 Write property tests for permission management validation
    - **Property 4: Permission grant validation** — generate admin/staff target users × sections → operation rejected
    - **Property 5: Manageable users exclusion** — generate user lists with mixed roles → filtered list contains only grantable roles
    - **Validates: Requirements 2.4, 4.5, 6.4**

- [x] 8. Permission management UI
  - [x] 8.1 Create `/admin/permissions` page with server-side admin guard
    - Create `src/app/(dashboard)/admin/permissions/page.tsx`
    - Add server-side redirect to `/dashboard` for non-admin users
    - _Requirements: 6.1_

  - [x] 8.2 Implement permission management client component
    - Fetch grantable users and their permissions via GET `/api/admin/permissions`
    - Display a table with user name, email, and one toggle per protected section
    - Each toggle shows current enabled/disabled state
    - On toggle, fire POST immediately (optimistic UI with rollback on error)
    - Show toast confirmation on success, revert + error toast on failure
    - _Requirements: 6.2, 6.3, 6.5, 6.6, 6.7_

- [x] 9. Checkpoint - Verify permission management flow
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Server-side route protection for all protected pages
  - [x] 10.1 Add `requireSectionAccess()` to Sales section pages
    - Protect `/sales` page with `requireSectionAccess("sales_overview")`
    - Protect `/sales/payments` page with `requireSectionAccess("payments_received")`
    - Redirect unauthorized users to `/dashboard`
    - _Requirements: 7.1, 7.4, 7.5, 3.4_

  - [x] 10.2 Add `requireSectionAccess()` to Purchases section pages
    - Protect `/purchases` page with `requireSectionAccess("purchase_overview")`
    - Protect `/purchases/payments` page with `requireSectionAccess("payments_made")`
    - Redirect unauthorized users to `/dashboard`
    - _Requirements: 7.1, 7.4, 7.5, 3.4_

  - [x] 10.3 Add `requireSectionAccess()` to Reports section pages
    - Protect `/reports/sales` page with `requireSectionAccess("reports_sales")`
    - Protect `/reports/purchases` page with `requireSectionAccess("reports_purchases")`
    - Redirect unauthorized users to `/dashboard`
    - _Requirements: 7.1, 7.4, 7.5, 3.4_

  - [x] 10.4 Add `requireSectionAccess()` to protected API routes
    - Protect sales-related API endpoints with appropriate section checks
    - Protect purchase-related API endpoints with appropriate section checks
    - Return 403 for unauthorized API access
    - _Requirements: 7.2, 7.3_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout — all implementation tasks use TypeScript
- fast-check library will need to be installed as a dev dependency for property-based tests

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["3.2", "5.1", "6.1", "7.1", "7.2"] },
    { "id": 4, "tasks": ["5.2", "7.3", "8.1"] },
    { "id": 5, "tasks": ["8.2", "10.1", "10.2", "10.3", "10.4"] }
  ]
}
```
