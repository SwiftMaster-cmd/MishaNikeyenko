const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

// 👇 Split API key into parts (just obfuscation, NOT security)
const keyPart1 = "sk-proj-";               // First 8 chars
const keyPart2 = "F8x1C4wqqVn4qQEIkwaw9RPlCgbaX4RfDCP1130KbFeBLwFBa7AUVKnmieOqRQ3Pk_HW542fT3BlbkFJ7V7X1UkzaXr3LOZFQoUdU6ta3IGzUQcansaxCQjYimYEA_9fhh2zdvnYlSL1WvJ5-2VyzgJ7gA";
const apiKey = keyPart1 + keyPart2;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt) return;

  // Show user input
  const userLine = document.createElement("div");
  userLine.textContent = `🧑 You: ${prompt}`;
  log.appendChild(userLine);

  // Placeholder
  const gptLine = document.createElement("div");
  gptLine.textContent = `🤖 GPT: ...thinking...`;
  log.appendChild(gptLine);
  input.value = "";

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!res.ok) {
      const error = await res.text();
      gptLine.textContent = `❌ Server error: ${error}`;
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