package com.servicios.soa.clientes.service;

public class ClienteDuplicadoException extends RuntimeException {
    public ClienteDuplicadoException() {
        super("Ya existe un cliente con ese tipo y número de documento");
    }
}
