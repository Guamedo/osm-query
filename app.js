import * as L from './leaflet/leaflet-src.esm.js';

const redIcon = L.icon({
  iconUrl: 'leaflet/images/marker-icon-red.png',
  shadowUrl: 'leaflet/images/marker-shadow.png',

  iconSize: [25, 41],
  shadowSize: [41, 41],
  iconAnchor: [12, 40],
  shadowAnchor: [12, 40],
  popupAnchor: [-3, -76],
});

function getDistanceInMetres(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres

  const φ1 = (lat1 * Math.PI) / 180; // φ, λ in radians
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const d = R * c; // in metres

  return d;
}

function getElementsData(elements, center) {
  const elementsData = elements
    .filter((e) => e.type === 'node' || e.type === 'way')
    .map((e) => {
      if (e.type === 'node') {
        return {
          lat: e.lat,
          lon: e.lon,
          tags: e.tags,
          distToCenter: getDistanceInMetres(e.lat, e.lon, center.lat, center.lng),
        };
      } else {
        const wayLat = (e.bounds.minlat + e.bounds.maxlat) / 2;
        const wayLon = (e.bounds.minlon + e.bounds.maxlon) / 2;
        return {
          lat: wayLat,
          lon: wayLon,
          tags: e.tags,
          distToCenter: getDistanceInMetres(wayLat, wayLon, center.lat, center.lng),
        };
      }
    });
  return elementsData;
}

async function queryOverpass(query, center) {
  const result = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
  }).then((data) => data.json());

  let elementsData = getElementsData(result?.elements ?? [], center);

  elementsData.sort((a, b) => {
    return a.distToCenter - b.distToCenter;
  });

  return elementsData;
}

async function getPublicRestroomFromBounds(bounds) {
  const southWest = bounds.getSouthWest();
  const northEast = bounds.getNorthEast();
  const center = bounds.getCenter();

  const bbox = `${southWest.lat},${southWest.lng},${northEast.lat},${northEast.lng}`;

  return await queryOverpass(`[out:json][timeout:120];nwr["amenity"="toilets"](${bbox});out geom;`, center);
}

async function getDrinkingWaterFromBounds(bounds) {
  const southWest = bounds.getSouthWest();
  const northEast = bounds.getNorthEast();
  const center = bounds.getCenter();

  const bbox = `${southWest.lat},${southWest.lng},${northEast.lat},${northEast.lng}`;

  return await queryOverpass(`[out:json][timeout:120];nwr["amenity"="drinking_water"](${bbox});out geom;`, center);
}

async function main() {
  const map = L.map('map').setView([43.264331, -2.9207012], 14);
  let centerMarker = null;

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  const findBtn = document.getElementById('find-btn');
  findBtn.addEventListener('click', find);

  const locateBtn = document.getElementById('locate-btn');
  locateBtn.addEventListener('click', locate);

  async function locate() {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position?.coords?.latitude;
          const lon = position?.coords?.longitude;

          if (centerMarker) centerMarker.remove();
          centerMarker = L.marker([lat, lon], { icon: redIcon }).addTo(map);

          map.setView([lat, lon], 14);
        },
        (error) => {
          const errors = { 1: 'Permission denied', 2: 'Position unavailable', 3: 'Request timeout' };
          alert('Error: ' + errors[error.code]);
        },
        { enableHighAccuracy: true }
      );
    } else {
      console.warn('Geolocation is not available in this browser');
    }
  }

  async function find() {
    map.eachLayer((layer) => {
      if (!layer._url && layer != centerMarker) layer.remove();
    });

    findBtn.innerHTML = 'Finding...';

    const bounds = map.getBounds();
    const findSelection = document.querySelector('input[name="search-tag"]:checked').value;

    try {
      const nodes =
        findSelection === 'toilet'
          ? await getPublicRestroomFromBounds(bounds)
          : await getDrinkingWaterFromBounds(bounds);
      for (const node of nodes) {
        const m = L.marker([node.lat, node.lon]).addTo(map);
        const popupBody = `
          <p style="margin: 0"> Distance: ${(node.distToCenter / 1000).toFixed(3) + ' Km'} </p> 
          <a href="https://www.google.com.sa/maps/search/${node.lat},${node.lon}" target="_blank">Navigate</a>
        `;
        m.bindPopup(popupBody);
      }
    } catch (err) {
      console.error(err);

      console.warn('Error finding');
    } finally {
      findBtn.innerHTML = 'Find';
    }
  }
}

document.addEventListener('DOMContentLoaded', main);
