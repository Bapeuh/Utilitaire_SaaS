# ADR-001 — Communication inter-modules

**Statut : accepté**

## Contexte

La plateforme doit permettre d'activer et de faire évoluer Tasks, Scheduling, Event, Forms, Flux et les futurs modules sans modifier leurs tables internes à chaque nouvelle intégration.

Des appels directs entre services ou des lectures SQL cross-module créeraient rapidement un couplage fort et rendraient la désactivation/versioning des modules difficiles.

## Décision

Les interactions inter-modules passent par trois primitives :

1. **Action** pour une commande synchrone avec résultat ;
2. **Event** pour annoncer de façon asynchrone un fait déjà commité ;
3. **Provider** pour exposer une capacité de lecture substituable.

Les références génériques utilisent `object_id` (Object Registry) et les opérations contextuelles utilisent `workspace_id` + `context_id`.

Les Events persistants sont produits via un Transactional Outbox.

## Conséquences positives

- modules découplés de leurs schémas SQL respectifs ;
- modules optionnels réellement optionnels ;
- possibilité de remplacer/enrichir un Provider ;
- Automation peut orchestrer les modules sans devenir leur propriétaire ;
- meilleure testabilité des frontières ;
- migration future vers plusieurs processus/services possible sans redessiner les contrats métier.

## Coûts

- contrats à maintenir explicitement ;
- gestion d'idempotence des consumers ;
- éventuelle cohérence asynchrone entre modules ;
- registre Actions/Events/Providers à implémenter.

## Alternatives rejetées

### Lecture directe des tables d'un autre module

Simple au début mais crée un couplage fort et des dépendances implicites.

### API REST interne pour tout

Trop lourd pour une V1 déployée comme application unique et ne résout pas à lui seul la notion de capability/provider.

### Event Bus pour tout

Inadapté aux demandes synchrones et aux lectures ; les Events restent réservés aux faits métier.