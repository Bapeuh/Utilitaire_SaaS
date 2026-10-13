# Cahier des charges technique — V1

## 1. Objectif

Construire une première version exploitable d'Utilitaire SaaS validant l'architecture modulaire sur cinq domaines utilisateur : Tasks, Scheduling, Event, Forms et Flux Lite.

La V1 doit fonctionner dans un navigateur desktop et mobile et être installable comme PWA. Elle doit préparer, sans les implémenter prématurément, les futurs clients Tauri desktop et Capacitor/native mobile.

## 2. Stack figée

- TypeScript
- pnpm + Turborepo
- React + Vite
- TanStack Router
- TanStack Query
- PWA responsive
- NestJS API
- PostgreSQL
- Drizzle
- Zod pour contrats/validation partagés
- Better Auth pour l'authentification, sous réserve de validation au bootstrap
- Docker pour l'infrastructure locale/déploiement
- stockage objet S3-compatible
- Vitest + Playwright
- transactional outbox pour les événements fiables

## 3. Architecture du dépôt

```text
apps/
  web/
  api/
  worker/
packages/
  contracts/
  database/
  auth/
  permissions/
  ui/
  event-bus/
  provider-registry/
  forms-engine/
  flux-engine/
modules/
  core/
  tasks/
  scheduling/
  event/
  forms/
  flux/
docs/
infrastructure/
```

Les noms exacts peuvent évoluer au bootstrap si nécessaire, mais les frontières logiques ne doivent pas être supprimées.

## 4. Règles non négociables

1. Workspace = frontière de tenant.
2. Toutes les données workspace-scoped sont isolées.
3. Context détermine où vit une activité : Workspace, Scope ou Project.
4. Object Registry adresse les objets transversalement.
5. Un module ne lit jamais directement les tables privées d'un autre module.
6. Interactions inter-modules via Actions, Events ou Providers.
7. Les objets métier sont archivés plutôt que supprimés par défaut.
8. Les opérations Object + business row + outbox/activity sont transactionnelles.
9. L'authentification ne remplace jamais le moteur d'autorisation métier.
10. Flux Engine et autres moteurs purs ne dépendent ni de React, ni de NestJS, ni de la DB.

## 5. Qualité attendue V1

### Sécurité
- contrôle authentification sur routes privées ;
- contrôle Workspace sur chaque requête métier ;
- permissions contextuelles côté API ;
- aucune confiance dans les contrôles UI ;
- validation serveur des payloads ;
- secrets uniquement via environnement/secret store.

### Données
- migrations versionnées ;
- seed de développement reproductible ;
- contraintes SQL définies dans les règles d'intégrité ;
- UUID pour les identifiants métier ;
- `timestamptz` pour les instants ;
- archivage explicite.

### Tests
Chaque lot doit inclure au minimum :
- tests unitaires des règles métier importantes ;
- tests d'intégration DB/API pour tenant isolation et contraintes ;
- parcours E2E critiques ;
- tests des permissions négatives, pas seulement des parcours autorisés.

## 6. Critère global de fin V1

Un utilisateur doit pouvoir :

1. créer/se connecter à son compte ;
2. entrer dans un Workspace ;
3. créer Scope/Project et gérer les accès de base ;
4. créer et suivre Tasks/Phases/Milestones ;
5. créer un planning et affecter des Persons à des Shifts ;
6. créer un Event avec ProgramBlocks/Sessions/Participants ;
7. construire/publier un Form et collecter des Submissions ;
8. créer un scénario Flux Session ou Freeflow et lancer une simulation ;
9. utiliser les fonctions principales depuis desktop et mobile/PWA ;
10. constater que les modules restent utilisables indépendamment et qu'aucun module n'est techniquement requis par un autre hors Core.

## 7. Hors V1

Registration/waiting list, Communication, Time Tracking, Procedures, automation editor utilisateur, ResourceBooking/Allocation, advanced HR, Assets, Spaces, Maintenance, Finance, Ticketing, CRM, Procurement, Workflow avancé, offline sync complet, applications natives dédiées.