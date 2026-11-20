# GestionarCliente

Servicio REST síncrono en Java 25 y Spring Boot para registrar, actualizar y consultar clientes.

## Requisitos

- Java 25 o superior
- Maven 3.9 o superior
- Un proveedor OAuth 2.0 / OpenID Connect que emita JWT

## Configuración y ejecución

Configura `OAUTH_ISSUER_URI` con el issuer de tu proveedor de identidad y ejecuta:

```powershell
$env:OAUTH_ISSUER_URI = "https://identidad.ejemplo.com/issuer"
mvn spring-boot:run
```

Si la variable no se define, la aplicación usa un valor de respaldo `https://issuer.example` para que pueda arrancar en entornos locales sin bloquear el proceso de desarrollo. En producción, reemplázalo por tu issuer real.

Para iniciar el API simulado que persiste en `db.json` y rechaza solicitudes duplicadas, ejecuta desde `src/main/java/com/servicios/soa/clientes/api`:

```powershell
npm start
```

Los `POST` duplicados y las actualizaciones `PUT`/`PATCH` que crearían duplicados responden `409 Conflict`: en clientes se compara tipo y número de documento; en envíos, todos los datos excepto `id`. Usa este comando en lugar de `npx json-server db.json` para que se aplique la validación.

La API valida los JWT Bearer usando los metadatos/JWK del issuer. Todas las rutas requieren autenticación. En producción, publica el servicio únicamente detrás de HTTPS (por ejemplo, con un proxy inverso que termine TLS); no envíes tokens ni datos personales por HTTP sin cifrar.

La base H2 está en memoria para facilitar la ejecución local y se reinicia al detener la aplicación. Para persistencia de producción, configura una base de datos administrada y credenciales mediante variables de entorno.

## API

Base URL: `http://localhost:8080`

Envía el encabezado `Authorization: Bearer <access_token>` en cada solicitud. El campo `tipo_documento` admite `DNI`, `RUC`, `CE` o `pasaporte`; `rol` admite `remitente` o `destinatario`.

### Registrar cliente

`POST /clientes` — responde `201 Created`.

```json
{
  "tipo_documento": "DNI",
  "numero_documento": "12345678",
  "nombres": "Ana Pérez",
  "direccion": "Calle Principal 123",
  "telefono": "555123456",
  "correo": "ana@example.com",
  "rol": "remitente"
}
```

Respuesta:

```json
{
  "id_cliente": "uuid",
  "estado": "registrado"
}
```

### Consultar cliente

`GET /clientes/{id_cliente}` — responde `200 OK` con los datos del cliente.

### Actualizar cliente

`PUT /clientes/{id_cliente}` — requiere los mismos campos que el registro y responde `200 OK`.

```json
{
  "id_cliente": "uuid",
  "estado": "actualizado"
}
```

## Errores

- `400 Bad Request`: formato o validación de datos incorrectos.
- `401 Unauthorized`: falta un token Bearer válido.
- `404 Not Found`: el identificador de cliente no existe.
- `409 Conflict`: ya existe un cliente con el mismo tipo y número de documento.
- `503 Service Unavailable`: indisponibilidad de la aplicación o sus dependencias.

Los errores de la API contienen `timestamp`, `status`, `error`, `mensaje` y `campos` (con errores de validación por campo).

## RegistrarEnvío con almacenamiento JSON

La API local de Postman se ejecuta desde `src/main/java/com/servicios/soa/clientes/api` con `npm start` y escucha en `http://localhost:3001`.

- `POST /envios` valida UUIDs, peso positivo, contenido, línea de negocio, origen y destino; guarda el envío en `db.json` y responde `201` con `id_envio` y `estado`.
- `GET /envios/{id_envio}` devuelve los datos persistidos. Un ID mal formado responde `400` y uno inexistente `404`.
- Los campos inválidos se devuelven juntos con `400`. El contenido se compara sin distinguir mayúsculas ni tildes contra `contenidos_prohibidos` en `db.json`; una coincidencia activa responde `422` con categoría y palabra clave. Un fallo al escribir el archivo responde `503`.

La lista JSON inicial contiene las palabras clave de las seis categorías de contenido prohibido.

