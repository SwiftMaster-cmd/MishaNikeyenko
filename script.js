// Steps (some are bundled)
const steps = [
  {
    fields: ["store", "associate"],
    title: "Store & Associate",
    render: (data) => `
      <input type="text" id="store" placeholder="Store # (ex: Walmart #3273)" value="${data.store || ""}" required>
      <input type="text" id="associate" placeholder="Associate name(s)" value="${data.associate || ""}" required>
    `
  },
  {
    fields: ["serviceType", "purchase"],
    title: "Service & Purchase",
    render: (data) => `
      <select id="serviceType" required>
        <option value="">Service Type</option>
        <option${data.serviceType === "Verizon" ? " selected" : ""}>Verizon</option>
        <option${data.serviceType === "AT&T" ? " selected" : ""}>AT&T</option>
        <option${data.serviceType === "T-Mobile" ? " selected" : ""}>T-Mobile</option>
        <option${data.serviceType === "Prepaid" ? " selected" : ""}>Prepaid</option>
        <option${data.serviceType === "Accessories" ? " selected" : ""}>Accessories</option>
        <option${data.serviceType === "Other" ? " selected" : ""}>Other</option>
      </select>
      <input type="text" id="purchase" placeholder="What did you buy? (optional)" value="${data.purchase || ""}">
    `
  },
  {
    fields: ["rating", "comment"],
    title: "Rate & Review",
    render: (data) => `
      <div class="stars" id="stars">
        ${[1,2,3,4,5].map(n => 
          `<span class="star${data.rating >= n ? " selected" : ""}" data-star="${n}">&#9733;</span>`
        ).join("")}
      </div>
      <textarea id="comment" placeholder="How did we do?" required>${data.comment||""}</textarea>
    `
  },
  {
    fields: ["recommend"],
    title: "Would you recommend us?",
    render: (data) => `
      <select id="recommend" required>
        <option value="">Select...</option>
        <option${data.recommend==="Yes"?" selected":""}>Yes</option>
        <option${data.recommend==="No"?" selected":""}>No</option>
      </select>
    `
  },
  {
    fields: ["refName", "refPhone"],
    title: "Referral (Optional)",
    render: (data) => `
      <input type="text" id="refName" placeholder="Referral Name" value="${data.refName||""}">
      <input type="text" id="refPhone" placeholder="Referral Phone" value="${data.refPhone||""}">
    `
  },
  {
    fields: ["yourName", "yourContact"],
    title: "Your Info (Optional)",
    render: (data) => `
      <input type="text" id="yourName" placeholder="Your Name" value="${data.yourName||""}">
      <input type="text" id="yourContact" placeholder="Your Contact (phone/email)" value="${data.yourContact||""}">
    `
  },
  {
    fields: ["confirm"],
    title: "Confirm & Submit",
    render: (data) => `
      <div>
        <h4 style="text-align:center;margin:8px 0 16px;">Review Summary</h4>
        <ul style="list-style:none;padding:0;">
          <li><b>Store:</b> ${data.store}</li>
          <li><b>Associate:</b> ${data.associate}</li>
          <li><b>Service:</b> ${data.serviceType}</li>
          <li><b>Bought:</b> ${data.purchase||'-'}</li>
          <li><b>Rating:</b> ${'★'.repeat(data.rating||0)}</li>
          <li><b>Review:</b> ${data.comment}</li>
          <li><b>Recommend:</b> ${data.recommend}</li>
          <li><b>Referral:</b> ${data.refName?data.refName+' / '+data.refPhone:'-'}</li>
          <li><b>Your Info:</b> ${data.yourName||'-'} ${data.yourContact?'/ '+data.yourContact:''}</li>
        </ul>
        <p style="font-size:1.04em;color:#444;text-align:center;">
          All correct? Submit below!
        </p>
      </div>
    `
  }
];

let step = 0;
let data = {};

function renderProgress() {
  const percent = Math.round(100 * step / (steps.length-1));
  document.getElementById("progressBar").innerHTML = `
    <div id="progressFill" style="width:${percent}%;"></div>
  `;
}

function renderStepIndicator() {
  const prev = steps[step-1]?.title || "";
  const curr = steps[step].title;
  const next = steps[step+1]?.title || "";
  document.getElementById("stepIndicator").innerHTML = `
    <span>${prev ? "← " + prev : ""}</span>
    <span class="current">${curr}</span>
    <span>${next ? next + " →" : ""}</span>
  `;
}

function renderStep() {
  renderProgress();
  renderStepIndicator();
  const s = steps[step];
  const el = document.getElementById("stepper");
  el.innerHTML = `
    <form class="step" autocomplete="off">
      <div class="step-title">${s.title}</div>
      ${typeof s.render === 'function' ? s.render(data) : s.render}
      <div class="button-row">
        ${step > 0
          ? `<button id="prevBtn" type="button">Back</button>` : '<div></div>'}
        <button id="nextBtn" type="submit">${step === steps.length - 1 ? "Submit" : "Next"}</button>
      </div>
    </form>
  `;

  // Star logic
  if (s.fields.includes("rating")) {
    document.querySelectorAll(".star").forEach(star => {
      star.addEventListener('mouseenter', () => highlightStars(star.dataset.star));
      star.addEventListener('mouseleave', () => highlightStars(data.rating||0));
      star.addEventListener('click', () => { data.rating = +star.dataset.star; highlightStars(data.rating); });
      star.addEventListener('touchstart', e => { data.rating = +star.dataset.star; highlightStars(data.rating); e.preventDefault(); });
    });
    highlightStars(data.rating||0);
  }

  // Button events
  if (step > 0) document.getElementById("prevBtn").onclick = prevStep;
  document.querySelector(".step").onsubmit = function(e) {
    e.preventDefault();
    nextStep();
  }
}

function highlightStars(n) {
  document.querySelectorAll('.star').forEach(star => {
    const starNum = +star.dataset.star;
    star.classList.toggle('selected', starNum <= n);
  });
}

function nextStep() {
  // Save data for this step
  for (const field of steps[step].fields) {
    if (field === "confirm") continue;
    const input = document.getElementById(field);
    if (!input) continue;
    if (input.type === "checkbox") data[field] = input.checked;
    else data[field] = input.value.trim();
  }
  // Rating star field (handled above)
  // Validation
  if (
    (steps[step].fields.includes("store") && !data.store) ||
    (steps[step].fields.includes("associate") && !data.associate) ||
    (steps[step].fields.includes("serviceType") && !data.serviceType) ||
    (steps[step].fields.includes("rating") && !data.rating) ||
    (steps[step].fields.includes("comment") && !data.comment) ||
    (steps[step].fields.includes("recommend") && !data.recommend)
  ) {
    alert("Please fill out all required fields before continuing.");
    return;
  }
  if (step === steps.length - 1) {
    // Submit: Do your AJAX/fetch here
    document.getElementById("stepper").innerHTML = `
      <div class="step" style="text-align:center;">
        <div style="font-size:2.5em;margin:24px 0 12px 0;">✅</div>
        <div class="step-title" style="margin-bottom:12px;">Thank you!</div>
        <div style="color:#333; font-size:1.08em;">
          Your review and referral (if any) have been sent.<br><br>
          <b>We appreciate your feedback.</b>
        </div>
      </div>
    `;
    document.getElementById("progressBar").innerHTML = `<div id="progressFill" style="width:100%;"></div>`;
    document.getElementById("stepIndicator").innerHTML = "";
    return;
  }
  step++; renderStep();
}
function prevStep() { step--; renderStep(); }
window.onload = function() {
  document.getElementById("progressBar").innerHTML = `<div id="progressFill" style="width:0"></div>`;
  renderStep();
};