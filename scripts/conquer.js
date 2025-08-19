function legend() {
  var control = L.control({ position: 'topright' });
  control.onAdd = function () {

    var div = L.DomUtil.create('div', 'info legend')
    grades = milestones.slice().reverse();

    div.innerHTML += '<p>凡例</p>';

    var legendInnerContainerDiv = L.DomUtil.create('div', 'legend-inner-container', div);
    legendInnerContainerDiv.innerHTML += '<div class="legend-gradient"></div>';

    var labelsDiv = L.DomUtil.create('div', 'legend-labels', legendInnerContainerDiv);
    for (var i = 0; i < grades.length; i++) {
      labelsDiv.innerHTML += '<span>' + grades[i] + '枚</span>';
    }
    return div;
  };

  return control
}

function getProgressColor(value) {
  const blueStart = { r: 128, g: 224, b: 255 }; // 明るい青
  const blueEnd = { r: 0, g: 0, b: 255 };       // 濃い青

  let lower = milestones[0];
  let upper = milestones[milestones.length - 1];

  let index = 0;
  for (let i = 1; i < milestones.length; i++) {
    if (value < milestones[i]) {
      lower = milestones[i - 1];
      upper = milestones[i];
      index = i - 1;
      break;
    }
    index = i - 1;
  }

  const localPct = (value - lower) / (upper - lower);
  const globalPct = (index + localPct) / (milestones.length - 1); // 全体での位置

  const r = Math.round(blueStart.r + globalPct * (blueEnd.r - blueStart.r));
  const g = Math.round(blueStart.g + globalPct * (blueEnd.g - blueStart.g));
  const b = Math.round(blueStart.b + globalPct * (blueEnd.b - blueStart.b));

  return `rgb(${r}, ${g}, ${b})`;
}

function getGeoJsonStyle(value) {
  return {
    color: 'black',
    fillColor: getProgressColor(value),
    fillOpacity: 0.7,
    weight: 2,
  }
}

function setPolygonPopup(polygon, areaname, value) {
  let popupContent = `<b>${areaname}</b><br>`;
  popupContent += `トータル: ${value}枚<br>`;
  polygon.bindPopup(popupContent);

  // ▼ 一定値以上ならアイコンをマップ上に表示
  if (value >= 100) {
    const center = polygon.getBounds().getCenter();
    let image = './usagi_100.png';
    if (value >= 1000) {
      image = './usagi_1000.png';
    }
    const icon = L.icon({
      iconUrl: image,
      iconSize: [57, 80],
      iconAnchor: [28.5, 80],
    });

    L.marker([center.lat, center.lng], { icon: icon }).addTo(map);
  }
}

function loadMapByArea(data, area_name = null, pref_id = null, city_id = null) {
  for (let key in data) {
    const item = data[key];

    // パラメータによって処理を分岐
    let geoJsonUrl = '';
    let cpref = '';
    let ccity = '';
    let label = '';
    let subarea = '';
    let value = 0;
    let is_detail = false

    if (pref_id === null && city_id === null) {
      // 全国表示
      subarea = item.pref;
      cpref = key;
      label = item.pref;
      value = item.sum;
    } else if (pref_id !== null && city_id === null) {
      // 都道府県表示
      subarea = `${area_name}${item.city}`;
      cpref = pref_id;
      ccity = key;
      label = item.city;
      value = item.sum;
    } else if (pref_id !== null && city_id !== null) {
      // 市区町村詳細
      subarea = `${area_name}${item.address}`;
      label = item.address;
      value = item.sum;
      is_detail = true
    }
    geoJsonUrl = `https://uedayou.net/loa/${subarea}.geojson`;

    fetch(geoJsonUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch geojson for ${label}`);
        }
        return response.json();
      })
      .then((geoData) => {
        const polygon = L.geoJSON(geoData, { style: getGeoJsonStyle(value) });
        polygon.addTo(map);

        const centroid = polygon.getBounds().getCenter();
        if(!is_detail) {
          setMarkerWithTooltip(polygon, subarea, cpref, ccity, label, value);
        } else {
          setPolygonPopup(polygon, subarea, value);
        }
      })
      .catch((error) => {
        console.error('Error fetching geojson:', error);
      });
  }
}

function setMarkerWithTooltip(polygon, area_name, pref_id, city_id, label, value) { //全体マップの描画
  let center = polygon.getBounds().getCenter();
  if (customCenterOverrides[area_name]) {
    center = customCenterOverrides[area_name];
  }

  const marker = L.marker([center.lat, center.lng]).addTo(map);

  const tooltipContent = `
  <div style="text-align: center;">
    <strong>${label}</strong><br>
    <span style="font-size: 12px; color: gray;"> ${value} 枚</span>
  </div>
`;

  marker.bindTooltip(tooltipContent, {
    permanent: true,
    direction: 'bottom',
    offset: [-15, 40],
    className: "custom-tooltip"
  }).openTooltip();

  marker.on('click', function () {
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('area_name', area_name);
    currentUrl.searchParams.set('pref_id', pref_id);
    currentUrl.searchParams.set('city_id', city_id);
    currentUrl.searchParams.set('lat', center.lat);
    currentUrl.searchParams.set('lng', center.lng);
    window.location.href = currentUrl.toString();
  });
}

var map = L.map("map", { preferCanvas: true, zoomControl: false }).setView([35.669400214188606, 139.48343915372877], 11);

const baseLayers = {
  'OpenStreetMap': osm,
  'Google Map': googleMap,
  '国土地理院地図': japanBaseMap,
};

japanBaseMap.addTo(map);
let layerControl = L.control.layers(baseLayers, null, { position: "topleft" }).addTo(map);

let areaList;
let progress;

const area_name = getParamFromUrl("area_name");
const pref_id = getParamFromUrl("pref_id");
const city_id = getParamFromUrl("city_id");
const lat = getParamFromUrl("lat");
const lng = getParamFromUrl("lng");

Promise.all([ getPostingData(pref_id, city_id)]).then(function (res) {
  postingdata = res[0];

  const total = Object.values(postingdata).reduce((acc, item) => acc + (item.sum || 0), 0);

  if (pref_id === null) {
    // 全国
    loadMapByArea(postingdata);
  } else if (pref_id !== null && (city_id === null || city_id === "")) {
    // 都道府県マップ
    map.setView([lat, lng], 11);
    loadMapByArea(postingdata,area_name, pref_id, null);
  } else if (pref_id !== null && city_id !== null) {
    // 市区町村マップ
    map.setView([lat, lng], 14);
    loadMapByArea(postingdata, area_name, pref_id, city_id);
  }

  //マップ合計と凡例を表示
  areatotalBox(total, 'topright').addTo(map)
  legend().addTo(map);

}).catch((error) => {
  console.error('Error in fetching data:', error);
});

// https://zenn.dev/uedayou/articles/272704196e41b2#%E3%82%B8%E3%82%AA%E3%83%8F%E3%83%83%E3%82%B7%E3%83%A5%E5%80%A4%3Axn76u(%E6%9D%B1%E4%BA%AC%E9%A7%85%E3%81%AE%E5%91%A8%E8%BE%BA)%E3%81%AB%E5%90%AB%E3%81%BE%E3%82%8C%E3%82%8B%E4%BD%8F%E6%89%80
async function geoHashQuery(geohash) {
  const query = `
  PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
  PREFIX dcterms: <http://purl.org/dc/terms/>
  PREFIX schema: <http://schema.org/>
  PREFIX ic: <http://imi.go.jp/ns/core/rdf#>
  PREFIX geonames: <http://www.geonames.org/ontology#>
  PREFIX loa: <https://uedayou.net/loa/>

  SELECT ?uri ?geohash WHERE {
    {
      ?uri rdfs:label ?address;
          schema:geo ?geohash.
    } UNION {
      ?s rdfs:label ?address;
        dcterms:hasPart ?n.
      ?n schema:geo ?geohash;
        ic:丁目 ?cho.
      BIND (URI(CONCAT(str(?s), str(?cho), "丁目")) AS ?uri)
    }
    FILTER(regex(str(?geohash), '^http://geohash.org/${geohash}'))
  }
  limit 512
  `;
  const url = "https://uedayou.net/loa/sparql?query=" + encodeURIComponent(query);
  const headers = { "Accept": "application/sparql-results+json" };

  const response = await fetch(url, { headers });
  const data = await response.json();
  
  return data.results.bindings;
}

function commonPrefixCount(a, b) {
  let len = Math.min(a.length, b.length);
  let i = 0
  for (; i < len; i++) {
    if(a[i] !== b[i])
    {
      break;
    }
  }
  return i;
}

// 重複してマップに追加しない
let existingGeoElements = {};

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

function processGeoElements( geoElements, i )
{
  if( geoElements.length == i )
  {
    // done
    return;
  }
  const address = geoElements[i].uri.split('/').pop();
  const geoJsonUrl = geoElements[i].uri + '.geojson';

  if(address in existingGeoElements)
  {
    // skip
    processGeoElements(geoElements, i + 1);
    return;
  }
  existingGeoElements[address] = 1;

  fetch(geoJsonUrl).then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to fetch geojson for ${geoElements[i].uri}`);
    }
    return response.json();
  }).then((geoData) => {
    colors = ["aqua","blue","fuchsia","green","lime","maroon","navy","olive","purple","red","teal","yellow"];
    const polygon = L.geoJSON(geoData, { 
      style: {
        color: colors[getRandomInt(colors.length)],
        fillOpacity: 0.2
      } 
    });
    polygon.addTo(map);
    polygon.bindPopup(address);

    processGeoElements(geoElements, i + 1);
  }) 
}

// あまり連続でクエリしすぎないように制御
let isSearching = false;

function onMapClick(e) {
  if(isSearching)
  {
    return;
  }
  isSearching = true;

  let popup = L.popup();
  popup
      .setLatLng(e.latlng)
      .setContent("住所検索中...")
      .openOn(map);

  const geohash = encodeGeoHash(e.latlng.lat, e.latlng.lng);
  geoHashQuery(geohash.slice(0, 5)).then(elements => {
    let geoElements = [];
    for (let i = 0; i < elements.length; i++) {
      thisGeoHash = elements[i].geohash.value.split('/').pop()
      const nCommons = commonPrefixCount(geohash, thisGeoHash);
      geoElements.push({ nCommons: nCommons, uri: elements[i].uri.value });
    }
    
    if( geoElements.length == 0 )
    {
      return;
    }

    geoElements.sort( (a, b) => b.nCommons - a.nCommons );
    closerGeoElements = geoElements.filter( (x) => x.nCommons === geoElements[0].nCommons );

    processGeoElements( closerGeoElements, 0 );

    // for (let i = 0; i < closerGeoElements.length; i++) {
    //   console.log(`${closerGeoElements[i].nCommons}, ${closerGeoElements[i].uri}`);
    // }
    // console.log("--");

    map.closePopup(popup);
  }).finally(() => {
    isSearching = false;
  });
}

map.on('click', onMapClick);
