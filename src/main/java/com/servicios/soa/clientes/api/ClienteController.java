package com.servicios.soa.clientes.api;

import com.servicios.soa.clientes.api.dto.ClienteDetailsResponse;
import com.servicios.soa.clientes.api.dto.ClienteRequest;
import com.servicios.soa.clientes.api.dto.ClienteResponse;
import com.servicios.soa.clientes.service.ClienteService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/clientes")
public class ClienteController {
    private final ClienteService service;

    public ClienteController(ClienteService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ClienteResponse registrar(@Valid @RequestBody ClienteRequest request) {
        return service.registrar(request);
    }

    @GetMapping("/{id_cliente}")
    public ClienteDetailsResponse consultar(@PathVariable("id_cliente") UUID idCliente) {
        return ClienteDetailsResponse.from(service.consultar(idCliente));
    }

    @PutMapping("/{id_cliente}")
    public ClienteResponse actualizar(@PathVariable("id_cliente") UUID idCliente,
                                      @Valid @RequestBody ClienteRequest request) {
        return service.actualizar(idCliente, request);
    }
}
