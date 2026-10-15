# Product Requirements Document (PRD) — AFK

**Nombre del Proyecto**: AFK (Away From Keyboard / Adaptive FleX Kinetic)  
**Versión**: 1.0.0-POC  
**Estado**: Especificación Aprobada para Implementación  
**Autor / Equipo**: METAMEDIA & Vandalit  
**Plataforma Objetivo**: Windows 10 / Windows 11 (Arquitectura x64, ejecución nativa)

---

## 1. Resumen Ejecutivo y Visión del Producto

AFK es una solución de interacción persona-ordenador (HCI) sin contacto que permite el control fluido, preciso y no invasivo del cursor del sistema operativo Windows mediante visión artificial y gestos naturales de la mano capturados por una cámara web estándar.

A diferencia de intentos previos en la industria, AFK resuelve las dos barreras clásicas de adopción de las interfaces gestuales:
1. **La falta de afordancia y propiocepción digital**: Proporcionando una **capa vectorial transparente ("segundas manos")** sobre el escritorio que proyecta el modelo cinemático de la mano en tiempo real, alineado exactamente con el puntero.
2. **La fatiga muscular y la inestabilidad del click (el "efecto Midas" y el jitter)**: Mediante algoritmos avanzados como el **filtro adaptativo One Euro**, una **zona activa ergonómica recortada**, un **detector de empuje (push) con buffer circular compensador de posición** y una postura de reposo activa (**clutch**).

El resultado es un sistema que no requiere hardware propietario ni cascos de realidad virtual, que vive discretamente en la bandeja del sistema y que se desvanece visualmente a medida que el usuario adquiere maestría operativa.

---

## 2. Objetivos de Negocio y de Experiencia (UX)

### 2.1. Objetivos Primarios (POC)
- **Validación del Pipeline**: Demostrar un flujo continuo y en tiempo real:  
  `Cámara (>=30 fps) ➔ MediaPipe HandLandmarker ➔ Filtro One Euro ➔ FSM de Gestos ➔ (Driver de Cursor SO + Renderer Vectorial Overlay)`.
- **Sensación de Control y Confianza**: Lograr que un usuario novato entienda inmediatamente la relación espacial mano-pantalla gracias a la capa de afordancia vectorial.
- **Precisión Operativa**: Permitir la navegación de escritorio y el acierto de clicks sobre botones e iconos estándar (objetivos de ~40 px) en más del 85% de los intentos en la primera sesión.
- **Rendimiento y No-Invasividad**: Mantener un consumo moderado de CPU/GPU en Windows, garantizando que el overlay transparente sea 100% click-through (nunca robe el foco del mouse ni bloquee la interacción normal).

### 2.2. Métricas de Éxito Cuantitativas
| Métrica | Meta POC | Meta V1.0 |
|---|---|---|
| Latencia de seguimiento (vid-to-cursor) | $\le 45\text{ ms}$ | $\le 25\text{ ms}$ |
| Tasa de acierto de click (blancos de 40px) | $\ge 85\%$ | $\ge 95\%$ |
| Tasa de falsos positivos en reposo (clicks fantasmas) | $< 1\text{ por cada 10 min}$ | $< 1\text{ por hora}$ |
| Consumo de CPU promedio (Intel i5/Ryzen 5) | $\le 12\%$ | $\le 6\%$ |
| Cero interrupciones de foco en ventanas del SO | $100\%$ | $100\%$ |

---

## 3. Público Objetivo y Casos de Uso

1. **Productividad y Presentaciones**:
   - Usuarios que dan charlas, videollamadas o presentaciones donde necesitan interactuar con diapositivas o interfaces a distancia sin acercarse al teclado/mouse.
2. **Entornos Asépticos / Sin Contacto**:
   - Cocina, talleres mecánicos, consultas médicas o laboratorios donde tocar periféricos físicos ensucia o compromete la higiene.
3. **Ergonomía y Descanso de Túnel Carpiano**:
   - Usuarios que sufren de lesiones por esfuerzo repetitivo (RSI) y necesitan alternar periódicamente entre el mouse convencional y el control por gestos en el aire.
4. **Control Multimedia Remoto (Couch Mode)**:
   - Control de reproducción, navegación web y volumen en PC conectada al televisor desde el sofá o la cama.

---

## 4. Alcance del Proyecto

### 4.1. Dentro del Alcance (POC)
- **Operación monomanual** (detección preferente de mano derecha o izquierda según `handedness`).
- **Resolución de pantalla única** (Windows 10/11 x64).
- **Gesto de apuntado (Point)**: El dedo índice extendido (resto recogido) proyecta el cursor a la pantalla con mapeo espacial.
- **Gesto de click (Push)**: Avance rápido de la mano hacia la cámara con índice extendido, compensado mediante buffer circular de coordenadas previas (~150-200 ms).
- **Gesto de embrague / pausa (Clutch)**: Palma abierta extendida congela inmediatamente la inyección de cursor para reposo o reposicionamiento sin alterar la posición en pantalla.
- **Capa Vectorial de Afordancia (Overlay)**: Ventana transparente frameless, always-on-top, click-through, que dibuja la mano SVG en 4 niveles de visibilidad (`L0` a `L3`) ajustables manualmente.
- **Integración de Sistema**: Icono en bandeja de sistema (System Tray) con menú contextual y atajo global de teclado (`globalShortcut`) para activación/desactivación instantánea.
- **Panel de Calibración / Debug**: Interfaz con sliders para ajustar en vivo todos los umbrales algorítmicos.

### 4.2. Fuera del Alcance (Post-POC / Futuro)
- Soporte para configuraciones multimonitor con factores de escalado DPI mixtos.
- Soporte para Linux y macOS (el POC se enfoca exclusivamente en Windows nativo por drivers de mouse e IPC).
- Interacción con juegos en pantalla completa exclusiva que tomen control directo de DirectX/Vulkan y tapen ventanas GDI/Electron.
- Ventanas con privilegios elevados de Administrador (UAC), salvo que AFK se ejecute explícitamente con elevación de permisos.
- Control bimanual simultáneo (ej. una mano apunta y la otra hace zoom/scroll).
- Algoritmo automatizado de aprendizaje para desvanecimiento de afordancia (en el POC se gobierna manualmente desde el panel).

---

## 5. Requisitos Funcionales Detallados

### 5.1. Módulo de Captura y Tracking Óptico (Vision Window)
- **RF-01**: Debe inicializar la cámara web predeterminada a un mínimo de 30 FPS con resolución configurable (ideal 720p o 1080p).
- **RF-02**: Debe cargar localmente el modelo `HandLandmarker` de MediaPipe Tasks Vision (`hand_landmarker.task`), sin requerir conexión a internet ni enviar fotogramas fuera del equipo.
- **RF-03**: La ventana de visión debe ejecutarse en segundo plano (oculta o minimizada) con `backgroundThrottling: false` en Electron para prevenir caídas de framerate cuando otra ventana tenga el foco.
- **RF-04**: Debe aplicar el filtro One Euro a los 21 puntos clave (landmarks 3D) en cada frame antes de enviarlos a la máquina de estados.
- **RF-05**: Debe calcular `handScale` como la distancia euclidiana entre la muñeca (landmark 0) y el nudillo del dedo medio (landmark 9), usándolo como métrica de normalización invariante a la distancia del usuario.

### 5.2. Máquina de Estados Finita (FSM) de Gestos
- **RF-06**: La FSM debe ser un módulo puro en TypeScript, sin acoplamiento a Electron ni dependencias del DOM, consumiendo estructuras `HandFrame` y emitiendo `GestureEvent`.
- **RF-07 (Estado IDLE)**: Estado por defecto cuando la mano está fuera del encuadre o no cumple ninguna postura de control.
- **RF-08 (Estado POINT)**: Se activa al detectar el dedo índice extendido y los dedos medio, anular y meñique flexionados. Emite eventos `pointer-move` con coordenadas normalizadas.
- **RF-09 (Estado PUSH_ARMED & CLICK)**: Si en estado POINT la derivada positiva de `handScale` supera el umbral `push.scaleRate`, se arma el push. Si se confirma el recorrido, emite un evento `click` en las coordenadas registradas $N$ ms antes (buffer circular).
- **RF-10 (Estado CLUTCH)**: Al detectar palma completamente abierta (los 5 dedos extendidos y separados) durante `clutch.dwellMs` (~500 ms), el sistema congela la emisión de eventos de movimiento de mouse hasta que la postura cambie.
- **RF-11 (Estado DRAG / PINCH)**: Al cerrar el pellizco entre pulgar e índice por debajo del umbral de entrada `pinch.enter`, emite `drag-start` con botón izquierdo presionado hasta que la distancia supere `pinch.exit`.
- **RF-12 (Hand Lost)**: Si transcurren más de `N` ms (default: 300 ms) sin detección de mano, la FSM transiciona a IDLE y emite `hand-lost`.

### 5.3. Capa Vectorial de Afordancia (Overlay Window)
- **RF-13**: Debe instanciar una ventana BrowserWindow de Electron transparente (`transparent: true`), sin bordes (`frame: false`), siempre encima (`alwaysOnTop: true`), que ocupe el tamaño de la pantalla activa.
- **RF-14**: Debe llamar a `setIgnoreMouseEvents(true, { forward: true })` para garantizar que todos los clicks físicos o simulados traspasen la ventana hacia el escritorio y las aplicaciones subyacentes.
- **RF-15**: Debe dibujar en tiempo real un SVG/Canvas de la mano con las articulaciones y falanges interconectadas, cuya punta del dedo índice coincida **exactamente** con la coordenada del puntero del ratón del sistema operativo.
- **RF-16 (Niveles de Afordancia)**:
  - **L3 (Mano Completa)**: Relleno semitransparente, sombras, articulaciones y feedback dinámico de estado (cambio de color o halo al armar click).
  - **L2 (Esqueleto)**: Líneas cinemáticas entre los 21 landmarks y puntos en nudillos.
  - **L1 (Puntas de Dedos)**: Círculos guía únicamente en las yemas de los dedos.
  - **L0 (Solo Cursor)**: El overlay permanece invisible; solo se ve el cursor estándar del SO.

### 5.4. Inyección de Eventos del Sistema (Driver de Cursor)
- **RF-17**: Debe comunicarse con el sistema operativo para mover el cursor y simular pulsaciones de botones (MouseDown, MouseUp, Click).
- **RF-18**: La implementación debe aislarse tras una interfaz TypeScript clara (`CursorDriver`) para facilitar el cambio entre librerías (ej. `robotjs`, `nut.js`) o llamadas nativas a la API Win32 `SendInput`.

### 5.5. Control de Usuario y Sistema
- **RF-19**: Debe incorporar un icono en la bandeja del sistema con opciones para Activar/Desactivar, Abrir Calibrador y Salir.
- **RF-20**: Debe registrar un atajo global de teclado (ej. `Ctrl+Alt+Space` o `F10`) para pausar/reanudar el control al instante en caso de descalibración.

---

## 6. Requisitos No Funcionales (NFR)

- **RNF-01 (Latencia)**: El tiempo total desde la captura del fotograma en la cámara hasta la actualización visual en el overlay no debe exceder los 33 ms (equivalente a 1 frame a 30 FPS).
- **RNF-02 (Estabilidad y Jitter)**: El cursor debe permanecer completamente quieto al mantener el dedo estático en el aire, gracias al parámetro de corte estático del filtro One Euro (`minCutoff`).
- **RNF-03 (Privacidad)**: No se almacenan imágenes en disco ni se realiza ninguna llamada de red para el tracking. Toda la inferencia es local y en memoria.
- **RNF-04 (Mantenibilidad)**: Desacoplamiento total del núcleo matemático y FSM de cualquier dependencia de Electron o navegadores, permitiendo la ejecución de pruebas unitarias masivas en milisegundos mediante Vitest.

---

## 7. Mapeo de Parámetros Algorítmicos

| Parámetro | Tipo | Rango Típico | Valor por Defecto | Propósito |
|---|---|---|---|---|
| `oneEuro.minCutoff` | `number` | $0.1 - 2.0$ | $0.8$ | Frecuencia de corte mínima; elimina temblor a bajas velocidades. |
| `oneEuro.beta` | `number` | $0.001 - 0.1$ | $0.015$ | Coeficiente de velocidad; reduce la latencia en movimientos bruscos. |
| `activeZone.ratioX` | `number` | $0.4 - 0.8$ | $0.6$ | Ancho de la zona activa central de la cámara. |
| `activeZone.ratioY` | `number` | $0.4 - 0.8$ | $0.6$ | Alto de la zona activa central de la cámara. |
| `push.scaleRate` | `number` | $0.15 - 0.6$ | $0.25$ | Umbral de aceleración de escala de la mano para disparar click. |
| `push.bufferMs` | `number` | $100 - 300\text{ ms}$ | $180\text{ ms}$ | Ventana temporal histórica del cursor usada para fijar el click. |
| `clutch.dwellMs` | `number` | $300 - 800\text{ ms}$ | $500\text{ ms}$ | Tiempo de sostenimiento de palma abierta para pausar. |
| `affordance.level` | `enum` | `L0, L1, L2, L3` | `L3` | Nivel gráfico inicial de la capa de manos. |
