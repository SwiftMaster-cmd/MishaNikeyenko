// assistantService.js
import { ref, get, child, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { addDebugMessage } from "./debugOverlay.js";

/**
 * Retrieve and return the last 20 messages from chatHistory/{uid}.
 * @param {string} uid
 * @returns {Promise<Array<{ role: string, content: string, timestamp: number }>>}
 */
export async function getLast20Messages(uid) {
  try {
    const snapshot = await get(child(ref(null, ''), `chatHistory/${uid}`));
    const data = snapshot.exists() ? snapshot.val() : {};
    const allMsgs = Object.entries(data).map(([id, msg]) => ({
      role: msg.role === "bot" ? "assistant" : msg.role,
      content: msg.content,
      timestamp: msg.timestamp || 0
    }));
    return allMsgs.sort((a, b) => a.timestamp - b.timestamp).slice(-20);
  } catch (err) {
    addDebugMessage("Error in getLast20Messages: " + err.message);
    return [];
  }
}

/**
 * Send a chat completion request to GPT and return the assistant’s reply text.
 * @param {Array<{ role: string, content: string, timestamp?: number }>} fullContext
 * @returns {Promise<string>}
 */
export async function sendGPTReply(fullContext) {
  try {
    const response = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: fullContext,
        model: "gpt-4o",
        temperature: 0.8
      })
    });
    const data = await response.json();
    return data.choices?.[0]?.message?.content || "[No reply]";
  } catch (err) {
    addDebugMessage("GPT reply error: " + err.message);
    return "[No reply]";
  }
}

/**
 * If total message count is a multiple of 20, generate a summary and push it to memory/{uid}.
 * @param {string} uid
 * @param {Array<{ role: string, content: string, timestamp: number }>} last20ForSummary
 * @param {number} allCount
 */
export async function maybeSummarize(uid, last20ForSummary, allCount) {
  if (allCount > 0 && allCount % 20 === 0) {
    const convoText = last20ForSummary
      .map(m => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`)
      .join("\n");

    try {
      const summaryRes = await fetch("/.netlify/functions/chatgpt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: `You are a concise summarizer. Summarize the following conversation block into one paragraph:`
            },
            { role: "user", content: convoText }
          ],
          model: "gpt-4o",
          temperature: 0.5
        })
      });
      const summaryJson = await summaryRes.json();
      const summary = summaryJson.choices?.[0]?.message?.content || "[No summary]";
      const nodeRef = ref(null, `memory/${uid}`);
      await push(nodeRef, {
        summary,
        timestamp: Date.now()
      });
      addDebugMessage("20-message summary saved to memory");
    } catch (err) {
      addDebugMessage("Summary generation failed: " + err.message);
    }
  }
}