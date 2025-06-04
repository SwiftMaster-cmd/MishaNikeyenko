import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// Firebase Config (keep your config)
const firebaseConfig = {
  apiKey: "AIzaSyCf_se10RUg8i_u8pdowHlQvrFViJ4jh_Q",
  authDomain: "mishanikeyenko.firebaseapp.com",
  databaseURL: "https://mishanikeyenko-default-rtdb.firebaseio.com",
  projectId: "mishanikeyenko",
  storageBucket: "mishanikeyenko.firebasestorage.app",
  messagingSenderId: "1089190937368",
  appId: "1:1089190937368:web:959c825fc596a5e3ae946d",
  measurementId: "G-L6CC27129C"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const storage = getStorage(app);

const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");
const uploadBtn = document.getElementById("upload-btn");
const mediaInput = document.getElementById("media-input");

let chatRef = null;

// Append message with media handling
function appendMessage(role, content, mediaType) {
  const div = document.createElement("div");
  div.className = `chat-entry ${role === "user" ? "user" : "gpt"}`;

  if (mediaType === "image") {
    const img = document.createElement("img");
    img.src = content;
    img.style.maxWidth = "300px";
    img.style.borderRadius = "8px";
    div.appendChild(img);
  } else if (mediaType === "video") {
    const video = document.createElement("video");
    video.src = content;
    video.controls = true;
    video.style.maxWidth = "300px";
    video.style.borderRadius = "8px";
    div.appendChild(video);
  } else {
    div.textContent = content;
  }

  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

// Firebase anonymous sign-in and load history
signInAnonymously(auth);
onAuthStateChanged(auth, user => {
  if (!user) return;
  chatRef = ref(db, `chatHistory/${user.uid}`);
  onValue(chatRef, snap => {
    log.innerHTML = "";
    const data = snap.val() || {};
    Object.values(data).forEach(entry => {
      appendMessage(entry.role, entry.content, entry.mediaType || null);
    });
  });
});

// Send text prompt only (no history)
form.addEventListener("submit", async e => {
  e.preventDefault();
  if (!chatRef) return;

  const prompt = input.value.trim();
  if (!prompt) return;

  input.value = "";
  appendMessage("user", prompt);
  push(chatRef, { role: "user", content: prompt, timestamp: Date.now() });

  const thinking = document.createElement("div");
  thinking.textContent = "🤖 GPT: ...thinking...";
  thinking.className = "chat-entry gpt";
  log.appendChild(thinking);

  // Send only prompt text to ChatGPT API
  const messages = [
    { role: "system", content: "You are a helpful assistant that answers clearly and concisely." },
    { role: "user", content: prompt }
  ];

  try {
    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages })
    });

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || "No reply";
    thinking.textContent = reply;
    push(chatRef, { role: "assistant", content: reply, timestamp: Date.now() });
  } catch (err) {
    thinking.textContent = `❌ Error: ${err.message}`;
  }
});

// Upload button triggers hidden file input
uploadBtn.onclick = () => {
  mediaInput.click();
};

// Handle file uploads
mediaInput.addEventListener("change", async (e) => {
  const files = e.target.files;
  if (!files.length) return;

  for (const file of files) {
    const path = `chatMedia/${auth.currentUser.uid}/${Date.now()}_${file.name}`;
    const fileRef = storageRef(storage, path);

    try {
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);

      push(chatRef, {
        role: "user",
        content: url,
        mediaType: file.type.startsWith("image/") ? "image" : "video",
        timestamp: Date.now()
      });

      appendMessage("user", url, file.type.startsWith("image/") ? "image" : "video");
    } catch (err) {
      console.error("Upload failed:", err);
    }
  }

  e.target.value = "";
});