function initializeCharts() {
    // Loss chart
    const lossCtx = document.getElementById('lossChart').getContext('2d');
    lossChart = new Chart(lossCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Training Loss',
                data: [],
                borderColor: '#ff6b6b',
                backgroundColor: 'rgba(255, 107, 107, 0.1)',
                tension: 0.4,
                pointRadius: 3,
                pointHoverRadius: 5
            }, {
                label: 'Validation Loss',
                data: [],
                borderColor: '#4ecdc4',
                backgroundColor: 'rgba(78, 205, 196, 0.1)',
                tension: 0.4,
                pointRadius: 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, /* Key fix - allows custom sizing */
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    position: 'top',
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Epoch'
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Loss'
                    }
                }
            },
            elements: {
                line: {
                    borderWidth: 2
                }
            }
        }
    });

    // Dice chart
    const diceCtx = document.getElementById('diceChart').getContext('2d');
    diceChart = new Chart(diceCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Training Dice',
                data: [],
                borderColor: '#45b7d1',
                backgroundColor: 'rgba(69, 183, 209, 0.1)',
                tension: 0.4,
                pointRadius: 3,
                pointHoverRadius: 5
            }, {
                label: 'Validation Dice',
                data: [],
                borderColor: '#96ceb4',
                backgroundColor: 'rgba(150, 206, 180, 0.1)',
                tension: 0.4,
                pointRadius: 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, /* Key fix - allows custom sizing */
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    position: 'top',
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Epoch'
                    }
                },
                y: {
                    beginAtZero: true,
                    max: 1,
                    title: {
                        display: true,
                        text: 'Dice Score'
                    }
                }
            },
            elements: {
                line: {
                    borderWidth: 2
                }
            }
        }
    });
}

function updateCharts(epoch, metrics) {
    // Validate that charts exist
    if (!lossChart || !diceChart) {
        console.warn('Charts not initialized, skipping update');
        return;
    }

    // Validate metrics
    if (!metrics || typeof metrics !== 'object') {
        console.warn('Invalid metrics data:', metrics);
        return;
    }

    try {
        // Update loss chart
        if (metrics.train_loss !== undefined && metrics.val_loss !== undefined) {
            lossChart.data.labels.push(epoch);
            lossChart.data.datasets[0].data.push(metrics.train_loss);
            lossChart.data.datasets[1].data.push(metrics.val_loss);
            lossChart.update('none'); // Use 'none' mode for better performance
        }

        // Update dice chart
        if (metrics.train_dice !== undefined && metrics.val_dice !== undefined) {
            diceChart.data.labels.push(epoch);
            diceChart.data.datasets[0].data.push(metrics.train_dice);
            diceChart.data.datasets[1].data.push(metrics.val_dice);
            diceChart.update('none'); // Use 'none' mode for better performance
        }
    } catch (error) {
        console.error('Error updating charts:', error);
    }
}