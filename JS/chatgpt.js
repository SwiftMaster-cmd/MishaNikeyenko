// chatgpt.js – front-end only (exposed key, not safe for production)
const apiKey = "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"; // exposed, for dev only

const sendBtn = document.getElementById("send-btn");
const promptBox = document.getElementById("prompt");
const responseBox = document.getElementById("response");

sendBtn.onclick = async () => {
  const prompt = promptBox.value.trim();
  if (!prompt) {
    responseBox.textContent = "❗ Please enter a prompt.";
    return;
  }

  responseBox.textContent = "⏳ Thinking...";

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!res.ok) {
      throw new Error(`Error ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();
    responseBox.textContent = reply || "⚠️ No response from AI.";
  } catch (err) {
    console.error("[ChatGPT Error]", err);
    responseBox.textContent = `❌ Failed: ${err.message}`;
  }
};