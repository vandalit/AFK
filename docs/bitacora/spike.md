commit #2:

AFK/
├── electron.vite.config.ts        # Bundler multi-ventana y multi-página (Vision + Overlay)
├── tsconfig.json                  # TypeScript estricto con moduleResolution bundler
├── package.json                   # Scripts dev, build, typecheck y test
├── src/
│   ├── shared/
│   │   ├── config.ts              # Parámetros algorítmicos centralizados
│   │   ├── events.ts              # Contratos tipados (HandFrame, GestureEvent, Vec3)
│   │   └── ipc-channels.ts        # Canales de comunicación IPC estandarizados
│   ├── gestures/                  # Lógica pura (CERO dependencias de Electron/DOM)
│   │   ├── types.ts               # Tipos e interfaces de estados FSM
│   │   ├── fsm.ts                 # Stub limpio de la Máquina de Estados
│   │   ├── features.ts            # Cálculo de distancias y handScale normalizador
│   │   └── calibration.ts         # Mapeo zona activa (~60%), espejo X y pantalla
│   ├── vision/
│   │   ├── index.html             # Ventana oculta
│   │   ├── camera.ts              # Captura WebRTC a 60/30 FPS
│   │   ├── one-euro.ts            # Filtro One Euro adaptativo 1D y 3D para los 21 puntos
│   │   └── hand-tracker.ts        # MediaPipe HandLandmarker (WASM/GPU) + IPC
│   ├── overlay/
│   │   ├── index.html             # Ventana transparente click-through y sin bordes
│   │   ├── hand-renderer.ts       # Dibujado SVG del círculo en el índice y esqueleto
│   │   └── affordance-fade.ts     # Controlador de niveles de afordancia (L0 - L3)
│   ├── preload/
│   │   └── index.ts               # Bridge seguro de contextIsolation
│   └── main/
│       ├── windows.ts             # Factoría con backgroundThrottling: false y click-through
│       ├── shortcuts.ts           # Atajo de emergencia (CmdOrCtrl+Alt+Space)
│       ├── tray.ts                # System Tray con menú contextual y niveles L0-L3
│       ├── cursor-driver.ts       # NullCursorDriver (sin inyección al SO todavía)
│       └── index.ts               # Orquestador del ciclo de vida y bus de eventos
└── tests/
    ├── one-euro.test.ts           # Tests de atenuación de jitter y respuesta a impulsos
    ├── fsm.test.ts                # Tests de ciclo de vida de la FSM
    └── calibration.test.ts        # Tests de inversión en espejo y zona activa


