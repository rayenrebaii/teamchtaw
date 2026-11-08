# Lancer Team Chtaw sous Windows

Double-cliquez sur **`start-chtaw-team.bat`** à la racine du projet. Deux terminaux dédiés s’ouvrent et le navigateur par défaut affiche **http://127.0.0.1:3001** lorsque les serveurs sont prêts.

Double-cliquez sur **`stop-chtaw-team.bat`** pour arrêter uniquement les serveurs ouverts par ce système. PostgreSQL, Docker Desktop, leurs volumes et les autres projets Node.js restent en marche.

Conservez les deux BAT et leur auxiliaire **`chtaw-team-launcher.ps1`** ensemble à la racine. Ils utilisent leur propre emplacement, pas le dossier courant du terminal. Les chemins sont entre guillemets pour prendre en charge les espaces. Windows PowerShell 5.1, inclus dans Windows 10 et 11, suffit ; aucune modification permanente de la stratégie d’exécution n’est effectuée.

## Avant le premier lancement

- Node.js, npm, Docker Desktop et Docker Compose V2 doivent être installés. Docker Desktop doit être démarré et son moteur prêt. Le lanceur ne démarre pas Docker Desktop à votre place.
- Les deux dossiers `chtaw-team-backend` et `chtaw-team-pwa`, leurs dépendances et le client Prisma doivent déjà être présents.
- Le backend doit posséder un `.env` valide et utiliser le port `3002`. Le lanceur vérifie sa configuration sans afficher les secrets.
- Le frontend possède déjà les valeurs locales par défaut : `.env.local` est facultatif. S’il existe, ainsi que les autres fichiers d’environnement Next.js, ses URL effectives doivent correspondre à `http://127.0.0.1:3002/api/v1` et `http://127.0.0.1:3002`. Ne pas mélanger `localhost` et `127.0.0.1` pour les cookies.
- Les migrations et le seed du premier administrateur doivent avoir été effectués **manuellement**, comme indiqué dans les README des deux applications.

Aucune commande `npm install`, `npm ci`, migration ou seed n’est exécutée automatiquement. Aucun fichier source ou `.env` des applications n’est modifié. Les variables `HOST`, `PORT` et `NODE_ENV` sont fixées uniquement dans l’environnement des terminaux enfants, pour un démarrage local en développement.

## Déroulement

1. Vérification des outils, dossiers, dépendances, configuration et disponibilité des ports.
2. Depuis le backend : `docker compose -p chtaw-team-backend up -d --wait --wait-timeout 90 postgres`. Le processus Compose dispose d’une limite globale de 180 secondes. Aucune suppression de données ou de volumes.
3. Nouveau terminal backend : `npm.cmd run dev`, puis attente HTTP sur `/api/v1/health`, au maximum 90 secondes.
4. Nouveau terminal frontend : `npm.cmd run dev`, puis attente HTTP sur `http://127.0.0.1:3001`, au maximum 120 secondes.
5. Ouverture de cette URL dans le navigateur par défaut.

Il ne s’agit pas d’un simple délai fixe : les ports, leur appartenance aux processus suivis et les réponses HTTP sont vérifiés. Les requêtes HTTP individuelles ont aussi un délai maximal. Deux clics rapprochés sont sérialisés par un verrou Windows. Un second démarrage réutilise les serveurs déjà suivis par le lanceur.

Un port occupé par un serveur démarré autrement provoque un message d’erreur : ce serveur n’est ni réutilisé, ni arrêté. Il faut le fermer manuellement avant de relancer. Le lanceur ne déduit jamais qu’un processus lui appartient à partir de son seul nom ou de son port.

## Arrêt et erreurs

Chaque terminal auxiliaire crée un **Job Object Windows unique**. Le processus npm est créé suspendu, affecté à ce Job Object, puis repris : ses descendants `cmd` et `node` restent dans le même arbre suivi. L’arrêt vise cet objet du noyau, et non un PID susceptible d’être réutilisé. Aucun `taskkill /IM node.exe` global.

Les identifiants de lancement sont enregistrés dans `.chtaw-team-runtime`, avec un identifiant dérivé du dossier courant. Ces fichiers ne contiennent aucun secret et leur répertoire s’ignore lui-même pour Git. Les identifiants et les fichiers de suivi sont validés avant utilisation.

Fermer manuellement un terminal dédié supprime aussi son arbre de processus, grâce à l’option Windows `KILL_ON_JOB_CLOSE`. En cas de sortie inattendue du serveur, le terminal conserve les messages et attend Entrée. En cas d’échec du BAT principal, sa fenêtre attend également une touche. Si le backend a démarré mais que le frontend échoue, utilisez le BAT d’arrêt pour nettoyer les serveurs suivis.

Le BAT d’arrêt attend la fin des processus suivis. Il ne nécessite ni npm ni Docker pour les arrêter. Un suivi ancien dont l’objet Windows n’existe plus n’entraîne aucun arrêt de processus. Ne déplacez pas le dossier et ne supprimez pas les fichiers de suivi pendant que les serveurs sont actifs ; utilisez d’abord le BAT d’arrêt.

Le démarrage et l’arrêt ne doivent normalement pas nécessiter un terminal administrateur. Si une politique d’entreprise interdit PowerShell, la compilation des types natifs ou l’accès au moteur Docker, le lanceur affiche une erreur ; il ne modifie aucune politique système.

## Vérifications réalisées

- Démarrage réel du PostgreSQL dédié, backend et frontend : réussi ; les deux serveurs répondaient en HTTP.
- Second démarrage : les deux mêmes instances ont été réutilisées.
- Arrêt réel : les deux arbres de processus ont été arrêtés ; PostgreSQL est conservé.
- Tests des objets Windows : suivi des descendants Node, isolation de deux arbres, arrêt ciblé, ancien identifiant sans cible et identifiant invalide.
- Fichier `.env` backend manquant : refus avant lancement.
- Port `3001` occupé par un serveur Node non enregistré : démarrage refusé ; ce serveur survit à l’arrêt du lanceur.
- Test du véritable BAT depuis un dossier contenant des espaces : résolution de `%~dp0` et diagnostic du `.env` manquant.

Les tests de démarrage ont utilisé `-NoBrowser` pour éviter une ouverture de navigateur pendant la vérification. Le BAT destiné au double-clic ne possède pas cette option et ouvre l’URL via le navigateur par défaut. L’ouverture visuelle du navigateur n’est donc pas revendiquée comme testée automatiquement.

Pour relancer les tests ciblés, quand les serveurs du lanceur sont arrêtés et Docker est disponible :

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\test-chtaw-launcher.ps1
```

Le test utilise seulement des processus et des fichiers temporaires à lui pour simuler un serveur externe et un dossier incomplet. Il ne modifie pas les données PostgreSQL. Son contrôle du port occupé est ignoré si le port 3001 est déjà utilisé.
