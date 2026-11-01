# Offline operation and LAN ↔ cloud sync

**Status: designed, foundations in the data model. Not implemented and not tested on a LAN. Do not describe offline mode as available.**

## Target topology

```
  Dealership LAN                                   Cloud (Arvan or other)
 ┌──────────────────────────────┐               ┌──────────────────────────────┐
 │ local server                 │   outbound    │ Manage cloud node            │
 │  web + api + PostgreSQL      │◄────HTTPS────►│  web + api + PostgreSQL      │
 │  NODE_ID=branch-lan-01       │  (sync agent) │  NODE_ID=cloud               │
 └──────────────────────────────┘               └──────────────────────────────┘
   staff browsers on LAN keep working              authorised remote access, backup,
   when the internet is down                       multi-dealership reporting
```

## What already exists

| Building block | Where |
| --- | --- |
| Node-independent ids (UUIDv7) | `apps/api/src/common/ids.ts` |
| `version` on every mutable row; writes require `expectedVersion` | services + `cases/tasks/blockers` tables |
| Change log written in the same transaction as each change (full row snapshot, `node_id`, `entity_version`, `synced_at`) | `change_log`, `AuditService.record()` |
| Idempotency keys for replayed requests | `idempotency_keys`, `IdempotencyInterceptor` |
| Tenant boundary on every row | `tenant_id` |

## Protocol (to build in delivery 4)

1. A sync agent on each node pushes unsynced `change_log` rows in `seq` order, in batches, with retry and exponential backoff; the receiver applies them idempotently by `change_log.id`.
2. Apply rule: if the incoming `entity_version` is the next version of the local row → apply. If both sides changed the same version → **conflict**.
3. Conflicts:
   - Descriptive fields (notes, location, technician name): field-level merge when different fields changed; otherwise a conflict record for a person to resolve.
   - **Never last-write-wins** for financial approvals, official deadline changes, delivery, case closure or anything that grants permission. These stay in conflict until a manager resolves them.
4. Case numbers: before two nodes write, numbers get a node prefix or are provisional until the authoritative node confirms them.
5. Official approvals (golden card, insurance) recorded while offline remain "pending verification": being offline never creates official approval.
6. UI status indicator: آفلاین / در انتظار همگام‌سازی / همگام‌شده / دارای تعارض. Today the sidebar honestly shows "همگام‌سازی محلی: هنوز فعال نشده".

## Test scenarios required before calling it done

Internet down; LAN down; local server failure; cloud failure; partial sync interrupted mid-batch; two conflicting edits of the same case; duplicate delivery of the same batch; backup restore on each node followed by resync.
