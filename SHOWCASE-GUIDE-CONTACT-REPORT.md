# Guide, contact et vidéo Chtaw Team

Modifications locales du 26 novembre 2026. Aucun déploiement, aucune migration appliquée à une base existante, aucun commit ni push.

## Site vitrine

- Guide FR/EN en six étapes : inscription et établissement, validation et affectation, groupes, créneaux, présences, conversations et sondages.
- Informations vérifiées dans `chtaw-team-pwa/src/components/auth/registration-wizard.tsx`, `src/components/shell.tsx`, `src/components/student-attendance.tsx`, `src/features/session-polls.ts`, et dans le backend : `src/auth/auth.service.ts`, `src/approvals`, `src/groups`, `src/polls/polls.module.ts` et `src/polls/personal-attendance.ts`.
- Suppression des annonces de programmes, chronomètre et performances dans le guide, le carrousel et les métadonnées affichées. L’illustration fictive d’application avec chronomètre est remplacée.
- Installation distincte pour Android, Safari sur iPhone/iPad et ordinateur compatible. Utilisation dans le navigateur présentée comme une possibilité normale ; lien d’installation existant et langue conservés.
- Logo complet `src/assets/team-chtaw-logo.png` dans la navigation, le pied de page et les icônes publiques. Version des favicons renouvelée pour leur cache.
- Formulaire public avec champs obligatoires, limites 120/254/5 000 caractères, erreurs proches des champs, verrouillage pendant l’envoi, conservation après erreur et confirmation seulement après accusé serveur explicite.

## Réception et accès

`POST /api/v1/contact` reçoit les demandes sans compte. Le serveur valide les champs et le sujet, refuse les propriétés supplémentaires et le champ piège rempli, puis enregistre la demande avant de répondre `{ received: true }`.

La boîte de réception se trouve dans la PWA : **Administration → Demandes de contact**, route `/admin/contact`. Les administrateurs peuvent ouvrir un message, répondre depuis leur messagerie via l’adresse fournie, le marquer traité et le rouvrir. Les listes sont paginées par 50 ; les détails sont chargés à l’ouverture.

Les routes `/api/v1/admin/contact-requests` exigent un administrateur approuvé et une session valide. Chaque opération revérifie aussi les droits en base via `AccessService.actor`. Les réponses administratives sont `private, no-store`. Les visiteurs, utilisateurs, collaborateurs et comptes en attente n’ont aucun accès aux demandes.

Choix : stockage PostgreSQL et réception administrative. Le service d’e-mail existant est spécialisé dans les invitations et les liens de compte ; il n’est pas détourné pour le contact. Aucun nouveau prestataire, abonnement ou secret navigateur. La réponse par e-mail est manuelle et aucune réponse automatique n’est promise.

Limitation : trois tentatives HTTP par adresse réseau sur quinze minutes, complétées par un maximum durable de trois messages acceptés sur quinze minutes. Un verrou transactionnel PostgreSQL sérialise les soumissions concurrentes d’une même adresse, y compris entre plusieurs instances. Seule une empreinte de l’adresse est stockée. Les en-têtes réseau transmis par un client ne sont pas considérés fiables par défaut.

## Vidéo

La vidéo existante de la PWA est réutilisée dans le guide du site vitrine. Lecture automatique muette, intégrée au mobile et répétition native en boucle, sans commandes Stop/Pause. Le bouton Pause/Reprise du fond des pages login/register est retiré. La lecture reprend lorsque l’onglet redevient visible. La préférence système de réduction des mouvements et l’image de secours en cas d’échec sont conservées.

## Configuration à prévoir avant mise en service

1. Appliquer, après revue et dans une livraison ultérieure, la migration `chtaw-team-backend/prisma/migrations/20261126120000_public_contact/migration.sql` et régénérer Prisma ; déployer ensuite le backend et la PWA avec la boîte de réception.
2. Définir **dans le site vitrine** `VITE_CONTACT_API_URL=https://<backend>/api/v1/contact`. Cette URL est publique. Aucun destinataire ni secret n’est nécessaire. Sans cette valeur, le formulaire affiche son indisponibilité à la soumission et ne confirme aucun envoi.
3. Ajouter l’origine HTTPS exacte du site vitrine à `CORS_ORIGINS` du backend. Conserver `VITE_PWA_URL` pour le parcours d’installation existant.
4. Si le backend est derrière un proxy, configurer `CONTACT_TRUSTED_PROXY_IPS` avec les adresses IP exactes des proxys réellement maîtrisés qui nettoient ou complètent `X-Forwarded-For`. À défaut, l’adresse du pair réseau est utilisée : des visiteurs derrière un même proxy partagent alors la limite. Ne jamais faire confiance à tous les proxys.
5. Pour reproduire les tests d’intégration : `cd chtaw-team-backend`, puis `npm run test:isolated`. Le nouveau fichier `test/contact.integration.ts` couvre réception anonyme, lecture administrative, traitement, refus des autres rôles, champs invalides et limitation concurrente.

## Vérifications

- Site : 21 tests réussis ; TypeScript et build réussis.
- Backend : 272 tests unitaires réussis ; TypeScript et build réussis ; génération Prisma réussie.
- Docker/PostgreSQL : 17 suites et 239 tests d’intégration réussis. Les 21 migrations, dont celle du contact, ont été appliquées uniquement à la nouvelle base jetable. Réception réelle des messages, accès administrateur, traitement, validation et limite concurrente vérifiés par les routes HTTP de test. Total des tests exécutés avec succès : 777.
- PWA : 245 tests d’interface réussis, y compris la nouvelle boîte de réception et la navigation ; TypeScript et build réussis.
- Chrome local : mobile 375 px et ordinateur 1 440 px, FR/EN, absence de débordement horizontal, champs invalides, erreur réseau, HTTP 429, conservation du texte et confirmation après accusé. Pour ces tests navigateur, les réponses de contact sont explicitement simulées ; ce n’est pas une validation de bout en bout avec PostgreSQL.
- Lecture vidéo réelle vérifiée dans Chrome : retour de la fin au début et lecture poursuivie sur le site, `/login` et `/register`, sans commande Stop/Pause ; image statique lors de la réduction des mouvements.
- Lint des fichiers vitrine modifiés : réussi. Lint PWA : aucune erreur, deux avertissements préexistants dans les composants d’installation.
- Le lint global du dépôt échoue sur de nombreux fichiers existants et répertoires de livraison/runtime. Le lint backend signale deux erreurs hors de cette modification : `test/security-rotation.emulator.ts` (require) et `test/session-audit.integration.ts` (argument inutilisé).
- Après disponibilité de Docker, le runner isolé a créé `chtaw_test_31301e70c94a`, exécuté toutes les migrations et les tests, puis arrêté et conservé le conteneur `chtaw-security-31301e70c94a` pour inspection. Aucune base existante n’a été utilisée. Le pilote PostgreSQL émet un avertissement de dépréciation sur des requêtes concurrentes dans les tests existants, sans échec.
- Aucun avertissement d’hydratation observé après correction des animations initiales, avec ou sans réduction des mouvements. Les serveurs d’aperçu locaux ont été arrêtés.
- L’URL publique du site n’était pas accessible via l’outil de lecture web ; la revue et la vérification visuelle ont porté sur le code et les aperçus locaux.

Scripts reproductibles : `scripts/refresh-site-branding.mjs`, `scripts/verify-showcase-contact.mjs` (site sur le port 5180 avec endpoint local configuré), `scripts/verify-brand-video.mjs` (site sur 5180, PWA sur 5181). Captures locales dans `.test-browser-results/showcase/`.
