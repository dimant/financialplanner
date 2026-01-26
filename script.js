let growthChartInstance = null;

/**
 * Mulberry32 pseudorandom number generator implementation
 * @param {number} seed - Seed value for the generator
 * @returns {Function} Function that returns random numbers between 0 and 1
 */
function mulberry32(seed) {
    return function() {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

/**
 * Creates a normal distribution random number generator
 * @param {number} mean - Mean of the normal distribution
 * @param {number} stddev - Standard deviation of the normal distribution
 * @returns {Function} Function that returns normally distributed random numbers
 */
function makeNormalGenerator(mean, stddev) {
    let spare = null;
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
        const mul = Math.sqrt(-2 * Math.log(s) / s);
        spare = v * mul;
        return mean + stddev * u * mul;
    };
}

/**
 * Simulates retirement portfolio growth over time
 * @param {Object} params - Retirement parameters (savings, expenses, returns, etc.)
 * @param {Function} randomDistribution - Random number generator function
 * @returns {Array} Array of portfolio values over time
 */
function retirementSimulation(params, randomDistribution) {
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

/**
 * Runs multiple simulations and returns aggregated statistics
 * @param {Function} simulation - Simulation function to run
 * @param {number} numSimulations - Number of simulations to run
 * @returns {Object} Object with avg, p5, and p95 percentile arrays
 */
function runSimulations(simulation, numSimulations) {
    const allSimulations = [];
    let maxLen = 0;
    for (let i = 0; i < numSimulations; i++) {
        const sim = simulation();
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

/**
 * Collects retirement form inputs and returns them as an object
 * @returns {Object} Object containing retirement parameters
 */
function getRetirementParametersFromForm() {
    return {
        CurrentSavings: Number(document.getElementById('currentSavings').value),
        AnnualSavings: Number(document.getElementById('annualSavings').value),
        YearsUntilRetirement: Number(document.getElementById('yearsUntilRetirement').value),
        RetirementYears: Number(document.getElementById('retirementYears').value),
        AnnualExpenses: Number(document.getElementById('annualExpenses').value),
        InflationRate: Number(document.getElementById('inflationRate').value) / 100,
        RetirementTaxRate: Number(document.getElementById('retirementTaxRate').value) / 100,
        MeanReturn: Number(document.getElementById('meanReturn').value) / 100,
        StandardDeviationReturn: Number(document.getElementById('standardDeviationReturn').value),
        NumSimulations: Number(document.getElementById('numSimulations').value)
    };
}

/**
 * Updates the growth chart with new simulation data
 * @param {number} startYear - Starting year for the chart
 * @param {Function} dataGenerator - Function that generates simulation data
 */
function updateGrowthChart(startYear, dataGenerator) {
    const { avg, p5, p95 } = dataGenerator();
    const ctx = document.getElementById('growthChart');
    if (!ctx) return;
    
    if (growthChartInstance) {
        growthChartInstance.destroy();
    }
    
    const years = Array.from({ length: avg.length }, (_, i) => startYear + i);
    growthChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: years,
            datasets: [
                {
                    label: '5th Percentile',
                    data: p5,
                    borderColor: 'transparent',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 0,
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    order: 3
                },
                {
                    label: '95th Percentile',
                    data: p95,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 1,
                    borderDash: [5, 5],
                    fill: 0,
                    tension: 0.4,
                    pointRadius: 0,
                    order: 2
                },
                {
                    label: 'Expected (Mean)',
                    data: avg,
                    borderColor: '#059669',
                    backgroundColor: 'rgba(5, 150, 105, 0.05)',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        font: {
                            size: 12,
                            weight: 'bold'
                        },
                        padding: 15,
                        usePointStyle: true
                    }
                },
                filler: {
                    propagate: true
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toLocaleString();
                        },
                        font: {
                            size: 11
                        }
                    },
                    title: {
                        display: true,
                        text: 'Portfolio Value ($)',
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Years',
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        font: {
                            size: 11
                        }
                    }
                }
            }
        }
    });
}

// Initialize chart on page load
document.addEventListener('DOMContentLoaded', function() {
    const startYear = new Date().getFullYear();
    
    const dataGenerator = () => {
        const params = getRetirementParametersFromForm();
        const simulation = () => retirementSimulation(params, makeNormalGenerator(params.MeanReturn, params.StandardDeviationReturn));
        return runSimulations(simulation, params.NumSimulations);
    };

    // Defer initial chart calculation to avoid blocking DOMContentLoaded
    requestAnimationFrame(() => {
        updateGrowthChart(startYear, dataGenerator);
    });

    // Hook up form submission to update chart
    const form = document.querySelector('form');
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            updateGrowthChart(startYear, dataGenerator);
        });
    }
});
