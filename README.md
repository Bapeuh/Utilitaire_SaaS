# Utilitaire SaaS

Dépôt de référence pour la conception et le développement d'une plateforme SaaS modulaire orientée projets, planning, événements, formulaires et simulation de flux.

## Objectif

Construire une V1 modulaire où chaque domaine reste indépendant tout en partageant une infrastructure commune : Workspace, Context Registry, Object Registry, permissions, relations, fichiers, commentaires, tags, ressources et contrats inter-modules.

## Modules V1

- Tasks
- Scheduling
- Event
- Forms
- Flux Lite

## Principes structurants

- Workspace = frontière de tenant.
- Context = lieu métier principal (Workspace, Scope, Project).
- Object Registry = identité transversale des objets adressables.
- User ≠ Person.
- Scope ≠ Project.
- Les modules ne lisent pas directement les tables privées d'un autre module.
- Interactions inter-modules via Actions, Events et Providers.
- Désactiver un module ne supprime jamais ses données.
- Les données métier principales sont archivées plutôt que supprimées par défaut.

## Documentation

La documentation d'architecture est dans `docs/architecture/`.
Les diagrammes relationnels seront dans `docs/erd/`.
Les futures spécifications techniques seront dans `docs/specifications/`.
