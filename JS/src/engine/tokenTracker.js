// tokenTracker.js

/**
 * Wrapper around fetch to automatically log OpenAI token usage.
 * 
 * Usage:
 *   import { trackedChat } from './tokenTracker.js';
 *   const { choices, usage } = await trackedChat('/.netlify/functions/chatgpt', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ messages, model, temperature })
 *   });
 *   // your existing code uses choices[0].message.content
 */

export async function trackedChat(url, options) {
  const res = await fetch(url, options);
  const data = await res.json();
  
  if (data.usage && window.debugLog) {
    const { prompt_tokens, completion_tokens, total_tokens } = data.usage;
    window.debugLog(
      `[USAGE] prompt:${prompt_tokens}` +
      ` completion:${completion_tokens}` +
      ` total:${total_tokens}`
    );
  }
  
  return data;
}