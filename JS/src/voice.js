// voice.js – handles speech-to-text and text-to-speech

// 🔹 Text-to-Speech (assistant replies)
export function speak(text) {
  if (!window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.pitch = 1;
  utterance.rate = 1;
  utterance.volume = 1;

  // Choose a consistent voice if available
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v => v.name.includes("Google") || v.lang === 'en-US');
  if (preferred) utterance.voice = preferred;

  window.speechSynthesis.speak(utterance);
}

// 🔹 Speech-to-Text (user input)
export function startListening() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Speech recognition not supported in this browser.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = function (event) {
    const transcript = event.results[0][0].transcript;
    const input = document.getElementById("user-input");
    input.value = transcript;
    input.focus();
    input.form.requestSubmit(); // auto-submit
  };

  recognition.onerror = function (event) {
    console.error("Speech recognition error:", event.error);
  };

  recognition.onend = function () {
    console.log("Speech recognition ended");
  };

  recognition.start();
}