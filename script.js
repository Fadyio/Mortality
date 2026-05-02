"use strict";
const defaultSettings = {
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
    let settings = { ...defaultSettings };
    let timerRequestId;
    let resizeTimeout;
    let lastTotalUnits = -1;
    let lastUnitsLived = -1;
    // --- Elements ---
    const canvas = document.getElementById("grid-canvas");
    const ctx = canvas.getContext("2d", { alpha: false });
    const timerDisplay = document.getElementById("timer-display");
    const timerTitle = document.getElementById("timer-title");
    const overlayContainer = document.getElementById("overlay-container");
    const settingsPanel = document.getElementById("settings-panel");
    const settingsToggle = document.getElementById("settings-toggle");
    const closeSettings = document.getElementById("close-settings");
    // Inputs
    const dobInput = document.getElementById("dob-input");
    const lifeExpectancyInput = document.getElementById("life-expectancy-input");
    const minPrecisionInput = document.getElementById("min-precision");
    const maxPrecisionInput = document.getElementById("max-precision");
    const shapeInputs = document.getElementsByName("shape");
    const sizeInput = document.getElementById("size-input");
    const unitPrecisionInputs = document.getElementsByName("unit-precision");
    const fontSizeInput = document.getElementById("font-size-input");
    const transparentTimerInput = document.getElementById("transparent-timer");
    const boldTimerInput = document.getElementById("bold-timer");
    const showAgeInput = document.getElementById("show-age");
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
    const unitWeights = {
        years: 6,
        months: 5,
        days: 4,
        hours: 3,
        minutes: 2,
        seconds: 1,
        milliseconds: 0,
    };
    const unitValues = {};
    let renderTimeout;
    let saveTimeout;
    // --- Storage ---
    async function loadSettings() {
        try {
            const result = await browser.storage.local.get("settings");
            if (result.settings) {
                // Merge safely and validate
                const saved = result.settings;
                settings = {
                    dob: typeof saved.dob === "string" && !isNaN(Date.parse(saved.dob))
                        ? saved.dob
                        : defaultSettings.dob,
                    lifeExpectancy: Math.min(Math.max(Number(saved.lifeExpectancy) || 80, 1), 150),
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
                    unitPrecision: ["weeks", "months", "years"].includes(saved.unitPrecision)
                        ? saved.unitPrecision
                        : defaultSettings.unitPrecision,
                    timerFontSize: Math.min(Math.max(Number(saved.timerFontSize) || 6, 1), 20),
                    transparentTimer: Boolean(saved.transparentTimer),
                    boldTimer: Boolean(saved.boldTimer),
                    showAge: Boolean(saved.showAge),
                };
            }
        }
        catch (e) {
            console.error("Error loading settings:", e);
        }
    }
    function updateUI(debounce = false) {
        applyTheme();
        applyAppearance();
        startTimer();
        if (debounce) {
            if (renderTimeout)
                clearTimeout(renderTimeout);
            renderTimeout = window.setTimeout(renderGrid, 10);
        }
        else {
            renderGrid();
        }
    }
    async function saveSettings(debounce = false) {
        if (debounce) {
            if (saveTimeout)
                clearTimeout(saveTimeout);
            saveTimeout = window.setTimeout(async () => {
                try {
                    await browser.storage.local.set({ settings });
                }
                catch (e) {
                    console.error("Error saving settings:", e);
                }
            }, 500);
            updateUI(true);
        }
        else {
            try {
                await browser.storage.local.set({ settings });
            }
            catch (e) {
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
        document.documentElement.style.setProperty("--timer-font-size", `${size}rem`);
        if (overlayContainer) {
            overlayContainer.classList.toggle("transparent", settings.transparentTimer);
        }
        if (timerDisplay) {
            timerDisplay.classList.toggle("bold-timer", settings.boldTimer);
        }
    }
    // --- Logic ---
    function populateInputs() {
        if (dobInput)
            dobInput.value = settings.dob;
        if (lifeExpectancyInput)
            lifeExpectancyInput.value = settings.lifeExpectancy.toString();
        if (minPrecisionInput)
            minPrecisionInput.value = settings.minPrecision;
        if (maxPrecisionInput)
            maxPrecisionInput.value = settings.maxPrecision;
        if (sizeInput)
            sizeInput.value = settings.size.toString();
        if (fontSizeInput)
            fontSizeInput.value = settings.timerFontSize.toString();
        if (transparentTimerInput)
            transparentTimerInput.checked = settings.transparentTimer;
        if (boldTimerInput)
            boldTimerInput.checked = settings.boldTimer;
        if (showAgeInput)
            showAgeInput.checked = settings.showAge;
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
        if (!canvas || !ctx)
            return;
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
        if (settings.unitPrecision === "months")
            multiplier = 12;
        if (settings.unitPrecision === "years")
            multiplier = 1;
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
        if (settings.unitPrecision === "weeks") {
            unitsLived = Math.floor(Math.abs(now.getTime() - dob.getTime()) / (1000 * 60 * 60 * 24 * 7));
        }
        else if (settings.unitPrecision === "months") {
            unitsLived =
                (now.getFullYear() - dob.getFullYear()) * 12 -
                    dob.getMonth() +
                    now.getMonth();
            if (now.getDate() < dob.getDate())
                unitsLived--;
        }
        else {
            unitsLived = now.getFullYear() - dob.getFullYear();
            const tempDate = new Date(dob);
            tempDate.setFullYear(now.getFullYear());
            if (now < tempDate)
                unitsLived--;
        }
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
        let colorDivisor = settings.unitPrecision === "weeks"
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
            if (i < unitsLived) {
                ctx.fillStyle = colors[Math.floor(i / colorDivisor) % colors.length];
            }
            else if (i === unitsLived) {
                ctx.fillStyle = "#ffffff";
            }
            else {
                ctx.fillStyle = "#222222";
            }
            if (isCircle) {
                ctx.beginPath();
                ctx.arc(x + dotSize / 2, y + dotSize / 2, dotSize / 2, 0, Math.PI * 2);
                ctx.fill();
            }
            else {
                ctx.fillRect(x, y, dotSize, dotSize);
            }
            if (i === unitsLived) {
                ctx.strokeStyle = "white";
                ctx.lineWidth = 1;
                if (isCircle)
                    ctx.stroke();
                else
                    ctx.strokeRect(x - 1, y - 1, dotSize + 2, dotSize + 2);
            }
        }
    }
    // Resize Listener
    window.addEventListener("resize", () => {
        if (resizeTimeout)
            clearTimeout(resizeTimeout);
        resizeTimeout = window.setTimeout(renderGrid, 100);
    });
    function startTimer() {
        if (timerRequestId)
            cancelAnimationFrame(timerRequestId);
        const loop = () => {
            updateTimerDisplay();
            timerRequestId = requestAnimationFrame(loop);
        };
        timerRequestId = requestAnimationFrame(loop);
        if (timerTitle) {
            timerTitle.style.display = "none";
        }
        // Apply Precision Visibility
        units.forEach((unit) => {
            const el = document.getElementById(unit);
            if (!el || !el.parentElement)
                return;
            const unitWeight = unitWeights[unit];
            const minWeight = unitWeights[settings.minPrecision || "milliseconds"];
            const maxWeight = unitWeights[settings.maxPrecision || "years"];
            el.parentElement.style.display =
                unitWeight >= minWeight && unitWeight <= maxWeight ? "flex" : "none";
        });
    }
    function updateTimerDisplay() {
        const now = new Date();
        const dob = new Date(settings.dob);
        const lifeExpectancyYears = settings.lifeExpectancy;
        let diff;
        if (settings.showAge) {
            diff = now.getTime() - dob.getTime();
        }
        else {
            const deathDate = new Date(dob);
            deathDate.setFullYear(dob.getFullYear() + lifeExpectancyYears);
            diff = deathDate.getTime() - now.getTime();
        }
        if (diff < 0)
            diff = 0;
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
    function updateUnit(id, value) {
        const el = document.getElementById(id);
        if (!el || el.parentElement?.style.display === "none")
            return;
        const valStr = value.toString().padStart(2, "0");
        if (unitValues[id] !== valStr) {
            el.innerText = valStr;
            unitValues[id] = valStr;
        }
    }
    function setupEventListeners() {
        settingsToggle?.addEventListener("click", () => settingsPanel.classList.toggle("hidden"));
        closeSettings?.addEventListener("click", () => settingsPanel.classList.add("hidden"));
        dobInput?.addEventListener("change", (e) => {
            const val = e.target.value;
            settings.dob = !isNaN(new Date(val).getTime())
                ? val
                : defaultSettings.dob;
            saveSettings();
        });
        lifeExpectancyInput?.addEventListener("change", (e) => {
            settings.lifeExpectancy = Math.min(Math.max(parseInt(e.target.value, 10) || 80, 1), 150);
            saveSettings();
        });
        minPrecisionInput?.addEventListener("change", (e) => {
            settings.minPrecision = e.target.value;
            saveSettings();
        });
        maxPrecisionInput?.addEventListener("change", (e) => {
            settings.maxPrecision = e.target.value;
            saveSettings();
        });
        sizeInput?.addEventListener("input", (e) => {
            settings.size = parseInt(e.target.value, 10) || 80;
            saveSettings(true);
        });
        fontSizeInput?.addEventListener("input", (e) => {
            settings.timerFontSize =
                parseFloat(e.target.value) || 6;
            saveSettings(true);
        });
        transparentTimerInput?.addEventListener("change", (e) => {
            settings.transparentTimer = e.target.checked;
            saveSettings();
        });
        boldTimerInput?.addEventListener("change", (e) => {
            settings.boldTimer = e.target.checked;
            saveSettings();
        });
        showAgeInput?.addEventListener("change", (e) => {
            settings.showAge = e.target.checked;
            saveSettings();
        });
        shapeInputs?.forEach((input) => {
            input.addEventListener("change", (e) => {
                if (e.target.checked) {
                    settings.shape = e.target.value;
                    saveSettings();
                }
            });
        });
        unitPrecisionInputs?.forEach((input) => {
            input.addEventListener("change", (e) => {
                if (e.target.checked) {
                    settings.unitPrecision = e.target.value;
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
