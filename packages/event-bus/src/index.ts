export type DomainEvent<T = unknown> = { id: string; name: string; version: number; workspaceId: string; occurredAt: string; payload: T };
