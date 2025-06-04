const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

// Merge key safely across lines
const keyPart1 = "sk-proj-7w0UXd24Z56LpABWJPKbKhXckUoUY7_41ud3W-uXMNSdAtg25FRvE1444c2W";
const keyPart2 = "c2yQbSbnDYZZaBHZPT3BlbkFJf7qDvhQ-7mAEo1q0lLh9PRuVO1Lw42kpqKmX7w2y1Xxqet-48jJhsnU9ETZtFw9e4b1XTmYA";
const apiKey = `${keyPart1}${keyPart2}`; // Clean merge

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt) return;

  const userLine = document.createElement("div");
  userLine.textContent = `🧑 You: ${prompt}`;
  log.appendChild(userLine);

  const gptLine = document.createElement("div");
  gptLine.textContent = `🤖 GPT: ...thinking...`;
  log.appendChild(gptLine);
  input.value = "";

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      gptLine.textContent = `❌ Server error: ${errorText}`;
      return;
    }

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    gptLine.textContent = reply
      ? `🤖 GPT: ${reply}`
      : `🤖 GPT: No response received.`;

  } catch (err) {
    gptLine.textContent = `❌ Error: ${err.message}`;
  }
});