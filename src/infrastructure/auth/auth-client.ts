import { emailOTPClient, lastLoginMethodClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

// Cliente del navegador: llama a /app/api/auth en el mismo origen. Las pantallas
// envían el token de Turnstile en la cabecera `x-captcha-response`.
export const authClient = createAuthClient({
  basePath: '/app/api/auth',
  plugins: [emailOTPClient(), lastLoginMethodClient({ cookieName: 'quina-last-login' })],
});
