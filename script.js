const stars = document.getElementById('starRating');
let selectedRating = 0;

function highlightStars(count) {
  let starsText = '';
  for (let i = 1; i <= 5; i++) {
    starsText += i <= count ? '<span class="filled">★</span>' : '★';
  }
  stars.innerHTML = starsText;
}

stars.addEventListener('mousemove', (e) => {
  const rect = stars.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const starIndex = Math.ceil((x / rect.width) * 5);
  highlightStars(starIndex);
});

stars.addEventListener('mouseleave', () => {
  highlightStars(selectedRating);
});

stars.addEventListener('click', (e) => {
  const rect = stars.getBoundingClientRect();
  const x = e.clientX - rect.left;
  selectedRating = Math.ceil((x / rect.width) * 5);
  highlightStars(selectedRating);
});

document.getElementById('submitBtn').addEventListener('click', () => {
  const store = document.getElementById('store').value.trim();
  const associate = document.getElementById('associate').value.trim();
  const serviceType = document.getElementById('serviceType').value;
  const purchase = document.getElementById('purchase').value.trim();
  const comment = document.getElementById('comment').value.trim();
  const recommend = document.getElementById('recommend').value;
  const yourName = document.getElementById('yourName').value.trim();
  const yourContact = document.getElementById('yourContact').value.trim();
  const refName = document.getElementById('refName').value.trim();
  const refPhone = document.getElementById('refPhone').value.trim();

  if (!store || !associate || !serviceType || !comment || !recommend || !yourName || selectedRating === 0) {
    alert("Please fill out all required fields and select a star rating.");
    return;
  }

  // Send to backend or save as needed:
  console.log({
    store, associate, serviceType, purchase, rating: selectedRating,
    comment, recommend, yourName, yourContact, refName, refPhone
  });

  document.getElementById('thanksMsg').style.display = 'block';
});