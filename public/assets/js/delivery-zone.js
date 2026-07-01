let map;
let marker;
let infoWindow;
let polygon = null;
let originalPolygon = null;
let center = {lat: 40.749933, lng: -73.98633};
let otherZonePolygons = [];
let drawingMode = true;
let vertexMarkers = [];
let handToolEl = null;
let shapeToolEl = null;

function vertexIcon() {
    return {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 6,
        fillColor: '#FF0000',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
    };
}

function syncVertexMarkers() {
    vertexMarkers.forEach(function (m) { m.setMap(null); });
    vertexMarkers = [];
    if (!polygon) return;
    polygon.getPath().forEach(function (latLng) {
        vertexMarkers.push(new google.maps.Marker({
            position: latLng,
            map: map,
            icon: vertexIcon(),
            clickable: false,
            zIndex: 9999,
        }));
    });
}

function clearDrawing() {
    if (polygon) polygon.getPath().clear();
    vertexMarkers.forEach(function (m) { m.setMap(null); });
    vertexMarkers = [];
    const boundaryInput = document.getElementById('boundary-json');
    if (boundaryInput) boundaryInput.value = '';
    const latInput = document.getElementById('center-latitude');
    const lngInput = document.getElementById('center-longitude');
    const radiusInput = document.getElementById('radius-km');
    if (latInput) latInput.value = '';
    if (lngInput) lngInput.value = '';
    if (radiusInput) radiusInput.value = '';
}

function setDrawingMode(drawing) {
    drawingMode = drawing;
    if (map) {
        map.setOptions({draggableCursor: drawing ? 'crosshair' : null});
    }
    if (shapeToolEl) {
        shapeToolEl.style.backgroundColor = drawing ? '#e7f0ff' : '#fff';
        shapeToolEl.style.color = drawing ? '#206bc4' : '#444';
    }
    if (handToolEl) {
        handToolEl.style.backgroundColor = drawing ? '#fff' : '#e7f0ff';
        handToolEl.style.color = drawing ? '#444' : '#206bc4';
    }
}

function buildDrawingControl() {
    const wrapper = document.createElement('div');
    wrapper.className = 'zone-drawing-toolbar';
    wrapper.style.cssText = 'margin:10px;display:flex;border-radius:4px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.3);background:#fff;font-family:Roboto,Arial,sans-serif;';

    handToolEl = document.createElement('div');
    handToolEl.title = 'Hand Tool — pan the map';
    handToolEl.className = 'zone-drawing-tool';
    handToolEl.style.cssText = 'cursor:pointer;display:flex;align-items:center;justify-content:center;width:36px;height:36px;font-size:18px;color:#444;';
    handToolEl.innerHTML = '<i class="ti ti-hand-grab"></i>';

    shapeToolEl = document.createElement('div');
    shapeToolEl.title = 'Shape Tool — click the map to connect the dots';
    shapeToolEl.className = 'zone-drawing-tool';
    shapeToolEl.style.cssText = 'cursor:pointer;display:flex;align-items:center;justify-content:center;width:36px;height:36px;font-size:18px;color:#444;border-left:1px solid #e6e6e6;';
    shapeToolEl.innerHTML = '<i class="ti ti-polygon"></i>';

    handToolEl.addEventListener('click', function () { setDrawingMode(false); });
    shapeToolEl.addEventListener('click', function () { setDrawingMode(true); });

    wrapper.appendChild(handToolEl);
    wrapper.appendChild(shapeToolEl);
    return wrapper;
}

function createDrawingPolygon() {
    const newPolygon = new google.maps.Polygon({
        map: map,
        editable: true,
        clickable: false,
        strokeColor: '#FF0000',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: '#FF0000',
        fillOpacity: 0.2,
        zIndex: 1,
    });
    newPolygon.setPath([]);
    return newPolygon;
}

async function initMap() {
    await Promise.all([
        google.maps.importLibrary('maps'),
        google.maps.importLibrary('marker'),
        google.maps.importLibrary('places'),
    ]);

    const centerLatInput = document.getElementById('center-latitude');
    const centerLngInput = document.getElementById('center-longitude');
    if (centerLatInput?.value && centerLngInput?.value) {
        center = {
            lat: parseFloat(centerLatInput.value),
            lng: parseFloat(centerLngInput.value),
        };
    }

    map = new google.maps.Map(document.getElementById('map'), {
        center,
        zoom: 13,
        mapId: '4504f8b37365c3d0',
        mapTypeControl: false,
    });

    const placeAutocomplete = new google.maps.places.PlaceAutocompleteElement();
    placeAutocomplete.id = 'place-autocomplete-input';
    placeAutocomplete.locationBias = center;
    const card = document.getElementById('place-autocomplete-card');
    card.appendChild(placeAutocomplete);
    map.controls[google.maps.ControlPosition.TOP_LEFT].push(card);

    marker = new google.maps.marker.AdvancedMarkerElement({map});
    infoWindow = new google.maps.InfoWindow({});

    placeAutocomplete.addEventListener('gmp-select', async ({placePrediction}) => {
        const place = placePrediction.toPlace();
        await place.fetchFields({fields: ['displayName', 'formattedAddress', 'location']});
        if (place.viewport) {
            map.fitBounds(place.viewport);
        } else {
            map.setCenter(place.location);
            map.setZoom(17);
        }
        const content = `<div id="infowindow-content">
            <span id="place-displayname" class="title">${place.displayName}</span><br />
            <span id="place-address">${place.formattedAddress}</span>
        </div>`;
        updateInfoWindow(content, place.location);
        marker.position = place.location;
    });

    map.controls[google.maps.ControlPosition.LEFT_TOP].push(buildDrawingControl());

    const boundaryJsonInput = document.getElementById('boundary-json');
    let hasExistingPolygon = false;

    if (boundaryJsonInput?.value) {
        try {
            const pathArr = JSON.parse(boundaryJsonInput.value);
            if (Array.isArray(pathArr) && pathArr.length > 0) {
                const path = pathArr.map(coord => new google.maps.LatLng(coord.lat, coord.lng));
                originalPolygon = new google.maps.Polygon({
                    paths: path,
                    fillColor: '#FF0000',
                    fillOpacity: 0.2,
                    strokeWeight: 2,
                    strokeColor: '#FF0000',
                    strokeOpacity: 0.8,
                    editable: true,
                    clickable: false,
                    map: map,
                    zIndex: 1,
                });
                map.fitBounds(getBoundsForPath(path));
                polygon = originalPolygon;
                updateBoundaryInput(polygon);
                setPolygonListeners(polygon);
                hasExistingPolygon = true;
            }
        } catch (e) {
            // Ignore parse error
        }
    }

    if (!hasExistingPolygon) {
        polygon = createDrawingPolygon();
        setPolygonListeners(polygon);

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((position) => {
                map.setCenter({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                });
            });
        }

        setDrawingMode(true);
    } else {
        setDrawingMode(false);
    }

    google.maps.event.addListener(map, 'click', function (event) {
        if (!drawingMode || !polygon) return;
        polygon.getPath().push(event.latLng);
        updateBoundaryInput(polygon);
    });

    try {
        await renderOtherDeliveryZonesOnForm();
    } catch (e) {
        console.warn('Unable to render other delivery zones on form:', e);
    }

    document.getElementById('clear-last')?.addEventListener('click', function () {
        clearDrawing();
    });

    document.getElementById('reset-zone')?.addEventListener('click', function () {
        if (originalPolygon) {
            const origPath = originalPolygon.getPath().getArray().map(latlng => ({
                lat: latlng.lat(),
                lng: latlng.lng(),
            }));
            if (polygon) polygon.setMap(null);
            polygon = new google.maps.Polygon({
                paths: origPath,
                fillColor: '#FF0000',
                fillOpacity: 0.2,
                strokeWeight: 2,
                strokeColor: '#FF0000',
                strokeOpacity: 0.8,
                editable: true,
                clickable: false,
                map: map,
                zIndex: 1,
            });
            map.fitBounds(getBoundsForPath(origPath.map(coord => new google.maps.LatLng(coord.lat, coord.lng))));
            updateBoundaryInput(polygon);
            setPolygonListeners(polygon);
        }
    });
}

async function renderOtherDeliveryZonesOnForm() {
    if (otherZonePolygons.length) {
        otherZonePolygons.forEach(p => p.setMap(null));
        otherZonePolygons = [];
    }

    const currentZoneIdEl = document.getElementById('current-zone-id');
    const currentZoneId = currentZoneIdEl ? parseInt(currentZoneIdEl.value) : null;

    const response = await fetch('/api/delivery-zone?per_page=500', {headers: {Accept: 'application/json'}});
    if (!response.ok) return;
    const json = await response.json();

    const items = (json && json.data && Array.isArray(json.data.data)) ? json.data.data : (Array.isArray(json.data) ? json.data : []);
    if (!items.length) return;

    items.forEach(zone => {
        if (currentZoneId && zone.id === currentZoneId) return;
        if (!zone.boundary_json || !Array.isArray(zone.boundary_json) || zone.boundary_json.length < 3) return;
        const path = zone.boundary_json
            .map(pt => ({lat: parseFloat(pt.lat), lng: parseFloat(pt.lng)}))
            .filter(p => !Number.isNaN(p.lat) && !Number.isNaN(p.lng));
        if (path.length < 3) return;

        const overlay = new google.maps.Polygon({
            paths: path,
            strokeColor: '#0066ff',
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: '#1a73e8',
            fillOpacity: 0.08,
            clickable: false,
            zIndex: 0,
            map: map,
        });

        otherZonePolygons.push(overlay);
    });
}

function updateBoundaryInput(poly) {
    const path = poly.getPath().getArray().map(latlng => ({
        lat: latlng.lat(),
        lng: latlng.lng(),
    }));
    document.getElementById('boundary-json').value = JSON.stringify(path);

    const centroid = getPolygonCentroid(path);
    if (centroid) {
        document.getElementById('center-latitude').value = centroid.lat;
        document.getElementById('center-longitude').value = centroid.lng;
    }

    const radiusKm = getMaxRadiusKm(centroid, path);
    document.getElementById('radius-km').value = path.length ? radiusKm.toFixed(3) : '';
    syncVertexMarkers();
}

function getPolygonCentroid(path) {
    if (!path.length) return null;
    let lat = 0, lng = 0;
    path.forEach(point => {
        lat += point.lat;
        lng += point.lng;
    });
    return {lat: lat / path.length, lng: lng / path.length};
}

function getMaxRadiusKm(centroid, path) {
    if (!centroid || !path.length) return 0;
    let maxDist = 0;
    path.forEach(point => {
        const dist = haversineDistance(centroid, point);
        if (dist > maxDist) maxDist = dist;
    });
    return maxDist;
}

function haversineDistance(coord1, coord2) {
    const R = 6371;
    const dLat = toRad(coord2.lat - coord1.lat);
    const dLng = toRad(coord2.lng - coord1.lng);
    const lat1 = toRad(coord1.lat);
    const lat2 = toRad(coord2.lat);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(deg) {
    return deg * Math.PI / 180;
}

function setPolygonListeners(poly) {
    google.maps.event.clearListeners(poly.getPath(), 'set_at');
    google.maps.event.clearListeners(poly.getPath(), 'insert_at');
    google.maps.event.clearListeners(poly.getPath(), 'remove_at');
    poly.getPath().addListener('set_at', () => updateBoundaryInput(poly));
    poly.getPath().addListener('insert_at', () => updateBoundaryInput(poly));
    poly.getPath().addListener('remove_at', () => updateBoundaryInput(poly));
}

function getBoundsForPath(path) {
    const bounds = new google.maps.LatLngBounds();
    path.forEach(latlng => bounds.extend(latlng));
    return bounds;
}

function updateInfoWindow(content, position) {
    infoWindow.setContent(content);
    infoWindow.setPosition(position);
    infoWindow.open({map, anchor: marker, shouldFocus: false});
}

if (document.getElementById('map')) {
    initMap().catch(function (e) {
        console.error('Error initializing map:', e);
    });
}

document.addEventListener('DOMContentLoaded', function () {
    document.addEventListener('click', function (event) {
        handleDelete(event, '.delete-delivery-zone', `/${panel}/delivery-zones/`, 'You are about to delete this Zone.');
    });
});
