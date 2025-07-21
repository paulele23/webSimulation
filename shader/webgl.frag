#version 300 es
precision mediump float;

in vec3 vNormal;
in vec3 vPosition;
flat in float vClassId;

uniform int elementsPerRow;
uniform vec3 uLightPosition;
uniform vec3 uLightColor;
uniform vec3 uAmbientColor;

out vec4 outColor;

void main() {
    vec3 lightDirection = normalize(uLightPosition - vPosition);
    float diff = max(dot(normalize(vNormal), lightDirection), 0.0f);
    vec3 diffuse = diff * uLightColor;
    vec3 ambient = uAmbientColor;
    vec3 color;
    if(vClassId < 0.5f) { //star
        color = vec3(1.0f, 1.0f, 0.0f);
    } else if(vClassId < 1.5f) { // planet
        color = vec3(0.0f, 1.0f, 0.0f);
    } else if(vClassId < 2.5f) { // dwarf planet
        color = vec3(0.0f, 1.0f, 1.0f);
    } else {
        color = vec3(0.8f, 0.8f, 0.8f);
    }
    outColor = vec4((diffuse + ambient) * color, 1.0f);
}