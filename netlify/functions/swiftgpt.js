const fetch = require("node-fetch");
const { getAllContext } = require("../../js/src/backgpt.js");
const { buildSystemPrompt } = require("../../js/src/memoryManager.js");
const { trackedChat } = require("../../js/src/tokenTracker.js");

exports.handler = async (event) => {
  try {
    const { messages = [], uid, model = "gpt-4o", temperature = 0.7 } = JSON.parse(event.body || "{}");

    if (!uid || messages.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing UID or messages" })
      };
    }

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