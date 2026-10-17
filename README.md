# Livre de Souvenirs — Salma & Soufiane

Application photo/vidéo du mariage du 23 octobre 2026. **L’URL imprimée reste https://photosouvenir.netlify.app/**. Le projet Netlify existant déploie la branche `main` de ce dépôt.

## Développement et vérifications

Node.js 22 ou plus récent. Le site utilise HTML, CSS, JavaScript natif et Google Apps Script ; aucun framework côté client.

```sh
npm ci
npm test
npm run check
npm run build
node tests/serve.mjs
```

Le laboratoire `http://127.0.0.1:8776/__lab` utilise des caméras, un son à 440 Hz et un serveur **simulés**. Canvas, MediaRecorder, IndexedDB et Web Audio sont réels. Aucun média du laboratoire n’est envoyé vers Google. Ce laboratoire et les tests sont exclus du déploiement.

`npm test` vérifie notamment la conservation de 160 souvenirs avec refus temporaire puis reprise, le verrou multi-onglets, l’idempotence, les métadonnées, les ouvertures tardives et les erreurs de bascule. Cette simulation ne mesure pas la capacité de la connexion Wi-Fi de la salle ni les quotas réels de Google.

## Publication

Netlify exécute `node tools/build.mjs` et publie **dist**, préparé à partir d’une liste explicite. Le code Apps Script, les tests et les documents ne doivent pas être servis publiquement. Ne pas renommer le projet Netlify ni changer le domaine.

Les versions des URL JavaScript/CSS dans `index.html` et celles du shell dans `sw.js` doivent être mises à jour ensemble. Le service worker prépare un shell complet et conserve la configuration des filtres hors ligne. Les souvenirs en attente restent dans IndexedDB, indépendamment du cache.

## Backend Apps Script

`Code-livre-photos.gs` est la source du projet **Photos - Mariage**. Après un changement : enregistrer le code, puis **Déployer → Gérer les déploiements → Modifier → Nouvelle version → Déployer** sur le déploiement existant. Ne pas créer un autre point d’entrée par erreur.

La réponse à l’URL configurée dans `CONFIG.API_URL` avec `?action=health` doit annoncer la même `BACKEND_VERSION`, actuellement `2026.10.17-1`, ainsi que `idempotentUploads: true`, `metadataSaved: true` et six écritures Drive simultanées au maximum.

Le serveur réserve un envoi sous verrou avant de créer le fichier. Un même `uploadId` retourne la même réception ; le nom Drive déterministe permet aussi de récupérer un fichier après une interruption ou l’expiration d’un ancien statut. Les légendes, prénoms et filtres sont conservés dans la **description JSON du fichier Drive**, sans dépendre d’une feuille Sheets.

Les signatures de conteneur, types autorisés, taille et durée déclarée sont contrôlés. Les écritures Drive sont limitées à six ; les requêtes excédentaires reçoivent un statut temporaire à réessayer. Les limites et la disponibilité propres à Google continuent de s’appliquer. Une protection contre toute attaque volontaire n’est pas garantie par un formulaire public anonyme.

## Confidentialité

Le dossier photo utilise **Accès limité**, avec l’accès nominatif des mariés. Les dossiers Photos et Vidéos ne doivent comporter aucune autorisation `anyone`. Le dossier audio parent peut conserver sa propre politique de partage ; la limitation photo empêche son héritage public sur les médias. Vérifier aussi les permissions d’un nouveau fichier après déploiement.

## Garanties et limites d’envoi

- Un envoi est écrit localement avant toute tentative réseau ; sans stockage local, il est conservé en mémoire avec avertissement et possibilité d’export.
- Un seul worker par appareil/onglets traite la file. Les reprises sont espacées et les doublons sont également empêchés côté serveur.
- Le titre « Souvenir bien reçu » apparaît uniquement après confirmation serveur.
- Aucun souvenir non confirmé n’est supprimé automatiquement selon son âge ou son nombre, y compris en cas d’erreur définitive. Il reste exportable.
- Pour limiter la mémoire sur mobile, une nouvelle mise en file est refusée si le total dépasserait 32 Mio ; les fichiers déjà conservés restent intacts et le média courant reste à l’aperçu.
- Fermer ou suspendre le navigateur peut arrêter les transferts. Les envois persistés reprennent en rouvrant **la même adresse dans le même navigateur**. Garder la page ouverte jusqu’à confirmation est recommandé.
- Le navigateur ou le système peut effacer son stockage : l’utilisateur peut enregistrer une copie indépendante sur son téléphone. Le site ne peut pas garantir le stockage d’un appareil qu’il ne contrôle pas.

## Photo, vidéo et éclairage

Le côté de caméra réellement obtenu est vérifié. La bascule est sérialisée, avec réouverture après libération sur les appareils à accès exclusif. Les demandes devenues obsolètes sont arrêtées. Le micro est demandé en vidéo seulement ; son état est affiché.

Le mode lampe dépend de la capacité `torch`. À l’avant, un éclairage blanc d’écran peut précéder la capture photo. Le flash matériel n’est pas disponible de façon uniforme dans les navigateurs. L’éclair visuel après capture reste un simple retour de déclenchement.

La vidéo est limitée à 60 secondes, avec débit cible 1,8 Mbit/s et budget de taille. La capture canvas permet la bascule en cours d’enregistrement ; elle reste désactivée si seul le flux brut est utilisable. Le filtre vidéo est réencodé avec routage audio séparé des haut-parleurs. Si ce traitement est indisponible, l’original est conservé avec un message, sans remplacement silencieux.

Les limites d’envoi sont de 16 Mio pour une photo et 23 Mio pour une vidéo côté client, avec une marge par rapport au backend. Un fichier dont la durée n’est pas vérifiable est refusé avant l’envoi. Le partage natif demande une action utilisateur ; l’enregistrement peut nécessiter une seconde action après préparation vidéo, ou passer par un téléchargement selon le navigateur.

## Filtres

La configuration reste `filters/filters.json`. Les cadres actuels sont conservés. L’aperçu respecte le ratio du média, y compris un import paysage ; le cadre est composé au même ratio pour l’export. Chaque nouveau média possède une identité de cache propre.

Pour de nouveaux filtres : vérifier les zones de visage, la transparence, le portrait/paysage, les vignettes, le rendu exporté et le son vidéo. Les pièces sont immuables en cache : utiliser un nouveau nom de fichier pour une nouvelle version.

## Recette sur téléphones avant le mariage

Les tests automatisés et le navigateur de bureau ne remplacent pas une recette matérielle. Vérifier au minimum un iPhone/Safari et un Android/Chrome, idéalement anciens et récents :

1. Scanner un QR déjà imprimé.
2. Refuser puis autoriser la caméra ; importer une photo et une vidéo sans autoriser la caméra.
3. Photographier avec chaque caméra ; tester lampe arrière et éclairage écran en faible lumière.
4. Filmer avec son, basculer, arrêter, verrouiller l’écran et reprendre ; contrôler le fichier reçu.
5. Appliquer puis retirer un filtre ; comparer l’aperçu et l’export en portrait et paysage.
6. Annuler la préparation, enregistrer dans Photos/Fichiers et rouvrir la feuille de partage.
7. Couper la connexion pendant l’envoi ; fermer/rouvrir ; vérifier réception, légende et absence de doublon dans Drive.
8. Vérifier petit écran, clavier ouvert et lecteurs d’écran. La page `diagnostic.html` aide à examiner les capacités mais ne remplace pas ce parcours.
