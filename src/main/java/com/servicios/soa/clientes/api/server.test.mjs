import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { createApi } from './server.mjs';

let directory;
let databasePath;
let server;
let baseUrl;

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'clientes-api-'));
  databasePath = path.join(directory, 'db.json');
  await writeFile(databasePath, JSON.stringify({
    clientes: [],
    envios: [],
  }));
  const app = await createApi(databasePath);
  server = app.listen(0, () => {}, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  await rm(directory, { recursive: true, force: true });
});

test('rechaza clientes duplicados por tipo y número de documento', async () => {
  const cliente = {
    tipo_documento: 'DNI',
    numero_documento: '46821357',
    nombres: 'Ana Perez',
    direccion: 'Calle Principal 123',
    telefono: '912345678',
    correo: 'ana@example.com',
    rol: 'remitente',
  };

  const responses = await Promise.all([
    fetch(`${baseUrl}/clientes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cliente),
    }),
    fetch(`${baseUrl}/clientes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...cliente, nombres: 'Ana Actualizada' }),
    }),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);

  const savedDatabase = JSON.parse(await readFile(databasePath, 'utf8'));
  assert.equal(savedDatabase.clientes.length, 1);
});

test('rechaza envíos con los mismos datos aunque el id enviado sea distinto', async () => {
  const envio = {
    id_remitente: '8d4f9a2c-0e3b-4f61-9c72-5a1b3d7e8f90',
    id_destinatario: 'a1957e60-826e-4f4c-9a52-53ec0f9a8b21',
    peso_kg: 2.5,
    contenido: 'Documentos',
    linea_negocio: 'Encomienda',
    origen: 'Chimbote',
    destino: 'Lima',
  };

  const firstResponse = await fetch(`${baseUrl}/envios`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(envio),
  });
  assert.equal(firstResponse.status, 201);

  const duplicateResponse = await fetch(`${baseUrl}/envios`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...envio, id: 'otro-id' }),
  });
  assert.equal(duplicateResponse.status, 409);

  const savedDatabase = JSON.parse(await readFile(databasePath, 'utf8'));
  assert.equal(savedDatabase.envios.length, 1);
});

test('rechaza actualizaciones que duplicarían el documento de otro cliente', async () => {
  const first = {
    tipo_documento: 'DNI', numero_documento: '46821357', nombres: 'Ana Perez',
    direccion: 'Calle Principal 123', telefono: '912345678', correo: 'ana@example.com', rol: 'remitente',
  };
  const second = {
    tipo_documento: 'DNI', numero_documento: '59731428', nombres: 'Luis Torres',
    direccion: 'Av. Central 123', telefono: '923456789', correo: 'luis@example.com', rol: 'destinatario',
  };
  const firstResponse = await fetch(`${baseUrl}/clientes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(first),
  });
  const firstRecord = await firstResponse.json();
  const secondResponse = await fetch(`${baseUrl}/clientes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(second),
  });
  const secondRecord = await secondResponse.json();

  const response = await fetch(`${baseUrl}/clientes/${secondRecord.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ numero_documento: firstRecord.numero_documento }),
  });
  assert.equal(response.status, 409);

  const savedDatabase = JSON.parse(await readFile(databasePath, 'utf8'));
  assert.equal(savedDatabase.clientes[1].numero_documento, second.numero_documento);
});

test('permite crear envíos con datos diferentes', async () => {
  const response = await fetch(`${baseUrl}/envios`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id_remitente: '8d4f9a2c-0e3b-4f61-9c72-5a1b3d7e8f90',
      id_destinatario: 'a1957e60-826e-4f4c-9a52-53ec0f9a8b21',
      peso_kg: 2.5,
      contenido: 'Documentos',
      linea_negocio: 'Encomienda',
      origen: 'Chimbote',
      destino: 'Lima',
    }),
  });
  assert.equal(response.status, 201);

  const listResponse = await fetch(`${baseUrl}/envios`);
  assert.equal(listResponse.status, 200);
  assert.equal((await listResponse.json()).length, 1);
});
