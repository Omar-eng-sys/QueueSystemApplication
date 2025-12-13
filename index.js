// ===== Helper Functions (Ported from Java Logic) =====

// 1. Greatest Common Divisor (GCD) for scaled integers
function gcd(a, b) {
    while (b !== 0) {
        let temp = b;
        b = a % b;
        a = temp;
    }
    return a;
}

// 2. Least Common Multiple (LCM) with precision handling
function calculateLCM(a, b) {
    const SCALE = 1000;
    const aScaled = Math.round(a * SCALE);
    const bScaled = Math.round(b * SCALE);

    // LCM(a, b) = abs(a*b) / GCD(a,b)
    // We calculate in scaled integer domain to avoid floating point errors
    const lcmScaled = Math.abs(aScaled * bScaled) / gcd(aScaled, bScaled);

    return lcmScaled / SCALE;
}

// 3. New Simulation-based Ti Calculation (The "Fix" for finding correct saturation time)
function getTiSaturation(lambda, mu, k) {
    const interArrivalTime = 1.0 / lambda;
    const serviceTime = 1.0 / mu;

    let t = interArrivalTime;
    const step = Math.min(interArrivalTime, serviceTime) / 1000.0; // Small time step for precision
    let maxIter = 2000000; // Safety break

    while (maxIter > 0) {
        // The Java Logic: n(t) = floor(lambda * t) - floor(mu * t - mu/lambda)
        // Note: (mu * t - mu/lambda) simplifies to mu * (t - 1/lambda) -> time since first arrival processed by service
        let term1 = Math.floor(lambda * t);
        let term2 = Math.floor(mu * t - mu / lambda);
        let n_t = term1 - term2;

        if (Math.round(n_t) === k) {
            return Math.round(t * 100.0) / 100.0;
        }

        t += step;
        maxIter--;
    }

    // Fallback if not found (should not happen in valid saturation case)
    return -1;
}

// ===== Modified n(t) Logic =====

function calculate_n_t(t, lambda, mu, ti, k, m) {
    let n;

    // Case 1: Saturation (Lambda > Mu) -> THIS IS THE UPDATED PART
    if (lambda > mu) {
        const interArrivalTime = 1.0 / lambda;
        const serviceTime = 1.0 / mu;

        // Before saturation (Transient State)
        if (t < ti) {
            if (t < interArrivalTime) {
                n = 0;
            } else {
                n = Math.floor(lambda * t) - Math.floor(mu * t - mu / lambda);
            }
        }
        // After saturation (Steady/Cyclic State) -> Java Logic applied here
        else {
            const delta = serviceTime - interArrivalTime; // The 'shift' per customer
            const lcmTime = calculateLCM(interArrivalTime, serviceTime);
            const N_samples = Math.round(lcmTime / delta);
            const cycleLength = N_samples * delta; // Should equal lcmTime usually

            // Calculate 'r' (Cycle Counter)
            // r = floor( (t - ti) / CycleLength )
            const r = Math.floor((t - ti) / cycleLength);

            // Calculate t_prime (Time position within current cycle)
            const t_prime = t - (ti + r * cycleLength);

            // Determine n(t) based on position in the cycle
            if (t_prime < delta) {
                n = k - 1;
            } else if (t_prime < 2 * delta) {
                n = k - 2;
            } else {
                n = k - 1;
            }
        }
    }
    // Case 2: Non-Saturation (Mu > Lambda) -> Kept original logic (Queue empties)
    else if (mu > lambda) {
        // Note: Usually ti here means time to empty.
        // We use the passed 'ti' which should be calculated by getTiSecondCase
        if (t < ti) {
            n = m + Math.floor(lambda * t) - Math.floor(mu * t);
        } else {
            n = 0; // System is empty
        }
    }
    // Case 3: Stability (Lambda == Mu)
    else {
        n = 1; // Simplistic assumption for D/D/1 stability
    }

    // Return the calculated value, ensuring it's not negative and doesn't exceed K (safety)
    // Also ensuring integer output
    return Math.min(Math.max(0, Math.round(n)), k);
}

// Second case (Emptying) - Kept as is
function getTiSecondCase(lambda, mu, m) {
    // t = m / (mu - lambda)
    return m / (mu - lambda);
}

// Calculating wq (Kept mostly as is, but relies on accurate n(t))
function waitingTime(lambda, mu, ti, M, nOft) {
    let Wq;

    if (lambda > mu) {
        if (nOft === 0) {
            Wq = 0;
        } else if (nOft < lambda * ti) {
            // Basic D/D/1 Wq formula
            Wq = (1 / mu - 1 / lambda) * (nOft - 1);
        } else {
            // Saturated Wq formula often involves the cycle,
            // but standard approximation is (1/mu - 1/lambda)*(n-2) or similar.
            Wq = (1 / mu - 1 / lambda) * (nOft - 2);
        }
    } else if (mu > lambda) {
        if (nOft === 0) {
            Wq = 0;
        } else {
            Wq = (M + nOft - 1) * (1 / mu) - nOft * (1 / lambda);
        }
    } else {
        Wq = 0;
    }
    return Math.max(0, Wq);
}

// ===== Main Application Logic =====

document.addEventListener("DOMContentLoaded", () => {
    // ===  Select ALL elements from HTML page ===
    const systemTypeSelect = document.getElementById("system-type");
    const arrivalRateInput = document.getElementById("arrival-rate");
    const serviceRateInput = document.getElementById("service-rate");
    const kInput = document.getElementById("system-constant");
    const mInput = document.getElementById("initial-customers");
    const tInput = document.getElementById("indicating-time");

    const ntButton = document.getElementById("calc-nt-btn");
    const wqButton = document.getElementById("calc-wq-btn");
    const lqButton = document.getElementById("calc-lq-btn");
    const realWqButton = document.getElementById("calc-real-wq-btn");
    const sketchButton = document.getElementById("sketch-btn");

    // ===== sweet alert function =====
    function showThemedAlert(title, text = "", icon = "info") {
        Swal.fire({
            title: title,
            text: text,
            icon: icon,
            confirmButtonText: "OK",
            confirmButtonColor: "#48607c",
            color: "#48607c",
            background: "#faf6efff",
            willOpen: popup => {
                popup.style.borderRadius = "15px";
            }
        });
    }

    function showResultAlert(message) {
        Swal.fire({
            title: "Calculation Complete",
            html: message,
            icon: "success",
            confirmButtonText: "OK",
            confirmButtonColor: "#48607c",
            color: "#48607c",
            background: "#faf6efff",
            willOpen: popup => {
                popup.style.borderRadius = "15px";
            }
        });
    }

    // === UI Logic ===
    systemTypeSelect.addEventListener("change", updateFormUI);
    updateFormUI();

    function updateFormUI() {
        const type = systemTypeSelect.value;
        const kGroup = document.querySelector(".input-group.K");
        const kLabel = document.querySelector("label[for='system-constant']");
        const mGroup = document.querySelector(".input-group.M");
        const tGroup = document.getElementById("time-input-group");

        kGroup.style.gridColumn = "";

        if (type === "M/M/1") {
            kGroup.style.display = "none";
            mGroup.style.display = "none";
            tGroup.style.display = "none";
            ntButton.textContent = "Calculate L";
            wqButton.textContent = "Calculate W";
            lqButton.style.display = "block";
            realWqButton.style.display = "block";
            sketchButton.style.display = "none";
            wqButton.style.backgroundColor = "#a35138";
            realWqButton.style.backgroundColor = "#a35138";
        } else if (type === "M/M/C") {
            kGroup.style.display = "block";
            kGroup.style.gridColumn = "1 / -1";
            kLabel.textContent = "Number of Servers ";
            kInput.placeholder = "Enter the value of C";
            mGroup.style.display = "none";
            tGroup.style.display = "none";
            ntButton.textContent = "Calculate L";
            wqButton.textContent = "Calculate W";
            lqButton.style.display = "block";
            realWqButton.style.display = "block";
            sketchButton.style.display = "none";
            wqButton.style.backgroundColor = "#a35138";
            realWqButton.style.backgroundColor = "#a35138";
        } else {
            // D/D/1/K-1
            kGroup.style.display = "block";
            kLabel.textContent = "System Constant ";
            kInput.placeholder = "Enter the value of K";
            mGroup.style.display = "block";
            tGroup.style.display = "block";
            ntButton.textContent = "Calculate n(t)";
            wqButton.textContent = "Calculate Wq(n)";
            lqButton.style.display = "none";
            realWqButton.style.display = "none";
            sketchButton.style.display = "block";
            wqButton.style.backgroundColor = "";
            realWqButton.style.backgroundColor = "";
        }
    }

    // ===== 2. M/M/C Logic (Updated & Verified with Lecture) =====

    function calculateMMC(lambda, mu, c) {
        const r = lambda / mu; // Traffic intensity (r)
        const rho = r / c; // Utilization factor (rho)

        // Lecture Condition: Stability requires rho < 1 (lambda < c * mu)
        if (rho >= 1) return null;

        // 1. Calculate P0 (Probability of zero customers)
        let sum = 0;
        // First term: Summation from n=0 to c-1
        for (let n = 0; n < c; n++) {
            sum += Math.pow(r, n) / factorial(n);
        }
        // Second term: (r^c) / (c! * (1-rho))
        const termC = Math.pow(r, c) / (factorial(c) * (1 - rho));

        const P0 = 1 / (sum + termC);

        // 2. Calculate Lq (Length of Queue)
        // Formula: (P0 * r^c * rho) / (c! * (1-rho)^2)
        const Lq = (P0 * Math.pow(r, c) * rho) / (factorial(c) * Math.pow(1 - rho, 2));

        // 3. Calculate Wq (Wait in Queue) -> Little's Law for Queue
        const Wq = Lq / lambda;

        // 4. Calculate W (Wait in System)
        const W = Wq + 1 / mu;

        // 5. Calculate L (Length of System) -> Little's Law for System
        const L = lambda * W;

        // Optional: Idle Probability (Probability that ALL servers are idle = P0)
        // Or Probability that at least one server is idle (1 - P(all busy))
        // We stick to the main metrics for now.

        return { L, W, Lq, Wq, P0 };
    }

    /**
     * Button 1: Calculate n(t) or L
     */
    ntButton.addEventListener("click", () => {
        const type = systemTypeSelect.value;
        const lambda = eval(arrivalRateInput.value);
        const mu = eval(serviceRateInput.value);

        if (isNaN(lambda) || isNaN(mu)) {
            showThemedAlert("Missing Data!", "Please check Lambda and Mu values.", "warning");
            return;
        }

        if (type === "D/D/1/K-1") {
            const k = parseFloat(kInput.value);
            const m = parseFloat(mInput.value);
            const t = parseFloat(tInput.value);

            if (isNaN(k) || isNaN(m) || isNaN(t)) {
                showThemedAlert("Missing Data!", "Please fill all input fields.", "warning");
                return;
            }

            let ti = 0;
            // UPDATED: Using the new Simulation function for Lambda > Mu
            if (lambda > mu) {
                // Using the Simulation Logic derived from Java
                ti = getTiSaturation(lambda, mu, k);

                // Safety check if ti wasn't found (e.g. invalid K)
                if (ti === -1) {
                    showThemedAlert(
                        "Calculation Error",
                        "Could not determine saturation time (ti). Check inputs.",
                        "error"
                    );
                    return;
                }
            } else if (mu > lambda) {
                // Keep original logic for emptying case
                ti = getTiSecondCase(lambda, mu, m);
            }

            const ntResult = calculate_n_t(t, lambda, mu, ti, k, m);

            // Format result message
            const resultMessage = `Number of customers n(${t}) = <strong>${ntResult}</strong>
                                 <br><small>(Calculated ti: ${ti.toFixed(2)})</small>`;
            showResultAlert(resultMessage);
        } else if (type === "M/M/1") {
            // ... M/M/1 Logic ...
            if (lambda >= mu) {
                showThemedAlert("Unstable System", "Lambda must be less than Mu.", "error");
                return;
            }
            const L = lambda / (mu - lambda);
            showResultAlert(`Average number of customers L = <strong>${L.toFixed(4)}</strong>`);
        } else if (type === "M/M/C") {
            // ... M/M/C Logic (Unchanged) ...
            const c = parseFloat(kInput.value);
            if (isNaN(c)) {
                showThemedAlert("Missing Data!", "Please enter the number of servers (C).", "warning");
                return;
            }
            const results = calculateMMC(lambda, mu, c);
            if (!results) {
                showThemedAlert("Unstable System", "Lambda must be less than C * Mu.", "error");
                return;
            }
            showResultAlert(`Average number of customers L = <strong>${results.L.toFixed(4)}</strong>`);
        }
    });

    /**
     * Button 2: Calculate Wq(n) or Wq (Using Updated Ti)
     */
    wqButton.addEventListener("click", async () => {
        const type = systemTypeSelect.value;
        const lambda = eval(arrivalRateInput.value);
        const mu = eval(serviceRateInput.value);

        if (isNaN(lambda) || isNaN(mu)) {
            showThemedAlert("Missing Data!", "Please check Lambda and Mu values.", "warning");
            return;
        }

        if (type === "D/D/1/K-1") {
            const k = parseFloat(kInput.value);
            const m = parseFloat(mInput.value);

            if (isNaN(k) || isNaN(m)) {
                showThemedAlert("Missing Data!", "System Constant (K) and Initial Customers (M).", "warning");
                return;
            }

            let ti = 0;
            // UPDATED: Using new logic here too
            if (lambda > mu) {
                ti = getTiSaturation(lambda, mu, k);
                if (ti === -1) {
                    showThemedAlert("Calculation Error", "Could not determine saturation time (ti).", "error");
                    return;
                }
            } else if (mu > lambda) {
                ti = getTiSecondCase(lambda, mu, m);
            }

            const { value: nInput } = await Swal.fire({
                title: "Enter Customer Number (n)",
                input: "number",
                inputLabel: "Calculate waiting time for the n-th customer",
                inputPlaceholder: "Enter n",
                showCancelButton: true,
                confirmButtonText: "Calculate",
                confirmButtonColor: "#48607c",
                color: "#48607c",
                background: "#faf6efff",
                willOpen: popup => {
                    popup.style.borderRadius = "15px";
                }
            });

            if (nInput === null || nInput === "") return;
            const n = parseFloat(nInput);
            if (isNaN(n) || n < 0) {
                showThemedAlert("Invalid Input", "Please enter valid n.", "error");
                return;
            }

            const wqResult = waitingTime(lambda, mu, ti, m, n);
            const resultMessage = `Waiting time for customer ${n}, Wq(${n}) = <strong>${wqResult.toFixed(4)}</strong>
                                 <br><small>(Calculated with ti = ${ti.toFixed(2)})</small>`;
            showResultAlert(resultMessage);
        } else if (type === "M/M/1" || type === "M/M/C") {
            // ... Kept Unchanged ...
            if (type === "M/M/1") {
                if (lambda >= mu) {
                    showThemedAlert("Unstable System", "Lambda < Mu required.", "error");
                    return;
                }
                const W = 1 / (mu - lambda);
                showResultAlert(`Average waiting time W = <strong>${W.toFixed(4)}</strong>`);
            } else {
                const c = parseFloat(kInput.value);
                if (isNaN(c)) {
                    showThemedAlert("Missing Data", "Enter C", "warning");
                    return;
                }
                const res = calculateMMC(lambda, mu, c);
                if (!res) {
                    showThemedAlert("Unstable", "Lambda < C*Mu", "error");
                    return;
                }
                showResultAlert(`Average waiting time W = <strong>${res.W.toFixed(4)}</strong>`);
            }
        }
    });

    // ... Remainder of the code (lqButton, realWqButton, sketchButton, Custom Select) ...
    // ... Copy the rest from your original file starting from lqButton event listener ...

    lqButton.addEventListener("click", () => {
        // ... (Same as original) ...
        const type = systemTypeSelect.value;
        const lambda = eval(arrivalRateInput.value);
        const mu = eval(serviceRateInput.value);

        if (isNaN(lambda) || isNaN(mu)) {
            showThemedAlert("Missing Data!", "Please check Lambda and Mu values.", "warning");
            return;
        }

        if (type === "M/M/1") {
            if (lambda >= mu) {
                showThemedAlert("Unstable System", "Lambda must be less than Mu.", "error");
                return;
            }
            const Lq = (lambda * lambda) / (mu * (mu - lambda));
            showResultAlert(`Average number of customers in queue Lq = <strong>${Lq.toFixed(4)}</strong>`);
        } else if (type === "M/M/C") {
            const c = parseFloat(kInput.value);
            if (isNaN(c)) {
                showThemedAlert("Missing Data!", "Please enter the number of servers (C).", "warning");
                return;
            }
            const results = calculateMMC(lambda, mu, c);
            if (!results) {
                showThemedAlert("Unstable System", "Lambda must be less than C * Mu.", "error");
                return;
            }
            showResultAlert(`Average number of customers in queue Lq = <strong>${results.Lq.toFixed(4)}</strong>`);
        }
    });

    realWqButton.addEventListener("click", () => {
        // ... (Same as original) ...
        const type = systemTypeSelect.value;
        const lambda = eval(arrivalRateInput.value);
        const mu = eval(serviceRateInput.value);

        if (isNaN(lambda) || isNaN(mu)) {
            showThemedAlert("Missing Data!", "Please check Lambda and Mu values.", "warning");
            return;
        }

        if (type === "M/M/1") {
            if (lambda >= mu) {
                showThemedAlert("Unstable System", "Lambda must be less than Mu.", "error");
                return;
            }
            const Wq = lambda / (mu * (mu - lambda));
            showResultAlert(`Average waiting time in queue Wq = <strong>${Wq.toFixed(4)}</strong>`);
        } else if (type === "M/M/C") {
            const c = parseFloat(kInput.value);
            if (isNaN(c)) {
                showThemedAlert("Missing Data!", "Please enter the number of servers (C).", "warning");
                return;
            }
            const results = calculateMMC(lambda, mu, c);
            if (!results) {
                showThemedAlert("Unstable System", "Lambda must be less than C * Mu.", "error");
                return;
            }
            showResultAlert(`Average waiting time in queue Wq = <strong>${results.Wq.toFixed(4)}</strong>`);
        }
    });

    sketchButton.addEventListener("click", () => {
        // ... (Same as original) ...
        const lambda = eval(arrivalRateInput.value);
        const mu = eval(serviceRateInput.value);
        const k = parseFloat(kInput.value);
        const t = parseFloat(tInput.value);

        if (isNaN(lambda) || isNaN(mu) || isNaN(k) || isNaN(t)) {
            showThemedAlert("Missing Data !", "Enter Lambda, Mu, K, and t.", "warning");
            return;
        }
        const url = `New edit/diagram.html?lambda=${lambda}&mu=${mu}&k=${k}&t=${t}`;
        window.location.href = url;
    });

    // === Custom Select Logic (Same as original) ===
    const customSelectWrapper = document.querySelector(".custom-select-wrapper");
    const customSelect = customSelectWrapper.querySelector(".custom-select");
    const customSelectTrigger = customSelect.querySelector(".custom-select__trigger");
    const customOptions = customSelect.querySelectorAll(".custom-option");
    const hiddenSelect = document.getElementById("system-type");

    customSelectTrigger.addEventListener("click", () => {
        customSelect.classList.toggle("open");
    });

    customOptions.forEach(option => {
        option.addEventListener("click", function () {
            customSelect.classList.remove("open");
            customOptions.forEach(opt => opt.classList.remove("selected"));
            this.classList.add("selected");
            customSelectTrigger.querySelector("span").textContent = this.textContent;
            hiddenSelect.value = this.getAttribute("data-value");
            hiddenSelect.dispatchEvent(new Event("change"));
        });
    });

    window.addEventListener("click", e => {
        if (!customSelect.contains(e.target)) {
            customSelect.classList.remove("open");
        }
    });
});
