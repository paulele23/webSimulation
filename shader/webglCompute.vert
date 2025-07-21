#version 300 es
in vec2 aQuadPos;
void main() {
    gl_Position = vec4(aQuadPos, 0, 1);
}