const askBtn = document.getElementById("ask-btn");
const promptInput = document.getElementById("prompt");
const responseBox = document.getElementById("response");

const apiKey = "sk-YOUR_KEY_HERE"; // replace with your actual key

askBtn.onclick = async () => {
  const prompt = promptInput.value.trim();
  if (!prompt) return;

  responseBox.textContent = "Thinking...";

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      })
    });

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || "[No response]";
    responseBox.textContent = reply;
  } catch (err) {
    responseBox.textContent = `Error: ${err.message}`;
  }
};