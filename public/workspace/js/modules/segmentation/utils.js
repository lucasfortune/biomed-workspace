// Utility functions

/**
 * Show loading overlay using the module's BaseModule method
 * @param {string} title - Loading title
 * @param {string} description - Loading description
 */
function showLoading(title, description) {
    // Use the module's showLoading if available (from BaseModule)
    if (window.segmentationModule && window.segmentationModule.showLoading) {
        window.segmentationModule.showLoading(title, description);
        return;
    }

    // Fallback: Try to find and use existing overlay element
    const overlay = document.getElementById('loadingOverlay');
    const text = document.getElementById('loadingText');
    const desc = document.getElementById('loadingDescription');

    if (overlay && text && desc) {
        text.textContent = title;
        desc.textContent = description;
        overlay.style.display = 'flex';
    } else {
        console.log('[Loading] No overlay available. Title:', title, 'Description:', description);
    }
}

/**
 * Hide loading overlay using the module's BaseModule method
 */
function hideLoading() {
    // Use the module's hideLoading if available (from BaseModule)
    if (window.segmentationModule && window.segmentationModule.hideLoading) {
        window.segmentationModule.hideLoading();
        return;
    }

    // Fallback: Try to find and hide existing overlay element
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

/**
 * Update loading message without hiding/showing overlay
 * @param {string} title - New title
 * @param {string} description - New description
 */
function updateLoadingMessage(title, description) {
    // Use the module's showLoading to update (it updates existing overlay)
    if (window.segmentationModule && window.segmentationModule.showLoading) {
        window.segmentationModule.showLoading(title, description);
        return;
    }

    // Fallback: Try to update existing overlay elements
    const text = document.getElementById('loadingText');
    const desc = document.getElementById('loadingDescription');

    if (text && desc) {
        text.textContent = title;
        desc.textContent = description;
    } else {
        console.log('[Loading] Could not update message. Title:', title, 'Description:', description);
    }
}

// Make functions globally available for ES6 modules
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.updateLoadingMessage = updateLoadingMessage;

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    } else {
        // Fallback to console and notification system if available
        console.error('[Error]', message);
        if (window.segmentationModule && window.segmentationModule.state) {
            window.segmentationModule.state.notify('error', message, 5000);
        }
    }
}

function createEnhancedVisualizationMaterial() {
    const vertexShader = `
        attribute float alpha;
        uniform float globalOpacity;
        uniform vec3 lightDirection;
        varying vec3 vColor;
        varying float vAlpha;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying float vDepth;
        
        void main() {
            vColor = color;
            vAlpha = alpha;
            vNormal = normalize(normalMatrix * normal);
            vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
            vDepth = -(modelViewMatrix * vec4(position, 1.0)).z;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;
    
    const fragmentShader = `
        uniform float globalOpacity;
        uniform vec3 lightDirection;
        uniform vec3 ambientColor;
        uniform vec3 lightColor;
        uniform float shadowIntensity;
        uniform float time;
        
        varying vec3 vColor;
        varying float vAlpha;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying float vDepth;
        
        // Simple depth-based ambient occlusion approximation
        float calculateAO(vec3 normal, vec3 position) {
            float depth = vDepth;
            float ao = 1.0 - (depth * 0.01);
            return clamp(ao, 0.3, 1.0);
        }
        
        void main() {
            // Enhanced lighting calculation
            vec3 lightDir = normalize(lightDirection);
            float NdotL = max(dot(vNormal, lightDir), 0.0);
            
            // Ambient occlusion effect
            float ao = calculateAO(vNormal, vPosition);
            
            // Rim lighting for better edge definition
            vec3 viewDir = normalize(-vPosition);
            float rimPower = 1.0 - max(dot(viewDir, vNormal), 0.0);
            vec3 rimColor = vec3(0.2, 0.3, 0.8) * pow(rimPower, 2.0) * 0.5;
            
            // Combine lighting
            vec3 ambient = ambientColor * vColor * ao;
            vec3 diffuse = lightColor * vColor * NdotL;
            vec3 finalColor = ambient + diffuse + rimColor;
            
            // Apply shadow effect based on depth
            float shadow = 1.0 - (vDepth * shadowIntensity * 0.0001);
            finalColor *= shadow;
            
            // Slight color enhancement for better visibility
            finalColor = mix(finalColor, finalColor * 1.2, 0.3);
            
            float finalAlpha = globalOpacity * vAlpha;
            gl_FragColor = vec4(finalColor, finalAlpha);
        }
    `;
    
    return new THREE.ShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        uniforms: {
            globalOpacity: { value: 0.8 },
            lightDirection: { value: new THREE.Vector3(1, 1, 1).normalize() },
            ambientColor: { value: new THREE.Color(0.4, 0.4, 0.5) },
            lightColor: { value: new THREE.Color(0.8, 0.8, 0.7) },
            shadowIntensity: { value: 1.0 },
            time: { value: 0.0 }
        },
        transparent: true,
        vertexColors: true,
        side: THREE.DoubleSide
    });
}