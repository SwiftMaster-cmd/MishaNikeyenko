:root {
  --clr-bg: #161026;
  --clr-card: #1e1e2e;
  --clr-border: #2e2e3e;
  --clr-text: #f8fafd;
  --clr-muted: #a1a6b9;
  --clr-user: #7e3af2;
  --clr-bot: #363c66;
  --radius: 18px;
  --padding: 1rem;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  height: 100%;
  font-family: 'Inter', sans-serif;
  background: var(--clr-bg);
  color: var(--clr-text);
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.chat-container {
  display: flex;
  flex-direction: column;
  height: 100dvh; /* Full dynamic height on iOS */
  background: var(--clr-card);
}

/* Scrollable area for messages */
#chat-log {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  scroll-behavior: smooth;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  -webkit-overflow-scrolling: touch;
}

/* Chat message styles */
.msg {
  max-width: 75%;
  padding: 0.8rem 1rem;
  border-radius: var(--radius);
  word-wrap: break-word;
  line-height: 1.5;
  background: #2c2c3c;
  animation: fadeIn 0.2s ease-in-out;
}

.user-msg {
  align-self: flex-end;
  background: var(--clr-user);
  color: white;
}

.bot-msg {
  align-self: flex-start;
  background: var(--clr-bot);
  color: white;
}

/* Input area */
#chat-form {
  display: flex;
  gap: 0.75rem;
  padding: 1rem;
  padding-bottom: env(safe-area-inset-bottom); /* For iOS nav bar */
  background: var(--clr-card);
  border-top: 1px solid var(--clr-border);
}

#user-input {
  flex: 1;
  padding: 0.75rem 1rem;
  font-size: 1rem;
  border-radius: 12px;
  border: 1px solid var(--clr-border);
  background: #2c2c3c;
  color: var(--clr-text);
  outline: none;
}

#user-input::placeholder {
  color: var(--clr-muted);
}

button[type="submit"] {
  padding: 0.75rem 1.2rem;
  background: var(--clr-user);
  color: white;
  border: none;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

button[type="submit"]:hover {
  background: #5b2ee5;
}

/* Entry animation */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to   { opacity: 1; transform: translateY(0); }
}