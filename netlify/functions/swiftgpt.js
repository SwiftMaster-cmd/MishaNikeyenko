// netlify/functions/swiftgpt.js

import { getAllContext } from "../../js/src/backgpt.js";
import { buildSystemPrompt } from "../../js/src/memoryManager.js";
import { trackedChat } from "../../js/src/tokenTracker.js";

export const handler = async (event) => {
  try {
    const { messages = [], uid, model = "gpt-4o", temperature = 0.7 } = JSON.parse(event.body || "{}");

    if (!uid || messages.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing UID or messages" })
      };
    }

    const context = await getAllContext(uid);
    const systemPrompt = buildSystemPrompt({
      memory: context.memory,
      todayLog: context.dayLog,
      notes: context.notes,
      calendar: context.calendar,
      reminders: context.reminders,
      calc: context.calc,
      date: new Date().toISOString().slice(0, 10)
    });

    const finalMessages = [
      { role: "system", content: systemPrompt },
      ...messages.slice(-5)
    ];

    const apiResponse = await trackedChat("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
};