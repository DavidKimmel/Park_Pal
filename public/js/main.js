document.addEventListener('DOMContentLoaded', () => {
  // ------------------ MAP ------------------
  const mapEl = document.getElementById('map');
  let map, markerByCode = {};

  if (mapEl) {
    map = L.map('map').setView([39.8283, -98.5795], 4); // USA center
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Load parks and add markers + sidebar list
    fetch('/api/parks')
      .then(res => res.json())
      .then(parks => {
        const listContainer = document.getElementById('park-list');
        if (listContainer) listContainer.innerHTML = '';

        parks.forEach(park => {
          const lat = parseFloat(park.latitude);
          const lon = parseFloat(park.longitude);
          const code = park.parkCode || park.code || null;

          if (!isNaN(lat) && !isNaN(lon)) {
            const marker = L.marker([lat, lon])
              .addTo(map)
              .bindPopup(`<b>${park.fullName}</b><br>${park.states}`);

            if (code) markerByCode[code] = marker;

            if (listContainer) {
              const div = document.createElement('div');
              div.className = 'park-item';
              div.textContent = park.fullName;
              if (code) div.dataset.code = code;
              div.addEventListener('click', () => {
                map.flyTo([lat, lon], 8);
                marker.openPopup();
                // Optional: auto-fill itinerary park code if panel visible
                const codeInput = document.getElementById('itemParkCode');
                const panel = document.getElementById('itinerary-panel');
                if (code && codeInput && panel && panel.style.display !== 'none') {
                  codeInput.value = code;
                }
              });
              listContainer.appendChild(div);
            }
          }
        });
      })
      .catch(err => {
        console.error('Error loading parks:', err);
        const listContainer = document.getElementById('park-list');
        if (listContainer) listContainer.textContent = 'Failed to load parks.';
      });
  }

  // ------------------ TRIP CREATE ------------------
  const tripForm = document.getElementById('tripForm');
  const tripMessage = document.getElementById('tripMessage');

  if (tripForm) {
    tripForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const payload = {
        trip_name: document.getElementById('tripName')?.value.trim(),
        start_date: document.getElementById('startDate')?.value,
        end_date: document.getElementById('endDate')?.value
      };

      try {
        const res = await fetch('/api/parks/trips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to save trip');

        if (tripMessage) tripMessage.textContent = `✅ Saved: ${data.trip_name}`;
        tripForm.reset();
        await loadTrips(); // refresh list
      } catch (err) {
        console.error(err);
        if (tripMessage) tripMessage.textContent = `❌ ${err.message}`;
      }
    });
  }

  // ------------------ TRIPS LIST / SELECT / DELETE ------------------
  let currentTripId = null;
  let lastTrips = []; // cache trips to avoid extra fetch on select

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
        const tripId = t.trip_id ?? t.id; // tolerate either column name
        const start = t.start_date ? new Date(t.start_date).toLocaleDateString() : '—';
        const end = t.end_date ? new Date(t.end_date).toLocaleDateString() : '—';

        const li = document.createElement('li');
        li.innerHTML = `
          <button class="linklike selectTripBtn" data-id="${tripId}">
            ${t.trip_name} (${start} → ${end})
          </button>
          <button class="deleteTripBtn" data-id="${tripId}" title="Delete trip">🗑️</button>
        `;
        list.appendChild(li);
      });

      // Select handlers (use cached trips)
      list.querySelectorAll('.selectTripBtn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const trip = lastTrips.find(tr => String(tr.trip_id ?? tr.id) === String(id));
          if (trip) selectTrip(trip);
        });
      });

      // Delete handlers
      list.querySelectorAll('.deleteTripBtn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (!confirm('Delete this trip? This will remove its itinerary items too.')) return;
          await deleteTrip(id);
        });
      });

    } catch (err) {
      console.error('Failed to load trips', err);
      list.innerHTML = '<li>Failed to load trips.</li>';
    }
  }

  async function deleteTrip(id) {
    console.log('Deleting trip id:', id); // debug
    try {
      const res = await fetch(`/api/parks/trips/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete trip');
      }

      // If viewing this trip, hide itinerary panel
      if (currentTripId && String(currentTripId) === String(id)) {
        currentTripId = null;
        const panelEl = document.getElementById('itinerary-panel');
        const titleEl = document.getElementById('tripTitle');
        const itemsList = document.getElementById('itemsList');
        if (panelEl) panelEl.style.display = 'none';
        if (titleEl) titleEl.textContent = '';
        if (itemsList) itemsList.innerHTML = '<li>Select a trip to view itinerary.</li>';
      }

      await loadTrips();
      if (tripMessage) tripMessage.textContent = '✅ Trip deleted.';
    } catch (err) {
      console.error(err);
      if (tripMessage) tripMessage.textContent = `❌ ${err.message}`;
      alert(err.message);
    }
  }

  function selectTrip(trip) {
    const tripId = trip.trip_id ?? trip.id;
    currentTripId = tripId;

    const titleEl = document.getElementById('tripTitle');
    const panelEl = document.getElementById('itinerary-panel');
    if (!titleEl || !panelEl) {
      console.warn('Itinerary panel elements are missing from the DOM.');
      return;
    }
    titleEl.textContent = trip.trip_name;
    panelEl.style.display = 'block';
    loadItems(tripId);
  }

  // ------------------ ITINERARY LIST / ADD / DELETE ------------------
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

      // Hook up delete buttons
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
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to add item');
        }
        itemForm.reset();
        await loadItems(currentTripId);
      } catch (err) {
        console.error(err);
        alert(err.message);
      }
    });
  }

  // Initial load
  loadTrips();
});
