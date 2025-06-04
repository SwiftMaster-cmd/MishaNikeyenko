const apiKey = "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"; // hardcoded key

const sendBtn = document.getElementById("send-btn");
const promptBox = document.getElementById("prompt");
const responseBox = document.getElementById("response");

sendBtn.onclick = async () => {
  const prompt = promptBox.value.trim();
  if (!prompt) return;

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

  const data = await res.json();
  responseBox.textContent =
    data?.choices?.[0]?.message?.content || "No response.";
};