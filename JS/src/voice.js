// 🔹 voice.js – Handles both voice input and output

let recognition;
let isRecognizing = false;

// ========== 1. Voice Input ==========
export function initVoiceInput(inputFieldId, micButtonId) {
  const inputField = document.getElementById(inputFieldId);
  const micButton = document.getElementById(micButtonId);

  if (!('webkitSpeechRecognition' in window) || !inputField || !micButton) return;

  recognition = new webkitSpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  micButton.addEventListener("click", () => {
    if (isRecognizing) {
      recognition.stop();
      return;
    }
    recognition.start();
  });

  recognition.onstart = () => {
    isRecognizing = true;
    micButton.textContent = "🎤 Listening...";
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    inputField.value = transcript;
  };

  recognition.onerror = () => {
    micButton.textContent = "🎤";
  };

  recognition.onend = () => {
    isRecognizing = false;
    micButton.textContent = "🎤";
  };
}

// ========== 2. Voice Output ==========
export function speakText(text) {
  if (!('speechSynthesis' in window)) return;

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US";
  utter.pitch = 1;
  utter.rate = 1;
  speechSynthesis.cancel(); // clear queue
  speechSynthesis.speak(utter);
}