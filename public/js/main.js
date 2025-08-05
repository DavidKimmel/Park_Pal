const map = L.map('map').setView([39.8283, -98.5795], 4); // Center of USA

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Fetch parks from your backend API
fetch('/api/parks')
  .then(res => res.json())
  .then(parks => {
    const listContainer = document.getElementById('park-list');
    listContainer.innerHTML = '';

    parks.forEach(park => {
      const lat = parseFloat(park.latitude);
      const lon = parseFloat(park.longitude);

      if (!isNaN(lat) && !isNaN(lon)) {
        const marker = L.marker([lat, lon])
          .addTo(map)
          .bindPopup(`<b>${park.fullName}</b><br>${park.states}`);

        // Also list in the sidebar
        const div = document.createElement('div');
        div.className = 'park-item';
        div.textContent = park.fullName;
        listContainer.appendChild(div);
      }
    });
  })
  .catch(err => {
    console.error('Error loading parks:', err);
    document.getElementById('park-list').textContent = 'Failed to load parks.';
  });

