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
├── tools/
│   └── make-thumbnails.sh  Génération des miniatures de filtres (optionnel)
└── README.md
```

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

### Miniatures

Les filtres plein format pèsent entre 2 et 2,8 Mo. Pour alléger le chargement
sur une connexion mobile faible :

```bash
bash tools/make-thumbnails.sh
```

Puis renseigner le champ `thumbnail` de chaque filtre dans `filters.json`.
Sans miniatures, l'application ne télécharge que les filtres proches de la
sélection courante ; avec miniatures, la bande de filtres devient quasi
instantanée.

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
