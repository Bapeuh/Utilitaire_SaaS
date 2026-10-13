# ADR-005 — PostgreSQL and Drizzle

## Status
Accepted

## Decision
Use PostgreSQL as the authoritative database and Drizzle as the TypeScript database toolkit/ORM.

## Reasons
The architecture relies on PostgreSQL capabilities including:
- foreign and composite foreign keys;
- transactions;
- JSONB;
- partial/advanced indexes;
- recursive Context hierarchy queries;
- possible Row Level Security;
- transactional outbox;
- explicit SQL constraints.

Drizzle is selected over Prisma to keep the implementation close to PostgreSQL and allow SQL/migrations to remain explicit when advanced database features require it.

## Rules
- Database constraints enforce simple structural invariants.
- Complex domain invariants remain in module services.
- `workspace_id` is retained on workspace-scoped business tables for tenant safety/querying.
- Cross-workspace structural references are prevented with tenant-safe keys/FKs where appropriate.
- Module private tables are not an inter-module API.

## Consequences
Developers must understand PostgreSQL rather than treating the ORM as the database abstraction boundary.