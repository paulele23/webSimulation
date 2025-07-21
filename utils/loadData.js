export async function loadSimData(csv){
    const dataObjects = splitCSV(csv);
    const floatsPerObj = 8; 
    const data = new Float32Array(dataObjects.length * floatsPerObj);
    dataObjects.forEach((object, i) => {
        const [
            name,            // 0
            cls,              // 1
            mass,             // 2
            pos_x, pos_y, pos_z,         // 3–5
            vel_x, vel_y, vel_z          // 6–8
        ] = object;
        const base = i * floatsPerObj;
        data[base + 0] = +pos_x;
        data[base + 1] = +pos_y;
        data[base + 2] = +pos_z;
        data[base + 3] = +mass;
        // vel
        data[base + 4] = +vel_x;
        data[base + 5] = +vel_y;
        data[base + 6] = +vel_z;
        //mass
        data[base + 7] = mapClassToInteger(cls); 
    });
    return [data, dataObjects.length];
}

export async function loadSimDataSplit(csv){  
    const dataObjects = splitCSV(csv);
    const dataPos = new Float32Array(dataObjects.length * 4);
    const dataVel = new Float32Array(dataObjects.length * 4);
    const floatsPerObj = 4;
    dataObjects.forEach((object, i) => {
        const [
            name,            // 0
            cls,              // 1
            mass,             // 2
            pos_x, pos_y, pos_z,         // 3–5
            vel_x, vel_y, vel_z          // 6–8
        ] = object;
        const base = i * floatsPerObj;
        dataPos[base + 0] = +pos_x;
        dataPos[base + 1] = +pos_y;
        dataPos[base + 2] = +pos_z;
        dataPos[base + 3] = +mass; // padding
        // vel
        dataVel[base + 4] = +vel_x;
        dataVel[base + 5] = +vel_y;
        dataVel[base + 6] = +vel_z;
        dataVel[base + 7] = mapClassToInteger(cls);
    });
    return [dataPos, dataVel, dataObjects.length];
}


function splitCSV(csv) {
    const lines = csv.split(/\r?\n/).filter(Boolean);
    switch (lines[0]) {
        case "id,name,class,mass,pos_x,pos_y,pos_z,vel_x,vel_y,vel_z":
            return parseStateVector(lines);
        case "e,a,i,om,w,ma,epoch,H,albedo,diameter,mass,class,name,central_body": 
            return parseKepler(lines)
        default:
            throw new Error("Input not in the right format");
    }
}


function parseStateVector(lines){
    const rows = lines.slice(1).map((l) => l.split(","));
    rows.forEach((row) => row.shift());
    return rows;
}


function parseKepler(lines){
    const rows = lines.slice(1).map((l) => l.split(","));
    let result = [["Sun", "STA",1.988469999999999977e+30,0,0,0,0,0,0]]; // Central body (Sun)
    let mapNameToIndex = new Map();
    mapNameToIndex.set("Sun", 0);
    mapNameToIndex.set("", 0);

    let unprocessed = new Set(rows.map((_, i) => i));
    let progress = true;
    while (unprocessed.size > 0 && progress) {
        progress = false;
        for (let idx of Array.from(unprocessed)) {
            var [e,a,i,om,w,ma,epoch,H,albedo,diameter,mass,cls,name,central_body
            ] = rows[idx];
            if (mapNameToIndex.has(central_body)) {
                albedo = (albedo != "") ? +albedo : approximateAlbedo(cls);
                const centralBodyIndex = mapNameToIndex.get(central_body);
                mass = (mass != "") ? +mass : approximateMass(diameter, albedo);
                const [pos_x, pos_y, pos_z,
                vel_x, vel_y, vel_z] = keplerToStateVector(e, a, i, om ,w, ma, epoch, H, result[centralBodyIndex])
                result.push([name, cls, mass, pos_x, pos_y, pos_z, vel_x, vel_y, vel_z]);
                mapNameToIndex.set(name, result.length - 1);
                unprocessed.delete(idx);
                progress = true;
            }
        }
    }

    return result;
}

const { sqrt, sin, cos } = Math;
const au = 1.49597870691e11;
const day = 86400;
const G = Math.pow(au, -3) * Math.pow(day, 2) * 6.67430e-11;

function keplerToStateVector(e, a, i, om, w, ma, epoch, H, centralBody) {
    // Ensure all are numbers
    e = +e; a = +a; i = +i; om = +om; w = +w; ma = +ma; epoch = +epoch;
    const mu = (centralBody[2] * G);
    om = fromDegreeToRadian(om);
    w = fromDegreeToRadian(w);
    i = fromDegreeToRadian(i);
    ma = fromDegreeToRadian(ma);

    // Mean anomaly propagation
    const M = (ma + (2451544.5 - epoch) * sqrt(mu / Math.pow(a, 3))) % (2 * Math.PI);
    const E = NewtonRaphsonKepler(M, e);
    const ny = (2 * Math.atan2(sqrt(1 + e) * sin(E / 2), sqrt(1 - e) * cos(E / 2))) % (2 * Math.PI);
    const r = a * (1 - e * cos(E));

    // Position in perifocal frame
    const x_p = r * cos(ny);
    const y_p = r * sin(ny);
    const z_p = 0;

    // Velocity in perifocal frame
    const p = a * (1 - e * e);
    const vx_p = -sqrt(mu / p) * sin(ny);
    const vy_p = sqrt(mu / p) * (e + cos(ny));
    const vz_p = 0;

    // Rotation matrix from perifocal to inertial
    const cosO = cos(om), sinO = sin(om);
    const cosw = cos(w), sinw = sin(w);
    const cosi = cos(i), sini = sin(i);

    const R11 = cosO * cosw - sinO * sinw * cosi;
    const R12 = -cosO * sinw - sinO * cosw * cosi;
    const R13 = sinO * sini;
    const R21 = sinO * cosw + cosO * sinw * cosi;
    const R22 = -sinO * sinw + cosO * cosw * cosi;
    const R23 = -cosO * sini;
    const R31 = sinw * sini;
    const R32 = cosw * sini;
    const R33 = cosi;

    // Position in inertial frame
    const x = R11 * x_p + R12 * y_p + R13 * z_p;
    const y = R21 * x_p + R22 * y_p + R23 * z_p;
    const z = R31 * x_p + R32 * y_p + R33 * z_p;

    // Velocity in inertial frame
    const vx = R11 * vx_p + R12 * vy_p + R13 * vz_p;
    const vy = R21 * vx_p + R22 * vy_p + R23 * vz_p;
    const vz = R31 * vx_p + R32 * vy_p + R33 * vz_p;

    // Add central body state
    const pos_x = x + centralBody[3];
    const pos_y = y + centralBody[4];
    const pos_z = z + centralBody[5];
    const vel_x = vx + centralBody[6];
    const vel_y = vy + centralBody[7];
    const vel_z = vz + centralBody[8];
    return [pos_x, pos_y, pos_z, vel_x, vel_y, vel_z];
}

function NewtonRaphsonKepler(M, e) {
    let E = M;
    for (let i = 0; i < 30; i++) {
        E = E - (E- e*Math.sin(E) - M)/(1- e * Math.cos(E));
    }
    return E;
}

function approximateMass(diameter, albedo) {
    return 4/3 * Math.PI * Math.pow(diameter / 2, 3) * getRho(albedo);
}

function getRho(albedo){
    const factor = (100000.0 * 100000.0 * 100000.0 / 1000.0);
    if (albedo < 0.1) {         return factor * 1.38;
    } else if (albedo < 0.2) {  return factor * 1.25;
    } else {                    return factor * 5.32;
    }
}

function fromDegreeToRadian(degree) {
    return degree * (Math.PI / 180);
}

function approximateAlbedo(type) {
    const albedoRanges = {
        AMO: [0.450, 0.550],
        OMB: [0.197, 0.5],
        APO: [0.450, 0.550],
        CEN: [0.450, 0.750],
        ATE: [0.450, 0.550],
        TJN: [0.124, 0.188],
        IEO: [0.450, 0.550],
        TNO: [0.022, 0.130],
        MCA: [0.450, 0.550],
        AST: [0.450, 0.550],
        IMB: [0.030, 0.103],
        PAA: [0.450, 0.550],
        MBA: [0.097, 0.203],
        HYA: [0.450, 0.550]
    };
    const range = albedoRanges[type];
    if (!range) return null; // or a default value
    const [min, max] = range[0] < range[1] ? range : [range[1], range[0]];
    return min + Math.random() * (max - min);
}

export function u32ToF32Bits(u32) {
  const buffer = new ArrayBuffer(4);
  new Uint32Array(buffer)[0] = u32;
  return new Float32Array(buffer)[0];
}

function mapClassToInteger(className){
    switch (className) {
        case "STA":
            return 0;
        case "PLA":
            return 1;
        case "DWA":
            return 2;
        case "SAT":
            return 3;
        default:
            return 3;
    }
}