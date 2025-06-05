const fetch = require("node-fetch");

const { initializeApp } = require("firebase/app");
const { getDatabase, ref, get, set, push } = require("firebase/database");

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

exports.handler = async (event) => {
  try {
    const {
      messages,
      prompt,
      uid,
      action,
      noteContent,
      model = "gpt-4o",
      temperature = 0.4
    } = JSON.parse(event.body || "{}");

    // --- Add note ---
    if (action === "addNote" && uid && noteContent) {
      const today = new Date().toISOString().split('T')[0];
      const todayRef = ref(db, `notes/${uid}/${today}`);
      await push(todayRef, { content: noteContent, timestamp: Date.now() });
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    // --- Update memory field (from model-issued command) ---
    if (action === "updateMemory" && uid && noteContent) {
      const memoryRef = ref(db, `memory/${uid}`);
      const snap = await get(memoryRef);
      const existing = snap.exists() ? snap.val() : {};
      const data = JSON.parse(noteContent); // expected JSON format
      const updated = { ...existing, ...data };
      await set(memoryRef, updated);
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    // --- Validate prompt ---
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