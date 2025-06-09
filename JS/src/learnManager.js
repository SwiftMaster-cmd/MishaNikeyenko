// 🔹 learnManager.js -- Handles topic learning, past searches, and memory writing
import { ref, set, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { db } from "./firebaseConfig.js";
import { getAssistantReply } from "./backgpt.js";
import { webSearchBrave } from "./search.js";

// 🔹 Internal cache (volatile)
let lastSummary = "";
let lastTerm = "";

// 🔹 Save to memory node
export async function saveLearnedTopic(uid, topic, summary) {
  const path = `memory/${uid}/learnedTopics/${topic}`;
  const topicRef = ref(db, path);
  await set(topicRef, {
    summary,
    timestamp: Date.now()
  });
}

// 🔹 Setters and getters for last summary and term
export function setLastSummary(term, summary) {
  lastTerm = term;
  lastSummary = summary;
}

export function getLastSummary() {
  return { lastTerm, lastSummary };
}

// 🔹 Add to search history stored in Firebase
export async function addToSearchHistory(uid, topic, summary) {
  const path = `memory/${uid}/searchHistory`;
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
  await saveLearnedTopic(uid, topic, summary);

  // Update volatile cache and persistent history
  setLastSummary(topic, summary);
  await addToSearchHistory(uid, topic, summary);

  return summary;
}

// 🔹 Save last summary manually to memory
export async function saveLastSummaryToMemory(uid) {
  if (!lastSummary || !lastTerm) return false;
  await saveLearnedTopic(uid, lastTerm, lastSummary);
  return true;
}

// 🔹 Get past search history (last 10) from Firebase
export async function getPastSearches(uid) {
  const path = `memory/${uid}/searchHistory`;
  const historyRef = ref(db, path);
  const snap = await get(historyRef);
  return snap.exists() ? snap.val().slice(-10).reverse() : [];
}