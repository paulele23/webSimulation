#version 300 es
in vec3 aPosition;
in vec3 aNormal;

uniform int elementsPerRow;
uniform mat4 uProjectionMatrix;
uniform mat4 uModelViewMatrix;
uniform mat4 uNormalMatrix;
uniform sampler2D simTexturePos;
uniform sampler2D simTextureVel;

out vec3 vNormal;
out vec3 vPosition;
flat out float vClassId;

void main() {
    int x = int(gl_InstanceID) % elementsPerRow;
    int y = int(gl_InstanceID) / elementsPerRow;
    ivec2 instanceCoords = ivec2(x, y);
    float classId = texelFetch(simTextureVel, instanceCoords, 0).a;
    float mass = texelFetch(simTexturePos, instanceCoords, 0).a;
    vec3 objectPosition = texelFetch(simTexturePos, instanceCoords, 0).xyz;
    vNormal = mat3(uNormalMatrix) * aNormal;
    vec3 pos = 0.0005f * aPosition * log(mass + 1.0f) + objectPosition;
    vPosition = vec3(uModelViewMatrix * vec4(pos, 1.0f));
    vClassId = classId;
    gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(pos, 1.0f);
}