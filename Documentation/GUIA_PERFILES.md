# 👤 Instructivo y Guía de Uso — Perfiles de Usuario y Línea de Tiempo

Esta guía detalla cómo explorar la ficha individual de cualquier usuario en **Reddit Feed Viewer**, filtrar su actividad por comunidad en tiempo real, interpretar sus métricas (**KPIs**) y seguir la trazabilidad de sus respuestas en su **Línea de Tiempo**.

---

## 1. Cómo Acceder a un Perfil de Usuario (y Navegación Contextual)

Podés abrir la ficha de cualquier usuario identificado desde distintos puntos del visor:
1. Buscando su nombre en el **Omnibox** del encabezado (`🔍 Buscar post o usuario...`, opcionalmente anteponiendo `u/`).
2. Haciendo clic en cualquier autor **`u/usuario`** dentro de tarjetas del **Feed**, del **Árbol de Comentarios** en el modal de detalle o desde otra Línea de Tiempo.

*(Nota: las cuentas anónimas `[deleted]` / `[removed]` conservan sus aportes dentro del Feed y los árboles de comentarios para no perder contexto, pero no generan una ficha de perfil individual).*

### Barra Superior de Navegación del Perfil
- **`← Volver al Feed` inteligente:** conserva tu punto de origen —incluso si saltaste de un perfil a otro en cadena— y restaura tu posición exacta de scroll al regresar al Feed.
- **`Abrir en Reddit ↗`:** enlace externo al perfil público `reddit.com/user/<usuario>/`.

---

## 2. Filtro Dinámico *Multiple-Choice* por Subreddit

En la esquina superior derecha de la tarjeta principal del usuario se encuentra **`Filtrar perfil por subreddit:`**

- Al desplegarlo, muestra todos los subreddits donde ese usuario tuvo actividad junto con la **cantidad exacta de intervenciones** en cada uno, más acciones rápidas **`Todos`** y **`Ninguno`**.
- **Preselección contextual:** si venís de un Feed donde habías filtrado ciertas comunidades específicas (y el usuario participó en alguna de ellas), el perfil preselecciona automáticamente esas comunidades y muestra el aviso **`🔎 Filtro activo (X/Y)`**.
- **Recálculo integral en tiempo real:** marcar o desmarcar comunidades recalcula al instante **todos** los bloques de la pantalla:
  1. Rango de fechas de primera y última actividad registrada.
  2. Las **5 tarjetas de métricas (KPIs)**.
  3. Los **Subreddits activos** y **Flairs** mostrados.
  4. La **Línea de Tiempo** inferior.

---

## 3. Indicadores Clave (KPIs) y Etiquetas del Usuario

| Métrica / Bloque | Qué mide | Cómo interpretarlo |
|---|---|---|
| **`Score Total`** | Suma algebraica de los puntajes de todos sus posts y comentarios dentro del filtro activo. | Refleja la recepción acumulada de sus aportes en las comunidades seleccionadas. |
| **`Total Actividades`** | Suma de `Posts + Comentarios`. | Volumen bruto de participación del usuario. |
| **`Posts`** | Cantidad de publicaciones creadas por el usuario. | Un valor alto respecto de comentarios identifica a un **iniciador de temas / creador de contenido (OP)**. |
| **`Comentarios`** | Cantidad de respuestas dejadas en publicaciones propias o ajenas. | Un ratio muy inclinado hacia comentarios identifica a un **participante de debates**. |
| **`Promedio / Ítem`** | `Score Total / Total Actividades` (`pts`). | Mide el impacto medio por intervención, independientemente de cuánto publique. |
| **`Subreddits activos` y `Flairs`** | Píldoras con las comunidades seleccionadas actualmente y todos los *flairs* utilizados por el usuario. | Resume en qué temáticas y categorías suele participar o identificarse. |

---

## 4. Línea de Tiempo Individual y Contexto de Respuestas

Debajo de la ficha se listan cronológicamente todas las intervenciones del usuario con dos grupos de controles combinables:
- **Ordenamiento:** **`▼ Fecha descendente`** *(más recientes primero)*, **`▲ Fecha ascendente`** *(cronológico)* y **`🔥 Mayor score`** *(sus aportes más votados arriba)*.
- **Filtro por tipo:** **`Todos`**, **`📝 Posts`** (solo publicaciones iniciadas) y **`💬 Comentarios`** (solo respuestas).

### Diferenciación Visual y Trazabilidad Conversacional
- **Tarjetas de Publicación (`📝 PUBLICACIÓN`, borde naranja):** muestran título clickeable, *flair*, fecha ART, score y extracto del cuerpo.
- **Tarjetas de Comentario (`💬 COMENTARIO`, borde azul):** resuelven automáticamente el destinatario usando `parent_id`:
  - Si respondió a otro comentario (`t1_`), muestra **`↳ 💬 En respuesta a u/destinatario · Post: <Título>`** (con enlace directo al perfil de `u/destinatario`).
  - Si comentó directamente sobre una publicación (`t3_`), muestra **`↳ 💬 En respuesta al post: <Título>`**.
- **Botón `Ver en detalle y discusión ↗`:** abre el modal del post correspondiente con el comentario o publicación contextualizado, extracto citado del comentario padre (hasta 220 caracteres) y el **árbol completo de comentarios** de esa publicación.
