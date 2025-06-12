// llmCore.js – LLM API wrapper via Netlify function

export async function callLLM({ model = "gpt-4o", messages = [], temperature = 0.7 }) {
  const payload = { model, messages, temperature };

  // Use correct Netlify endpoint
  const response = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("LLM API Error:", error);
    throw new Error("LLM request failed: " + error);
  }

  const data = await response.json();

  // OpenAI returns choices array; get the assistant's reply
  return data?.choices?.[0]?.message?.content?.trim() || "";
}