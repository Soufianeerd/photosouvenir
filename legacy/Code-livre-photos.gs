/**
 * ═══════════════════════════════════════════════════════
 *  LIVRE PHOTOS SOUVENIRS — Google Apps Script
 *  Soufiane & Salma · 23 Octobre 2026
 * ═══════════════════════════════════════════════════════
 *
 *  Reçoit les photos des invités, les sauvegarde dans
 *  Google Drive et logge dans Google Sheets.
 *  Si l'invité le demande, lui envoie sa photo par email.
 *
 *  ── INSTALLATION ─────────────────────────────────────
 *  1. script.google.com → Nouveau projet
 *  2. Nommer : "Livre Photos - Mariage S&S"
 *  3. Coller ce code, remplir les constantes [EDIT]
 *  4. ▶ Exécuter → autoriser les permissions (Drive + Sheets + Gmail)
 *  5. Déployer → Application Web
 *     - Exécuter en tant que : Moi
 *     - Accès : N'importe qui
 *  6. Copier l'URL /exec → coller dans index.html → CONFIG.API_URL
 *
 * ═══════════════════════════════════════════════════════
 */

// ── CONFIGURATION ──────────────────────────────────────

// [EDIT] Nom du dossier Drive (créé automatiquement)
// Parallèle au dossier audio : "Livre d'Or Audio — Mariage S&S 🎙️"
const DRIVE_FOLDER_NAME = "Livre Photos Souvenirs — Mariage S&S 📸";

// [EDIT] ID de votre Google Sheet pour le registre
// URL Sheet : .../spreadsheets/d/ >>> ID <<< /edit
// Peut être le MÊME Sheet que les RSVP et les audios (onglet séparé)
const SHEET_ID = '';  // ← Collez l'ID ici (ou '' pour désactiver)

// [EDIT] Nom de l'onglet dans le Sheet
const SHEET_TAB = 'Photos Souvenirs';

// [EDIT] Informations sur les mariés (pour les emails)
const COUPLE       = 'Soufiane & Salma';
const WEDDING_DATE = 'Vendredi 23 Octobre 2026';
const OWNER_EMAIL  = 'soufiane.erd@gmail.com'; // reçoit une notification à chaque photo

// ── RÉCEPTION DES PHOTOS (doPost) ─────────────────────

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    const photoBase64  = data.photo;
    const mimeType     = data.mimeType  || 'image/jpeg';
    const filename     = sanitize_(data.filename || (Date.now() + '_photo.jpg'));
    const guestName    = data.name      || 'Anonyme';
    const relation     = data.relation  || '';
    const caption      = data.caption   || '';
    const sendToSelf   = data.sendToSelf === true;
    const guestEmail   = data.email     || '';

    // 1. Décoder base64 → bytes
    const photoBytes = Utilities.base64Decode(photoBase64);

    // 2. Créer le blob image
    const photoBlob = Utilities.newBlob(photoBytes, mimeType, filename);

    // 3. Sauvegarder dans Drive
    const folder  = getOrCreateFolder_(DRIVE_FOLDER_NAME);
    const file    = folder.createFile(photoBlob);
    const fileUrl = file.getUrl();
    const fileId  = file.getId();

    // Rendre l'image visible (lien partageable en lecture)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const previewUrl = 'https://drive.google.com/uc?export=view&id=' + fileId;

    // 4. Logger dans Google Sheet
    if (SHEET_ID && SHEET_ID.trim() !== '') {
      logToSheet_(guestName, relation, caption, filename, fileUrl, fileId, guestEmail);
    }

    // 5. Notification à l'organisateur (Soufiane)
    sendOwnerNotification_(guestName, relation, caption, filename, fileUrl, previewUrl, photoBlob);

    // 6. Envoyer la photo à l'invité si demandé
    if (sendToSelf && guestEmail && guestEmail.includes('@')) {
      sendPhotoToGuest_(guestName, guestEmail, caption, filename, photoBlob, previewUrl);
    }

    return buildResponse_({ success: true, filename: filename, fileId: fileId });

  } catch (err) {
    Logger.log('❌ Erreur doPost : ' + err.toString());
    return buildResponse_({ success: false, error: err.message });
  }
}

// ── GOOGLE SHEET ───────────────────────────────────────

function logToSheet_(name, relation, caption, filename, fileUrl, fileId, email) {
  try {
    const ss    = SpreadsheetApp.openById(SHEET_ID);
    let   sheet = ss.getSheetByName(SHEET_TAB);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_TAB);
      const headers = ['Date & Heure', 'Prénom', 'Relation', 'Légende', 'Email', 'Fichier', 'Voir la photo', 'ID Drive'];
      sheet.appendRow(headers);
      const hr = sheet.getRange(1, 1, 1, headers.length);
      hr.setFontWeight('bold');
      hr.setBackground('#5D262C');
      hr.setFontColor('#F9F7F2');
      sheet.setFrozenRows(1);
      sheet.setColumnWidth(1, 155);
      sheet.setColumnWidth(2, 120);
      sheet.setColumnWidth(3, 180);
      sheet.setColumnWidth(4, 220);
      sheet.setColumnWidth(5, 200);
      sheet.setColumnWidth(6, 200);
      sheet.setColumnWidth(7, 80);
      sheet.setColumnWidth(8, 160);
    }

    sheet.appendRow([
      new Date(),
      name,
      relation,
      caption,
      email || '—',
      filename,
      fileUrl ? '=HYPERLINK("' + fileUrl + '","🖼️ Voir")' : '',
      fileId
    ]);

  } catch (err) {
    Logger.log('⚠️ Erreur Sheet : ' + err.toString());
  }
}

// ── EMAIL NOTIFICATION ORGANISATEUR ───────────────────

function sendOwnerNotification_(name, relation, caption, filename, fileUrl, previewUrl, photoBlob) {
  try {
    const subject = '📸 Nouvelle photo souvenir — ' + name + (relation ? ' (' + relation + ')' : '');

    const htmlBody = `
<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F2EDE5;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F2EDE5;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:1px solid #e0d8ce;">

  <tr><td style="background:#5D262C;text-align:center;padding:28px 24px;">
    <p style="margin:0 0 4px;font-family:sans-serif;font-size:9px;letter-spacing:.3em;text-transform:uppercase;color:rgba(249,247,242,.5);">Livre Photos Souvenirs</p>
    <h1 style="margin:0;font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#F9F7F2;">${esc_(COUPLE)}</h1>
  </td></tr>

  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 16px;font-family:sans-serif;font-size:9px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:#5D262C;">📸 Nouvelle photo reçue</p>

    <table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr><td style="padding:5px 0;font-family:sans-serif;font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:#888;width:90px;">Prénom</td>
          <td style="padding:5px 0;font-family:Georgia,serif;font-size:14px;color:#2d1214;">${esc_(name)}</td></tr>
      ${relation ? `<tr><td style="padding:5px 0;font-family:sans-serif;font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:#888;">Relation</td>
          <td style="padding:5px 0;font-family:sans-serif;font-size:12px;color:#5a3a3a;">${esc_(relation)}</td></tr>` : ''}
      ${caption ? `<tr><td style="padding:5px 0;font-family:sans-serif;font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:#888;vertical-align:top;">Légende</td>
          <td style="padding:5px 0;font-family:Georgia,serif;font-size:13px;font-style:italic;color:#5D262C;">"${esc_(caption)}"</td></tr>` : ''}
      <tr><td style="padding:5px 0;font-family:sans-serif;font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:#888;">Fichier</td>
          <td style="padding:5px 0;font-family:sans-serif;font-size:11px;color:#888;">${esc_(filename)}</td></tr>
    </table>

    <!-- Aperçu image depuis Drive -->
    <div style="margin:0 0 20px;text-align:center;">
      <img src="${previewUrl}" alt="Photo de ${esc_(name)}"
           style="max-width:100%;max-height:300px;border-radius:3px;border:1px solid #e0d8ce;" />
    </div>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <a href="${fileUrl}" style="display:inline-block;background:#5D262C;color:#F9F7F2;padding:11px 22px;text-decoration:none;font-family:sans-serif;font-size:9px;letter-spacing:.2em;text-transform:uppercase;border-radius:2px;">
          Voir dans Google Drive →
        </a>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="background:#2d1214;text-align:center;padding:14px;">
    <p style="margin:0;font-family:sans-serif;font-size:9px;letter-spacing:.12em;color:rgba(249,247,242,.3);">${esc_(COUPLE)} · 23 · 10 · 2026 · Notification automatique</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;

    MailApp.sendEmail({
      to:          OWNER_EMAIL,
      subject:     subject,
      htmlBody:    htmlBody,
      attachments: [photoBlob.setName(filename)],
      name:        'Livre Photos — ' + COUPLE
    });

  } catch (err) {
    Logger.log('⚠️ Erreur notification proprio : ' + err.toString());
  }
}

// ── EMAIL INVITÉ (avec photo en pièce jointe) ──────────

function sendPhotoToGuest_(name, email, caption, filename, photoBlob, previewUrl) {
  try {
    const firstName = name.split(' ')[0];
    const subject   = '📸 Votre photo souvenir — ' + COUPLE;

    const htmlBody = `
<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F2EDE5;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F2EDE5;padding:40px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:1px solid #e0d8ce;">

  <!-- HEADER -->
  <tr><td style="background:#5D262C;text-align:center;padding:36px 24px;">
    <p style="margin:0 0 6px;font-family:sans-serif;font-size:9px;letter-spacing:.3em;text-transform:uppercase;color:rgba(249,247,242,.5);">Mariage</p>
    <h1 style="margin:0 0 4px;font-family:Georgia,serif;font-size:24px;font-weight:normal;color:#F9F7F2;letter-spacing:.05em;">${esc_(COUPLE)}</h1>
    <p style="margin:0;font-family:sans-serif;font-size:9px;letter-spacing:.22em;text-transform:uppercase;color:rgba(249,247,242,.45);">${esc_(WEDDING_DATE)}</p>
  </td></tr>

  <!-- CORPS -->
  <tr><td style="padding:36px 32px;text-align:center;">
    <p style="margin:0 0 6px;font-family:sans-serif;font-size:9px;letter-spacing:.28em;text-transform:uppercase;color:#9a7c7e;">Votre souvenir</p>
    <h2 style="margin:0 0 20px;font-family:Georgia,serif;font-size:22px;font-weight:normal;font-style:italic;color:#5D262C;">
      Merci, ${esc_(firstName)}&nbsp;!
    </h2>

    <p style="margin:0 0 24px;font-family:Georgia,serif;font-size:14px;color:#5a3a3a;line-height:1.8;">
      Votre photo souvenir est bien arrivée.<br>
      Elle fait désormais partie de notre album digital.
    </p>

    <!-- Aperçu de la photo -->
    <div style="margin:0 0 24px;">
      <img src="${previewUrl}" alt="Votre photo souvenir"
           style="max-width:100%;max-height:320px;border-radius:3px;border:1px solid #e0d8ce;" />
    </div>

    ${caption ? `<p style="margin:0 0 24px;font-family:Georgia,serif;font-size:14px;font-style:italic;color:#9a7c7e;line-height:1.7;">"${esc_(caption)}"</p>` : ''}

    <!-- Séparateur -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="height:1px;background:rgba(93,38,44,.1);"></td>
        <td style="width:22px;text-align:center;font-size:9px;color:rgba(93,38,44,.3);padding:0 6px;">✦</td>
        <td style="height:1px;background:rgba(93,38,44,.1);"></td>
      </tr>
    </table>

    <p style="margin:0;font-family:Georgia,serif;font-size:18px;font-style:italic;color:#5D262C;">
      À très bientôt,<br>
      <span style="font-size:14px;">${esc_(COUPLE)}</span>
    </p>
  </td></tr>

  <p style="margin:8px 32px 0;font-family:sans-serif;font-size:10px;color:#9a7c7e;text-align:center;padding-bottom:20px;">
    📎 Votre photo est également en pièce jointe de cet email.
  </p>

  <!-- FOOTER -->
  <tr><td style="background:#2d1214;text-align:center;padding:16px;">
    <p style="margin:0;font-family:sans-serif;font-size:9px;letter-spacing:.12em;color:rgba(249,247,242,.3);">${esc_(COUPLE)} · 23 · 10 · 2026</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;

    MailApp.sendEmail({
      to:          email,
      subject:     subject,
      htmlBody:    htmlBody,
      attachments: [photoBlob.setName(filename)],  // photo en pièce jointe
      name:        COUPLE + ' 📸'
    });

    Logger.log('✅ Photo envoyée à ' + email);

  } catch (err) {
    Logger.log('⚠️ Erreur email invité : ' + err.toString());
  }
}

// ── UTILITAIRES ─────────────────────────────────────────

function getOrCreateFolder_(name) {
  const it = DriveApp.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  Logger.log('📁 Création dossier Drive : ' + name);
  return DriveApp.createFolder(name);
}

function sanitize_(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 120);
}

function esc_(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── TEST / DIAGNOSTIC ───────────────────────────────────

function doGet() {
  const folder = getOrCreateFolder_(DRIVE_FOLDER_NAME);
  let count = 0;
  const files = folder.getFiles();
  while (files.hasNext()) { files.next(); count++; }

  return ContentService
    .createTextOutput(
      '✅ Livre Photos Souvenirs — Script opérationnel\n' +
      'Dossier Drive : ' + DRIVE_FOLDER_NAME + '\n' +
      'Photos reçues : ' + count + '\n' +
      'Sheet configuré : ' + (SHEET_ID ? 'Oui' : 'Non')
    )
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * ══════════════════════════════════════════════════════════
 *  FONCTION DE TEST — À exécuter UNE FOIS avant le mariage
 * ══════════════════════════════════════════════════════════
 *  1. Ouvrez ce script sur script.google.com
 *  2. Sélectionnez "testSetup" dans le menu déroulant
 *  3. Cliquez ▶ Exécuter → Acceptez TOUTES les permissions
 *  4. Vérifiez les logs (Affichage → Journaux d'exécution)
 *
 *  Cette fonction :
 *  ✅ Crée le dossier Drive si nécessaire
 *  ✅ Envoie un email de test à OWNER_EMAIL
 *  ✅ Vérifie que tout est bien autorisé
 */
function testSetup() {
  Logger.log('══════════════════════════════════════════');
  Logger.log('   TEST CONFIGURATION — Livre Photos');
  Logger.log('══════════════════════════════════════════');

  // 1. Test Drive
  try {
    const folder = getOrCreateFolder_(DRIVE_FOLDER_NAME);
    const count  = folder.getFiles();
    let n = 0; while (count.hasNext()) { count.next(); n++; }
    Logger.log('✅ Drive OK — Dossier : "' + DRIVE_FOLDER_NAME + '" (' + n + ' photo(s))');
  } catch (e) {
    Logger.log('❌ Drive ERREUR : ' + e.toString());
  }

  // 2. Test Sheet (si configuré)
  if (SHEET_ID && SHEET_ID.trim() !== '') {
    try {
      const ss = SpreadsheetApp.openById(SHEET_ID);
      Logger.log('✅ Sheet OK — "' + ss.getName() + '"');
    } catch (e) {
      Logger.log('❌ Sheet ERREUR : ' + e.toString());
    }
  } else {
    Logger.log('ℹ️  Sheet non configuré (SHEET_ID vide) — OK');
  }

  // 3. Test email (envoie un vrai email de test)
  try {
    MailApp.sendEmail({
      to:       OWNER_EMAIL,
      subject:  '✅ Test Livre Photos — Configuration OK',
      htmlBody: `
        <div style="font-family:Georgia,serif;max-width:480px;padding:24px;background:#F9F7F2;border:1px solid #e0d8ce;">
          <h2 style="color:#5D262C;font-weight:normal;">✅ Livre Photos opérationnel</h2>
          <p>Bonjour Soufiane,</p>
          <p>Votre script <strong>Livre Photos Souvenirs</strong> est correctement configuré.</p>
          <ul>
            <li>📁 Dossier Drive : <em>${DRIVE_FOLDER_NAME}</em></li>
            <li>📧 Email notifications : <em>${OWNER_EMAIL}</em></li>
            <li>💍 Mariage : <em>${COUPLE} — ${WEDDING_DATE}</em></li>
          </ul>
          <p style="color:#888;font-size:12px;">Cet email confirme que les permissions Drive et Mail sont correctement accordées.</p>
        </div>`,
      name: 'Livre Photos — Test'
    });
    Logger.log('✅ Email OK — Test envoyé à ' + OWNER_EMAIL);
  } catch (e) {
    Logger.log('❌ Email ERREUR : ' + e.toString());
  }

  Logger.log('══════════════════════════════════════════');
  Logger.log('   Si tout est ✅ : redéployez le script');
  Logger.log('   Déployer → Gérer les déploiements →');
  Logger.log('   Modifier → Nouvelle version → Déployer');
  Logger.log('══════════════════════════════════════════');
}

/**
 * Exécutez cette fonction après le mariage pour lister toutes les photos.
 * Résultat visible dans : Affichage → Journaux d'exécution
 */
function listerToutesLesPhotos() {
  const folder = getOrCreateFolder_(DRIVE_FOLDER_NAME);
  const files  = folder.getFiles();
  let total = 0;
  Logger.log('══════════════════════════════════════════');
  Logger.log('   LIVRE PHOTOS — Album du mariage');
  Logger.log('══════════════════════════════════════════');
  while (files.hasNext()) {
    const f = files.next();
    total++;
    Logger.log(total + '. ' + f.getName() + ' | ' + (f.getSize()/1024).toFixed(0) + ' Ko | ' + f.getUrl());
  }
  Logger.log('──────────────────────────────────────────');
  Logger.log('Total : ' + total + ' photo(s)');
  Logger.log('══════════════════════════════════════════');
}
