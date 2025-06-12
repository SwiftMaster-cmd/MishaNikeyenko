// naturalCommands.js
// Centralizes all natural-language command patterns, auto-learns fixes,
// logs failures, and re-routes corrected commands.

// ────────────────────────────────────────────────────────────────────────────
// Imports
// ────────────────────────────────────────────────────────────────────────────
import { ref, push, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { db } from "../config/firebaseConfig.js";          // ← path reflects /config/ move

import { webSearchBrave } from "./search.js";
import { getAssistantReply, saveMessageToChat } from "./backgpt.js";
import {
  learnAboutTopic,
  saveLastSummaryToMemory,
  getPastSearches
} from "./learnManager.js";
import {
  handleStaticCommand,
  listNotes,
  listReminders,
  listEvents
} from "./commandHandlers.js";

// ────────────────────────────────────────────────────────────────────────────
// tryNatural -- master dispatcher
// Returns true if a pattern handled the prompt, else false.
// Adds self-healing: applies saved fixes; logs failures.
// ────────────────────────────────────────────────────────────────────────────
export async function tryNatural(prompt, ctx) {
  const lower = prompt.toLowerCase().trim();

  // 1️⃣  Check for user-defined fixes first
  try {
    const fixSnap = await get(ref(db, `commandFixes/${ctx.uid}`));
    if (fixSnap.exists()) {
      const fixes = Object.values(fixSnap.val());
      const found = fixes.find(f => f.bad.toLowerCase() === lower);
      if (found) {
        // Prevent infinite recursion
        if (found.fixed.toLowerCase().trim() !== lower) {
          return await tryNatural(found.fixed, ctx);
        }
      }
    }
  } catch (_) {/* swallow */}

  // 2️⃣  Standard pattern loop
  for (const { match, handler } of patterns) {
    if (match(lower, prompt)) {
      await handler(prompt, ctx);
      return true;
    }
  }

  // 3️⃣  Log failure for future teaching
  try {
    await push(ref(db, `commandFailures/${ctx.uid}`), {
      prompt,
      timestamp: Date.now()
    });
  } catch (_) {/* swallow */}

  return false;
}

// ────────────────────────────────────────────────────────────────────────────
// Pattern registry
// ────────────────────────────────────────────────────────────────────────────
const patterns = [
  // --- Core CRUD commands ---------------------------------------------------
  {
    match: (l) => /^\/?note\s+|^remember this/.test(l),
    handler: async (p, { uid, chatRef }) =>
      handleStaticCommand(`/note ${p.replace(/^\/?note\s+/i, "")}`, chatRef, uid)
  },
  {
    match: (l) => /^\/?reminder\s+|remind me\b/.test(l),
    handler: async (p, { uid, chatRef }) =>
      handleStaticCommand(`/reminder ${p.replace(/^\/?reminder\s+/i, "")}`, chatRef, uid)
  },
  {
    match: (l) => /^\/?calendar\s+|add to calendar|schedule\b/.test(l),
    handler: async (p, { uid, chatRef }) =>
      handleStaticCommand(`/calendar ${p.replace(/^\/?calendar\s+/i, "")}`, chatRef, uid)
  },
  {
    match: (l) => /^\/?log\s+|log this\b/.test(l),
    handler: async (p, { uid, chatRef }) =>
      handleStaticCommand(`/log ${p.replace(/^\/?log\s+/i, "")}`, chatRef, uid)
  },

  // --- System utilities -----------------------------------------------------
  {
    match: (l) => ["/summary", "summarize", "give summary"].includes(l),
    handler: async (_, { uid, chatRef }) => handleStaticCommand("/summary", chatRef, uid)
  },
  {
    match: (l) => ["/clearchat", "clear chat", "reset chat"].includes(l),
    handler: async (_, { uid, chatRef }) => handleStaticCommand("/clearchat", chatRef, uid)
  },
  {
    match: (l) => ["/time", "what time is it", "current time"].includes(l),
    handler: async (_, { uid, chatRef }) => handleStaticCommand("/time", chatRef, uid)
  },
  {
    match: (l) => ["/date", "what date is it", "today's date"].includes(l),
    handler: async (_, { uid, chatRef }) => handleStaticCommand("/date", chatRef, uid)
  },
  {
    match: (l) => ["/uid", "what is my uid", "show my id"].includes(l),
    handler: async (_, { uid, chatRef }) => handleStaticCommand("/uid", chatRef, uid)
  },

  // --- Web search -----------------------------------------------------------
  {
    match: (l) => /^(\/?search)( for)?\s+/.test(l) || l.startsWith("find "),
    handler: async (p, { uid, chatRef, state }) => {
      const term = p.replace(/^(\/?search)( for)?\s+/i, "").replace(/^find\s+/i, "").trim();
      if (!term) return saveMessageToChat("assistant", "❌ Search query empty.", uid);

      const { results } = await webSearchBrave(term, { uid, count: 5 });
      const summary = await getAssistantReply([
        { role: "system", content: "Summarize these results in one paragraph:" },
        { role: "user", content: JSON.stringify(results) }
      ]);

      await saveMessageToChat("user", p, uid);
      await saveMessageToChat("assistant", summary, uid);
      state.lastSearchData = { term, results };
    }
  },
  {
    match: (l) => ["/searchresults", "show results", "show search results",
                   "what were the search results"].includes(l),
    handler: async (_, { uid, state }) => {
      const d = state.lastSearchData;
      if (!d) return saveMessageToChat("assistant", "❌ No previous search found.", uid);

      const html = [
        `<div class="search-results"><div class="results-title">Results for "${d.term}"</div><ul>`,
        ...d.results.map(r =>
          `<li><a href="${r.url}" target="_blank">${r.title}</a>` +
          (r.snippet ? `<div class="snippet">${r.snippet}</div>` : "") +
          `<div class="result-url">${r.url}</div></li>`
        ),
        "</ul></div>"
      ].join("");
      await saveMessageToChat("assistant", html, uid);
    }
  },

  // --- Memory helpers -------------------------------------------------------
  {
    match: (l) => ["/savesummary", "save that", "save summary", "save that summary"].includes(l),
    handler: async (_, { uid }) => {
      const ok = await saveLastSummaryToMemory(uid);
      await saveMessageToChat("assistant", ok ? "✅ Last summary saved." : "❌ Nothing to save.", uid);
    }
  },
  {
    match: (l) => /^\/?learn about\s+|tell me about\b/.test(l),
    handler: async (p, { uid }) => {
      const topic = p.replace(/^\/?learn about\s+/i, "").replace(/^tell me about\s+/i, "").trim();
      if (!topic) return saveMessageToChat("assistant", "❌ No topic provided.", uid);

      await saveMessageToChat("user", p, uid);
      const summary = await learnAboutTopic(topic, uid);
      await saveMessageToChat("assistant", `📚 Learned about "${topic}":\n\n${summary}`, uid);
    }
  },
  {
    match: (l) => ["past searches", "show past searches", "/pastsearches"].includes(l),
    handler: async (_, { uid }) => {
      const h = await getPastSearches(uid);
      if (!h.length) return saveMessageToChat("assistant", "No past learned topics found.", uid);

      const lines = h.map(i =>
        `• **${i.topic}** (${new Date(i.timestamp).toLocaleDateString()})`
      ).join("\n");
      await saveMessageToChat("assistant", `📂 Recent learned topics:\n${lines}`, uid);
    }
  },

  // --- Lists & overviews ----------------------------------------------------
  { match: (l) => ["list commands", "show commands", "/commands"].includes(l),
    handler: async (_, { uid, chatRef }) => handleStaticCommand("/commands", chatRef, uid) },
  { match: (l) => ["list notes", "show notes", "my notes"].includes(l),
    handler: async (_, { chatRef }) => listNotes(chatRef) },
  { match: (l) => ["list reminders", "show reminders", "my reminders"].includes(l),
    handler: async (_, { chatRef }) => listReminders(chatRef) },
  { match: (l) => ["list events", "show events", "my calendar"].includes(l),
    handler: async (_, { chatRef }) => listEvents(chatRef) },

  // --- Fun & utility extras -------------------------------------------------
  { match: (l) => ["tell me a joke", "/joke", "make me laugh"].includes(l),
    handler: async (_, { uid }) => {
      const r = await getAssistantReply([
        { role: "system", content: "You are a funny assistant." },
        { role: "user", content: "Tell me a good short joke." }
      ]);
      await saveMessageToChat("assistant", r, uid);
    }},

  { match: (l) => ["motivate me", "/motivate", "i need motivation"].includes(l),
    handler: async (_, { uid }) => {
      const r = await getAssistantReply([
        { role: "system", content: "You are an encouraging coach." },
        { role: "user", content: "Give me a quick motivation boost." }
      ]);
      await saveMessageToChat("assistant", r, uid);
    }},

  { match: (l) => ["clear memory", "/clearmemory", "delete memory"].includes(l),
    handler: async (_, { uid }) =>
      saveMessageToChat("assistant", "⚠️ Memory clearing is not enabled yet.", uid)
  },

  { match: (l) => ["what's new", "latest news", "/news"].includes(l),
    handler: async (_, { uid }) => {
      const { results } = await webSearchBrave("latest news", { uid, count: 5 });
      const r = await getAssistantReply([
        { role: "system", content: "Summarize the latest news headlines in 3 sentences." },
        { role: "user", content: JSON.stringify(results) }
      ]);
      await saveMessageToChat("assistant", r, uid);
    }},

  { match: (l) => ["weather", "what's the weather", "/weather"].includes(l),
    handler: async (_, { uid }) =>
      saveMessageToChat("assistant", "☁️ Weather feature not yet available.", uid)
  },

  { match: (l) => ["daily summary", "today's summary", "/daily"].includes(l),
    handler: async (_, { uid, chatRef }) =>
      handleStaticCommand("/daily", chatRef, uid)
  },

  // --- Teach command fix ----------------------------------------------------
  {
    match: (l) => /^fix command\s+[""](.+?)[""]\s+should\s+run\s+[""](.+?)[""]$/.test(l),
    handler: async (p, { uid }) => {
      const [, bad, fixed] = p.match(/^fix command\s+[""](.+?)[""]\s+should\s+run\s+[""](.+?)[""]$/);
      if (!bad || !fixed) return;
      await push(ref(db, `commandFixes/${uid}`), { bad, fixed, timestamp: Date.now() });
      await saveMessageToChat("assistant",
        `✅ Got it. Next time "${bad}" will trigger "${fixed}".`, uid);
    }
  }
];