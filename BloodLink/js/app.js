const STORAGE = { donors: "bloodlink_donors_v1", requests: "bloodlink_requests_v1" };
let donors = [];
let requests = [];
let map;
let donorMarkers = [];

const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, ch => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
}[ch]));

async function loadData() {
  try {
    const [donorResponse, requestResponse] = await Promise.all([
      fetch("data/donors.json"), fetch("data/requests.json")
    ]);
    if (!donorResponse.ok || !requestResponse.ok) throw new Error("Could not load JSON files");
    const [donorData, requestData] = await Promise.all([donorResponse.json(), requestResponse.json()]);
    donors = JSON.parse(localStorage.getItem(STORAGE.donors)) || donorData;
    requests = JSON.parse(localStorage.getItem(STORAGE.requests)) || requestData;
  } catch (error) {
    // This fallback lets the interface still load if the JSON files are unavailable.
    donors = JSON.parse(localStorage.getItem(STORAGE.donors)) || [];
    requests = JSON.parse(localStorage.getItem(STORAGE.requests)) || [];
    console.warn("BloodLink data load:", error.message);
    showToast("Could not load sample JSON. Run this folder with VS Code Live Server.");
  }
  renderAll();
}

function saveData() {
  localStorage.setItem(STORAGE.donors, JSON.stringify(donors));
  localStorage.setItem(STORAGE.requests, JSON.stringify(requests));
}

function renderAll() {
  $("#donorCount").textContent = donors.length;
  $("#requestCount").textContent = requests.filter(r => r.status === "Open").length;
  renderDonors();
  renderRequests();
  renderMapMarkers();
}

function renderDonors() {
  const blood = $("#bloodFilter").value;
  const city = $("#cityFilter").value;
  const availableOnly = $("#availableOnly").checked;
  const filtered = donors.filter(d =>
    (!blood || d.bloodGroup === blood) &&
    (!city || d.city === city) &&
    (!availableOnly || d.available)
  );
  $("#resultsSummary").textContent = `${filtered.length} donor record${filtered.length === 1 ? "" : "s"} match your filters`;
  const host = $("#donorResults");
  if (!filtered.length) {
    host.innerHTML = '<div class="empty-state">No matching sample donors. Try changing your filters.</div>';
    return;
  }
  host.innerHTML = filtered.map(d => `
    <article class="donor-card">
      <div class="donor-top"><span class="blood-type">${escapeHTML(d.bloodGroup)}</span>
      <span class="availability ${d.available ? "" : "off"}">${d.available ? "● Available (demo)" : "Currently unavailable"}</span></div>
      <h4>${escapeHTML(d.name)}</h4>
      <div class="donor-meta">⌖ ${escapeHTML(d.city)}, Gujarat</div>
      <div class="donor-foot"><small>Sample donor ID: ${escapeHTML(d.id)}</small>
      ${d.available ? `<button class="contact-link contact-button" type="button" data-donor-id="${escapeHTML(d.id)}" aria-label="View sample contact for ${escapeHTML(d.name)}">View sample contact ↗</button>` : '<small>Not accepting requests</small>'}</div>
    </article>`).join("");
}

// Reveal the sample number in the donor card instead of opening the phone dialler.
document.addEventListener("click", (event) => {
  const button = event.target.closest(".contact-button");
  if (!button) return;
  const donor = donors.find(item => item.id === button.dataset.donorId);
  if (!donor) { showToast("This sample donor record could not be found."); return; }
  button.textContent = donor.phone ? `Sample: ${donor.phone}` : "No sample number available";
  button.disabled = true;
  button.setAttribute("aria-label", `Sample contact number for ${donor.name}: ${donor.phone || "not available"}`);
});

function renderRequests() {
  const host = $("#requestList");
  if (!requests.length) {
    host.innerHTML = '<div class="empty-state">There are no demo requests yet. You can add one using the form.</div>';
    return;
  }
  host.innerHTML = requests.slice().reverse().map(r => `
    <article class="request-card">
      <span class="request-blood">${escapeHTML(r.bloodGroup)}</span>
      <div><h4>${escapeHTML(r.patientName)} · ${escapeHTML(r.units)} unit${Number(r.units) === 1 ? "" : "s"}</h4>
      <p>${escapeHTML(r.hospital)}<br>⌖ ${escapeHTML(r.city)} · ${escapeHTML(r.createdAt)}</p></div>
      <span class="priority ${r.urgency === "Normal" ? "normal" : ""}">${escapeHTML(r.urgency)}</span>
    </article>`).join("");
}

function initMap() {
  if (!window.L || !$("#map")) {
    $("#map").innerHTML = '<p style="padding:20px">Map library could not load. Check your internet connection.</p>';
    return;
  }
  // Start with a broad India view; the button takes visitors to Gujarat.
  map = L.map("map", { scrollWheelZoom: false }).setView([22.8, 79.0], 5);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  L.control.scale({ imperial: false }).addTo(map);
  renderMapMarkers();
  $("#gujaratView").addEventListener("click", () => map.flyTo([22.6, 71.6], 7, { duration: 1.2 }));
}

function renderMapMarkers() {
  if (!map) return;
  donorMarkers.forEach(marker => map.removeLayer(marker));
  donorMarkers = [];
  donors.filter(d => Number.isFinite(Number(d.lat)) && Number.isFinite(Number(d.lng))).forEach(d => {
    const marker = L.circleMarker([Number(d.lat), Number(d.lng)], {
      radius: 7, color: "#ffffff", weight: 2, fillColor: d.available ? "#d9434e" : "#9299a3", fillOpacity: .95
    }).addTo(map);
    marker.bindPopup(`<strong>${escapeHTML(d.city)}</strong><br>${escapeHTML(d.bloodGroup)} · ${d.available ? "Available (demo)" : "Unavailable"}<br><small>Approximate city-centre marker</small>`);
    donorMarkers.push(marker);
  });
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function addDonor(event) {
  event.preventDefault();
  const name = $("#donorName").value.trim();
  const age = Number($("#donorAge").value);
  const phone = $("#donorPhone").value.trim();
  if (age < 18 || age > 65) {
    $("#donorMessage").textContent = "Please enter an age between 18 and 65 for this demo form.";
    return;
  }
  if (!/^[6-9]\d{9}$/.test(phone)) {
    $("#donorMessage").textContent = "Enter a valid 10-digit Indian mobile number.";
    return;
  }
  const cityCoordinates = {
    Ahmedabad:[23.0225,72.5714], Vadodara:[22.3072,73.1812], Surat:[21.1702,72.8311],
    Rajkot:[22.3039,70.8022], Gandhinagar:[23.2156,72.6369], Bhavnagar:[21.7645,72.1519]
  };
  const city = $("#donorCity").value;
  const donor = {
    id:`D${String(Date.now()).slice(-7)}`, name, bloodGroup:$("#donorBlood").value, city,
    phone, available:true, lat:cityCoordinates[city][0], lng:cityCoordinates[city][1],
    lastDonation:"Not provided"
  };
  donors.push(donor);
  saveData();
  renderAll();
  event.target.reset();
  $("#donorMessage").textContent = "Your demo donor record has been added to this browser.";
  showToast("Donor added to this browser's demo directory.");
}

function addRequest(event) {
  event.preventDefault();
  const request = {
    id:`R${String(Date.now()).slice(-7)}`,
    patientName:$("#patientName").value.trim(),
    bloodGroup:$("#requestBlood").value,
    units:Number($("#requestUnits").value),
    city:$("#requestCity").value,
    urgency:$("#urgency").value,
    hospital:$("#hospital").value.trim(),
    status:"Open",
    createdAt:new Date().toISOString().slice(0,10)
  };
  if (request.units < 1 || request.units > 10) {
    $("#requestMessage").textContent = "Please enter between 1 and 10 units for this demo.";
    return;
  }
  requests.push(request);
  saveData();
  renderAll();
  event.target.reset();
  $("#requestMessage").textContent = "Demo request added locally. No hospital or donor has been notified.";
  showToast("Demo blood request added.");
}

function updateCompatibility() {
  // Educational red-cell compatibility reference: recipient -> possible donor groups.
  const table = {
    "O-":["O-"], "O+":["O-","O+"],
    "A-":["O-","A-"], "A+":["O-","O+","A-","A+"],
    "B-":["O-","B-"], "B+":["O-","O+","B-","B+"],
    "AB-":["O-","A-","B-","AB-"], "AB+":["O-","O+","A-","A+","B-","B+","AB-","AB+"]
  };
  $("#compatResult").textContent = table[$("#compatGroup").value].join(", ");
}

function initNavigation() {
  $("#menuToggle").addEventListener("click", () => {
    const open = $("#mainNav").classList.toggle("open");
    $("#menuToggle").setAttribute("aria-expanded", String(open));
  });
  document.querySelectorAll(".nav-link").forEach(link => link.addEventListener("click", () => {
    $("#mainNav").classList.remove("open");
    $("#menuToggle").setAttribute("aria-expanded", "false");
    document.querySelectorAll(".nav-link").forEach(item => item.classList.remove("active"));
    link.classList.add("active");
  }));
}

document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  $("#searchButton").addEventListener("click", renderDonors);
  $("#bloodFilter").addEventListener("change", renderDonors);
  $("#cityFilter").addEventListener("change", renderDonors);
  $("#availableOnly").addEventListener("change", renderDonors);
  $("#donorForm").addEventListener("submit", addDonor);
  $("#request-form").addEventListener("submit", addRequest);
  $("#compatGroup").addEventListener("change", updateCompatibility);
  updateCompatibility();
  initMap();
  loadData();
});
