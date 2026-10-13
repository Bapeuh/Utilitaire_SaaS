# ADR-006 — Authentication boundary and Better Auth

## Status
Accepted for V1, subject to implementation validation

## Decision
Use Better Auth as the initial authentication solution while keeping authorization entirely inside the Utilitaire domain.

Authentication answers **who is the user?** Authorization answers **what may this user do in this Workspace/Context?**

Better Auth is responsible for identity/session concerns such as email/password, sessions, reset flows and future identity providers.

Utilitaire remains responsible for:
- Workspace membership;
- Person linkage;
- AccessRole;
- Permission;
- UserAccessGrant;
- TeamAccessGrant;
- Context inheritance;
- guest/member semantics.

## Reasons
- Avoid coupling the permission architecture to a BaaS vendor.
- Remain TypeScript-centric and self-hostable/portable.
- Preserve the ability to replace the authentication provider without redesigning business authorization.

## Consequences
- Authentication tables/integration must be isolated from business permission tables.
- No module may infer authorization solely from an authentication-provider role.
- Better Auth integration must be validated during bootstrap before it becomes difficult to replace.