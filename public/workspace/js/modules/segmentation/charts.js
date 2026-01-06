// Chart management functions
// Charts are created and managed by SegmentationModule (window.segmentationModule.lossChart/diceChart)
// This file contains only update functions that work with the module's chart instances

function updateCharts(epoch, metrics) {
    // Get charts from module instance
    const module = window.segmentationModule;
    if (!module || !module.lossChart || !module.diceChart) {
        console.warn('Charts not initialized in module, skipping update');
        return;
    }

    const lossChart = module.lossChart;
    const diceChart = module.diceChart;

    // Validate epoch - must be > 0 (epoch 0 is just initialization, not real training data)
    if (epoch == null || epoch <= 0) {
        return;
    }

    // Validate metrics
    if (!metrics || typeof metrics !== 'object') {
        console.warn('Invalid metrics data:', metrics);
        return;
    }

    try {
        // Update loss chart
        if (metrics.train_loss !== undefined && metrics.val_loss !== undefined &&
            !isNaN(metrics.train_loss) && !isNaN(metrics.val_loss)) {
            // Skip if this epoch already exists (avoid duplicates on resume)
            if (!lossChart.data.labels.includes(epoch)) {
                lossChart.data.labels.push(epoch);
                lossChart.data.datasets[0].data.push(metrics.train_loss);
                lossChart.data.datasets[1].data.push(metrics.val_loss);
                lossChart.update('none'); // Use 'none' mode for better performance
            }
        }

        // Update dice chart
        if (metrics.train_dice !== undefined && metrics.val_dice !== undefined &&
            !isNaN(metrics.train_dice) && !isNaN(metrics.val_dice)) {
            // Skip if this epoch already exists (avoid duplicates on resume)
            if (!diceChart.data.labels.includes(epoch)) {
                diceChart.data.labels.push(epoch);
                diceChart.data.datasets[0].data.push(metrics.train_dice);
                diceChart.data.datasets[1].data.push(metrics.val_dice);
                diceChart.update('none'); // Use 'none' mode for better performance
            }
        }
    } catch (error) {
        console.error('Error updating charts:', error);
    }
}