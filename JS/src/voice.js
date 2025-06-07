// 🔹 voice.js – handles voice input (speech to text) and voice output (text to speech)

let recognition = null;

// 🔊 Speak assistant reply aloud
export function speakText(text) {
  if (!window.speechSynthesis) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US";
  utter.pitch = 1;
  utter.rate = 1;
  utter.volume = 1;
  utter.onstart = () => {
    window.debug("Voice: Speaking started");
  };
  utter.onend = () => {
    window.debug("Voice: Speaking ended");
  };
  speechSynthesis.speak(utter);
}

// 🎤 Start voice input from mic
export function startVoiceRecognition(callback) {
  if (!('webkitSpeechRecognition' in window)) {
    alert("Speech Recognition not supported on this browser.");
    return;
  }

  if (recognition) recognition.stop(); // stop any ongoing recognition

  recognition = new webkitSpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  recognition.onstart = () => {
    window.debug("Voice: Listening...");
    const micBtn = document.getElementById("mic-button");
    if (micBtn) micBtn.textContent = "🎙️ Listening...";
  };

  recognition.onerror = (event) => {
    window.debug("Voice Error:", event.error);
    const micBtn = document.getElementById("mic-button");
    if (micBtn) micBtn.textContent = "🎤";
  };

  recognition.onend = () => {
    const micBtn = document.getElementById("mic-button");
    if (micBtn) micBtn.textContent = "🎤";
    window.debug("Voice: Listening stopped");
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const micBtn = document.getElementById("mic-button");
    if (micBtn) micBtn.textContent = "🎤";
    window.debug("Voice: Heard →", transcript);
    if (typeof callback === "function") callback(transcript);
  };

  recognition.start();
}

// 🔘 Bind button once DOM is ready
window.addEventListener("DOMContentLoaded", () => {
  const micBtn = document.getElementById("mic-button");
  const input = document.getElementById("user-input");
  if (micBtn && input) {
    micBtn.addEventListener("click", () => {
      startVoiceRecognition((text) => {
        input.value = text;
      });
    });
  }
});