# Especificación Técnica de Arquitectura — AFK

Este documento define la arquitectura de software, el flujo de datos, los contratos de interfaz y los detalles de implementación para el sistema de control gestual y capa de afordancia **AFK**.

---

## 1. Diagrama de Procesos y Topología de Electron

El sistema se estructura en procesos independientes comunicados a través del bus de mensajería interna (IPC) de Electron para garantizar que las tareas intensivas de renderizado visual y visión computacional no bloqueen la inyección de eventos al sistema operativo.

```mermaid
flowchart TB
    subgraph Hardware [Capa de Hardware]
        CAM[Cámara Web USB / Integrada]
        OS_INPUT[Entrada de Sistema Win32]
    end

    subgraph VisionProcess [Proceso Renderer: Vision (Ventana Oculta)]
        CAM -->|getUserMedia| CAPTURE[Camera Feed 60/30fps]
        CAPTURE --> MP[MediaPipe Tasks Vision - WASM/GPU]
        MP -->|Raw Landmarks 3D| ONE_EURO[Filtro Adaptativo One Euro]
        ONE_EURO -->|Landmarks Suavizados| FSM[Máquina de Estados de Gestos]
        FSM -->|GestureEvent + HandFrame| IPC_TX[IPC Send: vision-to-main]
    end

    subgraph MainProcess [Proceso Principal: Electron Main]
        IPC_TX -->|IPC Main Channel| DISPATCHER[Event Bus & Dispatcher]
        TRAY[System Tray + Menu] --> DISPATCHER
        SHORTCUT[Global Hotkey Service] --> DISPATCHER
        DISPATCHER -->|Driver Interface| DRIVER[Cursor Driver - Win32]
        DRIVER -->|SendInput / Native| OS_INPUT
        DISPATCHER -->|IPC Broadcast| OVERLAY_TX[IPC Send: main-to-overlay]
    end

    subgraph OverlayProcess [Proceso Renderer: Overlay (Transparente)]
        OVERLAY_TX --> IPC_RX[IPC Receive: main-to-overlay]
        IPC_RX --> RENDERER[SVG / 2D Canvas Hand Renderer]
        RENDERER --> FADE_CTRL[Affordance Fade Controller (L0-L3)]
        FADE_CTRL --> SCREEN[Pantalla de Windows (Always On Top)]
    end
```

---

## 2. Responsabilidades por Proceso

### 2.1. Proceso Main (`src/main/`)
- **Gestión de Ciclo de Vida**: Inicialización de Electron, arranque de ventanas, gestión del cierre y reactivación.
- **Configuración de Ventanas (`windows.ts`)**:
  - `visionWindow`: Creada con `show: false`, pero configurada con `backgroundThrottling: false` en `webPreferences`. Esto es crítico para evitar que Chromium pause o reduzca la frecuencia de actualización del bucle de captura cuando la ventana no está visible.
  - `overlayWindow`: Creada con `transparent: true`, `frame: false`, `alwaysOnTop: true`, `hasShadow: false`, `skipTaskbar: true`. Se ejecuta de forma inmediata `setIgnoreMouseEvents(true, { forward: true })` para convertirla en 100% passthrough.
- **Driver de Cursor (`cursor-driver.ts`)**: Recibe los eventos validados (`pointer-move`, `click`, `drag-start`, etc.) e interactúa con el sistema operativo mediante llamadas de mouse de baja latencia.
- **Bandeja del Sistema (`tray.ts`)**: Muestra el icono de estado de la aplicación, estado de la cámara y permite pausar o salir.
- **Atajos Globales (`shortcuts.ts`)**: Registra la combinación de emergencia (`globalShortcut`) para cortar el control de mouse inmediatamente si es necesario.

### 2.2. Proceso de Visión (`src/vision/`)
- Ejecuta el bucle de captura a alta velocidad (`requestVideoFrameCallback` o `requestAnimationFrame`).
- Aloja la instancia de `HandLandmarker` de `@mediapipe/tasks-vision`.
- Aplica el filtro `One Euro` sobre cada uno de los 21 landmarks 3D.
- Contiene y ejecuta la Máquina de Estados Finitos (`FSM`) pura, desacoplada de la interfaz gráfica.
- Envía los frames procesados y eventos de gesto generados al proceso Main vía `ipcRenderer.send`.

### 2.3. Proceso Overlay (`src/overlay/`)
- Escucha el canal IPC para recibir los landmarks filtrados y el estado actual de la FSM.
- Dibuja la representación gráfica de las "segundas manos":
  - Dibuja trazados SVG articulados entre falanges.
  - Sincroniza la posición del extremo distal del dedo índice con el cursor real del sistema.
  - Aplica efectos visuales sutiles según el estado (por ejemplo, encogimiento o cambio de opacidad al armar un `push`, halo al sostener `clutch`).
  - Aplica el nivel de opacidad y detalle según el estado de afordancia (`L0` a `L3`).

---

## 3. Contratos de Datos y Tipos Compartidos (`src/shared/`)

Los siguientes tipos TypeScript constituyen la fuente de verdad de todo el sistema y residen en `src/shared/` y `src/gestures/types.ts`:

```typescript
// src/shared/events.ts y src/gestures/types.ts

/** Vector 3D con coordenadas normalizadas [0..1] proveídas por MediaPipe */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Fotograma completo de mano con filtrado One Euro aplicado */
export interface HandFrame {
  /** Timestamp de captura en milisegundos */
  t: number;
  /** Los 21 puntos cinemáticos de la mano */
  landmarks: Vec3[];
  /** Lateralidad detectada */
  handedness: 'Left' | 'Right';
  /** Distancia normalizadora entre muñeca (landmark 0) y nudillo medio (landmark 9) */
  handScale: number;
  /** Confianza de la detección reportada por el modelo */
  score: number;
}

/** Eventos emitidos por la Máquina de Estados de Gestos */
export type GestureEvent =
  | { type: 'pointer-move'; x: number; y: number }
  | { type: 'click'; at: { x: number; y: number }; button: 'left' }
  | { type: 'drag-start'; at: { x: number; y: number } }
  | { type: 'drag-end'; at: { x: number; y: number } }
  | { type: 'pinch'; amount: number }
  | { type: 'grab'; amount: number }
  | { type: 'clutch'; engaged: boolean }
  | { type: 'master-toggle' }
  | { type: 'hand-lost' };

/** Interfaz del Driver de Cursor del Sistema Operativo */
export interface CursorDriver {
  init(): Promise<void>;
  move(x: number, y: number): void;
  down(button?: 'left' | 'right'): void;
  up(button?: 'left' | 'right'): void;
  click(button?: 'left' | 'right'): void;
  destroy(): void;
}

/**
 * Factoría de Drivers Multiplataforma:
 * - 'win32': WindowsCursorDriver (user32.dll / SendInput vía koffi)
 * - 'darwin': MacCursorDriver (CoreGraphics / CGEventPost vía koffi)
 * - 'linux': LinuxCursorDriver (libX11 / XTest)
 * - 'browser': WebMockCursorDriver (emula eventos en DOM para el Playground)
 */
export function createCursorDriver(): CursorDriver;
```

---

## 4. Modo Live Web Playground (Sandbox en Navegador)

Para permitir que usuarios, alumnos e investigadores de UX prueben la tecnología en vivo desde cualquier sistema operativo (macOS, Linux o Windows) sin necesidad de empaquetado o instalación nativa:

1. **Reutilización del 100% del Núcleo**: El motor de captura (`vision/camera.ts`), la inferencia (`vision/hand-tracker.ts`), el filtro One Euro (`vision/one-euro.ts`) y la FSM (`gestures/fsm.ts`) corren directamente en el navegador.
2. **Cursor Virtual en DOM**: En lugar de inyectar llamadas al sistema operativo, el `WebMockCursorDriver` emite eventos sintéticos (`MouseEvent`, `PointerEvent`) sobre un canvas interactivo con componentes de prueba (botones, tarjetas arrastrables, controles deslizantes).
3. **Despliegue Cero-Fricción**: Compilable como aplicación web estática (SPA con Vite) desplegable en GitHub Pages o Vercel.

---

## 5. Pipeline Matemático y Algorítmico

### 4.1. Filtro One Euro (`one-euro.ts`)
Para erradicar el temblor (jitter) sin introducir retraso perceptible, se implementa el filtro adaptativo One Euro:
- Cuando la mano se mueve lentamente o apunta con precisión, la frecuencia de corte decae hacia `minCutoff` ($f_c \approx 0.8\text{ Hz}$), filtrando drásticamente el ruido de alta frecuencia del sensor.
- Cuando la mano se desplaza con rapidez, la frecuencia de corte escala proporcionalmente a la derivada temporal ponderada por `beta` ($f_c = \text{minCutoff} + \beta \cdot |\dot{x}|$), eliminando el retraso perceptible.

### 4.2. Mapeo de Zona Activa y Calibración
La cámara tiene un aspecto panorámico (16:9 o 4:3), pero obligar al usuario a mover el brazo hasta el borde físico de la cámara causa fatiga severa en hombros y trapecios.
- Se define una **Zona Activa Central** (por defecto, el 60% interior del cuadro de video).
- Se aplica espejo en el eje $X$ para que el movimiento sea intuitivo (mover a la derecha en el espacio mueve el cursor a la derecha de la pantalla).
- Las coordenadas dentro de la zona activa $[X_{min}, X_{max}]$ e $[Y_{min}, Y_{max}]$ se normalizan a $[0..1]$ y se proyectan linealmente a las dimensiones de pantalla `[screenWidth, screenHeight]`.

### 4.3. Detección de Push y Compensación Pre-Click
1. El canal de profundidad $Z$ de cámaras monoculares es susceptible a aberraciones de lente y ruido de inferencia. AFK calcula la **tasa de variación de `handScale`**:
   $$\frac{\Delta \text{handScale}}{\Delta t} = \frac{\text{handScale}_t - \text{handScale}_{t-k}}{\Delta t}$$
2. Si el usuario extiende el índice y aproxima la mano hacia la cámara con una velocidad de escala superior a `push.scaleRate`, la FSM transiciona a `PUSH_ARMED`.
3. Al confirmarse el click, se consulta el **Buffer Circular de Coordenadas**. En lugar de usar la posición del puntero en el instante de máxima extensión (que sufre una desviación hacia abajo y adelante por la inercia biomecánica del empuje), se emite el evento en la posición promedio registrada $150-180\text{ ms}$ antes del inicio del impulso.

---

## 5. Diseño de la Capa de Afordancia (Overlay SVG)

La ventana overlay mantiene una relación isomórfica con las manos del usuario:

```
 Landmark 8 (Punta Índice) ─── Coincide exactamente con el HOTSPOT del Cursor Real
          │
      Falanges SVG (Cápsulas semitransparentes dinámicas)
          │
 Landmark 0 (Muñeca) ────────── Define el origen cinemático local
```

- **Niveles de Detalle**:
  - `L3`: Silueta completa con gradientes y sombras suaves, proporcionando máxima retroalimentación táctil-visual.
  - `L2`: Estructura ósea minimalista con nodos articulares.
  - `L1`: Destello guía únicamente en la yema del dedo de control.
  - `L0`: Completamente transparente.
- **Retroalimentación Reactiva**: Si la FSM pasa de `POINT` a un estado no reconocido o con pérdida de tracking por más de 100 ms, la afordancia se eleva temporalmente a `L3` para que el usuario recupere la orientación visual de su mano de inmediato.
