/**
 * Acceso al sistema (HU-11 … HU-15).
 *
 * El formulario es estático a propósito: el endpoint de sesión, el hash de
 * contraseña y el token de recuperación se implementan en el sprint 1. Dejar
 * ya la ruta y la estructura evita que la primera historia de usuario traiga
 * consigo cambios en el enrutador.
 */
export function LoginPage() {
  return (
    <div className="login">
      <form className="login__card" onSubmit={(event) => event.preventDefault()} noValidate>
        <h1>Iniciar sesión</h1>
        <p className="muted">Abastecedor Nuevo Amanecer · sistema de gestión</p>

        <label className="field">
          <span>Correo electrónico</span>
          <input
            type="email"
            name="email"
            placeholder="dueño@minisuper.cr"
            autoComplete="username"
            disabled
          />
        </label>

        <label className="field">
          <span>Contraseña</span>
          <input type="password" name="password" autoComplete="current-password" disabled />
        </label>

        <button type="submit" className="button button--block" disabled>
          Ingresar
        </button>

        <p className="muted hint">
          Pendiente: HU-11 (iniciar sesión con correo y contraseña), HU-12 (configurar la cuenta
          única del dueño, con la contraseña guardada de forma segura), HU-13 (recuperar
          contraseña), HU-14 (editar perfil: nombre, correo y contraseña) y HU-15 (cerrar sesión).
        </p>
      </form>
    </div>
  );
}
