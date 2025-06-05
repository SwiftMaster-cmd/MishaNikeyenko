const fetch = require("node-fetch");

// --- FIREBASE SETUP ---
const { initializeApp } = require("firebase/app");
const { getDatabase, ref, get, push } = require("firebase/database");

const firebaseConfig = {
  apiKey: "AIzaSyCf_se10RUg8i_u8pdowHlQvrFViJ4jh_Q",
  authDomain: "mishanikeyenko.firebaseapp.com",
  databaseURL: "https://mishanikeyenko-default-rtdb.firebaseio.com",
  projectId: "mishanikeyenko",
  storageBucket: "mishanikeyenko.firebasestorage.app",
  messagingSenderId: "1089190937368",
  appId: "1:1089190937368:web:959c825fc596a5e3ae946d"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- NOTE HELPERS ---
async function getNotes(uid) {
  if (!uid) return {};
  const baseRef = ref(db, `notes/${uid}`);
  const snapshot = await get(baseRef);
  if (!snapshot.exists()) return {};
  return snapshot.val() || {};
}

async function addNote(uid, content) {
  if (!content || !uid) return false;
  const today = new Date().toISOString().split('T')[0];
  const todayRef = ref(db, `notes/${uid}/${today}`);
  await push(todayRef, { content, timestamp: Date.now() });
  return true;
}

// --- MAIN HANDLER ---
exports.handler = async (event) => {
  try {
    const {
      messages,
      prompt,
      uid,             // User ID for notes actions
      action,          // "readNotes" or "addNote"
      noteContent,     // For addNote
      model = "gpt-4o",
      temperature = 0.7
    } = JSON.parse(event.body || "{}");

    // --- NOTES API: read or write ---
    if (action === "readNotes" && uid) {
      const notes = await getNotes(uid);
      return {
        statusCode: 200,
        body: JSON.stringify({ notes })
      };
    }

    if (action === "addNote" && uid && noteContent) {
      const ok = await addNote(uid, noteContent);
      return {
        statusCode: 200,
        body: JSON.stringify({ ok })
      };
    }

    // --- GPT-4o CHAT COMPLETION ---
    if (!messages && !prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing input (messages or prompt)" })
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing OpenAI API key" })
      };
    }

    const payload = messages
      ? { model, messages, temperature }
      : {
          model,
          messages: [{ role: "user", content: prompt }],
          temperature
        };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (data.error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: data.error.message })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};