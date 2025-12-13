document.addEventListener("DOMContentLoaded", () => {
    // === Read all data from the page URL ===
    const urlParams = new URLSearchParams(window.location.search);
    const lambda = parseFloat(urlParams.get("lambda"));
    const mu = parseFloat(urlParams.get("mu"));
    const k = parseFloat(urlParams.get("k"));
    const t_indicator = parseFloat(urlParams.get("t"));

    if (!lambda || !mu || !k) {
        document.body.innerHTML = "<h1>Error: Missing required data (lambda, mu, or k). Please go back.</h1>";
        return;
    }

    // === Generate the data (FIXED DURATION) ===

    const fixedTime = 50;

    const { labels, data } = generateChartData(lambda, mu, fixedTime, k);

    // === Draw the chart (pass fixed axis limit) ===
    drawChart(labels, data, fixedTime, k, t_indicator);
});

function generateChartData(lambda, mu, simulationDuration, k) {
    const interArrivalTime = 1 / lambda;
    const serviceTime = 1 / mu;

    let events = [];
    let departureQueue = []; // A queue of departure times
    let customersInSystem = 0;
    const tolerance = 1e-9; // To handle floating point issues

    // 1. Process arrivals one by one
    for (let t_arrival = interArrivalTime; t_arrival <= simulationDuration + tolerance; t_arrival += interArrivalTime) {
        // 1a. Process all departures that happen *before* this new arrival
        while (departureQueue.length > 0 && departureQueue[0] <= t_arrival + tolerance) {
            const t_depart = departureQueue.shift(); // Remove from queue
            if (t_depart <= simulationDuration + tolerance) {
                events.push({ time: t_depart, type: "departure" });
            }
            customersInSystem--;
        }

        // 1b. Now, process the new arrival
        if (customersInSystem < k - 1) {
            // System has space. Customer gets in.
            customersInSystem++;
            events.push({ time: t_arrival, type: "arrival" });

            // Calculate departure time
            const lastDeparture = departureQueue.length > 0 ? departureQueue[departureQueue.length - 1] : 0;
            const serviceStartTime = Math.max(t_arrival, lastDeparture);
            const newDepartureTime = serviceStartTime + serviceTime;

            departureQueue.push(newDepartureTime); // Add to the *end* of the queue
        } else {
            // System is full. Customer balks. Do nothing.
        }
    }

    // 2. Add any remaining departures after the last arrival
    while (departureQueue.length > 0) {
        const t_depart = departureQueue.shift();
        if (t_depart <= simulationDuration + tolerance) {
            events.push({ time: t_depart, type: "departure" });
        }
    }

    // 3. Sort all *actual* events
    events.sort((a, b) => {
        if (Math.abs(a.time - b.time) > tolerance) {
            return a.time - b.time;
        }
        return a.type === "departure" ? -1 : 1;
    });

    // 4. Process events to build chart data
    let labels = [0];
    let data = [0];
    customersInSystem = 0;

    const uniqueTimes = [];
    if (events.length > 0) {
        uniqueTimes.push(events[0].time);
        for (let i = 1; i < events.length; i++) {
            if (Math.abs(events[i].time - uniqueTimes[uniqueTimes.length - 1]) > tolerance) {
                uniqueTimes.push(events[i].time);
            }
        }
    }

    uniqueTimes.forEach(time => {
        if (labels[labels.length - 1] < time - tolerance) {
            labels.push(time - tolerance); // Add point right before
            data.push(customersInSystem);
        }

        const eventsAtThisTime = events.filter(e => Math.abs(e.time - time) <= tolerance);
        eventsAtThisTime.forEach(event => {
            customersInSystem += event.type === "arrival" ? 1 : -1;
        });

        labels.push(time);
        data.push(customersInSystem);
    });

    if (labels[labels.length - 1] < simulationDuration) {
        labels.push(simulationDuration);
        data.push(customersInSystem);
    }

    return { labels, data };
}

// Draw the chart :
function drawChart(labels, data, fixedTime, k, t_indicator) {
    const ctx = document.getElementById("queueChartCanvas").getContext("2d");

    const annotation = {
        type: "line",
        scaleID: "x",
        value: t_indicator,
        borderColor: "rgba(255, 204, 0, 0.8)",
        borderWidth: 3,
        borderDash: [6, 6],
        label: {
            content: "t = " + t_indicator,
            display: t_indicator ? true : false,
            position: "start",
            backgroundColor: "rgba(255, 204, 0, 0.8)",
            color: "#333",
            font: { weight: "bold" }
        }
    };

    new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [
                {
                    label: "Number of Customers n(t)",
                    data: data,
                    borderColor: "#CE7759",
                    borderWidth: 2.5,
                    stepped: true,
                    pointRadius: 0,
                    pointBackgroundColor: "#CE7759"
                }
            ]
        },
        options: {
            scales: {
                x: {
                    type: "linear",
                    title: { display: true, text: "Time (t)", color: "#48607c" },
                    min: 0,
                    max: fixedTime,
                    ticks: {
                        stepSize: 1,
                        color: "#48607c"
                    },
                    grid: {
                        color: "rgba(72, 96, 124, 0.2)",
                        borderDash: [5, 5]
                    }
                },
                y: {
                    beginAtZero: true,
                    max: k,
                    ticks: {
                        stepSize: 1,
                        color: "#48607c"
                    },
                    title: { display: true, text: "n(t)", color: "#48607c" },
                    grid: {
                        color: "rgba(72, 96, 124, 0.2)",
                        borderDash: [5, 5]
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: "#48607c"
                    }
                },
                annotation: {
                    annotations: {
                        // The yellow line is the only thing that uses 't'
                        ...(t_indicator && { line1: annotation })
                    }
                }
            }
        }
    });
}
