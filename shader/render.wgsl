struct Uniforms {
mvp: mat4x4<f32>,
lightDirection: vec3<f32>
};

struct Object {
    pos: vec3<f32>,
    vel: vec3<f32>,
    mass: f32,
    acc: vec3<f32>,
    classID: f32,
};

@binding(0) @group(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(2) var<storage, read> objects: array<Object>;



struct VertexOut {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) @interpolate(flat) instance: u32
};

@vertex
fn vs_main(@builtin(instance_index) instance: u32, @location(0) position: vec3<f32>, @location(1) normal: vec3<f32>) -> VertexOut {
    var output: VertexOut;
    let offset = objects[instance].pos;
    let radiusScalingFactor = 0.0005 * log(objects[instance].mass);
    output.position = uniforms.mvp * vec4<f32>(position * radiusScalingFactor + offset, 1.0);
    output.normal = normalize((vec4<f32>(normal, 0.0)).xyz);
    output.instance = instance;
    return output;
}


fn getColorFromID(id: f32) -> vec4<f32> {
    if (id < 0.5) {
        // case 1: id < 0.5 (star)
        return vec4<f32>(1, 1, 0, 1.0);
    } else if (id < 1.5) {
        // case 2: id < 1.5 (planet)
        return vec4<f32>(0, 1, 0, 1.0);
    } else if (id < 2.5) {
        // case 3: id < 2.5 (DAW)
        return vec4<f32>(0, 1, 1, 1.0);
    } else {
        // default: rest
        return vec4<f32>(0.8, 0.8, 0.8, 1.0);
    }
}

@fragment
fn fs_main(input : VertexOut) -> @location(0) vec4<f32> {
    let light = normalize(uniforms.lightDirection - input.position.xyz);
    let lighting = max(dot(input.normal, light), 0.0);
    let color = getColorFromID(objects[input.instance].classID);
    return (vec4<f32>(1, 1, 1, 1.0) * lighting + vec4<f32>(0.6, 0.6, 0.6, 1.0)) * color;
}