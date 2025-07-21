override WORKGROUP_SIZE: u32 = 64;

struct Object {
    pos: vec3<f32>,
    mass: f32,
    vel: vec3<f32>,
    classID: f32,
};

struct Const {
    G: f32,
    dt: f32,
    epsilonSq: f32,
    numberOfObjects: u32
};

@group(0) @binding(1)
var<uniform> constant: Const;
@group(0) @binding(2)
var<storage> objectsIn: array<Object>;
@group(0) @binding(3)
var<storage, read_write> objectsOut: array<Object>;

fn computeAcc(i: u32) -> vec3<f32> {
    var acc = vec3<f32>(0, 0, 0);
    var compensation = vec3<f32>(0, 0, 0);
    for (var j: u32 = 0u; j < constant.numberOfObjects; j = j + 1u) {
        if (j == i) { continue; }
        let dir = objectsIn[j].pos - objectsIn[i].pos;
        let bracket = (dot(dir, dir) + constant.epsilonSq);
        let value = objectsIn[j].mass * inverseSqrt(bracket * bracket * bracket) * dir;

        //kahan summation
        //let y = value - compensation;
        //let t = acc + y;
        //compensation = (t - acc) - y;
        //acc = t;
        acc += value;
    }
    return constant.G * acc;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn computeMain(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    objectsOut[i].vel = objectsIn[i].vel + computeAcc(i) * constant.dt;
    objectsOut[i].pos = objectsIn[i].pos + objectsOut[i].vel * constant.dt;
}