const steps = [
  {
    title: "What store did you visit?",
    field: "store",
    render: () =>
      `<input type="text" placeholder="Walmart #3273, etc." id="store" required>`
  },
  {
    title: "Who helped you?",
    field: "associate",
    render: () =>
      `<input type="text" placeholder="Associate name(s)" id="associate" required>`
  },
  {
    title: "What did we help you with?",
    field: "serviceType",
    render: () =>
      `<select id="serviceType" required>
        <option value="">Select...</option>
        <option>Verizon</option>
        <option>AT&T</option>
        <option>T-Mobile</option>
        <option>Prepaid</option>
        <option>Accessories</option>
        <option>Other</option>
      </select>`
  },
  {
    title: "What did you buy? (optional)",
    field: "purchase",
    render: () =>
      `<input type="text" placeholder="Phone, Tablet, SIM, etc." id="purchase">`
  },
  {
    title: "How would you rate us?",
    field: "rating",
    render: () =>
      `<div class="stars" id="stars">
        <span class="star" data-star="1">&#9733;</span>
        <span class="star" data-star="2">&#9733;</span>
        <span class="star" data-star="3">&#9733;</span>
        <span class="star" data-star="4">&#9733;</span>
        <span class="star" data-star="5">&#9733;</span>
      </div>`
  },
  {
    title: "Share your experience",
    field: "comment",
    render: () =>
      `<textarea placeholder="How did we do?" id="comment" required></textarea>`
  },
  {
    title: "Would you recommend us?",
    field: "recommend",
    render: () =>
      `<select id="recommend" required>
        <option value="">Select...</option>
        <option>Yes</option>
        <option>No</option>
      </select>`
  },
  {
    title: "Know someone who needs a new phone/service? (optional)",
    field: "referral",
    render: () =>
      `<input type="text" placeholder="Referral Name" id="refName">
       <input type="text" placeholder="Referral Phone" id="refPhone">`
  },
  {
    title: "Your name & contact (optional)",
    field: "yourInfo",
    render: () =>
      `<input type="text" placeholder="Your Name" id="yourName">
       <input type="text" placeholder="Your Contact (phone/email)" id="yourContact">`
  },
  {
    title: "Confirm & Submit",
    field: "confirm",
    render: (data) => {
      return `<div>
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
      </div>`;
    }
  }
];

let step = 0;
let data = {};

function renderStep() {
  const stepDef = steps[step];
  const el = document.getElementById("stepper");
  el.innerHTML = `<div class="step">
    <div class="step-title">${stepDef.title}</div>
    ${typeof stepDef.render === 'function'
        ? stepDef.render(data)
        : stepDef.render()}
    <div class="button-row">
      ${step > 0
        ? `<button id="prevBtn" type="button">Back</button>` : '<div></div>'}
      <button id="nextBtn" type="button">${step === steps.length - 1 ? "Submit" : "Next"}</button>
    </div>
  </div>`;

  if (stepDef.field === "rating") {
    const stars = document.querySelectorAll(".star");
    stars.forEach(star => {
      star.addEventListener('mouseenter', () => {
        highlightStars(star.dataset.star);
      });
      star.addEventListener('mouseleave', () => {
        highlightStars(data.rating || 0);
      });
      star.addEventListener('click', () => {
        data.rating = +star.dataset.star;
        highlightStars(data.rating);
      });
    });
    highlightStars(data.rating || 0);
  }

  document.getElementById("nextBtn").onclick = nextStep;
  if (step > 0) document.getElementById("prevBtn").onclick = prevStep;
}

function highlightStars(n) {
  document.querySelectorAll('.star').forEach(star => {
    const starNum = +star.dataset.star;
    star.classList.toggle('selected', starNum <= n);
  });
}

function nextStep() {
  // Save data from current step
  switch (steps[step].field) {
    case "store": data.store = document.getElementById('store').value.trim(); break;
    case "associate": data.associate = document.getElementById('associate').value.trim(); break;
    case "serviceType": data.serviceType = document.getElementById('serviceType').value; break;
    case "purchase": data.purchase = document.getElementById('purchase').value.trim(); break;
    case "rating": if (!data.rating) data.rating = 0; break;
    case "comment": data.comment = document.getElementById('comment').value.trim(); break;
    case "recommend": data.recommend = document.getElementById('recommend').value; break;
    case "referral":
      data.refName = document.getElementById('refName').value.trim();
      data.refPhone = document.getElementById('refPhone').value.trim();
      break;
    case "yourInfo":
      data.yourName = document.getElementById('yourName').value.trim();
      data.yourContact = document.getElementById('yourContact').value.trim();
      break;
  }
  // Validation
  if (
    (steps[step].field === "store" && !data.store) ||
    (steps[step].field === "associate" && !data.associate) ||
    (steps[step].field === "serviceType" && !data.serviceType) ||
    (steps[step].field === "rating" && !data.rating) ||
    (steps[step].field === "comment" && !data.comment) ||
    (steps[step].field === "recommend" && !data.recommend)
  ) {
    alert("Please fill out this step before continuing.");
    return;
  }
  if (step === steps.length - 1) {
    // "Submit" pressed. Send or show success
    // --- Integrate with backend here ---
    // Example: fetch('https://...', {method:'POST', body:JSON.stringify(data)})
    document.getElementById("stepper").innerHTML = `
      <div class="step" style="text-align:center;">
        <div style="font-size:2.5em;margin:24px 0 12px 0;">✅</div>
        <div class="step-title" style="margin-bottom:12px;">Thank you!</div>
        <div style="color:#333; font-size:1.08em;">
          Your review and referral (if any) have been sent.<br>
          <br>
          <b>We appreciate your feedback.</b>
        </div>
      </div>
    `;
    return;
  }
  step++; renderStep();
}
function prevStep() { step--; renderStep(); }
window.onload = renderStep;