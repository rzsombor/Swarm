export type OverlayScreen = 'title' | 'paused';

const SCREENS: Record<OverlayScreen, { title: string; action: string }> = {
  title: { title: 'Greenhouse Anomaly', action: 'Click to start' },
  paused: { title: 'Paused', action: 'Click to resume' },
};

const CONTROLS = 'WASD move · Shift sprint · C crouch · Space jump · F lantern · Esc pause';

/** Title/pause screen and crosshair; plain DOM over the canvas. */
export class Overlay {
  private readonly root = document.getElementById('overlay') as HTMLElement;
  private readonly title = document.getElementById('overlay-title') as HTMLElement;
  private readonly action = document.getElementById('overlay-action') as HTMLElement;
  private readonly hint = document.getElementById('overlay-hint') as HTMLElement;
  private readonly crosshair = document.getElementById('crosshair') as HTMLElement;

  show(screen: OverlayScreen | null, dragLook = false): void {
    this.root.hidden = screen === null;
    this.crosshair.hidden = screen !== null;
    if (screen === null) return;
    this.title.textContent = SCREENS[screen].title;
    this.action.textContent = SCREENS[screen].action;
    this.hint.textContent = dragLook ? `${CONTROLS} · Hold left mouse to look` : CONTROLS;
  }

  onActivate(handler: () => void): void {
    this.root.addEventListener('click', handler);
  }
}
