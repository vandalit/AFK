# AFK — Hand-Gesture Desktop Controller & Vectorial Affordance Layer

> **Control del mouse del sistema operativo mediante visión artificial y una capa transparente de "segundas manos" sobre el escritorio de Windows.**

[![Status](https://img.shields.io/badge/Status-POC%20Architecture%20%26%20Design-blue.svg)](#)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11%20Native-0078D6.svg)](#)
[![Stack](https://img.shields.io/badge/Stack-Electron%20%7C%20TypeScript%20%7C%20MediaPipe%20%7C%20OneEuro-success.svg)](#)

---

## 👁️ ¿Qué es AFK?

**AFK** es una interfaz gestual de escritorio que transforma cualquier webcam convencional en un sistema de control de puntero de precisión para Windows, eliminando la necesidad de periféricos físicos.

A diferencia de los experimentos tradicionales de "mouse con cámara" que se sienten torpes o fatigan al usuario, AFK introduce dos innovaciones clave:

1. **Capa Vectorial de Afordancia ("Segundas Manos")**: Una ventana overlay de escritorio completamente transparente, sin marcos y click-through (`setIgnoreMouseEvents(true)`), que proyecta una representación gráfica de la mano del usuario alineada milimétricamente con el puntero. Esto genera un **modelo mental inmediato** de control espacial.
2. **Desvanecimiento Progresivo (Affordance Fade)**: A medida que el usuario gana destreza y memoria muscular, la representación visual muta sutilmente (`L3: Mano completa` → `L2: Esqueleto` → `L1: Puntas de dedos` → `L0: Cursor puro`), reapareciendo de forma reactiva si el sistema detecta ambigüedad en el gesto.

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
                  │     + Filtro One Euro         │
                  └──────────────┬────────────────┘
                                 │ HandFrame (21 landmarks filtrados)
                                 ▼
                  ┌───────────────────────────────┐
                  │     FSM DE GESTOS (Pura)      │
                  │    State Machine desacoplada  │
                  └──────────────┬────────────────┘
                                 │ GestureEvent (push, click, drag, clutch...)
                   ┌─────────────┴─────────────┐
                   ▼                           ▼
        ┌─────────────────────┐     ┌───────────────────────┐
        │  MAIN PROCESS (OS)  │     │  OVERLAY TRANSPARENTE │
        │ Driver Cursor Nativo│     │  Renderer Vectorial   │
        │ Inyección al SO     │     │  SVG / Segundas Manos │
        │ Tray + Global Hotkey│     │  Click-through total  │
        └─────────────────────┘     └───────────────────────┘
```

---

## ⚡ Algoritmos Clave

- **Filtro One Euro Adaptativo**: Suprime el temblor (jitter) inherente al tracking óptico en reposo manteniendo una latencia ultra-baja en desplazamientos rápidos.
- **Zona Activa Cuadrada (~60% central)**: Mapea el rango de movimiento ergonómico de la mano a toda la resolución de pantalla con inversión de eje X. Permite alcanzar los 4 extremos de la pantalla sin fatigar el brazo.
- **Detección de Push por Derivada de Escala (`handScale`)**: En lugar de confiar en el eje $Z$ monocular ruidoso, se mide la tasa de crecimiento de la distancia muñeca-nudillo medio en conjunción con la postura de dedo índice extendido.
- **Buffer Circular Pre-Click (~150-200 ms)**: Congela o recupera las coordenadas del puntero justo antes del impulso del dedo, garantizando clicks limpios de precisión sobre objetivos de hasta ~40 px sin arrastres accidentales.
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
│   │   ├── calibration.ts
│   │   └── types.ts
│   ├── overlay/                   # Ventana transparente de afordancia
│   │   ├── index.html
│   │   ├── hand-renderer.ts
│   │   ├── affordance-fade.ts
│   │   └── hand-skeleton.svg
│   └── shared/                    # Tipos compartidos, canales IPC y configuración
│       ├── events.ts
│       ├── config.ts
│       └── ipc-channels.ts
├── recordings/                    # Datasets de landmarks en JSON para tests
└── tests/                         # Suites de pruebas con Vitest
    ├── fsm.test.ts
    ├── one-euro.test.ts
    └── push-detector.test.ts
```

---

## 🗺️ Hoja de Ruta Resumida

| Fase | Hito | Entregable Clave | Criterio de Éxito |
|:---:|:---|:---|:---|
| **0** | **Spike Arquitectónico** | Ventana oculta (MediaPipe) + Overlay transparente | Círculo sigue el índice con latencia aceptable; click-through funcional |
| **1** | **Cursor y Navegación** | One Euro + Zona Activa + Driver OS + Tray/Hotkey | Puntero alcanza toda la pantalla con suavidad; desactivación por atajo |
| **2** | **Capa Vectorial (Afordancia)**| Manos SVG alineadas con cursor + Fades L0-L3 | Hotspot del cursor coincide con la punta del índice gráfico |
| **3** | **Click & Clutch** | Push detector + Buffer 150ms + Clutch de reposo | Acierto consistente en blancos de 40 px sin deriva por clic |
| **4** | **Manipulación Completa** | Pinch/Drag + Grab + Menú de calibración en vivo | Arrastre fluido de ventanas y ajuste de parámetros en tiempo real |
| **5** | **Pulido y Resiliencia** | Fade por familiaridad + Multi-monitor / DPI | Experiencia libre de fricción y preparada para uso prolongado |

---

## 🔒 Privacidad y Seguridad

- **100% On-Device**: La captura de cámara se procesa de forma estrictamente local mediante modelos WASM/GPU de MediaPipe Tasks Vision. Ningún frame de imagen o video es transmitido, almacenado o expuesto a la red.
- **Feedback Activo**: Indicador visible inmediato en la bandeja del sistema cuando la cámara está activa.
- **Kill-Switch de Emergencia**: Atajo global (`globalShortcut`) siempre disponible para desactivar de inmediato la inyección del cursor si se pierde el control.

---

## 📚 Documentación Detallada

- 👉 [Product Requirements Document (PRD)](docs/PRD.md)
- 👉 [Especificación de Arquitectura](docs/arquitectura.md)
- 👉 [Hoja de Ruta y Criterios de Aceptación](docs/hoja-de-ruta.md)
- 👉 [Registro de Decisiones Arquitectónicas (ADRs)](docs/decisiones.md)
