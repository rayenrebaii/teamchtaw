# Profil des organisateurs, votes et retrait des collaborateurs

12 novembre 2026, Africa/Tunis. Corrections demandées par le propriétaire, dans la continuité de la publication de la journée.

- Commit applicatif : `3068d2e02e2f351ffa992732d6ccb009f3023887`, poussé sur `codex/collaborator-firebase-release`, sans réécriture d’historique.
- API Render : `dep-dbqt5ejtqb8s7385ltag`, observée `live` sur ce commit.
- PWA Vercel : `dpl_Co63jn5e5usWpzr2oHqyZKQTqt3w`, observée `READY` ; `teamchtaw-pwa.vercel.app` affecté au même commit.
- Aucune migration, suppression de données, modification d’approbation, de secret ou de configuration protégée.

## Résultat

Le profil ne propose plus d’historique personnel de présence aux administrateurs et collaborateurs. Les clients conservent leur lien vers `/app/attendance`. Les outils de gestion des présences des organisateurs restent inchangés.

L’interdiction existante de créer ou modifier un vote de séance pour les organisateurs est conservée et vérifiée côté API et interface. Seuls les clients peuvent voter aux séances et être enregistrés comme participants aux présences. Les sondages ordinaires restent ouverts aux trois rôles, selon les droits du groupe et les règles de clôture déjà existantes.

La liste des sondages des collaborateurs récupère désormais aussi les sondages ordinaires des groupes dont ils sont membres, pour les afficher dans la conversation. Les séances des autres organisateurs restent exclues et leurs restrictions de consultation/gestion sont conservées.

La liste des membres d’une conversation propose maintenant à l’admin le retrait des collaborateurs, avec la même confirmation que pour les clients. Le retrait enlève uniquement l’appartenance au groupe privé ; le compte est conservé. Aucun nouveau droit de retrait n’est accordé aux collaborateurs ou clients. Le Général automatique et les administrateurs restent protégés.

## Vérifications

- 158 tests d’interface PWA, 151 tests unitaires serveur et 144 tests d’intégration HTTP/PostgreSQL réussis. TypeScript, lint des fichiers modifiés et builds PWA/backend réussis.
- Les sept nouveaux cas d’intégration utilisent des identités jetables connectées par l’endpoint officiel : refus POST/PUT des votes de séance des organisateurs, votes ordinaires autorisés, découverte des sondages ordinaires, séances étrangères masquées, vote client et participants de présence exclusivement clients.
- Le retrait d’un collaborateur est refusé aux clients/collaborateurs, autorisé à l’admin dans un groupe privé, conserve le compte et révoque l’accès aux messages du groupe. Un administrateur ne peut pas être retiré.
- Huit contrôles publics de production réussis : santé HTTP 200 via Render et le proxy PWA ; profil, groupes et sondages refusés sans session sur les deux domaines.
- Six scénarios navigateur sur les assets publiés : admin, client et collaborateur à 1440/390 pixels. Historique de profil conforme au rôle, vote de séance interdit aux organisateurs, vote ordinaire disponible, confirmation de retrait d’un collaborateur accessible seulement à l’admin. Aucun débordement horizontal ni erreur JavaScript.

Les scénarios navigateur interceptent toutes les requêtes métier et WebSockets, avec des identités fictives et sans Service Worker. Aucun vote, retrait de groupe, connexion réelle ou mutation métier de production n’a été effectué pendant cette recette. Les règles serveur ont été exercées séparément sur PostgreSQL temporaire isolé.
