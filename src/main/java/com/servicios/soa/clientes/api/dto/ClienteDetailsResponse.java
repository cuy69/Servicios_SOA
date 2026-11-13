package com.servicios.soa.clientes.api.dto;

import com.servicios.soa.clientes.model.Cliente;

import java.util.UUID;

public record ClienteDetailsResponse(
        UUID id_cliente,
        String tipo_documento,
        String numero_documento,
        String nombres,
        String direccion,
        String telefono,
        String correo,
        String rol
) {
    public static ClienteDetailsResponse from(Cliente cliente) {
        return new ClienteDetailsResponse(
                cliente.getIdCliente(),
                cliente.getTipoDocumento(),
                cliente.getNumeroDocumento(),
                cliente.getNombres(),
                cliente.getDireccion(),
                cliente.getTelefono(),
                cliente.getCorreo(),
                cliente.getRol()
        );
    }
}
