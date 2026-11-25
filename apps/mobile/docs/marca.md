# Guía visual móvil

Fuente visual: frontend activo en `apps/frontend`, su `tailwind.config.js`, pantallas Login/Register y logotipo `src/assets/GreenAlert - logo principal.png`. No se reutiliza la copia histórica `apps/backend/Frontend` ni componentes dependientes del DOM.

| Elemento | Aplicación nativa |
| --- | --- |
| Marca | Logotipo original, relación de aspecto conservada en pantallas; texto GreenAlert |
| Verde principal | `#22c55e`; texto sobre él `#052e16` |
| Fondo | `#030712` |
| Superficie | `#111827` |
| Borde | `#374151` |
| Texto | `#f0fdf4` |
| Texto secundario | `#9ca3af` |
| Error | `#fca5a5`, siempre acompañado de texto |
| Tipografía | Inter regular y negrita, empaquetadas en la aplicación; licencia OFL en dependencia |
| Escala | Título 28, sección 20, cuerpo/entrada 16, secundario 14; escalado del sistema activado |
| Espaciado | Base 4; separaciones 8/16; contenido 20; tarjetas 18 |
| Forma | Tarjetas radio 18; botones y entradas radio 12; borde 1 |
| Interacción | Controles mínimo 48 de alto; opacidad al pulsar y al deshabilitar; carga ActivityIndicator |
| Selección | Marca textual ✓/● además del color; sin dependencia de fuentes de iconos externas |

Componentes reutilizables: `Page`, `Button`, `Field`, `Notice`, `Choices`, `Loading` y tarjetas. Etiquetas accesibles para entradas/botones/imágenes, errores con región de anuncio, scroll con teclado y áreas seguras. La navegación inferior permite desplazamiento horizontal y el botón físico de regreso vuelve del detalle a la lista y de una sección a inicio.

Comparación de la misma tarea: en web, React Router abre NewReport/FormularioReporte y usa controles DOM, selector de ubicación/archivos; en Android, Inicio → Crear presenta TextInput/Pressable y usa permisos reales de GPS, cámara y selector del sistema. Ambos envían los mismos nombres multipart y llegan a reportes propios tras confirmar alta. En móvil se muestra una confirmación previa a navegar para no perder la percepción del resultado.

Las pruebas de componentes comprueban estados y navegación. No hay capturas de dispositivo ni inspección visual Android acreditadas todavía; contrastar adaptación, teclado, TalkBack, tamaños de fuente, orientación y recorte del icono con la APK instalada. Esta guía no presenta montajes como evidencia funcional.
