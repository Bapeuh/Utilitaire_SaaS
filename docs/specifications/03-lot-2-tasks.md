# Lot 2 — Tasks / Alpha 0.2

Ce document précise l'implémentation du Lot 2 sans déplacer dans ce lot les éléments déjà planifiés au Lot 3.

## Périmètre

Inclus dans le Lot 2 :
- CRUD + archive Task ;
- hiérarchie parent / sous-tâche ;
- statut et priorité ;
- affectations Person et Team ;
- checklist ;
- commentaires ;
- fichiers ;
- tags ;
- Relations génériques ;
- notifications in-app ;
- vues Liste, Kanban, détail Task et filtres essentiels ;
- permissions API et isolation multi-workspace.

Restent au Lot 3 conformément à `01-development-lots.md` : Phase, Milestone, TaskDependency, calendrier et Gantt basique.

## Invariants métier

1. Une Task appartient à exactement un Workspace et à exactement un Context.
2. Le Context d'une Task peut être de type `workspace`, `scope` ou `project`.
3. Une Task enregistrée dans le module possède un Object Registry `module_key = tasks`, `object_type = task`.
4. Parent et enfant appartiennent au même Workspace et au même Context.
5. Une Task ne peut pas être son propre parent.
6. Les cycles de hiérarchie sont refusés par le service Tasks.
7. Déplacer une Task vers un autre Context déplace atomiquement tout son sous-arbre.
8. Archiver une Task ne supprime aucune donnée transverse ; son Object et ses données sont archivés.
9. Une affectation Team reste une affectation à la Team : elle n'est pas développée implicitement en affectations Person.
10. Une Person/Team affectée doit appartenir au même Workspace que la Task.
11. Les données d'un Workspace ne sont jamais lisibles ou modifiables depuis un autre Workspace.
12. La récurrence n'est pas implémentée dans Tasks V1.

## Modèle de données Lot 2

### `tasks`
- `id uuid PK`
- `workspace_id uuid NOT NULL`
- `object_id uuid NOT NULL UNIQUE`
- `context_id uuid NOT NULL`
- `parent_task_id uuid NULL`
- `title text NOT NULL`
- `description text NULL`
- `status task_status NOT NULL DEFAULT 'todo'`
- `priority task_priority NULL`
- `start_at timestamptz NULL`
- `due_at timestamptz NULL`
- `estimated_minutes integer NULL`
- `position integer NOT NULL DEFAULT 0`
- `created_at timestamptz`
- `updated_at timestamptz`
- `archived_at timestamptz NULL`

Statuts V1 : `todo`, `in_progress`, `blocked`, `done`, `cancelled`.

Priorités V1 : `low`, `normal`, `high`, `urgent`.

Contraintes DB principales :
- FK tenant-safe `(workspace_id, object_id) -> objects(workspace_id, id)` ;
- FK tenant-safe `(workspace_id, context_id) -> contexts(workspace_id, id)` ;
- FK tenant-safe du parent `(workspace_id, parent_task_id) -> tasks(workspace_id, id)` ;
- `parent_task_id <> id` ;
- `estimated_minutes IS NULL OR estimated_minutes >= 0` ;
- si `start_at` et `due_at` sont présents : `start_at <= due_at`.

L'égalité de Context parent/enfant et la détection de cycle restent des invariants du service : elles ne doivent pas reposer uniquement sur une FK.

### `task_person_assignments`
- `id uuid PK`
- `workspace_id uuid NOT NULL`
- `task_id uuid NOT NULL`
- `person_id uuid NOT NULL`
- timestamps + archive
- unique active logique `(workspace_id, task_id, person_id)` ; une ligne archivée est réactivée plutôt que dupliquée.

### `task_team_assignments`
Même structure avec `team_id` et même règle de réactivation.

### `task_checklist_items`
- `id uuid PK`
- `workspace_id uuid NOT NULL`
- `task_id uuid NOT NULL`
- `label text NOT NULL`
- `is_done boolean NOT NULL DEFAULT false`
- `position integer NOT NULL DEFAULT 0`
- timestamps + archive.

## Données transverses

Comments, Files, Tags et Relations ne doivent pas introduire de FK métier directe vers `tasks`. Ils ciblent l'`object_id` de la Task via Object Registry. Les tables transverses correspondantes seront ajoutées dans la fondation transverse du Lot 2 si elles n'existent pas encore, avec règles tenant-safe.

Notifications in-app sont alimentées par les Events du module et restent découplées des tables privées Tasks.

## Permissions

Permissions initiales :
- `tasks.task.create`
- `tasks.task.read`
- `tasks.task.update`
- `tasks.task.archive`
- `tasks.task.assign`
- `tasks.task.comment`

Politique système V1 proposée :
- Administrator : toutes ;
- Manager : toutes ;
- Member : create/read/update/assign/comment ;
- Guest : aucune permission Tasks par défaut.

Les UserAccessGrant/TeamAccessGrant pourront enrichir ces droits par Context via le moteur existant.

## Actions / Events

Actions publiques initiales :
- `tasks.task.create`
- `tasks.task.update`
- `tasks.task.move_context`
- `tasks.task.archive`
- `tasks.task.assign_person`
- `tasks.task.assign_team`

Events V1 :
- `tasks.task.created.v1`
- `tasks.task.updated.v1`
- `tasks.task.moved.v1`
- `tasks.task.archived.v1`
- `tasks.task.assignment_changed.v1`

Chaque mutation métier Task doit écrire la mutation, Activity et Outbox dans la même transaction lorsque l'infrastructure concernée est utilisée.

## API cible

Sous `/api/workspaces/:workspaceId/tasks` :
- `GET /` liste filtrée ;
- `POST /` création ;
- `GET /:taskId` détail ;
- `PATCH /:taskId` édition ;
- `POST /:taskId/archive` archive ;
- `POST /:taskId/move` changement de Context atomique du sous-arbre ;
- endpoints d'affectations et checklist sous la Task.

Toute route commence par authentification + vérification d'appartenance active au Workspace avant synchronisation/contrôle de permissions, comme dans le Core.

## UI Lot 2

### Liste
- titre, statut, priorité, échéance, assignés ;
- filtres Context, statut, priorité, Person/Team ;
- création rapide.

### Kanban
- colonnes basées sur `status` ;
- déplacement entre colonnes = changement de statut ;
- pas de workflow configurable en Lot 2.

### Détail
- titre/description ;
- statut/priorité/dates ;
- parent/sous-tâches ;
- affectations ;
- checklist ;
- commentaires/fichiers/tags.

## Séquence d'implémentation

### 2A — Domaine minimal
- package `@utilitaire/tasks` ;
- schéma `tasks`, assignments, checklist ;
- migration ;
- services create/get/list/update/archive ;
- Object Registry + Activity + Outbox atomiques ;
- tests tenant isolation et invariants parent/enfant.

### 2B — Assignments + move subtree
- Person/Team assignment ;
- réactivation des affectations archivées ;
- déplacement atomique du sous-arbre ;
- tests multi-workspace et cycles hiérarchiques.

### 2C — Transverse
- Comments, Files, Tags, Relations ;
- notifications in-app ;
- intégration via Object Registry / Events.

### 2D — API + permissions
- routes REST ;
- permissions dédiées ;
- tests rôle + accès direct par IDs étrangers.

### 2E — UI
- navigation Tasks ;
- Liste ;
- Kanban ;
- détail ;
- filtres ;
- responsive.

## Critères de sortie Lot 2

- `pnpm check` vert ;
- migrations reproductibles sur DB vierge ;
- CRUD/archive Task testé ;
- aucun accès cross-workspace ;
- parent/enfant même Context ;
- déplacement d'un parent déplace tout le sous-arbre atomiquement ;
- Person/Team assignments tenant-safe ;
- commentaires/fichiers/tags attachés via Object Registry ;
- permissions appliquées côté API ;
- Liste/Kanban/détail utilisables desktop et mobile.
