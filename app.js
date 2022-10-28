let canvasImg; //for the elevation map
let addbtnClass; //for disabling the add button and adding styling
var polygons = []; //array that stores polygon objects
var budget; //starts at 10 million

//formats numbers into dollars, using it for budget
var formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0, // (causes 2500.99 to be printed as $2,501)
});

/** tool box navigation */
function openTools() {
  document.getElementById("toolwindow").style.width = "300px";
  document.getElementById("box").style.backgroundColor = "rgba(174, 216, 255, 0.767)";
}
function closeTools() {
  document.getElementById("toolwindow").style.width = "0";
  document.getElementById("box").style.backgroundColor = "rgba(226, 241, 255, 0.767)";
}

/** help box navigation */
function openHelp() {
  document.getElementById("helpwindow").style.display = "block";
  pause_clock();
}
function closeHelp() {
  document.getElementById("helpwindow").style.display = "none";
  if (document.getElementById("play").innerHTML == "START") {
    current_time = Date.parse(new Date());
    deadline = new Date(current_time + time_in_minutes * 60 * 1000);
    run_clock('floodtime', deadline);
    document.getElementById("play").innerHTML = "LET'S PLAY";
  }
  else
    resume_clock();
}

/** start flood navigation */
function openFlood() {
  document.getElementById("flood").style.display = "block";
}
function closeFlood() {
  document.getElementById("flood").style.display = "none";
}

/** to delete reservoirs and edit info window id num **/
function deleteShape(num) {
  polygons[num - 1].setMap(null);
  polygons.splice(num - 1, 1);
  for (let i = num - 1; i < polygons.length; i++) {
    polygons[i].number -= 1;
  }
  updateToolBox();
}

/* updates budget and reservoir area sections in the toolbox*/
function updateToolBox() {
  document.getElementById("num").innerHTML = polygons.length;
  var totalArea = 0; //area of reservoirs
  for (var i = 0; i < polygons.length; i++) {
    totalArea += getArea(polygons[i]);
  }
  document.getElementById("area").innerHTML = totalArea.toFixed(2) + " km<sup>2</sup>";
  budget = 10000000 - totalArea * (1000000);
  budget = Math.round(budget / 1000) * 1000;
  document.getElementById("spent").innerHTML = formatter.format(10000000 - budget);
  document.getElementById("remaining").innerHTML = formatter.format(budget);
  budgetBar(budget);
}

function getArea(polygon) {
  var path = polygon.getPath();
  var area = google.maps.geometry.spherical.computeArea(path);
  return (area / 1000000);
}

function initMap() {
  updateToolBox();
  // Map option
  const options = {
    zoom: 11.7,
    center: { lat: 41.980052, lng: -91.25159 },
    fullscreenControlOptions: {
      position: google.maps.ControlPosition.LEFT_TOP,
    },
    mapTypeControlOptions: {
      position: google.maps.ControlPosition.TOP_LEFT,
      style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
      mapTypeIds: ["roadmap", "terrain"],
    },
    streetViewControl: false,
    zoomControlOptions: {
      position: google.maps.ControlPosition.LEFT_TOP,
      style: google.maps.ZoomControlStyle.LARGE,
    }
  };

  //New Map
  map = new google.maps.Map(document.getElementById("map"), options);

  //places toolbox on top right
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(document.getElementById('tools'));
  //places title in top middle of screen
  map.controls[google.maps.ControlPosition.TOP_CENTER].push(document.getElementById('title'));

  document.getElementById("addbutton").disabled = true;
  addbtnClass = document.getElementById("addbutton").classList;
  addbtnClass.add("disabled");

  document.getElementById('toggleoverlay').addEventListener('change', function () {
    if (this.checked) { canvasImg.setOpacity(0.7); }
    else { canvasImg.setOpacity(0); }
  });

  /***A menu that lets a user delete a selected vertex of a path.***/
  class DeleteMenu extends google.maps.OverlayView {
    div_;
    divListener_;
    constructor() {
      super();
      this.div_ = document.createElement("div");
      this.div_.className = "delete-menu";
      this.div_.innerHTML = "Delete";
      const menu = this;
      google.maps.event.addDomListener(this.div_, "click", () => {
        menu.removeVertex();
      });
    }
    onAdd() {
      const deleteMenu = this;
      const map = this.getMap();
      this.getPanes().floatPane.appendChild(this.div_);
      // mousedown anywhere on the map except on the menu div will close the
      // menu.
      this.divListener_ = google.maps.event.addDomListener(
        map.getDiv(),
        "mousedown",
        (e) => {
          if (e.target != deleteMenu.div_) {
            deleteMenu.close();
          }
        },
        true
      );
    }
    onRemove() {
      if (this.divListener_) {
        google.maps.event.removeListener(this.divListener_);
      }
      this.div_.parentNode.removeChild(this.div_);
      // clean up
      this.set("position", null);
      this.set("path", null);
      this.set("vertex", null);
    }
    close() {
      this.setMap(null);
    }
    draw() {
      const position = this.get("position");
      const projection = this.getProjection();

      if (!position || !projection) {
        return;
      }
      const point = projection.fromLatLngToDivPixel(position);
      this.div_.style.top = point.y + "px";
      this.div_.style.left = point.x + "px";
    }
    /**
     * Opens the menu at a vertex of a given path.
     */
    open(map, path, vertex) {
      this.set("position", path.getAt(vertex));
      this.set("path", path);
      this.set("vertex", vertex);
      this.setMap(map);
      this.draw();
    }
    /**
     * Deletes the vertex from the path.
     */
    removeVertex() {
      const path = this.get("path");
      const vertex = this.get("vertex");

      if (!path || vertex == undefined) {
        this.close();
        return;
      }
      path.removeAt(vertex);
      this.close();
    }
  }

  /**makes polygons array that show delete vertex menu**/
  const deleteMenu = new DeleteMenu();
  var infowindow = new google.maps.InfoWindow();

  var rSize = "";
  document.addEventListener('input', function (event) {
    if (event.target.id !== 'selectmenu') return; //if not marker select menu input, exit
    rSize = event.target.options[event.target.selectedIndex].text;
    document.getElementById("addbutton").disabled = false;
    addbtnClass.remove("disabled");
  }, false);

  document.getElementById("addbutton").addEventListener("click", function () {
    // create an array of coordinates for a pentagonal polygon
    var clat = map.getCenter().lat();
    var clng = map.getCenter().lng();

    var x = 0;
    if (rSize === 'Small') { x = 0.001; }
    else if (rSize === 'Medium') { x = 0.002; }
    else if (rSize === 'Large') { x = 0.003; }

    const offset1 = 5;
    const offset2 = 1.545;
    const offset3 = 4.755;
    const offset4 = 4.045;
    const offset5 = 2.939;
    const coords = [
      { lat: clat + offset1 * x, lng: clng },
      { lat: clat + offset2 * x, lng: clng + offset3 * x },
      { lat: clat - offset4 * x, lng: clng + offset5 * x },
      { lat: clat - offset4 * x, lng: clng - offset5 * x },
      { lat: clat + offset2 * x, lng: clng - offset3 * x },
    ];

    //creating editable pentagon with coords given reservoir size
    var pentag = new google.maps.Polygon({
      fillOpacity: 0,
      strokeWeight: 5,
      editable: true,
      draggable: true,
      zIndex: 1,
      paths: coords,
      strokeColor: "red",
      strokeOpacity: 0.8,
      map: map
    });
    google.maps.event.addListener(pentag, "contextmenu", (e) => {
      // Check if click was on a vertex control point
      if (e.vertex == undefined) {
        return;
      }
      deleteMenu.open(map, pentag.getPath(), e.vertex);
    });

    polygons.push(pentag);
    pentag.number = polygons.length;
    google.maps.event.addListener(pentag, 'click', function (event) {
      var path = pentag.getPath();
      var length = google.maps.geometry.spherical.computeLength(path);

      pentag.content =
        '<div style="width:200px; padding:2px; font-size: 15px; line-height: 25%;">' +
        '<h1 style="font-size: 20px; text-align: center;">Reservoir ' + pentag.number + '</h1>' +
        '<p>Area: ' + getArea(pentag).toFixed(2) + ' km<sup>2</sup></p>' +
        '<p>Perimeter: ' + (length / 1000).toFixed(2) + ' km</p>' +
        '<button type="button" class="deletebutton" onclick="deleteShape(' + pentag.number + ')">Delete</button>' +
        '</div>';

      infowindow.setContent(this.content);
      infowindow.setPosition(event.latLng);
      infowindow.open(map, this);
    })
    pentag.setMap(map);

    pentag.getPaths().forEach(function (path, index) {
      google.maps.event.addListener(path, 'insert_at', function () {
        updateToolBox();
      });
      google.maps.event.addListener(path, 'remove_at', function () {
        updateToolBox();
      });
      google.maps.event.addListener(path, 'set_at', function () {
        updateToolBox();
      });

    });
    updateToolBox();
  });

  document.getElementById("start").addEventListener("click", function () {
    startSim();
  });

  /**adds a ground overlay canvas**/
  const imageBounds = {
    north: 42.089439,
    south: 41.859945,
    east: -91.12807,
    west: -91.423679,
  };
  canvasImg = new google.maps.GroundOverlay(
    "elevation.png",
    imageBounds
  );
  canvasImg.setOpacity(0);
  canvasImg.setMap(map);
  //adds red boundary
  const p364 = new google.maps.KmlLayer({
    url: "https://iowawis.org/layers/basins/p364.kmz",
    map: map,
    preserveViewport: true,
  });
  //adds blue river
  const n364 = new google.maps.KmlLayer({
    url: "https://iowawis.org/layers/networks/n364.kmz",
    map: map,
    preserveViewport: true,
  });
}

function startSim() {
  document.getElementById("addbutton").disabled = true;
  document.getElementById("start").disabled = true;
  document.getElementById("start").classList.add("disabled");
  addbtnClass.add("disabled");
  document.getElementById("selectmenu").disabled = true;
  document.getElementById("selectmenu").style.cursor = "not-allowed";
  document.getElementById("bbar").style.backgroundColor = "rgba(187, 42, 42, 0.5)";
  document.getElementById("tbar").style.backgroundColor = "rgba(187, 42, 42, 0.5)";
  clearInterval(timeinterval);
  //makes all reservoirs non-editable
  for(var i = 0; i<polygons.length; i++)
  {
    polygons[i].setDraggable(false);
    polygons[i].setEditable(false);
    polygons[i].setOptions({clickable: false,});
  }
  if(budget<0)
  {
    alert("Unfortunately, you've gone over your allotted budget! We will now delete your most recently created reservoirs until your balance is no longer negative.");
  }
  while(budget<0)
  {
    var shape = polygons.pop();
    shape.setMap(null);
    updateToolBox();
  }
  openFlood();
  //waits 5 seconds and closes
  setTimeout(function() {document.getElementById("flood").style.display = "none";}, 20000);
}

//changes color and length of budget bar depending on how much has been spent
function budgetBar(amt) {
  var elem = document.getElementById("bbar");
  var percent = amt / 100000;
  elem.style.width = percent + "%";
  if (percent <= 0) {
    elem.style.width = "0.1%";
    elem.style.backgroundColor = "red";
  } else if (percent <= 20) {
    elem.style.backgroundColor = "red";
  } else if (percent <= 50) {
    elem.style.backgroundColor = "orange";
  } else {
    elem.style.backgroundColor = "rgb(50, 163, 50)";
  }
  document.getElementById("budpercent").innerHTML = Math.round(percent) + "%";
}

//changes color and length of budget bar depending on how much has been spent
function timerbar() {
  var elem = document.getElementById("tbar");
  var timeleft = time_remaining(deadline).minutes * 60 + time_remaining(deadline).seconds;
  var percent = (timeleft / (time_in_minutes * 60)) * 100;
  elem.style.width = percent + "%";
  if (percent <= 0) {
    elem.style.width = "0.5%";
    elem.style.backgroundColor = "rgba(187, 42, 42, 0.5)";
  } else if (percent <= 20) {
    elem.style.backgroundColor = "red";
  } else if (percent <= 50) {
    elem.style.backgroundColor = "orange";
  } else {
    elem.style.backgroundColor = "rgb(50, 163, 50)";
  }
}

// 5 minutes from now, starts timer
var time_in_minutes = 5;
var current_time = Date.parse(new Date());
var deadline = new Date(current_time + time_in_minutes * 60 * 1000);

function time_remaining(endtime) {
  var t = Date.parse(endtime) - Date.parse(new Date());
  var seconds = Math.floor((t / 1000) % 60);
  var minutes = Math.floor((t / 1000 / 60) % 60);
  var hours = Math.floor((t / (1000 * 60 * 60)) % 24);
  var days = Math.floor(t / (1000 * 60 * 60 * 24));
  return { 'total': t, 'days': days, 'hours': hours, 'minutes': minutes, 'seconds': seconds };
}

var timeinterval;
function run_clock(id, endtime) {
  var clock = document.getElementById(id);
  function update_clock() {
    var t = time_remaining(endtime);
    var sec = t.seconds.toString();
    if (sec < 10) { sec = "0" + sec; };
    clock.innerHTML = t.minutes + ':' + sec;
    if (t.total <= 0) { clearInterval(timeinterval); startSim();}
    timerbar();
  }
  update_clock(); // run function once at first to avoid delay
  timeinterval = setInterval(update_clock, 1000);
}

var paused = false; // is the clock paused?
var time_left; // time left on the clock when paused

function pause_clock() {
  if (!paused) {
    paused = true;
    clearInterval(timeinterval); // stop the clock
    time_left = time_remaining(deadline).total; // preserve remaining time
  }
}

function resume_clock() {
  if (paused) {
    paused = false;

    // update the deadline to preserve the amount of time remaining
    deadline = new Date(Date.parse(new Date()) + time_left);

    // start the clock
    run_clock('floodtime', deadline);
  }
}

