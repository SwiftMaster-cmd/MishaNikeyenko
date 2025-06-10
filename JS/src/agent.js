// agent.js
import OpenAI from "openai";
import { webSearchBrave } from "./search.js";
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

const openai = new OpenAI();

// 1) Define the "functions" you’ll expose to GPT
export const functions = [
  {
    name: "search_web",
    description: "Perform a web search and return top results",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        maxResults: { type: "integer", description: "How many results to fetch" }
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
    description: "Save last summary to memory",
    parameters: { type: "object", properties: {}, required: [] }
  },
  {
    name: "get_past_searches",
    description: "Return a list of recent learned topics",
    parameters: { type: "object", properties: {}, required: [] }
  }
];

// 2) Core router
export async function processUserMessage({ messages, uid, state }) {
  // ask GPT with functions
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages,
    functions,
    function_call: "auto"
  });

  const msg = res.choices[0].message;
  // if GPT wants to call a function:
  if (msg.function_call) {
    const { name, arguments: argsJson } = msg.function_call;
    const args = JSON.parse(argsJson);
    let funcResult;

    switch (name) {
      case "search_web":
        funcResult = await webSearchBrave(args.query, { uid, count: args.maxResults ?? 5 });
        break;
      case "create_note":
        funcResult = await saveNoteToFirebase(args.content, uid);
        break;
      case "create_reminder":
        funcResult = await saveReminderToFirebase(args.content, uid);
        break;
      case "create_event":
        funcResult = await saveEventToFirebase(args.content, uid, args.date, args.time);
        break;
      case "learn_topic":
        funcResult = await learnAboutTopic(args.topic, uid);
        break;
      case "save_summary":
        funcResult = await saveLastSummaryToMemory(uid);
        break;
      case "get_past_searches":
        funcResult = await getPastSearches(uid);
        break;
      default:
        funcResult = { error: "Unknown function" };
    }

    // send function result back into GPT
    const followUp = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        ...messages,
        msg,
        { role: "function", name, content: JSON.stringify(funcResult) }
      ]
    });
    return followUp.choices[0].message.content;
  }

  // otherwise just return GPT’s normal reply
  return msg.content;
}