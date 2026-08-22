import { useEffect, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function PlatformHeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [useFallback, setUseFallback] = useState(prefersReducedMotion);

  useEffect(() => {
    if (useFallback) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    void (async () => {
      const THREE = await import("three");
      if (disposed) return;

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      } catch {
        if (!disposed) setUseFallback(true);
        return;
      }

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x0c1a14, 0.028);

      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
      camera.position.set(0.35, 0.15, 7);

      const green = 0xa8e8bc;
      const greenDim = 0x5ecf8a;

      const nodes: [number, number, number][] = [
        [0, 0, 0],
        [-1.8, 0.6, -0.4],
        [1.9, -0.3, 0.2],
        [-0.6, -1.4, 0.5],
        [1.2, 1.1, -0.8],
        [-1.4, -0.8, -1.1],
        [0.5, -0.9, 1.0],
        [2.2, 0.8, 0.6],
        [-2.0, 1.0, 0.9],
      ];
      const edges: [number, number][] = [
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 4],
        [0, 5],
        [0, 6],
        [1, 5],
        [2, 7],
        [3, 6],
        [4, 7],
        [1, 8],
        [5, 8],
        [2, 4],
      ];

      const group = new THREE.Group();
      group.position.set(1.65, 0, 0);
      scene.add(group);

      const grid = new THREE.GridHelper(14, 28, 0x78d691, 0x2a5c44);
      grid.position.set(1.65, -1.85, -0.35);
      const gridMats = Array.isArray(grid.material) ? grid.material : [grid.material];
      for (const mat of gridMats) {
        mat.transparent = true;
        mat.opacity = 0.26;
      }
      scene.add(grid);

      const sphereGeo = new THREE.SphereGeometry(0.085, 16, 16);
      const coreMat = new THREE.MeshBasicMaterial({ color: green });
      const nodeMat = new THREE.MeshBasicMaterial({ color: greenDim });

      nodes.forEach((p, i) => {
        const mesh = new THREE.Mesh(sphereGeo, i === 0 ? coreMat : nodeMat);
        mesh.position.set(...p);
        mesh.userData.base = new THREE.Vector3(...p);
        group.add(mesh);
      });

      const linePos: number[] = [];
      edges.forEach(([a, b]) => {
        linePos.push(...nodes[a], ...nodes[b]);
      });
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(linePos, 3));
      const lineMat = new THREE.LineBasicMaterial({
        color: greenDim,
        transparent: true,
        opacity: 0.58,
      });
      const lineSegments = new THREE.LineSegments(lineGeo, lineMat);
      group.add(lineSegments);

      const ringGeo = new THREE.RingGeometry(0.55, 0.58, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: green,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);

      const outerRingGeo = new THREE.RingGeometry(0.92, 0.945, 72);
      const outerRingMat = new THREE.MeshBasicMaterial({
        color: greenDim,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
      });
      const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
      outerRing.rotation.x = Math.PI / 2;
      group.add(outerRing);

      const pCount = 120;
      const pArr = new Float32Array(pCount * 3);
      for (let i = 0; i < pCount; i++) {
        pArr[i * 3] = (Math.random() - 0.5) * 14;
        pArr[i * 3 + 1] = (Math.random() - 0.5) * 7;
        pArr[i * 3 + 2] = (Math.random() - 0.5) * 7;
      }
      const particlesGeo = new THREE.BufferGeometry();
      particlesGeo.setAttribute("position", new THREE.BufferAttribute(pArr, 3));
      const particlesMat = new THREE.PointsMaterial({
        color: green,
        size: 0.038,
        transparent: true,
        opacity: 0.62,
      });
      const particles = new THREE.Points(particlesGeo, particlesMat);
      scene.add(particles);

      let frameId = 0;
      const t0 = performance.now();

      const resize = () => {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };

      resize();
      window.addEventListener("resize", resize);

      const onContextLost = (event: Event) => {
        event.preventDefault();
        cancelAnimationFrame(frameId);
        if (!disposed) setUseFallback(true);
      };
      canvas.addEventListener("webglcontextlost", onContextLost);

      const frame = (now: number) => {
        const t = (now - t0) * 0.001;
        group.rotation.y = t * 0.12;
        group.rotation.x = Math.sin(t * 0.15) * 0.08;
        ring.rotation.z = t * 0.2;
        particles.rotation.y = t * 0.04;
        group.children.forEach((child, i) => {
          if (!("userData" in child) || !child.userData.base) return;
          child.position.y = child.userData.base.y + Math.sin(t * 1.2 + i) * 0.05;
        });
        renderer.render(scene, camera);
        frameId = requestAnimationFrame(frame);
      };
      frameId = requestAnimationFrame(frame);

      cleanup = () => {
        cancelAnimationFrame(frameId);
        window.removeEventListener("resize", resize);
        canvas.removeEventListener("webglcontextlost", onContextLost);
        renderer.dispose();
        sphereGeo.dispose();
        coreMat.dispose();
        nodeMat.dispose();
        lineGeo.dispose();
        lineMat.dispose();
        ringGeo.dispose();
        ringMat.dispose();
        outerRingGeo.dispose();
        outerRingMat.dispose();
        grid.geometry.dispose();
        for (const mat of gridMats) mat.dispose();
        particlesGeo.dispose();
        particlesMat.dispose();
        scene.fog = null;
      };
      if (disposed) cleanup();
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [useFallback]);

  return (
    <canvas
      ref={canvasRef}
      id="platform-canvas"
      className={`platform-canvas${useFallback ? " platform-canvas--static" : ""}`}
      aria-hidden
    />
  );
}
