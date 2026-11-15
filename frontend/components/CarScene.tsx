"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * Low-poly 3D scene for the Overview banner: an orange Instant Mechanic service car driving on a road,
 * with a yellow car passing in the next lane. Built from simple shapes, no image files.
 * Stops drawing when the banner is off screen or the tab is hidden. With "reduce motion" switched on
 * in the system settings, it draws one still frame.
 */

const ORANGE = 0xff7900, YELLOW = 0xffcc00, INK = 0x202124, WHITE = 0xffffff, WARM = 0xfff9ef;

function buildCar(color: number, withBeacon: boolean) {
  const car = new THREE.Group();
  // side profile of the body, extruded across the width of the car
  const s = new THREE.Shape();
  s.moveTo(-2.1, 0.35); s.lineTo(2.05, 0.35); s.quadraticCurveTo(2.25, 0.4, 2.2, 0.75);
  s.lineTo(2.0, 0.95); s.lineTo(0.95, 1.05); s.lineTo(0.45, 1.6); s.lineTo(-1.15, 1.62);
  s.lineTo(-1.75, 1.05); s.lineTo(-2.15, 1.0); s.quadraticCurveTo(-2.25, 0.7, -2.1, 0.35);
  const bodyGeo = new THREE.ExtrudeGeometry(s, { depth: 1.7, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.08, bevelSegments: 3, curveSegments: 10 });
  bodyGeo.translate(0, 0, -0.85);
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.35 });
  const body = new THREE.Mesh(bodyGeo, paint);
  body.castShadow = true;
  car.add(body);
  // windows
  const w = new THREE.Shape();
  w.moveTo(0.82, 1.1); w.lineTo(0.38, 1.54); w.lineTo(-1.08, 1.56); w.lineTo(-1.6, 1.1);
  const glassGeo = new THREE.ExtrudeGeometry(w, { depth: 1.86, bevelEnabled: false });
  glassGeo.translate(0, 0, -0.93);
  const glass = new THREE.Mesh(glassGeo, new THREE.MeshStandardMaterial({ color: INK, metalness: 0.6, roughness: 0.15 }));
  car.add(glass);
  // white stripe along the side
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.12, 1.94), new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.5 }));
  stripe.position.set(0, 0.72, 0);
  car.add(stripe);
  // lights
  const head = new THREE.MeshStandardMaterial({ color: 0xfff6c2, emissive: 0xffe58a, emissiveIntensity: 1.2 });
  [-0.58, 0.58].forEach((z) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.36), head); l.position.set(2.27, 0.8, z); car.add(l); });
  const tail = new THREE.MeshStandardMaterial({ color: 0xffb36b, emissive: 0xff7900, emissiveIntensity: 0.8 });
  [-0.6, 0.6].forEach((z) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.34), tail); l.position.set(-2.27, 0.85, z); car.add(l); });
  // wheels
  const wheels: THREE.Object3D[] = [];
  const tyre = new THREE.MeshStandardMaterial({ color: INK, roughness: 0.9 });
  const rim = new THREE.MeshStandardMaterial({ color: withBeacon ? YELLOW : WHITE, metalness: 0.6, roughness: 0.3 });
  [[1.35, 0.95], [1.35, -0.95], [-1.35, 0.95], [-1.35, -0.95]].forEach(([x, z]) => {
    const wheel = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.32, 20), tyre);
    t.rotation.x = Math.PI / 2;
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.34, 6), rim);
    r.rotation.x = Math.PI / 2;
    wheel.add(t, r);
    wheel.position.set(x, 0.42, z);
    car.add(wheel);
    wheels.push(wheel);
  });
  // roadside-assistance light bar on the roof
  let beacon: THREE.Mesh | null = null;
  if (withBeacon) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 1.1), new THREE.MeshStandardMaterial({ color: INK }));
    bar.position.set(-0.35, 1.72, 0);
    beacon = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 1.0), new THREE.MeshStandardMaterial({ color: YELLOW, emissive: YELLOW, emissiveIntensity: 0.6 }));
    beacon.position.set(-0.35, 1.83, 0);
    car.add(bar, beacon);
  }
  return { car, wheels, beacon };
}

export default function CarScene({ className = "" }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(WARM, 18, 42);
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

    scene.add(new THREE.HemisphereLight(WHITE, 0xffe2b8, 1.6));
    const sun = new THREE.DirectionalLight(WHITE, 2.2);
    sun.position.set(6, 10, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
    scene.add(sun);

    // road with two lanes and moving yellow dashes
    const road = new THREE.Mesh(new THREE.PlaneGeometry(120, 7), new THREE.MeshStandardMaterial({ color: 0xf3efe7, roughness: 1 }));
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    scene.add(road);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 80), new THREE.MeshStandardMaterial({ color: WARM, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    scene.add(ground);
    const edgeMat = new THREE.MeshStandardMaterial({ color: ORANGE });
    [-3.5, 3.5].forEach((z) => { const e = new THREE.Mesh(new THREE.BoxGeometry(120, 0.02, 0.12), edgeMat); e.position.set(0, 0.01, z); scene.add(e); });
    const dashes = new THREE.Group();
    const dashMat = new THREE.MeshStandardMaterial({ color: YELLOW, emissive: YELLOW, emissiveIntensity: 0.15 });
    for (let i = 0; i < 30; i++) { const d = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.02, 0.14), dashMat); d.position.set(-60 + i * 4, 0.012, 0); dashes.add(d); }
    scene.add(dashes);
    // simple roadside markers for a sense of speed
    const posts = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: WHITE }), capMat = new THREE.MeshStandardMaterial({ color: ORANGE });
    for (let i = 0; i < 16; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.7, 0.14), postMat); p.position.set(-60 + i * 8, 0.35, -4.4);
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), capMat); c.position.set(-60 + i * 8, 0.72, -4.4);
      posts.add(p, c);
    }
    scene.add(posts);

    const hero = buildCar(ORANGE, true);
    hero.car.position.set(-16, 0, 1.7);
    scene.add(hero.car);
    const other = buildCar(YELLOW, false);
    other.car.scale.setScalar(0.9);
    other.car.position.set(-40, 0, -1.7);
    scene.add(other.car);

    const resize = () => {
      const w = el.clientWidth || 600, h = el.clientHeight || 260;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      // keep the car in view on narrow screens
      camera.position.set(7.5, 4.2, 11.5 * Math.max(1, 1.6 / camera.aspect));
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const clock = new THREE.Clock();
    let raf = 0, visible = true, intro = still ? 1 : 0;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const frame = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      if (!still) intro = Math.min(1, intro + dt / 2.4);
      const e = ease(intro);
      const speed = still ? 0 : 6 + (1 - e) * 18;
      // hero car drives in, then cruises in place while the road moves under it
      hero.car.position.x = -16 + 16 * e + 0.9;
      hero.car.position.y = still ? 0 : Math.sin(t * 9) * 0.015;
      hero.wheels.forEach((w) => (w.rotation.z -= speed * dt / 0.42));
      if (hero.beacon) (hero.beacon.material as THREE.MeshStandardMaterial).emissiveIntensity = still ? 0.6 : 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 6));
      dashes.children.forEach((d) => { d.position.x -= speed * dt; if (d.position.x < -60) d.position.x += 120; });
      posts.children.forEach((p) => { p.position.x -= speed * dt; if (p.position.x < -60) p.position.x += 128; });
      // the yellow car overtakes every few seconds in the far lane
      if (!still) {
        other.car.position.x += (speed + 5) * dt;
        other.wheels.forEach((w) => (w.rotation.z -= (speed + 5) * dt / 0.42));
        if (other.car.position.x > 30) other.car.position.x = -55;
      } else other.car.position.x = -6;
      // slow camera drift
      const sway = still ? 0 : Math.sin(t * 0.25) * 2.2;
      camera.position.x = 7.5 + sway;
      camera.lookAt(hero.car.position.x - 0.6, 1, 0);
      renderer.render(scene, camera);
      if (!still && visible) raf = requestAnimationFrame(frame);
    };
    frame();

    const setVisible = (v: boolean) => {
      if (still || v === visible) return;
      visible = v;
      if (v) { clock.getDelta(); raf = requestAnimationFrame(frame); } else cancelAnimationFrame(raf);
    };
    const io = new IntersectionObserver(([en]) => setVisible(en.isIntersecting && !document.hidden));
    io.observe(el);
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      scene.traverse((o: any) => { o.geometry?.dispose?.(); (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: any) => m?.dispose?.()); });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  if (failed) return null;
  return <div ref={host} className={className} />;
}
