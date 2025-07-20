import { mat4, vec3 } from 'https://cdn.skypack.dev/gl-matrix';


export class Controls {
    
    constructor(canvas, position = [0, 0, 2], mouseSensitivity = 0.0004, maxSpeed=5) {
        this.canvas = canvas;
        this.position = position;
        this.yaw = Math.PI;
        this.pitch = 0;
        this.keys = {};
        this.mouseSensitivity = mouseSensitivity;

        this.speed = 0;
        this.maxSpeed = maxSpeed;
        this.acceleration = 0.005;

        this._onClick = () => {
            this.canvas.requestPointerLock();
        };
        this._onMouseMove = (e) => {
            if (document.pointerLockElement === this.canvas) {
                const dx = e.movementX * this.mouseSensitivity;
                const dy = e.movementY * this.mouseSensitivity;
                this.yaw -= dx;
                this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch - dy));
            }
        };
        this._onKeyDown = (e) => {
            this.keys[e.key.toLowerCase()] = true;
        };
        this._onKeyUp = (e) => {
            this.keys[e.key.toLowerCase()] = false;
        };

        this.initControls();
    }

    initControls() {
        this.canvas.addEventListener('click', this._onClick);
        window.addEventListener('mousemove', this._onMouseMove);
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
    }

    removeControls() {
        this.canvas.removeEventListener('click', this._onClick);
        window.removeEventListener('mousemove', this._onMouseMove);
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
    }

    getViewMatrix() {
        const front = vec3.fromValues(
            Math.cos(this.pitch) * Math.sin(this.yaw),
            Math.sin(this.pitch),
            Math.cos(this.pitch) * Math.cos(this.yaw)
        );
        vec3.normalize(front, front);

        const right = vec3.create();
        vec3.cross(right, front, [0, 1, 0]);
        vec3.normalize(right, right);

        const moving =
            this.keys['w'] ||
            this.keys['a'] ||
            this.keys['s'] ||
            this.keys['d'];
        
        if (moving) {
            this.speed = Math.min(this.speed + this.acceleration, this.maxSpeed);
            if (this.keys['w']) vec3.scaleAndAdd(this.position, this.position, front, this.speed);
            if (this.keys['s']) vec3.scaleAndAdd(this.position, this.position, front, -this.speed);
            if (this.keys['a']) vec3.scaleAndAdd(this.position, this.position, right, -this.speed*0.5);
            if (this.keys['d']) vec3.scaleAndAdd(this.position, this.position, right, this.speed*0.5);
        } else{
            this.speed = 0;
        }

        const target = vec3.add(vec3.create(), this.position, front);

        return mat4.lookAt(mat4.create(), this.position, target, [0, 1, 0]);
    }
}