// naturalCommands.js
// Centralizes all natural-language command patterns and handlers

import { webSearchBrave } from "./search.js";
import {
  getAssistantReply,
  saveMessageToChat
} from "./backgpt.js";
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

// Try each pattern in order. If one matches, run its handler and return true.
export async function tryNatural(prompt, ctx) {
  const lower = prompt.toLowerCase().trim();
  for (const { match, handler } of patterns) {
    if (match(lower, prompt)) {
      await handler(prompt, ctx);
      return true;
    }
  }
  return false;
}

const patterns = [
  {
    // "/note ..." or "note ..."
    match: (lower) => /^\/?note\s+/.test(lower),
    handler: async (prompt, { uid, chatRef }) => {
      await handleStaticCommand(`/note ${prompt.replace(/^\/?note\s+/i, "")}`, chatRef, uid);
    }
  },
  {
    // "/reminder ..." or "reminder ..."
    match: (lower) => /^\/?reminder\s+/.test(lower),
    handler: async (prompt, { uid, chatRef }) => {
      await handleStaticCommand(`/reminder ${prompt.replace(/^\/?reminder\s+/i, "")}`, chatRef, uid);
    }
  },
  {
    // "/calendar ..." or "calendar ..."
    match: (lower) => /^\/?calendar\s+/.test(lower),
    handler: async (prompt, { uid, chatRef }) => {
      await handleStaticCommand(`/calendar ${prompt.replace(/^\/?calendar\s+/i, "")}`, chatRef, uid);
    }
  },
  {
    // "/log ..." or "log ..."
    match: (lower) => /^\/?log\s+/.test(lower),
    handler: async (prompt, { uid, chatRef }) => {
      await handleStaticCommand(`/log ${prompt.replace(/^\/?log\s+/i, "")}`, chatRef, uid);
    }
  },
  {
    // "/summary" or "summarize"
    match: (lower) => lower === "/summary" || lower.startsWith("summarize"),
    handler: async (_, { uid, chatRef }) => {
      await handleStaticCommand("/summary", chatRef, uid);
    }
  },
  {
    // "/clearchat" or "clear chat"
    match: (lower) => lower === "/clearchat" || lower === "clear chat",
    handler: async (_, { uid, chatRef }) => {
      await handleStaticCommand("/clearchat", chatRef, uid);
    }
  },
  {
    // "/time" or "what time"
    match: (lower) => lower === "/time" || lower.includes("what time"),
    handler: async (_, { uid, chatRef }) => {
      await handleStaticCommand("/time", chatRef, uid);
    }
  },
  {
    // "/date" or "what date"
    match: (lower) => lower === "/date" || lower.includes("what date"),
    handler: async (_, { uid, chatRef }) => {
      await handleStaticCommand("/date", chatRef, uid);
    }
  },
  {
    // "/uid" or "what is my uid"
    match: (lower) => lower === "/uid" || lower.includes("what is my uid"),
    handler: async (_, { uid, chatRef }) => {
      await handleStaticCommand("/uid", chatRef, uid);
    }
  },
  {
    // "/search ..." or "search for ..." or "search ..."
    match: (lower) => /^(\/?search)( for)?\s+/.test(lower),
    handler: async (prompt, { uid, chatRef, state }) => {
      const term = prompt.replace(/^(\/?search)( for)?\s+/i, "").trim();
      if (!term) {
        await saveMessageToChat("assistant", "❌ Search query empty.", uid);
        return;
      }
      const { results } = await webSearchBrave(term, { uid, count: 5 });
      const summary = await getAssistantReply([
        { role: "system", content: "Summarize these results in one paragraph:" },
        { role: "user", content: JSON.stringify(results) }
      ]);
      await saveMessageToChat("user", prompt, uid);
      await saveMessageToChat("assistant", summary, uid);
      state.lastSearchData = { term, results };
    }
  },
  {
    // "/searchresults", "show results", "show search results"
    match: (lower) => lower === "/searchresults" ||
                      lower === "show results" ||
                      lower === "show search results",
    handler: async (_, { uid, chatRef, state }) => {
      const data = state.lastSearchData;
      if (!data || !data.term) {
        await saveMessageToChat("assistant", "❌ No previous search found.", uid);
        return;
      }
      let html = `<div class="search-results"><div class="results-title">
        Results for "${data.term}"
      </div><ul>`;
      for (const r of data.results) {
        html += `<li>
          <a href="${r.url}" target="_blank">${r.title}</a>
          ${r.snippet ? `<div class="snippet">${r.snippet}</div>` : ""}
          <div class="result-url">${r.url}</div>
        </li>`;
      }
      html += `</ul></div>`;
      await saveMessageToChat("assistant", html, uid);
    }
  },
  {
    // "/savesummary", "save that", "save summary", "save that summary"
    match: (lower) => lower === "/savesummary" ||
                      lower === "save that" ||
                      lower === "save summary" ||
                      lower === "save that summary",
    handler: async (_, { uid }) => {
      const ok = await saveLastSummaryToMemory(uid);
      const msg = ok ? "✅ Last summary saved." : "❌ Nothing to save.";
      await saveMessageToChat("assistant", msg, uid);
    }
  },
  {
    // "/learn about X" or "learn about X"
    match: (lower) => /^\/?learn about\s+/.test(lower),
    handler: async (prompt, { uid, chatRef }) => {
      const topic = prompt.replace(/^\/?learn about\s+/i, "").trim();
      if (!topic) {
        await saveMessageToChat("assistant", "❌ No topic provided.", uid);
        return;
      }
      await saveMessageToChat("user", prompt, uid);
      const summary = await learnAboutTopic(topic, uid);
      await saveMessageToChat(
        "assistant",
        `📚 Learned about "${topic}":\n\n${summary}`,
        uid
      );
    }
  },
  {
    // "/pastsearches" or "past searches" or "show past searches"
    match: (lower) => lower === "/pastsearches" ||
                      lower === "past searches" ||
                      lower === "show past searches",
    handler: async (_, { uid }) => {
      const history = await getPastSearches(uid);
      if (!history.length) {
        await saveMessageToChat("assistant", "No past learned topics found.", uid);
        return;
      }
      const lines = history
        .map(i => `• **${i.topic}** (${new Date(i.timestamp).toLocaleDateString()})`)
        .join("\n");
      await saveMessageToChat("assistant", `📂 Recent learned topics:\n${lines}`, uid);
    }
  },
  {
    // list commands
    match: (lower) => lower === "list commands" || lower === "show commands",
    handler: async (_, { uid, chatRef }) => {
      await handleStaticCommand("/commands", chatRef, uid);
    }
  },
  {
    // list notes
    match: (lower) => lower === "list notes" || lower === "show notes",
    handler: async (_, { chatRef }) => {
      await listNotes(chatRef);
    }
  },
  {
    // list reminders
    match: (lower) => lower === "list reminders" || lower === "show reminders",
    handler: async (_, { chatRef }) => {
      await listReminders(chatRef);
    }
  },
  {
    // list events
    match: (lower) => lower === "list events" || lower === "show events",
    handler: async (_, { chatRef }) => {
      await listEvents(chatRef);
    }
  }
];