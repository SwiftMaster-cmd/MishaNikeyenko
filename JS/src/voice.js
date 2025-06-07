// 🔊 voice.js – Speech Recognition (Input) & Speech Synthesis (Output)

// ========== Speech Input ==========
let recognition;
let isListening = false;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript.trim();
    if (transcript) {
      const input = document.getElementById("user-input");
      input.value = transcript;
      input.form?.requestSubmit();
    }
  };

  recognition.onerror = (event) => {
    console.error("Speech Recognition Error:", event.error);
  };

  recognition.onend = () => {
    isListening = false;
    window.setStatusFeedback?.("info", "Stopped listening");
  };
}

// Start listening
export function startListening() {
  if (!recognition || isListening) return;
  recognition.start();
  isListening = true;
  window.setStatusFeedback?.("info", "Listening...");
}

// Stop listening
export function stopListening() {
  if (recognition && isListening) {
    recognition.stop();
  }
}

// ========== Speech Output ==========
export function speak(text) {
  if (!window.speechSynthesis || !text) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 1;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}