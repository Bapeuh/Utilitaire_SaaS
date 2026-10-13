# ADR-007 — Cross-platform strategy

## Status
Accepted

## Decision
Adopt a progressive cross-platform strategy rather than building separate clients in V1.

1. V1: responsive React web application + PWA.
2. Desktop when justified: Tauri wrapping/reusing the web application and shared packages.
3. iOS/Android when justified: prefer Capacitor while web-based UX remains sufficient.
4. Move to React Native/Expo only if native mobile requirements materially outgrow the web/Capacitor approach.

## Target surfaces
- desktop browser;
- mobile browser;
- installable PWA;
- future Windows/macOS desktop application;
- future iOS/Android application.

## Reasons
Most core workflows are forms, tasks, schedules, dashboards and operational tools, which are well suited to responsive web UI. Native applications should be introduced for concrete requirements such as advanced offline use, push, camera/QR/NFC, background execution, MDM or device integrations.

## Offline principle
V1 is offline-compatible by design, not fully offline-first. UUIDs, timestamps, immutable historical snapshots and API boundaries should avoid blocking a future synchronization layer.

## Consequences
Do not duplicate the UI prematurely. Mobile-specific/native code must be justified by an identified product requirement.