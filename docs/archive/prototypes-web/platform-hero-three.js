/* 平台首页 Three.js — Agent / Node 拓扑动画（非场景实景） */
(function () {
  const canvas = document.getElementById("platform-canvas");
  if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js";
  script.onload = init;
  document.head.appendChild(script);

  function init() {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x071612, 0.045);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.2, 7);

    const green = 0x78d691;
    const greenDim = 0x1f8a5b;

    const nodes = [
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
    const edges = [
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
    scene.add(group);

    const sphereGeo = new THREE.SphereGeometry(0.07, 16, 16);
    const coreMat = new THREE.MeshBasicMaterial({ color: green });
    const nodeMat = new THREE.MeshBasicMaterial({ color: greenDim });

    nodes.forEach((p, i) => {
      const mesh = new THREE.Mesh(sphereGeo, i === 0 ? coreMat : nodeMat);
      mesh.position.set(...p);
      mesh.userData.base = new THREE.Vector3(...p);
      group.add(mesh);
    });

    const linePos = [];
    edges.forEach(([a, b]) => {
      linePos.push(...nodes[a], ...nodes[b]);
    });
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(linePos, 3));
    const lines = new THREE.LineSegments(
      lineGeo,
      new THREE.LineBasicMaterial({ color: greenDim, transparent: true, opacity: 0.35 }),
    );
    group.add(lines);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.58, 64),
      new THREE.MeshBasicMaterial({
        color: green,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    const particles = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ color: green, size: 0.03, transparent: true, opacity: 0.5 }),
    );
    const pCount = 120;
    const pArr = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      pArr[i * 3] = (Math.random() - 0.5) * 10;
      pArr[i * 3 + 1] = (Math.random() - 0.5) * 6;
      pArr[i * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    particles.geometry.setAttribute("position", new THREE.BufferAttribute(pArr, 3));
    scene.add(particles);

    function resize() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    resize();
    window.addEventListener("resize", resize);

    let t0 = performance.now();
    function frame(now) {
      const t = (now - t0) * 0.001;
      group.rotation.y = t * 0.12;
      group.rotation.x = Math.sin(t * 0.15) * 0.08;
      ring.rotation.z = t * 0.2;
      particles.rotation.y = t * 0.04;

      group.children.forEach((child, i) => {
        if (!child.userData.base) return;
        child.position.y = child.userData.base.y + Math.sin(t * 1.2 + i) * 0.05;
      });

      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
})();
