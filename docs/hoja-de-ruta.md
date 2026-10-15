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

- [ ] **Renderizado de Mano Vectorial SVG (`src/overlay/hand-renderer.ts`)**:
  - Diseñar paths SVG para los 5 dedos y la palma basados en los 21 landmarks cinemáticos.
  - Aplicar estilos gráficos modernos: máscaras semitransparentes, tinte sutil y sombras de contraste para visibilidad sobre fondos claros u oscuros.
  - **Alineación Obligatoria**: Garantizar que la punta distal del dedo índice coincida pixel por pixel con el punto de acción (hotspot) del cursor del sistema.
- [ ] **Controlador de Niveles de Afordancia (`src/overlay/affordance-fade.ts`)**:
  - Implementar los 4 modos de renderizado:
    - `L3`: Silueta y mano completa con volumen.
    - `L2`: Esqueleto articular (líneas y nodos).
    - `L1`: Puntos flotantes en las yemas de los dedos.
    - `L0`: Invisible (solo el cursor del sistema).
  - Permitir alternar los modos manualmente mediante configuración.
- [ ] **Criterio de Aceptación**:
  - El usuario percibe la mano gráfica como una extensión natural de su propia mano ("segunda mano"), sin desfasajes geométricos con respecto al cursor real.

---

### Fase 3: Click Preciso, Buffer Pre-Click y Modo Clutch
> **Objetivo**: Implementar la selección e interacción sin falsos positivos ni desviación involuntaria por el movimiento del dedo.

- [ ] **Detector de Gesto Push (`src/gestures/features.ts`)**:
  - Calcular la velocidad de variación de `handScale` ($\Delta \text{scale} / \Delta t$).
  - Validar la postura "índice extendido + resto recogido" mediante ángulos y distancias de falanges.
  - Definir transición de estado: `IDLE` ➔ `POINT` ➔ `PUSH_ARMED` ➔ `CLICK`.
- [ ] **Buffer Circular de Coordenadas**:
  - Almacenar un historial temporal de coordenadas del cursor de los últimos 200 ms.
  - Al dispararse el evento `CLICK`, emitir la pulsación en las coordenadas registradas al inicio de la maniobra de empuje (evitando que el click caiga desplazado).
- [ ] **Mecanismo de Clutch (Palma Abierta)**:
  - Detectar apertura completa y simultánea de los 5 dedos.
  - Tras `clutch.dwellMs` (~500 ms), congelar la inyección del cursor para permitir descanso o recentrado de la mano sin mover el ratón.
- [ ] **Criterio de Aceptación**:
  - En una página web de prueba con botones de 40x40 píxeles, el usuario logra hacer click exitoso en $\ge 85\%$ de los intentos sin que el cursor se desvíe en el momento del impacto.

---

### Fase 4: Manipulación Completa (Pinch, Drag) y Panel en Vivo
> **Objetivo**: Ampliar el repertorio gestual a manipulaciones complejas de ventanas y ofrecer un entorno de ajuste dinámico de constantes.

- [ ] **Gesto de Arrastre (Pinch / Drag)**:
  - Medir la distancia normalizada entre pulgar e índice.
  - Implementar histéresis: activación en `pinch.enter` (distancia estrecha) y liberación en `pinch.exit` (distancia amplia).
  - Emitir `drag-start` (MouseDown) y `drag-end` (MouseUp).
- [ ] **Panel de Calibración en Vivo (`src/panel/`)**:
  - Ventana de ajustes accesible desde el Tray.
  - Sliders interactivos conectados a `shared/config.ts`:
    - `oneEuro.minCutoff` y `oneEuro.beta`
    - Coeficientes de zona activa
    - Umbral de push (`scaleRate`) y tamaño del buffer (`push.bufferMs`)
    - Tiempos de retención de clutch y gesto maestro
- [ ] **Criterio de Aceptación**:
  - Capacidad demostrada de agarrar la barra de título de una ventana de Windows mediante pinch, moverla a través del escritorio y soltarla fluidamente.

---

### Fase 5: Pulido, Multi-pantalla y Resiliencia
> **Objetivo**: Consolidar la experiencia de usuario para uso diario continuo y situaciones de entorno complejas.

- [ ] **Gestión de Pantallas y DPI**:
  - Adaptación a configuraciones multimonitor con factores de escala (100%, 125%, 150%).
- [ ] **Desvanecimiento Progresivo Automático**:
  - Métrica de familiaridad basada en tiempo continuo de uso y tasa de aciertos de clicks, transitando suavemente de `L3` a `L0`.
  - Reaparición temporal automática a `L3` ante posturas dudosas o pérdida de tracking.
- [ ] **Sistema de Grabación y Reproducción de Sesiones (`recordings/`)**:
  - Capturador de secuencias de landmarks a archivos JSON para reproducir benchmarks y afinar algoritmos con pruebas unitarias deterministas en Vitest.
