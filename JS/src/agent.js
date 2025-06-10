// admin.js
// Encapsulates GPT function‐calling "agent" logic for your chat app

import OpenAI from "openai";
import { webSearchBrave } from "./search.js";
import {
  saveMessageToChat,
  fetchLast20Messages,
  getAllContext,
  summarizeChatIfNeeded
} from "./backgpt.js";
import { buildSystemPrompt } from "./memoryManager.js";
import {
  saveNoteToFirebase,
  saveReminderToFirebase,
  saveEventToFirebase
} from "./commandHandlers.js";
import {
  learnAboutTopic,
  saveLastSummaryToMemory,
  getPastSearches
} from "./learnManager.js";

// Initialize OpenAI client
const openai = new OpenAI();

// 1) Define the functions you’ll expose to GPT
export const functions = [
  {
    name: "search_web",
    description: "Perform a web search and return top results",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        maxResults: { type: "integer", description: "How many results to fetch (default 5)" }
      },
      required: ["query"]
    }
  },
  {
    name: "create_note",
    description: "Save a user note",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "Note text" }
      },
      required: ["content"]
    }
  },
  {
    name: "create_reminder",
    description: "Set a reminder",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "Reminder text" }
      },
      required: ["content"]
    }
  },
  {
    name: "create_event",
    description: "Create a calendar event",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "Event description" },
        date:    { type: "string", description: "YYYY-MM-DD" },
        time:    { type: "string", description: "HH:MM" }
      },
      required: ["content"]
    }
  },
  {
    name: "learn_topic",
    description: "Search, summarize, and save facts about a topic",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Topic to learn about" }
      },
      required: ["topic"]
    }
  },
  {
    name: "save_summary",
    description: "Save the last generated summary to memory",
    parameters: { type: "object", properties: {}, required: [] }
  },
  {
    name: "get_past_searches",
    description: "Return a list of recent learned topics",
    parameters: { type: "object", properties: {}, required: [] }
  }
];

// 2) Main entrypoint -- call this from chat.js
export async