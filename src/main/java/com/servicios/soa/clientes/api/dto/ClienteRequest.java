package com.servicios.soa.clientes.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ClienteRequest(
        @NotBlank @Pattern(regexp = "(?i)DNI|RUC|CE|pasaporte", message = "debe ser DNI, RUC, CE o pasaporte")
        @Size(max = 20) String tipo_documento,
        @NotBlank @Size(max = 50) String numero_documento,
        @NotBlank @Size(max = 150) String nombres,
        @NotBlank @Size(max = 250) String direccion,
        @Size(max = 30) String telefono,
        @Email @Size(max = 254) String correo,
        @NotBlank @Pattern(regexp = "(?i)remitente|destinatario",
                message = "debe ser remitente o destinatario")
        @Size(max = 20) String rol
) {
}
