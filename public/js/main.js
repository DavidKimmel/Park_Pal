document.addEventListener('DOMContentLoaded', () => {
  const mapEl = document.getElementById('map');
  const searchInput = document.getElementById('parkSearch');
  let map, markerByCode = {}, allParks = [];
  const initialCenter = [39.8283, -98.5795];
  const initialZoom = 4;
  if (mapEl) {
    map = L.map('map').setView([39.8283, -98.5795], 4);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    fetch('/api/parks')
      .then(res => res.json())
      .then(parks => {
        allParks = parks;
        renderParkList(parks);
      })
      .catch(err => {
        console.error('Error loading parks:', err);
        const listContainer = document.getElementById('park-list');
        if (listContainer) listContainer.textContent = 'Failed to load parks.';
      });
  }
  const resetBtn = document.getElementById('resetMapBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      map.setView(initialCenter, initialZoom);
    });
  }


  function renderParkList(parks) {
    const listContainer = document.getElementById('park-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    parks.forEach(park => {
      const lat = parseFloat(park.latitude);
      const lon = parseFloat(park.longitude);
      const code = park.parkCode || park.code || null;

      if (!isNaN(lat) && !isNaN(lon)) {
        if (!markerByCode[code]) {
          const marker = L.marker([lat, lon])
            .addTo(map)
            .on('click', () => showParkPopup(park));
          if (code) markerByCode[code] = marker;
        }

        const div = document.createElement('div');
        div.className = 'park-item';
        div.textContent = park.fullName;
        if (code) div.dataset.code = code;
        div.addEventListener('click', () => {
          map.flyTo([lat, lon], 8);
          markerByCode[code].fire('click');
          const codeInput = document.getElementById('itemParkCode');
          const panel = document.getElementById('itinerary-panel');
          if (code && codeInput && panel && panel.style.display !== 'none') {
            codeInput.value = code;
          }
        });
        listContainer.appendChild(div);
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase();
      const filtered = allParks.filter(park => park.fullName.toLowerCase().includes(query));
      renderParkList(filtered);
    });
  }

  async function showParkPopup(park) {
    const code = park.parkCode || park.code;
    const marker = markerByCode[code];

    let html = `<b>${park.fullName}</b><br>${park.description || ''}<br><br>`;

    try {
      const res = await fetch(`/api/parks/extra/${code}`);
      if (!res.ok || res.headers.get("content-type")?.includes("text/html")) {
        throw new Error(`Fetch failed or invalid content-type: ${res.status}`);
      }

      const additionalData = await res.json();

      const getListOrMessage = (data, key, label) => {
        if (!data || !Array.isArray(data[key]) || !data[key].length) {
          return `<b>${label}:</b> Not available<br>`;
        }
        const items = data[key].slice(0, 3).map(d => d.title || d.name || '').filter(Boolean);
        return `<b>${label}:</b> ${items.join(', ')}<br>`;
      };

      html += getListOrMessage(additionalData.activities, 'data', 'Activities');
      html += getListOrMessage(additionalData.alerts, 'data', 'Alerts');
      html += getListOrMessage(additionalData.events, 'data', 'Events');
      html += getListOrMessage(additionalData.fees, 'data', 'Fees');
      html += getListOrMessage(additionalData.videos, 'data', 'Videos');
      html += getListOrMessage(additionalData.thingstodo, 'data', 'Things To Do');
      html += getListOrMessage(additionalData.visitorcenters, 'data', 'Visitor Centers');

    } catch (err) {
      console.error('Error loading additional park data:', err);
      html += `<i>Additional info unavailable.</i>`;
    }

    if (marker) marker.bindPopup(html).openPopup();
  }


  // ------------------ TRIPS ------------------
  let currentTripId = null;
  let lastTrips = [];

  let editingTripId = null;

  function populateTripFormForEdit(trip) {
    editingTripId = trip.trip_id ?? trip.id;
    document.getElementById('tripName').value = trip.trip_name;
    document.getElementById('startDate').value = trip.start_date?.split('T')[0] || '';
    document.getElementById('endDate').value = trip.end_date?.split('T')[0] || '';

    // Open the form panel if it's not already open
    const panel = document.getElementById('trip-panel');
    if (panel) panel.classList.add('active');

    const overlay = document.getElementById('overlay');
    if (overlay) overlay.classList.remove('hidden');
  }


  async function loadTrips() {
    const list = document.getElementById('tripsList');
    if (!list) return;

    try {
      const res = await fetch('/api/parks/trips');
      const trips = await res.json();
      lastTrips = Array.isArray(trips) ? trips : [];
      list.innerHTML = '';

      if (!lastTrips.length) {
        list.innerHTML = '<li>No trips yet.</li>';
        return;
      }

      lastTrips.forEach(t => {
        const tripId = t.trip_id ?? t.id;
        const start = t.start_date ? new Date(t.start_date).toLocaleDateString() : '—';
        const end = t.end_date ? new Date(t.end_date).toLocaleDateString() : '—';

        const li = document.createElement('li');
        li.innerHTML = `
          <button class="linklike selectTripBtn" data-id="${tripId}">
            ${t.trip_name} (${start} → ${end})
          </button>
          <button class="editTripBtn" data-id="${tripId}" title="Edit trip">✏️</button>
          <button class="deleteTripBtn" data-id="${tripId}" title="Delete trip">🗑️</button>
        `;

        list.appendChild(li);
      });

      list.querySelectorAll('.editTripBtn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const trip = lastTrips.find(tr => String(tr.trip_id ?? tr.id) === String(id));
          if (trip) populateTripFormForEdit(trip);
        });
      });


      list.querySelectorAll('.selectTripBtn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const trip = lastTrips.find(tr => String(tr.trip_id ?? tr.id) === String(id));
          if (trip) selectTrip(trip);
        });
      });

      list.querySelectorAll('.deleteTripBtn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (!confirm('Delete this trip?')) return;
          await deleteTrip(id);
        });
      });
    } catch (err) {
      console.error('Failed to load trips', err);
      list.innerHTML = '<li>Failed to load trips.</li>';
    }
  }

  async function deleteTrip(id) {
    try {
      const res = await fetch(`/api/parks/trips/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete trip');

      if (currentTripId && String(currentTripId) === String(id)) {
        currentTripId = null;
        document.getElementById('itinerary-panel').style.display = 'none';
        document.getElementById('tripTitle').textContent = '';
        document.getElementById('itemsList').innerHTML = '<li>Select a trip to view itinerary.</li>';
      }

      await loadTrips();
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  }

  function selectTrip(trip) {
    currentTripId = trip.trip_id ?? trip.id;
    document.getElementById('tripTitle').textContent = trip.trip_name;
    document.getElementById('itinerary-panel').style.display = 'block';
    loadItems(currentTripId);
  }

  tripForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    trip_name: document.getElementById('tripName')?.value.trim(),
    start_date: document.getElementById('startDate')?.value,
    end_date: document.getElementById('endDate')?.value
  };

  try {
    let res;
    if (editingTripId) {
      res = await fetch(`/api/parks/trips/${editingTripId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch('/api/parks/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Failed to save trip');

    tripForm.reset();
    editingTripId = null;
    await loadTrips();
  } catch (err) {
    console.error(err);
    alert(err.message);
  }
});


  async function loadItems(tripId) {
    const ul = document.getElementById('itemsList');
    if (!ul) return;

    try {
      const res = await fetch(`/api/parks/trips/${tripId}/items`);
      const items = await res.json();
      ul.innerHTML = '';

      if (!items.length) {
        ul.innerHTML = '<li>No items yet.</li>';
        return;
      }

      items.forEach(it => {
        const li = document.createElement('li');
        const d = new Date(it.item_date).toLocaleDateString();
        const time = [it.start_time, it.end_time].filter(Boolean).join(' – ');
        const park = it.park_code ? ` [${it.park_code}]` : '';
        li.innerHTML = `
          <strong>${d}</strong> ${time ? '• ' + time : ''} — ${it.title}${park}
          <button data-id="${it.item_id}" class="delItem" style="margin-left:.5rem;">Delete</button>
        `;
        ul.appendChild(li);
      });

      ul.querySelectorAll('.delItem').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const itemId = e.currentTarget.getAttribute('data-id');
          if (!confirm('Delete this item?')) return;
          const delRes = await fetch(`/api/parks/trips/${currentTripId}/items/${itemId}`, { method: 'DELETE' });
          if (delRes.ok) loadItems(currentTripId);
        });
      });
    } catch (err) {
      console.error('Failed to load items', err);
      ul.innerHTML = '<li>Failed to load itinerary.</li>';
    }
  }

  const itemForm = document.getElementById('itemForm');
  if (itemForm) {
    itemForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentTripId) return alert('Select a trip first.');

      const payload = {
        item_date: document.getElementById('itemDate')?.value,
        start_time: document.getElementById('startTime')?.value || null,
        end_time: document.getElementById('endTime')?.value || null,
        title: document.getElementById('itemTitle')?.value.trim(),
        park_code: document.getElementById('itemParkCode')?.value.trim() || null,
        notes: document.getElementById('itemNotes')?.value.trim() || null
      };

      try {
        const res = await fetch(`/api/parks/trips/${currentTripId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Failed to add item');

        itemForm.reset();
        await loadItems(currentTripId);
      } catch (err) {
        console.error(err);
        alert(err.message);
      }
    });
  }
const tripPanel = document.getElementById('trip-panel');
const overlay = document.getElementById('overlay');
const openBtn = document.getElementById('openTripPlanner');
const closeBtn = document.getElementById('closeTripPanel');

function openTripPanel() {
  tripPanel.classList.add('active');
  overlay.classList.remove('hidden');
}

function closeTripPanel() {
  tripPanel.classList.remove('active');
  overlay.classList.add('hidden');
}
if (openBtn) openBtn.addEventListener('click', openTripPanel);
if (closeBtn) closeBtn.addEventListener('click', closeTripPanel);
if (overlay) overlay.addEventListener('click', closeTripPanel);

// Initial load
  loadTrips();
});