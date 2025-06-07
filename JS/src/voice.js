// 🔹 voice.js – Voice input (speech-to-text) & output (text-to-speech)

let recognition;
let isRecognizing = false;

export function initVoiceInput(micButton, inputField) {
  if (!('webkitSpeechRecognition' in window)) {
    console.warn("Speech recognition not supported in this browser.");
    micButton.style.display = "none";
    return;
  }

  recognition = new webkitSpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  micButton.addEventListener("click", () => {
    if (isRecognizing) {
      recognition.stop();
      micButton.textContent = "🎤";
      isRecognizing = false;
    } else {
      recognition.start();
      micButton.textContent = "🛑 Stop";
      isRecognizing = true;
    }
  });

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript.trim();
    inputField.value = transcript;
    micButton.textContent = "🎤";
    isRecognizing = false;
  };

  recognition.onerror = (e) => {
    console.error("Speech recognition error:", e);
    micButton.textContent = "🎤";
    isRecognizing = false;
  };

  recognition.onend = () => {
    micButton.textContent = "🎤";
    isRecognizing = false;
  };
}

export function speakText(text, lang = "en-US", pitch = 1, rate = 1, volume = 1) {
  if (!('speechSynthesis' in window)) {
    console.warn("Speech synthesis not supported in this browser.");
    return;
  }

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.pitch = pitch;
  utter.rate = rate;
  utter.volume = volume;

  // Ensure voices are loaded (especially important on iOS)
  const voicesLoaded = () =>
    new Promise((resolve) => {
      const voices = speechSynthesis.getVoices();
      if (voices.length) return resolve();
      speechSynthesis.onvoiceschanged = () => resolve();
    });

  voicesLoaded().then(() => {
    speechSynthesis.cancel(); // clear any existing
    speechSynthesis.speak(utter);
  });
}