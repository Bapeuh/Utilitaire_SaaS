# Règles d'implémentation pour Codex / contributeurs

Ce document doit être lu avant toute génération de code importante.

## 1. Ne pas réinventer l'architecture

Les documents `docs/architecture`, `docs/erd` et `docs/specifications` sont la source de vérité. Si une demande semble incompatible, signaler le conflit dans la PR plutôt que modifier silencieusement l'architecture.

## 2. Frontières de modules

Interdit :

```text
FluxService -> SchedulingRepository
FormsService -> EventTable
TasksService -> private HR tables
```

Autorisé :

```text
Flux -> ProviderRegistry -> Scheduling provider
Forms -> ActionRegistry -> Tasks.create
Module -> EventBus -> event consumers
```

Un module peut utiliser Core/Core Services selon leurs contrats publics.

## 3. Database

- PostgreSQL est la source de vérité serveur.
- Drizzle ne justifie pas de supprimer des contraintes SQL utiles.
- Toute table workspace-scoped doit traiter explicitement l'isolation tenant.
- Ne jamais ajouter une FK inter-module métier uniquement pour simplifier une requête si Object/Relation/Provider est le contrat prévu.
- Toute migration doit être versionnée et testable depuis une DB vierge.

## 4. Object Registry

Ne pas transformer `objects` en table métier générique. Elle contient uniquement l'identité/adressage transversal prévu. Les données métier restent dans leur module propriétaire.

## 5. Context

Context est réservé aux lieux organisationnels Workspace/Scope/Project. Ne pas créer un Context pour chaque Event, Task, Session, Form ou Shift.

## 6. Transactions et événements

Lorsqu'un objet enregistré est créé : Object Registry + ligne métier + Activity/Outbox doivent être cohérents transactionnellement. Ne pas publier un événement externe avant commit.

## 7. API et validation

- API séparée du frontend.
- Contrats partagés typés.
- Validation serveur obligatoire.
- L'UI ne constitue jamais une barrière de sécurité.
- Erreurs structurées et stables.

## 8. Auth

Better Auth gère l'identité/session. Les permissions métier sont calculées par Utilitaire. Ne pas remplacer AccessRole/Permission/AccessGrant par les rôles du fournisseur d'auth.

## 9. UI

- responsive dès la création d'un écran ;
- utilisable clavier autant que raisonnable ;
- composants réutilisables sans construire un design system surdimensionné ;
- états loading/empty/error/forbidden explicites ;
- ne pas masquer une erreur API en supposant une réussite optimiste non confirmée.

## 10. Tests obligatoires

Pour toute fonctionnalité significative :
- happy path ;
- validation invalide ;
- permission refusée ;
- tentative cross-workspace si pertinente ;
- règle métier centrale.

Les moteurs purs (notamment Flux) doivent être fortement couverts par tests déterministes.

## 11. Scope discipline

Ne pas implémenter une fonctionnalité V1.1/V2 parce qu'elle semble facile pendant un lot V1. Préparer une extension est acceptable ; implémenter son produit complet ne l'est pas.

Exemples hors V1 : Registration, ResourceBooking, full automation editor, native apps, full offline sync, advanced HR.

## 12. Pull requests

Une PR doit :
- correspondre à un objectif/livraison identifiable ;
- décrire migrations et décisions non triviales ;
- inclure/mettre à jour les tests ;
- ne pas mélanger refactor massif et fonctionnalité sans nécessité ;
- mentionner explicitement tout écart à l'architecture.

## 13. Principe final

Préférer le code le plus simple qui respecte les frontières déjà décidées. Ne pas introduire une abstraction générique sans plusieurs cas réels qui la justifient.