// 🔹 learnManager.js -- Handles topic learning, past searches, and memory writing
import { ref, set, get, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { db } from "./firebaseConfig.js";
import { getAssistantReply } from "./backgpt.js";
import { webSearchBrave } from "./search.js";

// 🔹 Internal cache
let lastSummary = "";
let lastTerm = "";
let searchHistory = [];

// 🔹 Save to memory node
export async function saveLearnedTopic(uid, topic, summary) {
  const path = `memory/${uid}/learnedTopics/${topic}`;
  const topicRef = ref(db, path);
  await set(topicRef, {
    summary,
    timestamp: Date.now()
  });
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

  // Cache for /savesummary
  lastSummary = summary;
  lastTerm = topic;
  searchHistory.push({ topic, summary, timestamp: Date.now() });

  return summary;
}

// 🔹 Save last summary manually to memory
export async function saveLastSummaryToMemory(uid) {
  if (!lastSummary || !lastTerm) return false;
  await saveLearnedTopic(uid, lastTerm, lastSummary);
  return true;
}

// 🔹 Get past search history (last 10)
export function getPastSearches() {
  return searchHistory.slice(-10).reverse();
}