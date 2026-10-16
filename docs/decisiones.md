# Registro de Decisiones de Arquitectura (ADRs) — AFK

Este documento registra las decisiones arquitectónicas clave, sus justificaciones, alternativas evaluadas y estrategias de mitigación de riesgos para el desarrollo de **AFK**.

---

## ADR-01: Adopción de Electron como Host del POC (vs. Tauri)

### Estado: APROBADO
### Contexto:
El proyecto requiere ejecutar modelos de visión artificial acelerados por GPU (MediaPipe Tasks Vision con WebAssembly y WebGPU), desplegar ventanas transparentes superpuestas sin bordes sobre el escritorio con soporte para *click-through*, y comunicarse con APIs del sistema operativo Windows.

### Decisión:
Construir el POC utilizando **Electron + TypeScript** (gestionado con `electron-vite`).

### Justificación:
1. **Compatibilidad Madura de MediaPipe**: El paquete `@mediapipe/tasks-vision` está optimizado para motores Chromium con soporte completo de WebGL2/WebGPU y `requestVideoFrameCallback`, lo que asegura el mismo comportamiento validado previamente en el POC `3d-cube-parallax`.
2. **Soporte Probado de Click-Through**: Electron ofrece una API madura y probada (`win.setIgnoreMouseEvents(true, { forward: true })`) para ventanas transparentes superpuestas en Windows.
3. **Velocidad de Iteración en el Spike**: Permite separar la visión y el overlay en renderers independientes sin incurrir en la curva de aprendizaje de interoperabilidad Rust/WebKit de Tauri.

### Consecuencias y Plan de Mitigación:
- *Impacto*: Mayor peso del binario (~80-120 MB en disco) y consumo de memoria base (~150-200 MB de RAM).
- *Mitigación*: Tauri queda formalmente registrado como ruta de migración futura si el producto escala y el peso de distribución se vuelve un factor determinante.

---

## ADR-02: Estrategia de Inyección de Mouse Nativo en Windows

### Estado: APROBADO E IMPLEMENTADO (Fase 1)
### Contexto:
Para mover el cursor del sistema y ejecutar clicks sobre el escritorio de Windows, la aplicación necesita interactuar con la API nativa de Windows (User32 / `SendInput` / `SetCursorPos`).

### Alternativas Evaluadas:
1. **`robotjs`**: Obsoleto y con fallos de compilación contra Node ABI de Electron v41.
2. **`@nut-tree/nut-js`**: Mayor sobrecarga de dependencias binarias.
3. **`koffi` (FFI nativo moderno)**:
   - Permite enlazar `user32.dll` (`SetCursorPos` y `mouse_event`) en milisegundos sin requerir compiladores C++ locales.
   - Rendimiento nativo de baja latencia.

### Decisión:
Implementar `WindowsCursorDriver` usando **`koffi`** para enlazar `SetCursorPos` y `mouse_event` de `user32.dll`. La selección del driver se delega a `createCursorDriver()`, que instancia `WindowsCursorDriver` en `win32` y un `NullCursorDriver` seguro en entornos de desarrollo Linux/WSL para prevenir caídas.

---

## ADR-03: Desacoplamiento de la Máquina de Estados (FSM) de Electron

### Estado: APROBADO
### Contexto:
La lógica de interpretación de gestos (reconocer si una mano está apuntando, empujando, en reposo o haciendo pinza) es el componente algorítmico más sensible a bugs y regresiones. Si esta lógica depende de APIs de Electron, del DOM o de la cámara en vivo, las pruebas automatizadas se vuelven lentas o imposibles de ejecutar sin intervención humana.

### Decisión:
Construir `src/gestures/` como un módulo TypeScript **completamente puro**:
- No importa módulos de Electron, `window`, `document` ni APIs nativas.
- Solo consume estructuras `HandFrame` (21 puntos normalizados, lateralidad y timestamp) y emite estructuras `GestureEvent`.

### Consecuencias Positivas:
- **Testabilidad Determinista**: Permite alimentar la FSM con grabaciones estáticas en JSON (`recordings/*.json`) y verificar el 100% de las transiciones de estado en milisegundos usando **Vitest**.
- **Ajuste de Umbrales sin Cámara**: Facilita calibrar `push.scaleRate` o la histéresis de `pinch` sobre datasets grabados de movimientos difíciles.

---

## ADR-04: Prevención de Throttling en la Ventana de Visión Oculta

### Estado: APROBADO
### Contexto:
Por diseño, Chromium (y por extensión Electron) reduce drásticamente la tasa de refresco (`requestAnimationFrame` o temporizadores) de las ventanas que se encuentran en segundo plano, ocultas o minimizadas para ahorrar batería y recursos. Si esto ocurre, la tasa de fotogramas de la cámara caería de 30-60 FPS a < 1 FPS, paralizando el control del cursor.

### Decisión:
Configurar la ventana de visión oculta (`visionWindow`) con la propiedad explícita:
```typescript
webPreferences: {
  backgroundThrottling: false,
  nodeIntegration: false,
  contextIsolation: true
}
```

### Justificación:
Garantiza que el bucle de captura de video y la inferencia de MediaPipe continúen ejecutándose al máximo rendimiento en tiempo real incluso cuando el usuario interactúe con aplicaciones en pantalla completa o ventanas externas en Windows.

---

## ADR-05: Detección de Push mediante Derivada de Escala vs. Eje Z

### Estado: APROBADO
### Contexto:
El modelo monocular de MediaPipe estima coordenadas $X, Y, Z$, pero la coordenada $Z$ (profundidad relativa a la muñeca) es ruidosa y propensa a artefactos cuando la mano rota sutilmente. Confiar directamente en $Z$ para detectar el "click por empuje" genera falsos positivos y pulsaciones involuntarias.

### Decisión:
Calcular `handScale` como la distancia euclidiana 2D/3D entre la muñeca (landmark 0) y el nudillo medio (landmark 9). La detección del empuje se basa en la **tasa de crecimiento acelerado de `handScale`** combinada con la restricción postural (dedo índice extendido, restantes tres dedos flexionados).

---

## ADR-06: Mitigación de Riesgos y Limitaciones del Sistema Operativo

| Riesgo Técnico Identificado | Nivel de Impacto | Estrategia de Mitigación / Comportamiento Esperado |
|---|---|---|
| **Ventanas Elevadas (UAC / Admin)** | Medio | Windows impide por diseño de seguridad que un proceso con privilegios normales inyecte eventos de entrada a ventanas elevadas (como Administrador de Tareas o CMD como Admin). **Mitigación**: Documentar que para controlar ventanas elevadas, AFK debe ejecutarse con privilegios de Administrador. |
| **Juegos en Pantalla Completa Exclusiva** | Bajo | Los juegos con renderizado exclusivo de DirectX/Vulkan ocultan capas de ventanas GDI/DWM. **Mitigación**: AFK está concebido para uso de escritorio y productividad general; se recomienda modo "Ventana sin bordes" en juegos. |
| **Fatiga Muscular del Brazo (Gorilla Arm)** | Alto | Mantener el brazo extendido fatiga al usuario rápidamente. **Mitigación**: <br>1. **Zona Activa Reducida (~60%)**: Rango de movimiento corto sin estirar el brazo.<br>2. **Modo Clutch**: Permite soltar el control y descansar la mano con solo abrir la palma. |
| **Deriva del Cursor al Disparar Click** | Alto | El impulso físico de empujar desplaza el dedo. **Mitigación**: Buffer circular pre-click de 150-200 ms que fija la coordenada previa al empuje. |
| **Privacidad de la Cámara** | Crítico | Temor del usuario a ser grabado. **Mitigación**: Inferencia 100% local, cero conectividad a internet, e indicador visual claro en el System Tray cuando la cámara está activa. |

---

## ADR-07: Andamiaje de Fase 0 (Spike) y Evaluación de Inyección Nativa

### Estado: IMPLEMENTADO (Fase 0)
### Contexto:
Se completó el andamiaje del proyecto según la sección 5 del documento maestro, implementando la ventana de visión oculta con MediaPipe y One Euro, la ventana overlay transparente click-through, el System Tray, el atajo global y la suite de pruebas unitarias.

### Hallazgos de Librería de Mouse Nativa:
1. Con Electron v41 (versión instalada de Node v20/v22 ABI), `robotjs` presenta fallos de compilación con las herramientas nativas modernas debido a la falta de mantenimiento de sus bindings C++ antiguos.
2. La alternativa más sólida, limpia y sin fricción de compilación C++ nativa para inyectar `SendInput` en Windows es **`koffi`** (FFI moderno de alto rendimiento) o un script ligero de PowerShell/Win32 `user32.dll:SetCursorPos`.
3. Para la Fase 0 se implementó `NullCursorDriver` para garantizar la seguridad del sistema y el desacoplamiento estricto. La elección de la librería final para la Fase 1 será acordada con el usuario.

---

## ADR-08: Estrategia Multiplataforma Progresiva y Live Web Sandbox

### Estado: APROBADO
### Contexto:
El público objetivo del producto incluye usuarios, diseñadores y estudiantes habituados a macOS (especialmente en entornos de investigación de UX/XR), mientras que el desarrollador opera en Windows con WSL. Además, existe la necesidad de validar y compartir el comportamiento gestual sin requerir que los usuarios instalen dependencias nativas o permisos elevados en sus computadoras.

### Decisión:
1. **Priorización Escalonada de Plataformas**:
   - **Fase POC (Inmediata)**: Windows nativo (`user32.dll` vía `koffi`).
   - **Fase Post-POC (Mediano Plazo)**: macOS nativo (`CoreGraphics` / `CGEventPost` vía `koffi`). Como el desarrollador no dispone de hardware Apple físico, la compilación y pruebas de empaquetado (`.dmg`) se automatizarán en GitHub Actions (`macos-latest`).
   - **Largo Plazo**: Linux (`XTest` / Wayland).
2. **Live Web Sandbox / Playground**:
   - Construir una variante SPA en navegador que reutilice los módulos puros de visión (`src/vision/`) y gestos (`src/gestures/`).
   - El sandbox emula la inyección de cursor sobre un canvas con componentes interactivos (botones, sliders, tarjetas de arrastre), permitiendo pruebas instantáneas en cualquier dispositivo (incluidos Mac) simplemente abriendo una URL.
3. **Factoría de Drivers (`createCursorDriver`)**:
   - Desacoplar la inicialización mediante detección de `process.platform` (`win32`, `darwin`, `linux`, `browser`), garantizando que el código no falle ni genere errores de compilación cruzada.

