# Lots de développement V1

Chaque lot doit laisser `main` déployable après merge. Ne pas démarrer un module métier en contournant les fondations prévues dans un lot antérieur.

## Lot 0 — Bootstrap du monorepo

### Livrables
- pnpm workspace + Turborepo ;
- `apps/web`, `apps/api`, `apps/worker` ;
- packages partagés initiaux ;
- TypeScript strict ;
- lint/format/test/build ;
- Docker Compose PostgreSQL + stockage S3-compatible local ;
- variables d'environnement documentées ;
- CI minimale ;
- contrôle automatique des frontières de modules/imports dans lint/CI.

### Acceptation
- installation depuis clone documentée ;
- une commande lance l'environnement dev ;
- une commande exécute lint + types + tests ;
- web appelle un endpoint health API ;
- CI reproduit ces contrôles ;
- une dépendance interdite entre modules fait échouer la CI.

---

## Lot 1 — Foundation / Alpha 0.1

### Backend/Data
- Better Auth validé/intégré ;
- Workspace/User/WorkspaceUser ;
- Person ;
- Organization ;
- Team / TeamMember ;
- Context ;
- Object Registry ;
- Scope ;
- Project ;
- permissions + rôles système ;
- UserAccessGrant + TeamAccessGrant ;
- Activity + Outbox infrastructure avec retry/dead-letter ;
- module registry minimal.

### UI
- login/logout ;
- sélection/création Workspace ;
- navigation responsive ;
- création Scope/Project ;
- membres et rôles système basiques.

### Acceptation
- un User peut appartenir à plusieurs Workspaces ;
- aucune lecture cross-workspace n'est possible ;
- un Project possède son Context et Object atomiquement ;
- les rôles Administrator/Manager/Member/Guest produisent des contrôles API réels ;
- TeamAccessGrant est fonctionnel ;
- outbox at-least-once, idempotence et dead-letter sont testables ;
- PWA installable ;
- navigation utilisable sur téléphone.

---

## Lot 2 — Tasks / Alpha 0.2

### Fonctionnel
- CRUD/archive Task ;
- parent/subtask ;
- status ;
- priority ;
- Person/Team assignments ;
- checklist ;
- comments ;
- files ;
- tags ;
- Relations génériques ;
- Notifications in-app.

### UI
- liste ;
- Kanban ;
- détail Task ;
- filtres essentiels.

### Acceptation
- Task peut vivre en Workspace/Scope/Project ;
- parent/enfant même Context ;
- déplacer une Task déplace atomiquement son sous-arbre ;
- Phase hors nouveau Context détachée et liens Milestone externes retirés ;
- dépendances cross-context conservées ;
- commentaires/fichiers/tags restent attachés via Object Registry ;
- Team assignment reste une affectation à la Team ;
- permissions appliquées côté API.

---

## Lot 3 — Project+ / Alpha 0.3

### Fonctionnel
- Phase ;
- Milestone ;
- TaskDependency ;
- calendrier ;
- Gantt basique ;
- finalisation des vues/UX Teams et memberships.

### Acceptation
- phases/milestones respectent le Context ;
- dépendance finish-start disponible ;
- cycles refusés ;
- dépendance vers Context non visible ne divulgue pas les détails ;
- dates modifiables depuis les vues prévues.

---

## Lot 4 — Scheduling / Alpha 0.4

### Fonctionnel
- JobRole ;
- Resource Service minimal (`Resource` seulement, sans Booking/Allocation) ;
- Schedule ;
- Shift ;
- ShiftRequirement ;
- ShiftPersonAssignment ;
- ShiftBreak ;
- PersonAvailability ;
- détection de conflits.

### UI
- planning jour/semaine ;
- création/édition Shift ;
- affectation Person ;
- besoins non pourvus visibles ;
- avertissements de conflit.

### Acceptation
- Scheduling fonctionne sans HR ;
- Scheduling fonctionne sans qu'une Person possède une Resource ;
- une Person ne peut avoir deux assignments identiques sur le même Shift ;
- chevauchements détectés sans être universellement bloqués ;
- pauses individualisées ;
- Open Shift possible via requirements sans assignment ;
- Resource Service est disponible comme fondation optionnelle sans ResourceBooking/Allocation.

---

## Lot 5 — Event / Alpha 0.5

### Fonctionnel
- Event ;
- ProgramBlock hiérarchique ;
- Session ;
- ParticipantRole ;
- EventParticipant ;
- SessionParticipant.

### UI
- liste/détail Event ;
- programme ;
- sessions ;
- participants.

### Acceptation
- Event fonctionne sans Project ;
- Event peut ne pas avoir de Session ;
- Session/ProgramBlock appartiennent au même Event ;
- capacité déclarée reste distincte de Flux ;
- aucune Registration implicite n'est créée.

---

## Lot 6 — Forms / Alpha 0.6

### Fonctionnel
- Form ;
- versioning ;
- champs V1 ;
- options statiques ;
- règle conditionnelle simple ;
- FormTarget ;
- Submission ;
- SubmissionSubject ;
- Answers ;
- fichiers de réponse.

### UI
- builder ;
- preview ;
- publication ;
- formulaire répondant ;
- consultation des réponses.

### Acceptation
- version publiée immutable ;
- modification structurelle crée une nouvelle version ;
- Submission conserve sa version historique ;
- submitted answers immutables ;
- un Form peut cibler un Object sans dépendance directe vers son module.

---

## Lot 7 — Flux Lite / Alpha 0.7

### Fonctionnel
- FluxScenario ;
- un FluxFlowModel 1:1 par Scenario ;
- Session model ;
- Freeflow model ;
- OperatingPeriods ;
- simulations ;
- snapshots ;
- résultats ;
- comparaison.

### Architecture
`packages/flux-engine` doit être une fonction/moteur TypeScript pur testable sans DB/API/UI.

### Acceptation
- Flux fonctionne avec tous les autres modules utilisateur désactivés ;
- Flux fonctionne sans aucun Provider optionnel ;
- un Provider de test peut enrichir les inputs sans accès aux tables du provider ;
- `resource.capacity` peut être absent en V1 ;
- mêmes inputs + même engine version donnent le même résultat ;
- historique des simulations n'est pas modifié lorsque Scenario change ;
- Session et Freeflow sont couverts par tests déterministes ;
- aucun accès direct aux tables Event/Scheduling.

---

## Lot 8 — Stabilisation V1

### Livrables
- tests E2E transversaux ;
- audit permissions/tenant isolation ;
- responsive mobile ;
- PWA ;
- accessibilité de base ;
- observabilité/logging ;
- gestion d'erreurs ;
- sauvegarde/restauration documentée ;
- documentation installation/déploiement ;
- seed démonstration ;
- performance des vues principales.

### Scénario E2E de référence
Créer un Workspace → Scope → Project → Tasks → planning → Event/Sessions → Form attaché → Submission → Flux Scenario → Simulation, tout en vérifiant qu'un second Workspace ne voit aucune de ces données.

### Definition of Done V1
- build CI vert ;
- migrations reproductibles sur DB vierge ;
- tests critiques verts ;
- aucune violation connue d'isolation tenant ;
- utilisable desktop + téléphone ;
- installable PWA ;
- documentation suffisante pour reprendre le développement sans connaissance orale du projet.
