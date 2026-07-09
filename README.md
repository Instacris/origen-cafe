# ORIGEN Café — Tienda con carrito y panel administrativo

Tienda web de café (cafeteras, máquinas de espresso, vasos, molinillos, café y accesorios)
con **carrito de compras**, **base de datos SQLite** y **panel de administración**.

Construida con Node.js puro (sin dependencias externas): el servidor usa `node:http`
y la base de datos usa el módulo integrado `node:sqlite`.

## Requisitos

- Node.js 22.5 o superior (tienes la v24, así que estás listo).

## Cómo iniciar

```bash
node server.js
```

- **Tienda:** http://localhost:3000
- **Panel administrativo:** http://localhost:3000/admin

## Acceso administrador

| Usuario | Contraseña |
|---------|-----------|
| `admin` | `cafe2026` |

> ⚠️ Cambia la contraseña desde **Ajustes → Cambiar contraseña** la primera vez que entres.

## Qué puede hacer el administrador

- **Productos:** crear, editar y eliminar; cambiar **precio**, **stock** (editable directo en la tabla),
  marcar **en oferta** (guardando el **precio anterior**, que se muestra tachado en la tienda),
  marcar como **destacado** y **ocultar/mostrar** en la tienda.
- **Pedidos:** ver los pedidos de los clientes con sus artículos y cambiar su estado
  (pendiente → enviado → completado / cancelado).
- **Ajustes:** editar la barra de anuncio de la tienda y cambiar la contraseña.

## Qué puede hacer el cliente

- Navegar el catálogo con filtros por categoría, búsqueda, orden por precio y "solo ofertas".
- Agregar productos al carrito (respeta el stock disponible), modificar cantidades.
- Finalizar la compra con sus datos; el pedido queda registrado y el stock se descuenta
  automáticamente en la base de datos.

## Imágenes de productos

Dos formas de agregar tus imágenes:

1. **Desde el panel** (recomendado): edita un producto y sube la imagen con el selector de
   archivo (PNG, JPG, WEBP o GIF, máx. 5 MB). Se guarda en `public/img/products/`.
2. **Manual:** copia tus archivos a `public/img/products/` y en el producto guarda la ruta,
   por ejemplo `/img/products/mi-cafetera.jpg`.

Los productos sin imagen muestran un ícono elegante con el nombre de la categoría.

## Base de datos

El archivo SQLite se crea automáticamente en `data/cafe.db` la primera vez que arrancas el
servidor, con 18 productos de ejemplo. Tablas: `products`, `orders`, `order_items`,
`admins`, `settings`.

Para **reiniciar todo de cero**, detén el servidor y borra `data/cafe.db`.

## Publicar en internet

El proyecto corre en cualquier servicio que soporte Node.js (Render, Railway, Fly.io, un VPS…):

1. Sube esta carpeta a un repositorio de GitHub.
2. En [render.com](https://render.com) crea un **Web Service** gratuito apuntando al repo.
3. Comando de inicio: `node server.js` (el puerto se toma de la variable `PORT` automáticamente).

> Nota: en los planes gratuitos el disco puede ser efímero (la base se reinicia en cada
> despliegue). Para producción real usa un servicio con disco persistente.
