// Utility functions

/**
 * Escapes HTML special characters to prevent XSS attacks.
 * Use this when inserting user-provided or server-provided data into innerHTML.
 * @param {string|number|null|undefined} text - The text to escape
 * @returns {string} The escaped HTML-safe string
 */
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function showLoading(title, description) {
    document.getElementById('loadingText').textContent = title;
    document.getElementById('loadingDescription').textContent = description;
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
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