// 🔹 learnManager.js -- Secure topic learning with encrypted memory support
import { ref, set, get, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { db } from "../config/firebaseConfig.js";
import { getAssistantReply } from "./backgpt.js";
import { webSearchBrave } from "./search.js";
import { encryptContent } from "./encrypt.js";

// 🔹 Internal cache (volatile)
let lastSummary = "";
let lastTerm = "";

// 🔹 Save encrypted memory (learned topic)
export async function saveLearnedTopic(uid, topic, summary) {
  const id = push(ref(db)).key;
  const encrypted = await encryptContent(summary);
  const now = Date.now();

  const metadata = {
    type: "learnedTopic",
    topic,
    summary,
    category: "search",
    tags: ["search", "learn", topic.toLowerCase()],
    timestamp: now
  };

  await Promise.all([
    set(ref(db, `memoryBlob/${uid}/${id}`), encrypted),
    set(ref(db, `memorySummary/${uid}/${id}`), metadata)
  ]);
}

// 🔹 Setters and getters for last summary and term
export function setLastSummary(term, summary) {
  lastTerm = term;
  lastSummary = summary;
}

export function getLastSummary() {
  return { lastTerm, lastSummary };
}

// 🔹 Add to legacy search history (optional view)
export async function addToSearchHistory(uid, topic, summary) {
  const path = `legacySearchHistory/${uid}`;
  const historyRef = ref(db, path);
  const snap = await get(historyRef);
  let currentHistory = snap.exists() ? snap.val() : [];
  currentHistory.push({ topic, summary, timestamp: Date.now() });
  await set(historyRef, currentHistory);
}

// 🔹 Learn about a topic (auto search → summarize → store)
export async function learnAboutTopic(topic, uid) {
  const data = await webSearchBrave(topic, { uid, count: 5 });

  const summaryPrompt = [
    { role: "system", content: "Summarize the most important facts from this web search into a short paragraph." },
    { role: "user", content: JSON.stringify(data.results, null, 2) }
  ];

  const summary = await getAssistantReply(summaryPrompt);

  // Save to encrypted memory and legacy search history
  await saveLearnedTopic(uid, topic, summary);
  setLastSummary(topic, summary);
  await addToSearchHistory(uid, topic, summary);

  return summary;
}

// 🔹 Save last summary manually to encrypted memory
export async function saveLastSummaryToMemory(uid) {
  if (!lastSummary || !lastTerm) return false;
  await saveLearnedTopic(uid, lastTerm, lastSummary);
  return true;
}

// 🔹 Get past legacy search history (for display only)
export async function getPastSearches(uid) {
  const path = `legacySearchHistory/${uid}`;
  const historyRef = ref(db, path);
  const snap = await get(historyRef);
  return snap.exists() ? snap.val().slice(-10).reverse() : [];
}