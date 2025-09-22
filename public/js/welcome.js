// Welcome page JavaScript functionality

function startWithTestData() {
    // Store user choice in sessionStorage for the main app to read
    sessionStorage.setItem('userChoice', 'testData');
    
    // Redirect to main application
    window.location.href = '/app';
}

function startWithCustomData() {
    // Store user choice in sessionStorage for the main app to read
    sessionStorage.setItem('userChoice', 'customData');
    
    // Redirect to main application
    window.location.href = '/app';
}

// Optional: Add some welcome page animations or interactions
document.addEventListener('DOMContentLoaded', function() {
    // Add fade-in animation to feature cards
    const cards = document.querySelectorAll('.feature-card');
    cards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
            card.style.transition = 'all 0.6s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, 100 * index);
    });
});