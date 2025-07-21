#version 300 es
precision highp float;
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform float dt;
uniform float G;
uniform float epsilonSq;
uniform int numberOfObjects;
uniform int elementsPerRow;

out vec4 outColor;

ivec2 getCoord(int i) {
    return ivec2(i % elementsPerRow, i / elementsPerRow);
}

vec3 getPos(int i) {
    return texelFetch(uTexA, getCoord(i), 0).xyz;
}
float getMass(int i) {
    return texelFetch(uTexA, getCoord(i), 0).a;
}
vec3 getVel(int i) {
    return texelFetch(uTexB, getCoord(i), 0).xyz;
}
float getClassId(int i) {
    return texelFetch(uTexB, getCoord(i), 0).a;
}


void main() {
    int i = int(gl_FragCoord.x) + int(gl_FragCoord.y) * elementsPerRow;
    outColor.xyz = getPos(i) +  dt * getVel(i);
    outColor.a = getMass(i);
}