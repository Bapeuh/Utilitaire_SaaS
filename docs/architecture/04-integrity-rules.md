# Règles d'intégrité V1

## Principes généraux

1. Isolation stricte des Workspaces.
2. FK structurelles pour les relations internes à un domaine.
3. Object Registry pour les relations transversales.
4. Archive par défaut pour les objets métier.
5. PostgreSQL garantit les invariants simples ; les services métier garantissent les règles complexes.

## Isolation Workspace

Les entités workspace-scoped conservent `workspace_id` même lorsque celui-ci est techniquement déductible.
Pour les relations critiques, utiliser des FK composites `(workspace_id, id)` afin d'empêcher les références cross-workspace.

## Context

- types V1 : `workspace`, `scope`, `project`
- un seul root context de type `workspace` par Workspace
- `parent_context_id != id`
- détection des cycles côté application
- la hiérarchie officielle des Scopes est celle de `contexts.parent_context_id`; ne pas dupliquer avec `scopes.parent_scope_id`

## Object Registry

- chaque objet transversalement adressable possède un `object_id UNIQUE`
- `module_key` et `object_type` sont obligatoires
- création de l'Object et de l'objet métier dans la même transaction
- la correspondance exacte module/type est validée par le service métier et les tests d'intégrité

## Dates et périodes

- périodes temporelles : `start_at < end_at`
- dates métier facultatives : si les deux existent, `start_date <= end_date`
- Event : dates toutes deux NULL ou toutes deux définies
- Session : dates obligatoires

## Tasks

- `parent_task_id != id`
- parent et enfant doivent partager le même Context
- Task et Phase doivent partager le même Context
- TaskDependency cross-context autorisée
- dépendance vers soi-même interdite
- cycles de dépendances détectés côté application

## Scheduling

- Schedule : `start_at < end_at`
- Shift : `start_at < end_at`
- Shift rattaché à un Schedule doit partager son Context
- `required_count > 0`
- une Person ne peut avoir qu'un assignment par Shift
- Requirement d'un Assignment doit appartenir au même Shift
- overlaps et politiques warn/block gérés par Scheduling, pas par contrainte globale DB

## Event

- `declared_capacity > 0` ou NULL
- ProgramBlock enfant doit appartenir au même Event
- ProgramBlock cycles détectés côté application
- Session avec ProgramBlock : même Event obligatoire
- Session doit rester dans la période Event lorsqu'elle existe, validation applicative

## Forms

- `UNIQUE(form_id, version_number)`
- une seule version `published` active par Form
- une version publiée est immutable
- `UNIQUE(form_version_id, key)` pour les Fields
- `UNIQUE(field_id, value)` pour les options
- source et cible d'une Rule doivent appartenir à la même FormVersion
- Submission doit référencer une Version de son propre Form
- une Answer par `(submission_id, field_id)`
- Answer doit utiliser un Field de la FormVersion de la Submission
- Submission soumise devient immutable

## Flux Lite

- mode : `session` ou `freeflow`
- un seul FlowModel actif par Scenario en V1
- paramètres JSONB validés par schéma applicatif
- OperatingPeriod : `start_at < end_at`
- `0 <= demand_fill_rate <= 1`
- périodes qui se chevauchent interdites côté service Flux
- Simulation terminée : `input_snapshot`, `engine_version` et résultat immuables

## Suppression

- `ON DELETE CASCADE` uniquement pour les vrais enfants structurels
- `ON DELETE RESTRICT` par défaut sur les relations métier historiques
- `ON DELETE SET NULL` pour les auteurs/créateurs lorsqu'on veut préserver l'historique
- anonymisation explicite des Person pour les besoins RGPD

## Multi-tenant / sécurité

Prévoir PostgreSQL Row Level Security comme défense en profondeur. RLS protège principalement la frontière Workspace ; les permissions métier restent gérées par AccessRole / AccessGrant / Context inheritance.

## Transactions et Event Bus

Toute création d'un objet enregistré doit être atomique.
Les événements inter-modules utilisent un Transactional Outbox : l'objet métier et l'événement d'outbox sont écrits dans la même transaction, puis publiés par un worker après commit.
