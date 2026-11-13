package com.servicios.soa.clientes.api.dto;

import java.util.UUID;

public record ClienteResponse(UUID id_cliente, String estado) {
}
