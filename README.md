# Livre de Souvenirs — Salma & Soufiane

Application web légère permettant aux invités du mariage de laisser une photo
ou une courte vidéo, avec un filtre aux couleurs du mariage, directement depuis
leur téléphone après avoir scanné un QR code.

**Stack volontairement minimale** : HTML, CSS, JavaScript natif, et
Google Apps Script pour l'enregistrement dans Google Drive.
Aucun framework, aucun build, aucune dépendance npm.

---

## Structure

```
livre-photos/
├── index.html              Les quatre écrans (accueil, capture, aperçu, confirmation)
├── css/style.css           Styles — accueil élégant, capture et aperçu plein écran
├── js/app.js               Toute la logique : caméra, filtres, envoi, accessibilité
├── filters/
│   ├── filters.json        Configuration des filtres (source de vérité)
│   └── portrait/           Images de filtres plein format (PNG transparents)
├── Code-livre-photos.gs    Backend Google Apps Script
├── netlify.toml            Déploiement statique et en-têtes
├── sw.js                   Service worker — cache hors ligne
├── diagnostic.html         Page de test de compatibilité, à ouvrir sur mobile
├── manifest.webmanifest    Manifeste PWA
├── icon.svg                Icône de l'application
├── tools/
│   └── optimize-filters.sh Miniatures et compression des filtres
└── README.md
```

## Tester la compatibilité d'un téléphone

Ouvrez `https://photosouvenir.netlify.app/diagnostic.html` **depuis le téléphone
à tester**. La page vérifie tout ce dont l'application a besoin, puis lance un
vrai enregistrement de 4 secondes en basculant de caméra à mi-parcours.

Elle répond notamment à :

- la bascule avant/arrière fonctionne-t-elle **pendant** la vidéo ?
- le filtre est-il réellement incrusté dans la photo et dans la vidéo ?
- quel format vidéo ce navigateur produit-il, et le serveur l'accepte-t-il ?
- le partage natif de fichiers est-il disponible ?
- le serveur des mariés répond-il ?

Un bouton « Copier le rapport » produit un résumé texte à conserver ou à
transmettre. Testez au minimum : un iPhone récent, un iPhone ancien, un Android
récent, un Android d'entrée de gamme.

## Optimisations en place

| Optimisation | Effet |
|---|---|
| Service worker | À partir du 2ᵉ souvenir, la page et les filtres ne sont plus retéléchargés ; une coupure de wifi ne casse plus rien |
| `preconnect` vers Apps Script | La poignée de main TLS est payée au chargement, plus au moment de l'envoi |
| Caméra avant le micro | L'aperçu apparaît sans attendre la seconde autorisation |
| Préchargement des filtres | Téléchargés aux moments creux pendant que l'invité cadre |
| Préchauffage du canvas | La vidéo démarre sur une image, jamais sur du noir |
| Composition anticipée | Le filtre photo est appliqué dès la sélection : « Enregistrer » et « Envoyer » sont instantanés |
| Capture au format écran | Aucun pixel jamais affiché n'est encodé ni envoyé |
| Wake Lock | L'écran ne s'éteint pas pendant l'enregistrement |
| `visualViewport` | Les commandes ne sont jamais rognées par la barre d'adresse iOS |

---

## Parcours de l'invité

1. **Accueil** — prénom et message, tous deux facultatifs : ils ne bloquent
   jamais la création du souvenir.
2. **Capture plein écran** — la caméra occupe tout l'écran. Aucun filtre à ce
   stade. Appui bref = photo, appui prolongé = vidéo (60 s maximum). Un
   sélecteur *Photo / Vidéo* offre une alternative à l'appui prolongé.
3. **Aperçu** — c'est ici, et seulement ici, que l'on choisit un filtre :
   par glissement horizontal sur le média ou via les vignettes.
4. **Enregistrer ou partager**, et/ou **Envoyer aux mariés**. Les deux actions
   sont indépendantes.

---

## Ajouter ou modifier un filtre

Tout se pilote depuis `filters/filters.json`. Aucune modification de
`js/app.js` n'est nécessaire.

```json
{
  "id": "mon-nouveau-filtre",
  "name": "Nom affiché",
  "category": "elegant",
  "active": true,
  "order": 6,
  "mediaTypes": ["photo", "video"],
  "portrait": "filters/portrait/filter-mon-nouveau-filtre.png",
  "landscape": "filters/landscape/filter-mon-nouveau-filtre.png",
  "thumbnail": "filters/thumbnails/filter-mon-nouveau-filtre.png",
  "availableFrom": "2026-10-23T00:00:00Z",
  "availableUntil": "2026-10-24T23:59:59Z"
}
```

- `portrait`, `landscape` et `thumbnail` sont facultatifs. Sans eux, le chemin
  `filters/portrait/filter-<id>.png` est utilisé.
- `active: false` retire un filtre sans supprimer le fichier.
- L'entrée `none` (« Aucun filtre ») est obligatoire et ajoutée automatiquement
  si elle manque.
- Les filtres sont dessinés en mode *cover* : ils ne sont jamais étirés ni
  déformés, quelle que soit l'orientation.

### Alléger les filtres — à faire avant le jour J

Les filtres plein format pèsent 2 à 2,8 Mo chacun, soit plus de 13 Mo. C'est le
principal facteur de lenteur sur le réseau mobile d'une salle de réception.

```bash
bash tools/optimize-filters.sh
```

Le script génère les miniatures dans `filters/thumbnails/` et compresse les PNG
plein format si `pngquant` est installé (`brew install pngquant`), en
sauvegardant les originaux dans `filters/portrait/_originaux/`.

**Aucune modification de `filters.json` n'est nécessaire** : `js/app.js`
cherche automatiquement `filters/thumbnails/filter-<id>.png` et retombe en
silence sur l'image plein format si elle n'existe pas.

---

## Backend Google Apps Script

### Déployer une modification

Une modification du fichier `.gs` **n'a aucun effet** tant qu'une nouvelle
version n'est pas déployée :

> Déployer → Gérer les déploiements → (crayon) → Version : **Nouvelle version** → Déployer

### Vérifier la version réellement en ligne

Ouvrir `<URL_DU_DEPLOIEMENT>?action=health` et lire la réponse :

| Réponse | Signification |
|---|---|
| Texte brut, sans JSON | Code très ancien déployé |
| JSON **sans** champ `version` | Version antérieure au 5 août 2026 |
| JSON avec `"version": "2026.08.05-1"` | Version actuelle bien en ligne |

Si `version` ne correspond pas à `BACKEND_VERSION` en haut de
`Code-livre-photos.gs`, le déploiement n'a pas été mis à jour.

### Dossier Google Drive — vérifié

`DRIVE_MAIN_FOLDER_ID = '12W1gstTtPzL4JFVq6MQWzvDa8FpbBy4b'` correspond bien au
dossier **« Livre Photos Souvenirs — Mariage S&S 📸 »**.

L'identifiant `1FsZyN4zT_HkVbZcw-G6gil6tYug26IuY`, longtemps pris pour un
dossier principal concurrent, est en réalité le **sous-dossier `Vidéos`** situé
à l'intérieur de ce dossier. Il n'y a donc jamais eu de conflit : la
configuration actuelle est correcte et ne doit pas être modifiée.

Pour le revérifier à tout moment, exécuter `verifyDriveTarget()` depuis
l'éditeur Apps Script et lire le journal : compte exécutant, nom et URL du
dossier principal, URL et nombre de fichiers de `Photos` et `Vidéos`.

### Ranger les anciens souvenirs

Les envois antérieurs à la mise en place des sous-dossiers se trouvent à la
racine du dossier principal. Pour les classer, exécuter depuis l'éditeur :

```javascript
tidyLegacyFiles(true)   // simulation : journalise sans rien déplacer
tidyLegacyFiles()       // déplacement réel vers Photos / Vidéos
```

La fonction ne supprime rien, ne touche pas aux dossiers et ignore tout
fichier qui n'est ni une image ni une vidéo.

### Limites appliquées

| | Backend | Frontend (marge de sécurité) |
|---|---|---|
| Photo | 20 Mo | 16 Mo |
| Vidéo | 25 Mo | 21 Mo |
| Durée vidéo | 60 s | 60 s |
| Photos acceptées | JPEG, PNG, WebP | JPEG produit |
| Vidéos acceptées | MP4, WebM, MOV | MP4 ou WebM selon le navigateur |

### Qualité et taille des vidéos

L'enregistrement se fait en 720p à **4 Mbit/s** (+ 128 kbit/s d'audio), et non
à un débit bridé pour que le pire cas tienne dans la limite. La taille est
surveillée pendant l'enregistrement : à 20 Mo atteints, la capture s'arrête
proprement et l'invité en est informé.

Une capture typique de 10 à 20 secondes pèse ainsi 5 à 10 Mo — nettement plus
nette à l'image, et bien plus rapide à envoyer, que les 20 Mo systématiques de
l'approche précédente.

Le média est également capturé **au format de l'écran**, ce qui supprime les
pixels jamais affichés et réduit encore le poids du fichier.

### Confirmation d'envoi

Le frontend n'affiche **jamais** de confirmation sur la seule base d'une
requête `fetch`. Après le POST, il interroge
`?action=status&uploadId=…&prefix=…` en JSONP jusqu'à recevoir `COMPLETED`.
Un statut `FAILED` affiche le message du serveur et réactive le bouton.

---

## Développement local

La caméra exige HTTPS **ou** `localhost`. Ne pas ouvrir `index.html` avec le
protocole `file://` : les requêtes réseau et la caméra s'y comportent
différemment.

```bash
python3 -m http.server 8080
# puis ouvrir http://localhost:8080
```

Pour tester depuis un téléphone sur le réseau local, utiliser un tunnel HTTPS
(par exemple `npx localtunnel --port 8080`), car `http://192.168.x.x` ne donne
pas accès à la caméra.

---

## Déploiement Netlify

Site statique, sans build. `netlify.toml` définit :

- le dossier publié (racine du dépôt) ;
- un cache nul sur le HTML et sur `filters.json`, pour ne jamais servir une
  ancienne version après un déploiement ;
- un cache long sur les images de filtres ;
- `Permissions-Policy: camera=(self), microphone=(self)`, sans lequel certains
  navigateurs bloquent l'accès à la caméra.

Après déploiement, recharger en vidant le cache (ou en navigation privée) pour
éviter un faux résultat dû au cache du navigateur.

---

## Limites techniques connues

- **Progression d'envoi** : aucun pourcentage n'est affiché pendant l'envoi, et
  c'est délibéré. Attacher un écouteur à `xhr.upload` rendrait la requête « non
  simple » au sens CORS et déclencherait un préflight `OPTIONS` que Google Apps
  Script ne gère pas : le POST ne partirait jamais. La barre est donc
  indéterminée, avec la taille réelle du fichier affichée, plutôt que faussement
  chiffrée.
- **Incrustation du filtre dans les vidéos** : elle repose sur
  `canvas.captureStream()` + `MediaRecorder` + `AudioContext`, toutes
  disponibles sur Safari iOS 15+. Le réencodage se fait en temps réel : une
  vidéo de 15 s demande environ 15 s de traitement, avec une barre de
  progression et un bouton « Passer cette étape ». Si l'appareil ne le permet
  pas, la vidéo d'origine est conservée et l'interface le dit explicitement.
- **Enregistrement dans la galerie iOS** : un site web ne peut pas écrire
  directement dans l'application Photos. Le bouton ouvre la feuille de partage
  native ; c'est l'invité qui choisit « Enregistrer la vidéo ». L'intitulé du
  bouton dit donc « Enregistrer ou partager », et non « Enregistré ».
- **Poids des filtres** : environ 13 Mo au total en plein format. Voir la
  section Miniatures ci-dessus.
