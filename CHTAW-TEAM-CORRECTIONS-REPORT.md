# Rapport des corrections Chtaw Team

Date : 5 novembre 2026. Travail réalisé sur les projets existants, sans recréation, reset PostgreSQL ni suppression des données métier. Aucun commit ni déploiement public n’a été effectué.

## 1. Résumé

La gestion des comptes et des demandes est réunie dans Gestion des membres. La navigation mobile dispose d’un menu utilisateur permanent. La déconnexion nettoie immédiatement les données locales, y compris hors ligne. Le groupe général est protégé côté API. Le Service Worker ne conserve plus les pages HTML et son activation est consentie. Les vulnérabilités de production signalées ont été corrigées.

L’application n’est pas déclarée prête pour la production : les tests visuels, l’installation physique Android/iOS et la configuration finale d’hébergement restent à valider.

## 2. Gestion des membres

- Page unique /admin/users : titre, description, quatre indicateurs, onglets Tous les membres / En attente / Acceptées / Refusées.
- Les compteurs représentent des comptes User, conformément au modèle existant. Les affectations GroupMember ne créent pas de demandes supplémentaires. Aucun modèle fictif de demande n’a été introduit.
- Tableau commun : identité avec email, inscription, statut, groupes et actions. Déduplication par identifiant, recherche multiterme, groupes, période, tri et pagination conservés.
- Approbation et refus nécessitent une confirmation. Seuls les comptes PENDING peuvent être décidés ; les décisions finales ne peuvent pas être rejouées.
- Détails, historique, affectation, déplacement et retrait des groupes privés disponibles selon les permissions existantes.
- Cartes via adaptation du tableau sous 640 px ; statistiques sur deux colonnes aux petites largeurs. Cette adaptation CSS n’a pas été validée visuellement sur téléphone.
- Migration additive AdmissionDecision : auteur, statut et date enregistrés dans la transaction de décision. Aucun auteur/date n’est inventé pour les décisions anciennes.

## 3. Navigation

- Entrées Demandes et Dashboard retirées de la sidebar. Code et route du dashboard conservés.
- /admin/approvals redirige en HTTP 307 vers /admin/users?status=PENDING, vérifié sur le serveur de production local.
- Menu utilisateur en haut de l’espace connecté : profil, paramètres, déconnexion, pour ADMIN et USER.
- Utilisation des comportements natifs details/summary, liens accessibles au clavier, fermeture par Échap, perte de focus et clic extérieur.
- Boutons de déconnexion redondants retirés de la sidebar et des paramètres. Le parcours des comptes en attente/refusés conserve sa déconnexion dédiée.

## 4. Sécurité et corrections

| Anomalie | Statut | Preuve et portée |
| --- | --- | --- |
| Données conservées après échec réseau du logout | Corrigée et testée | Session, utilisateurs, groupes et messages nettoyés avant la révocation réseau ; tests normal, hors ligne et erreur |
| Ancien cookie restauré après déconnexion locale | Corrigée et testée | Marqueur local sans jeton, refus du refresh automatique et nouvelle tentative de révocation ; intégration réelle par cookie |
| Retrait du groupe général | Corrigée et testée | Ajout/retrait manuel refusé même à l’admin ; tests unitaires et HTTP/PostgreSQL |
| Historique des nouvelles décisions absent | Corrigée et testée | Migration additive, insertion atomique, lecture admin, décision répétée refusée |
| Paramètres/déconnexion absents en mobile | Corrigée et testée en DOM | Menu partagé pour les rôles ; rendu physique non testé |
| HTML/no-store mis en cache | Corrigée et testée | Exécution du SW réel dans un harnais simulant réseau et Cache Storage |
| Activation immédiate du SW | Corrigée et testée partiellement | skipWaiting déclenché seulement par message utilisateur ; cycle réel entre deux versions installées non testé |
| Échec d’enregistrement du SW silencieux | Corrigée mais non testée en navigateur | Message et action Réessayer ajoutés |
| Installation déclarée dès acceptation du prompt | Corrigée et testée en DOM | Attente de appinstalled ; le prompt synthétique ne prouve aucune installation réelle |
| Destinations localhost implicites en production | Corrigée et testée par compilation | Défauts même origine ; URL publiques HTTP/localhost explicites refusées |
| CSP absente sur Next.js | Corrigée et testée par HTTP | CSP, nosniff, protection contre les frames et Referrer-Policy présents |
| Téléchargement/contact d’exemple | Corrigée et testée partiellement | Variables publiques dédiées ; pas d’adresse inventée ; lien réel non fourni |
| Lint vitrine en échec | Corrigée et testée | Lint final sans erreur ni avertissement |

La révocation différée ne peut pas contacter le serveur pendant une panne réseau. Le marqueur local bloque la restauration automatique ; un cookie HttpOnly ne peut pas être supprimé directement par JavaScript. Sur un appareil partagé, la fermeture du navigateur reste prudente si la révocation n’a pas abouti. Aucun token ni conversation n’est ajouté au stockage local.

Le contrôle du groupe général corrige une ancienne règle explicitement couverte par un test autorisant son retrait par l’admin. Ce test et l’interface ont été alignés sur la protection automatique demandée.

## 5. Dépendances

Versions backend vérifiées : @nestjs/platform-express 11.2.8, @nestjs/swagger 11.4.8, multer 2.5.0, js-yaml 5.5.0, sharp 0.35.5. Multer est contraint par un override de même version majeure, car NestJS 11 résout encore une version affectée sans cet override.

Vitrine : Zod 4.6.7 ; Vite passé dans la série corrigée 8.3 après découverte d’une alerte supplémentaire. Compilation et typage valident l’usage de Zod 4. Sharp des outils PWA est aussi mis à jour. Aucun audit fix --force n’a été utilisé.

Les package-lock.json et bun.lock ont été synchronisés. La protection d’âge minimal de Bun a été respectée ; les validations applicatives utilisent npm. Une installation complète et une compilation sous Bun ne sont pas attestées.

| Audit final | Production, npm audit --omit=dev | Audit incluant les outils de développement |
| --- | --- | --- |
| Vitrine | 0 alerte | 11 modérées |
| Backend | 0 alerte | 25 : 22 modérées, 3 faibles |
| PWA | 0 alerte | 8 modérées |

Alertes restantes, non corrigées : chaînes typescript-eslint/minimatch ; Jest/glob/test-exclude/deepmerge côté backend ; drizzle-kit/esbuild côté vitrine ; eslint-config-next côté PWA. Certaines remédiations proposées par npm impliquent des changements majeurs, dont un retour de Jest 30 vers 25. Elles n’ont pas été appliquées automatiquement. Ces alertes concernent l’outillage et demandent une remédiation ciblée distincte ; les environnements de développement ne doivent pas être exposés publiquement.

## 6. PWA

- Manifest conservé : start_url /app, scope /, standalone, couleurs et langue française.
- Fichiers PNG inchangés : 192×192, 512×512, maskable 512×512 et Apple 180×180, dimensions contrôlées lors de l’audit initial.
- Cache public chtaw-public-v5 : ressources publiques prévues et assets Next.js ; exclusion du HTML, des API, des requêtes RSC et des requêtes avec Authorization.
- Réponses no-store ou private exclues du cache. Anciennes versions nettoyées et caches privés purgés à la déconnexion.
- Navigation hors ligne vers offline.html ; aucun message, vote, pointage ou envoi métier promis hors ligne.
- Nouvelle version signalée, confirmation avant rechargement, erreurs visibles et possibilité de réessayer.
- Instructions Safari iOS conservées ; Android utilise le prompt lorsqu’il est disponible.

Les tests SW utilisent le code réel avec un environnement simulé, pas le moteur d’un navigateur. Installation Android/iOS, standalone, écran de lancement, réouverture, contrôle effectif des pages par le SW et mise à jour entre deux versions installées restent non testés. Aucun score Lighthouse n’est produit.

## 7. Tests et données

| Vérification exécutée | Résultat |
| --- | --- |
| Vitrine : unitaires | 9/9 |
| PWA : unitaires et SW | 69/69 |
| PWA : interface jsdom | 5/5 |
| Backend : unitaires | 47/47 |
| Backend : intégrations PostgreSQL/HTTP/Socket.IO | 58/58 |
| Frontend : services/store → NestJS → PostgreSQL/Socket.IO | 14/14 |
| TypeScript vitrine/PWA/backend | Réussite |
| Lint vitrine/PWA/backend | Réussite |
| Compilation vitrine/PWA/backend | Réussite |
| Schéma Prisma | Valide |
| HTTP production local | CSP/nosniff, ressources PWA et redirection 307 contrôlés |

Les intégrations ont révélé une fixture PNG ancienne illisible par libpng. Elle est maintenant générée avec Sharp ; le rejet des fichiers invalides dans le backend est conservé.

Les lanceurs test:isolated et test:frontend:isolated créent une base neuve au nom aléatoire, sans réinitialiser les bases présentes. Les gardes exigent un nom et un marqueur concordants. Le serveur frontend confirme par IPC la base créée pour éviter de tester par erreur un service déjà présent sur le port 3102. Les bases créées et les fixtures sont conservées pour inspection ; aucune suppression automatique n’a été effectuée.

Sur la base métier, seule la migration additive AdmissionDecision a été appliquée. Les empreintes SHA-256 des lignes User, Group, GroupMember, Message et Poll sont identiques avant et après. Comptages conservés : 3 utilisateurs, 2 groupes, 6 affectations, 1 message et 1 sondage.

Avertissements non bloquants : dépréciation pg sur des requêtes concurrentes au sein de transactions ; taille du bundle vitrine supérieure à 500 kB ; avertissement Vite sur l’usage futur de son chargeur natif. Aucun de ces avertissements n’est présenté comme une erreur corrigée.

## 8. Fichiers modifiés

- Racine : package.json, package-lock.json, bun.lock, eslint.config.js, .env.example, PRODUCTION.md et ce rapport.
- Vitrine fonctionnelle : src/lib/site.ts, src/components/site/Sections.tsx.
- Vitrine, formatage sans changement métier : src/components/site/{HeroCarousel,Navbar,Reveal}.tsx, src/components/ui/button.tsx, src/integrations/supabase/{auth-attacher,auth-middleware,client.server,client,cron-auth,previewAuthStorage,types}.ts, src/routes/{index,__root}.tsx, src/test/{app-routing,download-section}.test.tsx.
- PWA : package.json, package-lock.json, README.md, next.config.ts, vitest.ui.config.ts, public/sw.js.
- PWA composants : src/components/admin/{admin-screen,requests-panel,members.ui.test}.tsx, src/components/{shell,user-menu,providers,account-screen}.tsx, src/components/chat/group-members.tsx, src/components/pwa/{InstallPWAButton,updates}.tsx.
- PWA routes : src/app/(admin)/admin/{users,approvals}/page.tsx.
- PWA services : src/services/{api-client,auth.service,users.service,realtime.service,session-control,pwa.service,logout.test,service-worker.test}.ts.
- PWA autres : src/styles/globals.css, src/features/{requests,requests.test}.ts, test/community.integration.ts.
- Backend : package.json, package-lock.json, README.md, prisma/schema.prisma, prisma/migrations/202611050001_admission_decisions/migration.sql.
- Backend sources : src/approvals/approvals.module.ts, src/auth/{auth.service,auth.controller}.ts, src/groups/groups.service.ts.
- Backend tests et lanceurs : test/{api,attendance,mandatory-attendance,corrections}.integration.ts, test/groups.spec.ts, scripts/{run-isolated-tests.mjs,start-integration.ts}.

Les sorties de compilation, le client Prisma et les fichiers générés habituels sont régénérés. Le dossier ne fournit pas d’historique Git exploitable pour établir un diff de référence. Les anciens stores de démonstration, mocks et le prototype indépendant Application sont conservés. Les règles protégées Supabase profiles.approved/app_config et les routes publiques de la vitrine ne sont pas modifiées fonctionnellement.

## 9. Avant production

1. Renseigner VITE_PWA_URL et VITE_CONTACT_EMAIL réels ; aucune valeur n’a été inventée.
2. Configurer le reverse proxy même origine pour /api/v1 et /socket.io, ou fournir les URL HTTPS NEXT_PUBLIC_API_URL/NEXT_PUBLIC_SOCKET_URL avant compilation.
3. Valider TLS, CORS exact, cookies Secure/SameSite et politiques Safari/Chrome ; redémarrer les services avec les dépendances et configurations actualisées.
4. Contrôler visuellement la page Membres, les cartes mobiles, le menu et les formulaires à 360/768/1440 px, avec clavier et lecteur d’écran si possible.
5. Tester l’installation et le cycle de vie PWA sur Android Chrome et iOS Safari, ainsi que la déconnexion sur appareil partagé et le renouvellement multi-onglet.
6. Configurer sauvegardes PostgreSQL/médias et volume persistant UPLOAD_DIR. Plusieurs instances exigent un stockage et un bus Socket.IO partagés.
7. Traiter les alertes restantes de l’outillage dans une mise à jour dédiée, sans downgrade aveugle.

Voir PRODUCTION.md pour les variables et topologies. Le contrôle navigateur ayant été bloqué lors de l’audit, les résultats DOM/HTTP ne sont pas présentés comme des essais visuels ou sur téléphone.
