document.addEventListener('DOMContentLoaded', function() {
    function setupToolLink(linkId, htmlFile, initFunctionName) {
        var link = document.getElementById(linkId);
        if (link) {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                fetch(htmlFile)
                    .then(function(response) { return response.text(); })
                    .then(function(html) {
                        document.getElementById('tool-content').innerHTML = html;
                        setTimeout(function() {
                            var scripts = document.getElementById('tool-content').querySelectorAll('script');
                            scripts.forEach(function(oldScript) {
                                var newScript = document.createElement('script');
                                if (oldScript.src) {
                                    newScript.src = oldScript.src;
                                } else {
                                    newScript.textContent = oldScript.textContent;
                                }
                                oldScript.parentNode.replaceChild(newScript, oldScript);
                            });
                            if (typeof window[initFunctionName] === 'function') {
                                window[initFunctionName]();
                            }
                        }, 0);
                    });
            });
        }
    }

    setupToolLink('retirement-link', 'retirement.html', 'initRetirementPlanner');
    setupToolLink('homepurchase-link', 'homepurchase.html', 'initHomePurchasePlanner');

    // Add event listener for Home button
    var homeLink = document.getElementById('home-link');
    if (homeLink) {
        homeLink.addEventListener('click', function(e) {
            e.preventDefault();
            fetch('home.html')
                .then(function(response) { return response.text(); })
                .then(function(html) {
                    document.getElementById('tool-content').innerHTML = html;
                });
        });
    }
});

function getHomePurchaseParametersFromForm() {
    return {
        // Home Purchase (Owner)
        downPayment: Number(document.getElementById('downPayment').value),
        loanAmount: Number(document.getElementById('loanAmount').value),
        mortgageRate: Number(document.getElementById('mortgageRate').value) / 100,
        mortgageYears: Number(document.getElementById('mortgageYears').value),
        monthlyPayment: Number(document.getElementById('monthlyPayment').value),
        homeAppreciationMean: Number(document.getElementById('homeAppreciationMean').value) / 100,
        homeAppreciationStd: Number(document.getElementById('homeAppreciationStd').value),
        propertyTaxes: Number(document.getElementById('propertyTaxes').value),
        homeInsurance: Number(document.getElementById('homeInsurance').value),
        maintenanceRate: Number(document.getElementById('maintenanceRate').value) / 100,
        hoaFees: Number(document.getElementById('hoaFees').value),
        buyingCosts: Number(document.getElementById('buyingCosts').value) / 100,
        sellingCosts: Number(document.getElementById('sellingCosts').value) / 100,
        taxRate: Number(document.getElementById('taxRate').value) / 100,
        NumSimulations: Number(document.getElementById('numSimulations').value)
    };
}

function getRetirementParametersFromForm() {
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

let growthChartInstance = null;


// Run multiple simulations and return avg, p5, p95 arrays
function runSimulations(simulation, numSimulations) {
    const allSimulations = [];
    let maxLen = 0;
    for (let i = 0; i < numSimulations; i++) {
        // Use a different seed for each simulation for variety
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

function updateGrowthChart(startYear, dataGenerator) {
    const { avg, p5, p95 } = dataGenerator();
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

// Expose initRetirementPlanner globally so it can be called after dynamic content load
function initRetirementPlanner() {
    const yearsUntilRetirementInput = document.getElementById('yearsUntilRetirement');
    const planningHorizonForm = document.getElementById('planningHorizonForm');
    if (!yearsUntilRetirementInput || !planningHorizonForm) return;
    const startYear = new Date().getFullYear();

    const dataGenerator = () => {
        const params = getRetirementParametersFromForm();
        const simulation = () => retirementSimulation(params, makeNormalGenerator(params.MeanReturn, params.StandardDeviationReturn));
        return runSimulations(simulation, params.NumSimulations);
    };

    let endYear = startYear + Number(yearsUntilRetirementInput.value);
    updateGrowthChart(startYear, dataGenerator);

    // Remove previous event listeners by cloning the form
    const newForm = planningHorizonForm.cloneNode(true);
    planningHorizonForm.parentNode.replaceChild(newForm, planningHorizonForm);
    newForm.addEventListener('submit', function(e) {
        e.preventDefault();
        endYear = startYear + Number(yearsUntilRetirementInput.value);
        updateGrowthChart(startYear, dataGenerator);
    });
}

function initHomePurchasePlanner() {
    const startYear = new Date().getFullYear();

    // Helper to estimate monthly payment (principal + interest for first year, averaged per month)
    function estimateMonthlyPayment(loanAmount, mortgageRate, mortgageYears) {
        const monthlyRate = mortgageRate / 12;
        const numPayments = mortgageYears * 12;
        if (monthlyRate === 0) return loanAmount / numPayments;
        // Calculate fixed monthly payment
        const fixedPayment = (loanAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -numPayments));
        let balance = loanAmount;
        let totalPaid = 0;
        for (let m = 0; m < 12 && balance > 0; m++) {
            const interest = balance * monthlyRate;
            const principal = Math.min(fixedPayment - interest, balance);
            totalPaid += interest + principal;
            balance -= principal;
        }
        // Average monthly payment for the first year
        return totalPaid / 12;
    }

    // Set up mortgage payment estimation and disable input
    function setupMortgagePaymentField() {
        const loanAmountInput = document.getElementById('loanAmount');
        const mortgageRateInput = document.getElementById('mortgageRate');
        const mortgageYearsInput = document.getElementById('mortgageYears');
        const monthlyPaymentInput = document.getElementById('monthlyPayment');
        if (!loanAmountInput || !mortgageRateInput || !mortgageYearsInput || !monthlyPaymentInput) return;

        function updateMonthlyPayment() {
            const loanAmount = Number(loanAmountInput.value);
            const mortgageRate = Number(mortgageRateInput.value) / 100;
            const mortgageYears = Number(mortgageYearsInput.value);
            const payment = estimateMonthlyPayment(loanAmount, mortgageRate, mortgageYears);
            monthlyPaymentInput.value = isFinite(payment) ? payment.toFixed(2) : '';
        }

        // Disable the field
        monthlyPaymentInput.disabled = true;

        // Update on input changes
        loanAmountInput.addEventListener('input', updateMonthlyPayment);
        mortgageRateInput.addEventListener('input', updateMonthlyPayment);
        mortgageYearsInput.addEventListener('input', updateMonthlyPayment);
        // Initial update
        updateMonthlyPayment();
    }

    setupMortgagePaymentField();

    const dataGenerator = () => {
        const params = getHomePurchaseParametersFromForm();
        const simulation = () => homePurchaseSimulation(params, makeNormalGenerator(params.homeAppreciationMean, params.homeAppreciationStd));
        return runSimulations(simulation, params.NumSimulations);
    };
    updateGrowthChart(startYear, dataGenerator);

    // Remove previous event listeners by cloning the form
    const homePurchaseForm = document.getElementById('homePurchaseForm');
    if (!homePurchaseForm) return;
    const newForm = homePurchaseForm.cloneNode(true);
    homePurchaseForm.parentNode.replaceChild(newForm, homePurchaseForm);
    newForm.addEventListener('submit', function(e) {
        e.preventDefault();
        updateGrowthChart(startYear, dataGenerator);
    });
    // Re-setup mortgage payment field after cloning
    setTimeout(setupMortgagePaymentField, 0);
}

// Simulate home purchase: tracks home value, mortgage balance, and equity over time
function homePurchaseSimulation(params, randomDistribution) {
    // params: {
    //   downPayment, loanAmount, mortgageRate, mortgageYears, monthlyPayment, homeAppreciationMean, homeAppreciationStd, ...
    // }
    // randomDistribution: function returning a random value (mean/variance handled by generator)

    const years = params.mortgageYears;
    let homeValue = params.downPayment + params.loanAmount;
    let mortgageBalance = params.loanAmount;
    const annualRate = params.mortgageRate;
    const n = years;
    const monthlyRate = annualRate / 12;
    const numPayments = n * 12;
    // Calculate fixed monthly payment if not provided
    let monthlyPayment = params.monthlyPayment;
    if (!monthlyPayment || monthlyPayment === 0) {
        monthlyPayment = (mortgageBalance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -numPayments));
    }

    const netProceeds = [];

    for (let year = 0; year < years; year++) {
        // Home appreciation
        const appreciation = randomDistribution();
        homeValue *= 1 + appreciation;

        // Mortgage amortization
        for (let m = 0; m < 12; m++) {
            if (mortgageBalance > 0) {
                const interest = mortgageBalance * monthlyRate;
                const principal = Math.min(monthlyPayment - interest, mortgageBalance);
                mortgageBalance -= principal;
            }
        }

        // Calculate net proceeds if sold this year
        const sellingCosts = params.sellingCosts || 0;
        const proceeds = homeValue - Math.max(mortgageBalance, 0) - (sellingCosts * homeValue);
        netProceeds.push(proceeds);
    }

    return netProceeds;
}
