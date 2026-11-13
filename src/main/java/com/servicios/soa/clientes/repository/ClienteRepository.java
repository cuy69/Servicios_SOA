package com.servicios.soa.clientes.repository;

import com.servicios.soa.clientes.model.Cliente;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface ClienteRepository extends JpaRepository<Cliente, UUID> {
    boolean existsByTipoDocumentoAndNumeroDocumento(String tipoDocumento, String numeroDocumento);

    boolean existsByTipoDocumentoAndNumeroDocumentoAndIdClienteNot(
            String tipoDocumento, String numeroDocumento, UUID idCliente);
}
