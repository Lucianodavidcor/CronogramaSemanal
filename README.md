# Cronograma Semanal

Web para armar el cronograma de tareas de la semana, de lunes a viernes, dividido en turno mañana y tarde.

- Horario base de 08:00 a 17:00 (mañana 08:00–12:30, tarde 12:30–17:00). Cada día se puede extender hasta las 22:00 desde su encabezado.
- Cada tarea tiene nombre, descripción, prioridad del 1 al 10, persona asignada, día y turno de inicio, y duración en medios días.
- Muestra la carga por persona y marca las tareas superpuestas de una misma persona.
- **Excel completo**: exporta la semana con tres hojas (cronograma, detalle y carga por persona).
- **Excel simple**: solo día, mañana y tarde con el nombre de cada tarea, pensado para enviar.
- **Cargar Excel**: vuelve a cargar un Excel exportado desde la web (completo o simple) para seguir editándolo. Del completo se toma la hoja «Detalle», así que los cambios hechos ahí en Excel también se cargan. Se puede reemplazar la semana o agregar a las tareas que ya hay.

## Uso

Es un sitio estático: no necesita build ni servidor. Abrí `index.html` en el navegador o publicalo en cualquier hosting estático.

Las tareas se guardan en el navegador (`localStorage`), así que quedan en la computadora y el navegador donde se cargaron.

## Publicar en GitHub Pages

1. Subí estos archivos a la raíz de un repositorio.
2. En GitHub: **Settings → Pages → Build and deployment**, elegí **Deploy from a branch**, rama `main` y carpeta `/ (root)`.
3. En un par de minutos queda online en `https://<tu-usuario>.github.io/<repositorio>/`.

## Archivos

- `index.html` — estructura de la página
- `styles.css` — estilos (modo noche)
- `app.js` — lógica del cronograma y exportación a Excel ([ExcelJS](https://github.com/exceljs/exceljs) se carga desde cdnjs al exportar)
