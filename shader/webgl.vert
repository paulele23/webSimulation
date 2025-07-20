#version 300 es
in vec3 aPosition;
in vec3 aNormal;

uniform mat4 uProjectionMatrix;
uniform mat4 uModelViewMatrix;
uniform mat4 uNormalMatrix;
uniform sampler2D uSimdTex;

out vec3 vNormal;
out vec3 vPosition;
flat out float vClassId;

void main() {
    float classId = texelFetch(uSimdTex, ivec2(2, gl_InstanceID), 0).a;
    float mass = texelFetch(uSimdTex, ivec2(1, gl_InstanceID), 0).a;
    vec3 objectPosition = texelFetch(uSimdTex, ivec2(0, gl_InstanceID), 0).xyz;
    vNormal = mat3(uNormalMatrix) * aNormal;
    vec3 pos = 0.0005f * aPosition * log(mass + 1.0f) + objectPosition;
    vPosition = vec3(uModelViewMatrix * vec4(pos, 1.0f));
    vClassId = classId;
    gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(pos, 1.0f);
}