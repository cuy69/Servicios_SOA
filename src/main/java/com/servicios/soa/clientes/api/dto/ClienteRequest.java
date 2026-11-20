package com.servicios.soa.clientes.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.text.Normalizer;
import java.util.Locale;

public record ClienteRequest(
        @NotBlank @Pattern(regexp = "(?i)DNI|RUC|CE|pasaporte", message = "debe ser DNI, RUC, CE o pasaporte")
        @Size(max = 20) String tipo_documento,
        @NotBlank @Size(min = 7, max = 12) String numero_documento,
        @NotBlank @Size(min = 2, max = 100, message = "debe tener entre 2 y 100 caracteres")
        @Pattern(regexp = "^(?=.* )(?!.*(?:^| )[A-Za-zÁÉÍÓÚÜÑáéíóúüñ](?: |$))(?!.*(?iu:([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])\\1{3,}))[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:[-'][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*(?: [A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:[-'][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*)+$",
                message = "debe incluir al menos dos palabras de 2 letras, con solo letras, guiones o apóstrofes, sin repeticiones excesivas")
        String nombres,
        @NotBlank @Size(min = 8, max = 200, message = "debe tener entre 8 y 200 caracteres")
        @Pattern(regexp = "^(?=.*\\p{L})(?=.*(?:\\p{N}|(?iu:(?:^|\\s)(?:s/n|mz|lt)(?:\\s|$))))(?!.*(?iu:(\\p{L})\\1{6,}))(?!.*(?iu:(?<!\\p{L})(?:asdf|test|ninguna|no\\s+tiene)(?!\\p{L})))[\\p{L}\\p{M}\\p{N} #.,/°-]+$",
                message = "debe incluir letras y números o referencias como S/N, Mz o Lt, usar signos permitidos y no contener texto de prueba")
        String direccion,
        @Pattern(regexp = "9\\d{8}", message = "debe contener 9 dígitos y comenzar con 9")
        String telefono,
        @NotBlank @Email
        @Pattern(regexp = "^(?!.*\\.\\.)(?!.*,)[^\\s@]{1,64}@[\\w-]+(?:\\.[\\w-]+)*\\.[A-Za-z]{2,}$",
                message = "debe tener un formato válido, sin espacios, comas ni puntos dobles")
        @Size(max = 254, message = "no puede superar 254 caracteres") String correo,
        @NotBlank @Pattern(regexp = "remitente|destinatario",
                message = "debe ser remitente o destinatario")
        @Size(max = 20) String rol
) {
    public ClienteRequest {
        if (tipo_documento != null) {
            tipo_documento = tipo_documento.trim().toUpperCase(Locale.ROOT);
        }
        if (numero_documento != null && ("CE".equals(tipo_documento) || "PASAPORTE".equals(tipo_documento))) {
            numero_documento = numero_documento.toUpperCase(Locale.ROOT);
        }
        if (nombres != null) {
            nombres = Normalizer.normalize(nombres.strip().replaceAll("(?U)\\s+", " "), Normalizer.Form.NFC);
        }
        if (correo != null) {
            correo = correo.trim();
        }
        if (direccion != null) {
            direccion = direccion.trim();
        }
    }

    @AssertTrue(message = "numero_documento no cumple las reglas del tipo_documento seleccionado")
    public boolean isDocumentoValido() {
        if (tipo_documento == null || numero_documento == null) {
            return false;
        }
        boolean validFormat = switch (tipo_documento) {
            case "DNI" -> numero_documento.matches("\\d{8}")
                    && !numero_documento.startsWith("00")
                    && !numero_documento.matches("(\\d)\\1{7}");
            case "RUC" -> isValidRuc(numero_documento);
            case "CE" -> numero_documento.matches("[A-Z0-9]{9,12}");
            case "PASAPORTE" -> numero_documento.matches("[A-Z0-9]{7,12}");
            default -> false;
        };
        return validFormat && !hasObviousDigitSequence(numero_documento);
    }

    private static boolean hasObviousDigitSequence(String value) {
        if (!value.matches("\\d{8,}")) {
            return false;
        }
        boolean ascending = true;
        boolean descending = true;
        for (int index = 1; index < value.length(); index++) {
            int previous = Character.digit(value.charAt(index - 1), 10);
            int current = Character.digit(value.charAt(index), 10);
            ascending &= (current - previous + 10) % 10 == 1;
            descending &= (previous - current + 10) % 10 == 1;
        }
        boolean repeatedPattern = false;
        for (int period = 1; period <= 2; period++) {
            if (value.length() > period) {
                boolean matches = true;
                for (int index = period; index < value.length(); index++) {
                    if (value.charAt(index) != value.charAt(index % period)) {
                        matches = false;
                        break;
                    }
                }
                repeatedPattern |= matches;
            }
        }
        return ascending || descending || repeatedPattern;
    }

    private static boolean isValidRuc(String ruc) {
        if (!ruc.matches("\\d{11}") || !ruc.matches("(10|15|17|20)\\d{9}")) {
            return false;
        }
        int[] weights = {5, 4, 3, 2, 7, 6, 5, 4, 3, 2};
        int sum = 0;
        for (int index = 0; index < weights.length; index++) {
            sum += Character.digit(ruc.charAt(index), 10) * weights[index];
        }
        int checkDigit = (11 - (sum % 11)) % 10;
        return Character.digit(ruc.charAt(10), 10) == checkDigit;
    }
}
