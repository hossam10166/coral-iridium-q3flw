# Security Specification — BEST UNITED Accounting 1448

## 1. Data Invariants
1. **Tiered Identity & Authentication**:
   - **Workspace Owners** authenticate via Google with verified email (`request.auth.token.email_verified == true`), owning `/users/{userId}` and `/users/{userId}/private/info`.
   - **Employee Staff Accounts** authenticate via Firebase Email/Password (`sign_in_provider == 'password'`) provisioned by a Workspace Owner, and are authorized **only** if a matching `/staffAccounts/{request.auth.uid}` document exists with `active == true` and `workspaceId == userId`.
2. **Strict Staff Account Governance**:
   - Only a verified Workspace Owner (`workspaceId == request.auth.uid`) can `list`, `create`, `update`, or `delete` `/staffAccounts/{staffUid}` records for their workspace.
   - An employee can `get` only their own `/staffAccounts/{request.auth.uid}` record, cannot `list` other employees, and cannot escalate their `role`, `active`, `permissions`, or `workspaceId`.
3. **Master Gate Relational Sync**: Single-document operations (`get`, `create`, `update`, `delete`) on any accounting subcollection verify the existence of `/users/{userId}` via `exists(...)` and require `ownerId == userId`.
4. **PII Isolation**: Owner email is isolated inside `/users/{userId}/private/info` and is strictly readable/writable only by the owner (`isOwner(userId)`), never by staff accounts.
5. **Path Hardening & Total Array Guarding**: Every path parameter satisfies `^[a-zA-Z0-9_\-]+$` (max 128 chars), every string field enforces explicit `.size() <= MAX`, and `permissions` on `StaffAccount` / `WorkspaceInvite` enforces `size >= 1 && size <= 20`, `permissions[0] is string`, and `.hasOnly(ALLOWED_PAGES)` (including `'invoice'`).
6. **Temporal & Identity Integrity**: `createdAt` and `updatedAt` are strictly validated against `request.time`; `uid`, `ownerId`, `workspaceId`, `createdBy`, `invitedBy`, `username`, and `createdAt` are immutable after creation (including on `GroupInvoice` records in `/users/{userId}/invoices`).
7. **Secure List Queries**: `allow list` on accounting subcollections enforces `resource.data.ownerId == userId` (never delegating filtering to the client). `allow list` on `/workspaceInvites` restricts queries strictly to `resource.data.workspaceId == request.auth.uid` or `resource.data.email == request.auth.token.email.lower()`.
8. **Shared Google Email Access Control**: Workspace Owners invite another verified Google email via `/workspaceInvites/{inviteId}`. The invited verified Google user binds `/users/{workspaceId}/googleMembers/{request.auth.uid}` strictly matching the invite's `role`, `permissions`, `email`, and `active == true` state. Disabling or deleting the invite immediately revokes access across all subcollections.

## 2. "Dirty Dozen" Adversarial Payloads (Must All Yield PERMISSION_DENIED)
1. **Unauthenticated Read/Write**: Reading `/users/{uid}/entries`, `/staffAccounts/{staffUid}`, or `/workspaceInvites/{inviteId}` without `request.auth` -> `PERMISSION_DENIED`.
2. **Self-Registered Unapproved Password User**: Arbitrary Email/Password user without a Workspace Owner-created `/staffAccounts/{uid}` doc trying to read/write `/users/{uid}/entries` -> `PERMISSION_DENIED`.
3. **Deactivated Staff or Revoked Google Invite**: Employee with `active == false` or Google user whose `/workspaceInvites/{inviteId}` has `active == false` attempting read/write on `/users/{workspaceId}/entries` -> `PERMISSION_DENIED`.
4. **Privilege Escalation**: Staff updating `/staffAccounts/{uid}` or invited Google user claiming `/users/{workspaceId}/googleMembers/{uid}` with `role: "admin"` when invite has `role: "staff"` -> `PERMISSION_DENIED`.
5. **Cross-Tenant Snooping**: User A reading `/users/{workspaceB}/entries` or listing `/staffAccounts` / `/workspaceInvites` for another email -> `PERMISSION_DENIED`.
6. **PII Leak Attempt**: Staff or shared Google member attempting `get` on `/users/{workspaceA}/private/info` -> `PERMISSION_DENIED`.
7. **Shadow Ghost Field Injection**: Creating a `StaffAccount`, `WorkspaceInvite`, or `VisaEntry` with extra key `isSuperAdmin: true` -> `PERMISSION_DENIED` (blocked by `hasOnly`).
8. **Immutable Field Mutation**: Updating `StaffAccount.username`, `WorkspaceInvite.email`, `WorkspaceInvite.workspaceId`, or `VisaEntry.ownerId` -> `PERMISSION_DENIED`.
9. **Array Poisoning on Permissions**: Creating `StaffAccount` or `WorkspaceInvite` with `permissions: ["hacked_page"]` or 100 elements -> `PERMISSION_DENIED`.
10. **ID Poisoning Attack**: Creating a document with ID `../../admin/hack` or 1,500 chars -> `PERMISSION_DENIED`.
11. **Forged Client Timestamp**: Creating a `StaffAccount` or `WorkspaceInvite` with `createdAt: Timestamp(2020-01-01)` instead of `request.time` -> `PERMISSION_DENIED`.
12. **Owner Spoofing on Create**: Creating `/users/{workspaceA}/entries/{id}` with `ownerId: workspaceB` or unverified email token claiming a Google invite -> `PERMISSION_DENIED`.
