# Lot 3 — Project+ / Alpha 0.3

Ce document fixe le périmètre et les invariants du Lot 3. Il prolonge le module Tasks du Lot 2 sans introduire Scheduling, récurrence ou workflow configurable.

## Objectif

Faire évoluer Tasks d'un gestionnaire de tâches vers un outil de pilotage projet léger avec :
- Phase ;
- Milestone ;
- TaskDependency ;
- calendrier ;
- Gantt basique ;
- finalisation de l'UX Teams / memberships prévue dans le plan V1.

Le Lot 3 doit rester utilisable dans les trois Contexts déjà supportés par Tasks : `workspace`, `scope` et `project`.

## Hors périmètre

Ne sont pas inclus :
- Scheduling RH, Shift, Schedule ou PersonAvailability ;
- ResourceBooking / Allocation ;
- récurrence des Tasks ;
- workflow configurable ;
- calcul de chemin critique ;
- nivellement automatique des ressources ;
- dépendances avec délai/avance ;
- dépendances autres que finish-start ;
- drag & drop complexe de barres avec recalcul automatique en cascade ;
- baseline projet / comparaison planning ;
- Event, Forms ou Flux.

## Principes d'architecture

1. Phase, Milestone et TaskDependency restent dans le domaine `tasks` pour ce lot.
2. Phase et Milestone sont des objets métier adressables et possèdent chacun un Object Registry.
3. Une Phase ou un Milestone appartient à exactement un Workspace et un Context.
4. Une Task reste la source de vérité pour ses propres dates, statut, priorité, hiérarchie et assignations.
5. Les vues Calendrier et Gantt lisent le domaine Tasks ; elles ne possèdent pas de copie métier des dates.
6. Aucun nouveau Context n'est créé pour Phase ou Milestone.
7. Les dépendances peuvent relier deux Tasks de Contexts différents, mais jamais de Workspaces différents.
8. Les permissions restent évaluées par Context pour les objets visibles.

## Phase

Une Phase est un regroupement ordonné de Tasks dans un même Context.

### `task_phases`
- `id uuid PK`
- `workspace_id uuid NOT NULL`
- `object_id uuid NOT NULL UNIQUE`
- `context_id uuid NOT NULL`
- `name text NOT NULL`
- `description text NULL`
- `position integer NOT NULL DEFAULT 0`
- `start_at timestamptz NULL`
- `due_at timestamptz NULL`
- `created_at timestamptz`
- `updated_at timestamptz`
- `archived_at timestamptz NULL`

Contraintes principales :
- FK tenant-safe vers Workspace, Context et Object Registry ;
- `start_at <= due_at` si les deux sont présents ;
- `position >= 0`.

Object Registry :
- `module_key = tasks`
- `object_type = phase`

### Lien Task → Phase

Ajouter à `tasks` :
- `phase_id uuid NULL`

Contraintes :
- la Phase doit appartenir au même Workspace et au même Context que la Task ;
- une Task appartient au maximum à une Phase ;
- une sous-tâche peut avoir une Phase différente de son parent si elle reste dans le même Context ;
- archiver une Phase détache les Tasks actives de cette Phase sans archiver les Tasks.

Lors d'un déplacement de Task vers un autre Context :
- la Task et son sous-arbre sont déplacés comme au Lot 2 ;
- tout `phase_id` pointant vers une Phase qui n'appartient pas au nouveau Context est mis à `NULL` dans la même transaction ;
- une Phase n'est jamais déplacée implicitement avec la Task.

Les dates de Phase sont déclaratives. Le Lot 3 ne recalcule pas automatiquement `start_at` / `due_at` depuis les Tasks.

## Milestone

Un Milestone représente un jalon daté dans un Context. Il n'est pas une Task de durée zéro.

### `task_milestones`
- `id uuid PK`
- `workspace_id uuid NOT NULL`
- `object_id uuid NOT NULL UNIQUE`
- `context_id uuid NOT NULL`
- `name text NOT NULL`
- `description text NULL`
- `due_at timestamptz NOT NULL`
- `status milestone_status NOT NULL DEFAULT 'open'`
- `position integer NOT NULL DEFAULT 0`
- `created_at timestamptz`
- `updated_at timestamptz`
- `archived_at timestamptz NULL`

Statuts Lot 3 :
- `open`
- `reached`
- `cancelled`

Object Registry :
- `module_key = tasks`
- `object_type = milestone`

### Liens Task ↔ Milestone

Un Milestone peut regrouper plusieurs Tasks et une Task peut contribuer à plusieurs Milestones.

Table `task_milestone_links` :
- `id uuid PK`
- `workspace_id uuid NOT NULL`
- `task_id uuid NOT NULL`
- `milestone_id uuid NOT NULL`
- `created_at timestamptz`
- `archived_at timestamptz NULL`

Règles :
- Task et Milestone doivent appartenir au même Workspace et au même Context ;
- unicité logique `(workspace_id, task_id, milestone_id)` avec réactivation d'une ligne archivée plutôt que duplication ;
- archiver un Milestone archive ses liens, pas les Tasks ;
- déplacer une Task vers un autre Context archive dans la même transaction les liens vers des Milestones qui restent dans l'ancien Context.

## TaskDependency

### Modèle

Table `task_dependencies` :
- `id uuid PK`
- `workspace_id uuid NOT NULL`
- `predecessor_task_id uuid NOT NULL`
- `successor_task_id uuid NOT NULL`
- `dependency_type task_dependency_type NOT NULL DEFAULT 'finish_start'`
- `created_at timestamptz`
- `archived_at timestamptz NULL`

Type Lot 3 unique :
- `finish_start`

Sémantique : la Task successeur ne devrait pas commencer avant la fin de la Task prédécesseur.

Le Lot 3 expose cette contrainte comme information de planning et validation métier ; il ne décale pas automatiquement les dates.

### Invariants

1. Les deux Tasks appartiennent au même Workspace.
2. Une Task ne dépend pas d'elle-même.
3. Le couple `(workspace_id, predecessor_task_id, successor_task_id, dependency_type)` est unique logiquement.
4. Les cycles de dépendances sont refusés par le service Tasks avant écriture.
5. Les dépendances cross-context sont autorisées et conservées lors d'un déplacement de Task.
6. Archiver une Task archive les dépendances actives où elle est prédécesseur ou successeur.
7. Restaurer une Task n'entraîne pas la restauration automatique de ses anciennes dépendances.

### Visibilité

Une dépendance ne doit jamais révéler des informations d'un Context que l'utilisateur ne peut pas lire.

Pour une Task lisible :
- si l'autre extrémité est lisible, l'API renvoie les informations nécessaires à l'affichage ;
- si l'autre extrémité appartient au même Workspace mais à un Context non visible, l'API peut signaler l'existence d'une dépendance externe sous une forme opaque (`hidden: true`) sans titre, description, assignation ou autre métadonnée métier ;
- un utilisateur extérieur au Workspace reçoit toujours `NotFound` avant contrôle de permission détaillé.

## Permissions

Réutiliser les permissions Task existantes lorsque l'action porte directement sur une Task.

Ajouter :
- `tasks.phase.create`
- `tasks.phase.read`
- `tasks.phase.update`
- `tasks.phase.archive`
- `tasks.milestone.create`
- `tasks.milestone.read`
- `tasks.milestone.update`
- `tasks.milestone.archive`
- `tasks.task.dependency_manage`

Politique système V1 :
- Administrator : toutes ;
- Manager : toutes ;
- Member : create/read/update sur Phase et Milestone + `tasks.task.dependency_manage` ;
- Guest : aucune par défaut.

Les UserAccessGrant / TeamAccessGrant continuent d'être évalués par Context.

Pour créer une dépendance cross-context, l'utilisateur doit :
- pouvoir lire les deux Tasks ;
- posséder `tasks.task.dependency_manage` dans le Context des deux Tasks.

## Actions / Events

Actions publiques :
- `tasks.phase.create`
- `tasks.phase.update`
- `tasks.phase.archive`
- `tasks.milestone.create`
- `tasks.milestone.update`
- `tasks.milestone.archive`
- `tasks.task.link_milestone`
- `tasks.task.unlink_milestone`
- `tasks.task.add_dependency`
- `tasks.task.remove_dependency`

Events :
- `tasks.phase.created.v1`
- `tasks.phase.updated.v1`
- `tasks.phase.archived.v1`
- `tasks.milestone.created.v1`
- `tasks.milestone.updated.v1`
- `tasks.milestone.archived.v1`
- `tasks.task.milestone_changed.v1`
- `tasks.task.dependency_changed.v1`

Les mutations métier + Activity + Outbox sont atomiques comme au Lot 2.

## API cible

### Phases
Sous `/api/workspaces/:workspaceId/task-phases` :
- `GET /`
- `POST /`
- `GET /:phaseId`
- `PATCH /:phaseId`
- `POST /:phaseId/archive`

Filtres : `contextId`, archive exclue par défaut.

### Milestones
Sous `/api/workspaces/:workspaceId/task-milestones` :
- `GET /`
- `POST /`
- `GET /:milestoneId`
- `PATCH /:milestoneId`
- `POST /:milestoneId/archive`

Filtres : `contextId`, `status`, plage de dates.

### Extensions Task
Sous `/api/workspaces/:workspaceId/tasks/:taskId` :
- `POST /milestones`
- `DELETE /milestones/:milestoneId`
- `GET /milestones`
- `GET /dependencies`
- `POST /dependencies`
- `DELETE /dependencies/:dependencyId`

`PATCH /tasks/:taskId` accepte également `phaseId`.

## Calendrier

Le calendrier est une vue, pas un nouveau domaine métier.

### Données affichées
- Tasks avec `start_at` et/ou `due_at` ;
- Milestones à `due_at` ;
- option d'affichage des bornes de Phase.

### Vues Lot 3
- mois ;
- semaine.

### Interactions
- clic → ouvre le détail Task / Milestone ;
- modification de date depuis le calendrier ;
- un déplacement de Task modifie ses champs `start_at` / `due_at` via l'API Tasks existante ;
- déplacer un Milestone modifie `due_at` ;
- aucune duplication de dates dans un stockage propre au calendrier.

Règles de déplacement d'une Task :
- si seule `due_at` existe, déplacement conserve ce mode échéance seule ;
- si `start_at` et `due_at` existent, déplacement conserve la durée ;
- les contraintes de dépendance produisent un avertissement si le déplacement crée une incohérence finish-start, sans déplacement automatique du successeur/prédécesseur.

## Gantt basique

Le Gantt est une projection du même domaine Tasks.

### Contenu
- lignes Phase ;
- Tasks et sous-tâches ;
- Milestones ;
- liens finish-start ;
- plage temporelle basée sur les objets visibles du Context sélectionné.

### Interactions Lot 3
- zoom simple jour / semaine / mois ;
- ouverture du détail au clic ;
- édition des dates d'une Task ;
- édition de la date d'un Milestone ;
- création/suppression d'un lien finish-start depuis le détail Task au minimum.

Le drag horizontal des barres peut être livré s'il reste simple et accessible, mais n'est pas requis pour considérer le Lot 3 terminé. Les champs de date restent l'interface de secours obligatoire.

### Dépendances cross-context

Le Gantt d'un Context n'importe pas automatiquement les Tasks d'autres Contexts. Si une Task visible dépend d'une Task invisible/non incluse :
- afficher un indicateur de dépendance externe ;
- ne pas révéler les métadonnées de la Task distante si l'utilisateur ne peut pas la lire.

## Teams / memberships — finalisation UX

Sans modifier le modèle Core du Lot 1 :
- améliorer la lisibilité des membres d'une Team ;
- ajout/retrait de membres depuis l'UI ;
- affichage des Teams d'une Person ;
- états vides et erreurs cohérents ;
- contrôles basés sur les permissions existantes ;
- responsive mobile.

Aucun modèle RH avancé n'est introduit.

## Comportement lors d'un move de Task

Le service `moveTaskSubtree` doit être étendu pour conserver les invariants Lot 3 dans une transaction unique :

1. déplacer la Task et tout son sous-arbre vers le nouveau Context ;
2. détacher les `phase_id` devenus invalides ;
3. archiver les liens Task↔Milestone devenus invalides car le Milestone reste dans un autre Context ;
4. conserver les TaskDependency, y compris lorsqu'elles deviennent cross-context ;
5. conserver les commentaires, fichiers, tags et Relations génériques attachés aux Object Registry ;
6. écrire Activity + Outbox cohérents avec le déplacement.

## Séquence d'implémentation

### 3A — Domaine Phase + Milestone
- schéma DB ;
- migration ;
- Object Registry ;
- services CRUD/archive ;
- rattachement Task→Phase ;
- liens Task↔Milestone ;
- extension atomique de `moveTaskSubtree` ;
- tests tenant / Context.

### 3B — TaskDependency
- schéma ;
- service add/remove/list ;
- détection de cycles ;
- cross-context same Workspace ;
- visibilité opaque des cibles non lisibles ;
- tests de cycles, permissions et tenant isolation.

### 3C — API + permissions
- routes Phase / Milestone ;
- extensions Task ;
- permissions système ;
- tests Administrator / Manager / Member / Guest ;
- tests accès direct par IDs étrangers.

### 3D — Calendrier
- vue mois/semaine ;
- Tasks + Milestones ;
- édition de dates ;
- filtres Context / Person / Team / statut si réutilisables sans N+1 excessif ;
- responsive.

### 3E — Gantt basique
- Phase / Task / Milestone ;
- dépendances finish-start ;
- indicateurs externes ;
- zoom simple ;
- édition dates ;
- responsive raisonnable avec fallback liste sur petit écran si nécessaire.

### 3F — Teams UX + hardening
- finalisation Teams/memberships ;
- audit move subtree ;
- audit permissions ;
- DB vierge ;
- `pnpm check` ;
- revue PR.

## Critères de sortie Lot 3

- `pnpm check` vert en local et CI ;
- migrations reproductibles sur PostgreSQL vierge ;
- Phase et Milestone tenant-safe et Context-safe ;
- Phase/Milestone possèdent un Object Registry ;
- rattachement Phase d'une Task respecte le même Context ;
- liens Milestone respectent le même Context ;
- déplacement d'une Task détache Phase / Milestone devenus invalides sans casser le déplacement atomique ;
- dépendances finish-start fonctionnelles ;
- cycles de dépendances refusés ;
- dépendances cross-context conservées dans un même Workspace ;
- aucune dépendance cross-workspace possible ;
- une dépendance vers un Context non lisible ne divulgue aucune donnée métier sensible ;
- dates modifiables depuis les vues prévues ;
- Calendrier mois/semaine utilisable ;
- Gantt basique utilisable ;
- Teams/memberships finalisés côté UX ;
- aucune régression sur Liste / Kanban / détail Tasks du Lot 2 ;
- aucune introduction de Scheduling ou de récurrence dans ce lot.
