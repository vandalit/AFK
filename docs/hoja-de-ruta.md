# Hoja de Ruta y Fases de Implementación — AFK

Este plan de trabajo desglosa el desarrollo de **AFK** en 6 fases incrementales y verificables, diseñadas para mitigar riesgos tempranamente y garantizar la sensación de control antes de añadir capas de complejidad.

---

## Cronograma General por Fases

| Fase | Enfoque Principal | Entregable Clave | Criterio de Aceptación Stricto Sensu |
|:---:|:---|:---|:---|
| **0** | **Spike Arquitectónico (~2h)** | Andamiaje Electron + Visión Oculta + Overlay Transparente | El círculo SVG sigue la punta del índice con latencia aceptable. El overlay no bloquea clicks físicos. |
| **1** | **Cursor y Navegación** | One Euro + Zona Activa + Driver de Cursor OS + Tray & Atajo | El cursor real del SO se mueve con suavidad alcanzando los 4 bordes. El atajo global apaga el control al instante. |
| **2** | **Capa Vectorial de Afordancia** | Renderizado de Mano SVG + Niveles L0 a L3 manuales | La punta del dedo índice vectorial coincide exactamente con el hotspot del puntero del SO. |
| **3** | **Click, Buffer y Clutch** | Detección de Push + Buffer circular 150ms + Gesto Clutch | Click acertado sobre botones de ~40 px en más del 85% de los intentos sin arrastres accidentales. |
| **4** | **Gestos Avanzados & Web Sandbox**| Pinch/Drag + Grab + Panel de Ajustes + **Playground Web** | Arrastrar ventanas en desktop y manipulación fluida de componentes interactivos en navegador web. |
| **5** | **Pulido, Multi-pantalla & macOS** | Adaptación macOS (`CoreGraphics`), Multi-monitor/DPI y Fade | Compatibilidad multiplataforma demostrada (Windows + Mac CI/CD) y transición adaptativa L0-L3. |

---

## Detalle de Fases y Tareas

### Fase 0: Spike Arquitectónico (~2 horas)
> **Objetivo**: Validar el andamiaje básico de Electron, la captura de MediaPipe sin throttling en ventana oculta y la transparencia click-through del overlay.

- [ ] **Configuración del Proyecto**:
  - Inicializar proyecto con `electron-vite` y TypeScript estricto.
  - Configurar estructura de carpetas según la sección 5 del documento maestro (`src/main`, `src/vision`, `src/gestures`, `src/overlay`, `src/shared`).
  - Instalar dependencias esenciales: `@mediapipe/tasks-vision`, `electron`, `typescript`.
- [ ] **Ventana de Visión Oculta (`src/vision`)**:
  - Crear ventana con `show: false` y `backgroundThrottling: false`.
  - Captura de video WebRTC (`navigator.mediaDevices.getUserMedia`).
  - Inicialización local de `HandLandmarker` con backend WASM/GPU.
  - Envío por IPC (`vision:landmarks`) de los 21 puntos normalizados al proceso Main.
- [ ] **Ventana Overlay Transparente (`src/overlay`)**:
  - Crear ventana con `transparent: true`, `frame: false`, `alwaysOnTop: true`, `hasShadow: false`.
  - Aplicar `setIgnoreMouseEvents(true, { forward: true })`.
  - Renderizar un círculo simple (punto rojo o verde) en las coordenadas del índice (landmark 8).
- [ ] **Control del Sistema y Salvavidas**:
  - Crear icono en la bandeja de sistema (Tray) con opciones "Activar / Desactivar".
  - Registrar atajo de teclado global (`globalShortcut`) equivalente.
- [ ] **Criterio de Aceptación**:
  - Mover la mano frente a la cámara hace que el círculo en pantalla siga el dedo con fluidez ($\ge 30\text{ fps}$).
  - Hacer click con el mouse físico sobre cualquier ventana del escritorio funciona con normalidad (el overlay no intercepta ni bloquea clicks).

---

### Fase 1: Cursor y Navegación Suave
> **Objetivo**: Pasar del seguimiento visual pasivo a la inyección activa de movimiento en el cursor del sistema operativo con calidad ergonómica.

- [ ] **Filtro One Euro (`src/vision/one-euro.ts`)**:
  - Implementar el algoritmo One Euro completo para coordenadas 3D.
  - Ajustar parámetros base (`minCutoff = 0.8`, `beta = 0.015`).
  - Comprobar que en reposo el puntero no presente fluctuación visible (jitter).
- [ ] **Mapeo Espacial de Zona Activa (`src/gestures/features.ts`)**:
  - Configurar rectángulo central de 60% en el campo de visión.
  - Aplicar inversión de eje X (efecto espejo).
  - Proyectar coordenadas normalizadas a resolución de pantalla del monitor principal de Windows.
- [ ] **Driver de Cursor Nativo (`src/main/cursor-driver.ts`)**:
  - Evaluar y seleccionar la librería de inyección de mouse compatible con la versión de Electron elegida (`robotjs`, `@nut-tree/nut-js` o bindings directos a `SendInput` de la API de Windows).
  - Implementar método `move(x, y)`.
- [ ] **Criterio de Aceptación**:
  - El puntero del mouse del sistema sigue la mano de forma ergonómica y alcanza los cuatro bordes y esquinas de la pantalla sin requerir estiramiento excesivo del brazo.
  - Al pulsar el atajo global, el cursor queda libre inmediatamente y la inyección se detiene.

---

### Fase 2: Capa Vectorial de Afordancia ("Segundas Manos")
> **Objetivo**: Construir la presencia visual de las manos del usuario proyectadas en el escritorio para consolidar el modelo mental de interacción.

- [x] **Renderizado de Mano Vectorial SVG (`src/overlay/hand-renderer.ts`)**:
  - Cápsulas SVG volumétricas con degradé por cada falange de los 5 dedos.
  - Polígono de palma semitransparente con radialGradient.
  - Filtro `handGlow` (feGaussianBlur + feComposite) sobre el grupo volumétrico.
  - Articulaciones como círculos blancos sobre cada nodo.
  - **Alineación garantizada**: Landmark 8 → mismo mapeo `mapCameraToScreen` que el cursor del SO.
- [x] **Controlador de Niveles de Afordancia (`src/overlay/affordance-fade.ts`)**:
  - `L3`: Silueta volumétrica completa (cápsulas + palma + glow).
  - `L2`: Esqueleto articular (líneas y nodos, sin volumen).
  - `L1`: Solo círculo en la yema del índice.
  - `L0`: Invisible (solo el cursor del sistema).
  - Alternancia manual desde el System Tray (ya implementado).
- [x] **Feedback reactivo de estado (`PUSH_ARMED`)**:
  - El puntero del índice cambia de neón verde a rojo urgente al armarse el click.
  - Conectado al campo `currentGesture` del `OverlayFramePayload`.
- [x] **Criterio de Aceptación**:
  - 4 niveles de afordancia funcionando y alternables desde el Tray.
  - El usuario percibe la mano gráfica como una extensión natural de su propia mano.

---

### Fase 3: Click Preciso, Buffer Pre-Click y Modo Clutch
> **Objetivo**: Implementar la selección e interacción sin falsos positivos ni desviación involuntaria por el movimiento del dedo.

- [x] **FSM real de gestos (`src/gestures/fsm.ts`)**:
  - Estados: `IDLE` → `POINT` → `PUSH_ARMED` → `CLICK` → `POINT`.
  - `CLUTCH` desde `POINT` con dwell timer configurable.
  - Derivada de `handScale` como detector de empuje (ADR-05).
- [x] **Detector de posturas (`src/gestures/features.ts`)**:
  - `isIndexPointing()`: índice extendido + 3 dedos flexionados (margen 2%).
  - `isOpenPalm()`: 4 dedos principales extendidos (activación de clutch).
- [x] **Buffer circular de coordenadas pre-click**:
  - Ventana de 300ms de historial de posiciones de la yema del índice.
  - El click se emite en la posición de `pushArmedAt - bufferMs` (default 180ms).
  - Elimina la deriva causada por el impulso físico del empuje.
- [x] **Modo Clutch (Palma Abierta)**:
  - Palma abierta sostenida `clutch.dwellMs` ms → `isCursorFrozen = true`.
  - Cierre de mano → `isCursorFrozen = false`, vuelve a POINT.
  - Toda inyección de cursor se congela mientras el flag está activo.
- [x] **Cableado en Main (`src/main/index.ts`)**:
  - `fsm.update(frame)` en cada VISION_FRAME.
  - Routing: `pointer-move` → `cursorDriver.move()`, `click` → `move + click`.
  - Overlay recibe `currentGesture` real desde el estado FSM.
- [x] **Suite de tests (`tests/fsm-gestures.test.ts`)**:
  - 18 tests de transiciones, posturas y casos límite.
  - Total acumulado: 31 tests / 5 suites — todos pasan.
- [x] **Criterio de Aceptación**:
  - Click acertado sobre botones de ~40px en >85% de intentos (validar en Windows).

---

### Fase 4: Manipulación Completa (Pinch, Drag) & Web Sandbox en Vivo
> **Objetivo**: Ampliar el repertorio gestual a manipulaciones complejas de ventanas y ofrecer un entorno de validación interactiva y ajuste dinámico de constantes.

- [x] **Gesto de Arrastre (Pinch / Drag)**:
  - Medir la distancia euclidiana entre pulgar (4) e índice (8) normalizada por `handScale` (`computePinchDistance`).
  - Histéresis robusta: activación en `pinch.enter` (0.15) y liberación en `pinch.exit` (0.22).
  - Máquina de estados: `POINT` → `DRAG` con emisión de `drag-start` (MouseDown) y `drag-end` (MouseUp).
  - Resiliencia: liberación garantizada de arrastre al perder la mano o pausar tracking.
- [x] **Integración en Driver y Main (`src/main/index.ts`)**:
  - Routing de `drag-start` a `cursorDriver.down('left')`.
  - Routing de `drag-end` a `cursorDriver.up('left')`.
  - Capa de overlay con feedback ámbar neón y conector de pinza en `DRAG`.
- [x] **Interactive Live Web Sandbox (`src/sandbox/` & `npm run sandbox`)**:
  - SPA de alta fidelidad para pruebas completas en navegador con webcam real.
  - Ingesta WebRTC + MediaPipe Tasks Vision (HandLandmarker + FaceDetector) + One Euro Filter + HandScale + FSM en tiempo real.
  - Capa de afordancia vectorial SVG activa con alternancia de niveles L0, L1, L2, L3.
  - **Plano Ergonómico al Pecho (Chin-Pinned)**: Anclaje dinámico del borde superior bajo el mentón del usuario y proyección isotrópica 1:1 proporcional al ratio de pantalla (16:9), permitiendo alcanzar el 100% del alto sin fatiga y sin chocar con el límite inferior del sensor.
  - **Zonas de Seguridad Estilo Broadcast (SMPTE / EBU)**:
    - *Action Safe (93%)*: Brackets en las cuatro esquinas indicando la zona óptima de movimiento.
    - *Title Safe (90%)*: Contorno punteado interior de referencia.
    - *Cruz Central y Guías de Mentón/Fondo*: Identificación visual inmediata de límites físicos.
    - *Alerta de Proximidad a Bordes*: Detección anticipada cuando la mano se aproxima al límite de percepción óptica del sensor o zona muerta del rostro.
  - **PiP Webcam Fidedigno (Sin Recorte)**:
    - Relación de aspecto dinámica del contenedor según el stream nativo de la cámara (evita `object-fit: cover` engañoso).
    - Representación gráfica en tiempo real de la mano (muñeca y yema del índice) dentro del monitor virtual proyectado en el PiP.
  - Pruebas interactivas:
    - **Target Practice**: validación de clicks con buffer pre-click de 180ms y medidor de efectividad.
    - **Ventanas arrastrables**: prueba real de Pinch / Drag con tarjetas movibles.
    - **Lienzo de dibujo continuo**: comprobación de ausencia de jitter con One Euro.
    - **Panel de calibración en vivo**: sliders dinámicos para `oneEuro`, `activeZone`, `scaleRate`, `bufferMs`, `pinch.enter` y `pinch.exit`.
    - **HUD de telemetría**: medidores dinámicos de FPS, latencia, `scaleRate` y distancia de pinch.
- [x] **Suite de Tests Unitarios (`tests/`)**:
  - 41 tests acumulados en 6 suites (`fsm-gestures`, `chest-plane`, `calibration`, `one-euro`, `cursor-driver`, `fsm`).
  - Verificación matemática de histéresis, mapeo isotrópico y liberación segura.
- [x] **Criterio de Aceptación**:
  - Arrastre fluido mediante pinch, control ergonómico al pecho sin elevación de brazo, feedback de zonas de seguridad en tiempo real y playground web operativo.

---

### Estado Actual del Proyecto: Checkpoint de Calibración & Pausa

> **Estado**: **Fases 0 a 4 Completadas — Pausa de Calibración en Fase 4**.
> 
> El andamiaje arquitectónico, la máquina de estados, el driver de cursor, el renderer de afordancia vectorial, el modelo del plano al pecho y el entorno interactivo de pruebas están completamente construidos y operativos.
> 
> **Motivo de la Pausa**:
> El control óptico monocular mediante webcam genérica presenta desafíos de tolerancia física y variabilidad de encuadre en el límite inferior del sensor. Habiendo implementado el plano fidedigno al pecho, las zonas de seguridad de video y el PiP sin recortes, el proyecto se congela en este estado limpio y determinista para evaluar la ergonomía de uso antes de avanzar a la Fase 5 (Multi-monitor y adaptaciones avanzadas).

---

### Fase 5: Pulido, Multi-pantalla y Resiliencia (Backlog / Futuro)
> **Objetivo**: Consolidar la experiencia de usuario para uso diario continuo y situaciones de entorno complejas.

- [ ] **Gestión de Pantallas y DPI**:
  - Adaptación a configuraciones multimonitor con factores de escala (100%, 125%, 150%).
- [ ] **Desvanecimiento Progresivo Automático**:
  - Métrica de familiaridad basada en tiempo continuo de uso y tasa de aciertos de clicks, transitando suavemente de `L3` a `L0`.
  - Reaparición temporal automática a `L3` ante posturas dudosas o pérdida de tracking.
- [ ] **Sistema de Grabación y Reproducción de Sesiones (`recordings/`)**:
  - Capturador de secuencias de landmarks a archivos JSON para reproducir benchmarks y afinar algoritmos con pruebas unitarias deterministas en Vitest.
