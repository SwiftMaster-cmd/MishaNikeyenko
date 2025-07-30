function createProgressHeader(parentEl, DASHBOARD_URL) {
  const old = document.getElementById('gpProgressHeader');
  if (old) old.remove();

  const header = document.createElement("header");
  header.id = "gpProgressHeader";

  // Minimal inline styles; rely on your CSS for the rest
  header.style.position = "sticky";
  header.style.top = "0";
  header.style.zIndex = "99";
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  header.style.width = "100%";
  header.style.background = "rgba(247,249,251, 0.88)";
  header.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)";
  header.style.backdropFilter = "blur(7px)";
  header.style.borderBottom = "1px solid #e0e3ea";
  header.style.padding = "18px 24px";
  header.style.marginBottom = "0";

  // Back button as flex item
  const backBtn = document.createElement("a");
  backBtn.id = "backToDash";
  backBtn.href = DASHBOARD_URL;
  backBtn.textContent = "← Dashboard";
  backBtn.style.fontWeight = "bold";
  backBtn.style.fontSize = "18px";
  backBtn.style.color = "#248";
  backBtn.style.opacity = "0.8";
  backBtn.style.textDecoration = "none";
  backBtn.style.cursor = "pointer";

  backBtn.addEventListener("mouseenter", () => backBtn.style.opacity = "1");
  backBtn.addEventListener("mouseleave", () => backBtn.style.opacity = "0.8");

  backBtn.addEventListener("click", e => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    window.location.href = DASHBOARD_URL;
  });

  // Center container for label + progress
  const centerDiv = document.createElement("div");
  centerDiv.style.display = "flex";
  centerDiv.style.flexDirection = "column";
  centerDiv.style.alignItems = "center";
  centerDiv.style.minWidth = "320px";
  centerDiv.style.maxWidth = "420px";
  centerDiv.style.width = "100%";

  const label = document.createElement("label");
  label.htmlFor = "progressBar";
  label.style.fontWeight = "bold";
  label.style.fontSize = "15px";
  label.style.color = "#222";
  label.style.letterSpacing = ".01em";
  label.style.marginBottom = "4px";
  label.textContent = "Progress: ";

  const progressLabel = document.createElement("span");
  progressLabel.id = "progressLabel";
  progressLabel.style.fontVariantNumeric = "tabular-nums";
  progressLabel.textContent = "0%";

  label.appendChild(progressLabel);

  const progressBar = document.createElement("progress");
  progressBar.id = "progressBar";
  progressBar.value = 0;
  progressBar.max = 100;
  progressBar.style.width = "100%";
  progressBar.style.height = "20px";
  progressBar.style.borderRadius = "10px";
  progressBar.style.boxShadow = "0 1px 8px #b3c3ee28";
  progressBar.style.marginBottom = "0";
  progressBar.style.background = "#f6f8fb";

  centerDiv.appendChild(label);
  centerDiv.appendChild(progressBar);

  header.appendChild(backBtn);
  header.appendChild(centerDiv);

  parentEl.prepend(header);
}