import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { App } from '@tinyhttp/app';
import { createApp as createJsonServerApp } from 'json-server/lib/app.js';
import { json } from 'milliparsec';

const defaultDatabasePath = fileURLToPath(new URL('./db.json', import.meta.url));
const prohibitedContentCategories = [
  { categoria: 'Explosivos y armas', palabras: ['arma', 'pistola', 'municion', 'polvora', 'pirotecnia', 'bengala', 'explosivo', 'fuegos artificiales'] },
  { categoria: 'Inflamables y peligrosos', palabras: ['inflamable', 'aerosol', 'alcohol', 'perfume', 'pintura', 'fosforo', 'encendedor', 'bateria de litio', 'acido', 'corrosivo'] },
  { categoria: 'Biológicos y radiactivos', palabras: ['muestra medica', 'infeccioso', 'radiactivo', 'hielo seco', 'animal vivo', 'insecto'] },
  { categoria: 'Alimentos perecibles', palabras: ['carne', 'fruta fresca', 'lacteo', 'pescado', 'perecible'] },
  { categoria: 'Dinero y valores', palabras: ['dinero en efectivo', 'billete', 'moneda', 'cheque al portador', 'oro', 'plata', 'joya', 'piedra preciosa'] },
  { categoria: 'Ilícitos y patrimonio', palabras: ['droga', 'estupefaciente', 'pieza arqueologica', 'patrimonio cultural'] },
];
let nextProhibitedContentId = 1;
const defaultProhibitedContents = prohibitedContentCategories.flatMap(({ categoria, palabras }) =>
  palabras.map((palabra_clave) => ({ id: nextProhibitedContentId++, categoria, palabra_clave, activo: true })),
);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeProhibitedContent(value) {
  return value.normalize('NFD').replace(/\p{M}+/gu, '').toLocaleLowerCase('es');
}

function findProhibitedContent(database, content) {
  const normalizedContent = normalizeProhibitedContent(content);
  return database.data.contenidos_prohibidos.find((rule) =>
    rule.activo === true
      && typeof rule.palabra_clave === 'string'
      && normalizedContent.includes(normalizeProhibitedContent(rule.palabra_clave.trim())),
  );
}

function shipmentKey(shipment) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(shipment)
        .filter(([key]) => key !== 'id' && key !== 'estado')
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
}

function normalizeDocumentValue(value) {
  return typeof value === 'string' ? value.trim().toLocaleUpperCase('es') : '';
}

function hasValidRucCheckDigit(ruc) {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) =>
    total + Number(ruc[index]) * weight, 0);
  return Number(ruc[10]) === (11 - (sum % 11)) % 10;
}

function hasObviousDigitSequence(value) {
  if (typeof value !== 'string' || !/^\d{8,}$/.test(value)) return false;
  let ascending = true;
  let descending = true;
  for (let index = 1; index < value.length; index++) {
    const previous = Number(value[index - 1]);
    const current = Number(value[index]);
    ascending &&= (current - previous + 10) % 10 === 1;
    descending &&= (previous - current + 10) % 10 === 1;
  }
  const repeatedPattern = [1, 2].some((period) =>
    value.length > period && [...value].every((digit, index) => digit === value[index % period]),
  );
  return ascending || descending || repeatedPattern;
}

function isValidDocument(type, number) {
  if (typeof type !== 'string' || typeof number !== 'string') return false;
  switch (type) {
    case 'DNI':
      return /^\d{8}$/.test(number)
        && !number.startsWith('00')
        && !/^([0-9])\1{7}$/.test(number);
    case 'RUC':
      return /^\d{11}$/.test(number)
        && /^(10|15|17|20)/.test(number)
        && hasValidRucCheckDigit(number);
    case 'CE':
      return /^[A-Z0-9]{9,12}$/.test(number);
    case 'PASAPORTE':
      return /^[A-Z0-9]{7,12}$/.test(number);
    default:
      return false;
  }
}

function duplicateCheck(collectionName) {
  if (collectionName === 'clientes') {
    return (existing, incoming) =>
      normalizeDocumentValue(existing.tipo_documento) === normalizeDocumentValue(incoming.tipo_documento)
      && normalizeDocumentValue(existing.numero_documento) === normalizeDocumentValue(incoming.numero_documento);
  }
  return (existing, incoming) => shipmentKey(existing) === shipmentKey(incoming);
}

function validateClienteInput(cliente) {
  if (typeof cliente.tipo_documento !== 'string') {
    return { field: 'tipo_documento', message: 'debe ser DNI, RUC, CE o pasaporte.' };
  }
  cliente.tipo_documento = cliente.tipo_documento.trim().toUpperCase();
  if (typeof cliente.numero_documento === 'string'
      && ['CE', 'PASAPORTE'].includes(cliente.tipo_documento)) {
    cliente.numero_documento = cliente.numero_documento.toUpperCase();
  }
  if (!isValidDocument(cliente.tipo_documento, cliente.numero_documento)) {
    return {
      field: 'numero_documento',
      message: 'no cumple el formato y las reglas del tipo_documento seleccionado.',
    };
  }
  if (typeof cliente.nombres !== 'string') {
    return { field: 'nombres', message: 'es obligatorio y solo puede contener letras, espacios, guiones y apóstrofes.' };
  }
  cliente.nombres = cliente.nombres.normalize('NFC').trim().replace(/\s+/gu, ' ');
  const nameWords = cliente.nombres.split(' ');
  if (cliente.nombres.length < 2
      || cliente.nombres.length > 100
      || nameWords.length < 2
      || nameWords.some((word) => word.replace(/[-']/g, '').length < 2)
      || !/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:[ '-][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*$/u.test(cliente.nombres)
      || /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])\1{3,}/iu.test(cliente.nombres)) {
    return {
      field: 'nombres',
      message: 'debe tener entre 2 y 100 caracteres, usar solo letras, espacios, guiones o apóstrofes, y no repetir letras en exceso.',
    };
  }
  if (cliente.telefono != null && (typeof cliente.telefono !== 'string' || !/^9\d{8}$/.test(cliente.telefono))) {
    return { field: 'telefono', message: 'debe contener 9 dígitos y comenzar con 9.' };
  }
  if (typeof cliente.direccion !== 'string') {
    return { field: 'direccion', message: 'es obligatoria y debe ser una dirección válida.' };
  }
  cliente.direccion = cliente.direccion.trim();
  const validAddress = cliente.direccion.length >= 8
    && cliente.direccion.length <= 200
    && /\p{L}/u.test(cliente.direccion)
    && (/\p{N}/u.test(cliente.direccion) || /(?:^|\s)(?:s\/n|mz|lt)(?:\s|$)/i.test(cliente.direccion))
    && /^[\p{L}\p{M}\p{N} #.,/°-]+$/u.test(cliente.direccion)
    && !/(.)\1{6,}/iu.test(cliente.direccion)
    && !/\b(?:asdf|test|ninguna|no\s+tiene)\b/i.test(cliente.direccion);
  if (!validAddress) {
    return {
      field: 'direccion',
      message: 'debe tener entre 8 y 200 caracteres, incluir letras y números, y no contener símbolos o texto de prueba.',
    };
  }
  if (typeof cliente.correo !== 'string') {
    return { field: 'correo', message: 'es obligatorio y debe tener un formato válido.' };
  }
  cliente.correo = cliente.correo.trim();
  const [localPart] = cliente.correo.split('@');
  const validEmail = cliente.correo.length <= 254
    && localPart.length <= 64
    && !cliente.correo.includes(',')
    && !cliente.correo.includes('..')
    && /^[^\s@]{1,64}@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}$/.test(cliente.correo);
  if (!cliente.correo || !validEmail) {
    return {
      field: 'correo',
      message: 'debe ser un correo válido de hasta 254 caracteres, con usuario de hasta 64 caracteres.',
    };
  }
  if (typeof cliente.rol !== 'string' || !/^(destinatario|remitente)$/.test(cliente.rol)) {
    return { field: 'rol', message: 'debe ser destinatario o remitente.' };
  }
  return null;
}

function collectClienteInputErrors(cliente) {
  const errors = {};
  const addError = (field, message) => (errors[field] ??= []).push(message);
  const types = ['DNI', 'RUC', 'CE', 'PASAPORTE'];

  if (typeof cliente.tipo_documento !== 'string') {
    addError('tipo_documento', 'debe ser DNI, RUC, CE o pasaporte.');
    cliente.tipo_documento = '';
  } else {
    cliente.tipo_documento = cliente.tipo_documento.trim().toUpperCase();
    if (!types.includes(cliente.tipo_documento)) addError('tipo_documento', 'debe ser DNI, RUC, CE o pasaporte.');
  }
  if (typeof cliente.numero_documento === 'string'
      && ['CE', 'PASAPORTE'].includes(cliente.tipo_documento)) {
    cliente.numero_documento = cliente.numero_documento.toUpperCase();
  }
  if (!isValidDocument(cliente.tipo_documento, cliente.numero_documento)) {
    addError('numero_documento', 'no cumple el formato y las reglas del tipo_documento seleccionado.');
  }
  if (hasObviousDigitSequence(cliente.numero_documento)) {
    addError('numero_documento', 'no puede ser una secuencia numérica evidente ni un patrón repetitivo.');
  }

  if (typeof cliente.nombres !== 'string') {
    addError('nombres', 'es obligatorio.');
    cliente.nombres = '';
  }
  cliente.nombres = cliente.nombres.normalize('NFC').trim().replace(/\s+/gu, ' ');
  const nameWords = cliente.nombres.split(' ');
  if (cliente.nombres.length < 2 || cliente.nombres.length > 100 || nameWords.length < 2
      || nameWords.some((word) => word.replace(/[-']/g, '').length < 2)
      || !/^\p{Script=Latin}+(?:[ '-]\p{Script=Latin}+)*$/u.test(cliente.nombres)
      || /(\p{L})\1{3,}/iu.test(cliente.nombres)) {
    addError('nombres', 'debe incluir al menos dos palabras de 2 letras, tener hasta 100 caracteres y usar solo letras, espacios, guiones o apóstrofes sin repeticiones excesivas.');
  }

  if (cliente.telefono != null && (typeof cliente.telefono !== 'string' || !/^9\d{8}$/.test(cliente.telefono))) {
    addError('telefono', 'debe contener 9 dígitos y comenzar con 9.');
  }

  if (typeof cliente.direccion !== 'string') {
    addError('direccion', 'es obligatoria y debe ser válida.');
    cliente.direccion = '';
  }
  cliente.direccion = cliente.direccion.trim();
  const validAddress = cliente.direccion.length >= 8 && cliente.direccion.length <= 200
    && /\p{L}/u.test(cliente.direccion)
    && (/\p{N}/u.test(cliente.direccion) || /(?:^|\s)(?:s\/n|mz|lt)(?:\s|$)/i.test(cliente.direccion))
    && /^[\p{L}\p{M}\p{N} #.,/°-]+$/u.test(cliente.direccion)
    && !/(.)\1{6,}/iu.test(cliente.direccion)
    && !/\b(?:asdf|test|ninguna|no\s+tiene)\b/i.test(cliente.direccion);
  if (!validAddress) addError('direccion', 'debe tener entre 8 y 200 caracteres, incluir letras y números o referencias como S/N, Mz o Lt, y no contener símbolos o texto de prueba.');

  if (typeof cliente.correo !== 'string') {
    addError('correo', 'es obligatorio y debe tener un formato válido.');
    cliente.correo = '';
  }
  cliente.correo = cliente.correo.trim();
  const localPart = cliente.correo.split('@')[0];
  const validEmail = cliente.correo.length <= 254 && localPart.length <= 64
    && !cliente.correo.includes(',') && !cliente.correo.includes('..')
    && /^[^\s@]{1,64}@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}$/.test(cliente.correo);
  if (!cliente.correo || !validEmail) addError('correo', 'debe ser un correo válido de hasta 254 caracteres, con usuario de hasta 64 caracteres.');

  if (typeof cliente.rol !== 'string' || !/^(destinatario|remitente)$/.test(cliente.rol)) {
    addError('rol', 'debe ser destinatario o remitente.');
  }
  return errors;
}

function collectEnvioInputErrors(envio) {
  const errors = {};
  const addError = (field, message) => (errors[field] ??= []).push(message);
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  for (const field of ['id_remitente', 'id_destinatario']) {
    if (typeof envio[field] !== 'string' || !uuidPattern.test(envio[field])) {
      addError(field, 'debe ser un UUID válido.');
    }
  }
  if (typeof envio.peso_kg !== 'number' || !Number.isFinite(envio.peso_kg) || envio.peso_kg <= 0) {
    addError('peso_kg', 'debe ser un número mayor que 0.');
  }
  if (typeof envio.contenido !== 'string' || !envio.contenido.trim()) {
    addError('contenido', 'es obligatorio.');
  } else {
    envio.contenido = envio.contenido.trim();
  }
  const businessLines = ['Personal', 'Empresarial', 'Encomienda', 'Filatelia'];
  if (typeof envio.linea_negocio !== 'string' || !businessLines.includes(envio.linea_negocio)) {
    addError('linea_negocio', 'debe ser Personal, Empresarial, Encomienda o Filatelia.');
  }
  for (const field of ['origen', 'destino']) {
    if (typeof envio[field] !== 'string' || !envio[field].trim()) {
      addError(field, 'es obligatorio.');
    } else {
      envio[field] = envio[field].trim();
    }
  }
  return errors;
}

function createHandler(database, collectionName, isDuplicate) {
  return async (req, res, next) => {
    const records = database.data[collectionName];
    if (!isObject(req.body)) {
      res.status(400).json({ error: 'El cuerpo debe ser un objeto JSON.' });
      return;
    }

    if (collectionName === 'clientes') {
      const validationErrors = collectClienteInputErrors(req.body);
      if (Object.keys(validationErrors).length > 0) {
        res.status(400).json({ error: 'Datos inválidos.', campos: validationErrors });
        return;
      }
    } else if (collectionName === 'envios') {
      const validationErrors = collectEnvioInputErrors(req.body);
      if (Object.keys(validationErrors).length > 0) {
        res.status(400).json({ error: 'Datos inválidos.', campos: validationErrors });
        return;
      }
    }

    if (collectionName === 'envios') {
      const prohibited = findProhibitedContent(database, req.body.contenido);
      if (prohibited) {
        res.status(422).json({
          error: 'Contenido no permitido para el transporte postal.',
          categoria: prohibited.categoria,
          palabra_clave: prohibited.palabra_clave,
        });
        return;
      }
    }

    if (records.some((record) => isDuplicate(record, req.body))) {
      const message = collectionName === 'clientes'
        ? 'Ya existe un cliente con el mismo tipo y número de documento.'
        : 'Ya existe un envío con los mismos datos.';
      res.status(409).json({ error: message });
      return;
    }

    const record = collectionName === 'envios'
      ? {
          id_remitente: req.body.id_remitente,
          id_destinatario: req.body.id_destinatario,
          peso_kg: req.body.peso_kg,
          contenido: req.body.contenido,
          linea_negocio: req.body.linea_negocio,
          origen: req.body.origen,
          destino: req.body.destino,
          id: randomUUID(),
          estado: 'registrado',
        }
      : { ...req.body, id: randomUUID() };
    records.push(record);
    try {
      await database.write();
    } catch (error) {
      const index = records.indexOf(record);
      if (index !== -1) records.splice(index, 1);
      next(error);
      return;
    }
    if (collectionName === 'envios') {
      res.status(201).json({ id_envio: record.id, estado: 'registrado' });
      return;
    }
    res.status(201).json(record);
  };
}

function updateHandler(database, collectionName, isDuplicate, partial) {
  return async (req, res, next) => {
    const records = database.data[collectionName];
    if (!isObject(req.body)) {
      res.status(400).json({ error: 'El cuerpo debe ser un objeto JSON.' });
      return;
    }

    const index = records.findIndex((record) => record.id === req.params.id);
    if (index === -1) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }

    const previousRecord = records[index];
    const updatedRecord = {
      ...(partial ? previousRecord : {}),
      ...req.body,
      id: previousRecord.id,
    };
    if (collectionName === 'clientes') {
      const validationErrors = collectClienteInputErrors(updatedRecord);
      if (Object.keys(validationErrors).length > 0) {
        res.status(400).json({ error: 'Datos inválidos.', campos: validationErrors });
        return;
      }
    }
    if (records.some((record, recordIndex) =>
      recordIndex !== index && isDuplicate(record, updatedRecord),
    )) {
      const message = collectionName === 'clientes'
        ? 'Ya existe un cliente con el mismo tipo y número de documento.'
        : 'Ya existe un envío con los mismos datos.';
      res.status(409).json({ error: message });
      return;
    }

    records[index] = updatedRecord;
    try {
      await database.write();
    } catch (error) {
      records[index] = previousRecord;
      next(error);
      return;
    }
    res.json(updatedRecord);
  };
}

function getClienteHandler(database) {
  return (req, res) => {
    const id = req.params.id;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const isLegacyId = /^[A-Za-z0-9_-]{11}$/.test(id);
    if (!isUuid && !isLegacyId) {
      res.status(400).json({
        error: 'El ID del cliente tiene un formato inválido.',
        campos: { id: ['Debe ser un UUID o un ID antiguo de 11 caracteres.'] },
      });
      return;
    }

    const cliente = database.data.clientes.find((record) => record.id === id);
    if (!cliente) {
      res.status(404).json({ error: 'Cliente no encontrado.' });
      return;
    }
    res.status(200).json(cliente);
  };
}

function getEnvioHandler(database) {
  return (req, res) => {
    const id = req.params.id;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const isLegacyId = /^[A-Za-z0-9_-]{11}$/.test(id);
    if (!isUuid && !isLegacyId) {
      res.status(400).json({ error: 'El ID del envío tiene un formato inválido.', campos: { id: ['Debe ser un UUID válido.'] } });
      return;
    }
    const envio = database.data.envios.find((record) => record.id === id);
    if (!envio) {
      res.status(404).json({ error: 'Envío no encontrado.' });
      return;
    }
    const { id: envioId, ...details } = envio;
    res.status(200).json({ id_envio: envioId, ...details, estado: envio.estado ?? 'registrado' });
  };
}

export async function createApi(databasePath = defaultDatabasePath) {
  const resolvedDatabasePath = path.resolve(databasePath);
  const data = JSON.parse(await readFile(resolvedDatabasePath, 'utf8'));
  for (const collectionName of ['clientes', 'envios']) {
    if (!Array.isArray(data[collectionName])) {
      throw new Error(`La colección "${collectionName}" debe ser un arreglo en db.json.`);
    }
  }

  if (!Array.isArray(data.contenidos_prohibidos)) {
    data.contenidos_prohibidos = structuredClone(defaultProhibitedContents);
  }

  let writeQueue = Promise.resolve();
  const database = {
    data,
    write() {
      const write = writeQueue.then(() =>
        writeFile(resolvedDatabasePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8'),
      );
      writeQueue = write.catch(() => {});
      return write;
    },
  };

  const app = new App({
    onError(error, _request, response) {
      response.status(503).json({ error: 'Servicio no disponible por falla de persistencia JSON.' });
    },
  });
  app.get('/clientes/:id', getClienteHandler(database));
  app.get('/envios/:id', getEnvioHandler(database));
  app.post('/clientes', json(), createHandler(
    database,
    'clientes',
    duplicateCheck('clientes'),
  ));
  app.post('/envios', json(), createHandler(
    database,
    'envios',
    duplicateCheck('envios'),
  ));
  for (const collectionName of ['clientes', 'envios']) {
    const isDuplicate = duplicateCheck(collectionName);
    app.put(`/${collectionName}/:id`, json(), updateHandler(database, collectionName, isDuplicate, false));
    app.patch(`/${collectionName}/:id`, json(), updateHandler(database, collectionName, isDuplicate, true));
  }
  app.use(createJsonServerApp(database).attach);
  return app;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const app = await createApi();
  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? 'localhost';
  app.listen(port, () => {
    console.log(`API disponible en http://${host}:${port}`);
  }, host);
}
