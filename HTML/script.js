const customers = [];

function addCustomer() {
  const name = document.getElementById("fullName").value.trim();
  const phone = document.getElementById("phoneInput").value.trim();
  const carrier = document.getElementById("carrier").value.trim();
  const lines = document.getElementById("lineCount").value.trim();
  const cost = document.getElementById("monthlyCost").value.trim();
  const switchInterest = document.getElementById("openToSwitch").value;

  if (!name || !phone) return alert("Name and phone number are required.");

  const customer = {
    name,
    phone,
    carrier,
    lines,
    cost,
    switchInterest
  };

  customers.push(customer);
  updateCustomerList();

  // Clear form
  document.querySelectorAll("input").forEach(input => input.value = "");
}

function updateCustomerList() {
  const list = document.getElementById("customerList");
  list.innerHTML = "";

  customers.forEach((c, i) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>${c.name}</strong> (${c.phone})<br>
      Carrier: ${c.carrier} -- ${c.lines} lines @ $${c.cost}/mo<br>
      Open to switching: <strong>${c.switchInterest}</strong>
    `;
    list.appendChild(li);
  });
}