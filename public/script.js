// Initialize Leaflet map
const map = L.map('map').setView([39.8283, -98.5795], 4); // Center on USA

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Fetch parks from backend
fetch('/api/parks')
  .then(response => response.json())
  .then(parks => {
    parks.forEach(park => {
      // Extract coordinates from "latLong" string (e.g., "lat:38.4241, long:-110.7481")
      if (park.latLong) {
        const lat = parseFloat(park.latLong.match(/lat:([-\d.]+)/)?.[1]);
        const lng = parseFloat(park.latLong.match(/long:([-\d.]+)/)?.[1]);

        if (!isNaN(lat) && !isNaN(lng)) {
          L.marker([lat, lng])
            .addTo(map)
            .bindPopup(`<strong>${park.fullName}</strong><br>${park.description}`);
        }
      }
    });
  })
  .catch(err => {
    console.error('Error fetching parks:', err);
  });
