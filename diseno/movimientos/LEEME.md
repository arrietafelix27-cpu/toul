# Diseño objetivo · Movimientos (Paso 3)

`movimientos.html` es el prototipo interactivo de referencia. Ábrelo en el navegador: se puede tocar Gasto, Metí plata y Saqué plata, guardar, filtrar y cambiar a "Así se ve en Reportes".

Es una referencia visual, no código para copiar. Usa los tokens y componentes de la app; si algo necesita tokens nuevos, pide autorización antes de tocar globals.css.

## Medidas y reglas clave
- Título "Movimientos": 32px, peso 700, letter-spacing -1px.
- Acciones: círculos de 58px, fondo rgba(255,255,255,0.07), ícono 24px (Metí plata en verde, el resto en blanco), etiqueta 12px debajo. Al tocar: escala 0.92.
- Filtros: píldoras 13px, fondo rgba(255,255,255,0.06); la activa en blanco con texto #0a0a0a y peso 600. Se deslizan de lado.
- Día: 13px, peso 600, gris al 50%.
- Fila: ícono en círculo de 40px (fondo blanco al 6%), título 15px peso 500, subtítulo 12px gris al 45%, monto 15px peso 600 a la derecha. Entra = "+" en verde. Sale = "−" en blanco.
- Etiqueta "No cuenta en lo que ganaste": 11px, fondo blanco al 6%, radio completo.
- Hoja de registro: fondo #141414, radio superior 26px, sube con cubic-bezier(0.32, 0.72, 0, 1) en 0.4s, fondo desenfocado. Monto de 40px que se formatea al escribir. Línea informativa con ícono de información, 12px.
- Al guardar: la fila nueva entra desde arriba (0.5s) y aparece el aviso "Movimiento guardado" abajo.
- Reportes: dentro de "Tu plata", sección "Entre tú y tu negocio" con "Metiste" y "Sacaste para ti" lado a lado (21px, peso 600), separados por una línea vertical, y la línea informativa debajo. Si los dos están en 0, la sección no aparece.
- Todo respeta "reducir movimiento".
