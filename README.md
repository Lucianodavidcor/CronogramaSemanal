# Cronograma Semanal

Web para armar el cronograma de tareas de la semana, de lunes a viernes, dividido en turno mañana y tarde.

- Horario base de 08:00 a 17:00 (mañana 08:00–12:30, tarde 12:30–17:00). Cada día se puede extender hasta las 22:00 desde su encabezado.
- Cada tarea tiene nombre, descripción, prioridad del 1 al 10, día y turno de inicio, y duración en medios días.
- **Generar con IA**: escribís 5 puntos clave en la descripción y Gemini los convierte en una descripción desarrollada. La primera vez pide tu API key de Gemini, que queda guardada solo en tu navegador. Se puede crear gratis en https://aistudio.google.com/apikey. «Deshacer» vuelve a tus puntos.
- **Excel completo**: cronograma tipo Gantt con prioridades y horas, más una hoja de detalle.
- **Excel simple**: día, turno, tarea y descripción, prolijo y listo para enviar.
- **Cargar Excel**: vuelve a cargar un Excel exportado desde la web (completo o simple) para seguir editándolo. Se puede reemplazar la semana o agregar a las tareas que ya hay.

## Uso

Es un sitio estático: no necesita build ni servidor. Abrí `index.html` en el navegador o publicalo en cualquier hosting estático.

Las tareas y la API key se guardan en el navegador (`localStorage`), así que quedan en la computadora y el navegador donde se cargaron.

## Publicar en GitHub Pages

1. Subí estos archivos a la raíz de un repositorio.
2. En GitHub: **Settings → Pages → Build and deployment**, elegí **Deploy from a branch**, rama `main` y carpeta `/ (root)`.
3. En un par de minutos queda online en `https://<tu-usuario>.github.io/<repositorio>/`.

## Archivos

- `index.html` — estructura de la página
- `styles.css` — estilos (modo noche)
- `app.js` — lógica del cronograma, IA y Excel ([ExcelJS](https://github.com/exceljs/exceljs) se carga desde cdnjs al usarlo)

El modelo de Gemini se define en `GEMINI_MODELS` dentro de `app.js`.
