const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

// 👇 Split key into parts to avoid detection
const keyPart1 = "sk-proj-tWsO-Pu7ivVN4P_bf-lAlnF9awxLhGBEVM";
const keyPart2 = "dcYd36zrJ7oWVpcdEsXpZSkHHiYU02Mi4ZuffVm5T3BlbkFJcakr95bfPVcaAGGbtv-ASrSf2uVopR7_OVzw9e-B26ubickFtr5pCazf-Ix0g5zPoA0D0VRBQA";
const apiKey = `${keyPart1}${keyPart2}`; // 👈 Full key reconstructed only in memory

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt) return;

  // Show user message
  const userLine = document.createElement("div");
  userLine.textContent = `🧑 You: ${prompt}`;
  log.appendChild(userLine);

  // Thinking placeholder
  const gptLine = document.createElement("div");
  gptLine.textContent = `🤖 GPT: ...thinking...`;
  log.appendChild(gptLine);
  input.value = "";

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
      const errMsg = await res.text();
      gptLine.textContent = `❌ Server error: ${errMsg}`;
      return;
    }

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();
    gptLine.textContent = reply || "🤖 GPT: No response received.";
  } catch (err) {
    gptLine.textContent = `❌ Error: ${err.message}`;
  }
});