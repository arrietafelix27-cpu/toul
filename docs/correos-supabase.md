# Correos de TOUL en Supabase

Los correos que manda TOUL (activar la cuenta y recuperar la contraseña) se escriben en Supabase.
Aquí está el texto listo para copiar y pegar.

Dónde: Supabase → **Authentication → Emails → Templates**.

---

## 1. Confirm signup (activar la cuenta)

**Subject:**

```
Tu código para activar TOUL: {{ .Token }}
```

**Body** (borra lo que haya y pega todo esto):

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border-radius:16px;border:1px solid #e6e6e3;">
      <tr><td style="padding:32px 32px 8px;">
        <p style="margin:0 0 28px;font-size:16px;font-weight:700;letter-spacing:-0.02em;color:#111111;">TOUL</p>
        <p style="margin:0 0 8px;font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#111111;">Activa tu cuenta</p>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#555555;">Escribe este código en TOUL para terminar de crear tu cuenta:</p>
        <p style="margin:0 0 24px;padding:18px 0;border-radius:12px;background:#f4f4f2;text-align:center;font-size:32px;font-weight:700;letter-spacing:0.3em;color:#111111;font-family:'SF Mono',Menlo,Consolas,monospace;">{{ .Token }}</p>
        <p style="margin:0 0 28px;font-size:13px;line-height:1.6;color:#777777;">Vence en 1 hora. Si no fuiste tú, ignora este correo: nadie puede entrar sin el código.</p>
      </td></tr>
      <tr><td style="padding:18px 32px 24px;border-top:1px solid #eeeeec;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:#999999;">TOUL · Tu negocio, bajo control · <a href="mailto:hola@toul.app" style="color:#999999;">hola@toul.app</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
```

---

## 2. Reset Password (recuperar la contraseña)

**Subject:**

```
Tu código para cambiar la contraseña: {{ .Token }}
```

**Body:**

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border-radius:16px;border:1px solid #e6e6e3;">
      <tr><td style="padding:32px 32px 8px;">
        <p style="margin:0 0 28px;font-size:16px;font-weight:700;letter-spacing:-0.02em;color:#111111;">TOUL</p>
        <p style="margin:0 0 8px;font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#111111;">Cambia tu contraseña</p>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#555555;">Escribe este código en TOUL para poner una contraseña nueva:</p>
        <p style="margin:0 0 24px;padding:18px 0;border-radius:12px;background:#f4f4f2;text-align:center;font-size:32px;font-weight:700;letter-spacing:0.3em;color:#111111;font-family:'SF Mono',Menlo,Consolas,monospace;">{{ .Token }}</p>
        <p style="margin:0 0 28px;font-size:13px;line-height:1.6;color:#777777;">Vence en 1 hora. Si no lo pediste tú, ignora este correo: tu contraseña sigue igual.</p>
      </td></tr>
      <tr><td style="padding:18px 32px 24px;border-top:1px solid #eeeeec;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:#999999;">TOUL · Tu negocio, bajo control · <a href="mailto:hola@toul.app" style="color:#999999;">hola@toul.app</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
```

---

## 3. Ajustes del correo

Supabase → **Authentication → Sign In / Providers → Email**:

| Ajuste | Valor |
|---|---|
| Confirm email | Encendido |
| Minimum password length | `8` |
| Email OTP Expiration | `3600` (1 hora) |
| Email OTP Length | `6` |

Guarda.

Las demás plantillas (Magic Link, Change Email, Invite, Reauthentication) TOUL no las usa: no hay que tocarlas.
