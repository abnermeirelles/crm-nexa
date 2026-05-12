import { z } from 'zod';

// Espelha o DTO da API. Validacao server-side de UX (a API revalida).
const DOCUMENT_RE = /^\d{11}$|^\d{14}$/;
const STAGES = ['lead', 'prospect', 'customer', 'churned'] as const;

export const ContactFormSchema = z.object({
  name: z.string().min(1, 'Nome obrigatorio').max(255),
  email: z
    .string()
    .optional()
    .transform((v) => (v ? v.trim().toLowerCase() : undefined))
    .refine((v) => !v || /.+@.+\..+/.test(v), { message: 'E-mail invalido' }),
  phone: z
    .string()
    .max(32)
    .optional()
    .transform((v) => (v ? v.trim() : undefined)),
  document: z
    .string()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, '') : undefined))
    .refine((v) => !v || DOCUMENT_RE.test(v), {
      message: 'CPF (11 digitos) ou CNPJ (14 digitos)',
    }),
  companyName: z
    .string()
    .max(255)
    .optional()
    .transform((v) => (v ? v.trim() : undefined)),
  stage: z.enum(STAGES).optional(),
  source: z
    .string()
    .max(64)
    .optional()
    .transform((v) => (v ? v.trim() : undefined)),
  tags: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? Array.from(
            new Set(
              v
                .split(',')
                .map((t) => t.trim())
                .filter((t) => t.length > 0 && t.length <= 64),
            ),
          )
        : [],
    ),
});

export type ContactFormParsed = z.infer<typeof ContactFormSchema>;
