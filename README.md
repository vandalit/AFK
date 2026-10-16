# AFK — Hand-Gesture Desktop Controller & Vectorial Affordance Layer

> **Control del mouse del sistema operativo mediante visión artificial y una capa transparente de "segundas manos" sobre el escritorio de Windows.*[![Status](https://img.shields.io/badge/Status-Fase%204%20Completada%20%7C%20Pausa%20de%20Calibraci%C3%B3n-blueviolet.svg)](#)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11%20Native%20%26%20Web%20Sandbox-0078D6.svg)](#)
[![Stack](https://img.shields.io/badge/Stack-Electron%20%7C%20TypeScript%20%7C%20MediaPipe%20%7C%20OneEuro-success.svg)](#)

---

## 👁️ ¿Qué es AFK?

**AFK** es una interfaz gestual de escritorio que transforma cualquier webcam convencional en un sistema de control de puntero de precisión para Windows, eliminando la necesidad de periféricos físicos.

A diferencia de los experimentos tradicionales de "mouse con cámara" que se sienten torpes o fatigan al usuario, AFK introduce innovaciones clave:

1. **Capa Vectorial de Afordancia ("Segundas Manos")**: Una ventana overlay de escritorio completamente transparente, sin marcos y click-through (`setIgnoreMouseEvents(true)`), que proyecta una representación gráfica de la mano del usuario alineada milimétricamente con el puntero. Esto genera un **modelo mental inmediato** de control espacial.
2. **Plano Ergonómico al Pecho (Chin-Pinned Chest Plane)**: Mapeo espacial anclado dinámicamente bajo el mentón del usuario detectado por FaceDetector. El espacio interactivo cubre la amplitud de los hombros y desciende de forma proporcional al Aspect Ratio de la pantalla (16:9), permitiendo controlar el cursor barriendo cómodamente a la altura del pecho sin levantar el brazo ni tapar el rostro.
3. **Zonas de Seguridad Broadcast & Feedback Óptico**: Guías visuales de producción de video (*Action Safe 93%*, *Title Safe 90%*, avisos de proximidad a límites de sensor y visualización en tiempo real de la mano en el PiP sin recortes) para garantizar máxima certidumbre espacial.
4. **Desvanecimiento Progresivo (Affordance Fade)**: A medida que el usuario gana destreza y memoria muscular, la representación visual muta sutilmente (`L3: Mano completa` → `L2: Esqueleto` → `L1: Puntas de dedos` → `L0: Cursor puro`).

---

## 🧠 Arquitectura de un Vistazo

El sistema está concebido bajo una separación estricta de responsabilidades en tres capas desacopladas:

```
                  ┌───────────────────────────────┐
                  │      CÁMARA LOCAL (Webcam)     │
                  └──────────────┬────────────────┘
                                 │ Frame video
                                 ▼
                  ┌───────────────────────────────┐
                  │    VENTANA OCULTA (Vision)    │
                  │  MediaPipe HandLandmarker GPU │
                  │  + FaceDetector (Mentón-Pin)  │
                  │     + Filtro One Euro         │
                  └──────────────┬────────────────┘
                                 │ HandFrame (21 landmarks filtrados)
                                 ▼
                  ┌───────────────────────────────┐
                  │     FSM DE GESTOS (Pura)      │
                  │    State Machine desacoplada  │
                  └──────────────┬────────────────┘
                                 │ GestureEvent (push, click, pinch-drag, clutch...)
                   ┌─────────────┴─────────────┐
                   ▼                           ▼
        ┌─────────────────────┐     ┌───────────────────────┐
        │  MAIN PROCESS (OS)  │     │  OVERLAY TRANSPARENTE │
        │ Driver Cursor Nativo│     │  Renderer Vectorial   │
        │ Inyección al SO     │     │  SVG / Segundas Manos │
        │ Tray + Global Hotkey│     │  Safe Zones Broadcast │
        └─────────────────────┘     └───────────────────────┘
```

---

## ⚡ Algoritmos Clave

- **Filtro One Euro Adaptativo**: Suprime el temblor (jitter) inherente al tracking óptico en reposo manteniendo una latencia ultra-baja en desplazamientos rápidos.
- **Plano Fidedigno al Pecho (Chin-Pinned)**: Proyección isotrópica 1:1 proporcional al aspecto de pantalla que evita tener que descender la mano al borde inferior de la cámara (donde se pierde el tracking) para alcanzar el fondo del monitor.
- **Detección de Push por Derivada de Escala (`handScale`)**: En lugar de confiar en el eje $Z$ monocular ruidoso, se mide la tasa de crecimiento de la distancia muñeca-nudillo medio en conjunción con la postura de dedo índice extendido.
- **Buffer Circular Pre-Click (~180 ms)**: Congela las coordenadas del puntero justo antes del impulso del dedo, garantizando clicks limpios sobre objetivos pequeños.
- **Gesto de Arrastre (Pinch / Drag)**: Detección euclidiana con histéresis estricta (`0.15 enter` / `0.22 exit`) para manipulación fluida de ventanas y widgets.
- **Modo Clutch (Palma Abierta)**: Congela instantáneamente la transmisión del mouse para descansar el brazo o reubicar la mano en el campo de visión.

---

## 📂 Estructura del Repositorio

```
AFK/
├── README.md                      # Presentación general y guía rápida
├── docs/                          # Documentación formal completa
│   ├── PRD.md                     # Product Requirements Document
│   ├── arquitectura.md            # Arquitectura multi-proceso, IPC y contratos
│   ├── hoja-de-ruta.md            # Roadmap de 6 fases y criterios de aceptación
│   └── decisiones.md              # Log de Decisiones Arquitectónicas (ADRs)
├── package.json                   # Configuración del proyecto y scripts
├── tsconfig.json                  # Configuración de TypeScript
├── electron.vite.config.ts        # Bundler optimizado para Electron
├── vite.sandbox.config.ts         # Bundler dedicado para Live Web Sandbox
├── src/
│   ├── main/                      # Ciclo de vida, ventanas, Tray, Driver nativo
│   │   ├── index.ts
│   │   ├── tray.ts
│   │   ├── shortcuts.ts
│   │   ├── windows.ts
│   │   └── cursor-driver.ts
│   ├── vision/                    # Captura de video y tracking MediaPipe
│   │   ├── index.html
│   │   ├── camera.ts
│   │   ├── hand-tracker.ts
│   │   └── one-euro.ts
│   ├── gestures/                  # Motor de gestos puro (agnóstico de Electron)
│   │   ├── fsm.ts
│   │   ├── features.ts
│   │   ├── chest-plane.ts         # Plano Ergonómico al Pecho & Safe Zones
│   │   ├── calibration.ts
│   │   └── types.ts
│   ├── overlay/                   # Ventana transparente de afordancia
│   │   ├── index.html
│   │   ├── hand-renderer.ts
│   │   ├── affordance-fade.ts
│   │   └── hand-skeleton.svg
│   ├── sandbox/                   # Entorno de pruebas interactivas en navegador
│   │   ├── index.html
│   │   ├── sandbox.css
│   │   └── sandbox.ts
│   └── shared/                    # Tipos compartidos, canales IPC y configuración
├── tests/                         # Suites de pruebas con Vitest (41 tests pasan)
│   ├── fsm.test.ts
│   ├── fsm-gestures.test.ts
│   ├── chest-plane.test.ts
│   ├── one-euro.test.ts
│   ├── cursor-driver.test.ts
│   └── calibration.test.ts
```

---

## 🗺️ Estado Actual del Proyecto y Hoja de Ruta

| Fase | Hito | Entregable Clave | Estado |
|:---:|:---|:---|:---:|
| **0** | **Spike Arquitectónico** | Ventana oculta (MediaPipe) + Overlay transparente | **Completada** |
| **1** | **Cursor y Navegación** | One Euro + Zona Activa + Driver OS + Tray/Hotkey | **Completada** |
| **2** | **Capa Vectorial (Afordancia)**| Manos SVG alineadas con cursor + Fades L0-L3 | **Completada** |
| **3** | **Click & Clutch** | Push detector + Buffer 180ms + Clutch de reposo | **Completada** |
| **4** | **Manipulación & Web Sandbox** | Pinch/Drag + Live Web Sandbox + Plano al Pecho + Broadcast Safe Zones | **Completada** |
| **5** | **Pulido y Multi-monitor** | Fade por familiaridad + Adaptación Multi-DPI + Grabaciones | **En Pausa / Backlog** |

> **Nota de Estado / Checkpoint de Calibración:**
> Las fases 0 a 4 se encuentran implementadas, testeadas con 41 tests unitarios automáticos y verificables en tiempo real mediante el **Live Web Sandbox** (`npm run sandbox`). 
> Con la incorporación del modelo de **Plano Ergonómico al Pecho (Chin-Pinned)** y la visualización de **Zonas de Seguridad estilo Broadcast**, se mitigó la fatiga de interacción y la desalineación de límites de percepción. 
> El proyecto queda pausado en este hito estable y funcional para evaluación de usuario previo a abordar la Fase 5.

---

## 🔒 Privacidad y Seguridad

- **100% On-Device**: La captura de cámara se procesa de forma estrictamente local mediante modelos WASM/GPU de MediaPipe Tasks Vision. Ningún frame de imagen o video es transmitido, almacenado o expuesto a la red.
- **Feedback Activo**: Indicador visible inmediato en la interfaz cuando la cámara está activa.
- **Kill-Switch de Emergencia**: Atajo global (`globalShortcut`) siempre disponible para desactivar de inmediato la inyección del cursor si se pierde el control.

---

## 📚 Documentación Detallada

- 👉 [Product Requirements Document (PRD)](docs/PRD.md)
- 👉 [Especificación de Arquitectura](docs/arquitectura.md)
- 👉 [Hoja de Ruta y Criterios de Aceptación](docs/hoja-de-ruta.md)
- 👉 [Registro de Decisiones Arquitectónicas (ADRs)](docs/decisiones.md)

