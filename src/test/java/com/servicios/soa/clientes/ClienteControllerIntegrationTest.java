package com.servicios.soa.clientes;

import com.servicios.soa.clientes.repository.ClienteRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

@SpringBootTest(properties = "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://issuer.example")
@AutoConfigureMockMvc
class ClienteControllerIntegrationTest {
    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ClienteRepository repository;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @BeforeEach
    void limpiarClientes() {
        repository.deleteAll();
    }

    @Test
    void registraConsultaYActualizaCliente() throws Exception {
        String cliente = """
                {
                  "tipo_documento": "DNI",
                  "numero_documento": "12345678",
                  "nombres": "Ana Pérez",
                  "direccion": "Calle Principal 123",
                  "telefono": "555123456",
                  "correo": "ana@example.com",
                  "rol": "remitente"
                }
                """;

        String response = mockMvc.perform(post("/clientes")
                        .with(jwt())
                        .contentType(APPLICATION_JSON)
                        .content(cliente))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.estado").value("registrado"))
                .andReturn().getResponse().getContentAsString();
        String id = com.jayway.jsonpath.JsonPath.read(response, "$.id_cliente");

        mockMvc.perform(get("/clientes/{id_cliente}", id).with(jwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.numero_documento").value("12345678"))
                .andExpect(jsonPath("$.rol").value("remitente"));

        String actualizacion = """
                {
                  "tipo_documento": "DNI",
                  "numero_documento": "12345678",
                  "nombres": "Ana Pérez Actualizada",
                  "direccion": "Avenida Central 10",
                  "telefono": null,
                  "correo": null,
                  "rol": "destinatario"
                }
                """;
        mockMvc.perform(put("/clientes/{id_cliente}", id)
                        .with(jwt())
                        .contentType(APPLICATION_JSON)
                        .content(actualizacion))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id_cliente").value(id))
                .andExpect(jsonPath("$.estado").value("actualizado"));
    }

    @Test
    void rechazaDocumentoDuplicado() throws Exception {
        String cliente = """
                {
                  "tipo_documento": "DNI",
                  "numero_documento": "87654321",
                  "nombres": "Luis Torres",
                  "direccion": "Calle 1",
                  "rol": "destinatario"
                }
                """;

        mockMvc.perform(post("/clientes").with(jwt()).contentType(APPLICATION_JSON).content(cliente))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/clientes").with(jwt()).contentType(APPLICATION_JSON).content(cliente))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409));
    }

    @Test
    void requiereAutenticacionBearer() throws Exception {
        mockMvc.perform(get("/clientes/00000000-0000-0000-0000-000000000001"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void validaCamposObligatorios() throws Exception {
        mockMvc.perform(post("/clientes").with(jwt())
                        .contentType(APPLICATION_JSON)
                        .content("{\"tipo_documento\":\"DNI\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos.nombres").exists());
    }
}
