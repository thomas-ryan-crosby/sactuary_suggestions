const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();
const { FieldValue } = admin.firestore;
const suggestionsCol = db.collection('suggestions');

// --- Helper: doc snapshot to plain object ---
function docToObj(doc) {
  if (!doc.exists) return null;
  const data = doc.data();
  return {
    id: doc.id,
    name: data.name,
    address: data.address,
    suggestion: data.suggestion,
    is_private: data.is_private,
    promotions: data.promotions,
    board_response: data.board_response,
    created_at: data.created_at ? data.created_at.toDate().toISOString() : null,
    responded_at: data.responded_at ? data.responded_at.toDate().toISOString() : null,
  };
}

// --- Exported Functions ---

async function createSuggestion({ name, address, suggestion, is_private }) {
  const docRef = await suggestionsCol.add({
    name,
    address,
    suggestion,
    is_private: !!is_private,
    promotions: 0,
    board_response: null,
    created_at: FieldValue.serverTimestamp(),
    responded_at: null,
  });
  const snap = await docRef.get();
  return docToObj(snap);
}

async function getResidentSuggestions() {
  const snap = await suggestionsCol
    .orderBy('promotions', 'desc')
    .orderBy('created_at', 'desc')
    .get();
  return snap.docs.map(doc => {
    const obj = docToObj(doc);
    if (obj.is_private) {
      obj.name = 'Anonymous Resident';
      obj.address = '';
    }
    return obj;
  });
}

async function getAllSuggestions() {
  const snap = await suggestionsCol
    .orderBy('promotions', 'desc')
    .orderBy('created_at', 'desc')
    .get();
  return snap.docs.map(docToObj);
}

async function getSuggestionById(id) {
  const doc = await suggestionsCol.doc(id).get();
  return docToObj(doc);
}

async function promoteSuggestion(id, voterUid) {
  const suggestionRef = suggestionsCol.doc(id);
  const voteRef = suggestionRef.collection('promotion_log').doc(voterUid);

  try {
    await db.runTransaction(async (t) => {
      const voteSnap = await t.get(voteRef);
      if (voteSnap.exists) {
        throw new Error('ALREADY_VOTED');
      }
      t.create(voteRef, { created_at: FieldValue.serverTimestamp() });
      t.update(suggestionRef, { promotions: FieldValue.increment(1) });
    });
  } catch (err) {
    if (err.message === 'ALREADY_VOTED') {
      return { success: false, reason: 'already_voted' };
    }
    throw err;
  }

  const updated = await suggestionRef.get();
  return { success: true, promotions: updated.data().promotions };
}

async function respondToSuggestion(id, responseText) {
  const ref = suggestionsCol.doc(id);
  await ref.update({
    board_response: responseText,
    responded_at: FieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return docToObj(snap);
}

async function deleteSuggestion(id) {
  await db.recursiveDelete(suggestionsCol.doc(id));
  return { success: true };
}

module.exports = {
  createSuggestion,
  getResidentSuggestions,
  getAllSuggestions,
  getSuggestionById,
  promoteSuggestion,
  respondToSuggestion,
  deleteSuggestion,
};
