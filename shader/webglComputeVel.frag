#version 300 es
precision highp float;
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform float dt;
uniform float G;
uniform float epsilonSq;
uniform int numberOfObjects;

out vec4 outColor;


vec3 getPos(int i) {
    return texelFetch(uTexA, ivec2(0, i), 0).xyz;
}
float getMass(int i) {
    return texelFetch(uTexA, ivec2(0, i), 0).a;
}
vec3 getVel(int i) {
    return texelFetch(uTexB, ivec2(0, i), 0).xyz;
}
float getClassId(int i) {
    return texelFetch(uTexB, ivec2(0, i), 0).a;
}

vec3 computeAcc(int i){
    vec3 acc = vec3(0.0, 0.0, 0.0);
    for (int j = 0; j < numberOfObjects; ++j) {
        if (j != i) {
            vec3 dir = getPos(j) - getPos(i);
            float bracket = dot(dir, dir) + epsilonSq;
            acc += getMass(j) * inversesqrt(bracket * bracket * bracket) * dir;
        }
    }
    return G*acc;
}


void main() {
    int i = int(gl_FragCoord.y);
    outColor.xyz = getVel(i) + dt * computeAcc(i);
    outColor.a = getClassId(i);
}