interface Settings {
  dob: string;
  lifeExpectancy: number;
  minPrecision: string;
  maxPrecision: string;
  shape: string;
  size: number;
  unitPrecision: string;
  timerFontSize: number;
  transparentTimer: boolean;
  boldTimer: boolean;
  showAge: boolean;
}

const defaultSettings: Settings = {
  dob: "2000-01-01",
  lifeExpectancy: 80,
  minPrecision: "milliseconds",
  maxPrecision: "years",
  shape: "square",
  size: 80,
  unitPrecision: "weeks",
  timerFontSize: 6,
  transparentTimer: false,
  boldTimer: false,
  showAge: false,
};

document.addEventListener("DOMContentLoaded", () => {
  let settings: Settings = { ...defaultSettings };
  let timerTimeoutId: number | undefined;
  let resizeTimeout: number | undefined;
  let lastGridRenderTime = 0;

  // --- Elements ---
  const canvas = document.getElementById("grid-canvas") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d", { alpha: false });
  const timerDisplay = document.getElementById(
    "timer-display",
  ) as HTMLDivElement;
  const overlayContainer = document.getElementById(
    "overlay-container",
  ) as HTMLDivElement;
  const settingsPanel = document.getElementById(
    "settings-panel",
  ) as HTMLDivElement;
  const settingsToggle = document.getElementById(
    "settings-toggle",
  ) as HTMLButtonElement;
  const closeSettings = document.getElementById(
    "close-settings",
  ) as HTMLButtonElement;

  // Inputs
  const dobInput = document.getElementById("dob-input") as HTMLInputElement;
  const lifeExpectancyInput = document.getElementById(
    "life-expectancy-input",
  ) as HTMLInputElement;

  const minPrecisionInput = document.getElementById(
    "min-precision",
  ) as HTMLSelectElement;
  const maxPrecisionInput = document.getElementById(
    "max-precision",
  ) as HTMLSelectElement;
  const shapeInputs = document.getElementsByName(
    "shape",
  ) as NodeListOf<HTMLInputElement>;
  const sizeInput = document.getElementById("size-input") as HTMLInputElement;

  const unitPrecisionInputs = document.getElementsByName(
    "unit-precision",
  ) as NodeListOf<HTMLInputElement>;

  const fontSizeInput = document.getElementById(
    "font-size-input",
  ) as HTMLInputElement;
  const transparentTimerInput = document.getElementById(
    "transparent-timer",
  ) as HTMLInputElement;
  const boldTimerInput = document.getElementById(
    "bold-timer",
  ) as HTMLInputElement;
  const showAgeInput = document.getElementById("show-age") as HTMLInputElement;

  // Unit Order
  const units = [
    "years",
    "months",
    "days",
    "hours",
    "minutes",
    "seconds",
    "milliseconds",
  ];
  const unitWeights: { [key: string]: number } = {
    years: 6,
    months: 5,
    days: 4,
    hours: 3,
    minutes: 2,
    seconds: 1,
    milliseconds: 0,
  };

  const unitValues: { [key: string]: string } = {};

  let renderTimeout: number | undefined;
  let saveTimeout: number | undefined;

  // --- Storage ---
  async function loadSettings() {
    try {
      const result = await browser.storage.local.get("settings");
      if (result.settings) {
        // Merge safely and validate
        const saved = result.settings;
        settings = normalizeSettings({
          dob:
            typeof saved.dob === "string" && !isNaN(Date.parse(saved.dob))
              ? saved.dob
              : defaultSettings.dob,
          lifeExpectancy: Math.min(
            Math.max(Number(saved.lifeExpectancy) || 80, 1),
            150,
          ),
          minPrecision: units.includes(saved.minPrecision)
            ? saved.minPrecision
            : defaultSettings.minPrecision,
          maxPrecision: units.includes(saved.maxPrecision)
            ? saved.maxPrecision
            : defaultSettings.maxPrecision,
          shape: ["square", "circle"].includes(saved.shape)
            ? saved.shape
            : defaultSettings.shape,
          size: Math.min(Math.max(Number(saved.size) || 80, 10), 100),
          unitPrecision: ["weeks", "months", "years"].includes(
            saved.unitPrecision,
          )
            ? saved.unitPrecision
            : defaultSettings.unitPrecision,
          timerFontSize: Math.min(
            Math.max(Number(saved.timerFontSize) || 6, 1),
            20,
          ),
          transparentTimer: Boolean(saved.transparentTimer),
          boldTimer: Boolean(saved.boldTimer),
          showAge: Boolean(saved.showAge),
        });
      }
    } catch (e) {
      console.error("Error loading settings:", e);
    }
  }

  function updateUI(debounce: boolean = false) {
    applyTheme();
    applyAppearance();
    startTimer();

    if (debounce) {
      if (renderTimeout) clearTimeout(renderTimeout);
      renderTimeout = window.setTimeout(renderGrid, 10);
    } else {
      renderGrid();
    }
  }

  async function saveSettings(debounce: boolean = false) {
    settings = normalizeSettings(settings);
    if (debounce) {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = window.setTimeout(async () => {
        try {
          await browser.storage.local.set({ settings });
        } catch (e) {
          console.error("Error saving settings:", e);
        }
      }, 500);
      updateUI(true);
    } else {
      try {
        await browser.storage.local.set({ settings });
      } catch (e) {
        console.error("Error saving settings:", e);
      }
      updateUI(false);
    }
  }

  function applyTheme() {
    document.body.className = "theme-rainbow";
  }

  function applyAppearance() {
    const size = settings.timerFontSize || 6;
    document.documentElement.style.setProperty(
      "--timer-font-size",
      `${size}rem`,
    );

    if (overlayContainer) {
      overlayContainer.classList.toggle(
        "transparent",
        settings.transparentTimer,
      );
    }

    if (timerDisplay) {
      timerDisplay.classList.toggle("bold-timer", settings.boldTimer);
    }
  }

  // --- Logic ---
  function normalizeSettings(nextSettings: Settings): Settings {
    const normalized = { ...nextSettings };
    const minWeight = unitWeights[normalized.minPrecision];
    const maxWeight = unitWeights[normalized.maxPrecision];

    normalized.lifeExpectancy = clampNumber(
      Number(normalized.lifeExpectancy) || defaultSettings.lifeExpectancy,
      1,
      150,
    );
    normalized.size = clampNumber(
      Number(normalized.size) || defaultSettings.size,
      10,
      100,
    );
    normalized.timerFontSize = clampNumber(
      Number(normalized.timerFontSize) || defaultSettings.timerFontSize,
      1,
      20,
    );

    if (minWeight > maxWeight) {
      normalized.minPrecision = normalized.maxPrecision;
    }

    return normalized;
  }

  function clampNumber(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }

  function populateInputs() {
    if (dobInput) dobInput.value = settings.dob;
    if (lifeExpectancyInput)
      lifeExpectancyInput.value = settings.lifeExpectancy.toString();
    if (minPrecisionInput) minPrecisionInput.value = settings.minPrecision;
    if (maxPrecisionInput) maxPrecisionInput.value = settings.maxPrecision;
    if (sizeInput) sizeInput.value = settings.size.toString();

    if (fontSizeInput) fontSizeInput.value = settings.timerFontSize.toString();
    if (transparentTimerInput)
      transparentTimerInput.checked = settings.transparentTimer;
    if (boldTimerInput) boldTimerInput.checked = settings.boldTimer;
    if (showAgeInput) showAgeInput.checked = settings.showAge;

    if (shapeInputs) {
      shapeInputs.forEach((input) => {
        input.checked = input.value === settings.shape;
      });
    }

    if (unitPrecisionInputs) {
      unitPrecisionInputs.forEach((input) => {
        input.checked = input.value === settings.unitPrecision;
      });
    }
  }

  function renderGrid() {
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.scale(dpr, dpr);

    // Clear background
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    const dob = new Date(settings.dob);
    const now = new Date();
    const lifeExpectancyYears = settings.lifeExpectancy;

    let multiplier = 52;
    if (settings.unitPrecision === "months") multiplier = 12;
    if (settings.unitPrecision === "years") multiplier = 1;

    const totalUnits = lifeExpectancyYears * multiplier;

    const padding = 40;
    const availableWidth = Math.max(100, window.innerWidth - padding);
    const availableHeight = Math.max(100, window.innerHeight - padding);

    const aspect = availableWidth / availableHeight;
    let bestCols = Math.ceil(Math.sqrt(totalUnits * aspect));
    let maxSquareSize = 0;
    let optimizedCols = bestCols;

    for (let c = Math.max(1, bestCols - 2); c <= bestCols + 2; c++) {
      const r = Math.ceil(totalUnits / c);
      const w = availableWidth / c;
      const h = availableHeight / r;
      const sz = Math.min(w, h);
      if (sz > maxSquareSize) {
        maxSquareSize = sz;
        optimizedCols = c;
      }
    }

    bestCols = optimizedCols;
    const boxSize = maxSquareSize;
    const rows = Math.ceil(totalUnits / bestCols);

    const startX = (window.innerWidth - bestCols * boxSize) / 2;
    const startY = (window.innerHeight - rows * boxSize) / 2;

    const dotScale = settings.size / 100;
    const dotSize = boxSize * dotScale;
    const dotOffset = (boxSize - dotSize) / 2;

    // --- Units Lived Calculation ---
    let unitsLived = 0;
    let currentUnitProgress = 0;
    if (settings.unitPrecision === "weeks") {
      const weekMs = 1000 * 60 * 60 * 24 * 7;
      const elapsedMs = Math.max(0, now.getTime() - dob.getTime());
      unitsLived = Math.floor(elapsedMs / weekMs);
      currentUnitProgress = (elapsedMs % weekMs) / weekMs;
    } else if (settings.unitPrecision === "months") {
      unitsLived =
        (now.getFullYear() - dob.getFullYear()) * 12 -
        dob.getMonth() +
        now.getMonth();
      if (now.getDate() < dob.getDate()) unitsLived--;
      unitsLived = Math.max(0, unitsLived);
      const currentMonthStart = addCalendarUnits(dob, unitsLived, "months");
      const nextMonthStart = addCalendarUnits(dob, unitsLived + 1, "months");
      currentUnitProgress = getProgressBetween(
        now,
        currentMonthStart,
        nextMonthStart,
      );
    } else {
      unitsLived = now.getFullYear() - dob.getFullYear();
      const tempDate = new Date(dob);
      tempDate.setFullYear(now.getFullYear());
      if (now < tempDate) unitsLived--;
      unitsLived = Math.max(0, unitsLived);
      const currentYearStart = addCalendarUnits(dob, unitsLived, "years");
      const nextYearStart = addCalendarUnits(dob, unitsLived + 1, "years");
      currentUnitProgress = getProgressBetween(
        now,
        currentYearStart,
        nextYearStart,
      );
    }

    unitsLived = Math.min(unitsLived, totalUnits);

    const colors = [
      "#e91e63",
      "#ff5722",
      "#ffc107",
      "#8bc34a",
      "#4caf50",
      "#00bcd4",
      "#2196f3",
      "#3f51b5",
      "#673ab7",
    ];
    let colorDivisor =
      settings.unitPrecision === "weeks"
        ? 520
        : settings.unitPrecision === "months"
          ? 120
          : 10;

    const isCircle = settings.shape === "circle";

    for (let i = 0; i < totalUnits; i++) {
      const col = i % bestCols;
      const row = Math.floor(i / bestCols);
      const x = startX + col * boxSize + dotOffset;
      const y = startY + row * boxSize + dotOffset;

      const unitColor = colors[Math.floor(i / colorDivisor) % colors.length];
      const isPastUnit = i < unitsLived;
      const isCurrentUnit = i === unitsLived && unitsLived < totalUnits;

      ctx.fillStyle = isPastUnit ? unitColor : "#222222";

      if (isCircle) {
        ctx.beginPath();
        ctx.arc(x + dotSize / 2, y + dotSize / 2, dotSize / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, dotSize, dotSize);
      }

      if (isCurrentUnit && currentUnitProgress > 0) {
        fillUnitProgress(
          ctx,
          x,
          y,
          dotSize,
          currentUnitProgress,
          unitColor,
          isCircle,
        );
      }
    }

    lastGridRenderTime = Date.now();
  }

  function addCalendarUnits(
    date: Date,
    amount: number,
    unit: "months" | "years",
  ) {
    const result = new Date(date);
    const targetDay = date.getDate();

    result.setDate(1);
    if (unit === "months") {
      result.setMonth(date.getMonth() + amount);
    } else {
      result.setFullYear(date.getFullYear() + amount);
    }
    result.setDate(Math.min(targetDay, getLastDayOfMonth(result)));
    return result;
  }

  function getLastDayOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }

  function getProgressBetween(now: Date, start: Date, end: Date) {
    const duration = end.getTime() - start.getTime();
    if (duration <= 0) return 0;
    return Math.min(
      Math.max((now.getTime() - start.getTime()) / duration, 0),
      1,
    );
  }

  function fillUnitProgress(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    progress: number,
    color: string,
    isCircle: boolean,
  ) {
    const normalizedProgress = Math.min(Math.max(progress, 0), 1);

    context.save();
    if (isCircle) {
      const centerX = x + size / 2;
      const centerY = y + size / 2;
      const radius = size / 2;
      const startAngle = -Math.PI / 2;
      const endAngle = startAngle + Math.PI * 2 * normalizedProgress;

      context.beginPath();
      context.moveTo(centerX, centerY);
      context.arc(centerX, centerY, radius, startAngle, endAngle);
      context.closePath();
      context.fillStyle = color;
      context.fill();
    } else {
      const fillHeight = size * normalizedProgress;
      const fillY = y + size - fillHeight;

      context.fillStyle = color;
      context.fillRect(x, fillY, size, fillHeight);
    }
    context.restore();
  }

  // Resize Listener
  window.addEventListener("resize", () => {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = window.setTimeout(renderGrid, 100);
  });

  function startTimer() {
    if (timerTimeoutId) clearTimeout(timerTimeoutId);

    const loop = () => {
      updateTimerDisplay();
      if (Date.now() - lastGridRenderTime >= 60_000) {
        renderGrid();
      }
      timerTimeoutId = window.setTimeout(loop, getTimerDelay());
    };
    loop();

    // Apply Precision Visibility
    units.forEach((unit) => {
      const el = document.getElementById(unit);
      if (!el || !el.parentElement) return;

      const unitWeight = unitWeights[unit];
      const minWeight = unitWeights[settings.minPrecision || "milliseconds"];
      const maxWeight = unitWeights[settings.maxPrecision || "years"];

      el.parentElement.style.display =
        unitWeight >= minWeight && unitWeight <= maxWeight ? "flex" : "none";
    });
  }

  function getTimerDelay() {
    return settings.minPrecision === "milliseconds" ? 33 : 1000;
  }

  function updateTimerDisplay() {
    const now = new Date();
    const dob = new Date(settings.dob);
    const lifeExpectancyYears = settings.lifeExpectancy;
    let diff: number;

    if (settings.showAge) {
      diff = now.getTime() - dob.getTime();
    } else {
      const deathDate = new Date(dob);
      deathDate.setFullYear(dob.getFullYear() + lifeExpectancyYears);
      diff = deathDate.getTime() - now.getTime();
    }

    if (diff < 0) diff = 0;

    const ms = Math.floor((diff % 1000) / 10);
    let seconds = Math.floor(diff / 1000);
    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);
    let days = Math.floor(hours / 24);
    let months = 0;
    let years = 0;

    seconds %= 60;
    minutes %= 60;
    hours %= 24;

    if (days >= 365) {
      years = Math.floor(days / 365);
      days %= 365;
    }
    if (days >= 30) {
      months = Math.floor(days / 30);
      days %= 30;
    }

    updateUnit("years", years);
    updateUnit("months", months);
    updateUnit("days", days);
    updateUnit("hours", hours);
    updateUnit("minutes", minutes);
    updateUnit("seconds", seconds);
    updateUnit("milliseconds", ms);
  }

  function updateUnit(id: string, value: number) {
    const el = document.getElementById(id);
    if (!el || el.parentElement?.style.display === "none") return;

    const valStr = value.toString().padStart(2, "0");
    if (unitValues[id] !== valStr) {
      el.textContent = valStr;
      unitValues[id] = valStr;
    }
  }

  function setupEventListeners() {
    settingsToggle?.addEventListener("click", () =>
      settingsPanel.classList.toggle("hidden"),
    );
    closeSettings?.addEventListener("click", () =>
      settingsPanel.classList.add("hidden"),
    );

    dobInput?.addEventListener("change", (e) => {
      const val = (e.target as HTMLInputElement).value;
      settings.dob = !isNaN(new Date(val).getTime())
        ? val
        : defaultSettings.dob;
      saveSettings();
    });

    lifeExpectancyInput?.addEventListener("change", (e) => {
      settings.lifeExpectancy = clampNumber(
        parseInt((e.target as HTMLInputElement).value, 10) ||
          defaultSettings.lifeExpectancy,
        1,
        150,
      );
      saveSettings();
    });

    minPrecisionInput?.addEventListener("change", (e) => {
      settings.minPrecision = (e.target as HTMLInputElement).value;
      if (
        unitWeights[settings.minPrecision] > unitWeights[settings.maxPrecision]
      ) {
        settings.maxPrecision = settings.minPrecision;
        if (maxPrecisionInput) maxPrecisionInput.value = settings.maxPrecision;
      }
      saveSettings();
    });

    maxPrecisionInput?.addEventListener("change", (e) => {
      settings.maxPrecision = (e.target as HTMLInputElement).value;
      if (
        unitWeights[settings.minPrecision] > unitWeights[settings.maxPrecision]
      ) {
        settings.minPrecision = settings.maxPrecision;
        if (minPrecisionInput) minPrecisionInput.value = settings.minPrecision;
      }
      saveSettings();
    });

    sizeInput?.addEventListener("input", (e) => {
      settings.size = clampNumber(
        parseInt((e.target as HTMLInputElement).value, 10) ||
          defaultSettings.size,
        10,
        100,
      );
      saveSettings(true);
    });

    fontSizeInput?.addEventListener("input", (e) => {
      settings.timerFontSize = clampNumber(
        parseFloat((e.target as HTMLInputElement).value) ||
          defaultSettings.timerFontSize,
        1,
        20,
      );
      saveSettings(true);
    });

    transparentTimerInput?.addEventListener("change", (e) => {
      settings.transparentTimer = (e.target as HTMLInputElement).checked;
      saveSettings();
    });

    boldTimerInput?.addEventListener("change", (e) => {
      settings.boldTimer = (e.target as HTMLInputElement).checked;
      saveSettings();
    });

    showAgeInput?.addEventListener("change", (e) => {
      settings.showAge = (e.target as HTMLInputElement).checked;
      saveSettings();
    });

    shapeInputs?.forEach((input) => {
      input.addEventListener("change", (e) => {
        if ((e.target as HTMLInputElement).checked) {
          settings.shape = (e.target as HTMLInputElement).value;
          saveSettings();
        }
      });
    });

    unitPrecisionInputs?.forEach((input) => {
      input.addEventListener("change", (e) => {
        if ((e.target as HTMLInputElement).checked) {
          settings.unitPrecision = (e.target as HTMLInputElement).value;
          saveSettings();
        }
      });
    });
  }

  async function init() {
    await loadSettings();
    populateInputs();
    setupEventListeners();
    updateUI();
  }

  init();
});
