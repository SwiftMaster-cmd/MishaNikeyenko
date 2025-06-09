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
  const lower = prompt.toLowerCase();
  for (const { match, handler } of patterns) {
    if (match(lower, prompt)) {
      await handler(prompt, ctx);
      return true;
    }
  }
  return false;
}

// Define each natural-language command
const patterns = [
  {
    // "search for apples" or "search apples"
    match: (lower) => /^search( for)? /.test(lower),
    handler: async (prompt, { uid, chatRef, state }) => {
      const term = prompt.replace(/^search( for)? /i, "").trim();
      if (!term) {
        await saveMessageToChat("assistant", "❌ Search query empty.", uid);
        return;
      }
      const { results } = await webSearchBrave(term, { uid, count: 5 });
      const summary = await getAssistantReply([
        { role: "system", content: "Summarize these results in one paragraph:" },
        { role: "user", content: JSON.stringify(results, null, 2) }
      ]);
      await saveMessageToChat("user", prompt, uid);
      await saveMessageToChat("assistant", summary, uid);
      state.lastSearchData = { term, results };
    }
  },
  {
    // "show results" or "/searchresults"
    match: (lower) => lower === "show results" || lower === "show search results",
    handler: async (_, { uid, chatRef, state }) => {
      const data = state.lastSearchData;
      if (!data.term) {
        await saveMessageToChat("assistant", "❌ No previous search found.", uid);
      } else {
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
    }
  },
  {
    // "learn about cats"
    match: (lower) => lower.startsWith("learn about "),
    handler: async (prompt, { uid, chatRef }) => {
      const topic = prompt.slice(12).trim();
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
    // "save that summary" or "save that"
    match: (lower) =>
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
    // "list commands" or "show commands"
    match: (lower) => /^(list|show) commands?$/.test(lower),
    handler: async (_, { uid, chatRef }) => {
      await handleStaticCommand("/commands", chatRef, uid);
    }
  },
  {
    // "list notes"
    match: (lower) => /^(list|show) notes$/.test(lower),
    handler: async (_, { chatRef }) => {
      await listNotes(chatRef);
    }
  },
  {
    // "list reminders"
    match: (lower) => /^(list|show) reminders$/.test(lower),
    handler: async (_, { chatRef }) => {
      await listReminders(chatRef);
    }
  },
  {
    // "list events"
    match: (lower) => /^(list|show) events$/.test(lower),
    handler: async (_, { chatRef }) => {
      await listEvents(chatRef);
    }
  },
  {
    // "past searches"
    match: (lower) => lower === "past searches" || lower === "show past searches",
    handler: async (_, { uid }) => {
      const history = await getPastSearches(uid);
      if (!history.length) {
        await saveMessageToChat("assistant", "No past learned topics found.", uid);
      } else {
        const lines = history
          .map(i => `• **${i.topic}** (${new Date(i.timestamp).toLocaleDateString()})`)
          .join("\n");
        await saveMessageToChat("assistant", `📂 Recent learned topics:\n${lines}`, uid);
      }
    }
  }
];