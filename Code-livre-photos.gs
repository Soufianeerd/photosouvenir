/**
 * ═══════════════════════════════════════════════════════
 *  LIVRE PHOTOS SOUVENIRS — Google Apps Script (FINAL)
 *  Soufiane & Salma · 23 Octobre 2026
 * ═══════════════════════════════════════════════════════
 *
 *  Cette version agit comme backend sécurisé et privé.
 *  Aucun jeton d'accès OAuth côté client n'est nécessaire.
 *  Les fichiers restent strictement privés sur votre Google Drive.
 *
 *  ── INSTALLATION ─────────────────────────────────────
 *  1. script.google.com → Nouveau projet
 *  2. Nommer : "Livre Photos - Mariage S&S"
 *  3. Coller ce code, remplir les constantes [EDIT]
 *  4. ▶ Exécuter → autoriser les permissions (Drive + Sheets)
 *  5. Déployer → Application Web
 *     - Exécuter en tant que : Moi
 *     - Accès : N'importe qui
 *  6. Copier l'URL /exec → coller dans le frontend
 */

const DRIVE_MAIN_FOLDER = "Livre Photos Souvenirs — Mariage S&S 📸";
const SHEET_ID = ''; // [EDIT] URL Sheet : .../spreadsheets/d/ >>> ID <<< /edit (ou vide)
const SHEET_TAB = 'Registre Souvenirs';
const CACHE_EXPIRATION_SECONDS = 3600; // 1 heure

/**
 * Traite les requêtes POST entrantes (Upload).
 */
function doPost(e) {
  let uploadId = 'unknown';
  
  try {
    const data = JSON.parse(e.postData.contents);
    uploadId = data.uploadId || Utilities.getUuid();
    
    // 1. Initialiser le statut à PROCESSING
    setStatus_(uploadId, 'PROCESSING', { message: 'Fichier en cours de traitement par Google Apps Script' });

    const mediaBase64 = data.mediaBase64;
    const mimeType    = data.mimeType || 'application/octet-stream';
    const mediaType   = data.mediaType || 'unknown'; // 'photo' ou 'video'
    const filename    = sanitize_(data.filename || `${Date.now()}_fichier`);
    const guestName   = data.guestName || 'Anonyme';
    const message     = data.message || '';
    const filterId    = data.filterId || 'none';
    const orientation = data.orientation || 'unknown';
    const duration    = data.duration || 0;
    
    // Validation basique
    if (!mediaBase64) {
      throw new Error("Payload incomplet : aucun média reçu.");
    }
    
    // 2. Décoder le fichier Base64
    const fileBytes = Utilities.base64Decode(mediaBase64);
    const blob = Utilities.newBlob(fileBytes, mimeType, filename);
    const size = fileBytes.length;

    // 3. Obtenir les dossiers
    const mainFolder = getOrCreateFolder_(DriveApp.getRootFolder(), DRIVE_MAIN_FOLDER);
    const photosFolder = getOrCreateFolder_(mainFolder, 'Photos');
    const videosFolder = getOrCreateFolder_(mainFolder, 'Vidéos');
    const tempFolder = getOrCreateFolder_(mainFolder, 'Temporaires'); // Créé au cas où

    const destinationFolder = mediaType === 'photo' ? photosFolder : (mediaType === 'video' ? videosFolder : tempFolder);

    // 4. Sauvegarder dans Drive (Le fichier reste 100% PRIVÉ)
    const file = destinationFolder.createFile(blob);
    const fileId = file.getId();
    
    // /!\ AUCUN setSharing / ANYONE_WITH_LINK ici.
    // Le fichier appartient au propriétaire du script.

    // 5. Enregistrer dans Google Sheets
    if (SHEET_ID && SHEET_ID.trim() !== '') {
      logToSheet_(uploadId, guestName, message, mediaType, filename, mimeType, size, duration, orientation, filterId, fileId, destinationFolder.getName());
    }

    // 6. Succès ! Mettre à jour le statut
    setStatus_(uploadId, 'COMPLETED', {
      fileId: fileId,
      filename: filename,
      mediaType: mediaType
    });

    return buildResponse_({ success: true, uploadId: uploadId });

  } catch (err) {
    Logger.log('❌ Erreur doPost : ' + err.toString());
    setStatus_(uploadId, 'FAILED', { error: 'Erreur interne de traitement sécurisé.' });
    return buildResponse_({ success: false, uploadId: uploadId, error: err.message });
  }
}

/**
 * Traite les requêtes GET (Statut d'upload via JSONP).
 */
function doGet(e) {
  try {
    const action = e.parameter.action;
    const uploadId = e.parameter.uploadId;
    const prefix = e.parameter.prefix;

    if (action === 'status' && uploadId && prefix) {
      // Sécurisation du nom de callback (JSONP) pour éviter l'injection de code
      if (!/^[a-zA-Z0-9_]+$/.test(prefix)) {
        return ContentService.createTextOutput("Invalid callback name.").setMimeType(ContentService.MimeType.TEXT);
      }

      // Lire le statut
      const statusData = getStatus_(uploadId);

      // Si le statut demande une suppression (COMPLETED ou FAILED), on le nettoie pour ne pas saturer Properties
      if (statusData.status === 'COMPLETED' || statusData.status === 'FAILED') {
         deleteStatus_(uploadId);
      }

      const jsonResponse = JSON.stringify(statusData);
      
      // Retour JSONP (le ContentService de GAS redirige, ce format permet au navigateur de le lire)
      return ContentService
        .createTextOutput(`${prefix}(${jsonResponse});`)
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    
    // Par défaut, retourne l'état du backend
    return ContentService
      .createTextOutput('Backend Livre Photos Opérationnel.')
      .setMimeType(ContentService.MimeType.TEXT);
      
  } catch (err) {
    return ContentService.createTextOutput("Error").setMimeType(ContentService.MimeType.TEXT);
  }
}

// ── GESTION DES STATUTS (CacheService + PropertiesService) ──

function setStatus_(uploadId, status, extraData = {}) {
  const data = {
    uploadId: uploadId,
    status: status,
    updatedAt: new Date().toISOString(),
    ...extraData
  };
  
  const jsonString = JSON.stringify(data);
  
  // Écriture rapide en cache (Expire dans 1h)
  try {
    CacheService.getScriptCache().put('upload_' + uploadId, jsonString, CACHE_EXPIRATION_SECONDS);
  } catch (e) {}

  // Fallback persistant pour éviter l'éviction
  try {
    PropertiesService.getScriptProperties().setProperty('upload_' + uploadId, jsonString);
  } catch (e) {}
}

function getStatus_(uploadId) {
  let jsonString = null;
  
  // Chercher d'abord dans le Cache (rapide)
  try {
    jsonString = CacheService.getScriptCache().get('upload_' + uploadId);
  } catch (e) {}
  
  // Si vide, chercher dans les Propriétés (fallback)
  if (!jsonString) {
    try {
      jsonString = PropertiesService.getScriptProperties().getProperty('upload_' + uploadId);
    } catch (e) {}
  }

  if (jsonString) {
    try {
      return JSON.parse(jsonString);
    } catch (e) {
      return { uploadId: uploadId, status: 'FAILED', error: 'Données corrompues.' };
    }
  }
  
  return { uploadId: uploadId, status: 'PENDING', message: 'En attente...' };
}

function deleteStatus_(uploadId) {
  try {
    CacheService.getScriptCache().remove('upload_' + uploadId);
    PropertiesService.getScriptProperties().deleteProperty('upload_' + uploadId);
  } catch (e) {}
}

// ── UTILITAIRES ──

function getOrCreateFolder_(parentFolder, folderName) {
  const it = parentFolder.getFoldersByName(folderName);
  if (it.hasNext()) return it.next();
  return parentFolder.createFolder(folderName);
}

function sanitize_(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 120);
}

function buildResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── GOOGLE SHEET ──

function logToSheet_(memoryId, name, message, type, filename, mime, size, duration, orientation, filter, driveId, folder) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName(SHEET_TAB);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_TAB);
      const headers = ['Memory ID', 'Date', 'Prénom', 'Message', 'Type', 'Nom fichier', 'MIME', 'Taille (octets)', 'Durée', 'Orientation', 'Filtre', 'ID Drive', 'Dossier'];
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#5D262C').setFontColor('#F9F7F2');
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      memoryId,
      new Date(),
      name,
      message,
      type,
      filename,
      mime,
      size,
      duration,
      orientation,
      filter,
      driveId,
      folder
    ]);

  } catch (err) {
    Logger.log('⚠️ Erreur Sheet : ' + err.toString());
  }
}
