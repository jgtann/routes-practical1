// js/routeEngine.js

function initRoute(config) {
  const {
    heading,
    initialView,
    route,
    landmarks,
    trafficLights = [],
    audioBasePath = "audio/"
  } = config;

  // --- DOM ELEMENTS ---
  const headingEl = document.querySelector("h2");
  if (headingEl && heading) headingEl.textContent = heading;

  const remarkBox = document.getElementById("remark-box");
  const progressBar = document.getElementById("progress-bar");
  const progressText = document.getElementById("progress-text");
  const speedSlider = document.getElementById("speedSlider");
  const speedLabel = document.getElementById("speed-label");
  const narrationAudio = document.getElementById("narrationPlayer");
  const voiceToggle = document.getElementById("voiceToggle");
  const currentNarrationEl = document.getElementById("current-narration");
  const nextNarrationEl = document.getElementById("next-narration");
  const checkpointList = document.getElementById("checkpoint-list");
  const timerBox = document.getElementById("timer-box");

  // --- MAIN MAP ---
  const map = L.map('map').setView(
    [initialView.lat, initialView.lng],
    initialView.zoom
  );
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  const polyline = L.polyline(route, { color: 'blue', weight: 5 }).addTo(map);
  map.fitBounds(polyline.getBounds());

  // --- LANDMARKS ---
  landmarks.forEach(lm => {
    L.marker(lm.coords).addTo(map).bindPopup(lm.name);
  });

  // --- MINI-MAP ---
  const miniMap = L.map('mini-map', {
    zoomControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    attributionControl: false
  });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')
    .addTo(miniMap);
  const miniPolyline = L.polyline(route, { color: 'blue', weight: 3 }).addTo(miniMap);
  miniMap.fitBounds(miniPolyline.getBounds());

  // --- TRAFFIC LIGHTS ---
  let lightTimer = 0;

  function getLightState(light, timer) {
    const total = light.cycle.green + light.cycle.amber + light.cycle.red;
    const t = (timer + (light.offset || 0)) % total;
    if (t < light.cycle.green) return "green";
    if (t < light.cycle.green + light.cycle.amber) return "amber";
    return "red";
  }

  trafficLights.forEach(light => {
    const marker = L.circleMarker(light.coords, {
      radius: 6,
      color: 'red',
      fillColor: 'red',
      fillOpacity: 0.9
    }).addTo(map).bindPopup(light.name);
    light.marker = marker;
    light.state = "red";
  });

  if (trafficLights.length > 0) {
    setInterval(() => {
      lightTimer++;
      trafficLights.forEach(light => {
        const state = getLightState(light, lightTimer);
        light.state = state;
        const color =
          state === "green" ? "green" :
          state === "amber" ? "orange" : "red";
        light.marker.setStyle({ color, fillColor: color });
      });
    }, 1000);
  }

  function getTrafficLightNear(position) {
    return trafficLights.find(light =>
      Math.abs(light.coords[0] - position[0]) < 0.0005 &&
      Math.abs(light.coords[1] - position[1]) < 0.0005
    );
  }

  // --- CAR MARKERS ---
  const carIcon = L.icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/854/854894.png',
    iconSize: [35, 35]
  });
  const car = L.marker(route[0], { icon: carIcon }).addTo(map);

  const miniCarIcon = L.icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/854/854894.png',
    iconSize: [20, 20]
  });
  const miniCar = L.marker(route[0], { icon: miniCarIcon }).addTo(miniMap);

  let currentIndex = 0;
  let running = false;
  let moveTimer = null;

  // --- SPEED CONTROL ---
  let speedSetting = 2; // 1=Slow, 2=Normal, 3=Fast

  function updateSpeedLabel() {
    if (!speedLabel) return;
    if (speedSetting === 1) speedLabel.textContent = "Slow";
    else if (speedSetting === 2) speedLabel.textContent = "Normal";
    else speedLabel.textContent = "Fast";
  }
  function getStepDelay() {
    return 60 * (4 - speedSetting); // 1->180ms, 2->120ms, 3->60ms
  }

  if (speedSlider) {
    speedSlider.addEventListener("input", () => {
      speedSetting = parseInt(speedSlider.value, 10);
      updateSpeedLabel();
    });
  }
  updateSpeedLabel();

  // --- TIMER (route timer, not real clock) ---
  let routeTimer = 0;
  let timerInterval = null;

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function startTimer() {
    if (!timerBox) return;
    if (timerInterval) return;
    timerInterval = setInterval(() => {
      routeTimer++;
      timerBox.textContent = `⏱ ${formatTime(routeTimer)}`;
    }, 1000);
  }

  function stopTimer() {
    if (!timerInterval) return;
    clearInterval(timerInterval);
    timerInterval = null;
  }

  function resetTimer() {
    if (!timerBox) return;
    stopTimer();
    routeTimer = 0;
    timerBox.textContent = "⏱ 00:00";
  }

  // --- NARRATION + CHECKPOINTS ---
  function playNarrationFor(landmark) {
    if (!voiceToggle || !narrationAudio) return;
    if (!voiceToggle.checked) return;
    if (!landmark.audioId) return;
    const src = `${audioBasePath}${landmark.audioId}.mp3`;
    narrationAudio.src = src;
    narrationAudio.play().catch(() => {});
  }

  function updateNarrationPanel(currentLm, nextLm) {
    if (currentNarrationEl) {
      if (currentLm) {
        currentNarrationEl.innerHTML =
          `<strong>Current:</strong> ${currentLm.name}`;
      } else {
        currentNarrationEl.innerHTML =
          "<strong>Current:</strong> None yet — starting soon.";
      }
    }
    if (nextNarrationEl) {
      if (nextLm) {
        nextNarrationEl.innerHTML =
          `<strong>Next:</strong> ${nextLm.name}`;
      } else {
        nextNarrationEl.innerHTML =
          "<strong>Next:</strong> End of route.";
      }
    }
  }

  function buildCheckpointList() {
    if (!checkpointList) return;
    checkpointList.innerHTML = "";
    landmarks.forEach((lm, idx) => {
      const li = document.createElement("li");
      li.id = `checkpoint-${idx}`;
      li.classList.add("checkpoint");
      li.innerHTML = `<span class="checkpoint-icon">⬜</span><span>${lm.name}</span>`;
      checkpointList.appendChild(li);
    });
    if (landmarks.length > 0) {
      updateNarrationPanel(null, landmarks[0]);
    }
  }
  buildCheckpointList();

  function markCheckpointDone(landmark) {
    if (!checkpointList) return;
    const idx = landmarks.indexOf(landmark);
    if (idx === -1) return;
    const li = document.getElementById(`checkpoint-${idx}`);
    if (!li) return;
    li.classList.add("done");
    const iconSpan = li.querySelector(".checkpoint-icon");
    if (iconSpan) iconSpan.textContent = "✔";
  }

  function handleLandmarksAt(position) {
    const nearbyLandmark = landmarks.find(l =>
      !l.shown &&
      Math.abs(l.coords[0] - position[0]) < 0.0008 &&
      Math.abs(l.coords[1] - position[1]) < 0.0008
    );
    if (nearbyLandmark) {
      nearbyLandmark.shown = true;
      if (remarkBox) remarkBox.innerText = nearbyLandmark.remark;
      playNarrationFor(nearbyLandmark);
      markCheckpointDone(nearbyLandmark);
      const currentIdx = landmarks.indexOf(nearbyLandmark);
      const nextLm = landmarks[currentIdx + 1] || null;
      updateNarrationPanel(nearbyLandmark, nextLm);
    } else {
      if (remarkBox) remarkBox.innerText = "Moving along the route...";
    }
  }

  // --- PROGRESS ---
  function updateProgress(currentIdx, segmentProgress) {
    if (!progressBar || !progressText) return;
    const totalSegments = route.length - 1;
    const overall = (currentIdx + segmentProgress) / totalSegments;
    const percent = Math.max(0, Math.min(100, Math.floor(overall * 100)));
    progressBar.style.width = percent + "%";
    progressText.innerText = "Progress: " + percent + "%";
  }

  function clearMoveTimer() {
    if (moveTimer) {
      clearTimeout(moveTimer);
      moveTimer = null;
    }
  }

  // --- MOVEMENT ENGINE ---
  function moveCar() {
    if (!running) return;
    if (currentIndex >= route.length - 1) {
      if (remarkBox) remarkBox.innerText = "🏁 Route completed!";
      if (progressBar && progressText) {
        progressBar.style.width = "100%";
        progressText.innerText = "Progress: 100%";
      }
      const startBtn = document.getElementById("startBtn");
      const stopBtn = document.getElementById("stopBtn");
      if (startBtn) startBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;
      running = false;
      stopTimer();
      return;
    }

    const from = route[currentIndex];
    const to = route[currentIndex + 1];
    let progress = 0;

    const step = () => {
      if (!running) return;

      const lat = from[0] + (to[0] - from[0]) * progress;
      const lng = from[1] + (to[1] - from[1]) * progress;
      const pos = [lat, lng];

      const light = getTrafficLightNear(pos);
      if (light && (light.state === "red" || light.state === "amber")) {
        if (remarkBox) {
          remarkBox.innerText = `🛑 Red light at ${light.name}. Please wait...`;
        }
        moveTimer = setTimeout(step, 500);
        return;
      }

      car.setLatLng(pos);
      miniCar.setLatLng(pos);
      updateProgress(currentIndex, progress);

      progress += 0.02;
      if (progress >= 1) {
        currentIndex++;
        const finalPos = route[currentIndex];
        car.setLatLng(finalPos);
        miniCar.setLatLng(finalPos);
        handleLandmarksAt(finalPos);
        moveCar();
      } else {
        moveTimer = setTimeout(step, getStepDelay());
      }
    };

    step();
  }

  // --- BUTTONS ---
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const prevBtn = document.getElementById("prevBtn");
  const resetBtn = document.getElementById("resetBtn");

  if (startBtn) {
    startBtn.addEventListener("click", () => {
      if (!running) {
        if (currentIndex === 0) {
          landmarks.forEach(l => delete l.shown);
          if (checkpointList) {
            checkpointList.querySelectorAll(".checkpoint").forEach(li => {
              li.classList.remove("done");
              const iconSpan = li.querySelector(".checkpoint-icon");
              if (iconSpan) iconSpan.textContent = "⬜";
            });
          }
          if (landmarks.length > 0) {
            updateNarrationPanel(null, landmarks[0]);
          }
          if (remarkBox) {
            remarkBox.innerText = "Starting the route. Look out for key landmarks along the way.";
          }
          updateProgress(0, 0);
          resetTimer();
        } else {
          if (remarkBox) remarkBox.innerText = "Resuming the route...";
        }
        running = true;
        startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        startTimer();
        moveCar();
      }
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      running = false;
      clearMoveTimer();
      stopTimer(); // timer pauses when you manually stop
      if (startBtn) startBtn.disabled = false;
      stopBtn.disabled = true;
      if (remarkBox) remarkBox.innerText = "⏹ Route paused.";
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      running = false;
      clearMoveTimer();
      if (currentIndex > 0) {
        currentIndex--;
        const pos = route[currentIndex];
        car.setLatLng(pos);
        miniCar.setLatLng(pos);
        if (remarkBox) remarkBox.innerText = "Moved to previous point.";
        updateProgress(currentIndex, 0);
      } else {
        if (remarkBox) remarkBox.innerText = "Already at the start point.";
        updateProgress(0, 0);
      }
      if (startBtn) startBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      running = false;
      clearMoveTimer();
      currentIndex = 0;
      car.setLatLng(route[0]);
      miniCar.setLatLng(route[0]);
      landmarks.forEach(l => delete l.shown);
      if (checkpointList) {
        checkpointList.querySelectorAll(".checkpoint").forEach(li => {
          li.classList.remove("done");
          const iconSpan = li.querySelector(".checkpoint-icon");
          if (iconSpan) iconSpan.textContent = "⬜";
        });
      }
      if (remarkBox) {
        remarkBox.innerText = "Route reset. Press Start to begin again.";
      }
      updateProgress(0, 0);
      resetTimer();
      if (landmarks.length > 0) {
        updateNarrationPanel(null, landmarks[0]);
      }
      if (startBtn) startBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;
    });
  }

  // Initialise timer display
  if (timerBox) timerBox.textContent = "⏱ 00:00";
}
