// Parse all input fields in the form and return a parameters object
function getParametersFromForm() {
    return {
        CurrentSavings: Number(document.getElementById('currentSavings').value),
        AnnualSavings: Number(document.getElementById('annualSavings').value),
        YearsUntilRetirement: Number(document.getElementById('yearsUntilRetirement').value),
        RetirementYears: Number(document.getElementById('retirementYears').value),
        AnnualExpenses: Number(document.getElementById('annualExpenses').value),
        // Convert percent input to decimal for calculations
        InflationRate: Number(document.getElementById('inflationRate').value) / 100,
        RetirementTaxRate: Number(document.getElementById('retirementTaxRate').value) / 100,
        // Convert percent input to decimal for calculations
        MeanReturn: Number(document.getElementById('meanReturn').value) / 100,
        StandardDeviationReturn: Number(document.getElementById('standardDeviationReturn').value),
        NumSimulations: Number(document.getElementById('numSimulations').value)
    };
}

function mulberry32(seed) {
    return function() {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function makeNormalGenerator(mean, stddev) {
    // Use Box-Muller transform with seeded RNG
    let spare = null;
    // Use current time as seed
    const seed = Date.now() & 0xffffffff;
    const rng = mulberry32(seed);
    return function() {
        if (spare !== null) {
            const val = spare;
            spare = null;
            return mean + stddev * val;
        }
        let u, v, s;
        do {
            u = rng() * 2 - 1;
            v = rng() * 2 - 1;
            s = u * u + v * v;
        } while (s === 0 || s >= 1);
        const mul = Math.sqrt(-2.0 * Math.log(s) / s);
        spare = v * mul;
        return mean + stddev * u * mul;
    };
}

function retirementSimulation(params, randomDistribution) {
    // params: {
    //   CurrentSavings, AnnualSavings, YearsUntilRetirement, RetirementYears, AnnualExpenses, InflationRate, RetirementTaxRate
    // }
    // randomDistribution: function returning a random value (mean/variance handled by generator)

    const assets = [];
    let savings = params.CurrentSavings;

    // Accumulation phase
    for (let workingYear = 0; workingYear < params.YearsUntilRetirement; workingYear++) {
        const annualReturn = randomDistribution();
        savings *= 1 + annualReturn;
        savings += params.AnnualSavings;
        assets.push(savings);
    }

    let expenses = params.AnnualExpenses;

    // Retirement phase
    for (let retirementYear = 0; retirementYear < params.RetirementYears; retirementYear++) {
        const annualReturn = randomDistribution();
        savings *= 1 + annualReturn;

        const grossWithdrawal = expenses / (1 - params.RetirementTaxRate);
        savings -= grossWithdrawal;
        assets.push(savings);

        expenses *= 1 + params.InflationRate;
    }

    return assets;
}

function drawGrowthChart({ ctx, startYear, endYear, data }) {
    const years = Array.from({length: endYear - startYear + 1}, (_, i) => startYear + i);
    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: years,
            datasets: [{
                label: 'Portfolio Value (USD)',
                data: data,
                borderColor: '#059669',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: '#059669',
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#166534',
                        font: { family: 'Montserrat', weight: 'bold' }
                    }
                },
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Year',
                        color: '#166534',
                        font: { family: 'Montserrat', weight: 'bold' }
                    },
                    ticks: { color: '#166534' }
                },
                y: {
                    title: {
                        display: true,
                        text: 'USD',
                        color: '#166534',
                        font: { family: 'Montserrat', weight: 'bold' }
                    },
                    ticks: {
                        color: '#166534',
                        callback: function(value) {
                            return '$' + value.toLocaleString();
                        }
                    },
                    beginAtZero: true
                }
            }
        }
    });
}

let growthChartInstance = null;


// Run multiple simulations and return avg, p5, p95 arrays
function runSimulations(params, makeNormalGenerator) {
    const numSimulations = params.NumSimulations || 1;
    const allSimulations = [];
    let maxLen = 0;
    for (let i = 0; i < numSimulations; i++) {
        // Use a different seed for each simulation for variety
        const normalGen = makeNormalGenerator(params.MeanReturn, params.StandardDeviationReturn);
        const sim = retirementSimulation(params, normalGen);
        allSimulations.push(sim);
        if (sim.length > maxLen) maxLen = sim.length;
    }
    // Pad all simulations to maxLen with last value
    for (let sim of allSimulations) {
        while (sim.length < maxLen) {
            sim.push(sim[sim.length - 1]);
        }
    }
    // Calculate average, 5th, and 95th percentiles for each year
    const avg = [];
    const p5 = [];
    const p95 = [];
    for (let year = 0; year < maxLen; year++) {
        const values = allSimulations.map(sim => sim[year]).sort((a, b) => a - b);
        const n = values.length;
        avg.push(values.reduce((sum, v) => sum + v, 0) / n);
        const idx5 = Math.floor(0.05 * (n - 1));
        p5.push(values[idx5]);
        const idx95 = Math.ceil(0.95 * (n - 1));
        p95.push(values[idx95]);
    }
    return { avg, p5, p95 };
}

function updateGrowthChart(endYear) {
    const startYear = 2025;
    const params = getParametersFromForm();
    // Use the new runSimulations function
    const { avg, p5, p95 } = runSimulations(params, makeNormalGenerator);
    const ctx = document.getElementById('growthChart').getContext('2d');
    if (growthChartInstance) {
        growthChartInstance.destroy();
    }
    const years = Array.from({length: avg.length}, (_, i) => startYear + i);
    growthChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: years,
            datasets: [
                {
                    label: 'Average Portfolio Value (USD)',
                    data: avg,
                    borderColor: '#059669',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: false,
                    tension: 0.3,
                    pointRadius: 2,
                    pointBackgroundColor: '#059669',
                    order: 1
                },
                {
                    label: '95th Percentile',
                    data: p95,
                    borderColor: 'rgba(59,130,246,0.5)',
                    backgroundColor: 'rgba(59,130,246,0.1)',
                    fill: '-1',
                    pointRadius: 0,
                    borderWidth: 0,
                    order: 0
                },
                {
                    label: '5th Percentile',
                    data: p5,
                    borderColor: 'rgba(239,68,68,0.5)',
                    backgroundColor: 'rgba(239,68,68,0.1)',
                    fill: '-1',
                    pointRadius: 0,
                    borderWidth: 0,
                    order: 0
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#166534',
                        font: { family: 'Montserrat', weight: 'bold' }
                    }
                },
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Year',
                        color: '#166534',
                        font: { family: 'Montserrat', weight: 'bold' }
                    },
                    ticks: { color: '#166534' }
                },
                y: {
                    title: {
                        display: true,
                        text: 'USD',
                        color: '#166534',
                        font: { family: 'Montserrat', weight: 'bold' }
                    },
                    ticks: {
                        color: '#166534',
                        callback: function(value) {
                            return '$' + value.toLocaleString();
                        }
                    },
                    beginAtZero: true
                }
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    const yearsUntilRetirementInput = document.getElementById('yearsUntilRetirement');
    const startYear = 2025;
    let endYear = startYear + Number(yearsUntilRetirementInput.value);
    updateGrowthChart(endYear);

    planningHorizonForm.addEventListener('submit', function(e) {
        e.preventDefault();
        endYear = startYear + Number(yearsUntilRetirementInput.value);
        updateGrowthChart(endYear);
    });
});
