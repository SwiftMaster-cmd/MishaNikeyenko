// netlify/functions-swift/swiftgpt.js

import { getAllContext } from "../../js/src/backgpt.js";
import { buildSystemPrompt } from "../../js/src/memoryManager.js";
import { trackedChat } from "../../js/src/tokenTracker.js";
import fetch from "node-fetch"; // node-fetch v3, ESM-compatible

export async function handler(event) {
  try {
    const { messages = [], uid, model = "gpt-4o", temperature = 0.7 } = JSON.parse(event.body || "{}");

    if (!uid || messages.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing UID or messages" })
      };
    }

    // Load context for the UID
    const ctx = await getAllContext(uid);
    const systemPrompt = buildSystemPrompt({
      memory: ctx.memory,
      todayLog: ctx.dayLog,
      notes: ctx.notes,
      calendar: ctx.calendar,
      reminders: ctx.reminders,
      calc: ctx.calc,
      date: new Date().toISOString().slice(0, 10)
    });

    // Final message list: system + last 5
    const finalMessages = [
      { role: "system", content: systemPrompt },
      ...messages.slice(-5)
    ];

    const apiResponse = await trackedChat("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: finalMessages,
        temperature
      })
    });

    return {
      statusCode: 200,
      body: JSON.stringify(apiResponse)
    };

  } catch (err) {
    console.error("SwiftGPT error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Unknown error" })
    };
  }
}