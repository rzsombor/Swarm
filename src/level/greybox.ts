import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  Scene,
  SpotLight,
  SRGBColorSpace,
  Vector3,
  type Camera,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBVH } from 'three-mesh-bvh';

export interface Level {
  scene: Scene;
  /** BVH over the merged static collision geometry. */
  collision: MeshBVH;
  lantern: SpotLight;
  spawn: { position: Vector3; yaw: number };
}

const FOG_COLOR = 0x0a1e22;
const WALL_HEIGHT = 2.6;
const WALL_THICKNESS = 0.2;
const LANE_PITCH = 1.2 + WALL_THICKNESS;

function checkerTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#34443f';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#2b3935';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillRect(32, 32, 32, 32);
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(20, 20);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Builds the test scene (1 unit = 1 m) and attaches the lantern to `camera`. */
export function buildGreybox(camera: Camera): Level {
  const scene = new Scene();
  scene.background = new Color(FOG_COLOR);
  scene.fog = new FogExp2(FOG_COLOR, 0.07);
  scene.add(new HemisphereLight(0x2f5a60, 0x0b1416, 0.5), new AmbientLight(0x1a2c30, 0.4));

  const visual = new Group();
  scene.add(visual);
  const collisionParts: BufferGeometry[] = [];

  const groundMat = new MeshStandardMaterial({ map: checkerTexture(), roughness: 1 });
  const wallMat = new MeshStandardMaterial({ color: 0x5b6d68, roughness: 0.9 });
  const planterMat = new MeshStandardMaterial({ color: 0x7a6445, roughness: 0.8 });
  const palmMat = new MeshStandardMaterial({ color: 0x4a5a30, roughness: 0.7 });

  const place = (
    geometry: BufferGeometry,
    material: MeshStandardMaterial,
    x: number,
    y: number,
    z: number,
    rotationX = 0,
  ) => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rotationX;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.updateMatrixWorld();
    visual.add(mesh);

    const part = geometry.clone().applyMatrix4(mesh.matrixWorld);
    part.deleteAttribute('normal');
    part.deleteAttribute('uv');
    collisionParts.push(part);
  };
  const box = (
    material: MeshStandardMaterial,
    [x, y, z]: [number, number, number],
    [w, h, d]: [number, number, number],
    rotationX = 0,
  ) => place(new BoxGeometry(w, h, d), material, x, y, z, rotationX);
  /** Wall running along X at depth `z`, from `x0` to `x1`. */
  const wallX = (z: number, x0: number, x1: number) =>
    box(wallMat, [(x0 + x1) / 2, WALL_HEIGHT / 2, z], [x1 - x0, WALL_HEIGHT, WALL_THICKNESS]);
  const wallZ = (x: number, z0: number, z1: number) =>
    box(wallMat, [x, WALL_HEIGHT / 2, (z0 + z1) / 2], [WALL_THICKNESS, WALL_HEIGHT, z1 - z0]);
  const palm = (x: number, z: number, height = 4.5) =>
    place(new CylinderGeometry(0.15, 0.2, height, 12), palmMat, x, height / 2, z);

  // Ground slab (thick, so a fast fall cannot tunnel) and boundary walls.
  box(groundMat, [0, -1, 0], [40, 2, 40]);
  wallX(-20, -20, 20);
  wallX(20, -20, 20);
  wallZ(-20, -20, 20);
  wallZ(20, -20, 20);

  // Serpentine: five walls 1.4 m apart leave four 1.2 m lanes joined by alternating gaps.
  const z0 = 3.8;
  wallX(z0 + LANE_PITCH * 4, -8.2, 8.2);
  wallX(z0 + LANE_PITCH * 3, -8, 6.8);
  wallX(z0 + LANE_PITCH * 2, -6.8, 8);
  wallX(z0 + LANE_PITCH, -8, 6.8);
  wallX(z0, -6.8, 8.2); // entrance gap at the west end
  wallZ(-8.1, z0 - 0.1, z0 + LANE_PITCH * 4 + 0.1);
  wallZ(8.1, z0 - 0.1, z0 + LANE_PITCH * 4 + 0.1);
  box(planterMat, [0, 0.1, z0 + LANE_PITCH * 2.5], [0.5, 0.2, 1.2]); // 0.2 m step in a lane
  palm(-7.2, z0 + LANE_PITCH * 3.5);

  // Open area: planters, a ramp up to a 1 m ledge, and palms.
  box(planterMat, [5, 0.3, -4], [2, 0.6, 0.8]);
  box(planterMat, [-6, 0.2, -8], [1.5, 0.4, 1.5]);
  box(planterMat, [9, 0.45, -10], [1, 0.9, 3]);
  box(wallMat, [-11, 0, -3], [3, 1, 5], 0.2);
  palm(0, -6);
  palm(8, -13);
  palm(-12, 8);
  palm(12, 10);

  const merged = mergeGeometries(collisionParts, false);
  collisionParts.forEach((g) => g.dispose());
  const collision = new MeshBVH(merged);

  const lantern = new SpotLight(0xffe2b0, 12, 22, 0.5, 0.55, 2);
  lantern.castShadow = true;
  lantern.shadow.mapSize.set(1024, 1024);
  lantern.shadow.camera.near = 0.2;
  lantern.shadow.bias = -0.0005;
  lantern.target.position.set(0, 0, -1);
  camera.add(lantern, lantern.target);
  scene.add(camera);

  return {
    scene,
    collision,
    lantern,
    spawn: { position: new Vector3(-7.4, 0, 1), yaw: Math.PI },
  };
}
