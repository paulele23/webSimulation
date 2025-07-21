# Fachpraktikum Phase 2

## Prerequisite
- use the latest Version of Chrome if possible
- use a GPU that supports rendering Float32-textures
- if you do not have a device which is WebXR compatible, you can install the following browser extension [Immersive Web Emulator](https://chromewebstore.google.com/detail/immersive-web-emulator/cgffilbpcibhmcfbgggfhfolhkfbhmik)


## Use
- either host the root of this repository as a webserver or use the version hosted by github pages [hier](https://paulele23.github.io/webSimulation/)

## What to display?
- in the menu you first see on the website, you can selecte between the preset datasets or upload your own and the implmentation of the simulation.
- you have to select WebGL to use VR

### Visulalisation
- The planets have their color according to their class:

| Name   | Color      |
| ------ | ---------- |
| Star   | Yellow     |
| Planet | Green      |
| DAW    | Cyan       |
| Other  | Light Gray |

- the size is scaled to the log of the mass

### Navigation
- you can click into the canvas and control the camera with WASD and Mouse
- you can exit these controls by pressing ESC
- then you can change the simulation parameters in the menu on the right

- you can get in the VR mode by clicking the VR button in the upper left corner
- there you can use the left joystick to move in the direction you are looking
- you can use the exit function on your headset the end the vr session and change the simulation paramters again
- if you are using the extension, then the controls for VR are in the developer options

### Benchmarking
- accurate apis to get gpu time are not available anymore, therefor this option is currently not functional