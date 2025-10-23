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

async function getPublicRestroomFromPos(lat, lon) {
  const centerLat = lat;
  const centerLon = lon;

  const distKm = 20;

  const distLat = distKm / 111.111;
  const distLon = distKm / (111.111 * Math.cos(centerLat * (Math.PI / 180)));

  const bbox = `${centerLat - distLat / 2},${centerLon - distLon / 2},${centerLat + distLat / 2},${
    centerLon + distLon / 2
  }`;

  const result = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: 'data=' + encodeURIComponent(`[out:json][timeout:120];node["amenity"="toilets"](${bbox});out geom;`),
  }).then((data) => data.json());

  let nodes = result?.elements ?? [];

  nodes.sort((a, b) => {
    const distA = Math.sqrt((a.lat - centerLat) ** 2 + (a.lon - centerLon) ** 2);
    const distB = Math.sqrt((b.lat - centerLat) ** 2 + (b.lon - centerLon) ** 2);
    return distA - distB;
  });

  return nodes;
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

          console.log(lat, lon);

          L.marker([lat, lon], { icon: redIcon }).addTo(map);

          map.setView([lat, lon], 14);

          const nodes = await getPublicRestroomFromPos(43.264331, -2.9207012);
          for (const node of nodes) {
            const m = L.marker([node.lat, node.lon]).addTo(map);
            m.on('click', () => window.open(`https://www.google.com.sa/maps/search/${node.lat},${node.lon}`, '_blank'));
          }
          findBtn.innerHTML = 'Find';
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
