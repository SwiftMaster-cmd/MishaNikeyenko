// 🔹 voice.js – voice input and output (v2v ready)

let voices = [];

// Load available voices for speech output
function loadVoices() {
  voices = speechSynthesis.getVoices();
  if (!voices.length) {
    speechSynthesis.onvoiceschanged = () => {
      voices = speechSynthesis.getVoices();
    };
  }
}
loadVoices();

// ✅ Voice Output: Speaks text aloud
export function speakText(text) {
  if (!('speechSynthesis' in window)) {
    console.warn("SpeechSynthesis not supported.");
    return;
  }

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US";
  utter.pitch = 1;
  utter.rate = 1;

  if (voices.length) {
    const preferred = voices.find(v => v.lang === "en-US" && v.name.includes("Google"))
                  || voices.find(v => v.lang === "en-US");
    if (preferred) utter.voice = preferred;
  }

  speechSynthesis.cancel(); // Stop any previous speech
  speechSynthesis.speak(utter);
}

// ✅ Voice Input: Converts speech to text, inserts into field, submits
export function initVoiceInput({ micButtonId = "mic-button", inputFieldId = "user-input", submitOnResult = true }) {
  const micButton = document.getElementById(micButtonId);
  const inputField = document.getElementById(inputFieldId);

  if (!('webkitSpeechRecognition' in window)) {
    console.warn("SpeechRecognition not supported.");
    if (micButton) micButton.disabled = true;
    return;
  }

  const recognition = new webkitSpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = false;

  micButton?.addEventListener("click", () => {
    recognition.start();
    micButton.textContent = "🎤 Listening...";
  });

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    if (inputField) inputField.value = transcript;
    micButton.textContent = "🎤";
    if (submitOnResult) {
      inputField.form?.requestSubmit(); // auto-submit if configured
    }
  };

  recognition.onerror = () => {
    micButton.textContent = "🎤";
  };

  recognition.onend = () => {
    micButton.textContent = "🎤";
  };
}