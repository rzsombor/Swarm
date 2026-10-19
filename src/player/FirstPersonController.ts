import { Box3, Line3, MathUtils, Vector3, type PerspectiveCamera } from 'three';
import type { MeshBVH } from 'three-mesh-bvh';
import type { InputService } from '../input/InputService';

export type MoveState = 'idle' | 'walk' | 'sprint' | 'crouch' | 'air';

export interface ControllerConfig {
  walkSpeed: number;
  sprintSpeed: number;
  crouchSpeed: number;
  standHeight: number;
  crouchHeight: number;
  radius: number;
  gravity: number;
  jumpSpeed: number;
  maxFallSpeed: number;
  /** Radians of rotation per pixel of mouse movement. */
  lookSensitivity: number;
}

export const DEFAULT_CONFIG: ControllerConfig = {
  walkSpeed: 2.6,
  sprintSpeed: 4.5,
  crouchSpeed: 1.4,
  standHeight: 1.7,
  crouchHeight: 1.1,
  radius: 0.3,
  gravity: 20,
  jumpSpeed: 5.8,
  maxFallSpeed: 20,
  lookSensitivity: 0.0022,
};

type ControllerInput = Pick<InputService, 'isDown' | 'wasPressed'>;

const EYE_INSET = 0.12;
const PITCH_LIMIT = Math.PI / 2 - 0.01;
const HEADROOM_TOLERANCE = 0.01;

/**
 * Kinematic capsule controller. `position` is the point between the feet; the capsule is
 * resolved against a static BVH with the shapecast approach from three-mesh-bvh's
 * characterMovement example. Movement is stepped at a fixed rate and interpolated for rendering;
 * look is applied per rendered frame so it never lags the mouse.
 */
export class FirstPersonController {
  readonly config: ControllerConfig;
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  yaw = 0;
  pitch = 0;
  onGround = false;
  crouching = false;
  moveState: MoveState = 'idle';

  private eyeHeight: number;
  private prevPosition = new Vector3();
  private prevEyeHeight: number;

  private readonly segment = new Line3();
  private readonly box = new Box3();
  private readonly triPoint = new Vector3();
  private readonly capsulePoint = new Vector3();
  private readonly push = new Vector3();
  private readonly wish = new Vector3();

  constructor(
    private readonly world: MeshBVH,
    private readonly input: ControllerInput,
    config: Partial<ControllerConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.eyeHeight = this.prevEyeHeight = this.config.standHeight - EYE_INSET;
  }

  get height(): number {
    return this.crouching ? this.config.crouchHeight : this.config.standHeight;
  }

  teleport(position: Vector3, yaw: number): void {
    this.position.copy(position);
    this.prevPosition.copy(position);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
  }

  update(dt: number): void {
    const { config, input, velocity } = this;
    this.prevPosition.copy(this.position);
    this.prevEyeHeight = this.eyeHeight;

    if (input.isDown('crouch')) this.crouching = true;
    else if (this.crouching && this.hasHeadroom()) this.crouching = false;

    const forward = Number(input.isDown('moveForward')) - Number(input.isDown('moveBack'));
    const strafe = Number(input.isDown('moveRight')) - Number(input.isDown('moveLeft'));
    const moving = forward !== 0 || strafe !== 0;
    const sprinting = input.isDown('sprint') && forward > 0 && !this.crouching;
    const speed = this.crouching
      ? config.crouchSpeed
      : sprinting
        ? config.sprintSpeed
        : config.walkSpeed;

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    this.wish.set(strafe * cos - forward * sin, 0, -strafe * sin - forward * cos);
    if (moving) this.wish.normalize().multiplyScalar(speed);
    const blend = 1 - Math.exp(-(this.onGround ? 14 : 2.5) * dt);
    velocity.x += (this.wish.x - velocity.x) * blend;
    velocity.z += (this.wish.z - velocity.z) * blend;

    if (this.onGround && input.wasPressed('jump') && !this.crouching) velocity.y = config.jumpSpeed;
    velocity.y = Math.max(velocity.y - config.gravity * dt, -config.maxFallSpeed);

    this.position.addScaledVector(velocity, dt);
    this.resolveCollisions(dt);

    const targetEye = this.height - EYE_INSET;
    this.eyeHeight += (targetEye - this.eyeHeight) * (1 - Math.exp(-14 * dt));

    this.moveState = !this.onGround
      ? 'air'
      : this.crouching
        ? 'crouch'
        : !moving
          ? 'idle'
          : sprinting
            ? 'sprint'
            : 'walk';
  }

  /** Applies a mouse-look delta in pixels. Call once per rendered frame. */
  look(delta: { x: number; y: number }): void {
    const { lookSensitivity } = this.config;
    this.yaw -= delta.x * lookSensitivity;
    this.pitch = MathUtils.clamp(this.pitch - delta.y * lookSensitivity, -PITCH_LIMIT, PITCH_LIMIT);
  }

  /** Places the camera at the render-time interpolation between the last two simulation states. */
  applyToCamera(camera: PerspectiveCamera, alpha: number): void {
    const { prevPosition: p0, position: p1 } = this;
    camera.position.set(
      MathUtils.lerp(p0.x, p1.x, alpha),
      MathUtils.lerp(p0.y, p1.y, alpha) + MathUtils.lerp(this.prevEyeHeight, this.eyeHeight, alpha),
      MathUtils.lerp(p0.z, p1.z, alpha),
    );
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  private resolveCollisions(dt: number): void {
    const { push, segment, config } = this;
    this.setSegment(this.height);
    this.depenetrate();
    push.set(segment.start.x, segment.start.y - config.radius, segment.start.z).sub(this.position);

    this.onGround = push.y > Math.abs(dt * this.velocity.y * 0.25);
    const distance = push.length();
    if (distance <= 1e-5) return;
    this.position.add(push);

    if (this.onGround) {
      this.velocity.y = 0;
    } else {
      push.divideScalar(distance);
      const into = push.dot(this.velocity);
      if (into < 0) this.velocity.addScaledVector(push, -into);
    }
  }

  /** True when the standing capsule would not overlap geometry at the current position. */
  private hasHeadroom(): boolean {
    const { segment, box, triPoint, capsulePoint } = this;
    const { radius, standHeight } = this.config;
    this.setSegment(standHeight);
    box.makeEmpty().expandByPoint(segment.start).expandByPoint(segment.end);
    box.min.addScalar(-radius);
    box.max.addScalar(radius);
    const blocked = this.world.shapecast({
      intersectsBounds: (bounds) => bounds.intersectsBox(box),
      intersectsTriangle: (tri) =>
        tri.closestPointToSegment(segment, triPoint, capsulePoint) < radius - HEADROOM_TOLERANCE,
    });
    return !blocked;
  }

  private setSegment(height: number): void {
    const { radius } = this.config;
    this.segment.start.copy(this.position).y += radius;
    this.segment.end.copy(this.position).y += height - radius;
  }

  /** Pushes `this.segment` out of every triangle closer than the capsule radius. */
  private depenetrate(): void {
    const { segment, box, triPoint, capsulePoint } = this;
    const { radius } = this.config;
    const updateBox = () => {
      box.makeEmpty().expandByPoint(segment.start).expandByPoint(segment.end);
      box.min.addScalar(-radius);
      box.max.addScalar(radius);
    };
    updateBox();

    this.world.shapecast({
      intersectsBounds: (bounds) => bounds.intersectsBox(box),
      intersectsTriangle: (tri) => {
        const distance = tri.closestPointToSegment(segment, triPoint, capsulePoint);
        if (distance >= radius) return false;
        const dir = capsulePoint.sub(triPoint).normalize();
        const depth = radius - distance;
        segment.start.addScaledVector(dir, depth);
        segment.end.addScaledVector(dir, depth);
        updateBox();
        return false;
      },
    });
  }
}
