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
├── js/filter-render.js     Compositeur de filtres — recalcule le cadre au format de l'écran
├── filters/
│   ├── filters.json        Configuration des filtres (source de vérité)
│   ├── parts/              Pièces légères : tuiles d'angle et gerbes florales
│   └── portrait/           Images d'origine, conservées comme matière première
├── Code-livre-photos.gs    Backend Google Apps Script
├── netlify.toml            Déploiement statique et en-têtes
├── sw.js                   Service worker — cache hors ligne
├── diagnostic.html         Page de test de compatibilité, à ouvrir sur mobile
├── manifest.webmanifest    Manifeste PWA
├── icon.svg                Icône de l'application
├── tools/
│   └── build-filter-parts.py  Découpe les pièces de filtre dans les images d'origine
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
| Filtres composés à la volée | 12 Mo d'images plein format remplacés par ~480 Ko de pièces, et un cadre qui épouse enfin tous les bords |
| Préchargement des filtres | Pièces et polices récupérées aux moments creux pendant que l'invité cadre |
| Préchauffage du canvas | La vidéo démarre sur une image, jamais sur du noir |
| Fichier prêt avant le toucher | La photo finale est composée dès le choix du filtre : `navigator.share()` peut alors être appelé sans aucune attente, seule façon d'ouvrir la feuille de partage sur iOS |
| Envoi en arrière-plan | L'invité voit « Merci ! » en moins de 100 ms ; le transfert se termine seul, avec reprise automatique |
| Photo 2048 px / qualité 0,88 | ~600 Ko au lieu de 3 Mo, sans différence visible : l'envoi est cinq fois plus court |
| Vidéo 720p à 2,8 Mbit/s | Presque deux fois plus légère qu'à 4 Mbit/s, pour un rendu identique sur un écran de téléphone |
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
4. **Enregistrer dans mes photos**, et/ou **Envoyer aux mariés**. Les deux
   actions sont indépendantes, et aucune ne fait attendre.

---

## Enregistrer dans la galerie : ce qui est possible, et ce qui ne l'est pas

**Aucune page web, sur aucun navigateur, ne peut écrire directement dans
l'application Photos d'un iPhone.** Il n'existe pas d'API pour cela, et c'est
délibéré côté Apple. Seule une vraie application installée depuis l'App Store
en serait capable. Toute solution qui prétend le contraire passe en réalité
par la feuille de partage.

Le chemin officiel — et le plus court — est donc `navigator.share()`, qui
ouvre la feuille native contenant « Enregistrer l'image », WhatsApp, Snapchat
et Instagram. Un seul geste.

Encore faut-il qu'elle s'ouvre. **iOS n'autorise `navigator.share()` que
pendant l'activation utilisateur**, la brève fenêtre ouverte par le toucher.
La version précédente composait la photo *avant* d'appeler `share()` : cette
attente consommait l'activation, Safari refusait, et le repli téléchargeait le
fichier — ce qui, sur iPhone, ouvre un onglet Safari sans rien enregistrer.
C'était la cause exacte de l'impossibilité de partager vers Snapchat.

Ce qui est en place aujourd'hui :

- la photo finale est composée **dès que l'invité choisit son filtre**, en
  silence, 400 ms après son geste ;
- au toucher, `navigator.share()` est appelé **immédiatement**, sans le
  moindre `await` — l'activation est intacte, la feuille s'ouvre ;
- une vidéo demande un réencodage impossible à anticiper : le bouton annonce
  franchement « Préparer l'enregistrement », puis devient « Enregistrer dans
  mes photos » pour le second toucher ;
- si le partage de fichiers n'existe pas (vieil Android, navigateur exotique),
  la photo finale — filtre compris — remplace l'aperçu : un appui long dessus
  propose « Ajouter aux photos », toujours sans quitter la page.

Aucun chemin ne sort de l'application vers Safari.

---

## Les filtres

### Pourquoi ils ne sont plus des images

Un cadre enregistré comme image a un format figé. Les premiers filtres étaient
des PNG de 1024 × 1536, soit un format 2:3. Un téléphone récent affiche du
9:19,5 — environ 0,46. Posée en *cover* sur un tel écran, une image en 2:3
perd 31 % de sa largeur : **les filets latéraux et les ornements d'angle
sortaient du cadre**, et le filtre ne bordait jamais l'écran.

`js/filter-render.js` recompose donc chaque cadre à la demande, aux dimensions
exactes de la cible : écran d'aperçu, photo exportée, image de vidéo. Le cadre
touche toujours les quatre bords, sur n'importe quel appareil, en portrait
comme en paysage — et l'aperçu est rigoureusement identique au fichier envoyé,
puisque les deux passent par la même fonction.

Effet secondaire appréciable : les 12 Mo d'images plein format sont remplacés
par environ 480 Ko réellement téléchargés.

### Ajouter ou modifier un filtre

Tout se pilote depuis `filters/filters.json`. Aucune modification du code n'est
nécessaire.

```json
{
  "id": "mon-nouveau-filtre",
  "name": "Nom affiché",
  "active": true,
  "order": 5,
  "mediaTypes": ["photo", "video"],

  "type": "composed",
  "layout": "bouquet",
  "corner": "filters/parts/corner-flourish.webp",
  "cornerScale": 0.235,
  "bouquet": "filters/parts/bouquet-burgundy.webp",
  "bouquetWidth": 0.58,
  "line": { "outer": 49, "inner": 61, "outerWidth": 3.6, "innerWidth": 3.6 },
  "palette": ["#F6E7B0", "#D3AC33", "#EFD98F", "#B98F1E"],
  "text": {
    "monogram": "S & S",
    "date": "23 OCTOBRE 2026",
    "tagline": "Vive les mariés"
  }
}
```

| Champ | Rôle |
|---|---|
| `layout` | `bouquet` (gerbe en bas à droite, texte en bas à gauche) ou `wedding` (titre en haut, prénoms centrés en bas) |
| `corner` | Tuile d'angle 240 × 240 px, reproduite et miroitée aux quatre coins |
| `cornerScale` | Taille de l'angle, en fraction du petit côté de l'écran |
| `line` | Position et épaisseur des deux filets, exprimées dans le repère de la tuile — elles suivent donc l'échelle de l'angle |
| `palette` | Quatre tons d'or, du plus clair au plus sombre : c'est le dégradé qui donne l'effet de dorure |
| `glow` | Halo clair facultatif, à la place du halo sombre par défaut |
| `text` | `heading`, `names`, `monogram`, `date`, `tagline` — chacun facultatif |

Points à connaître :

- Le texte **se met tout seul à la bonne taille** : selon le format de l'écran
  la gerbe remonte plus ou moins haut, et une taille figée finirait par écrire
  la date par-dessus les roses.
- Un halo sombre très diffus est ajouté sous l'or. Sans lui, un cadre doré
  disparaît sur une robe blanche ou un mur clair.
- Les vignettes de la barre de filtres sont composées sur place : il n'y a plus
  aucune miniature à régénérer à la main.
- `active: false` retire un filtre sans supprimer quoi que ce soit.
- L'entrée `none` (« Aucun filtre ») est ajoutée automatiquement si elle manque.
- Un ancien filtre image reste utilisable avec `"type": "image"` et
  `"portrait": "…png"` — il sera simplement recadré en *cover*, avec les
  limites décrites plus haut.

### Fabriquer de nouvelles pièces

Pour découper une tuile d'angle et une gerbe dans une nouvelle image d'origine,
déposez-la dans `filters/portrait/`, ajoutez-la aux tables du script, puis :

```bash
python3 tools/build-filter-parts.py
```

Le script produit un PNG et un WebP de chaque pièce (le navigateur télécharge
le WebP, le PNG sert de repli).

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

- **Envoi en arrière-plan** : l'invité est confirmé avant que le transfert ne
  soit terminé. Le souvenir est écrit dans IndexedDB *avant* toute tentative
  réseau, donc rien ne peut être perdu tant que l'invité revient sur la page —
  la file repart seule au retour du réseau, au retour sur l'onglet, ou à la
  visite suivante. Le seul cas de perte réelle : fermer la page dans la
  seconde qui suit l'envoi **et** ne jamais revenir. L'écran de confirmation
  dit toujours la vérité sur l'état du transfert.
- **Progression d'envoi** : aucun pourcentage n'est affiché, et c'est
  délibéré. Attacher un écouteur à `xhr.upload` rendrait la requête « non
  simple » au sens CORS et déclencherait un préflight `OPTIONS` que Google Apps
  Script ne gère pas : le POST ne partirait jamais.
- **Incrustation du filtre dans les vidéos** : elle repose sur
  `canvas.captureStream()` + `MediaRecorder` + `AudioContext`, toutes
  disponibles sur Safari iOS 15+. Le réencodage se fait en temps réel : une
  vidéo de 15 s demande environ 15 s de traitement, avec une barre de
  progression et un bouton « Annuler ». C'est la seule attente restante de
  toute l'application, et elle est inhérente au navigateur. Si l'appareil ne
  le permet pas, la vidéo d'origine est conservée et l'interface le dit.
- **Interrompre** : un seul bouton, un seul mot — « Annuler ». Il annule
  vraiment : l'opération s'arrête, rien n'est mis en cache, et l'invité
  retrouve son aperçu exactement comme il l'avait laissé. L'ancien « Passer
  cette étape » poursuivait l'action avec un fichier différent de celui
  affiché à l'écran, ce qui n'avait aucun sens pour un invité.
- **Formats très inhabituels** : le cadre s'adapte à tout format, mais sur un
  écran extrêmement allongé la gerbe florale occupe forcément une part plus
  faible de la hauteur. Le filtre « Or Fin », sans gerbe, reste identique
  partout.
