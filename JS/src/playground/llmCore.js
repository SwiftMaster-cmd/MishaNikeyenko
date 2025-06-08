// llmCore.js – LLM API wrapper via Netlify function

export async function callLLM({ model = "gpt-4o", messages = [], temperature = 0.7 }) {
  const payload = {
    model,
    messages,
    temperature
  };

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
    throw new Error("LLM request failed.");
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}