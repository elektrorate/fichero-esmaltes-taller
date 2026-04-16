# Documentación Del Proyecto

## 1. Resumen

Este proyecto es una aplicación web para gestionar un repositorio de fichas técnicas de esmaltes cerámicos. Permite iniciar sesión con Google, crear y editar fichas, consultar el catálogo, ver el detalle técnico de cada esmalte, exportar fichas en PDF y administrar usuarios y roles.

La aplicación está construida con React + TypeScript + Vite en el frontend y utiliza Firebase para autenticación, base de datos y almacenamiento de imágenes.

## 2. Objetivo Del Sistema

El sistema está pensado para centralizar la información técnica del taller sobre esmaltes:

- Registrar recetas de esmaltes.
- Guardar imágenes de referencia.
- Mantener estados de validación de cada ficha.
- Añadir comentarios internos por ficha.
- Gestionar permisos de usuarios.
- Exportar fichas individuales o lotes a PDF.

## 3. Stack Tecnológico

- `React 19`
- `TypeScript`
- `Vite`
- `Tailwind CSS v4`
- `Firebase Auth`
- `Cloud Firestore`
- `Firebase Storage`
- `jsPDF`
- `motion`
- `lucide-react`

## 4. Estructura General

```text
fichero-esmaltes-taller/
├── .env.example
├── firebase-applet-config.json
├── firebase-blueprint.json
├── firestore.rules
├── index.html
├── metadata.json
├── package.json
├── README.md
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   ├── constants.ts
│   ├── types.ts
│   ├── components/
│   │   ├── AdminPanel.tsx
│   │   ├── Dashboard.tsx
│   │   ├── GlazeDetail.tsx
│   │   ├── GlazeForm.tsx
│   │   └── GlazeList.tsx
│   └── lib/
│       ├── firebase.ts
│       ├── pdfUtils.ts
│       └── utils.ts
└── documentacion/
    └── PROYECTO.md
```

## 5. Flujo Principal De La Aplicación

### 5.1 Autenticación

La app usa autenticación con Google a través de Firebase Auth.

Al iniciar sesión:

- Se comprueba si existe el documento del usuario en Firestore.
- Si no existe, se crea un perfil inicial en la colección `users`.
- Si el email está previamente invitado en `invites`, se le asigna el rol correspondiente.
- El email `erick@kgbycia.com` se fuerza como administrador.

### 5.2 Navegación Interna

La navegación principal se controla dentro de `src/App.tsx` mediante estado local, sin React Router.

Vistas disponibles:

- `dashboard`
- `repository`
- `create`
- `detail`
- `admin`
- `settings`

### 5.3 Gestión De Fichas

Las fichas de esmaltes se almacenan en la colección `glazes`.

Cada ficha puede incluir:

- Nombre
- Código autogenerado (Formato: COLOR-ACABADO-USO-NÚMERO-VARIANTE)
- Imagen principal
- Galería de imágenes (Definido en tipos)
- Acabado, Color, Textura, Uso, Familia química
- Método de aplicación, Temperatura, Tipo de pasta, Tipo de cocción, Atmósfera (Definidos en el modelo de datos pero pendientes en UI)
- Observaciones
- Receta base y Aditivos (con cálculo en gramos o porcentajes)
- Estado de validación
- Metadatos del autor

## 6. Módulos Principales

### `src/App.tsx`

Es el núcleo de la interfaz. Se encarga de:

- Escuchar el estado de autenticación.
- Cargar el perfil del usuario.
- Mostrar login o interfaz principal.
- Controlar la vista activa.
- Mostrar sidebar, header y área de contenido.

### `src/components/Dashboard.tsx`

Muestra un resumen en tiempo real del repositorio:

- Total de esmaltes.
- Fichas pendientes.
- Fichas validadas o publicadas.
- Últimas fichas creadas.

Los datos se leen en tiempo real desde Firestore con `onSnapshot`.

### `src/components/GlazeList.tsx`

Pantalla de listado del repositorio.

Funciones principales:

- Mostrar tarjetas de esmaltes.
- Abrir detalle.
- Editar ficha.
- Seleccionar varias fichas.
- Exportar selección a PDF.

### `src/components/GlazeForm.tsx`

Formulario de creación y edición de fichas técnicas.

Funciones destacadas:

- Generación automática del código del esmalte (Ej. B-BR-FS-001-A).
- Soporte para Variante (A, B, C...) en caso de pruebas alternativas.
- Gestión de receta base y adicionales.
- Cálculo de totales inteligentes y cambio de modo (Porcentaje vs Gramos).
- Reescalado proporcional de cantidades de receta hacia un peso objetivo.
- Captura de imagen con cámara local (facingMode: environment).
- Subida de imágenes a Firebase Storage.
- Guardado en Firestore.

Estado actual importante:

- El formulario sí gestiona nombre, código, imagen principal, color, acabado, uso, textura, familia química, observaciones, receta y estado.
- Los campos `gallery`, `applicationMethod`, `temperature`, `clayBody`, `firingType`, `atmosphere` e `isValidated` existen en el modelo de datos, pero hoy no están completamente gestionados desde el formulario principal.

### `src/components/GlazeDetail.tsx`

Vista detallada de una ficha.

Incluye:

- Imagen principal.
- Resumen técnico.
- Fórmula completa.
- Observaciones.
- Comentarios internos.
- Exportación individual a PDF.

Estado actual importante:

- El detalle sí muestra `temperature`, `atmosphere` y `clayBody`, pero si esos valores no existen en Firestore muestra textos por defecto.
- Los botones de imprimir y compartir están presentes en la interfaz, pero actualmente no tienen lógica implementada.

### `src/components/AdminPanel.tsx`

Panel administrativo para gestión de usuarios.

Permite:

- Ver usuarios registrados.
- Cambiar roles.
- Preautorizar emails en `invites`.
- Cargar recetas de ejemplo.

Estado actual importante:

- El panel asume lectura en tiempo real de `users` e `invites`.
- La documentación debe contemplar que esta parte depende fuertemente de que las reglas de Firestore permitan listar usuarios para un administrador.

## 7. Tipos Y Modelo De Datos

### `src/types.ts`

Define los tipos principales del proyecto:

- `UserRole`
- `UserProfile`
- `GlazeStatus`
- `RecipeItem`
- `Recipe`
- `Glaze`
- `Comment`

### Colecciones Usadas En Firestore

#### `users`

Guarda perfiles de usuario:

- `uid`
- `email`
- `displayName`
- `photoURL`
- `role`
- `createdAt`

#### `glazes`

Guarda las fichas técnicas de esmaltes.

Observación:

- El tipo `Glaze` contempla más campos de los que hoy se capturan completamente en la interfaz.

#### `glazes/{glazeId}/comments`

Subcolección con comentarios internos por ficha.

#### `invites`

Guarda invitaciones o preautorizaciones por email para asignar rol en el primer acceso.

## 8. Firebase Y Seguridad

### `src/lib/firebase.ts`

Centraliza la configuración de Firebase:

- Inicialización de la app.
- Auth.
- Firestore.
- Storage.
- Proveedor de Google.

También incluye:

- `OperationType`
- `handleFirestoreError()`
- una prueba de conexión inicial con Firestore

### `firestore.rules`

Las reglas de Firestore controlan permisos por autenticación y rol.

Resumen funcional:

- Solo usuarios autenticados pueden acceder.
- Los perfiles de usuario son legibles por su dueño o un admin.
- Los admins pueden cambiar roles.
- Las fichas publicadas son visibles para usuarios autenticados.
- Borradores y fichas pendientes tienen restricciones por autor o rol.
- Los comentarios requieren usuario autenticado.
- La colección `invites` solo puede escribirse por administradores.

Punto a vigilar:

- El panel de administración consulta la colección `users` con `orderBy('createdAt')`, así que el funcionamiento real depende de que las reglas permitan ese listado para administradores sin bloquear la consulta.

## 9. Exportación A PDF

### `src/lib/pdfUtils.ts`

Contiene dos funciones principales:

- `generateGlazePDF(glaze)`
- `generateBulkPDF(glazes)`

Estas funciones:

- convierten imágenes remotas a base64
- generan un PDF con encabezado, datos técnicos, receta y observaciones
- descargan el archivo en el navegador

## 10. Estilo Visual

### `src/index.css`

La app usa Tailwind CSS y una línea visual limpia y editorial:

- fondo claro
- tonos grises suaves
- tipografía `Inter`
- tarjetas con bordes redondeados
- animaciones con `motion`

## 11. Scripts Disponibles

Desde `package.json`:

- `npm run dev`: levanta Vite en puerto `3000`
- `npm run build`: genera build de producción
- `npm run preview`: previsualiza la build
- `npm run clean`: elimina `dist`
- `npm run lint`: ejecuta comprobación de TypeScript con `tsc --noEmit`

Observación importante:

- El script `clean` usa `rm -rf dist`, que puede fallar en Windows si no se ejecuta dentro de un entorno compatible con comandos Unix.

## 12. Configuración Del Entorno

### `.env.example`

El repositorio incluye variables de ejemplo:

- `GEMINI_API_KEY`
- `APP_URL`

Nota importante:

Aunque el template original menciona Gemini y AI Studio, el código actual del proyecto está orientado principalmente a la gestión de esmaltes con Firebase. La documentación actual del `README.md` parece venir de una plantilla base y no describe con precisión esta aplicación.

Estado real del entorno:

- Para ejecutar o compilar correctamente hace falta instalar dependencias primero con `npm install`.
- En la revisión actual no fue posible validar `vite build` porque `vite` no está disponible todavía en `node_modules`.

## 13. Observaciones Técnicas Relevantes

- La navegación está basada en estado local, no en rutas URL.
- El proyecto depende de Firebase para casi toda la lógica de persistencia.
- Hay lectura en tiempo real en varias pantallas mediante `onSnapshot`.
- El formulario mezcla lógica de dominio, UI y acceso a servicios en un mismo componente.
- El panel de administración incluye una función de carga de datos de ejemplo útil para pruebas o demos.
- El buscador del header y el botón de filtros están visibles en la UI, pero actualmente no aplican ninguna lógica real sobre el listado.
- La vista `settings` es todavía un placeholder.
- Existen dependencias instaladas o declaradas que no participan en el flujo principal visible, como `@google/genai`, `express`, `react-markdown` o `html2canvas`.

## 14. Recomendaciones Para Su Correcto Funcionamiento

- Ejecutar `npm install` antes de intentar `npm run dev` o `npm run build`.
- Actualizar `README.md` para que describa Firebase, roles, colecciones y pasos reales de arranque.
- Cambiar el script `clean` por una opción compatible con Windows, por ejemplo usando una utilidad cross-platform.
- Completar en `GlazeForm` los campos del modelo que hoy existen en `types.ts` pero no tienen captura completa en UI.
- Implementar la lógica del buscador, filtros, compartir e imprimir o marcar esos botones como “próximamente”.
- Revisar las reglas de Firestore específicamente para los listados administrativos de `users` e `invites`.
- Evitar depender de valores por defecto en detalle si esos campos técnicos son importantes para laboratorio; mejor capturarlos en el alta.
- Revisar codificación de caracteres si en el navegador o editor aparecen textos con acentos mal renderizados.

## 15. Archivos Más Importantes Para Entender El Proyecto

- `src/App.tsx`: entrada lógica de la app
- `src/components/GlazeForm.tsx`: módulo central de creación y edición
- `src/components/GlazeDetail.tsx`: vista completa de una ficha
- `src/components/AdminPanel.tsx`: gestión de usuarios y roles
- `src/lib/firebase.ts`: conexión con Firebase
- `src/lib/pdfUtils.ts`: exportación PDF
- `src/types.ts`: contratos de datos
- `firestore.rules`: seguridad y permisos

## 16. Resumen Final

Este proyecto es un gestor técnico de esmaltes cerámicos pensado para uso interno de taller o laboratorio. Combina autenticación, control de roles, base de datos en tiempo real, almacenamiento de imágenes y generación de PDFs en una sola interfaz React moderna.

Su núcleo funcional está en la gestión completa del ciclo de vida de cada ficha técnica:

- creación
- edición
- validación
- consulta
- comentario
- exportación
