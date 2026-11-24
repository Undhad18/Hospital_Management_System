import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  getDigitalTwinFloorplan,
  getDigitalTwinWards,
  getDigitalTwinPatientFlow,
  getDigitalTwinDashboard,
  syncDigitalTwin,
} from "../services/api";
import { subscribeToEvent } from "../services/socket";

// 24 Department spatial directory for 1-click precision camera navigation
const DEPARTMENT_LOCATIONS = {
  // Ground Level (L0)
  ambulance_bay: { floor: 0, cam: [22, 14, 54], target: [18, 1, 38], label: "🚑 Emergency Ambulance Bay" },
  emergency: { floor: 0, cam: [22, 14, 24], target: [18, 1, 10], label: "🚨 Emergency & Trauma Bays" },
  radiology: { floor: 0, cam: [-20, 14, -2], target: [-20, 1, -12], label: "☢️ Diagnostic CT / MRI Suite" },
  pathology: { floor: 0, cam: [-8, 14, -2], target: [-6, 1, -12], label: "🧪 STAT Pathology & Blood Lab" },
  blood_bank: { floor: 0, cam: [-8, 14, 2], target: [-6, 1, -4], label: "🩸 Blood Bank & Cold Chain" },
  pharmacy: { floor: 0, cam: [18, 14, -2], target: [18, 1, -12], label: "💊 Outpatient Pharmacy & Robot" },
  kiosks: { floor: 0, cam: [-14, 12, 28], target: [-14, 1, 18], label: "🖥️ Self-Registration Kiosks" },
  cafeteria: { floor: 0, cam: [-10, 12, 22], target: [-9, 1, 10], label: "☕ Visitor Cafeteria & Lounge" },
  reception: { floor: 0, cam: [-18, 14, 24], target: [-18, 1, 10], label: "🏥 Main Reception & Triage" },
  parking: { floor: 0, cam: [38, 20, 60], target: [30, 0, 36], label: "🚗 Grounds, Trees & Parking" },

  // Floor 1 (L1)
  general_ward: { floor: 1, cam: [-18, 22, 22], target: [-18, 11, 10], label: "🛏️ General Inpatient Ward A" },
  nurse_station: { floor: 1, cam: [-18, 22, -2], target: [-18, 11, -12], label: "👩‍⚕️ Central Nursing Hub" },
  cardiology_opd: { floor: 1, cam: [14, 22, 22], target: [14, 11, 12], label: "🩺 Cardiology Consultation" },
  pediatric_opd: { floor: 1, cam: [24, 22, 22], target: [23, 11, 12], label: "🧸 Pediatric Examination Suite" },
  orthopedic_opd: { floor: 1, cam: [18, 22, 4], target: [18, 11, 2], label: "🦴 Orthopedic & X-Ray Lightbox" },
  dialysis: { floor: 1, cam: [-24, 22, -2], target: [-24, 11, -12], label: "🩸 Hemodialysis Renal Care Suite" },
  physiotherapy: { floor: 1, cam: [-10, 22, -2], target: [-10, 11, -12], label: "🏋️ Physiotherapy & Rehabilitation" },
  private_suites: { floor: 1, cam: [18, 22, -2], target: [18, 11, -12], label: "🌟 Executive Deluxe Suites" },

  // Floor 2 (L2)
  ot1_cardiac: { floor: 2, cam: [-18, 30, 22], target: [-18, 20.5, 10], label: "🫀 OT 1 Cardiac Surgery & C-Arm" },
  ot2_ortho: { floor: 2, cam: [-18, 30, -2], target: [-18, 20.5, -12], label: "🔬 OT 2 Laparoscopic Suite" },
  cath_lab: { floor: 2, cam: [-26, 30, 22], target: [-24, 20.5, 10], label: "⚡ Cardiac Catheterization Lab" },
  scrub_cssd: { floor: 2, cam: [-6, 30, 10], target: [-6, 20.5, 0], label: "♨️ CSSD Autoclave & Scrub Sinks" },
  pacu_recovery: { floor: 2, cam: [18, 30, 22], target: [18, 20.5, 10], label: "🛌 PACU Surgical Recovery" },
  icu_ccu: { floor: 2, cam: [14, 30, -2], target: [14, 20.5, -12], label: "🫁 Intensive Care Unit (ICU/CCU)" },
  nicu: { floor: 2, cam: [24, 30, -2], target: [22, 20.5, -12], label: "👶 Neonatal ICU (NICU Incubators)" },

  // Floor 3 (L3)
  helipad: { floor: 3, cam: [0, 42, 24], target: [0, 29, 0], label: "🚁 Helipad & Air Ambulance HEMS" },
  solar_array: { floor: 3, cam: [-18, 42, 0], target: [-20, 30, 8], label: "☀️ Rooftop Solar PV Energy Array" },
  lox_tank: { floor: 3, cam: [-20, 42, -18], target: [-20, 30, -14], label: "❄️ Cryogenic Liquid Oxygen (LOX)" },
  satellite_mast: { floor: 3, cam: [6, 42, -18], target: [6, 30, -14], label: "📡 Tele-Medicine Satellite Uplink" },
  mep_plant: { floor: 3, cam: [18, 42, 0], target: [18, 30, -14], label: "⚡ HVAC Chillers & Diesel Plant" },
};

// Floor-specific comprehensive operational profiles
const FLOOR_PROFILES = {
  0: {
    name: "L0 Ground Floor: Emergency, Diagnostics & Outpatient",
    departments: ["Emergency Trauma", "Ambulance Bay", "CT/MRI Imaging", "STAT Pathology Lab", "Blood Bank", "Central Pharmacy", "Main Reception", "Visitor Cafeteria"],
    stats: {
      beds: "2 Resuscitation Trauma Beds",
      ambulances: "2 ALS Units Standby on Bay",
      equipment: "Siemens 128-Slice CT • Cold Chain (+4°C/-20°C)",
      cleanliness: "Grade B (Emergency/OPD)",
      airChanges: "12 ACH",
      temperature: "22.0°C",
    },
    rooms: [
      { key: "emergency", title: "Emergency Trauma Resuscitation Bays", coords: [18, 1, 10] },
      { key: "radiology", title: "Siemens 128-Slice CT/MRI Suite", coords: [-20, 1, -12] },
      { key: "blood_bank", title: "Blood Bank & Cold Storage", coords: [-6, 1, -4] },
      { key: "pharmacy", title: "Pharmacy Robotic Dispenser", coords: [18, 1, -12] },
      { key: "reception", title: "Main Reception & Triage Hub", coords: [-18, 1, 10] },
    ],
  },
  1: {
    name: "L1 Inpatient Care, Hemodialysis & Specialized Clinics",
    departments: ["General Inpatient Ward A", "Central Nursing Hub", "Cardiology OPD", "Pediatric Suite", "Orthopedic Suite", "Hemodialysis Unit", "Physiotherapy Gym", "Executive Deluxe Suites"],
    stats: {
      beds: "6 Inpatient Beds (83% Census)",
      ambulances: "N/A (Inpatient Level)",
      equipment: "Fresenius Hemodialysis • X-Ray Lightbox • Pyxis MedStation",
      cleanliness: "Grade B (Inpatient Wards)",
      airChanges: "14 ACH",
      temperature: "22.8°C",
    },
    rooms: [
      { key: "general_ward", title: "General Inpatient Ward A (Beds 201-204)", coords: [-18, 1, 10] },
      { key: "dialysis", title: "Renal Care Hemodialysis Suite", coords: [-24, 1, -12] },
      { key: "nurse_station", title: "Central Nursing Telemetry Hub", coords: [-15, 1, -12] },
      { key: "cardiology_opd", title: "Cardiology Consultation Clinic", coords: [14, 1, 12] },
      { key: "private_suites", title: "Executive Deluxe Private Suites", coords: [18, 1, -12] },
    ],
  },
  2: {
    name: "L2 Surgical Theaters, Cath Lab, ICU & Neonatal NICU",
    departments: ["Cardiac OT 1 & C-Arm", "Laparoscopic OT 2", "Cardiac Cath Lab", "CSSD Steam Autoclaves", "Surgical Scrub Troughs", "PACU Recovery", "Coronary ICU (AIIR)", "Neonatal NICU Incubators"],
    stats: {
      beds: "3 Critical Care Beds + 2 Incubators",
      ambulances: "N/A (Surgical Level)",
      equipment: "GE Mobile C-Arm • Tuttnauer Autoclaves • Giraffe Incubators",
      cleanliness: "ISO-5 Class 100 Sterile Grade A",
      airChanges: "24 ACH (Positive/Negative Pressure)",
      temperature: "19.5°C",
    },
    rooms: [
      { key: "ot1_cardiac", title: "Cardiac OT 1 with C-Arm Fluoroscope", coords: [-18, 1, 10] },
      { key: "ot2_ortho", title: "Laparoscopic OT 2 Minimally Invasive", coords: [-18, 1, -12] },
      { key: "scrub_cssd", title: "CSSD Steam Autoclaves & Scrub Troughs", coords: [-6, 1, 0] },
      { key: "icu_ccu", title: "Intensive Care Unit (Negative AIIR)", coords: [14, 1, -12] },
      { key: "nicu", title: "Neonatal ICU Giraffe Incubator Pods", coords: [22, 1, -12] },
    ],
  },
  3: {
    name: "L3 Rooftop Helipad, Solar PV & Critical Infrastructure",
    departments: ["HEMS Helipad Landing Deck", "Air Ambulance EC135", "Solar Photovoltaic Array", "Cryogenic Liquid Oxygen (LOX)", "Satellite Uplink Mast", "HVAC Chiller Cooling Towers", "Backup Diesel Plant"],
    stats: {
      beds: "Helipad Flight Deck (21m Diameter)",
      ambulances: "1x Air Ambulance Helicopter (Ready)",
      equipment: "84.5 kW Solar PV Array • 14,000L LOX Cryo Tank",
      cleanliness: "Outdoor Atmospheric MEP Enclosure",
      airChanges: "Ambient Cross-Ventilated",
      temperature: "Outdoor Weather Profile",
    },
    rooms: [
      { key: "helipad", title: "Helipad & Air Ambulance Eurocopter EC135", coords: [0, 1, 0] },
      { key: "solar_array", title: "Solar Photovoltaic (PV) Plant (84.5 kW)", coords: [-20, 1, 8] },
      { key: "lox_tank", title: "Bulk Liquid Oxygen (LOX) Cryogenic Tank", coords: [-20, 1, -14] },
      { key: "mep_plant", title: "HVAC Chillers & Emergency Generator", coords: [20, 1, -14] },
    ],
  },
};

export default function Hospital3DDigitalTwin({ session }) {
  const token = session?.token;
  const mountRef = useRef(null);

  // Data States
  const [floorplanData, setFloorplanData] = useState(null);
  const [wardsData, setWardsData] = useState(null);
  const [flowData, setFlowData] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Viewport & Mode Settings
  const [selectedFloor, setSelectedFloor] = useState("all"); // "all" | 0 | 1 | 2 | 3
  const [viewMode, setViewMode] = useState("architectural"); // "architectural" | "heatmap" | "patient_flow"
  const [lightingMode, setLightingMode] = useState("day"); // "day" | "night"
  const [explodedView, setExplodedView] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [showRoof, setShowRoof] = useState(true);
  const [showFacade, setShowFacade] = useState(false);
  const [showMedGas, setShowMedGas] = useState(false);
  const [showLabels, setShowLabels] = useState(true); // 3D Spatial Room Labels
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, data: null });
  const [codeBlueActive, setCodeBlueActive] = useState(false);
  const [selectedDeptKey, setSelectedDeptKey] = useState("");
  const [tourIndex, setTourIndex] = useState(0);

  const [statsSummary, setStatsSummary] = useState({
    totalBeds: 0,
    occupiedBeds: 0,
    availableBeds: 0,
    maintenanceBeds: 0,
    occupancyPct: 0,
    totalHeadcount: 0,
    congestionAvg: 0,
  });

  // Three.js Scene References
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const interactiveMeshesRef = useRef([]);
  const animFrameIdRef = useRef(null);
  const hoveredMeshRef = useRef(null);
  const floorGroupsRef = useRef({});
  const flowPathGroupRef = useRef(null);
  const medGasGroupRef = useRef(null);
  const facadeGroupRef = useRef(null);
  const roomBadgesGroupRef = useRef(null);
  const lightsRef = useRef({});
  const spineGroupRef = useRef(null);

  // Live mutable refs
  const explodedViewRef = useRef(explodedView);
  const selectedFloorRef = useRef(selectedFloor);
  const autoRotateRef = useRef(autoRotate);
  const codeBlueActiveRef = useRef(codeBlueActive);
  const showFacadeRef = useRef(showFacade);
  const showMedGasRef = useRef(showMedGas);
  const showLabelsRef = useRef(showLabels);

  useEffect(() => {
    explodedViewRef.current = explodedView;
  }, [explodedView]);

  useEffect(() => {
    selectedFloorRef.current = selectedFloor;
    setTourIndex(0);
  }, [selectedFloor]);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    codeBlueActiveRef.current = codeBlueActive;
  }, [codeBlueActive]);

  useEffect(() => {
    showFacadeRef.current = showFacade;
    if (facadeGroupRef.current) {
      facadeGroupRef.current.visible = showFacade;
    }
  }, [showFacade]);

  useEffect(() => {
    showMedGasRef.current = showMedGas;
    if (medGasGroupRef.current) {
      medGasGroupRef.current.visible = showMedGas;
    }
  }, [showMedGas]);

  useEffect(() => {
    showLabelsRef.current = showLabels;
    if (roomBadgesGroupRef.current) {
      roomBadgesGroupRef.current.visible = showLabels;
    }
  }, [showLabels]);

  // Fetch telemetry
  const loadAllTelemetry = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) setLoading(true);
      setError(null);
      try {
        const [fpRes, wardsRes, flowRes, dashRes] = await Promise.all([
          getDigitalTwinFloorplan(token).catch(() => ({ success: false })),
          getDigitalTwinWards(token).catch(() => ({ success: false })),
          getDigitalTwinPatientFlow(token).catch(() => ({ success: false })),
          getDigitalTwinDashboard(token).catch(() => ({ success: false })),
        ]);

        if (fpRes?.success && fpRes.data) setFloorplanData(fpRes.data);
        if (wardsRes?.success && wardsRes.data) setWardsData(wardsRes.data);
        if (flowRes?.success && flowRes.data) setFlowData(flowRes.data);
        if (dashRes?.success && dashRes.data) setDashboardData(dashRes.data);

        let totalBeds = 0;
        let occupiedBeds = 0;
        let availableBeds = 0;
        let maintenanceBeds = 0;
        if (wardsRes?.data?.wards) {
          wardsRes.data.wards.forEach((w) => {
            totalBeds += w.totalBeds || 0;
            occupiedBeds += w.occupiedBeds || 0;
            availableBeds += w.availableBeds || 0;
            maintenanceBeds += w.maintenanceBeds || 0;
          });
        }
        const headcount = fpRes?.data?.overall_telemetry?.total_headcount || dashRes?.data?.headcount || 56;
        const congestion = fpRes?.data?.overall_telemetry?.average_congestion_index || 48;
        const occupancyPct = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 65;

        setStatsSummary({
          totalBeds: totalBeds || 20,
          occupiedBeds: occupiedBeds || 14,
          availableBeds: availableBeds || 5,
          maintenanceBeds: maintenanceBeds || 1,
          occupancyPct: occupancyPct,
          totalHeadcount: headcount,
          congestionAvg: congestion,
        });

        setLastUpdated(new Date().toLocaleTimeString());
      } catch (err) {
        setError("Failed to synchronize Digital Twin telemetry: " + err.message);
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    loadAllTelemetry();
  }, [loadAllTelemetry]);

  useEffect(() => {
    const unsub = subscribeToEvent(
      "digital_twin:update",
      () => {
        loadAllTelemetry(false);
      },
      token
    );
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [loadAllTelemetry, token]);

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      await syncDigitalTwin(token);
      await loadAllTelemetry(false);
    } catch {
      // fallback
    } finally {
      setTimeout(() => setSyncing(false), 600);
    }
  };

  // -------------------------------------------------------------
  // INITIALIZE THREE.JS CANVAS & SCENE
  // -------------------------------------------------------------
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = Math.max(container.clientWidth || 0, 800);
    const height = Math.max(container.clientHeight || 0, 550);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(lightingMode === "day" ? "#0b1329" : "#050914");
    scene.fog = new THREE.FogExp2(lightingMode === "day" ? "#0b1329" : "#050914", 0.005);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 1000);
    camera.position.set(58, 68, 85);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = lightingMode === "day" ? 1.15 : 0.95;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    rendererRef.current = renderer;

    if (!container.contains(renderer.domElement)) {
      container.appendChild(renderer.domElement);
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 15;
    controls.maxDistance = 280;
    controls.target.set(0, 10, 0);
    controlsRef.current = controls;

    // Lighting Setup
    const ambientLight = new THREE.AmbientLight(
      lightingMode === "day" ? 0xe2e8f0 : 0x1e293b,
      lightingMode === "day" ? 1.15 : 0.65
    );
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(
      lightingMode === "day" ? 0xbae6fd : 0x0f172a,
      0x1e293b,
      lightingMode === "day" ? 0.75 : 0.45
    );
    hemiLight.position.set(0, 100, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(
      lightingMode === "day" ? 0xffffff : 0x93c5fd,
      lightingMode === "day" ? 1.6 : 0.85
    );
    sunLight.position.set(65, 110, 50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 280;
    sunLight.shadow.camera.left = -75;
    sunLight.shadow.camera.right = 75;
    sunLight.shadow.camera.top = 75;
    sunLight.shadow.camera.bottom = -75;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    const blueKeyLight = new THREE.PointLight(0x0284c7, 1.4, 150);
    blueKeyLight.position.set(-45, 35, -40);
    scene.add(blueKeyLight);

    const warmAccentLight = new THREE.PointLight(0x38bdf8, 1.0, 120);
    warmAccentLight.position.set(40, 30, -35);
    scene.add(warmAccentLight);

    lightsRef.current = { ambientLight, hemiLight, sunLight, blueKeyLight, warmAccentLight };

    // Ground Foundation
    const groundGroup = new THREE.Group();
    groundGroup.userData.isGround = true;

    const groundGeo = new THREE.PlaneGeometry(260, 260);
    const groundMat = new THREE.MeshStandardMaterial({
      color: lightingMode === "day" ? 0x090e1a : 0x04060b,
      roughness: 0.95,
      metalness: 0.1,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.15;
    groundMesh.receiveShadow = true;
    groundGroup.add(groundMesh);

    const grid = new THREE.GridHelper(200, 50, 0x1e293b, 0x0f172a);
    grid.position.y = -0.1;
    groundGroup.add(grid);

    // Drop-off Driveway
    const roadGeo = new THREE.PlaneGeometry(90, 28);
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.85 });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, -0.08, 38);
    groundGroup.add(road);

    // Emergency Drop-off Red Markings
    const emMarkingGeo = new THREE.PlaneGeometry(24, 16);
    const emMarkingMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.6 });
    const emMarking = new THREE.Mesh(emMarkingGeo, emMarkingMat);
    emMarking.rotation.x = -Math.PI / 2;
    emMarking.position.set(16, -0.06, 36);
    groundGroup.add(emMarking);

    // Crosswalk Stripes
    for (let zx = -4; zx <= 4; zx += 1.4) {
      const zebra = new THREE.Mesh(
        new THREE.PlaneGeometry(0.7, 4.5),
        new THREE.MeshBasicMaterial({ color: 0xf8fafc })
      );
      zebra.rotation.x = -Math.PI / 2;
      zebra.position.set(zx, -0.05, 34);
      groundGroup.add(zebra);
    }

    // Landscaping Trees
    [-38, 38].forEach((gx) => {
      const lawnGeo = new THREE.PlaneGeometry(18, 26);
      const lawnMat = new THREE.MeshStandardMaterial({ color: 0x064e3b, roughness: 0.9 });
      const lawn = new THREE.Mesh(lawnGeo, lawnMat);
      lawn.rotation.x = -Math.PI / 2;
      lawn.position.set(gx, -0.07, 36);
      groundGroup.add(lawn);

      [
        [gx - 4, 30],
        [gx + 4, 42],
        [gx, 36],
      ].forEach(([tx, tz]) => {
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.3, 2.0, 8),
          new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 })
        );
        trunk.position.set(tx, 1.0, tz);
        groundGroup.add(trunk);

        const canopy = new THREE.Mesh(
          new THREE.SphereGeometry(1.4, 12, 12),
          new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 })
        );
        canopy.position.set(tx, 2.6, tz);
        groundGroup.add(canopy);
      });
    });

    scene.add(groundGroup);

    // Animation Loop
    const startTime = performance.now();
    const animate = (currentTime) => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      const elapsedTime = ((currentTime || performance.now()) - startTime) * 0.001;

      const isExploded = explodedViewRef.current;
      const currentFloor = selectedFloorRef.current;
      const isSingleFloor = currentFloor !== "all";
      const isCodeBlue = codeBlueActiveRef.current;

      const floorTargets = {
        0: 0,
        1: isExploded ? 20 : 9.5,
        2: isExploded ? 40 : 19.0,
        3: isExploded ? 58 : 28.5,
      };

      Object.entries(floorGroupsRef.current).forEach(([fNum, group]) => {
        if (!group) return;
        const num = Number(fNum);

        if (isSingleFloor) {
          const isTargetFloor = num === Number(currentFloor);
          group.visible = isTargetFloor;
          const targetY = isTargetFloor ? 0 : (floorTargets[fNum] ?? 0);
          group.position.y = THREE.MathUtils.lerp(group.position.y, targetY, 0.12);
        } else {
          group.visible = true;
          const targetY = floorTargets[fNum] ?? 0;
          group.position.y = THREE.MathUtils.lerp(group.position.y, targetY, 0.08);
        }
      });

      if (spineGroupRef.current) {
        spineGroupRef.current.visible = !isSingleFloor;
      }

      // Animated Medical Effects & Dynamic Machinery
      scene.traverse((obj) => {
        if (obj.userData?.isBeacon) {
          const pulse = 1 + Math.sin(elapsedTime * 6) * 0.2;
          obj.scale.set(pulse, pulse, pulse);
        }

        if (obj.userData?.isEmergencyBeacon) {
          if (isCodeBlue) {
            const isRed = Math.sin(elapsedTime * 20) > 0;
            obj.material.color.setHex(isRed ? 0xef4444 : 0x0284c7);
            obj.material.emissive?.setHex(isRed ? 0xef4444 : 0x0284c7);
            const scale = 1.3 + Math.sin(elapsedTime * 20) * 0.3;
            obj.scale.set(scale, scale, scale);
          } else {
            const isRed = Math.sin(elapsedTime * 8) > 0;
            obj.material.color.setHex(isRed ? 0xdc2626 : 0x0284c7);
            obj.material.emissive?.setHex(isRed ? 0xdc2626 : 0x0284c7);
          }
        }

        if (obj.userData?.isRotorBlade) {
          const speed = isCodeBlue ? 0.15 : 0.04;
          obj.rotation.y += speed;
        }

        if (obj.userData?.isTailRotor) {
          const speed = isCodeBlue ? 0.3 : 0.08;
          obj.rotation.x += speed;
        }

        if (obj.userData?.isHvacFan) {
          obj.rotation.y += 0.05;
        }

        if (obj.userData?.isAirflowRing) {
          obj.rotation.z += 0.03;
        }

        if (obj.userData?.isScannerLaser) {
          const pulse = 0.8 + Math.sin(elapsedTime * 4) * 0.2;
          obj.material.opacity = pulse;
        }

        if (obj.userData?.isFlowParticle) {
          const speed = obj.userData.flowSpeed || 0.8;
          const offset = (elapsedTime * speed + obj.userData.phase) % 1;
          if (obj.userData.curve) {
            const point = obj.userData.curve.getPoint(offset);
            obj.position.copy(point);
          }
        }
      });

      controls.autoRotate = autoRotateRef.current;
      controls.autoRotateSpeed = 0.8;
      controls.update();

      const currW = container.clientWidth;
      const currH = container.clientHeight;
      if (currW > 0 && currH > 0) {
        renderer.render(scene, camera);
      }
    };
    animate();

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h, false);
        }
      }
    });
    resizeObserver.observe(container);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerMove = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(interactiveMeshesRef.current, false);

      if (intersects.length > 0) {
        const topMesh = intersects[0].object;
        renderer.domElement.style.cursor = "pointer";

        if (hoveredMeshRef.current !== topMesh) {
          if (hoveredMeshRef.current && hoveredMeshRef.current.material) {
            hoveredMeshRef.current.material.emissive?.setHex(
              hoveredMeshRef.current.userData.originalEmissive || 0x000000
            );
          }
          hoveredMeshRef.current = topMesh;
          if (topMesh.material && topMesh.material.emissive) {
            topMesh.material.emissive.setHex(0x38bdf8);
          }
        }

        const entityData = topMesh.userData?.entityData || topMesh.userData?.zoneData;
        if (entityData) {
          setTooltip({
            visible: true,
            x: event.clientX - rect.left + 14,
            y: event.clientY - rect.top - 12,
            data: entityData,
          });
        }
      } else {
        renderer.domElement.style.cursor = "default";
        if (hoveredMeshRef.current && hoveredMeshRef.current.material) {
          hoveredMeshRef.current.material.emissive?.setHex(
            hoveredMeshRef.current.userData.originalEmissive || 0x000000
          );
          hoveredMeshRef.current = null;
        }
        setTooltip((prev) => ({ ...prev, visible: false }));
      }
    };

    const onPointerDown = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(interactiveMeshesRef.current, false);

      if (intersects.length > 0) {
        const topMesh = intersects[0].object;
        const entityData = topMesh.userData?.entityData || topMesh.userData?.zoneData;
        if (entityData) {
          setSelectedEntity(entityData);
        }
      }
    };

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    return () => {
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      if (container && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [lightingMode]);

  // -------------------------------------------------------------
  // BUILD COMPLETE DETAILED 3D HOSPITAL ARCHITECTURE & FURNITURE
  // -------------------------------------------------------------
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    const toRemove = [];
    scene.traverse((obj) => {
      if (obj.userData?.isArchObject) {
        toRemove.push(obj);
      }
    });
    toRemove.forEach((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
      scene.remove(obj);
    });

    interactiveMeshesRef.current = [];
    floorGroupsRef.current = {};

    const materials = {
      slabBase: new THREE.MeshStandardMaterial({
        color: lightingMode === "day" ? 0x1e293b : 0x0f172a,
        roughness: 0.6,
        metalness: 0.2,
      }),
      slabTrim: new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        roughness: 0.3,
        metalness: 0.7,
      }),
      wallSolid: new THREE.MeshStandardMaterial({
        color: 0xf1f5f9,
        roughness: 0.7,
        metalness: 0.1,
      }),
      wallInterior: new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.8,
        metalness: 0.05,
      }),
      glassPartition: new THREE.MeshPhysicalMaterial({
        color: 0x93c5fd,
        transparent: true,
        opacity: 0.35,
        roughness: 0.1,
        metalness: 0.1,
        transmission: 0.75,
        ior: 1.5,
      }),
      exteriorCurtainGlass: new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.22,
        roughness: 0.05,
        metalness: 0.3,
        transmission: 0.85,
        ior: 1.52,
      }),
      aluminumMullion: new THREE.MeshStandardMaterial({
        color: 0x64748b,
        metalness: 0.85,
        roughness: 0.25,
      }),
      floorCorridor: new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.4,
        metalness: 0.1,
      }),
      floorLobbyTile: new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.2,
        metalness: 0.3,
      }),
      floorWardWood: new THREE.MeshStandardMaterial({
        color: 0xe0e7ff,
        roughness: 0.5,
        metalness: 0.1,
      }),
      floorOtSterile: new THREE.MeshStandardMaterial({
        color: 0x0f766e,
        roughness: 0.25,
        metalness: 0.2,
      }),
      floorEmergency: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.3,
        metalness: 0.1,
      }),
      floorRadiologyLead: new THREE.MeshStandardMaterial({
        color: 0x1e1e24,
        roughness: 0.4,
        metalness: 0.5,
      }),
      chromeMetal: new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        metalness: 0.9,
        roughness: 0.15,
      }),
      whiteComposite: new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.35,
      }),
      darkMonitor: new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.3,
      }),
      monitorScreenOn: new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x059669,
        emissiveIntensity: 0.85,
      }),
      woodCountertop: new THREE.MeshStandardMaterial({
        color: 0xb45309,
        roughness: 0.5,
      }),
      sofaFabricNavy: new THREE.MeshStandardMaterial({
        color: 0x1e3a8a,
        roughness: 0.8,
      }),
      sofaFabricTeal: new THREE.MeshStandardMaterial({
        color: 0x0d9488,
        roughness: 0.8,
      }),
      emergencyRed: new THREE.MeshStandardMaterial({
        color: 0xdc2626,
        roughness: 0.4,
      }),
      emergencyYellow: new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        roughness: 0.4,
      }),
      solarCellMat: new THREE.MeshStandardMaterial({
        color: 0x1e3a8a,
        roughness: 0.2,
        metalness: 0.8,
      }),
    };

    // Helper: 3D Canvas Spatial Badge Maker
    const createSpatialBadge = (title, categoryColor = "#0284c7") => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");

      ctx.fillStyle = "rgba(11, 19, 41, 0.85)";
      ctx.roundRect(4, 4, 248, 56, 12);
      ctx.fill();

      ctx.strokeStyle = categoryColor;
      ctx.lineWidth = 3;
      ctx.roundRect(4, 4, 248, 56, 12);
      ctx.stroke();

      ctx.font = "bold 20px sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(title, 128, 32);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(7.5, 1.85, 1);
      return sprite;
    };

    // Helper: Realistic Hospital Bed
    const createRealisticHospitalBed = (bedData, x, z, rotationY = 0) => {
      const bedGroup = new THREE.Group();
      bedGroup.position.set(x, 0.1, z);
      bedGroup.rotation.y = rotationY;

      const isOccupied = bedData.status === "occupied";
      const isMaintenance = bedData.status === "maintenance";

      let bedColor = 0x10b981;
      if (isOccupied) bedColor = 0x0284c7;
      if (isMaintenance) bedColor = 0xf59e0b;

      const chassisGeo = new THREE.BoxGeometry(1.6, 0.12, 2.7);
      const chassis = new THREE.Mesh(chassisGeo, materials.chromeMetal);
      chassis.position.y = 0.22;
      chassis.castShadow = true;
      bedGroup.add(chassis);

      [
        [-0.7, -1.15],
        [0.7, -1.15],
        [-0.7, 1.15],
        [0.7, 1.15],
      ].forEach(([wx, wz]) => {
        const wheelGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.06, 12);
        const wheel = new THREE.Mesh(wheelGeo, materials.darkMonitor);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.08, wz);
        bedGroup.add(wheel);
      });

      const columnGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.35, 12);
      const column = new THREE.Mesh(columnGeo, materials.chromeMetal);
      column.position.y = 0.45;
      bedGroup.add(column);

      const mattressGeo = new THREE.BoxGeometry(1.45, 0.24, 2.5);
      const mattressMat = new THREE.MeshStandardMaterial({ color: bedColor, roughness: 0.55 });
      const mattress = new THREE.Mesh(mattressGeo, mattressMat);
      mattress.position.y = 0.75;
      mattress.castShadow = true;
      mattress.receiveShadow = true;
      mattress.userData = {
        entityData: {
          ...bedData,
          type: "hospital_bed",
          title: `Bed ${bedData.bedNumber || "B-101"} (${bedData.status || "available"})`,
          wardName: bedData.wardName || "Inpatient Care",
          statusColor: bedColor,
        },
        originalEmissive: 0x000000,
      };
      bedGroup.add(mattress);
      interactiveMeshesRef.current.push(mattress);

      const pillow = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.14, 0.55), materials.whiteComposite);
      pillow.position.set(0, 0.94, -0.9);
      pillow.rotation.x = -0.1;
      bedGroup.add(pillow);

      const headboard = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.7, 0.08), materials.whiteComposite);
      headboard.position.set(0, 0.95, -1.3);
      bedGroup.add(headboard);

      const footboard = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.5, 0.08), materials.whiteComposite);
      footboard.position.set(0, 0.85, 1.3);
      bedGroup.add(footboard);

      [-0.75, 0.75].forEach((rx) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.25, 1.4), materials.chromeMetal);
        rail.position.set(rx, 0.95, 0.1);
        bedGroup.add(rail);
      });

      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.75, 0.65), materials.whiteComposite);
      stand.position.set(1.25, 0.45, -0.9);
      bedGroup.add(stand);

      const ivPole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 8), materials.chromeMetal);
      ivPole.position.set(-1.15, 1.15, -1.1);
      bedGroup.add(ivPole);

      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.35, 0.1), new THREE.MeshStandardMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.65 }));
      bag.position.set(-1.15, 2.05, -1.0);
      bedGroup.add(bag);

      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), materials.chromeMetal);
      arm.rotation.z = Math.PI / 3;
      arm.position.set(1.15, 1.4, -1.1);
      bedGroup.add(arm);

      const monitorCase = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.12), materials.darkMonitor);
      monitorCase.position.set(1.35, 1.6, -1.1);
      monitorCase.rotation.y = -Math.PI / 6;
      bedGroup.add(monitorCase);

      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.32), isOccupied ? materials.monitorScreenOn : materials.darkMonitor);
      screen.position.set(1.35, 1.6, -1.03);
      screen.rotation.y = -Math.PI / 6;
      bedGroup.add(screen);

      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 12, 12),
        new THREE.MeshStandardMaterial({ color: bedColor, emissive: bedColor, emissiveIntensity: 0.9 })
      );
      beacon.position.set(0, 1.15, 1.32);
      beacon.userData.isBeacon = isOccupied;
      bedGroup.add(beacon);

      return bedGroup;
    };

    // Helper: Wall Enclosure
    const buildRoomEnclosure = (x, z, w, d, height = 2.2, hasGlassFront = false) => {
      const roomGroup = new THREE.Group();
      roomGroup.position.set(x, 0, z);

      const wallThick = 0.22;
      const hw = w / 2;
      const hd = d / 2;

      const backWall = new THREE.Mesh(new THREE.BoxGeometry(w, height, wallThick), materials.wallSolid);
      backWall.position.set(0, height / 2, -hd);
      roomGroup.add(backWall);

      const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height, d), materials.wallSolid);
      leftWall.position.set(-hw, height / 2, 0);
      roomGroup.add(leftWall);

      const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height, d), materials.wallSolid);
      rightWall.position.set(hw, height / 2, 0);
      roomGroup.add(rightWall);

      const doorWidth = 2.4;
      const sideWallW = (w - doorWidth) / 2;

      if (hasGlassFront) {
        const glassL = new THREE.Mesh(new THREE.BoxGeometry(sideWallW, height, 0.08), materials.glassPartition);
        glassL.position.set(-hw + sideWallW / 2, height / 2, hd);
        roomGroup.add(glassL);

        const glassR = new THREE.Mesh(new THREE.BoxGeometry(sideWallW, height, 0.08), materials.glassPartition);
        glassR.position.set(hw - sideWallW / 2, height / 2, hd);
        roomGroup.add(glassR);

        const mullionL = new THREE.Mesh(new THREE.BoxGeometry(0.08, height, 0.12), materials.aluminumMullion);
        mullionL.position.set(-doorWidth / 2, height / 2, hd);
        roomGroup.add(mullionL);
        const mullionR = new THREE.Mesh(new THREE.BoxGeometry(0.08, height, 0.12), materials.aluminumMullion);
        mullionR.position.set(doorWidth / 2, height / 2, hd);
        roomGroup.add(mullionR);
      } else {
        const wallL = new THREE.Mesh(new THREE.BoxGeometry(sideWallW, height, wallThick), materials.wallSolid);
        wallL.position.set(-hw + sideWallW / 2, height / 2, hd);
        roomGroup.add(wallL);

        const wallR = new THREE.Mesh(new THREE.BoxGeometry(sideWallW, height, wallThick), materials.wallSolid);
        wallR.position.set(hw - sideWallW / 2, height / 2, hd);
        roomGroup.add(wallR);

        const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, 0.4, wallThick), materials.wallSolid);
        lintel.position.set(0, height - 0.2, hd);
        roomGroup.add(lintel);
      }

      return roomGroup;
    };

    // Helper: 3D Ambulance
    const createAmbulance = (ambData, x, z, rotationY = 0) => {
      const ambGroup = new THREE.Group();
      ambGroup.position.set(x, 0.1, z);
      ambGroup.rotation.y = rotationY;

      const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.0, 5.2), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.2 }));
      body.position.y = 1.25;
      ambGroup.add(body);

      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.36, 1.3, 1.8), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.2 }));
      cab.position.set(0, 0.9, 2.8);
      ambGroup.add(cab);

      const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.8, 0.08), materials.darkMonitor);
      windshield.position.set(0, 1.6, 2.3);
      windshield.rotation.x = 0.35;
      ambGroup.add(windshield);

      [-1.22, 1.22].forEach((sx) => {
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 0.35), materials.emergencyRed);
        stripe.position.set(sx, 1.1, 0.2);
        stripe.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
        ambGroup.add(stripe);

        const crossH = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.25), materials.emergencyRed);
        crossH.position.set(sx + (sx > 0 ? 0.01 : -0.01), 1.6, -0.6);
        crossH.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
        ambGroup.add(crossH);

        const crossV = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.8), materials.emergencyRed);
        crossV.position.set(sx + (sx > 0 ? 0.01 : -0.01), 1.6, -0.6);
        crossV.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
        ambGroup.add(crossV);
      });

      [
        [-1.15, -1.6],
        [1.15, -1.6],
        [-1.15, 2.1],
        [1.15, 2.1],
      ].forEach(([wx, wz]) => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.32, 16), new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 }));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.42, wz);
        ambGroup.add(wheel);

        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.34, 12), materials.chromeMetal);
        hub.rotation.z = Math.PI / 2;
        hub.position.set(wx, 0.42, wz);
        ambGroup.add(hub);
      });

      const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.4), materials.chromeMetal);
      barBase.position.set(0, 2.32, 1.8);
      ambGroup.add(barBase);

      const redStrobe = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xdc2626, emissiveIntensity: 0.9 })
      );
      redStrobe.position.set(-0.55, 2.45, 1.8);
      redStrobe.userData = { isEmergencyBeacon: true };
      ambGroup.add(redStrobe);

      const blueStrobe = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0x0284c7, emissive: 0x0284c7, emissiveIntensity: 0.9 })
      );
      blueStrobe.position.set(0.55, 2.45, 1.8);
      blueStrobe.userData = { isEmergencyBeacon: true };
      ambGroup.add(blueStrobe);

      body.userData = {
        entityData: {
          ...ambData,
          type: "ambulance",
          title: ambData.title || "EMS Emergency Ambulance 01",
          department: "Emergency Medical Services",
          status: ambData.status || "ready",
          equipment: ["Cardiac Defibrillator", "Transport Ventilator", "Trauma Kit", "Automated CPR System"],
        },
        originalEmissive: 0x000000,
      };
      interactiveMeshesRef.current.push(body);

      return ambGroup;
    };

    // Helper: 3D CT/MRI Gantry Scanner
    const createMriCtScanner = (scanData, x, z, rotationY = 0) => {
      const scanGroup = new THREE.Group();
      scanGroup.position.set(x, 0.1, z);
      scanGroup.rotation.y = rotationY;

      const gantry = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 1.6, 24, 1, false), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25, metalness: 0.2 }));
      gantry.rotation.x = Math.PI / 2;
      gantry.position.set(0, 1.45, 0);
      scanGroup.add(gantry);

      const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.62, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 }));
      bore.rotation.x = Math.PI / 2;
      bore.position.set(0, 1.45, 0);
      scanGroup.add(bore);

      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.04, 8, 32), new THREE.MeshBasicMaterial({ color: 0x00f5ff, transparent: true, opacity: 0.85 }));
      ring.position.set(0, 1.45, 0);
      ring.userData = { isScannerLaser: true };
      scanGroup.add(ring);

      const bedBase = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.75, 4.2), materials.whiteComposite);
      bedBase.position.set(0, 0.45, 1.6);
      scanGroup.add(bedBase);

      const cradle = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.12, 3.8), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.3 }));
      cradle.position.set(0, 0.9, 1.4);
      scanGroup.add(cradle);

      const boothDesk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 1.1), materials.woodCountertop);
      boothDesk.position.set(3.8, 0.45, -1.8);
      scanGroup.add(boothDesk);

      [-0.5, 0.5].forEach((dx) => {
        const mon = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.45, 0.08), materials.monitorScreenOn);
        mon.position.set(3.8 + dx, 1.25, -1.8);
        scanGroup.add(mon);
      });

      const win = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.6, 0.08), materials.glassPartition);
      win.position.set(3.8, 1.4, -0.9);
      scanGroup.add(win);

      gantry.userData = {
        entityData: {
          ...scanData,
          type: "radiology_ct",
          title: scanData.title || "Siemens SOMATOM 128-Slice Dual-Source CT Scanner",
          department: "Diagnostic Radiology & Imaging",
          status: "operational",
          scans_today: 26,
          tube_life: "88% Remaining",
          radiation_shield: "2.5mm Lead Glass Pb Equivalent",
        },
        originalEmissive: 0x000000,
      };
      interactiveMeshesRef.current.push(gantry);

      return scanGroup;
    };

    // Helper: 3D Helicopter
    const createHelicopter = (hemsData, x, z, rotationY = 0) => {
      const chopperGroup = new THREE.Group();
      chopperGroup.position.set(x, 0.2, z);
      chopperGroup.rotation.y = rotationY;

      const fuselage = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 5.8), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25, metalness: 0.3 }));
      fuselage.position.set(0, 1.5, 0);
      chopperGroup.add(fuselage);

      const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.1, 1.6, 16), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25, metalness: 0.3 }));
      nose.rotation.x = Math.PI / 2;
      nose.position.set(0, 1.35, 3.4);
      chopperGroup.add(nose);

      const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.85, 1.6), materials.darkMonitor);
      canopy.position.set(0, 1.8, 2.0);
      canopy.rotation.x = -0.25;
      chopperGroup.add(canopy);

      const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 4.6, 12), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25, metalness: 0.3 }));
      boom.rotation.x = Math.PI / 2;
      boom.position.set(0, 1.6, -4.5);
      chopperGroup.add(boom);

      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 0.9), materials.emergencyRed);
      fin.position.set(0, 2.2, -6.8);
      chopperGroup.add(fin);

      const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.1), materials.chromeMetal);
      tailRotor.position.set(0.12, 2.2, -6.8);
      tailRotor.userData = { isTailRotor: true };
      chopperGroup.add(tailRotor);

      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.7, 12), materials.chromeMetal);
      mast.position.set(0, 2.7, 0.4);
      chopperGroup.add(mast);

      const rotorGroup = new THREE.Group();
      rotorGroup.position.set(0, 3.0, 0.4);
      rotorGroup.userData = { isRotorBlade: true };

      for (let b = 0; b < 4; b++) {
        const bladeArm = new THREE.Group();
        bladeArm.rotation.y = (b * Math.PI) / 2;

        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 5.2), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 }));
        blade.position.set(0, 0, 2.6);
        bladeArm.add(blade);

        const tip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.045, 0.4), materials.emergencyYellow);
        tip.position.set(0, 0, 5.0);
        bladeArm.add(tip);

        rotorGroup.add(bladeArm);
      }
      chopperGroup.add(rotorGroup);

      [-1.1, 1.1].forEach((sx) => {
        const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6.2, 12), materials.chromeMetal);
        skid.rotation.x = Math.PI / 2;
        skid.position.set(sx, 0.25, 0.2);
        chopperGroup.add(skid);

        [-1.4, 1.4].forEach((sz) => {
          const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8), materials.chromeMetal);
          strut.position.set(sx * 0.75, 0.7, sz);
          strut.rotation.z = sx > 0 ? 0.35 : -0.35;
          chopperGroup.add(strut);
        });
      });

      [-1.12, 1.12].forEach((sx) => {
        const crossH = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), materials.emergencyRed);
        crossH.position.set(sx, 1.6, 0);
        crossH.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
        chopperGroup.add(crossH);

        const crossV = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.9), materials.emergencyRed);
        crossV.position.set(sx, 1.6, 0);
        crossV.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
        chopperGroup.add(crossV);
      });

      fuselage.userData = {
        entityData: {
          ...hemsData,
          type: "air_ambulance",
          title: hemsData.title || "Air Ambulance Eurocopter EC135 (HEMS-01)",
          department: "Critical Care Air Transport",
          status: "standby",
          fuel: "94% Jet-A1",
          pilot_on_duty: "Capt. R. Deshmukh",
          flight_paramedics: "2 Flight Nurses On-Deck",
          eta_airborne: "3.5 Minutes",
        },
        originalEmissive: 0x000000,
      };
      interactiveMeshesRef.current.push(fuselage);

      return chopperGroup;
    };

    // Helper: Neonatal NICU Incubator
    const createNicuIncubator = (nicuData, x, z, rotationY = 0) => {
      const incGroup = new THREE.Group();
      incGroup.position.set(x, 0.1, z);
      incGroup.rotation.y = rotationY;

      const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.75, 1.8), materials.whiteComposite);
      base.position.y = 0.45;
      incGroup.add(base);

      const dome = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.55, 1.5, 16, 1, false, 0, Math.PI),
        new THREE.MeshPhysicalMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.5, roughness: 0.05, transmission: 0.85, ior: 1.45 })
      );
      dome.rotation.x = Math.PI / 2;
      dome.position.set(0, 1.15, 0);
      incGroup.add(dome);

      const mat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 1.4), new THREE.MeshStandardMaterial({ color: 0x6ee7b7, roughness: 0.6 }));
      mat.position.set(0, 0.9, 0);
      incGroup.add(mat);

      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.08, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.8 })
      );
      lamp.position.set(0, 1.7, 0);
      incGroup.add(lamp);

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 8), materials.chromeMetal);
      pole.position.set(0.75, 1.0, -0.6);
      incGroup.add(pole);

      const neoMon = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.28, 0.08), materials.monitorScreenOn);
      neoMon.position.set(0.75, 1.5, -0.6);
      incGroup.add(neoMon);

      base.userData = {
        entityData: {
          ...nicuData,
          type: "incubator",
          title: nicuData.title || "Giraffe Omnibed Neonatal Incubator Pod",
          department: "Neonatal Intensive Care Unit (NICU)",
          status: "occupied",
          patientName: nicuData.patientName || "Baby of Sharma (31w Preterm)",
          temperature: "36.8°C (Servo Air/Skin)",
          humidity: "65% Controlled",
          phototherapy: "Active (Bili-Light Blue)",
        },
        originalEmissive: 0x000000,
      };
      interactiveMeshesRef.current.push(base);

      return incGroup;
    };

    // Helper: Mobile C-Arm
    const createCArm = (cArmData, x, z, rotationY = 0) => {
      const cGroup = new THREE.Group();
      cGroup.position.set(x, 0.1, z);
      cGroup.rotation.y = rotationY;

      const cBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 1.4), materials.whiteComposite);
      cBase.position.y = 0.45;
      cGroup.add(cBase);

      const arc = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.08, 12, 24, Math.PI), materials.chromeMetal);
      arc.position.set(0, 1.6, 0.8);
      arc.rotation.z = Math.PI / 2;
      cGroup.add(arc);

      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.35, 12), materials.darkMonitor);
      tube.position.set(0, 0.4, 0.8);
      cGroup.add(tube);

      const det = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.12), materials.whiteComposite);
      det.position.set(0, 2.8, 0.8);
      cGroup.add(det);

      cBase.userData = {
        entityData: {
          ...cArmData,
          type: "fluoroscopy",
          title: cArmData.title || "GE OEC One Mobile Surgical C-Arm",
          department: "Surgical Directorate (OT 1)",
          status: "standby",
          radiation_field: "Low-Dose Pulsed Fluoroscopy",
        },
        originalEmissive: 0x000000,
      };
      interactiveMeshesRef.current.push(cBase);

      return cGroup;
    };

    // Helper: Hemodialysis Unit
    const createDialysisStation = (diaData, x, z) => {
      const dGroup = new THREE.Group();
      dGroup.position.set(x, 0.1, z);

      const mach = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.7), materials.whiteComposite);
      mach.position.set(-0.9, 0.8, 0);
      dGroup.add(mach);

      const cart = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 12), materials.chromeMetal);
      cart.position.set(-0.45, 1.1, 0.2);
      dGroup.add(cart);

      const mon = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.06), materials.monitorScreenOn);
      mon.position.set(-0.9, 1.7, 0);
      dGroup.add(mon);

      const chairBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.45, 1.6), materials.sofaFabricTeal);
      chairBase.position.set(0.6, 0.25, 0);
      dGroup.add(chairBase);

      const chairBack = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 0.3), materials.sofaFabricTeal);
      chairBack.position.set(0.6, 0.8, -0.7);
      chairBack.rotation.x = 0.25;
      dGroup.add(chairBack);

      mach.userData = {
        entityData: {
          ...diaData,
          type: "dialysis",
          title: diaData.title || "Fresenius 5008S Hemodialysis Renal Care Machine",
          department: "Nephrology & Renal Dialysis Unit",
          status: "in_treatment",
          patientName: diaData.patientName || "Sunita Devi (Prescription: 4h HD)",
          blood_flow: "320 mL/min",
          dialysate_temp: "36.5°C",
        },
        originalEmissive: 0x000000,
      };
      interactiveMeshesRef.current.push(mach);

      return dGroup;
    };

    // Helper: Blood Bank Cold Chain Storage
    const createBloodBankFridge = (bbData, x, z) => {
      const bbGroup = new THREE.Group();
      bbGroup.position.set(x, 0.1, z);

      const fridge = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.0, 0.9), materials.chromeMetal);
      fridge.position.y = 1.0;
      bbGroup.add(fridge);

      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.7, 0.05), materials.glassPartition);
      glass.position.set(0, 1.0, 0.46);
      bbGroup.add(glass);

      const led = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.04), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
      led.position.set(0, 1.9, 0.47);
      bbGroup.add(led);

      fridge.userData = {
        entityData: {
          ...bbData,
          type: "blood_bank",
          title: bbData.title || "Helmer Blood Bank Cold Chain Storage Unit",
          department: "Transfusion Medicine & Blood Bank",
          status: "calibrated",
          temperature: "+4.0°C (Whole Blood) / -20°C (FFP)",
          inventory: "A+ (14u), B+ (22u), O+ (35u), O- (8u emergency reserve)",
        },
        originalEmissive: 0x000000,
      };
      interactiveMeshesRef.current.push(fridge);

      return bbGroup;
    };

    // =============================================================
    // FLOOR 0: GROUND LEVEL
    // =============================================================
    const floor0Group = new THREE.Group();
    floor0Group.position.y = 0;
    floor0Group.userData.isArchObject = true;
    floorGroupsRef.current[0] = floor0Group;

    const slab0 = new THREE.Mesh(new THREE.BoxGeometry(64, 0.8, 50), materials.slabBase);
    slab0.position.y = -0.4;
    slab0.receiveShadow = true;
    floor0Group.add(slab0);

    const slab0Trim = new THREE.Mesh(new THREE.BoxGeometry(64.4, 0.15, 50.4), materials.slabTrim);
    slab0Trim.position.y = 0.05;
    floor0Group.add(slab0Trim);

    const corridor0 = new THREE.Mesh(new THREE.PlaneGeometry(10, 46), materials.floorCorridor);
    corridor0.rotation.x = -Math.PI / 2;
    corridor0.position.set(0, 0.02, 0);
    floor0Group.add(corridor0);

    const stripe0 = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 46), new THREE.MeshBasicMaterial({ color: 0x0284c7 }));
    stripe0.rotation.x = -Math.PI / 2;
    stripe0.position.set(0, 0.03, 0);
    floor0Group.add(stripe0);

    // Reception & Lounge
    const lobbyFloor = new THREE.Mesh(new THREE.PlaneGeometry(21.6, 15.6), materials.floorLobbyTile);
    lobbyFloor.rotation.x = -Math.PI / 2;
    lobbyFloor.position.set(-18, 0.02, 10);
    lobbyFloor.userData = {
      zoneData: {
        id: "g_opd_lounge",
        name: "Main Reception, Triage & Patient Lounge",
        type: "reception",
        department: "Outpatient Administration",
        capacity: 45,
        active_headcount: 14,
        heat_score: 32,
        temperature: "22.5°C",
        status: "normal",
      },
    };
    floor0Group.add(lobbyFloor);
    interactiveMeshesRef.current.push(lobbyFloor);
    floor0Group.add(buildRoomEnclosure(-18, 10, 22, 16, 2.2, true));

    const desk = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 1.1, 16, 1, false, 0, Math.PI), materials.woodCountertop);
    desk.position.set(-18, 0.55, 14);
    desk.rotation.y = Math.PI;
    floor0Group.add(desk);

    [-1.2, 1.2].forEach((dx) => {
      const pc = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.1), materials.darkMonitor);
      pc.position.set(-18 + dx, 1.3, 14);
      floor0Group.add(pc);
    });

    const sofa1 = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.5, 1.6), materials.sofaFabricNavy);
    sofa1.position.set(-20, 0.35, 6);
    floor0Group.add(sofa1);

    const sofa2 = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.5, 1.6), materials.sofaFabricTeal);
    sofa2.position.set(-20, 0.35, 10);
    floor0Group.add(sofa2);

    [-14, -12, -10].forEach((kx) => {
      const kiosk = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.4), materials.whiteComposite);
      kiosk.position.set(kx, 0.7, 16.5);
      floor0Group.add(kiosk);

      const kScr = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.45), materials.monitorScreenOn);
      kScr.position.set(kx, 1.1, 16.71);
      floor0Group.add(kScr);
    });

    // Cafeteria
    const cafeTable = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.8, 16), materials.woodCountertop);
    cafeTable.position.set(-9, 0.4, 8);
    floor0Group.add(cafeTable);

    // Stretcher Bay in Lobby
    const stretcher = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 2.4), materials.chromeMetal);
    stretcher.position.set(-8, 0.35, 15);
    floor0Group.add(stretcher);

    // Emergency Department & Trauma Bays
    const emFloor = new THREE.Mesh(new THREE.PlaneGeometry(19.6, 15.6), materials.floorEmergency);
    emFloor.rotation.x = -Math.PI / 2;
    emFloor.position.set(18, 0.02, 10);
    emFloor.userData = {
      zoneData: {
        id: "g_emergency",
        name: "Emergency Department & Acute Trauma Bays",
        type: "emergency",
        department: "Acute Emergency Medicine",
        capacity: 10,
        active_headcount: 6,
        heat_score: 65,
        temperature: "21.8°C",
        pressure: "+0.5 Pa",
        status: "critical",
      },
    };
    floor0Group.add(emFloor);
    interactiveMeshesRef.current.push(emFloor);
    floor0Group.add(buildRoomEnclosure(18, 10, 20, 16, 2.2, false));

    const emBed1 = createRealisticHospitalBed({ bedNumber: "EM-RESUS-01", status: "occupied", wardName: "Emergency Trauma" }, 14, 7, 0);
    const emBed2 = createRealisticHospitalBed({ bedNumber: "EM-RESUS-02", status: "available", wardName: "Emergency Trauma" }, 22, 7, 0);
    floor0Group.add(emBed1);
    floor0Group.add(emBed2);

    const crashCart = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.6), materials.emergencyRed);
    crashCart.position.set(18, 0.55, 4);
    floor0Group.add(crashCart);

    // Diagnostic CT/MRI Scanner Suite
    const radFloor = new THREE.Mesh(new THREE.PlaneGeometry(17.6, 15.6), materials.floorRadiologyLead);
    radFloor.rotation.x = -Math.PI / 2;
    radFloor.position.set(-20, 0.02, -12);
    radFloor.userData = {
      zoneData: {
        id: "g_radiology",
        name: "Diagnostic Radiology, CT & MRI Center",
        type: "radiology",
        department: "Diagnostic Imaging Directorate",
        capacity: 8,
        active_headcount: 4,
        heat_score: 55,
        status: "operational",
      },
    };
    floor0Group.add(radFloor);
    interactiveMeshesRef.current.push(radFloor);
    floor0Group.add(buildRoomEnclosure(-20, -12, 18, 16, 2.2, false));

    const ctScanner = createMriCtScanner({ title: "Siemens SOMATOM 128-Slice CT Scanner" }, -20, -12, 0);
    floor0Group.add(ctScanner);

    // STAT Pathology Lab & Blood Bank
    const labFloor = new THREE.Mesh(new THREE.PlaneGeometry(13.6, 15.6), new THREE.MeshStandardMaterial({ color: 0x0891b2, roughness: 0.35, metalness: 0.2 }));
    labFloor.rotation.x = -Math.PI / 2;
    labFloor.position.set(-6, 0.02, -12);
    labFloor.userData = {
      zoneData: {
        id: "g_lab",
        name: "Central STAT Pathology, Hematology & Blood Bank",
        type: "laboratory",
        department: "Laboratory & Transfusion Medicine",
        capacity: 12,
        active_headcount: 6,
        heat_score: 45,
        status: "normal",
      },
    };
    floor0Group.add(labFloor);
    interactiveMeshesRef.current.push(labFloor);
    floor0Group.add(buildRoomEnclosure(-6, -12, 14, 16, 2.2, true));

    const labBench = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.9, 1.4), materials.whiteComposite);
    labBench.position.set(-6, 0.45, -12);
    floor0Group.add(labBench);

    const centrifuge = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12), materials.darkMonitor);
    centrifuge.position.set(-6, 1.05, -12);
    floor0Group.add(centrifuge);

    const bloodBankUnit = createBloodBankFridge({ title: "Blood Bank Plasma & RBC Refrigerator" }, -6, -6);
    floor0Group.add(bloodBankUnit);

    // Pharmacy
    const pharmFloor = new THREE.Mesh(new THREE.PlaneGeometry(19.6, 15.6), new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.35, metalness: 0.2 }));
    pharmFloor.rotation.x = -Math.PI / 2;
    pharmFloor.position.set(18, 0.02, -12);
    pharmFloor.userData = {
      zoneData: {
        id: "g_pharmacy",
        name: "Outpatient Pharmacy & Robotic Dispenser",
        type: "pharmacy",
        department: "Pharmacy Directorate",
        capacity: 22,
        active_headcount: 7,
        heat_score: 35,
        status: "normal",
      },
    };
    floor0Group.add(pharmFloor);
    interactiveMeshesRef.current.push(pharmFloor);
    floor0Group.add(buildRoomEnclosure(18, -12, 20, 16, 2.2, true));

    [-15, -12, -9].forEach((pz) => {
      const rack = new THREE.Mesh(new THREE.BoxGeometry(8.0, 1.8, 0.4), materials.whiteComposite);
      rack.position.set(20, 0.9, pz);
      floor0Group.add(rack);
    });

    const robotChute = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 1.2), new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3, metalness: 0.6 }));
    robotChute.position.set(24, 1.1, -12);
    floor0Group.add(robotChute);

    const pCounter = new THREE.Mesh(new THREE.BoxGeometry(6.5, 1.1, 0.8), materials.woodCountertop);
    pCounter.position.set(12, 0.55, -6);
    floor0Group.add(pCounter);

    // Elevator Core
    const elevCore0 = new THREE.Mesh(new THREE.BoxGeometry(8, 2.6, 10), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.7 }));
    elevCore0.position.set(0, 1.3, -2);
    floor0Group.add(elevCore0);

    [-1.8, 1.8].forEach((ex) => {
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.1, 0.05), materials.chromeMetal);
      door.position.set(ex, 1.05, 3.05);
      floor0Group.add(door);
    });

    // Ambulances
    const ambulance1 = createAmbulance({ id: "amb_01", title: "EMS Advanced Life Support Ambulance 01", status: "standby" }, 18, 36, 0);
    const ambulance2 = createAmbulance({ id: "amb_02", title: "EMS Rapid Response Trauma Ambulance 02", status: "ready" }, 8, 36, 0);
    floor0Group.add(ambulance1);
    floor0Group.add(ambulance2);

    // Canopy
    const canopyMesh = new THREE.Mesh(new THREE.BoxGeometry(18, 0.35, 10), new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2, metalness: 0.6, transparent: true, opacity: 0.7 }));
    canopyMesh.position.set(0, 3.2, 27);
    floor0Group.add(canopyMesh);

    [-8, 8].forEach((cx) => {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.2, 12), materials.chromeMetal);
      pillar.position.set(cx, 1.6, 31);
      floor0Group.add(pillar);
    });

    // 3D Spatial Badges for Floor 0
    const bEm = createSpatialBadge("🚨 Emergency & Trauma", "#ef4444");
    bEm.position.set(18, 3.2, 10);
    floor0Group.add(bEm);

    const bCt = createSpatialBadge("☢️ 128-Slice CT/MRI", "#00f5ff");
    bCt.position.set(-20, 3.2, -12);
    floor0Group.add(bCt);

    const bPh = createSpatialBadge("💊 Pharmacy & Robot", "#10b981");
    bPh.position.set(18, 3.2, -12);
    floor0Group.add(bPh);

    const bLobby = createSpatialBadge("🏥 Main Reception & Triage", "#38bdf8");
    bLobby.position.set(-18, 3.2, 10);
    floor0Group.add(bLobby);

    scene.add(floor0Group);

    // =============================================================
    // FLOOR 1: INPATIENT, DIALYSIS, PHYSIO & OPD
    // =============================================================
    const floor1Group = new THREE.Group();
    floor1Group.position.y = 9.5;
    floor1Group.userData.isArchObject = true;
    floorGroupsRef.current[1] = floor1Group;

    const slab1 = new THREE.Mesh(new THREE.BoxGeometry(64, 0.8, 50), materials.slabBase);
    slab1.position.y = -0.4;
    slab1.receiveShadow = true;
    floor1Group.add(slab1);

    const slab1Trim = new THREE.Mesh(new THREE.BoxGeometry(64.4, 0.15, 50.4), materials.slabTrim);
    slab1Trim.position.y = 0.05;
    floor1Group.add(slab1Trim);

    const corridor1 = new THREE.Mesh(new THREE.PlaneGeometry(10, 46), materials.floorCorridor);
    corridor1.rotation.x = -Math.PI / 2;
    corridor1.position.set(0, 0.02, 0);
    floor1Group.add(corridor1);

    // General Ward
    const wardFloor = new THREE.Mesh(new THREE.PlaneGeometry(21.6, 15.6), materials.floorWardWood);
    wardFloor.rotation.x = -Math.PI / 2;
    wardFloor.position.set(-18, 0.02, 10);
    wardFloor.userData = {
      zoneData: {
        id: "f1_general_ward",
        name: "General Medical Inpatient Ward (Beds 201-204)",
        type: "inpatient_ward",
        department: "Internal Medicine",
        capacity: 4,
        active_headcount: 3,
        heat_score: 75,
        temperature: "23.0°C",
        status: "normal",
      },
    };
    floor1Group.add(wardFloor);
    interactiveMeshesRef.current.push(wardFloor);
    floor1Group.add(buildRoomEnclosure(-18, 10, 22, 16, 2.2, false));

    const ward1Beds = [
      { bedNumber: "BED-201", status: "occupied", patientName: "Arun Verma" },
      { bedNumber: "BED-202", status: "occupied", patientName: "Priya Shah" },
      { bedNumber: "BED-203", status: "available" },
      { bedNumber: "BED-204", status: "occupied", patientName: "Ramesh Patel" },
    ];

    [-24, -20, -16, -12].forEach((bx, idx) => {
      const bedObj = ward1Beds[idx];
      const bed3D = createRealisticHospitalBed({ ...bedObj, wardName: "General Inpatient Ward A" }, bx, 10, 0);
      floor1Group.add(bed3D);

      if (idx < 3) {
        const curtain = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.8, 3.8), new THREE.MeshStandardMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.45 }));
        curtain.position.set(bx + 2.0, 1.1, 10);
        floor1Group.add(curtain);
      }
    });

    // Nurse Station & Hemodialysis
    const nurseFloor = new THREE.Mesh(new THREE.PlaneGeometry(21.6, 15.6), new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.35, metalness: 0.2 }));
    nurseFloor.rotation.x = -Math.PI / 2;
    nurseFloor.position.set(-18, 0.02, -12);
    nurseFloor.userData = {
      zoneData: {
        id: "f1_nursing",
        name: "Floor 1 Central Nursing Hub & Hemodialysis Suite",
        type: "nursing_station",
        department: "Nursing & Nephrology Services",
        capacity: 12,
        active_headcount: 6,
        heat_score: 50,
        status: "normal",
      },
    };
    floor1Group.add(nurseFloor);
    interactiveMeshesRef.current.push(nurseFloor);
    floor1Group.add(buildRoomEnclosure(-18, -12, 22, 16, 2.2, true));

    const nCounter = new THREE.Mesh(new THREE.BoxGeometry(6.5, 1.1, 2.8), materials.woodCountertop);
    nCounter.position.set(-15, 0.55, -12);
    floor1Group.add(nCounter);

    [-2, 0, 2].forEach((nx) => {
      const scr = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.08), materials.monitorScreenOn);
      scr.position.set(-15 + nx, 1.35, -12);
      floor1Group.add(scr);
    });

    const dialysisStation = createDialysisStation({ title: "Fresenius Hemodialysis Station 1", patientName: "Sunita Devi" }, -24, -12);
    floor1Group.add(dialysisStation);

    // Physiotherapy Walking Bars
    const physioPlatform = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.1, 1.4), materials.woodCountertop);
    physioPlatform.position.set(-10, 0.05, -12);
    floor1Group.add(physioPlatform);

    [-0.55, 0.55].forEach((py) => {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.0, 8), materials.chromeMetal);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(-10, 0.95, -12 + py);
      floor1Group.add(bar);
    });

    // OPD Clinics
    const opdFloor = new THREE.Mesh(new THREE.PlaneGeometry(19.6, 15.6), new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3, metalness: 0.2 }));
    opdFloor.rotation.x = -Math.PI / 2;
    opdFloor.position.set(18, 0.02, 10);
    opdFloor.userData = {
      zoneData: {
        id: "f1_consult_suites",
        name: "Physician Consultation Chambers & Specialized Exam Suites",
        type: "consultation",
        department: "Cardiology, Pediatric & Orthopedic OPD",
        capacity: 10,
        active_headcount: 5,
        heat_score: 60,
        status: "normal",
      },
    };
    floor1Group.add(opdFloor);
    interactiveMeshesRef.current.push(opdFloor);
    floor1Group.add(buildRoomEnclosure(18, 10, 20, 16, 2.2, true));

    const docDesk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.85, 1.2), materials.woodCountertop);
    docDesk.position.set(14, 0.45, 12);
    floor1Group.add(docDesk);

    const docLaptop = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.35), materials.darkMonitor);
    docLaptop.position.set(14, 0.95, 12);
    floor1Group.add(docLaptop);

    const pediaCrib = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 1.6), new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.4 }));
    pediaCrib.position.set(23, 0.35, 12);
    floor1Group.add(pediaCrib);

    const xrayBox = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 0.1), new THREE.MeshStandardMaterial({ color: 0x93c5fd, emissive: 0x38bdf8, emissiveIntensity: 0.9 }));
    xrayBox.position.set(18, 1.4, 2.0);
    floor1Group.add(xrayBox);

    // Private Suites
    const pvtFloor = new THREE.Mesh(new THREE.PlaneGeometry(19.6, 15.6), materials.floorWardWood);
    pvtFloor.rotation.x = -Math.PI / 2;
    pvtFloor.position.set(18, 0.02, -12);
    pvtFloor.userData = {
      zoneData: {
        id: "f1_pvt_rooms",
        name: "Semi-Private Deluxe Inpatient Suites",
        type: "private_ward",
        department: "Executive Inpatient Care",
        capacity: 2,
        active_headcount: 2,
        heat_score: 95,
        status: "normal",
      },
    };
    floor1Group.add(pvtFloor);
    interactiveMeshesRef.current.push(pvtFloor);
    floor1Group.add(buildRoomEnclosure(18, -12, 20, 16, 2.2, false));

    const pvtBed1 = createRealisticHospitalBed({ bedNumber: "PVT-301", status: "occupied", wardName: "Executive Deluxe Suite" }, 14, -12, 0);
    const pvtBed2 = createRealisticHospitalBed({ bedNumber: "PVT-302", status: "occupied", wardName: "Executive Deluxe Suite" }, 22, -12, 0);
    floor1Group.add(pvtBed1);
    floor1Group.add(pvtBed2);

    const elevCore1 = new THREE.Mesh(new THREE.BoxGeometry(8, 2.6, 10), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.7 }));
    elevCore1.position.set(0, 1.3, -2);
    floor1Group.add(elevCore1);

    // 3D Spatial Badges for Floor 1
    const bWard = createSpatialBadge("🛏️ General Ward A", "#38bdf8");
    bWard.position.set(-18, 3.2, 10);
    floor1Group.add(bWard);

    const bDial = createSpatialBadge("🩸 Hemodialysis Unit", "#f59e0b");
    bDial.position.set(-24, 3.2, -12);
    floor1Group.add(bDial);

    const bOpd = createSpatialBadge("🩺 Cardiology & OPD", "#0284c7");
    bOpd.position.set(18, 3.2, 10);
    floor1Group.add(bOpd);

    const bPvt = createSpatialBadge("🌟 Deluxe Suites", "#8b5cf6");
    bPvt.position.set(18, 3.2, -12);
    floor1Group.add(bPvt);

    scene.add(floor1Group);

    // =============================================================
    // FLOOR 2: SURGICAL SUITES, CATH LAB, CSSD, PACU, ICU & NICU
    // =============================================================
    const floor2Group = new THREE.Group();
    floor2Group.position.y = 19.0;
    floor2Group.userData.isArchObject = true;
    floorGroupsRef.current[2] = floor2Group;

    const slab2 = new THREE.Mesh(new THREE.BoxGeometry(64, 0.8, 50), materials.slabBase);
    slab2.position.y = -0.4;
    slab2.receiveShadow = true;
    floor2Group.add(slab2);

    const slab2Trim = new THREE.Mesh(new THREE.BoxGeometry(64.4, 0.15, 50.4), materials.slabTrim);
    slab2Trim.position.y = 0.05;
    floor2Group.add(slab2Trim);

    const corridor2 = new THREE.Mesh(new THREE.PlaneGeometry(10, 46), materials.floorCorridor);
    corridor2.rotation.x = -Math.PI / 2;
    corridor2.position.set(0, 0.02, 0);
    floor2Group.add(corridor2);

    // OT 1 Cardiac
    const ot1Floor = new THREE.Mesh(new THREE.PlaneGeometry(21.6, 15.6), materials.floorOtSterile);
    ot1Floor.rotation.x = -Math.PI / 2;
    ot1Floor.position.set(-18, 0.02, 10);
    ot1Floor.userData = {
      zoneData: {
        id: "f2_ot1",
        name: "Cardio-Thoracic & Cardiac Catheterization Suite",
        type: "operation_theater",
        department: "Surgical Directorate",
        capacity: 8,
        active_headcount: 5,
        heat_score: 85,
        temperature: "19.5°C",
        pressure: "+2.5 Pa (Positive Clean)",
        status: "in_surgery",
      },
    };
    floor2Group.add(ot1Floor);
    interactiveMeshesRef.current.push(ot1Floor);
    floor2Group.add(buildRoomEnclosure(-18, 10, 22, 16, 2.2, false));

    const surgTableBase = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.7, 16), materials.chromeMetal);
    surgTableBase.position.set(-18, 0.35, 10);
    floor2Group.add(surgTableBase);

    const surgTableTop = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.22, 3.4), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.3, metalness: 0.5 }));
    surgTableTop.position.set(-18, 0.8, 10);
    floor2Group.add(surgTableTop);

    [-1.2, 1.2].forEach((lx) => {
      const lampBoom = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8), materials.chromeMetal);
      lampBoom.position.set(-18 + lx, 2.0, 10);
      floor2Group.add(lampBoom);

      const lampDome = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.25, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.75 }));
      lampDome.position.set(-18 + lx, 1.4, 10);
      floor2Group.add(lampDome);
    });

    const cArmMesh = createCArm({ title: "GE OEC One Surgical C-Arm Fluoroscope" }, -13, 10, -Math.PI / 4);
    floor2Group.add(cArmMesh);

    // OT 2 Laparoscopy
    const ot2Floor = new THREE.Mesh(new THREE.PlaneGeometry(21.6, 15.6), materials.floorOtSterile);
    ot2Floor.rotation.x = -Math.PI / 2;
    ot2Floor.position.set(-18, 0.02, -12);
    ot2Floor.userData = {
      zoneData: {
        id: "f2_ot2",
        name: "Orthopedic & Laparoscopic Minimally Invasive Suite 2",
        type: "operation_theater",
        department: "Surgical Directorate",
        capacity: 6,
        active_headcount: 2,
        heat_score: 35,
        status: "turnaround",
      },
    };
    floor2Group.add(ot2Floor);
    interactiveMeshesRef.current.push(ot2Floor);
    floor2Group.add(buildRoomEnclosure(-18, -12, 22, 16, 2.2, false));

    const surgTable2 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.22, 3.4), materials.chromeMetal);
    surgTable2.position.set(-18, 0.75, -12);
    floor2Group.add(surgTable2);

    // CSSD & Scrub Sinks
    const scrubTrough = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.7, 0.75), materials.chromeMetal);
    scrubTrough.position.set(-6, 0.5, 0);
    floor2Group.add(scrubTrough);

    const autoVessel = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.8, 16), materials.chromeMetal);
    autoVessel.rotation.x = Math.PI / 2;
    autoVessel.position.set(-6, 0.9, -3.5);
    floor2Group.add(autoVessel);

    // PACU Recovery
    const pacuFloor = new THREE.Mesh(new THREE.PlaneGeometry(19.6, 15.6), new THREE.MeshStandardMaterial({ color: 0x4f46e5, roughness: 0.35, metalness: 0.2 }));
    pacuFloor.rotation.x = -Math.PI / 2;
    pacuFloor.position.set(18, 0.02, 10);
    pacuFloor.userData = {
      zoneData: {
        id: "f2_pacu",
        name: "Post-Anesthesia Care Unit (PACU Recovery Bays 1-4)",
        type: "recovery",
        department: "Surgical Directorate",
        capacity: 4,
        active_headcount: 2,
        heat_score: 50,
        status: "normal",
      },
    };
    floor2Group.add(pacuFloor);
    interactiveMeshesRef.current.push(pacuFloor);
    floor2Group.add(buildRoomEnclosure(18, 10, 20, 16, 2.2, true));

    const pacuBed1 = createRealisticHospitalBed({ bedNumber: "PACU-BAY-01", status: "occupied", wardName: "PACU Recovery" }, 14, 10, 0);
    const pacuBed2 = createRealisticHospitalBed({ bedNumber: "PACU-BAY-02", status: "available", wardName: "PACU Recovery" }, 22, 10, 0);
    floor2Group.add(pacuBed1);
    floor2Group.add(pacuBed2);

    // ICU/CCU & NICU
    const icuFloor = new THREE.Mesh(new THREE.PlaneGeometry(19.6, 15.6), new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness: 0.3, metalness: 0.3 }));
    icuFloor.rotation.x = -Math.PI / 2;
    icuFloor.position.set(18, 0.02, -12);
    icuFloor.userData = {
      zoneData: {
        id: "f2_ccu",
        name: "Coronary ICU, AIIR Isolation & Neonatal NICU",
        type: "icu",
        department: "Critical Care Directorate",
        capacity: 6,
        active_headcount: 4,
        heat_score: 90,
        temperature: "21.0°C",
        pressure: "-2.8 Pa (Negative AIIR Isolation)",
        status: "critical",
      },
    };
    floor2Group.add(icuFloor);
    interactiveMeshesRef.current.push(icuFloor);
    floor2Group.add(buildRoomEnclosure(18, -12, 20, 16, 2.2, true));

    const icuBed1 = createRealisticHospitalBed({ bedNumber: "ICU-BED-01", status: "occupied", wardName: "Intensive Care Unit" }, 14, -12, 0);
    floor2Group.add(icuBed1);

    const nicuPod1 = createNicuIncubator({ id: "nicu_01", title: "Giraffe Omnibed NICU Incubator 1", patientName: "Baby of Kavita (32w)" }, 22, -14, 0);
    const nicuPod2 = createNicuIncubator({ id: "nicu_02", title: "Giraffe Omnibed NICU Incubator 2", patientName: "Baby of Meera (34w)" }, 22, -9, 0);
    floor2Group.add(nicuPod1);
    floor2Group.add(nicuPod2);

    const aiirRing = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.06, 8, 24), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75 }));
    aiirRing.position.set(14, 2.2, -12);
    aiirRing.rotation.x = Math.PI / 2;
    aiirRing.userData.isAirflowRing = true;
    floor2Group.add(aiirRing);

    const elevCore2 = new THREE.Mesh(new THREE.BoxGeometry(8, 2.6, 10), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.7 }));
    elevCore2.position.set(0, 1.3, -2);
    floor2Group.add(elevCore2);

    // 3D Spatial Badges for Floor 2
    const bOt1 = createSpatialBadge("🫀 OT 1 Cardiac & C-Arm", "#ef4444");
    bOt1.position.set(-18, 3.2, 10);
    floor2Group.add(bOt1);

    const bOt2 = createSpatialBadge("🔬 OT 2 Laparoscopy", "#10b981");
    bOt2.position.set(-18, 3.2, -12);
    floor2Group.add(bOt2);

    const bIcu = createSpatialBadge("🫁 Intensive Care (ICU)", "#8b5cf6");
    bIcu.position.set(14, 3.2, -12);
    floor2Group.add(bIcu);

    const bNicu = createSpatialBadge("👶 NICU Incubators", "#38bdf8");
    bNicu.position.set(22, 3.2, -12);
    floor2Group.add(bNicu);

    scene.add(floor2Group);

    // =============================================================
    // FLOOR 3: ROOFTOP HELIPAD, SOLAR & PLANT
    // =============================================================
    if (showRoof) {
      const roofGroup = new THREE.Group();
      roofGroup.position.y = 28.5;
      roofGroup.userData.isArchObject = true;
      floorGroupsRef.current[3] = roofGroup;

      const roofSlab = new THREE.Mesh(new THREE.BoxGeometry(64, 0.8, 50), materials.slabBase);
      roofSlab.position.y = -0.4;
      roofSlab.receiveShadow = true;
      roofGroup.add(roofSlab);

      const helipad = new THREE.Mesh(new THREE.CylinderGeometry(10.5, 10.5, 0.25, 32), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7, metalness: 0.3 }));
      helipad.position.set(0, 0.15, 0);
      helipad.receiveShadow = true;
      roofGroup.add(helipad);

      const hCross1 = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 7.5), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
      hCross1.rotation.x = -Math.PI / 2;
      hCross1.position.set(-2.0, 0.3, 0);
      roofGroup.add(hCross1);

      const hCross2 = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 7.5), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
      hCross2.rotation.x = -Math.PI / 2;
      hCross2.position.set(2.0, 0.3, 0);
      roofGroup.add(hCross2);

      const hCrossBar = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 1.4), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
      hCrossBar.rotation.x = -Math.PI / 2;
      hCrossBar.position.set(0, 0.3, 0);
      roofGroup.add(hCrossBar);

      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        const lx = Math.cos(a) * 10.1;
        const lz = Math.sin(a) * 10.1;
        const lightBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0x10b981 }));
        lightBeacon.position.set(lx, 0.35, lz);
        roofGroup.add(lightBeacon);
      }

      const airHelicopter = createHelicopter({ id: "hems_01", title: "Air Ambulance Eurocopter EC135 (HEMS-01)" }, 0, 0.3, -Math.PI / 4);
      roofGroup.add(airHelicopter);

      // Solar Panels
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
          const panel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.6), materials.solarCellMat);
          panel.position.set(-24 + c * 2.8, 0.8, 6 + r * 2.2);
          panel.rotation.x = 0.35;
          roofGroup.add(panel);
        }
      }

      // Cryogenic LOX Tank
      const loxMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.2, metalness: 0.4 });
      const loxTank = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 5.0, 24), loxMat);
      loxTank.position.set(-20, 2.5, -14);
      roofGroup.add(loxTank);

      const loxCap = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), loxMat);
      loxCap.position.set(-20, 5.0, -14);
      roofGroup.add(loxCap);

      // Satellite Mast
      const satMast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 3.5, 8), materials.chromeMetal);
      satMast.position.set(6, 1.75, -14);
      roofGroup.add(satMast);

      const satDish = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.1, 0.3, 16), materials.whiteComposite);
      satDish.position.set(6, 3.4, -14);
      satDish.rotation.x = 0.6;
      roofGroup.add(satDish);

      // HVAC Chiller
      const chiller = new THREE.Mesh(new THREE.BoxGeometry(6.5, 2.4, 4.5), new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.4 }));
      chiller.position.set(20, 1.2, -14);
      roofGroup.add(chiller);

      [-1.5, 1.5].forEach((fx) => {
        const fanCowl = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.3, 16), materials.darkMonitor);
        fanCowl.position.set(20 + fx, 2.55, -14);
        roofGroup.add(fanCowl);

        const fanBlade = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.04, 0.25), materials.chromeMetal);
        fanBlade.position.set(20 + fx, 2.65, -14);
        fanBlade.userData = { isHvacFan: true };
        roofGroup.add(fanBlade);
      });

      // Generator
      const gen = new THREE.Mesh(new THREE.BoxGeometry(5.5, 2.2, 3.5), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 }));
      gen.position.set(-20, 1.1, -4);
      roofGroup.add(gen);

      // 3D Spatial Badges for Floor 3
      const bHeli = createSpatialBadge("🚁 HEMS Helipad Flight Deck", "#facc15");
      bHeli.position.set(0, 3.5, 0);
      roofGroup.add(bHeli);

      const bSolar = createSpatialBadge("☀️ Solar PV (84.5 kW)", "#38bdf8");
      bSolar.position.set(-20, 3.2, 8);
      roofGroup.add(bSolar);

      scene.add(roofGroup);
    }

    // Facade
    const facadeGroup = new THREE.Group();
    facadeGroup.userData.isArchObject = true;
    facadeGroup.visible = showFacadeRef.current;
    facadeGroupRef.current = facadeGroup;

    const facadeHeights = 28.0;
    const facadeY = 14.0;

    const glassNorth = new THREE.Mesh(new THREE.BoxGeometry(63.6, facadeHeights, 0.1), materials.exteriorCurtainGlass);
    glassNorth.position.set(0, facadeY, -24.8);
    facadeGroup.add(glassNorth);

    const glassSouth = new THREE.Mesh(new THREE.BoxGeometry(63.6, facadeHeights, 0.1), materials.exteriorCurtainGlass);
    glassSouth.position.set(0, facadeY, 24.8);
    facadeGroup.add(glassSouth);

    const glassEast = new THREE.Mesh(new THREE.BoxGeometry(0.1, facadeHeights, 49.6), materials.exteriorCurtainGlass);
    glassEast.position.set(31.8, facadeY, 0);
    facadeGroup.add(glassEast);

    const glassWest = new THREE.Mesh(new THREE.BoxGeometry(0.1, facadeHeights, 49.6), materials.exteriorCurtainGlass);
    glassWest.position.set(-31.8, facadeY, 0);
    facadeGroup.add(glassWest);

    scene.add(facadeGroup);

    // Med Gas
    const medGasGroup = new THREE.Group();
    medGasGroup.userData.isArchObject = true;
    medGasGroup.visible = showMedGasRef.current;
    medGasGroupRef.current = medGasGroup;

    const o2Pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 44, 8), new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.3 }));
    o2Pipe.rotation.x = Math.PI / 2;
    o2Pipe.position.set(-1.2, 8.5, 0);
    medGasGroup.add(o2Pipe);

    const airPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 44, 8), new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3 }));
    airPipe.rotation.x = Math.PI / 2;
    airPipe.position.set(0, 8.5, 0);
    medGasGroup.add(airPipe);

    const vacPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 44, 8), new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.3 }));
    vacPipe.rotation.x = Math.PI / 2;
    vacPipe.position.set(1.2, 8.5, 0);
    medGasGroup.add(vacPipe);

    scene.add(medGasGroup);

    // Structural Columns
    const spineGroup = new THREE.Group();
    spineGroup.userData.isArchObject = true;
    spineGroupRef.current = spineGroup;

    [
      [-30, -23],
      [-30, 0],
      [-30, 23],
      [30, -23],
      [30, 0],
      [30, 23],
      [0, -23],
      [0, 23],
    ].forEach(([cx, cz]) => {
      const column = new THREE.Mesh(new THREE.BoxGeometry(1.5, 30, 1.5), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7, metalness: 0.2 }));
      column.position.set(cx, 14, cz);
      spineGroup.add(column);
    });

    scene.add(spineGroup);

    // Patient Flow
    const flowGroup = new THREE.Group();
    flowGroup.userData.isArchObject = true;

    const curvePoints = [
      new THREE.Vector3(0, 1.5, 30),
      new THREE.Vector3(-18, 1.5, 14),
      new THREE.Vector3(-18, 1.5, 6),
      new THREE.Vector3(14, 11.0, 12),
      new THREE.Vector3(-20, 1.5, -12),
      new THREE.Vector3(18, 1.5, -12),
      new THREE.Vector3(-18, 11.0, 10),
    ];

    const flowCurve = new THREE.CatmullRomCurve3(curvePoints);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(flowCurve, 64, 0.18, 8, false),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.6, transparent: true, opacity: 0.75 })
    );
    flowGroup.add(tube);

    for (let p = 0; p < 8; p++) {
      const pMesh = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 12), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
      pMesh.userData = { isFlowParticle: true, curve: flowCurve, phase: p / 8, flowSpeed: 0.12 };
      flowGroup.add(pMesh);
    }

    flowGroup.visible = (viewMode === "patient_flow");
    flowPathGroupRef.current = flowGroup;
    scene.add(flowGroup);
  }, [floorplanData, wardsData, lightingMode, showRoof]);

  // Real-time View Mode Switching
  useEffect(() => {
    if (flowPathGroupRef.current) {
      flowPathGroupRef.current.visible = viewMode === "patient_flow";
    }

    interactiveMeshesRef.current.forEach((mesh) => {
      const zone = mesh.userData?.zoneData;
      if (!zone || !mesh.material) return;

      if (viewMode === "heatmap") {
        const heat = zone.heat_score || 35;
        let heatColor = 0x10b981;
        if (heat >= 80) heatColor = 0xe11d48;
        else if (heat >= 60) heatColor = 0xf59e0b;
        else if (heat >= 40) heatColor = 0x0284c7;

        mesh.material.color.setHex(heatColor);
        mesh.material.opacity = 0.88;
      } else {
        const origColor = mesh.userData.originalColor || 0x1e293b;
        mesh.material.color.setHex(origColor);
        mesh.material.opacity = 0.75;
      }
    });
  }, [viewMode]);

  // -------------------------------------------------------------
  // REAL-TIME ACTIONS & CAMERA PRESETS
  // -------------------------------------------------------------
  const handleFloorSelect = (floorId) => {
    setSelectedFloor(floorId);
    selectedFloorRef.current = floorId;

    if (!cameraRef.current || !controlsRef.current) return;
    const ctrl = controlsRef.current;
    const cam = cameraRef.current;

    if (floorId === "all") {
      cam.position.set(58, 68, 85);
      ctrl.target.set(0, 10, 0);
    } else {
      cam.position.set(38, 42, 50);
      ctrl.target.set(0, 2, 0);
    }
    ctrl.update();
  };

  const handleToggleExploded = () => {
    const next = !explodedView;
    setExplodedView(next);
    explodedViewRef.current = next;
  };

  const handleToggleAutoRotate = () => {
    const next = !autoRotate;
    setAutoRotate(next);
    autoRotateRef.current = next;
  };

  const handleToggleCodeBlue = () => {
    const next = !codeBlueActive;
    setCodeBlueActive(next);
    codeBlueActiveRef.current = next;
  };

  const handleToggleFacade = () => {
    setShowFacade((prev) => !prev);
  };

  const handleToggleMedGas = () => {
    setShowMedGas((prev) => !prev);
  };

  const handleToggleLabels = () => {
    setShowLabels((prev) => !prev);
  };

  const handleDepartmentFocus = (deptKey) => {
    setSelectedDeptKey(deptKey);
    const loc = DEPARTMENT_LOCATIONS[deptKey];
    if (!loc || !cameraRef.current || !controlsRef.current) return;

    if (selectedFloor !== "all" && selectedFloor !== loc.floor) {
      setSelectedFloor(loc.floor);
      selectedFloorRef.current = loc.floor;
    }

    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    cam.position.set(...loc.cam);
    ctrl.target.set(...loc.target);
    ctrl.update();
  };

  const handleNextRoomTour = () => {
    const floorNum = Number(selectedFloor);
    const profile = FLOOR_PROFILES[floorNum];
    if (!profile || !profile.rooms.length) return;

    const nextIdx = (tourIndex + 1) % profile.rooms.length;
    setTourIndex(nextIdx);
    const targetRoom = profile.rooms[nextIdx];
    handleDepartmentFocus(targetRoom.key);
  };

  const applyCameraPreset = (preset) => {
    if (!cameraRef.current || !controlsRef.current) return;
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;

    switch (preset) {
      case "isometric":
        cam.position.set(58, 68, 85);
        ctrl.target.set(0, 10, 0);
        break;
      case "top":
        cam.position.set(0, 120, 1);
        ctrl.target.set(0, 10, 0);
        break;
      case "front":
        cam.position.set(0, 22, 115);
        ctrl.target.set(0, 12, 0);
        break;
      case "ward_zoom":
        cam.position.set(-18, 22, 24);
        ctrl.target.set(-18, 11, 10);
        break;
      case "icu_zoom":
        cam.position.set(18, 30, 2);
        ctrl.target.set(18, 20.5, -12);
        break;
      case "helipad_zoom":
        cam.position.set(0, 42, 24);
        ctrl.target.set(0, 29, 0);
        break;
      default:
        cam.position.set(58, 68, 85);
        ctrl.target.set(0, 10, 0);
    }
    ctrl.update();
  };

  const handleExportScreenshot = () => {
    if (!rendererRef.current) return;
    const url = rendererRef.current.domElement.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `HealthMesh_3D_Digital_Twin_${Date.now()}.png`;
    link.href = url;
    link.click();
  };

  const activeFloorProfile = selectedFloor !== "all" ? FLOOR_PROFILES[Number(selectedFloor)] : null;

  return (
    <div className="flex flex-col h-[calc(100vh-68px)] w-full bg-slate-900 text-slate-100 overflow-hidden select-none font-sans">
      {/* 1. TOP EXECUTIVE TOOLBAR */}
      <header className="h-14 px-4 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-sm font-semibold tracking-wide text-white">Smart Hospital 3D Digital Twin</h1>
              <span className="flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>REAL-TIME 60FPS</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Floor-by-Floor BIM Precision • Spatial Tags • Dialysis • Cath Lab • LOX Plant • HEMS
            </p>
          </div>
        </div>

        {/* View Mode, Code Blue & Presets */}
        <div className="flex items-center space-x-2">
          <div className="bg-slate-900 p-0.5 rounded-lg border border-slate-800 flex items-center space-x-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("architectural")}
              className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${viewMode === "architectural"
                ? "bg-sky-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
                }`}
            >
              Architectural
            </button>
            <button
              type="button"
              onClick={() => setViewMode("heatmap")}
              className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${viewMode === "heatmap"
                ? "bg-amber-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
                }`}
            >
              Congestion Heatmap
            </button>
            <button
              type="button"
              onClick={() => setViewMode("patient_flow")}
              className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${viewMode === "patient_flow"
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
                }`}
            >
              Patient Flow
            </button>
          </div>

          <button
            type="button"
            onClick={handleToggleCodeBlue}
            title="Trigger Emergency Code Blue Simulation"
            className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer ${codeBlueActive
              ? "bg-rose-600 text-white border-rose-400 shadow-md animate-pulse"
              : "bg-slate-900 border-slate-800 text-rose-400 hover:bg-rose-950/40"
              }`}
          >
            <span>🚨</span>
            <span className="hidden sm:inline">{codeBlueActive ? "Code Blue Active!" : "Code Blue Sim"}</span>
          </button>

          <button
            type="button"
            onClick={handleToggleExploded}
            title="Toggle Exploded Vertical Floor Stack"
            className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer ${explodedView
              ? "bg-indigo-500/20 border-indigo-400 text-indigo-300 shadow-sm"
              : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
            <span className="hidden md:inline">Exploded View</span>
          </button>

          <button
            onClick={() => setLightingMode(lightingMode === "day" ? "night" : "day")}
            title="Toggle Day/Night Clinical Lighting"
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition"
          >
            {lightingMode === "day" ? (
              <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-indigo-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
              </svg>
            )}
          </button>

          <button
            onClick={handleManualSync}
            disabled={syncing}
            title="Synchronize Live MySQL Telemetry"
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition"
          >
            <svg className={`w-4 h-4 ${syncing ? "animate-spin text-sky-400" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </header>

      {/* 2. SUB-TOOLBAR: FLOOR SELECTOR, DEPT JUMP, FACADE, LABELS & CAMERA PRESETS */}
      <div className="h-10 px-4 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between text-xs z-10 shrink-0 gap-2 overflow-x-auto">
        <div className="flex items-center space-x-1.5 shrink-0">
          <span className="text-slate-400 font-medium mr-1 text-[11px] uppercase tracking-wider">Floor:</span>
          {[
            { id: "all", label: "All Floors" },
            { id: 0, label: "L0 Ground (Emergency/CT)" },
            { id: 1, label: "L1 Inpatient, Dialysis & OPD" },
            { id: 2, label: "L2 Surgical, Cath & ICU" },
            { id: 3, label: "L3 Helipad, Solar & LOX" },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => handleFloorSelect(f.id)}
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition cursor-pointer whitespace-nowrap ${selectedFloor === f.id
                ? "bg-sky-500/20 text-sky-300 border border-sky-400/50 shadow-sm"
                : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* 24 Department Quick Navigator */}
        <div className="flex items-center space-x-2 shrink-0">
          <span className="text-slate-400 font-medium text-[11px] hidden lg:inline">📍 Jump to:</span>
          <select
            value={selectedDeptKey}
            onChange={(e) => handleDepartmentFocus(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-md px-2 py-0.5 outline-none hover:border-slate-700 cursor-pointer"
          >
            <option value="">Select Department / Unit...</option>
            <optgroup label="Ground Level (L0)">
              <option value="ambulance_bay">🚑 Emergency Ambulance Bay</option>
              <option value="emergency">🚨 Emergency & Trauma Bays</option>
              <option value="radiology">☢️ Diagnostic CT / MRI Scanner</option>
              <option value="pathology">🧪 STAT Pathology Lab</option>
              <option value="blood_bank">🩸 Blood Bank & Cold Chain</option>
              <option value="pharmacy">💊 Outpatient Pharmacy & Robot</option>
              <option value="kiosks">🖥️ Self-Registration Kiosks</option>
              <option value="cafeteria">☕ Cafeteria & Lounge</option>
              <option value="reception">🏥 Main Reception & Triage</option>
              <option value="parking">🚗 Grounds & Parking</option>
            </optgroup>
            <optgroup label="Floor 1 (L1)">
              <option value="general_ward">🛏️ General Inpatient Wards</option>
              <option value="nurse_station">👩‍⚕️ Central Nursing Hub</option>
              <option value="cardiology_opd">🩺 Cardiology OPD Clinic</option>
              <option value="pediatric_opd">🧸 Pediatric Examination Suite</option>
              <option value="orthopedic_opd">🦴 Orthopedic Consultation</option>
              <option value="dialysis">🩸 Hemodialysis Renal Care Suite</option>
              <option value="physiotherapy">🏋️ Physiotherapy & Rehab</option>
              <option value="private_suites">🌟 Executive Deluxe Suites</option>
            </optgroup>
            <optgroup label="Floor 2 (L2)">
              <option value="ot1_cardiac">🫀 OT 1 Cardiac & C-Arm</option>
              <option value="ot2_ortho">🔬 OT 2 Laparoscopic Suite</option>
              <option value="cath_lab">⚡ Cardiac Catheterization Lab</option>
              <option value="scrub_cssd">♨️ CSSD Autoclave & Scrub</option>
              <option value="pacu_recovery">🛌 PACU Recovery</option>
              <option value="icu_ccu">🫁 Intensive Care Unit (ICU)</option>
              <option value="nicu">👶 Neonatal ICU (NICU)</option>
            </optgroup>
            <optgroup label="Floor 3 (L3)">
              <option value="helipad">🚁 Helipad & Air Ambulance</option>
              <option value="solar_array">☀️ Rooftop Solar PV Energy</option>
              <option value="lox_tank">❄️ Cryogenic Liquid Oxygen (LOX)</option>
              <option value="satellite_mast">📡 Satellite Tele-Medicine Uplink</option>
              <option value="mep_plant">⚡ HVAC Chillers & Diesel Plant</option>
            </optgroup>
          </select>
        </div>

        {/* Specialized Layer Toggles & Camera Presets */}
        <div className="flex items-center space-x-1.5 shrink-0">
          <button
            type="button"
            onClick={handleToggleLabels}
            title="Toggle 3D Spatial Room Labels"
            className={`px-2 py-0.5 rounded border transition cursor-pointer text-xs ${showLabels
              ? "bg-sky-500/20 border-sky-400 text-sky-300"
              : "bg-slate-900 border-slate-800 text-slate-400"
              }`}
          >
            🏷️ Labels
          </button>

          <button
            type="button"
            onClick={handleToggleFacade}
            title="Toggle Exterior Architectural Glass Facade"
            className={`px-2 py-0.5 rounded border transition cursor-pointer text-xs ${showFacade
              ? "bg-sky-500/20 border-sky-400 text-sky-300"
              : "bg-slate-900 border-slate-800 text-slate-400"
              }`}
          >
            🏢 Glass Shell
          </button>

          <button
            type="button"
            onClick={handleToggleMedGas}
            title="Toggle 3D Medical Gas Pipeline Conduits (O2, Air, Vac)"
            className={`px-2 py-0.5 rounded border transition cursor-pointer text-xs ${showMedGas
              ? "bg-emerald-500/20 border-emerald-400 text-emerald-300"
              : "bg-slate-900 border-slate-800 text-slate-400"
              }`}
          >
            🟢 Med Gas
          </button>

          <button
            type="button"
            onClick={() => applyCameraPreset("isometric")}
            className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 cursor-pointer"
          >
            Isometric
          </button>
          <button
            type="button"
            onClick={() => applyCameraPreset("top")}
            className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 cursor-pointer"
          >
            Plan
          </button>
          <button
            type="button"
            onClick={handleToggleAutoRotate}
            className={`px-2 py-0.5 rounded border transition cursor-pointer ${autoRotate
              ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
              : "bg-slate-900 border-slate-800 text-slate-400"
              }`}
          >
            Auto-Spin
          </button>
          <button
            onClick={handleExportScreenshot}
            title="Download PNG snapshot"
            className="p-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* 3. MAIN 3D VIEWPORT & TELEMETRY INSPECTOR DRAWER */}
      <div className="flex-1 relative overflow-hidden flex">
        <div className="flex-1 h-full w-full relative">
          <div ref={mountRef} className="absolute inset-0 outline-none cursor-grab active:cursor-grabbing" />

          {/* DEDICATED FLOOR TELEMETRY & ROOM TOUR HUD (Displayed when a particular floor is isolated) */}
          {activeFloorProfile && (
            <div className="absolute top-4 left-4 z-20 max-w-sm pointer-events-auto bg-slate-950/90 backdrop-blur-md border border-sky-500/40 rounded-xl p-3 shadow-2xl text-xs space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse"></span>
                  <span className="font-bold text-white text-[12px]">{activeFloorProfile.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleFloorSelect("all")}
                  title="Return to full building view"
                  className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 cursor-pointer"
                >
                  ✕ All
                </button>
              </div>

              {/* Floor stats */}
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800/80">
                  <span className="text-slate-400 block text-[10px]">Active Census</span>
                  <span className="font-semibold text-emerald-400">{activeFloorProfile.stats.beds}</span>
                </div>
                <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800/80">
                  <span className="text-slate-400 block text-[10px]">Key Equipment</span>
                  <span className="font-semibold text-sky-300 truncate block" title={activeFloorProfile.stats.equipment}>
                    {activeFloorProfile.stats.equipment}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800/80">
                  <span className="text-slate-400 block text-[10px]">Cleanliness Grade</span>
                  <span className="font-semibold text-amber-300">{activeFloorProfile.stats.cleanliness}</span>
                </div>
                <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800/80">
                  <span className="text-slate-400 block text-[10px]">Airflow / Temp</span>
                  <span className="font-mono text-slate-200">{activeFloorProfile.stats.airChanges} • {activeFloorProfile.stats.temperature}</span>
                </div>
              </div>

              {/* Interactive Room Tour Controller */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-[10px] text-slate-400">
                  Tour Room {tourIndex + 1}/{activeFloorProfile.rooms.length}:
                </span>
                <button
                  type="button"
                  onClick={handleNextRoomTour}
                  className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded text-[11px] font-semibold flex items-center space-x-1 cursor-pointer transition shadow-sm"
                >
                  <span>▶ Next Room:</span>
                  <span className="font-normal text-sky-100 max-w-[120px] truncate">
                    {activeFloorProfile.rooms[(tourIndex + 1) % activeFloorProfile.rooms.length].title}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* CODE BLUE SIMULATION FLOATING BANNER */}
          {codeBlueActive && (
            <div className="absolute top-3 inset-x-8 z-30 pointer-events-none flex items-center justify-center animate-bounce">
              <div className="bg-rose-950/90 border border-rose-500 text-rose-200 px-4 py-2 rounded-xl shadow-2xl backdrop-blur-md flex items-center space-x-3">
                <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping"></span>
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  EMERGENCY CODE BLUE SIMULATION ACTIVE — Rapid Response & Crash Team Dispatched to Trauma Bay 1 & ICU
                </span>
              </div>
            </div>
          )}

          {/* Floating Hover Tooltip */}
          {tooltip.visible && tooltip.data && (
            <div
              style={{ left: tooltip.x, top: tooltip.y }}
              className="absolute pointer-events-none z-30 bg-slate-950/95 backdrop-blur-md border border-sky-500/40 rounded-lg p-2.5 shadow-2xl text-xs max-w-xs transition-opacity duration-150"
            >
              <div className="font-semibold text-white flex items-center justify-between space-x-2">
                <span>{tooltip.data.title || tooltip.data.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono">
                  {tooltip.data.type || "Facility"}
                </span>
              </div>
              <div className="text-slate-400 text-[11px] mt-0.5">
                {tooltip.data.department || tooltip.data.wardName || "Hospital Asset"}
              </div>
              {tooltip.data.heat_score !== undefined && (
                <div className="mt-1.5 flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-800">
                  <span className="text-slate-400">Congestion Heat:</span>
                  <span
                    className={`font-bold ${tooltip.data.heat_score >= 80
                      ? "text-rose-400"
                      : tooltip.data.heat_score >= 50
                        ? "text-amber-400"
                        : "text-emerald-400"
                      }`}
                  >
                    {tooltip.data.heat_score}%
                  </span>
                </div>
              )}
              {tooltip.data.status && (
                <div className="mt-0.5 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Operational Status:</span>
                  <span className="capitalize text-slate-200 font-medium">{tooltip.data.status}</span>
                </div>
              )}
            </div>
          )}

          {/* View Mode Watermark Banner */}
          {!activeFloorProfile && (
            <div className="absolute top-3 left-4 pointer-events-none z-10 flex items-center space-x-2 bg-slate-950/70 backdrop-blur-sm border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping"></span>
              <span className="font-medium text-slate-300 uppercase tracking-wider text-[11px]">
                Mode: {viewMode.replace("_", " ")} {showFacade ? "• Glass Facade Active" : ""} {showMedGas ? "• Med Gas Active" : ""}
              </span>
            </div>
          )}

          {/* Quick Controls Legend */}
          <div className="absolute bottom-3 left-4 pointer-events-none z-10 bg-slate-950/80 backdrop-blur-md border border-slate-800/80 px-3 py-2 rounded-lg text-[11px] text-slate-400 flex items-center space-x-4">
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded bg-emerald-500"></span>
              <span>Available</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded bg-sky-500"></span>
              <span>Occupied</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded bg-amber-500"></span>
              <span>Maintenance / Surg</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded bg-rose-500"></span>
              <span>Critical / Hotspot</span>
            </div>
          </div>
        </div>

        {/* Right-Side Clinical Telemetry Inspector Drawer */}
        {selectedEntity && (
          <aside className="w-80 h-full bg-slate-950/95 backdrop-blur-lg border-l border-slate-800 p-4 flex flex-col justify-between z-30 shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-200">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2 min-w-0">
                  <div className="w-6 h-6 rounded bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-xs">
                    {selectedEntity.type === "hospital_bed"
                      ? "🛏️"
                      : selectedEntity.type === "ambulance"
                        ? "🚑"
                        : selectedEntity.type === "air_ambulance"
                          ? "🚁"
                          : selectedEntity.type === "radiology_ct"
                            ? "☢️"
                            : selectedEntity.type === "incubator"
                              ? "👶"
                              : selectedEntity.type === "dialysis"
                                ? "🩸"
                                : selectedEntity.type === "blood_bank"
                                  ? "❄️"
                                  : selectedEntity.type === "fluoroscopy"
                                    ? "🔬"
                                    : "🏥"}
                  </div>
                  <h3 className="font-semibold text-white truncate text-sm">
                    {selectedEntity.title || selectedEntity.name || "Selected Asset"}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedEntity(null)}
                  className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Status Banner */}
              <div className="mt-3 p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-slate-400 uppercase tracking-wider">Operational Status</div>
                <div className="text-sm font-bold text-white capitalize mt-0.5 flex items-center justify-between">
                  <span>{selectedEntity.status || "Operational"}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${selectedEntity.status === "occupied" || selectedEntity.status === "critical"
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      }`}
                  >
                    {selectedEntity.status === "occupied" ? "In-Use" : "Active Ready"}
                  </span>
                </div>
              </div>

              {/* Attributes Grid */}
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Department:</span>
                  <span className="font-medium text-slate-200">
                    {selectedEntity.department || selectedEntity.wardName || "Hospital Services"}
                  </span>
                </div>

                {selectedEntity.bedNumber && (
                  <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                    <span className="text-slate-400">Bed Identifier:</span>
                    <span className="font-mono text-sky-300">{selectedEntity.bedNumber}</span>
                  </div>
                )}

                {selectedEntity.patientName && (
                  <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                    <span className="text-slate-400">Patient Assigned:</span>
                    <span className="font-semibold text-emerald-400">{selectedEntity.patientName}</span>
                  </div>
                )}

                {selectedEntity.scans_today && (
                  <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                    <span className="text-slate-400">Scans Completed:</span>
                    <span className="font-bold text-sky-400">{selectedEntity.scans_today} Scans Today</span>
                  </div>
                )}

                {selectedEntity.tube_life && (
                  <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                    <span className="text-slate-400">X-Ray Tube Life:</span>
                    <span className="font-mono text-emerald-400">{selectedEntity.tube_life}</span>
                  </div>
                )}

                {selectedEntity.blood_flow && (
                  <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                    <span className="text-slate-400">Blood Flow Rate:</span>
                    <span className="font-mono text-rose-400">{selectedEntity.blood_flow}</span>
                  </div>
                )}

                {selectedEntity.fuel && (
                  <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                    <span className="text-slate-400">Aviation Fuel:</span>
                    <span className="font-mono text-emerald-400">{selectedEntity.fuel}</span>
                  </div>
                )}

                {selectedEntity.pilot_on_duty && (
                  <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                    <span className="text-slate-400">Flight Crew:</span>
                    <span className="text-slate-200">{selectedEntity.pilot_on_duty}</span>
                  </div>
                )}

                {selectedEntity.eta_airborne && (
                  <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                    <span className="text-slate-400">Airborne Readiness:</span>
                    <span className="font-bold text-amber-400">{selectedEntity.eta_airborne}</span>
                  </div>
                )}

                {selectedEntity.pressure && (
                  <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                    <span className="text-slate-400">Differential Pressure:</span>
                    <span className="font-mono text-sky-300">{selectedEntity.pressure}</span>
                  </div>
                )}

                {selectedEntity.temperature && (
                  <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                    <span className="text-slate-400">Temperature:</span>
                    <span className="font-mono text-slate-200">{selectedEntity.temperature}</span>
                  </div>
                )}

                {selectedEntity.inventory && (
                  <div className="flex flex-col py-1.5 border-b border-slate-800/60">
                    <span className="text-slate-400">Blood Unit Inventory:</span>
                    <span className="font-mono text-sky-300 text-[11px] mt-0.5">{selectedEntity.inventory}</span>
                  </div>
                )}
              </div>

              {selectedEntity.equipment && (
                <div className="mt-3 pt-2 border-t border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Onboard Medical Equipment</div>
                  <div className="flex flex-wrap gap-1">
                    {selectedEntity.equipment.map((item, idx) => (
                      <span key={idx} className="px-1.5 py-0.5 rounded text-[10px] bg-slate-900 border border-slate-800 text-sky-300">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* IoT Telemetry Widget */}
              <div className="mt-4 p-3 rounded-lg bg-sky-950/20 border border-sky-800/40">
                <div className="text-[10px] font-bold text-sky-400 uppercase tracking-wider mb-2 flex items-center space-x-1">
                  <span>📡</span>
                  <span>Spatial IoT Telemetry</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                  <div className="bg-slate-900/80 p-1.5 rounded">
                    <div className="text-[10px] text-slate-400">Air Exchanges</div>
                    <div className="font-bold text-white">16 ACH</div>
                  </div>
                  <div className="bg-slate-900/80 p-1.5 rounded">
                    <div className="text-[10px] text-slate-400">Cleanliness</div>
                    <div className="font-bold text-emerald-400">ISO-5 Class 100</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800">
              <button
                onClick={() => setSelectedEntity(null)}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                Dismiss Inspector
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* 4. BOTTOM EXECUTIVE KPI METRICS BAR */}
      <footer className="h-11 px-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs z-10 shrink-0">
        <div className="flex items-center space-x-6 overflow-x-auto">
          <div className="flex items-center space-x-2">
            <span className="text-slate-400">Total Inpatient Beds:</span>
            <span className="font-bold text-white font-mono">{statsSummary.totalBeds}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-slate-400">Occupied:</span>
            <span className="font-bold text-sky-400 font-mono">{statsSummary.occupiedBeds}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-slate-400">Available Clean:</span>
            <span className="font-bold text-emerald-400 font-mono">{statsSummary.availableBeds}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-slate-400">Bed Occupancy Rate:</span>
            <span
              className={`font-bold font-mono ${statsSummary.occupancyPct >= 80 ? "text-rose-400" : "text-sky-300"
                }`}
            >
              {statsSummary.occupancyPct}%
            </span>
          </div>
          <div className="flex items-center space-x-2 hidden md:flex">
            <span className="text-slate-400">Live Active Headcount:</span>
            <span className="font-bold text-amber-400 font-mono">{statsSummary.totalHeadcount}</span>
          </div>
        </div>

        <div className="text-[11px] text-slate-500 shrink-0">
          Last Synced: {lastUpdated || "Live"}
        </div>
      </footer>
    </div>
  );
}
