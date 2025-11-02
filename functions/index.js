// v0.1 – 2025-11-02 – Cloud Function chooseGame (seul le brasseur peut changer currentGame)
const functions = require('firebase-functions/v2');
const admin = require('firebase-admin');
try { admin.initializeApp(); } catch {}

exports.chooseGame = functions.https.onCall(async (req) => {
  const { code, game } = req.data || {};
  const uid = req.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Auth requise.');
  }
  if (!code || !game) {
    throw new functions.https.HttpsError('invalid-argument', 'Paramètres manquants.');
  }

  const ref = admin.firestore().doc(`soirees/${String(code)}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Soirée introuvable.');
  }
  const data = snap.data();

  if (data.dealerUid && data.dealerUid !== uid) {
    throw new functions.https.HttpsError('permission-denied', 'Seul le brasseur peut choisir le jeu.');
  }
  if (!data.dealerUid) {
    throw new functions.https.HttpsError('failed-precondition', 'Brasseur non défini (dealerUid manquant).');
  }

  await ref.update({ currentGame: String(game) });
  return { ok: true };
});
