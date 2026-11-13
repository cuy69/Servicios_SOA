package com.servicios.soa.clientes.service;

public class ClienteNotFoundException extends RuntimeException {
    public ClienteNotFoundException() {
        super("No se encontró el cliente solicitado");
    }
}
