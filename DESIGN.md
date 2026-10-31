# DESIGN.md - Sistema visual de la webapp de Quina

Guía de diseño de la webapp (`https://quina.andeva.tech/app`). Su objetivo es que
cada pantalla, construida en planes distintos, se vea como parte de un mismo
producto y como continuación natural del sitio público (`quina.andeva.tech`).

Léela antes de crear o cambiar cualquier pantalla o componente. Los valores
exactos viven en `src/presentation/styles/globals.css` (copia de
[`styles/globals.css`](styles/globals.css)); este documento explica **cuándo** y
**cómo** usarlos.

---

## 1. Principio: un solo producto, no una suma de pantallas

- **Coherencia antes que parches.** Si una pantalla necesita algo que este
  documento no cubre, se resuelve con las piezas existentes o se agrega aquí
  primero. Nunca un estilo suelto "solo para esta pantalla".
- **El sitio es la promesa; la webapp es el producto.** La ventana de la webapp
  que muestra el sitio en su portada (ficha de Rosa Quispe, barra lateral con
  Inicio, Vender, Clientes, Créditos, Inventario y Reportes; tarjetas de saldo,
  límite, corte y pago) es lo que el comerciante espera ver al entrar. La webapp
  real debe reconocerse en esa imagen.
- **Herramienta de mostrador, no portada.** Comparte marca, colores, tipografía,
  tema oscuro y voz con el sitio, pero es más densa, más sobria y con movimiento
  solo funcional. Nada de efectos de marketing (imán, inclinación 3D, revelados
  al hacer scroll, cursores personalizados).

### Señales de que la webapp se está volviendo un "Frankenstein"

- Dos estilos distintos para el mismo componente (botones, tarjetas, tablas).
- Colores en hexadecimal dentro de componentes, o tokens antiguos del sistema
  (`--color-card-black`, `--color-text-subtitles`, `--color-border-card-*`).
- Una segunda familia tipográfica o un segundo set de íconos.
- Radios, sombras o espaciados que no están en este documento.
- Textos de interfaz escritos directamente en el componente (deben vivir en los
  mensajes de idioma).

---

## 2. Color

### 2.1. Tokens de rol (cambian con el tema)

Son los únicos que se usan para fondos, superficies, texto y bordes.

| Token | Uso | Claro | Oscuro |
| :--- | :--- | :--- | :--- |
| `--color-paper` | Fondo de la página | `#f8f8fa` | `#161917` |
| `--color-paper-deep` | Fondos secundarios, rieles de toggles, filas alternas | `#eef0ec` | `#1d211e` |
| `--color-surface` | Tarjetas, paneles, diálogos, barra lateral | `#ffffff` | `#242926` |
| `--color-surface-hover` | Hover de filas, ítems de menú | `#e9ece7` | `#2d332f` |
| `--color-line` | Bordes y separadores | `#e3e6e1` | `#2f3531` |
| `--color-ink` | Texto principal | `#0f1a13` | `#eef2ef` |
| `--color-ink-soft` | Texto secundario, etiquetas, ayudas | `#4a564e` | `#a7b2aa` |
| `--color-soft` | Fondos de realce suave (ítem activo, aviso informativo) | `#e3f9ea` | `#0f2a19` |
| `--color-soft-ink` | Texto sobre `--color-soft` | `#0a2e17` | `#c9f5d6` |
| `--color-soft-ink-2` | Texto secundario sobre `--color-soft` (metadatos de un aviso o del ítem activo) | `#2d4a36` | `#9fc9ad` |
| `--color-link-active` | Enlaces, texto positivo, anillo de foco | `#12803a` | `#2bdd66` |

### 2.2. Marca (fijos)

| Token | Uso |
| :--- | :--- |
| `--color-primary` `#2bdd66` | **Solo** la acción principal de cada pantalla, el ítem activo de la navegación y los montos destacados sobre fondo oscuro. Nunca como color de texto sobre fondo claro (contraste 1.8:1). |
| `--color-primary-dark` `#0a2e17` | Texto e íconos sobre el verde Quina. |
| `--color-primary-soft` `#e3f9ea` | Fondo de confirmaciones y estados "al día". |
| `--color-amber` / `-dark` / `-soft` | Plata en riesgo, vencimientos próximos, avisos de límite de plan. En el sitio se llama `--color-accent`; en la webapp cambia de nombre porque shadcn usa `accent` para el hover de menús. |

### 2.3. Estados

Los colores de estado (`--color-success`, `--color-error`, `--color-warning`) se
usan para **íconos, bordes y fondos**. Para **texto** se usan sus versiones
`-ink`, que cumplen 4.5:1 en ambos temas:

| Para texto | Claro | Oscuro | Contraste mínimo |
| :--- | :--- | :--- | :---: |
| `--color-error-ink` | `#c4161f` | `#ff6b72` | 5.3:1 |
| `--color-amber-ink` | `#8a5200` | `#ffb020` | 5.8:1 |
| `--color-success-ink` | `#1d7a17` | `#3ac530` | 5.5:1 |

Fondos de estado: mezclar el color con transparencia, por ejemplo
`color-mix(in srgb, var(--color-error) 12%, transparent)`, y poner encima el texto
`-ink` correspondiente. Nunca se pone texto `-ink` sobre el color de estado puro:
en tema oscuro, `--color-amber` y `--color-amber-ink` son el mismo color.

Para acciones destructivas (botón `destructive`) se usa `--color-error-strong`
(`#c4161f`, fijo en ambos temas), que da 6.0:1 con texto blanco; el rojo de estado
solo llega a 3.8:1.

### 2.4. Estados del crédito y del cobro

Cada estado del negocio tiene un solo color en toda la app (insignias, filas,
gráficos y correos). En insignias y filas, el color de la tabla va como fondo
diluido al 12 % (sección 2.3) y el texto usa su versión `-ink`:

| Estado | Ejemplos | Color |
| :--- | :--- | :--- |
| Al día / pagado / conforme | Ciclo `PAID`, cargo `ACCEPTED`, cuota `PAID` | Éxito (`--color-success`, texto `--color-success-ink`) |
| Pendiente / abierto | Ciclo `OPEN`, cargo `PENDING` | Neutro (`--color-paper-deep`, texto `--color-ink-soft`) |
| Liquidado, por pagar | Ciclo `BILLED` | Realce suave (`--color-soft`, texto `--color-soft-ink`) |
| Por vencer (3 días o menos) / límite cerca | Recordatorio enviado, uso ≥ 85 % del límite | Ámbar (`--color-amber`, texto `--color-amber-ink`) |
| Vencido / en mora / objetado / bloqueado | Ciclo `OVERDUE`, cargo `OBJECTED`, cuenta `BLOCKED` | Error (`--color-error`, texto `--color-error-ink`) |

El color nunca va solo: cada insignia lleva texto ("Al día", "Vence en 2 días",
"En mora") y, si cabe, un ícono.

### 2.5. Variables de shadcn/ui

shadcn/ui trae su propia paleta. En Quina sus variables (`--background`,
`--card`, `--border`, `--ring`, `--accent`…) **apuntan a los tokens de rol**; el
bloque ya está en `globals.css`. Al instalar un componente nuevo con el CLI de
shadcn, no aceptar cambios a `globals.css`.

---

## 3. Tema oscuro

- Se activa con el atributo `data-theme="dark"` en `<html>`, igual que el sitio,
  y se guarda en `localStorage` con la clave `theme`. Como sitio y webapp
  comparten origen (`quina.andeva.tech`), el tema elegido en uno se mantiene en
  el otro.
- Un script en línea en el `<head>` aplica el tema antes de pintar, para que no
  haya parpadeo. Sin preferencia guardada, se sigue `prefers-color-scheme`.
- La variante `dark:` de Tailwind está ligada a ese atributo
  (`@custom-variant dark`). Aun así, **casi nunca hace falta**: los tokens de rol
  cambian solos. `dark:` es para excepciones puntuales.
- Toda pantalla nueva se revisa en ambos temas. En oscuro, las superficies se
  separan con bordes (`--color-line`) más que con sombras.

---

## 4. Tipografía

- **Una sola familia: Albert Sans**, cargada con `next/font/local` desde
  `src/presentation/fonts/AlbertSans-VariableFont_wght.woff2` (y su cursiva),
  copiada de `docs/branding/albert-sans/`. No se
  usa `@font-face` con rutas `/fonts/...`: con `basePath: '/app'` apuntarían a los
  archivos del sitio.
- Escala de la app (no se usan los tamaños de titulares del sitio):

| Uso | Tamaño | Peso | Notas |
| :--- | :--- | :--- | :--- |
| Título de página | `text-2xl` (24 px) | 600 | `tracking-tight` |
| Título de sección / tarjeta | `text-lg` (18 px) | 600 | |
| Texto base | `text-base` (16 px) | 400 | Mínimo en campos de formulario (evita el zoom en iOS) |
| Texto secundario, tablas densas | `text-sm` (14 px) | 400–500 | Color `--color-ink-soft` |
| Ayuda de campo, metadatos | `text-[13px]` | 400 | Nunca más chico |
| Montos destacados | `text-amount` (36 px) / `text-amount-lg` (48 px) | 700 | `tabular-nums` |

- **Todos los números** (montos, cantidades, fechas en tablas) usan
  `tabular-nums` para que las columnas se alineen.
- Pesos permitidos: 400, 500, 600 y 700.

---

## 5. Espaciado, layout y navegación

- Escala de espaciado de Tailwind (múltiplos de 4 px). Separación habitual: 16 px
  dentro de tarjetas, 24 px entre bloques, 32 px entre secciones.
- **Primero el celular.** El mostrador se usa en teléfonos de 360 a 430 px de
  ancho. Cada pantalla se diseña y revisa primero a 390 px y luego a 1440 px.
- **Navegación:**
  - **Celular:** barra inferior fija con los destinos frecuentes del rol (dueño:
    Vender, Clientes, Cobros, Más). La acción "Vender" va al centro y en verde.
  - **Escritorio (≥ 1024 px):** barra lateral con Inicio, Vender, Clientes,
    Créditos, Inventario y Reportes, como la ventana que muestra el sitio. El
    ítem activo usa `--color-soft` con texto `--color-soft-ink`.
  - El empleado solo ve los destinos que su rol permite (US05).
- **Tablas:** en escritorio, tabla con encabezado fijo; en celular, la misma
  información como lista de tarjetas. Nunca scroll horizontal en la página.
- Ancho de contenido máximo: 1280 px, centrado.

---

## 6. Forma: radios, bordes y elevación

| Elemento | Radio | Token |
| :--- | :--- | :--- |
| Botones, insignias, chips, toggles, avatares | Píldora | `rounded-full` |
| Campos de texto, selects, buscadores | 12 px | `rounded-field` |
| Tarjetas, paneles, diálogos, tablas | 16 px | `rounded-card` |
| Hojas inferiores (*bottom sheets*) en celular | 24 px arriba | `rounded-t-sheet` |

- Las superficies se separan con borde de 1 px `--color-line`. Sombra solo para lo
  que flota (menús, diálogos, toasts): `shadow-float` (token `--shadow-float`,
  `0 12px 32px rgb(0 0 0 / 0.12)`).
- El botón principal es una **píldora verde**, igual que "Empieza gratis" en el
  sitio. Esto prevalece sobre el `rounded-xl` que menciona el sistema de diseño
  original.

### 6.1. Pantallas de acceso (login, registro, verificación, recuperación)

Son la única excepción de "portada" dentro de la webapp: el comerciante aún no
entra al mostrador, así que se permite un panel de marca. Todas usan
`AuthShell`; ninguna arma su propio layout.

- **Dos columnas iguales desde 1024 px:** formulario a la izquierda (ancho máximo
  400 px, sin tarjeta alrededor, directo sobre `--color-paper`) y panel de marca
  a la derecha, con 12 px de margen y `rounded-card`. El panel queda fijo a la
  altura de la ventana aunque el formulario sea más alto. Bajo 1024 px solo queda
  el formulario; el panel no se muestra.
- **Barra superior:** isologo a la izquierda y el enlace alterno ("¿Ya tienes
  cuenta? Ingresa") a la derecha desde 640 px; en celular ese enlace baja al pie.
  Entre la barra y el título hay siempre al menos 48 px, también en pantallas bajas.
- **Panel de marca:** una foto de fondo (`public/auth/bodeguero.jpg`, un bodeguero
  real en su tienda, sin texto ni logos dentro de la imagen) con un velo de
  `--color-primary-dark` para que el titular en `--color-primary-soft` se lea
  sobre cualquier foto.
- **Contenido del panel:** un titular (la promesa del sitio en registro; "Tu
  cuaderno de fiados, ordenado" en ingreso y recuperación) y, flotando sobre la
  foto, lo que el bodeguero ve en su celular: la ficha de ejemplo de Rosa Quispe
  (etiqueta "Ejemplo") y el aviso "Recordatorio de pago enviado". Ambas son
  superficies flotantes: `--color-surface`, `--shadow-float` y tokens de rol, así
  que siguen el tema. Nada de testimonios, logos de clientes ni cifras que no
  estén en `docs/`.
- **Movimiento:** solo la ficha entra una vez (sube 12 px sin cambiar su opacidad, 450 ms,
  `--ease-out-expo`). Nada más se anima.
- **Consentimiento en el registro:** casilla obligatoria, sin marcar por defecto,
  antes del botón "Continuar", con enlaces a los Términos y condiciones y a la
  Política de privacidad (Ley N.° 29733). También se exige antes de "Continuar
  con Google". Si falta, el error va bajo la casilla.

---

## 7. Componentes

Base: **shadcn/ui** (primitivas de Radix) ajustado a estos tokens. Se crean en
`src/presentation/components/ui/` y no se duplican.

### 7.1. Botón

| Variante | Fondo | Texto | Uso |
| :--- | :--- | :--- | :--- |
| `primary` | `--color-primary` | `--color-primary-dark` | Una sola acción principal por pantalla (Confirmar venta, Registrar pago). |
| `secondary` | `--color-surface` + borde `--color-line` | `--color-ink` | Acciones alternativas. |
| `ghost` | Transparente (hover `--color-surface-hover`) | `--color-ink` | Acciones de baja jerarquía, íconos. |
| `destructive` | `--color-error-strong` | `#ffffff` | Acciones irreversibles (desactivar empleado). Siempre con confirmación. |

- Alturas: 44 px (normal) y 56 px (acciones del mostrador). Área táctil mínima de
  44 × 44 px incluso en botones de solo ícono.
- Ícono a la izquierda del texto, 20 px. El estado de carga reemplaza el ícono por
  un indicador y deshabilita el botón, sin cambiar su ancho.
- Sin efecto imán ni animaciones de marketing.

### 7.2. Formularios

- Etiqueta visible siempre arriba del campo (no solo *placeholder*).
- **Cada campo tiene su ayuda** (texto bajo el campo o ícono de ayuda con
  descripción): lo exige el enunciado del curso ("recibir ayuda o indicaciones en
  cada uno de los campos"). Ejemplo: "Tasa efectiva anual (TEA): la que ya
  incluye la capitalización. Si no sabes cuál usar, pon 0 % para vecinos de
  confianza."
- Errores debajo del campo, en `--color-error-ink`, con texto que explique cómo
  corregir. Validación con Zod en cliente y servidor, mismos mensajes.
- Montos con prefijo `S/` fijo y teclado numérico en celular (`inputMode="decimal"`).

### 7.3. Otros componentes

- **Diálogo / hoja:** en escritorio, diálogo centrado; en celular, hoja inferior.
- **Insignia de estado:** píldora con color según la tabla 2.4.
- **Toast (Sileo):** confirmaciones breves ("Venta registrada · S/ 27.60"). Los
  errores que exigen acción no van en toast, van en la pantalla.
- **Esqueletos (Boneyard):** para cargas de más de 300 ms, con la forma real del
  contenido.
- **Estados vacíos:** ilustración mínima o ícono, una frase en voz Quina y la
  acción para salir del vacío ("Aún no tienes vecinos. Registra al primero").
- **Montos:** un componente único `Money` que formatea `S/ 1,234.50` (`es-PE`),
  con `tabular-nums`, y nunca muestra `NaN` ni más de dos decimales.

---

## 8. Movimiento

- Solo funcional: confirmar una acción, mostrar un cambio de estado, abrir y
  cerrar capas. Duraciones de 150 a 250 ms con `--ease-out-expo`.
- Se animan solo `transform` y `opacity`.
- Interfaz optimista en el mostrador (la venta aparece al instante y se confirma
  después), sin animaciones que demoren el siguiente toque.
- Todo respeta `prefers-reduced-motion` (ya está en `globals.css`).
- No se usan GSAP, Lenis ni revelados al hacer scroll: son del sitio, no de la
  herramienta.

---

## 9. Íconos y marca

- Íconos: **Lucide** (`lucide-react`), trazo 2, tamaño 20 px (16 px en texto
  pequeño). Ningún otro set.
- Logo: el isologo de [`branding/`](branding/) siempre en su **verde original**
  (`quina-isologo-verde.svg`). En el tema oscuro sigue verde; no se invierte ni se
  recolorea.
- Favicon e íconos de la PWA: `quina-icon-primary` (claro) y
  `quina-icon-primary-dark`.

---

## 10. Voz y formatos

- Lenguaje del comerciante peruano: vecino, casero, fiado, fecha de corte, plata
  en la calle. Se evita la jerga bancaria en la interfaz (ver
  [product-marketing.md](product-marketing.md)). Los términos financieros que exige
  el curso (TEA, TNA, capitalización, mora) se muestran con su ayuda de campo.
- Tono: claro, cercano y respetuoso con el vecino. Nunca culpabilizar ("Tienes
  S/ 186.40 por pagar", no "Debes S/ 186.40").
- Formatos fijos en cualquier idioma: `S/ 1,234.50`, fechas cortas `5 nov 2026`,
  porcentajes `3.50 %`, horas `6:00 p. m.`
- Todos los textos viven en `messages/es.json`, `en.json` y `qu.json`.

---

## 11. Accesibilidad

- WCAG 2.1 AA en ambos temas: contraste de texto ≥ 4.5:1 (≥ 3:1 en texto grande e
  íconos informativos).
- Foco visible en todo elemento interactivo (anillo `--color-link-active`).
- Todo campo tiene etiqueta asociada; los errores se anuncian con
  `aria-describedby`.
- El total de la venta y el saldo disponible se anuncian con `aria-live="polite"`
  al cambiar.
- Navegación completa con teclado; los diálogos atrapan y devuelven el foco.

---

## 12. Lista de revisión antes de terminar una pantalla

1. Solo usa tokens de rol, de marca y de estado de este documento.
2. Se ve bien en 390 px y en 1440 px, en tema claro y oscuro.
3. Una sola acción principal en verde.
4. Cada campo tiene etiqueta y ayuda; los errores dicen cómo corregir.
5. Montos con el componente `Money` y `tabular-nums`.
6. Todos los textos están en los mensajes de idioma.
7. Pasa las pruebas de accesibilidad (axe) en ambos temas.
