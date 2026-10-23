# MAURITOP Security Specification (review draft — not yet emulator-verified)

## Identity and privileged access
- The owner identity is recognized by the configured owner email/UID in the rules and server code.
- A mutable `users/{uid}.role` field does not grant administrative authority.
- The owner alone may create, change, or revoke `adminMembers/{uid}` permission grants.
- Staff permissions are explicit and limited: `viewOrders`, `processOrders`, `manageServices`, `managePromotions`, `managePaymentMethods`, `viewAnalytics`, and `manageSEO`.
- The users directory, KYC records, withdrawal approval, user balances, global settings, and staff grants remain owner-only.

## Data invariants
1. A user profile is readable by its owner and the owner administrator; users cannot change protected role, balance, reward, or verification fields.
2. Services are public to read but only the owner or a staff member with `manageServices` can change them.
3. Users can create orders only for their own UID. Order creation requires an existing active service, non-negative fee, a positive amount for non-quote orders, and `total == amount + fee`.
4. Order status changes by staff with `processOrders` are limited to a small list of fields; staff cannot delete orders or update customer balances.
5. Staff may read full order documents when granted `viewOrders`. Historical documents may still contain personal fields; Firestore Rules cannot redact individual fields. Strict privacy requires migration or a server endpoint that returns a sanitized order view.
6. New orders do not duplicate the user's email/name; these remain in `users/{uid}`.
7. Public posts are readable only when approved; the owner or `managePromotions` staff may manage posts.
8. Only the owner can approve/reject withdrawals or KYC records.
9. Payment destinations are public business data; secrets must never be stored in public settings or client bundles.
10. Profile images are limited to small image files under the owner's UID path. Receipt images are limited by size/type and tied to an order owner.

## Known limitations / release blockers
- Rules have not yet been run through Firebase Emulator or deployed to a test project.
- Client-side order amount selection is not a complete substitute for server-side price validation. A trusted server must verify the selected package and current price before order creation/fulfillment.
- `package.json` does not match `package-lock.json` and `bun.lock`; installation/build must be fixed and verified before release.
- `firebase.json` configures static Hosting only. Express endpoints in `server.ts` need a separate Node hosting target and correct API routing.
- Historical order records may contain user email/name and need migration or a sanitized backend view before strict staff privacy can be guaranteed.
- PayPal is not integrated; it must remain disabled until server-side order verification and webhook validation are implemented.

## Required emulator tests
- A normal user cannot list users, read another profile, change roles/balances, modify service prices, approve payments, or edit another user's orders.
- A staff member can access only the granted dashboard sections and actions.
- A staff member cannot list users, change balances, approve withdrawals/KYC, change global settings, grant permissions, or delete orders.
- A staff member with `viewOrders` can read orders and receipts only for operational purposes; note that legacy order fields remain visible at document level until migrated.
- A user cannot create an order for an inactive/nonexistent service or submit a negative amount/fee or inconsistent total.
- Avatar/receipt uploads outside allowed paths, types, or size limits are rejected.
- Only approved posts are publicly queryable.
