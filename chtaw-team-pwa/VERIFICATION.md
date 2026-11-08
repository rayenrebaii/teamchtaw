# Phase 1 — Rapport historique du 3 novembre 2026

Le raccordement réel et les vérifications actuelles sont documentés dans [VERIFICATION-PHASE3.md](VERIFICATION-PHASE3.md). Les constats ci-dessous concernent uniquement le frontend de démonstration livré en phase 1.

- Installation des dépendances : réussie. Un premier essai a été bloqué par le réseau du bac à sable ; l’installation autorisée a ensuite rencontré un défaut du résolveur npm 10. La configuration locale `legacy-peer-deps=true` permet l’installation ; le lockfile est fourni.
- Node.js : 24.21.0. Next.js installé : 16.4.4.
- TypeScript strict : `npm.cmd run typecheck` réussi, sans erreur.
- ESLint : `npm.cmd run lint` réussi, sans erreur ni avertissement.
- Tests : `npm.cmd test`, 13 tests réussis dans `src/features/rules.test.ts`.
- Build : `npm.cmd run build` réussi ; toutes les routes demandées sont générées, les conversations et détails de groupe acceptent un paramètre dynamique.
- Icônes : génération réussie des PNG 192, 512, maskable 512 et Apple 180.
- Serveur de production : démarrage réussi sur `http://127.0.0.1:3001`.
- HTTP : `/login`, `/manifest.webmanifest` et `/sw.js` renvoient 200.

Les tests couvrent les validations admin, le refus d’un compte, l’ajout automatique au général, les affectations sans doublon et les retraits, les restrictions des comptes en attente, les publications texte, les restrictions photo/sondage, l’appartenance aux groupes, l’expéditeur, les options des sondages, le vote unique, la clôture et les choix multiples.

## Limites de validation

Le navigateur intégré était indisponible. La tentative de vérification dans Chrome a été interrompue par Computer Use : l’outil ne pouvait pas déterminer l’URL courante avec assez de certitude pour appliquer ses règles. Aucune validation visuelle ou interaction navigateur n’est donc revendiquée.

Les parcours manuels du README restent à exécuter, dont les essais sur appareils Android/iOS, le clavier virtuel, l’installation réelle, les transitions, le dialogue de sélection d’image et le comportement réseau coupé du service worker. Le cache hors ligne est conçu pour les pages et ressources déjà chargées ; il ne constitue pas un moteur complet de synchronisation ou de navigation hors ligne pour Next App Router.

Le projet est une démonstration frontend locale. Le backend devra sécuriser toutes les règles et rendre les votes et les affectations atomiques. Plusieurs onglets synchronisent les données via l’événement `storage`, sans résolution des écritures simultanées.
