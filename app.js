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

function getElementsData(elements, centerLat, centerLon) {
  const elementsData = elements
    .filter((e) => e.type === 'node' || e.type === 'way')
    .map((e) => {
      if (e.type === 'node') {
        return {
          lat: e.lat,
          lon: e.lon,
          tags: e.tags,
          distToCenter: getDistanceInMetres(e.lat, e.lon, centerLat, centerLon),
        };
      } else {
        const wayLat = (e.bounds.minlat + e.bounds.maxlat) / 2;
        const wayLon = (e.bounds.minlon + e.bounds.maxlon) / 2;
        return {
          lat: wayLat,
          lon: wayLon,
          tags: e.tags,
          distToCenter: getDistanceInMetres(wayLat, wayLon, centerLat, centerLon),
        };
      }
    });
  return elementsData;
}

async function queryOverpass(query, centerLat, centerLon) {
  const result = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
  }).then((data) => data.json());

  let elementsData = getElementsData(result?.elements ?? [], centerLat, centerLon);

  elementsData.sort((a, b) => {
    return a.distToCenter - b.distToCenter;
  });

  return elementsData;
}

async function getPublicRestroomFromPos(lat, lon, dist = 20) {
  const centerLat = lat;
  const centerLon = lon;

  const distKm = dist;

  const distLat = distKm / 111.111;
  const distLon = distKm / (111.111 * Math.cos(centerLat * (Math.PI / 180)));

  const bbox = `${centerLat - distLat / 2},${centerLon - distLon / 2},${centerLat + distLat / 2},${
    centerLon + distLon / 2
  }`;

  return await queryOverpass(
    `[out:json][timeout:120];nwr["amenity"="toilets"](${bbox});out geom;`,
    centerLat,
    centerLon
  );
}

async function getDrinkingWaterFromPos(lat, lon, dist = 10) {
  const centerLat = lat;
  const centerLon = lon;

  const distKm = dist;

  const distLat = distKm / 111.111;
  const distLon = distKm / (111.111 * Math.cos(centerLat * (Math.PI / 180)));

  const bbox = `${centerLat - distLat / 2},${centerLon - distLon / 2},${centerLat + distLat / 2},${
    centerLon + distLon / 2
  }`;

  return await queryOverpass(
    `[out:json][timeout:120];nwr["amenity"="drinking_water"](${bbox});out geom;`,
    centerLat,
    centerLon
  );
}

async function main() {
  const map = L.map('map').setView([43.264331, -2.9207012], 14);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  const findBtn = document.getElementById('find-btn');
  findBtn.addEventListener('click', find);

  async function find() {
    map.eachLayer((layer) => {
      if (!layer._url) layer.remove();
    });

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          findBtn.innerHTML = 'Finding...';

          const lat = position?.coords?.latitude;
          const lon = position?.coords?.longitude;

          L.marker([lat, lon], { icon: redIcon }).addTo(map);

          map.setView([lat, lon], 14);

          const findSelection = document.querySelector('input[name="search-tag"]:checked').value;

          try {
            const nodes =
              findSelection === 'toilet'
                ? await getPublicRestroomFromPos(lat, lon)
                : await getDrinkingWaterFromPos(lat, lon);
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
        },
        (error) => {
          const errors = {
            1: 'Permission denied',
            2: 'Position unavailable',
            3: 'Request timeout',
          };
          alert('Error: ' + errors[error.code]);
        },
        { enableHighAccuracy: true }
      );
    } else {
      console.warn('Geolocation is not available in this browser');
    }
  }
}

document.addEventListener('DOMContentLoaded', main);
