const fetch = require("node-fetch");
const { initializeApp } = require("firebase/app");
const {
  getDatabase,
  ref,
  get,
  set,
  push
} = require("firebase/database");

// 🔐 Firebase Config
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
      data,
      model = "gpt-4o",
      temperature = 0.4
    } = JSON.parse(event.body || "{}");

    if (!uid) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing uid" }) };
    }

    // 🔧 Structured Firebase Writes (Notes, Logs, Reminders, Calendar, Memory)
    if (action && data) {
      const now = new Date();
      const today = now.toISOString().split('T')[0];

      if (action === "addNote") {
        const path = ref(db, `notes/${uid}/${today}`);
        await push(path, { ...data, timestamp: now.getTime() });
        return success("Note added.");
      }

      if (action === "addReminder") {
        const path = ref(db, `reminders/${uid}`);
        await push(path, { ...data, timestamp: now.getTime() });
        return success("Reminder added.");
      }

      if (action === "addCalendarEvent") {
        const date = data.date || today;
        const path = ref(db, `calendarEvents/${uid}/${date}`);
        await push(path, { ...data, timestamp: now.getTime() });
        return success("Calendar event added.");
      }

      if (action === "updateDayLog") {
        const date = data.date || today;
        const path = ref(db, `dayLog/${uid}/${date}`);
        const snap = await get(path);
        const existing = snap.exists() ? snap.val() : {};
        const merged = { ...existing, ...data };
        await set(path, merged);
        return success("Day log updated.");
      }

      if (action === "updateMemory") {
        const path = ref(db, `memory/${uid}`);
        const snap = await get(path);
        const existing = snap.exists() ? snap.val() : {};
        const updated = { ...existing, ...data };
        await set(path, updated);
        return success("Memory updated.");
      }
    }

    // 🔮 GPT Chat Call
    if (!messages && !prompt) {
      return error("Missing input (messages or prompt)");
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return error("Missing OpenAI API key");

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

    const dataRes = await response.json();
    if (dataRes.error) return error(dataRes.error.message);

    return {
      statusCode: 200,
      body: JSON.stringify(dataRes)
    };

  } catch (err) {
    return error(err.message);
  }
};

// 🔁 Helpers
function success(msg) {
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, message: msg })
  };
}

function error(msg) {
  return {
    statusCode: 500,
    body: JSON.stringify({ error: msg })
  };
}