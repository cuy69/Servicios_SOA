package com.servicios.soa.clientes.api.dto;

import java.time.Instant;
import java.util.Map;

public record ApiError(Instant timestamp, int status, String error, String mensaje,
                       Map<String, String> campos) {
}
